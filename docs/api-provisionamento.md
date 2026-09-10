# API de provisionamento — app de campo (Outbound)

Três rotas: **criar**, **consultar** e **revogar** acesso. Escrito para quem vai
integrar de fora (Takeat OS / `colaborador_contas`).

Base: `https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1`

---

## 1. URL e autenticação

Header, em qualquer uma das rotas:

```
Authorization: Bearer <token>
Content-Type: application/json
```

O `<token>` é **um destes dois**:

| token | quem usa | como obter |
|---|---|---|
| **service role key** | integração, script, backend | Supabase → Settings → API → `service_role` |
| **JWT de um usuário `gestor`** | uma tela chamando em nome de alguém logado | `supabase.auth.getSession()` |

A service role key é a que interessa para integração servidor-a-servidor. Ela
**não pode** ir para navegador: quem a tem lê e escreve qualquer tabela
ignorando RLS.

### Os dois formatos de chave — os dois funcionam

O Supabase tem duas gerações de chave, e o painel mostra a nova por padrão:

| formato | exemplo | onde aparece |
|---|---|---|
| legada | `eyJhbGciOi…` (um JWT) | Settings → API → **Legacy API keys** |
| nova | `sb_secret_…` | Settings → API |

As duas dão o mesmo poder, e **as três rotas aceitam as duas**. Isso não era
verdade até 03/09/2026: a checagem comparava a chave recebida com a legada que a
plataforma injeta, então quem copiava a nova do painel levava `401` com a chave
certa na mão.

A verificação hoje é de **capacidade**, não de igualdade de string: a função usa
a credencial numa rota que só service role abre e deixa o servidor de auth
validar a assinatura. Decodificar o JWT e confiar no claim `role` seria mais
barato e seria um buraco — sem checar assinatura, qualquer um forja o claim.

### Respostas de autenticação — 401 e 403 são coisas diferentes

| status | corpo | significa | o que fazer |
|---|---|---|---|
| `401` | `{"error":"Sem credencial"}` | header ausente ou vazio | corrigir a chamada |
| `401` | `{"error":"Credencial inválida — não é service role nem JWT de usuário.", "dica": "…"}` | token malformado, expirado ou de outro projeto | **não** dar retry: renovar o token |
| `403` | `{"error":"Só gestor cria usuário"}` | token **válido**, mas a pessoa não é gestor | **não** dar retry: é permissão, não transiente |

Um detalhe que economiza tempo: o gateway do Supabase valida o JWT **antes** da
função. Token com formato inválido devolve `{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT"}`
— isso vem da plataforma, não daqui, e também não merece retry.

**Retry só faz sentido em `5xx`.** `4xx` é sempre erro de chamada ou de dado.

---

## 1.1 Chamada mínima, para copiar

Troque `SUA_CHAVE` pela service role key. Base:
`https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1`

```bash
BASE=https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1

# consultar (e-mail e' o padrao)
curl -s "$BASE/status-usuario?email=joao@takeat.app" \
  -H "Authorization: Bearer SUA_CHAVE"

# criar (dry_run: valida e NÃO escreve)
curl -s -X POST "$BASE/criar-usuario" \
  -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"email":"joao@takeat.app","nome":"João Silva",
       "id_hubspot":"86100506","setor":"Outbound","dry_run":true}'

# revogar (dry_run: diz o efeito e NÃO altera)
curl -s -X POST "$BASE/revogar-usuario" \
  -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"id":"8f14e45f-...","dry_run":true}'
```

Em Node, sem SDK — as três rotas são HTTP comum:

```js
const BASE = 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1';

async function chamar(rota, { metodo = 'GET', corpo, query } = {}) {
  const url = new URL(`${BASE}/${rota}`);
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await res.json();
  // 4xx é erro de chamada ou de dado: não faça retry. Só 5xx merece.
  if (!res.ok) throw Object.assign(new Error(dados.error ?? res.statusText), {
    status: res.status, corpo: dados, transiente: res.status >= 500,
  });
  return dados;
}

const status = await chamar('status-usuario', { query: { email: 'joao@takeat.app' } });
if (!status.pode_trabalhar.ok) {
  for (const i of status.pode_trabalhar.impedimentos) console.log(i.codigo, '→', i.conserto);
}
```

### O fluxo que a integração costuma fazer

