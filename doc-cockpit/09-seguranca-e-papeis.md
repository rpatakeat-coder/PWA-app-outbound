# 09 — Segurança e papéis

## Os dois papéis

```js
// data/usuarios.json — a fonte que o servidor consulta
{ email, role: 'manager' | 'rep', ownerId, nome, rampStage?, aComecar? }
```

`ownerId` é o `hubspot_owner_id`. Gestor tem `ownerId: null`.
`mapa_usuarios` no Supabase é o espelho disso, e é a raiz de toda RLS.

## As quatro camadas de proteção

```
1. O HTML publicado não tem dado nenhum do CRM
2. /api/dados valida a sessão no servidor e corta por papel ANTES de responder
3. RLS no Supabase corta de novo, por owner, em toda tabela
4. Nenhum token de serviço (HubSpot, service_role) chega ao navegador
```

Elas são **redundantes de propósito**. Um furo em uma não abre o sistema.

## Camada 1 — o shell público

`public/index.html` carrega um `DATA` casca: config do Supabase (necessária para o login)
+ placeholders **vazios mas com o tipo certo**. Antes, o build embutia o DATA completo e
qualquer visitante via o CRM inteiro no "ver código-fonte", sem logar.

A tela de login publica **dois inteiros** (executivos ativos / em preparação) e o dia da
semana. Nada mais. **Teste de aceite:** abrir o código-fonte antes de logar e não achar
nenhum número de funil, MRR ou nome de cliente.

## Camada 2 — `filtrarParaPapel()`

```js
if (!usuario || usuario.role === 'manager') return dados;   // gestor recebe tudo
```

Para `rep`, o corte é **lista branca explícita**, nunca spread cego:

| campo | executivo recebe |
|---|---|
| `reps` | o **próprio objeto completo**; dos colegas, só `resumoDeColega()` (nome, fechados, pontos) — na **ordem original** |
| `funilLeads` | só os negócios dele, em cada etapa |
| `temperatura` | só os dele |
| `kpiDetalhe` | só os dele |
| `vendasMes.porRep` | agregado dos colegas **sem nomes de cliente** |
| `resumoSemanal.*Detalhe` | só os dele |
| `resumoSemanal.snapshotReps` | **só o próprio** — traz funil, travados, quentes e meta de todo o time |
| `agenda.itens` | só os dele (ver regra de dono abaixo) |
| `leadsReferencia` | só as praças em que ele é responsável |
| `territorios` | **só o próprio** |
| `habitosTime` | `{ meu, benchmark, pessoasMedidas }` — agregado **anônimo**, sem nome nem ownerId |
| `cadenciaDiaria` | só a linha dele (`porOwner: { [meuId]: … }`) |
| `historicoEtapas` | a fatia dele + referências sem nome (velocidade, ciclo, agregado). `escada: {}` |
| `motivosPerda` | só a própria assinatura de perda + exemplos dele |
| `syncStatus` | `{ ultimaExecucao, houveFalha, falhaMinha }` — nunca as falhas dos colegas |
| `kpisHub`, `funil`, `saude`, `stageMeta`, `usuarios` | permanecem — agregados sem detalhe de cliente, necessários para meta coletiva e pódio |

### A armadilha do spread
Quase todo vazamento neste código nasceu de `{ ...dados, … }` deixando passar um campo
novo. Três já aconteceram: `snapshotReps`, `cadenciaDiaria.porOwner`, `habitosTime.porRep`.

**Regra: declarar a variável recortada E usá-la.** Declarar `cadenciaMinha` e esquecer de
colocá-la no retorno é o vazamento em silêncio de sempre.

### O caso da agenda (regra sutil, e correta)
Nota do Expogo e tarefa criada por automação chegam do HubSpot **sem**
`hubspot_owner_id`. Quem diz de quem é o compromisso é o dono do **negócio** associado
(`lead_owner_id`).

