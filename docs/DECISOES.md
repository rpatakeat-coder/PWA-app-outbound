# Decisões de arquitetura & regras operacionais

Documento vivo com as decisões que **não são óbvias pelo código**. Atualizar quando mudar.

---

## 1. Agenda → Google Calendar & HubSpot (demo vs follow up)

Arquitetura **pós-n8n** (o n8n saiu do fluxo de reunião/follow up):

| Ação no app | O que o nosso código faz | HubSpot |
|---|---|---|
| **Demo** (`type = reuniao`) | cria **evento no Google Calendar** via edge **`google-calendar`** (OAuth) | Meeting vem da **sync nativa HubSpot↔Google** (`hs_meeting_source: BIDIRECTIONAL_SYNC`). **NÃO** criamos Meeting via API (evita duplicar). |
| **Follow up** (`type = follow_up`) | cria **Observação (note)** na timeline do deal via edge **`hubspot-sync`** | Observação. **Sem** Google, **sem** Meeting, **sem** Task. |
| **Reagendar** | demo → `update_event` (move o evento no Google); follow up → reescreve a Observação | acompanha (Meeting via sync; Observação direto) |
| **Cancelar** | demo → `delete_event` (apaga o evento no Google); follow up → atualiza/remove a Observação | Meeting some via sync |

- **Regra:** follow up **NUNCA** vira Meeting; demo **NUNCA** duplica.
- **Por quê follow up não vai pro Google:** qualquer evento no Google vira Meeting pela sync — então follow up fica só como Observação no HubSpot.
- **Histórico:** a regra do follow up já foi (1) Task e depois (2) **Observação** (mudança do time, commit `55e1ec0`). Linhas antigas de `client_meetings` podem ter `hs_engagement_id` de uma Task da regra anterior.
- Colunas em `client_meetings`: **`google_event_id`** (demo) e **`hs_engagement_id`** (follow up). Preenchidas ao agendar (awaited) e usadas pra reagendar/cancelar o mesmo objeto.
- Título do evento/task usa o **nome do restaurante** (`empresa`), caindo pro contato (`nome`) se não houver.

### ⚠️ Trade-off conhecido (decisão: manter como está)
A **Meeting no HubSpot** de demos depende da **sync nativa HubSpot↔Google**, que é **assíncrona/inconsistente** (pode atrasar minutos ou não pegar). O **evento no Google é 100% confiável** (nosso código); só o "espelho" no HubSpot fica na mão da sync.
- **Não** dá pra desligar a sync globalmente (outras pessoas usam).
- Versão robusta (se um dia incomodar): calendário **dedicado** (fora da sync) + criar a Meeting via API (`create_meeting`, que já existe na edge `hubspot-sync`). É só religar o app pra usar `create_meeting` no lugar de depender da sync.

### Reagendar / Cancelar (UI)
Botões no **card da reunião no detalhe do lead** e na **aba Agenda**. Só aparecem em reuniões futuras. Backend em `src/hooks/useMeetings.ts`.

### Secrets da edge `google-calendar`
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID` (default = calendário "Comercial - Outbound").

---

## 2. Desativar usuário (desligamento) — NÃO deletar

Quando um vendedor é **desligado**: **desativar**, nunca deletar (pra preservar leads/reuniões/notas e a atribuição, e o gestor ver "DESATIVADO").

```sql
-- 1) Bloqueia login
update auth.users set banned_until = '2999-12-31 23:59:59+00'
where email in ('...');

-- 2) Marca no nome (gestor vê "Nome / DESATIVADO")
update public.profiles set full_name = full_name || ' / DESATIVADO'
where email in ('...') and coalesce(full_name,'') not like '%/ DESATIVADO';

