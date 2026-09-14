# 04 — Endpoints (Vercel serverless)

12 arquivos em `api/`. **O plano Hobby da Vercel dá 12 funções** — essa restrição é o que
explica a porta única e os `?recurso=`. No projeto destino, se o teto não existir, a
consolidação continua valendo como desenho (um lugar de autenticação, um lugar de log).

## O padrão de toda rota de escrita

```js
1. CORS + OPTIONS → 204
2. método errado → 405
3. env vars ausentes → 500 "Operação bloqueada por segurança"   // FAIL-CLOSED
4. Authorization: Bearer <token Supabase>
   → GET {SUPABASE_URL}/auth/v1/user   → 401 se inválido
5. e-mail do JWT ∈ usuarios.json?      → 403 se não
6. papel autoriza esta ação?           → 403 se não
7. executa; erro do HubSpot → 502 com a mensagem, nunca sucesso silencioso
```

**O `HUBSPOT_TOKEN` nunca sai do servidor.** O navegador manda só os dados do lead e o
token de sessão do Supabase.

---

## `GET /api/dados` — a rota que alimenta a tela inteira

| query | devolve |
|---|---|
| *(nenhuma)* | `{ sessao, procedencia, dados }` — o DATA filtrado por papel |
| `?recurso=playbook` | o playbook compilado. **O capítulo "Liderança" é cortado no servidor para `rep`** |
| `?recurso=precificacao` | a tabela de preços |
| `?recurso=realizado-hoje[&owner=<id>]` | o cumprido AO VIVO, direto do HubSpot. Gestor pode passar `owner`; executivo só o próprio (403 caso contrário) |

Três respostas de erro que **não** podem virar zero:
- **503** — falta snapshot: `"Falta o snapshot do CRM e o quadro de executivos agora (motivo). A próxima carga do robô resolve; nada foi perdido."`
- **503** — sem `HUBSPOT_TOKEN` no `realizado-hoje`: "não é possível medir o cumprido agora"
- **502** — HubSpot falhou ao medir: a tela mantém o último número e mostra "sem medir agora"

`Cache-Control: private, no-store` — dado por sessão nunca pode cair em CDN.

---

## `POST /api/negocio-acao` — porta única das ações sobre negócio

```js
Authorization: Bearer <token Supabase>
body: { op: '<ação>', ...corpo da ação }
```

| `op` | módulo | o que faz |
|---|---|---|
| `mudar-etapa` | `lib/acoes-negocio/mudar-etapa-negocio.js` | move o negócio no pipeline, exigindo as propriedades obrigatórias da etapa de destino |
| `nota` | `lib/acoes-negocio/criar-nota-negocio.js` | grava nota, próximo passo (tarefa datada) e qualificação |
| `tarefa-rota` | `lib/acoes-negocio/criar-tarefa-rota.js` | cria a tarefa de visita da rota |
| `mrr` | `lib/acoes-negocio/atualizar-mrr.js` | corrige o MRR (decisão de gestor, com trilha) |
| `sugestao-gestor` | `lib/acoes-negocio/confirmar-sugestao-gestor.js` | confirma sugestão de plano |
| `ler-etapa` | `lib/acoes-negocio/ler-etapa-negocio.js` | **só lê** — existe para a tela não mentir quando a escrita é abortada por tempo |

`op` desconhecido devolve **400 com a lista das aceitas** — quem integra descobre o
contrato pela própria resposta, sem abrir o repositório.

O roteador **não interpreta nem reescreve resposta**: cada módulo responde por si,
inclusive pela validação de sessão e pelo status de erro. Se o roteador traduzisse erros,
a mensagem que o executivo vê na rua dependeria de duas camadas em vez de uma.

> `POST /api/criar-nota-negocio` **continua existindo como apelido** da mesma
> implementação (mesmo corpo, mesmos códigos de erro). Está documentado para o time do
> PWA — apagar a URL quebraria integração de terceiro.

---

## Demais rotas

### `POST /api/criar-negocio`
```js
{ nome, ownerId, telefone, endereco, bairro, cidade, tipo, nota,
  avaliacoes, etapa, propriedades, leadId }
```
- Um negócio novo **só pode nascer em Backlog ou Prospecção** → 400 caso contrário.
- Prospecção **exige** a propriedade "Origem do Lead" → 400.
- **Executivo só cria negócio atribuído a si mesmo** → 403.

