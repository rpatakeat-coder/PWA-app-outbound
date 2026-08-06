# Decisões de arquitetura & regras operacionais

Documento vivo com as decisões que **não são óbvias pelo código**. Atualizar quando mudar.

---

## 1. Agenda → Google Calendar & HubSpot (demo vs follow up)

Arquitetura **pós-n8n** (o n8n saiu do fluxo de reunião/follow up):

| Ação no app | O que o nosso código faz | HubSpot |
|---|---|---|
| **Demo** (`type = reuniao`) | cria **evento no Google Calendar** via edge **`google-calendar`** (OAuth) | Meeting vem da **sync nativa HubSpot↔Google** (`hs_meeting_source: BIDIRECTIONAL_SYNC`). **NÃO** criamos Meeting via API (evita duplicar). |
| **Follow up** (`type = follow_up`) | cria **Task** via edge **`hubspot-sync`** (`create_task`) | Task. **Sem** Google, **sem** Meeting. |
| **Reagendar** | demo → `update_event` (move o evento no Google); follow up → `update_task` | acompanha (Meeting via sync; Task direto) |
| **Cancelar** | demo → `delete_event` (apaga o evento no Google); follow up → conclui a Task | Meeting some via sync; Task concluída |

- **Regra:** follow up **NUNCA** vira Meeting; demo **NUNCA** duplica.
- **Por quê follow up não vai pro Google:** qualquer evento no Google vira Meeting pela sync — então follow up fica só como Task.
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
