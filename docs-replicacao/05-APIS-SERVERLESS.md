# 05 — Rotas serverless (`api/*.js`)

Todas seguem **o mesmo esqueleto**. Copie este padrão antes de escrever qualquer rota nova:

```js
module.exports = async function handler(req, res) {
  // 1. CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ erro: 'Método não permitido' });

  // 2. FAIL-CLOSED — sem env var, a rota se recusa a operar (não pula a checagem)
  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa. Operação bloqueada por segurança.' });
  }

  // 3. Sessão Supabase válida
  const sessionToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login de novo.' });
  const check = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
  });
  if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  const emailLogado = String((await check.json()).email || '').toLowerCase();
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado.' });

  // 4. Papel — a autorização vem de data/usuarios.json, nunca do JWT
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  // 5. Regra de negócio + escrita
};
```

Notas de plataforma:
- `data/usuarios.json` entra por `require('../data/usuarios.json')` com **caminho estático** —
  é o que faz a Vercel empacotar o JSON junto com a função serverless. `require` dinâmico
  não é empacotado.
- Requires relativos (`../lib/osm.js`, `../scripts/montar-dados.js`) também são empacotados.
- Teto de execução da Vercel: **60s**. Toda chamada externa precisa de timeout menor.

---

## `GET /api/dados` — a rota que hidrata o cockpit

**Entrada**: `Authorization: Bearer <token Supabase>`
**Saída**:
```json
{ "sessao": { "email", "role", "ownerId", "nome" },
  "dados":  { ...DATA já filtrado por papel... } }
```
Headers: `Cache-Control: private, no-store` — dado sensível por sessão, nunca em cache de CDN.

Chama `montarDadosCompletos()` + `filtrarParaPapel()` de `scripts/montar-dados.js`. Erros:
`401` sem sessão / sessão inválida · `403` e-mail não cadastrado · `500` sem env var ou falha
na montagem.

---

## `POST /api/atualizar-mrr`

**Body**: `{ dealId, mrr }`

1. Busca o deal (`properties=dealname,pipeline,dealstage,hubspot_owner_id`).
2. **Valida que o deal pertence ao pipeline de field sales** e que quem chamou pode editá-lo
   (executivo só edita o próprio; gestor edita qualquer um).
3. `PATCH /crm/v3/objects/deals/{id}` com `{ valor_de_mrr: String(Math.round(mrr)) }`.

**Saída**: `{ ok: true, id, mrr }`. Usado pela edição inline de MRP na tabela "Vendas do mês".

---

## `POST /api/criar-negocio`

**Body**: `{ nome, ownerId, telefone, endereco, bairro, cidade, tipo, nota, avaliacoes }`

Cria um **deal** no `STAGE_BACKLOG` do pipeline de field sales, com os dados do lead
concatenados em `description`.

**Saída**: `{ ok: true, id, url }` (link direto para o registro no HubSpot).

---

## `POST /api/criar-empresa-prospeccao`

**Body**: `{ leadId }` (id em `leads_prospeccao`)

1. Lê o lead no Supabase (via REST + service key).
2. `409` se `status === 'criado_hubspot'` (já foi criado) — devolve o `hubspotCompanyId`.
3. `403` se o lead não está atribuído a quem chamou (executivo).
4. **Busca duplicata por nome no HubSpot** → `409` com o id da empresa existente
   ("Confira antes de criar de novo").
5. Cria a **Company**.
6. `PATCH` no Supabase: `status='criado_hubspot'`, `hubspot_company_id`, `updated_at`.

**Saída**: `{ ok: true, hubspotCompanyId, url }`.

Env: `HUBSPOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`.

---

## `POST /api/importar-leads`

Recebe um lote de leads já raspados e grava em `leads_prospeccao`. **Nunca cria Company/Deal
aqui** — isso só acontece na confirmação manual.

**Dois modos de autenticação** (os dois seguros; nenhum token de fonte externa aparece no navegador):
1. Sessão de **gestor** logado (`Authorization: Bearer <token>`).
2. **Server-to-server**: header `x-import-secret === process.env.IMPORT_SECRET` — para um
   webhook/automação (ex.: Make.com) empurrar dados direto.

**Body**: `{ fonte, leads: [...] }` ou um array direto.
Fontes aceitas: `outscraper`, `google_places`, `tripadvisor`, `ifood`, `manual`, `casa_dos_dados`.

### Normalização e régua

- `normalizarTelefone()` — só dígitos; remove DDI `55` (12–13 dígitos). A mesma linha vem
  como `+55 27...` no TripAdvisor e `27...` no iFood; sem isso, duas contas.