### `POST /api/desfazer-negocio`
```js
{ dealId, leadId }   // os DOIS — é o par que prova que o negócio nasceu aqui
```
Trava deliberada: só apaga negócio **criado pelo Planejamento, sem atividade**. 409 se o
negócio já tem vida própria; 403 se é da carteira de outro; `{ ok:true, jaNaoExistia:true }`
se já não estava lá (idempotente).

### `POST /api/criar-empresa-prospeccao`
```js
{ leadId, acao, novoOwnerId? }
```
Cria **Company** no HubSpot a partir de uma linha de `leads_prospeccao` — **nunca um
Deal**. Regra comercial: prospecção fria cria Company primeiro; o Deal nasce depois,
quando o executivo qualifica interesse de verdade.

### `POST /api/importar-leads`
```js
{ fonte: 'outscraper'|'google_places'|'tripadvisor'|'ifood'|'manual'|'casa_dos_dados',
  leads: [ ... ],            // 1 a 500 por lote
  qualidade?: { avaliacoesMin, notaMin } }
```
Dois caminhos de autenticação: sessão de gestor **ou** header `x-import-secret ==
IMPORT_SECRET` (server-to-server). Executivo só pode materializar sugestão da Casa dos
Dados **no próprio território** → 403.

### `POST /api/buscar-leads`
```js
{ municipio, quantidade? }
```
Só gestor. É a ponte entre o coletor semanal e a importação — **não reimplementa nada**:
usa a mesma busca de `backfill-casa-dos-dados.js` e o mesmo endpoint de importação.

### `POST /api/restaurantes-proximos`
```js
{ lat, lng, raio? }
```
Consulta Overpass (OpenStreetMap) **no servidor** — do navegador dá CORS bloqueado e 406.
Cache em `restaurantes_osm`. Recusa coordenada fora do Brasil.

### `POST /api/novidades-mercado`
```js
{ cidade, uf } | { cnpj, semCache? }
```
Empresas de foodservice **abertas recentemente** (Casa dos Dados) + enriquecimento de
contato por CNPJ. Régua deliberada: **não** busca "mais bem avaliado" — avaliação alta
significa estabelecimento maduro, que já tem fornecedor. O valor é o oposto.

### `POST /api/fila-pwa`
```js
{ ownerId, dia: 'AAAA-MM-DD', pendentes, falhas, ultimaTentativa, versaoApp, detalhe }
```
O app de campo declara o que está na fila local e não subiu. Com ela a Daily tem **três**
estados em vez de dois: SUBIU · PENDENTE · FALHOU.

> **`pendentes` é obrigatório e tem de ser número.** Se o app não sabe quantos estão na
> fila, **não manda a linha** — ausência é uma informação, zero é outra.

### `POST /api/hubspot-webhook`
Valida `X-HubSpot-Signature-v3` com `HUBSPOT_APP_SECRET` (401 se não confere ou se
expirou), pega um lock em `webhook_cooldown` (mínimo de N minutos entre disparos) e
dispara `workflow_dispatch` do robô no GitHub. **Zero lógica de negócio** — só aciona o
mesmo robô que já roda por cron, para não existirem duas implementações do "como calcular
o funil". Sempre responde 200, com `{ disparado: true|false, motivo }`.

---

## Transição de ações para o app de campo (opcional)

Com `PWA_DEEP_LINK` definida, o front intercepta **na fase de captura** todo `tel:`,
`wa.me` e navegação de Maps e abre o app com o contexto na querystring:

```
GET <PWA_DEEP_LINK>?acao=ligar|whatsapp|navegar|navegar-rota
  &telefone=5551999887766&dealId=…&cliente=…&lat=&lng=
  &paradas=lat,lng|lat,lng&ids=…&ownerId=…&origem=cockpit
```

Sem a variável, nada muda. Garantias testadas: só `http(s)` absoluto vira destino
(`javascript:` e link relativo são recusados) e o telefone vai sempre só com dígitos.
Interceptação na **captura** e não na bolha porque várias âncoras vivem dentro de cartões
clicáveis que dão `stopPropagation`.
