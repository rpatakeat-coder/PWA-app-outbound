# `status-usuario` — consultar o estado de uma conta

Rota de **leitura**, para outro sistema perguntar "essa pessoa consegue
trabalhar no app de campo?". Não escreve nada, em nenhum caminho.

```
GET https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/status-usuario
```

Faz parte de um trio — `criar-usuario`, `status-usuario`, `revogar-usuario`.
As outras duas estão em [`api-provisionamento.md`](./api-provisionamento.md).

---

## 1. Por que ela existe

"A conta está ativa?" é a pergunta fácil, e **não é a que gera chamado**.

As três que geram são invisíveis por fora, e nenhuma parece cadastro
incompleto para quem sofre — o sintoma é sempre *"o app não mostra nada"*:

| o que está errado | o que a pessoa diz |
|---|---|
| setor não libera `lead` em `sector_visibility` | "o mapa não carrega" |
| falta `id_hubspot` | "meu nome não aparece no placar" |
| `seller_classification = nao_vendedor` | (nada — é intencional) |

Descobrir qualquer uma delas exigia abrir o banco. É isso que esta rota
resolve: ela devolve o diagnóstico pronto, em `pode_trabalhar.impedimentos`.

---

## 2. Autenticação

```
Authorization: Bearer <token>
```

O token é **um destes dois**:

| token | quem usa | onde pegar |
|---|---|---|
| **service role key** | integração servidor-a-servidor | Settings → API → `service_role` |
| **JWT de um usuário `gestor`** | tela chamando em nome de quem está logado | `supabase.auth.getSession()` |

**Os dois formatos de service role funcionam** — a legada (`eyJ…`, em *Legacy
API keys*) e a nova (`sb_secret_…`). A rota valida **capacidade**, não igualdade
de string.

> A service role key ignora RLS por completo: quem a tem lê e escreve qualquer
> tabela. Ela **não pode** ir para o navegador nem para app de cliente. Guarde
> em variável de ambiente do lado servidor.

---

## 3. A chamada

**Por e-mail — este é o padrão:**

```
GET /status-usuario?email=joao@takeat.app
```

Por `id`, quando você já guardou o UUID:

```
GET /status-usuario?id=8f14e45f-ceea-467a-9c2b-1f4a0e8c1234
```

`POST` com `{"email": "…"}` ou `{"id": "…"}` faz exatamente a mesma coisa —
existe porque alguns clientes de fila só sabem mandar POST.

E-mail é normalizado para minúsculas. **Mandando os dois, o `id` vence**: ele é
a chave de verdade, e os dois discordarem é bug de quem chama — resolver pelo
mais preciso é o que erra menos.

### Consultar por e-mail é barato de errar; revogar não é

Aqui o e-mail é o padrão porque a leitura não muda nada: errar o identificador
custa uma resposta inútil. Em `revogar-usuario` a recomendação continua sendo o
`id` — lá, e-mail reciclado ou trocado significa **tirar o acesso da pessoa
errada**, e isso não tem desfazer.

Se o seu sistema for guardar um vínculo, guarde o `id` que esta rota devolve.

---

## 4. A resposta

