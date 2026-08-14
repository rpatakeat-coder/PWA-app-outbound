# 01 — Arquitetura

## Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Front-end | **HTML/CSS/JS vanilla, arquivo único** (`public/index.html`, ~17.800 linhas) | Sem framework, sem bundler. Todo o CSS num `<style>` e todo o JS num `<script>`. |
| Cliente Supabase | `@supabase/supabase-js@2` via CDN jsdelivr | Único script externo obrigatório. |
| Back-end | **Funções serverless da Vercel** (`api/*.js`, CommonJS) | Sem servidor persistente. |
| Banco + Auth + Storage | **Supabase** | Auth por e-mail/senha; Postgres; 3 buckets. |
| CRM (fonte da verdade comercial) | **HubSpot** (API v3) | Pipeline único de field sales. |
| IA | **API da Claude** (`api.anthropic.com/v1/messages`, modelo `claude-sonnet-4-6`) | Gera narrativas, não números. |
| Automação | **GitHub Actions** (3 workflows) | Roda os fetches e commita os JSONs de volta no repo. |
| Deploy | **Vercel** (estático + funções) | Deploy no push da branch `main`. |

## Princípio central: dados versionados no Git

O sistema não tem banco para o dado do CRM. O GitHub Actions roda `scripts/fetch-hubspot.js`,
que escreve `data/hubspot.json`, e **commita o arquivo de volta no repositório**. A Vercel
redeploya. O Supabase só guarda o que é gerado por pessoas (Daily, PDI, avisos, prospecção).

Consequência: o "estado do funil" é sempre um snapshot de até algumas horas atrás, e a tela
**sempre rotula a idade do dado** ("HubSpot atualizado em 14/08 às 08:59"). Se o dado estiver
velho, a UI avisa em vermelho.

## Fluxo de dados completo

```
                    ┌──────────────── GitHub Actions (cron) ────────────────┐
                    │                                                       │
   HubSpot API ────▶│ fetch-hubspot.js ─────────▶ data/hubspot.json         │
                    │ fetch-weekly-comparison ──▶ data/weekly-raw.json      │
                    │ fetch-clientes-ativos ────▶ data/clientes-ativos.json │
                    │                                                       │
   Claude API ─────▶│ generate-daily-gargalo ───▶ data/narrativas.json      │
                    │ generate-weekly-summary ──▶ data/resumo-semanal.json  │
                    │ generate-individual-      ─▶ Supabase                 │
                    │   analysis                   (analise_individual_*)    │
                    │                                                       │
                    │ build.js ─────────────────▶ public/index.html (shell) │
                    └──────────── git commit + push ────────────────────────┘
                                          │
                                          ▼
                                     Vercel deploy
                                          │
    Navegador ──── login Supabase ────────┤
        │                                 │
        │  GET /api/dados (Bearer token)  │
        └────────────────────────────────▶│ api/dados.js
                                          │   ├─ valida sessão no Supabase
                                          │   ├─ acha o usuário em data/usuarios.json
                                          │   ├─ montarDadosCompletos()  ← lê os data/*.json
                                          │   └─ filtrarParaPapel()      ← corte de privacidade
                                          │
                                    { sessao, dados } ──▶ hidrata window.DATA
                                          │
    Navegador ──── supabase-js direto ───▶ Supabase (dailies, planos_diarios, comunicados,
                                            leads_prospeccao, pdi_*, um_a_um, perfis…)
    Navegador ──── POST /api/* ──────────▶ HubSpot (escritas: MRR, negócio, empresa, tarefa)
```

## Segurança — o modelo mais importante de copiar

### 1. Shell protegido (o HTML público não contém dados)

`scripts/build.js` gera `public/index.html` a partir de `template/cockpit.template.html`,
injetando em `<script id="cockpit-data">` **apenas**:

```json
{ "shellProtegido": true,
  "supabase": { "url": "...", "anonKey": "..." },
  "kpisHub": {}, "funil": {"labels":[],"valores":[],"cores":[]}, "reps": [], ... }
```

Ou seja: config do Supabase (necessária para o login) + **placeholders vazios com o tipo
certo**. Os placeholders precisam existir porque o script tem código síncrono no topo que lê
`DATA` antes do login — array vazio renderiza estado vazio, `undefined` quebraria.

Antes dessa mudança (07/08/26) o build embutia o CRM inteiro no HTML: qualquer visitante via
tudo no "ver código-fonte", sem logar. **Replique este modelo desde o dia 1.**

### 2. Dados só depois do login, filtrados no servidor

`api/dados.js`:
1. Exige `Authorization: Bearer <token da sessão Supabase>`.
2. Valida o token contra `${SUPABASE_URL}/auth/v1/user`.
3. Procura o e-mail em `data/usuarios.json`. Não achou → **403**.
4. Chama `montarDadosCompletos()` e depois `filtrarParaPapel(dados, usuario)`.
5. Responde `Cache-Control: private, no-store`.

### 3. Fail-closed em todas as rotas

Toda rota `api/*.js` começa verificando as env vars. **Sem env var → 500 e a rota se recusa
a operar**, em vez de pular a checagem de sessão. Repita esse padrão.

### 4. Nenhum token de terceiro chega ao navegador

