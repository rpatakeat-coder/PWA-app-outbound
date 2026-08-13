# Takeat RPA — App de Campo Outbound

**PWA** (instalável no celular) para o time de vendas **outbound** da Takeat.
Concentra a operação de campo do vendedor: mapa de leads, planejamento de rota,
agenda de compromissos, tarefas, check-in de visitas e o painel do gestor — tudo
sincronizado com o **HubSpot** (CRM) e o **Supabase** (banco + backend).

> ⚠️ **Repositório privado** — código proprietário da Takeat.

---

## 📱 Funcionalidades

- **Mapa comercial** — leads/clientes georreferenciados, clusterização, filtros por
  etapa, estado, vendedor e status; temperatura da etapa por cor.
- **Lista** — mesma base do mapa em formato de lista com busca e filtros.
- **Rota** — planejamento de rota do dia (otimização de paradas) e navegação.
- **Agenda** — rotas planejadas + reuniões (demos) + follow-ups em ordem
  cronológica (passado / hoje / futuro), com filtro por vendedor.
  - **Exportação JSON** (gestor) — botão que exporta a agenda em JSON para análise.
- **Tarefas** — cobranças automáticas (ex.: *Agendar Demo* com escalonamento D2 → D5).
- **Cadastro / edição de leads** — com geocoding e sincronização no HubSpot.
- **Check-in de visita** — registro de visita com validação de distância; cada
  visita (primeira ou re-marcada) cria uma **Task concluída** no deal do HubSpot.
- **Painel do Gestor** — métricas por vendedor, drill-down e exportação completa (JSON).
- **Meu desempenho** — métricas do próprio vendedor.

---

## 🧱 Stack

| Camada | Tecnologia |
|---|---|
| App | PWA — Expo SDK 54 (web) + react-native-web, React 19, TypeScript |
| Estado/dados | @tanstack/react-query |
| Mapa | Google Maps JavaScript API (`src/map/`, shim com a API do react-native-maps) |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions/Deno) |
| CRM | HubSpot (deals, contatos, engagements) |
| Automações | n8n (Google Calendar, fallback de sync) |
| Deploy/atualização | Vercel + service worker (`public/sw.js`) |

---

## 🏗️ Arquitetura (visão geral)

```
                 ┌─────────────────────────┐
                 │   App (Expo/React Native)│
                 └───────────┬─────────────┘
                             │ supabase-js (auth + dados)
                 ┌───────────▼─────────────┐
                 │        Supabase          │
                 │  Postgres · Auth · Storage│
                 │      Edge Functions       │
                 └─────┬───────────────┬────┘
        hubspot-sync   │               │  hubspot-lead-webhook(-latlong)
   (deals/contatos/    │               │  (leads vindos do HubSpot/RPA)
    engagements)       ▼               ▲
                 ┌───────────┐    ┌────┴───────┐
                 │  HubSpot  │    │    n8n     │
                 │   (CRM)   │◄──►│  Calendar  │
                 └───────────┘    │  + fallback│
                                  └────────────┘
```

- **Saída app → HubSpot**: a maior parte das escritas (mudança de etapa, cadastro,
  edição, notas, e agora **tasks/meetings de agenda**) vai pela Edge Function
  `hubspot-sync`, que fala **direto com a API do HubSpot**. Se a edge estiver
  indisponível, cai automaticamente para o **n8n** (mesmo payload).
- **Reunião/follow-up no Google Calendar**: continua no **n8n** (credencial OAuth
  do Google vive lá).
- **Entrada HubSpot → app**: leads chegam pelas Edge Functions
  `hubspot-lead-webhook` / `hubspot-lead-webhook-latlong` (upsert em `clients`).

---

## 📂 Estrutura

