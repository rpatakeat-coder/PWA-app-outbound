# Takeat RPA — App de Campo Outbound

Aplicativo mobile (Expo / React Native) para o time de vendas **outbound** da Takeat.
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
| App | Expo SDK 54, React Native 0.81, React 19, TypeScript |
| Estado/dados | @tanstack/react-query |
| Mapa | react-native-maps + react-native-map-clustering |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions/Deno) |
| CRM | HubSpot (deals, contatos, engagements) |
| Automações | n8n (Google Calendar, fallback de sync) |
| Build/OTA | EAS Build + EAS Update |

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
supabase/
  functions/                 # Edge Functions (Deno)
  migrations/                # Migrations SQL
assets/                      # Ícones/splash
eas.json / app.json          # Config EAS + Expo
```

---

## 🚀 Rodando localmente

Pré-requisitos: Node 18+ e um **dev build**/Expo Go (SDK 54) no dispositivo.

```bash
npm install
npm start            # inicia o Metro (expo start)
```

Conectar o celular (mesma rede Wi‑Fi) via QR/URL do Metro.
Se a LAN falhar (isolamento de rede/AP), use o túnel:

```bash
npx expo start --tunnel
```

> Este app usa módulos nativos (mapas, localização). Em geral roda no **Expo Go**
> (SDK 54); para recursos Android específicos use um **dev build** (`eas build`).

---

## 📦 EAS (build & OTA update)

Login (uma vez, conta da org `takeat`):

```bash
npm run login        # npx eas-cli login
npm run whoami
```

Publicar atualização **OTA** (JS, sem passar pela loja) — só chega em builds com o
mesmo `runtimeVersion` (`exposdk:54.0.0`):

```bash
npm run update:prod "mensagem"     # canal production
npm run update:preview "mensagem"  # canal preview
npm run update:dev "mensagem"      # canal development
```

Gerar build nativo (quando muda dependência nativa):

```bash
npx eas-cli build --profile production --platform android   # ou ios
```

---

## 🔌 Supabase Edge Functions

| Função | Papel |
|---|---|
| `hubspot-sync` | Saída app → HubSpot: `change_stage`, `update`, `create_pin`, `get_stages`, **`create_note`/`update_note`** (notas do lead e follow up → Observação), **`create_task`** (check-in de visita → Task), **`create_meeting`/`update_meeting`** (demo → Meeting). `update_task` só atende os follow ups criados antes da mudança de regra. |
| `hubspot-lead-webhook` / `-latlong` | Entrada: leads do HubSpot/RPA → upsert em `clients` (com geocoding). |
| `hubspot-usage-sync` | Entrada (1x/dia, Cron do Supabase): lê `data_da_ultima_comanda_emitida` e `data_solicitacao_cancelamento` dos deals nas etapas de Acompanhamento/Saudável (Onboarding e Sucesso) → grava em `clients`. |
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

## 📊 Uso do produto (HubSpot → app, 1x/dia)

Responde em campo "é cliente, mas será que usa?". A edge `hubspot-usage-sync`
roda diariamente (Cron do Supabase) e grava em `clients`:

| HubSpot (deal) | `clients` |
|---|---|
| `data_da_ultima_comanda_emitida` | `hs_ultima_comanda_em` (date) |
| `data_solicitacao_cancelamento` | `hs_cancelamento_solicitado_em` (date) |
| — | `hs_uso_sincronizado_em` (quando o sync passou) |

**Quem é "cliente" aqui não é o status local** — é estar numa destas etapas:

| Etapa | Pipeline | Stage ID |
|---|---|---|
| Acompanhamento | Onboarding (`87106112`) | `175135768` |
| Acompanhamento | Sucesso (`87367429`) | `162508353` |
| Saudável | Sucesso (`87367429`) | `171389297` |

Uma busca por etapa (`dealstage EQ`, paginada de 100 em 100) → gravação em
lotes de 500 pela RPC `apply_hubspot_uso`. Com ~3 mil clientes: **~30 chamadas
ao HubSpot e ~6 ao banco por dia**.

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