```json
{
  "id": "8f14e45f-ceea-467a-9c2b-1f4a0e8c1234",
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

### Identificação

| campo | tipo | nota |
|---|---|---|
| `id` | uuid | **a chave estável.** É o mesmo `auth.users.id`, `profiles.id`, `client_visits.visited_by`, `dailies.seller_id`… Nunca muda. Consulte por e-mail, mas **guarde este** |
| `email` | string | o identificador do dia a dia — e o que muda e diverge entre sistemas |
| `nome` | string | já vem **sem** o sufixo `/ DESATIVADO` |
| `papel` | `user` · `gestor` · `view` | `user` = vendedor |
| `setor` | string · null | decide o que a pessoa enxerga |
| `id_hubspot` | string · null | owner id do CRM; liga a carteira |

### `acesso` — consegue entrar?

| campo | nota |
|---|---|
| `ativo` | `!login_bloqueado && !marcado_desativado` |
| `login_bloqueado` | ban vigente no `auth.users` |
| `banido_ate` | ISO ou `null` — é **data**, não booleano |
| `marcado_desativado` | tem `/ DESATIVADO` no nome |
| `ultimo_login` | ISO ou `null` (nunca entrou) |

As duas condições são **independentes**: dá para estar banido com o nome limpo
e vice-versa. Por isso os dois campos existem separados de `ativo`.

`banido_ate` é data porque o ban do Supabase é uma **janela**, não um estado. A
revogação usa 100 anos, mas um ban curto vence sozinho — comparar com "agora" é
obrigação de quem lê, e a rota já faz isso em `login_bloqueado`.

### `pode_trabalhar` — o bloco que vale a chamada

| campo | nota |
|---|---|
| `ok` | `impedimentos.length === 0` |
| `impedimentos` | lista — ver abaixo |
| `setor_ve` | status que o setor libera, ex. `["churn","cliente","lead"]` |
| `ve_leads` | `setor_ve` contém `lead` |
| `classificacao` | `ativo` · `sem_meta` · `nao_vendedor` |
| `eh_vendedor_de_campo` | é `user`, não desativado, e não é `nao_vendedor` |

Cada impedimento:

```json
{
  "codigo": "setor_sem_lead",
  "sintoma": "Abre o mapa e não aparece pin nenhum — parece falta de dado, é permissão.",
  "conserto": "O setor \"Inbound\" só enxerga churn, cliente. Mudar o setor, ou liberar 'lead' para ele em sector_visibility."
}
```

**Ligue sua lógica no `codigo`.** Ele é estável. `sintoma` e `conserto` são
texto para humano ler e podem mudar de redação a qualquer momento.

| `codigo` | significa |
|---|---|
| `login_bloqueado` | ban vigente — não consegue entrar |
| `marcado_desativado` | sai dos rankings e do placar da Daily |
| `sem_setor` | sem setor o RLS não entrega status nenhum: app abre vazio |
| `setor_sem_lead` | o setor não libera `lead` — mapa vazio, e parece falta de dado |
| `sem_id_hubspot` | sem owner do CRM: some do placar e fica sem carteira |

#### A regra que evita alarme falso

`impedimentos` só acusa quem **deveria** estar trabalhando em campo.

Quem está marcado `nao_vendedor` em `seller_classification` **não** recebe
`setor_sem_lead` nem `sem_id_hubspot` — para essa pessoa, estar num setor sem
lead está certo. É o que `eh_vendedor_de_campo` informa.

Sem essa regra o alarme fica vermelho para sempre em quem está no lugar certo,
e alarme permanente é o mesmo que nenhum alarme.

### `carteira`

Contagem de `clients.vendedor_id_hubspot` por status.

Sem `id_hubspot` **não existe carteira**: o zero ali é consequência do
impedimento, não um número real.

### `atividade`

| campo | nota |
|---|---|
| `janela_dias` | `30` — a janela usada nos contadores |
| `ultima_visita` | ISO ou `null` |
| `visitas_na_janela` | check-ins nos últimos 30 dias |
| `reunioes_futuras` | reuniões e follow-ups agendados daqui pra frente |

Responde *"essa conta está sendo usada?"*. Trinta dias porque abaixo disso
férias derrubam qualquer conta, e acima disso uma conta abandonada continua
parecendo viva.

---

## 5. Erros

| status | corpo | o que fazer |
|---|---|---|
| `400` | `{"error":"Informe \`email\` (padrão) ou \`id\`."}` | corrigir a chamada |
| `401` | `{"error":"Sem credencial"}` | header ausente |
| `401` | `{"error":"Credencial inválida — …","dica":"…"}` | renovar o token. **Sem retry** |
| `403` | `{"error":"Só gestor consulta status"}` | token válido, mas não é gestor. **Sem retry** |
| `404` | `{"error":"Nenhum usuário com …","existe":false}` | fechar como "não existe". **Sem retry** |
| `405` | `{"error":"Use GET (?id= ou ?email=) ou POST."}` | corrigir o método |
| `5xx` | — | **aqui sim, retry com backoff** |

**`4xx` nunca merece retry** — é erro de chamada ou de dado. Só `5xx` é
transiente.

O campo `existe: false` no `404` é explícito para você fechar o caso sem gastar
tentativas. Não é erro genérico.

> O gateway do Supabase valida o formato do JWT **antes** da função. Token
> malformado devolve `{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT"}` — isso vem da
> plataforma, não daqui, e também não merece retry.

---

## 6. Exemplos

### curl

```bash
BASE=https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1

curl -s "$BASE/status-usuario?email=joao@takeat.app" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq
```

### Node — sem SDK

```js
const BASE = 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1';

async function statusUsuario({ email, id }) {
  const url = new URL(`${BASE}/status-usuario`);
  // E-mail é o padrão; id só quando você já guardou o UUID.
  url.searchParams.set(id ? 'id' : 'email', id ?? email);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const dados = await res.json();

  if (res.status === 404) return null;          // não existe — caso normal
  if (!res.ok) {
    throw Object.assign(new Error(dados.error ?? res.statusText), {
      status: res.status,
      transiente: res.status >= 500,            // só isso merece retry
    });
  }
  return dados;
}
```

### Python

```python
import os, requests

BASE = "https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1"

def status_usuario(email=None, id=None):
    r = requests.get(
        f"{BASE}/status-usuario",
        params={"id": id} if id else {"email": email},
        headers={"Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}"},
        timeout=15,
    )
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()
```

---

## 7. Receitas

### Diagnosticar "o app não mostra nada"

```js
const s = await statusUsuario({ email });
if (!s) return 'não existe conta com esse e-mail';
if (!s.acesso.ativo) return 'conta sem acesso';

for (const i of s.pode_trabalhar.impedimentos) {
  console.log(`${i.codigo}: ${i.sintoma}\n  → ${i.conserto}`);
}
```

### Conferir depois de provisionar

Chame logo após `criar-usuario`. Se `pode_trabalhar.ok` vier `false`, a conta
nasceu quebrada e o `conserto` diz o quê.

### Achar carteira parada

Carteira grande com pouca atividade é lead preso com quem não trabalha mais:

```js
const parada =
  s.carteira.leads > 0 &&
  (!s.pode_trabalhar.eh_vendedor_de_campo || s.atividade.visitas_na_janela === 0);
```

É o padrão que deixou **303 leads** apontando para seis pessoas que já tinham
saído. Antes de revogar alguém, olhe `carteira.leads` e transfira.

### Auditar o time

Não há rota de listagem, de propósito — uma rota que devolve a base inteira de
acessos é um alvo diferente de uma que devolve uma linha. Para varrer todo
mundo, leia `profiles` direto com a service role key e chame a rota por `id` —
numa varredura você já tem o UUID em mãos, e ele evita ambiguidade. Em série ou
com concorrência baixa.

---

## 8. O que esta rota **não** faz

- **Não escreve.** Nem para corrigir o que ela mesma acusa.
- **Não lista.** Uma pessoa por chamada.
- **Não cria nem revoga** — ver [`api-provisionamento.md`](./api-provisionamento.md).
- **Não diz se a pessoa está online.** `ultimo_login` e `atividade` são o mais
  perto disso.

## Custo

Uma chamada com service role faz **10 idas ao banco**: 1 no perfil, 1 na Admin
API, 5 em paralelo (setor, classificação, última visita, visitas na janela,
reuniões) e 3 contagens de carteira. As contagens usam `head` — devolvem só o
número, sem trazer linha.

Com JWT de gestor são 2 a mais (validar o token e ler o papel de quem chamou).
Se a chave de serviço não bater na comparação direta, +1.

Ordem de dezenas de milissegundos. Não precisa de cache para uso interativo;
para varrer o time inteiro, mantenha concorrência baixa.