-- 3) Encerra sessões
delete from auth.sessions where user_id in (select id from auth.users where email in ('...'));
```
- **Nunca** deletar de `auth.users` os que têm dados (perde atribuição / risco de cascade apagar leads).
- Reverter: `banned_until = null` + `replace(full_name, ' / DESATIVADO', '')`.

---

## 3. Publicação (EAS Update / OTA) & Git

- Distribuição: **EAS Update** no canal **production** — `npm run update:prod "msg"`. O app no ar = o **working tree local** empacotado (não o `origin/main`).
- **REGRA:** antes de `eas update`, sempre `git fetch` e **rebasear/atualizar contra `origin/main`** — a pasta local veio de um ZIP e já ficou atrás do time uma vez, revertendo fixes deles no app.
- OTA aplica no **boot seguinte** ao download → **reabrir o app 2×** pra pegar a versão nova.
- Git desta pasta conectado como colaborador via credencial folder-scoped (`.git/.git-credentials-local`), sem tocar no keychain global.

---

## 4. HubSpot — onde a lógica vive

- **Escritas primárias** (change_stage, update, create_pin, create_note, get_stages, **create_task/create_meeting**) → edge **`hubspot-sync`** (fala direto com a API). n8n é só **fallback**.
- **Entrada de leads** (HubSpot → app) → edges `hubspot-lead-webhook` / `-latlong`.
- **Regra de gerar tarefa** (`agendar_demo`, SLAs) é **server-side** (função Postgres `generate_client_tasks()` + cron a cada 30 min). EAS/app **não** afeta isso.
- `export-report` (botão "Exportar TUDO" do gestor) valida por **lista fixa de e-mails** (`GESTOR_EMAILS`), não pelo `role`. Acesso à aba Gestor = `profiles.role = 'gestor'`.

---

## 5. Mapa de calor de visitas (gestor)

Camada opcional sobre o **mapa principal**, só para o gestor: densidade de check-ins (`client_visits`) por área. Botão **🔥** (acima do FAB); painel embaixo com legenda + filtro **Todos / um vendedor**.

- **Por que `<Circle>` e não `<Heatmap>`:** o `<Heatmap>` nativo do `react-native-maps` **só funciona com Google Maps**. O app usa **Apple Maps no iOS** (não setamos `PROVIDER_GOOGLE`), então o Heatmap nativo não renderiza. Solução: agregar as visitas numa **grade** (~180m/célula) e desenhar um `<Circle>` translúcido por célula (cor/raio pela contagem) — funciona igual em Apple e Google Maps. É o mesmo caminho do `<Polyline>` das rotas (renderiza como filho não-marker do map-clustering).
- **Dados:** cada visita já grava GPS (`visited_at_lat/lon`) + quem (`visited_by`/`visited_by_name`); RLS de `client_visits` é `SELECT USING(true)`. A busca é **paginada** (contorna o teto de 1000 linhas do PostgREST), **só dispara quando o gestor liga** o calor, com teto de segurança (8k pontos / 300 círculos, priorizando as áreas mais quentes → mostra "(amostra recente)" se atingir).
- Arquivos: `src/utils/heatmap.ts` (grade + escala de cor, puro), `src/hooks/useVisitsHeatmap.ts` (busca + vendedores derivados), `App.tsx` (toggle 🔥, painel, `<Circle>` no mapa).

---

## 6. Avanço de funil — livre até Demo/Proposta

Regra de progressão de etapa no [ChangeStageModal](../src/screens/ChangeStageModal.tsx).

- **Antes:** "1 etapa por vez" até o fim do funil — pra chegar em Demo/Proposta o vendedor passava por Visita e Conversa uma de cada vez (lento).
- **Agora (2026-08):** **avanço livre até Demo/Proposta** — lead antes de Demo pode pular direto pra Visita, Conversa **ou** Demo numa tacada. **De Demo/Proposta em diante volta a ser 1 por vez**, porque Negociação/Ag. Pagamento/Onboarding têm campos obrigatórios (MRR, CNPJ, pagamento) que não devem ser pulados.
- Teto do "pulo" fica na constante **`FREE_ADVANCE_MAX_STAGE_ID`** (= Demo/Proposta) em [stages.ts](../src/constants/stages.ts) — mudar só esse id reposiciona o limite.
- Negócio Perdido continua sempre disponível; laterais (Backlog/Reciclagem) não são destino (lead nelas reentra pelo funil).
- **Não confundir com o GPS da visita:** marcar como visitado continua sendo o check-in `mark_client_as_visited` (com validação de localização). Isso é independente do avanço manual de etapa — o campo aqui só destrava a *escolha* de etapa no modal.

---

## 7. Rota do dia (3 obrigatórias + 3 sugeridas)

"Rota do dia" na aba Rota (botão): parte do **GPS do vendedor**, monta **3 visitas obrigatórias 🔒** + completa até 6 com a sugestão inteligente, otimiza (TSP) e salva. Fluxo manual de rota **intacto**. `field_route_stops.mandatory_reason` (`sla`|`relacionamento`|`conta_alvo`) guarda por que a parada é obrigatória.

- **① Relacionamento** — cliente do vendedor, ativo (`hs_situacao ≠ churn`), `hs_qtd_comandas > 1000`, mais próximo/menos visitado. Sem backend novo.
- **② Conta Alvo** — restaurante `nota ≥ 4,5 & > 100 avaliações` a **≤ 2 km** do GPS, ainda não cliente. Edge **`conta-alvo-nearby`** (Serper Maps `/maps`, cache por célula ~1,5 km / 14 d em `target_accounts`). **Materializa como lead** (`clients`, marcador **`conta_alvo_place_id`** — **não** usar `origem`, que tem CHECK; `created_by` = auth uid do vendedor, obrigatório). **Deal no HubSpot só no check-in** (`markAsVisited` dispara `create_pin` quando `conta_alvo_place_id && !id_hubspot`). Pin **roxo + 🎯** no mapa + filtro "Só Conta Alvo". Secret `SERPER_API_KEY`.
- **③ SLA estourado** — regra do MD (`REGRA_SLA_ESTOURADO.md`): `diasParado = hoje − max(entrada na etapa, última atividade humana, criação)`; `breach = diasParado > SLA_etapa` (Prospecção/Visita 5, Conversa 4, Demo 3, Negociação 7, Ag.Pag 2, resto 999). **Isolado** do motor de Tarefas do time. Fonte: edge **`hubspot-activity-sync`** (diário) puxa `hs_lastactivitydate` + `hs_date_entered_<etapa>` → colunas `clients.hs_last_activity_at` / `hs_stage_entered_at`. Pick via RPC **`sla_estourado_candidates(vendedor)`** (mais urgente por `diasParado/SLA`).

Config/deploy: migrations `20260806_route_stop_mandatory_reason`, `20260806_conta_alvo`, `20260806_sla_activity`; edges `conta-alvo-nearby` + `hubspot-activity-sync` (+ cron diário); secrets `SERPER_API_KEY` (rotacionável) e `HUBSPOT_TOKEN(_USAGE)`.