1. **`criar-usuario` com `dry_run: true`** — confere e-mail, owner do HubSpot e
   setor sem escrever. O retorno traz `owner_no_hubspot`: é a única chance de
   perceber que o id digitado é de outra pessoa.
2. **`criar-usuario`** de verdade. Guarde o **`id`**, nunca o e-mail.
3. **`status-usuario`** quando alguém reclamar que "o app não mostra nada" —
   `pode_trabalhar.impedimentos` responde sem ninguém abrir o banco.
4. **`revogar-usuario`** na saída. Antes disso, **transfira a carteira**: veja
   `carteira.leads` no status. Desativar sem transferir deixa os leads
   apontando para quem saiu, e eles somem do mapa de todo mundo.

---

## 2. Criar — `POST /criar-usuario`

Cria **sempre vendedor** (`role: "user"`). Não há parâmetro de papel: uma rota
que escolhe papel é via de escalonamento de privilégio. Mandar `role` no corpo
devolve `400` — recusa explícita em vez de criar um vendedor calado.

### Campos

| campo | obrigatório | observação |
|---|---|---|
| `email` | **sim** | vira o login; normalizado para minúsculas |
| `nome` | **sim** | mínimo 2 caracteres |
| `id_hubspot` | **sim** | owner id do CRM — ver abaixo |
| `setor` | **sim** | precisa existir em `sector_visibility` — ver abaixo |
| `senha` | não | mínimo 8 caracteres; sem ela, uma temporária é gerada |
| `dry_run` | não | `true` valida tudo e **não escreve nada** |

> **`setor` passou a ser obrigatório em 02/09/2026.** Antes a rota simplesmente
> não escrevia a coluna e deixava o default do banco decidir — e uma vendedora
> passou duas semanas com o mapa vazio por ter nascido no setor padrão. Se você
> integrava antes dessa data, adicione o campo: sem ele a resposta é `400`.

### O campo que depende de configuração: `id_hubspot`

É o equivalente ao `primaryTeamId` do HubSpot na sua analogia — com uma
diferença: **não é por setor, é por pessoa**.

É o `ownerId` do HubSpot (número de 8 dígitos, ex.: `86100506`). Sai de
`GET /crm/v3/owners` ou de Settings → Users & Teams.

Se vier errado, o efeito é traiçoeiro: a pessoa loga, trabalha e registra
visitas normalmente, mas aparece com **zero leads em todas as telas**, porque
`clients.vendedor_id_hubspot` não casa com ninguém. O sintoma não parece
cadastro incompleto.

Por isso a rota **confere o id contra o HubSpot antes de criar**:

- HubSpot responde `404` ou owner arquivado → `400`, não cria.
- HubSpot fora do ar ou sem token → **cria assim mesmo**, e devolve `aviso`.
  Provisionamento não deve ficar refém da disponibilidade de terceiro.

### O campo que decide o que a pessoa enxerga: `setor`

`sector_visibility` corta a tabela `clients` **por status, por setor**. Quem cai
num setor que não libera `lead` abre o mapa e não vê pin nenhum — e o sintoma é
"o app não carrega", não "sem permissão".

A rota confere o setor antes de criar:

- setor que **não existe** em `sector_visibility` → `400`, com a lista dos
  válidos no campo `setores_validos`. É erro de dado: o RLS não devolveria
  status nenhum e a pessoa abriria o app vazio.
- setor que existe mas **não libera `lead`** → **cria**, e devolve `aviso`.
  É legítimo para Marketing, Financeiro, Inside Sales. Só não serve para
  vendedor de rua.

A resposta de criação traz `setor` e `setor_ve_lead`. O `dry_run` traz também
`setor_status`, com a lista completa do que aquele setor enxerga.

### Resposta

```json
{
  "id": "8f14e45f-ceea-467a-9c2b-1f4a0e8c1234",
  "email": "joao@takeat.app",
  "nome": "João Silva",
  "role": "user",
  "id_hubspot": "86100506",
  "setor": "Outbound",
  "setor_ve_lead": true,
  "senha": "gT7kR2mQx9WbNp4z",
  "ja_existia": false,
  "owner_no_hubspot": "João Silva",
  "aviso": "Senha temporária gerada..."
}
```

`201` quando criou, `200` quando já existia.

### O identificador estável — grave este

**`id` é o UUID de `auth.users`.** É a mesma chave de:

```
profiles.id
client_visits.visited_by
client_stage_changes.created_by
dailies.seller_id
field_routes.seller_id
seller_visit_goals.seller_id
seller_classification.seller_id
```

Ele **nunca muda** enquanto a conta existir. É o que você grava em
`colaborador_contas` e o que a revogação usa depois.

Não grave o e-mail como chave. Ele muda, e diverge entre sistemas.

### Idempotência

Chave natural: **o e-mail**.

Reenviar a mesma criação devolve `200` com o `id` que já existe e
`"ja_existia": true` — não erro, não duplicata. Retry por timeout de rede é
seguro.

Há um segundo nível: se outro processo criar a conta **entre** a verificação e
a escrita, a corrida também é resolvida como idempotência (`200`,
`ja_existia: true`), e não como `409`.

Quando `ja_existia: true`, a senha **não** volta — o banco só guarda o hash.
Use recuperação de senha.

### `dry_run`

```json
{ "email": "joao@takeat.app", "nome": "João Silva",
  "id_hubspot": "86100506", "setor": "Outbound", "dry_run": true }
```

```json
{
  "dry_run": true,
  "pode_criar": false,
  "problemas": ["O HubSpot não conhece o owner 86100506."],
  "id": null,
  "owner_no_hubspot": null
}
```

Valida e-mail, nome, senha, existência do e-mail **e o owner no HubSpot**, sem
escrever nada. Quando o e-mail já existe, devolve o `id` junto — dá para gravar
o vínculo sem uma segunda chamada.

---

## 3. Consultar — `GET /status-usuario`

Só leitura, em todos os caminhos. **O padrão é consultar por e-mail** — quem
integra costuma ter o e-mail em mãos, não o uuid:

```
GET /status-usuario?email=joao@takeat.app
GET /status-usuario?id=8f14e45f-...        # forma exata, quando você já tem o uuid
```

`POST` com `{ "email" }` ou `{ "id" }` faz a mesma coisa — alguns clientes de
fila só sabem mandar POST. Mandando os dois, o `id` vence.

Repare no contraste com a revogação, logo abaixo: **consultar por e-mail é
barato de errar, revogar não é.** Ler com o identificador errado custa uma
resposta inútil; revogar com o identificador errado tira o acesso da pessoa
errada, e isso não tem desfazer.

### O campo que vale a chamada: `pode_trabalhar.impedimentos`

"A conta está ativa?" é a pergunta fácil, e não é a que gera chamado. As três
que geram são invisíveis por fora, e nenhuma parece cadastro incompleto para
quem sofre — o sintoma é sempre "o app não mostra nada":

| código | sintoma que a pessoa relata |
|---|---|
| `login_bloqueado` | "não consigo entrar" |
| `marcado_desativado` | some dos rankings e do placar da Daily |
| `sem_setor` | app abre vazio — o RLS não entrega status nenhum |
| `setor_sem_lead` | "o mapa não carrega" — é permissão, não falta de dado |
| `sem_id_hubspot` | "meu nome não aparece no placar", sem carteira |

**Ligue sua lógica no `codigo`, não no texto.** Os códigos são estáveis; os
campos `sintoma` e `conserto` são para humano ler e podem mudar de redação.

Um detalhe de leitura: `impedimentos` só acusa quem **deveria** estar
trabalhando. Quem está marcado `nao_vendedor` em `seller_classification` não
recebe `setor_sem_lead`, porque para essa pessoa o setor sem lead está certo.
Isso é `pode_trabalhar.eh_vendedor_de_campo`.

### Resposta

```json
{
  "id": "8f14e45f-...",
  "email": "joao@takeat.app",
  "nome": "João Silva",
  "papel": "user",
  "setor": "Outbound",
  "id_hubspot": "86100506",
  "criado_em": "2026-05-18T12:00:00Z",

  "acesso": {
    "ativo": true,
    "login_bloqueado": false,
    "banido_ate": null,
    "marcado_desativado": false,
    "ultimo_login": "2026-09-03T11:20:00Z"
  },

  "pode_trabalhar": {
    "ok": true,
    "impedimentos": [],
    "setor_ve": ["churn", "cliente", "lead"],
    "ve_leads": true,
    "classificacao": "ativo",
    "eh_vendedor_de_campo": true
  },

  "carteira": { "leads": 7, "clientes": 0, "churn": 0, "total": 7 },

  "atividade": {
    "janela_dias": 30,
    "ultima_visita": "2026-09-02T16:05:38Z",
    "visitas_na_janela": 1,
    "reunioes_futuras": 1
  }
}
```