```js
const meuCompromisso = it => {
  const dono = String(it.hubspot_owner_id || it.ownerId || '');
  if (dono) return dono === meuId;
  return String(it.lead_owner_id || '') === meuId;   // fallback
};
```

Medido: 20 itens sem `hubspot_owner_id`, 17 deles pertencendo a alguém do time. Sem o
fallback, o executivo nunca recebia o registro e o gestor via — **os dois olhando a mesma
semana e vendo agendas diferentes**. O corte não afrouxa: sem dono em nenhum dos dois
campos, não passa.

## Camada 3 — RLS

Padrão: cruzar `auth.email()` com `mapa_usuarios` para descobrir `owner_id` e `role`.
Sempre na forma `(select auth.email())` — avalia uma vez por consulta, não por linha.

Cortes especiais:
- `cockpit_snapshot`: RLS ligada, **zero policies**. Só `service_role`.
- `analise_individual_*`: leitura **só de gestor**.
- `pdi_documentos`, `um_a_um`, `sugestoes_planos`, `comunicados`: **escrita só de gestor**.
- `comunicados_lidos`: insert só com `email_leitor = auth.email()`.
- `playbook_mais_copiadas()`: `SECURITY DEFINER` porque RLS não restringe agregados —
  devolve soma, nunca a linha de quem copiou, e exige `EXISTS` em `mapa_usuarios`.

## Camada 4 — segredos

| segredo | onde vive | nunca |
|---|---|---|
| `HUBSPOT_TOKEN` | env da Vercel + Secrets do GitHub | no navegador |
| `SUPABASE_SERVICE_KEY` | env da Vercel + Secrets do GitHub | no navegador |
| `IMPORT_SECRET` | env da Vercel + Secrets do GitHub | no navegador |
| `ANTHROPIC_API_KEY` | Secrets do GitHub | na Vercel |
| `GOOGLE_PLACES_API_KEY` | Secrets do GitHub | na Vercel |
| `SUPABASE_ANON_KEY` | público por natureza (protegido por RLS) | — |
| chave do MapTiler | pública por natureza (o navegador precisa dela) | protegida por restrição de domínio no painel |

## Fail-closed, sempre

Sem env var, sem sessão válida, sem cadastro no time → **nada sai**. A mensagem diz o que
falta, mas o dado não vaza:

```js
if (!supaUrl || !supaAnon)
  return res.status(500).json({ erro: 'Servidor sem configuração completa. Operação bloqueada por segurança.' });
```

Sem `usuarios.json`, o build devolve `null` para o tamanho do time em vez de zero —
"zero executivos na rua" seria uma afirmação falsa na primeira tela do produto.

## Autorização por ação (além do papel)

| ação | quem pode |
|---|---|
| criar negócio para outro dono | só gestor |
| disparar importação de praça | só gestor |
| aprovar/devolver fila de prospecção | só gestor |
| materializar sugestão da Casa dos Dados | executivo, **só no próprio território** |
| consultar `realizado-hoje` de outro owner | só gestor |
| desfazer negócio | dono da conta, e só se o negócio nasceu no Planejamento sem atividade |
| corrigir MRR | gestor (decisão com trilha) |

## Suítes que protegem isso

```bash
node scripts/testar-autorizacao-escrita.js   # quem pode escrever o quê
node scripts/testar-sessao-do-executivo.js   # o recorte de sessão
node scripts/testar-conteudo-do-executivo.js # o que desce no payload dele
node scripts/auditar-executivo.js            # varredura do que a tela do rep expõe
node scripts/checar-politica-do-front.js     # o front não pode assumir política de dado
node scripts/checar-time-nas-duas-fontes.js  # usuarios.json × mapa_usuarios
```

Mais a guarda `checarPlacarDoExecutivo()` dentro de `check-scripts.js`: o placar do
executivo só pode comparar dado que a **sessão dele** realmente recebe.
