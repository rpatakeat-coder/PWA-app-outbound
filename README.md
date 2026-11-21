# Takeat — App de Campo (Field Sales)

**PWA** instalável no celular para o time de Field Sales da Takeat: o executivo na rua
(mapa, plano do dia, check-in, ficha de rua, tarefas) e, no mesmo domínio, o **Cockpit**
de gestão em `/gestao` — tudo sobre o **Supabase** (banco + backend) e o **HubSpot** (CRM).
Endereço: https://fieldtakeat.vercel.app (app em `/`, Cockpit em `/gestao`).

> ⚠️ **Repositório privado** — código proprietário da Takeat. Regras de trabalho para
> agentes em `CLAUDE.md`.

---

## 📱 O que o app faz

- **Mapa** — os pinos do executivo (leads, contas-alvo da munição, clientes Takeat) com as
  lentes da fileira, a lista do mapa e a pílula-placar do dia.
- **Hoje** — a folha da manhã (até as 10h ou pelo push das 8h), o toast depois de cada
  visita e o fecho do dia (push das 18h), montados por `_compartilhado/hojeV3.ts`, a mesma
  conta do Hoje do Cockpit.
- **Plano e rota** — o plano da semana (`planos_semanais`, o mesmo do Cockpit) vira a rota
  do dia (`field_routes` / `field_route_stops`).
- **Check-in** — o Cheguei com prova por GPS (ou foto) e a ficha de rua com o próximo passo.
- **Agenda** — reuniões e follow-ups; no computador, a Agenda planeja o dia no mapa.
- **Tarefas** — as tarefas que a gestão põe no HubSpot e a fila do dia.
- **Eu** — o desenvolvimento do executivo (placar, sequência, missões, carreira), o playbook
  e os ajustes.
- **Cockpit** (`/gestao`) — o HTML do repositório `julyanrib/cockpit-unificado`, copiado por
  `scripts/importar-cockpit.cjs` para `gestao/public/cockpit/` (nunca editar aqui).

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
        hubspot-sync   │               │  hubspot-lead-webhook-latlong
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
  `hubspot-lead-webhook-latlong` (upsert em `clients`; a `hubspot-lead-webhook` antiga saiu em 21/11/26).

---

## 📂 Estrutura

```
App.tsx                      # o app (abas, mapa, ficha do lead, folhas do dia)
index.js                     # entrada
src/
  screens/                   # telas e folhas (Hoje v3, Agenda, Tarefas, Eu, Playbook…)
  hooks/                     # leitura de dados (useClients, useFieldOps, useDiaV3…)
  utils/                     # regras puras, com as suítes *.teste.ts ao lado
  map/                       # camada de mapa (Google Maps JS API)
  constants/stages.ts        # etapas do funil e cores (dado, não tema)
  integrations/supabase/     # cliente e tipos
supabase/
  functions/                 # Edge Functions (Deno) + _compartilhado (regras do app e do Cockpit)
  migrations/                # migrations SQL, numeradas NNNN_
gestao/public/               # o Cockpit importado (servido em /gestao)
api/avisos-sem-passo.js      # cron da Vercel (seg–sex, 18h)
public/                      # casca do PWA: index.html, manifest.json, sw.js, ícones
scripts/                     # build-web, importar-cockpit, portar-cockpit-api, portar-compartilhado
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
| `hubspot-sync` | Saída app → HubSpot: etapa, cadastro, notas, tarefas e reuniões (com fallback no n8n). |
| `hubspot-lead-webhook-latlong` | Entrada: leads do HubSpot/RPA → `clients`. |
| `hubspot-activity-sync` | Diária: atividades do HubSpot → `clients` (`apply_hubspot_activity`). |
| `clientes-sync` | Diária: os clientes Takeat (pipelines Onboarding e Sucesso) → `clientes_takeat`. |
| `negocio-vira-ponto` | A cada 15 min: negócio do funil Field sem pino ganha pino. |
| `localizar-municao` | De hora em hora: acha o endereço das contas de rua sem coordenada. |
| `geocode` | Endereço → coordenada no cadastro. |
| `push-fila` | Os avisos do dia (8h, 12h30, 17h30, 18h, sexta 17h). |
| `fila-tarefas` | A fila do dia do executivo. |
| `assumir-negocio` | "É meu": passa o negócio para quem pediu, com as travas. |
| `criar-usuario` / `revogar-usuario` | Acessos (aba Acessos do Cockpit). |
| `google-calendar` | O evento da reunião na agenda do Google. |
| `cockpit-dados` / `cockpit-api` / `cockpit-robo` | O Cockpit: leitura, escritas no HubSpot e a entrada dos robôs. |

Deploy (via Supabase CLI ou MCP):

```bash
supabase functions deploy hubspot-sync
```

Secrets usados pelas functions: `HUBSPOT_TOKEN`, `HUBSPOT_WEBHOOK_SECRET`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`. As chamadas do pg_cron levam um segredo do
cofre (`vault`), conferido por `public.segredo_confere`.

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