- `normalizarTexto()` — minúsculas, sem acento, sem pontuação (dedupe por nome).
- **Corte de qualidade**: `avaliacoes >= qualidade.avaliacoesMin`. A **nota não influencia**.
- `FONTES_SEM_AVALIACAO = {casa_dos_dados}` — isenta do corte: empresa aberta há 10 dias não
  tem 100 avaliações; é lead **novo**, não lead ruim. Sem essa exceção, 100% da Casa dos
  Dados era reprovada e nada dela chegava à fila.
- `CATEGORIAS_FORA_FOODSERVICE` — monumento, hostel, shopping etc. saem mesmo com muitas
  avaliações. Fontes verticais (iFood/TripAdvisor) podem vir sem categoria e continuam válidas.
- `rotearTerritorio(cidade, bairro)` — define `responsavel_owner_id`; sem dono, `status='pendente'`.

### Dedupe

Pagina **toda** a base existente (`limit=1000` + `offset`) antes de comparar. Não pode usar só
a primeira página — uma conta antiga fora dela viraria "nova". **Falha fechada**: se não deu
para conferir a base, não importa nada (`502`).

**Saída**: contagens de inseridos, duplicados, `reprovados_qualidade`, `reprovados_fit`.

---

## `POST /api/confirmar-sugestao-gestor`

**Body**: `{ taskId, acao }` (`acao` = confirmar ou recusar)

Quando o gestor sugere um compromisso na agenda do executivo, a tarefa nasce no HubSpot com um
**marcador no corpo** (`hs_task_body`). Esta rota:
1. Lê a tarefa; valida que o dono é quem está confirmando;
2. Se o marcador já sumiu → `{ ok: true, jaResolvida: true }` (idempotente);
3. Recusar → remove a sugestão → `{ ok: true, recusada: true }`;
4. Confirmar → `PATCH hs_task_body` sem o marcador → `{ ok: true, confirmada: true }`.

---

## `POST /api/criar-tarefa-rota` **[ROTA — não replicar]**

**Body**: `{ nome, ownerId, bairro, cidade, horaPrevista, data, tipo, sugeridoPorGestor }`

Cria uma **task** no HubSpot no mesmo formato que o app de campo usa (`"Visita - <nome>"`),
reaproveitando 100% do reconhecimento que já existe (`fetch-hubspot.js`, `agendaTipoDoTexto`,
`visitasTarefasHojeByOwner`) — nenhuma lógica nova de leitura foi criada, só a escrita.
Detecta tarefa já existente para o mesmo lead/dia e **reagenda** em vez de duplicar.

> Se você mantiver o **agendamento manual pela Agenda** (sem mapa), vale a pena portar esta
> rota — ela é o que faz a visita aparecer sozinha na agenda. Veja `08-ESCOPO-SEM-ROTA.md`.

---

## `POST /api/restaurantes-proximos` **[ROTA — não replicar]**

Consulta o OpenStreetMap (Overpass) via `lib/osm.js` e cacheia em `restaurantes_osm`.

Existe porque, **medido e não suposto**: `fetch` do navegador para `overpass-api.de` dá
"Failed to fetch" (CORS); navegação direta dá `406`; o espelho `kumi.systems` travou o
renderer do Chrome. Do servidor não há CORS e dá para mandar `User-Agent`/`Accept` adequados.

Cache em 2 camadas: chave exata, e bounding box (`lat/lng` na faixa **e** `raio_m >= raio pedido`).
Validade 30 dias.

**Limite honesto que a tela precisa declarar**: OSM **não tem nota nem número de avaliações**.
Tem nome, categoria, telefone (quando alguém preencheu), rua, número e CEP. Serve para "portas
para bater perto de mim", não para "as melhores da praça".

---

## `POST /api/novidades-mercado` **[ROTA/opcional]**

Empresas de foodservice **abertas recentemente** na praça, via API da Casa dos Dados, filtradas
por CNAE (`5611201`, `5611202`, `5611203`, `5611204`, `5620104`, `4721102`…) e por
`redes-excluidas.json`. Cacheia em `novidades_mercado`. Também resolve contato por CNPJ.

Régua deliberada: aqui **não** se busca "mais bem avaliado" — avaliação alta significa
estabelecimento maduro, que quase sempre já tem fornecedor e contrato. O valor desta fonte é o
oposto: quem acabou de abrir ainda não escolheu sistema.

> Este módulo é **independente do mapa** — se você quiser sourcing de leads novos sem rota,
> dá para portar mostrando os resultados como **lista**, não como pins.
