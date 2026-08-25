# API de provisionamento — app de campo (Outbound)

Duas rotas: criar acesso e revogar acesso. Escrito para quem vai integrar de
fora (Takeat OS / `colaborador_contas`).

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

### Respostas de autenticação — 401 e 403 são coisas diferentes

| status | corpo | significa | o que fazer |
|---|---|---|---|
| `401` | `{"error":"Sem credencial"}` | header ausente ou vazio | corrigir a chamada |
| `401` | `{"error":"Credencial inválida"}` | token malformado, expirado ou de outro projeto | **não** dar retry: renovar o token |
| `403` | `{"error":"Só gestor cria usuário"}` | token **válido**, mas a pessoa não é gestor | **não** dar retry: é permissão, não transiente |

Um detalhe que economiza tempo: o gateway do Supabase valida o JWT **antes** da
função. Token com formato inválido devolve `{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT"}`
— isso vem da plataforma, não daqui, e também não merece retry.

**Retry só faz sentido em `5xx`.** `4xx` é sempre erro de chamada ou de dado.

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
| `senha` | não | mínimo 8 caracteres; sem ela, uma temporária é gerada |
| `dry_run` | não | `true` valida tudo e **não escreve nada** |

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

### Resposta

```json
{
  "id": "8f14e45f-ceea-467a-9c2b-1f4a0e8c1234",
  "email": "joao@takeat.app",
  "nome": "João Silva",
  "role": "user",
  "id_hubspot": "86100506",
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
  "id_hubspot": "86100506", "dry_run": true }
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

## 3. Revogar — `POST /revogar-usuario`

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

| status | criar | revogar |
|---|---|---|
| `200` | já existia (idempotente) · dry_run | revogado · já revogado · dry_run |
| `201` | criado agora | — |
| `400` | dado inválido · owner inexistente · `role` enviado | nem `id` nem `email` |
| `401` | credencial ausente ou inválida | idem |
| `403` | não é gestor | idem |
| `404` | — | **pessoa não existe** (`existe: false`) |
| `5xx` | falha real — **aqui sim, retry** | idem |

---

## O que NÃO existe hoje

- **Alterar papel por API.** De propósito. Promover é `update profiles.role`
  direto, e o gatilho `profiles_prevent_role_self_escalation` já garante que só
  gestor consegue.
- **Reativar por API.** Hoje é manual: tirar o sufixo `/ DESATIVADO` do nome e
  `ban_duration: 'none'`. Se virar rotina, vale uma rota.
- **Listar usuários por API.** Leia `profiles` direto com a service role key.