```
App.tsx                      # App principal (navegação por abas, telas core)
index.js                     # Entry point
src/
  screens/                   # Telas (Gestor, MeuDesempenho, modais de agendamento…)
  hooks/                     # Hooks de dados (useClients, useMeetings, useFieldOps…)
  utils/                     # Helpers (hubspotSync, routing, geocoding, exportAgenda…)
  context/AuthContext.tsx    # Autenticação (Supabase)
  constants/stages.ts        # Etapas do funil + webhook n8n
  integrations/supabase/     # Client + tipos
  types/client.ts            # Tipos de domínio
  map/                       # Camada de mapa (Google Maps JS API)
  components/Alert.tsx       # Alert.alert do react-native, implementado pra web
supabase/
  functions/                 # Edge Functions (Deno)
  migrations/                # Migrations SQL
assets/                      # Ícones/splash
public/                      # Casca do PWA: index.html, manifest.json, sw.js, icons/
scripts/build-web.js         # Build + carimbo de versão no service worker
app.json / vercel.json       # Config Expo (web) + deploy
```

---

## 🚀 Rodando localmente

Pré-requisitos: Node 18+.

```bash
npm install
cp .env.example .env.local   # preencha a chave do Google Maps (ver abaixo)
npm start                    # http://localhost:8081
```

Para testar o **build de produção** (inclui service worker, que não roda em dev):

```bash
npm run build
npm run serve                # http://localhost:3000
```

> O service worker só se registra em **HTTPS** ou em **localhost**. Num IP de LAN
> (`192.168.x.x`) o app funciona, mas sem instalação nem offline.

---

## 🔑 Chave do Google Maps

O mapa usa a **Maps JavaScript API**. São necessárias duas variáveis
(`.env.example` tem o passo a passo completo):

| Variável | O que é |
|---|---|
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Chave de **browser**, restrita por domínio |
| `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID` | Map ID (tipo *JavaScript*). Obrigatório — sem ele os pins não carregam. Use **vector** com *Tilt* e *Rotation* para o modo navegação |

> ⚠️ Chave de browser é **pública** — ela viaja no bundle, como em qualquer mapa web.
> A proteção é a restrição por *HTTP referrer* + limitar a chave à Maps JavaScript API.
> **Nunca** reutilizar aqui a `GOOGLE_GEOCODING_API_KEY`: ela é secret de servidor da
> Edge Function `geocode` e não tem restrição de referrer.

**Custo:** Dynamic Maps tem 10.000 carregamentos/mês grátis, depois US$ 7/1.000.
Um carregamento = uma instância de mapa criada. Com ~15 vendedores o uso fica em
torno de 5.000/mês. Se esse número disparar, o suspeito é remontagem de mapa —
conferir se algum fluxo está desmontando e remontando o `<MapView>`.

---

## 📦 Deploy (Vercel)

```bash
npm run build        # gera dist/ e carimba a versão no sw.js
```

Na Vercel: *New Project* → importar o repo. Cadastrar as duas variáveis
`EXPO_PUBLIC_*` em *Settings → Environment Variables* (Production + Preview) e
adicionar o domínio final nas restrições da chave do Google.

O que o `vercel.json` faz e por quê (o arquivo é JSON puro, sem comentários —
a Vercel rejeita propriedades fora do schema):

| Regra | Motivo |
|---|---|
| `sw.js` → `max-age=0, must-revalidate` | É o arquivo que anuncia versão nova. Se o browser o servir do cache, o vendedor fica preso na versão antiga indefinidamente. |
| `/_expo/static/*` → `immutable` | Os bundles do Metro têm hash no nome: conteúdo novo = URL nova, então podem ser cacheados pra sempre. |
| `manifest.json` → `must-revalidate` | Mudanças de ícone/nome precisam chegar sem esperar expirar cache. |
| `rewrites: /(.*)` → `/index.html` | SPA: a navegação é interna (abas/modais), não há rotas no servidor. A Vercel só aplica rewrites **depois** de procurar o arquivo no filesystem, então `/sw.js`, `/manifest.json` e `/icons/*` continuam sendo servidos normalmente. |

### Como a atualização chega no vendedor

Substitui o EAS Update. Cada build grava um hash do conteúdo em `dist/sw.js`;
o browser detecta que o arquivo mudou e instala a versão nova em segundo plano.
Os três gatilhos de `useForceReload` continuam iguais:

1. **Abertura do app** — checa e recarrega se houver versão nova
2. **Volta do background** — mesma checagem
3. **Tabela `app_force_reload`** — o admin (ou o cron das 2h) atualiza
   `triggered_at` e todo cliente conectado recarrega

> O carimbo de versão é o que faz isso funcionar: sem ele o `sw.js` seria
> byte-idêntico entre deploys e nenhuma atualização chegaria.

---

## 🔌 Supabase Edge Functions

| Função | Papel |
|---|---|
| `hubspot-sync` | Saída app → HubSpot: `change_stage`, `update`, `create_pin`, `get_stages`, **`create_note`/`update_note`** (notas do lead e follow up → Observação), **`create_task`** (check-in de visita → Task), **`create_meeting`/`update_meeting`** (demo → Meeting). `update_task` só atende os follow ups criados antes da mudança de regra. |
| `hubspot-lead-webhook` / `-latlong` | Entrada: leads do HubSpot/RPA → upsert em `clients` (com geocoding). |
| `hubspot-usage-sync` | Entrada (semanal — segunda de madrugada, Cron do Supabase): lê `data_da_ultima_comanda_emitida` e `data_solicitacao_cancelamento` dos deals nas etapas de Acompanhamento/Saudável (Onboarding e Sucesso) → grava em `clients`. |
| `export-report` | Exporta TUDO do período em JSON (painel do gestor) → Storage → signed URL. |
| `export-agenda` | Exporta a agenda (montada no app) em JSON → Storage → signed URL. |
| `geocode` | Geocoding/reparo de coordenadas. |
| `delete-lead`, `open-app` | Utilitários. |

Deploy (via Supabase CLI ou MCP):

```bash
supabase functions deploy hubspot-sync
```

Secrets usados pelas functions: `HUBSPOT_TOKEN`, `HUBSPOT_WEBHOOK_SECRET`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.

`HUBSPOT_TOKEN` é o token do private app do HubSpot e só é lido por
`hubspot-sync` e `hubspot-usage-sync` — trocar o private app significa trocar
esse secret (mais a credencial equivalente no n8n). `HUBSPOT_WEBHOOK_SECRET` é
outra coisa: segredo compartilhado que valida quem **chama** os webhooks de
entrada, não muda quando o app do HubSpot muda.

`HUBSPOT_TOKEN_USAGE` (opcional) dá à `hubspot-usage-sync` um token próprio. O
limite da Search API é de **4 req/s por token**, então um private app dedicado
tira a varredura semanal da disputa com o n8n/RPA. Sem o secret, ela usa o
`HUBSPOT_TOKEN` normalmente.

---

## 🔗 Integração Agenda → HubSpot

Ao **agendar** na agenda do app:

- **Follow up** → cria uma **Observação** (note) na timeline do deal, com
  `Follow Up - {lead}`, a data agendada no corpo (nota não tem vencimento) e as
  observações do agendamento, assinada pelo vendedor.
- **Demo (reunião)** → cria uma **Meeting** no HubSpot (início/fim pela duração),
  associada ao deal.
- **Reagendar** atualiza o mesmo engagement (reescreve o corpo da Observação);
  **cancelar** prefixa `[Follow Up cancelado]` na Observação / cancela a Meeting.
  O id do engagement fica em `client_meetings.hs_engagement_id`.
- O evento no **Google Calendar** (via n8n) continua funcionando em paralelo.