### Como ler cada bloco

- **`acesso.ativo`** é `login_bloqueado === false && marcado_desativado === false`.
  As duas coisas são independentes: dá para estar banido com o nome limpo, e
  vice-versa. `banido_ate` é data porque o ban do Supabase é uma **janela**, não
  um estado — a rota de revogar usa 100 anos, mas um ban curto vence sozinho.
- **`carteira`** conta `clients.vendedor_id_hubspot`. Sem `id_hubspot` não
  existe carteira, e o zero ali é **consequência do impedimento**, não um número.
- **`atividade`** responde "essa conta está sendo usada?". Carteira grande com
  `visitas_na_janela: 0` e `eh_vendedor_de_campo: false` é carteira parada — o
  padrão que deixou 303 leads apontando para gente que saiu.

### Quando a pessoa não existe

```
404  { "error": "Nenhum usuário com e-mail ...", "existe": false }
```

Mesma convenção da revogação: `existe: false` para fechar sem gastar retry.

---

## 4. Revogar — `POST /revogar-usuario`

### Desativa, não exclui — e isso não é escolha de política

```sql
client_visits.visited_by uuid REFERENCES auth.users(id)   -- sem ON DELETE
```

Sem cláusula de delete a FK é `NO ACTION`: o Postgres **recusa** apagar quem já
tem um check-in. Um endpoint de "excluir" funcionaria só para quem nunca
trabalhou, e falharia justamente para quem importa — no meio da operação, com a
conta já banida.

Revogar faz duas coisas:

1. **Ban no `auth.users`** — a sessão morre e o login para de funcionar na hora.
2. **Sufixo `/ DESATIVADO` no `profiles.full_name`** — a convenção que o app já
   usa. Sem ela a pessoa some do login mas continua em ranking, filtro de
   vendedor e placar da Daily, como se ainda trabalhasse.

O histórico é preservado: visitas, notas e mudanças de etapa continuam
atribuídas. É o que mantém o passado auditável e a carteira visível para
redistribuir.

### Corpo

```json
{ "id": "8f14e45f-..." }          // preferido
{ "email": "joao@takeat.app" }    // alternativa
{ "id": "...", "dry_run": true }
```

### Quando a pessoa não existe

```
404  { "error": "Nenhum usuário com id ...", "existe": false }
```

O campo `existe: false` é explícito para você fechar como **"nada a revogar"**
sem gastar retry. Não é erro genérico.

### Idempotência

Revogar de novo devolve `200` com `"ja_revogado": true`. Não altera estado, não
falha.

### `dry_run`

Devolve `efeito` em texto — o que **aconteceria** —, não só um "ok". Um dry-run
que só confirma sintaxe não previne incidente.

---

## Resumo dos status

| status | criar | consultar | revogar |
|---|---|---|---|
| `200` | já existia (idempotente) · dry_run | o status | revogado · já revogado · dry_run |
| `201` | criado agora | — | — |
| `400` | dado inválido · owner ou setor inexistente · `role` enviado | nem `id` nem `email` | nem `id` nem `email` |
| `401` | credencial ausente ou inválida | idem | idem |
| `403` | não é gestor | idem | idem |
| `404` | — | **não existe** (`existe: false`) | **não existe** (`existe: false`) |
| `405` | — | método que não é GET/POST/OPTIONS | — |
| `5xx` | falha real — **aqui sim, retry** | idem | idem |

---

## O que NÃO existe hoje

- **Alterar papel por API.** De propósito. Promover é `update profiles.role`
  direto, e o gatilho `profiles_prevent_role_self_escalation` já garante que só
  gestor consegue.
- **Reativar por API.** Hoje é manual: tirar o sufixo `/ DESATIVADO` do nome e
  `ban_duration: 'none'`. Se virar rotina, vale uma rota.
- **Listar usuários por API.** Leia `profiles` direto com a service role key.
  `status-usuario` responde por uma pessoa de cada vez, de propósito: uma rota
  que devolve a base inteira de acessos é um alvo diferente de uma que devolve
  uma linha.