`HUBSPOT_TOKEN`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `CASADOSDADOS_TOKEN` só existem
em env var de servidor. O navegador conhece apenas `SUPABASE_URL` + `anonKey` (públicos por
natureza, protegidos por RLS).

## Papéis e corte de privacidade

`data/usuarios.json` mapeia e-mail → papel:

```json
{ "usuarios": [
  { "email": "gestor@empresa.com", "role": "manager", "ownerId": null, "nome": "Nome" },
  { "email": "exec@empresa.com",   "role": "rep",     "ownerId": "86100506", "nome": "Nome" },
  { "email": "novo@empresa.com",   "role": "rep",     "ownerId": "pendente_x", "nome": "Nome", "aComecar": true }
]}
```

`ownerId` é o **HubSpot owner id**. `aComecar: true` marca quem ainda não entrou em campo.

### `filtrarParaPapel()` — a regra exata (em `scripts/montar-dados.js`)

**Gestor (`manager`)**: recebe o DATA completo, sem corte.

**Executivo (`rep`)**: recebe
- o **próprio objeto `rep` completo** (funil, travados, quentes, gargalo, compromissos);
- dos colegas, **apenas `resumoDeColega()`**: `ownerId`, `name`, `praca`, `fechadosNoMes`,
  `metaMensal`, `ganhosSemana` — e estruturas **vazias mas bem tipadas** (`stages:{}`,
  `travados:[]`, `criticos:[]`, `quentes:[]`, `gargalo:null`, `compromissos:[]`). Vazio
  renderiza estado vazio; `undefined` quebraria o template;
- `kpiDetalhe`, `temperatura`, `funilLeads`, `ganhosSemanaDetalhe`, `reunioesSemanaDetalhe`,
  `quentesDemoOuNegociacao` filtrados por `ownerId === meuId`;
- `vendasMes.porRep`: colegas ficam com `clientes: []` (agregado sem nomes de cliente);
- `resumoSemanal.porRep`: só a própria chave; `snapshotReps`: só a própria chave
  (**cuidado**: o spread `...rs` deixaria `snapshotReps` inteiro passar — é vazamento silencioso);
- `agenda.itens` filtrado por dono; ver regra especial abaixo;
- `leadsReferencia`: só as praças onde ele é responsável;
- `clientesAtivos`: só os da cidade que bate com a praça dele;
- `syncStatus: null` (informação operacional do gestor).
- Permanecem intactos: `kpisHub`, `kpiDeltas`, `saude`, `funil` (contagens agregadas do time),
  `stageMeta`, `usuarios` — necessários para meta coletiva e Pódio.

**Regra especial da agenda**: notas do app de campo e tarefas criadas por automação chegam do
HubSpot **sem `hubspot_owner_id`**. Quem diz de quem é o compromisso é o dono do **negócio
associado** (`lead_owner_id`). O filtro é:

```js
const meuCompromisso = it => {
  const dono = String(it.hubspot_owner_id || it.ownerId || '');
  if (dono) return dono === meuId;
  return String(it.lead_owner_id || '') === meuId;   // fallback
};
```
Sem dono em nenhum dos dois campos, **não passa**. Sem esse fallback, 17 compromissos reais
sumiam da agenda do executivo enquanto o gestor os via — os dois olhando a mesma semana e
vendo agendas diferentes.

## Renderização e performance

- **Uma view por aba**, todas no mesmo DOM, alternadas por classe `.active`.
- `viewsDesenhadas` (um `Set`) evita re-render em reabertura de aba.
- No login só a **home do papel** é desenhada; o resto vai para `requestIdleCallback`
  (fallback `setTimeout(1200)`).
- Posição de navegação é salva em `sessionStorage` e restaurada — cuidado: o
  `onAuthStateChange` do Supabase **dispara mais de uma vez**, então a home tem que ser
  *fallback* (`if (!posicaoNavRestaurada)`), nunca `activateTab` incondicional.
- Blocos compartilhados entre abas são **movidos no DOM** (`appendChild`), nunca duplicados
  em HTML — preserva o wiring de eventos intacto.

## Variáveis de ambiente

| Var | Onde | Uso |
|---|---|---|
| `HUBSPOT_TOKEN` | Vercel + GitHub Secrets | Private App token. Escopos: deals read/write, companies read/write, meetings/tasks/notes read, owners read. |
| `SUPABASE_URL` | Vercel + GitHub Secrets | URL do projeto. |
| `SUPABASE_ANON_KEY` | Vercel | Validação de sessão nas rotas. |
| `SUPABASE_SERVICE_KEY` | Vercel + GitHub Secrets | Escritas privilegiadas (cache, snapshot da Daily, análises de IA). |
| `ANTHROPIC_API_KEY` | GitHub Secrets | Geração de narrativas. |
| `IMPORT_SECRET` | Vercel | Autenticação server-to-server do `importar-leads`. |
| `CASADOSDADOS_TOKEN` | Vercel | *(módulo de novidades — só se replicar, ver 08)* |
| `FORCE_MONTHLY_MESANO` | Input do workflow | Força fechamento mensal para teste (`AAAA-MM`). |

Chaves **públicas** que ficam em arquivo no repo (`data/supabase-config.json`): `url` e
`anonKey` do Supabase. Motivo declarado no código: o deploy é estático, não há build na
Vercel lendo env var — e são chaves que o navegador precisa conhecer de qualquer forma.