Ao fazer **check-in de visita** (botões "Marcar como visitado" / "Re-marcar
visita"):

- Cria uma **Task** no deal — assunto `Visita - {lead}`, já **concluída**
  (`concluida: true`), datada na hora do check-in, dona do vendedor, com nº da
  visita no corpo. É registro de atividade, não pendência: não entra na fila do
  vendedor. Uma por check-in; o app não guarda o id (não há update/cancel).
- Vale inclusive para **cliente/churn** — é atividade na timeline, não funil. O
  bloqueio de `isLead` continua valendo só para etapa e webhook.

> Só vale para leads que já têm `id_hubspot` (deal). Sem isso, o app ignora sem erro.

---

## 📊 Uso do produto (HubSpot → app, semanal)

Responde em campo "é cliente, mas será que usa?". A edge `hubspot-usage-sync`
roda **toda segunda às 04:00 BRT** (Cron do Supabase, `0 7 * * 1` — o cron é em
UTC) e grava em `clients`:

| HubSpot (deal) | `clients` |
|---|---|
| `data_da_ultima_comanda_emitida` | `hs_ultima_comanda_em` (date) |
| `data_solicitacao_cancelamento` | `hs_cancelamento_solicitado_em` (date) |
| `numero_de_comandas_ate_o_momento_number` | `hs_qtd_comandas` (integer) |
| etapa de onde veio | `hs_etapa_uso` (rótulo) + `hs_situacao` (`ativo`/`churn`) |
| — | `hs_uso_sincronizado_em` (quando o sync passou) |

> **Ex-cliente é `hs_situacao = 'churn'`, não "tem data de cancelamento".** A
> data registra que houve um *pedido*: na primeira sincronização, 56 clientes em
> etapa ativa tinham pedido de cancelamento (o mais antigo de 05/01/2026) — gente
> retida, emitindo comanda até hoje. Quem classifica é a edge, pela flag `churn`
> na constante `STAGES`; o app só lê `hs_situacao`. Também não confundir com
> `clients.status = 'churn'`, que é marcação manual e não acompanha o HubSpot.

**Quem é "cliente" aqui não é o status local** — é estar numa destas etapas:

| Etapa | Pipeline | Stage ID |
|---|---|---|
| Acompanhamento | Onboarding (`87106112`) | `175135768` |
| Acompanhamento | Sucesso (`87367429`) | `162508353` |
| Saudável | Sucesso (`87367429`) | `171389297` |
| Churn | Sucesso (`87367429`) | `1122729590` |

Churn entra para que o **ex-cliente** mostre a data de cancelamento no pin.
Sozinho é maior que as outras três somadas (~2,7 mil deals), o que leva o total
para ~48 chamadas **por semana**.

Uma busca por etapa (`dealstage EQ`, paginada de 100 em 100) → gravação em
lotes de 500 pela RPC `apply_hubspot_uso`. Com ~4,7 mil deals nas quatro
etapas: **~48 chamadas ao HubSpot e ~10 ao banco, por semana**.

O portal tem outros fluxos (n8n, RPA) disputando o mesmo limite por segundo,
então o sync anda devagar de propósito: **1 requisição por segundo**
(`MIN_INTERVAL_MS`), ocupando ~1 dos ~4 slots/s da Search API. Em 429 ou 5xx
ele respeita o `Retry-After` do HubSpot e tenta de novo (até 5 vezes, backoff
exponencial). O retorno traz `retries_429` e `espera_por_limite_ms` — se
subirem, vale mover o horário do cron para longe dos outros fluxos.

No app, o bottom sheet do pin mostra a última comanda com semáforo (verde ≤ 7
dias, âmbar 8–30, vermelho > 30 ou nenhuma), o pedido de cancelamento quando
existe, e há quanto tempo o dado foi atualizado. O card só aparece para quem o
sync alcança — ou seja, cliente de verdade.

> Deal que sai dessas etapas para de ser atualizado e mantém o último valor
> lido; o rodapé "atualizado há N dias" é o que denuncia isso.

---

## 🔐 Segurança

- A **anon key** do Supabase em `src/integrations/supabase/client.ts` é publishable
  (protegida por RLS) — não é segredo, mas o repositório é privado por ser código
  proprietário.
- Segredos reais (tokens do HubSpot, service role) vivem apenas como **secrets das
  Edge Functions**, nunca no código do app.

---

## 🤝 Convenções

- Papéis de usuário via `profiles.role` (`gestor` = acesso total).
- Etapas do funil e IDs do HubSpot em `src/constants/stages.ts` e nas Edge Functions
  — manter sincronizados com o HubSpot.
