# Um plano só · Fase 0 (auditoria), 06/10/2026

## 1. As três fontes da Agenda

| Fonte | Onde é lida | Filtro |
|---|---|---|
| **Paradas da rota** (`field_routes` + `field_route_stops`), espelhadas com a grade do Cockpit (`planos_semanais`) pela 0150 nos dois sentidos | `src/utils/paradaDoDia.ts` (porNoDia, tirarDoDia, gravarOrdemDoDia); propósito do dia em `src/utils/semanaDoPlano.ts:42` (lerSemanaDoPlano) | status `planned`/`done`; grade de seg a sex com 15 faixas |
| **Agenda do app** (`client_meetings`, o Agendar do pino) | `src/hooks/useMeetings.ts:48`; vira compromisso em `src/utils/agendaNovo.ts:84` (compromissosDoDia) | sem cancelada; dia em Brasília |
| **HubSpot** (tarefas e reuniões abertas) | as tarefas da fila, em `src/utils/agendaNovo.ts:84` | dia do vencimento |

**Telas que usam:**
- `AgendaPC.tsx:342-343`: noPlano = client_id das paradas;
- `AgendaNovoScreen.tsx` (celular): as mesmas funções.

## 2. A duplicação (dado real de 07/10)
`compromissosDoDia` só esconde o compromisso cujo **client_id** já é parada.
- **Mada Restaurante:** a parada 7 é o cadastro "Cliente Takeat · Niterói", e a reunião da Agenda do app aponta para outro cadastro do mesmo restaurante. Os client_id são diferentes, então aparece duas vezes.
- **Armazém da Redenção:** o follow-up vem do HubSpot ligado ao negócio. O cadastro da tarefa não é o da parada, então aparece duas vezes.
- **Agravante:** tarefa do HubSpot só é escondida quando é do tipo "visita" (`agendaNovo.ts:92`). Reunião e retorno nunca são escondidos.

## 3. O gatilho (`tg_agendado_no_plano`, 0133)
- **Só a Reunião entra no plano:** `new.type is distinct from 'follow_up'`.
- **Nos últimos 30 dias:** 20 follow-ups `agendada` ficaram fora do plano (1 futuro).
- **Reuniões:** os 10 agendamentos ativos para 07/10 estão no plano; o cancelado saiu.

## 4. `client_meetings.type`
- **Medido nos últimos 30 dias:** 99 linhas, 79 `reuniao` (1 cancelada) e 20 `follow_up`. A check aceita só esses dois.
- **Quem lê `type`:**
  - `useMeetings` (filtro do modal);
  - `agendaNovo.ts` (reunião × retorno);
  - o gatilho 0133;
  - a sincronização com o HubSpot.

## 5. Proposta (aplicada na 0175)
- **`field_route_stops.acao` e `client_meetings.acao`:** com os 7 valores da tabela §2.1 (`prosp`, `follow`, `reuniao`, `demo`, `ligar`, `cobrar`, `rel`).
  - backfill de `client_meetings`: `reuniao` → `reuniao`, `follow_up` → `follow`;
  - `type` continua, sem mudança, para quem já lê.
- **`plano_proposito(acao, conta_alvo)`:** o propósito da grade, numa função só:
  - `prosp` → conta nova (conta-alvo) ou rua;
  - `follow` e `ligar` → follow;
  - `reuniao` e `demo` → funil;
  - `cobrar` → cobrar;
  - `rel` → relac.
- **`espelhar_parada_no_plano`:** grava na faixa o `a` (o chip), o `p` (o propósito) e a `hora` do cadeado.
  - Parada que já estava na grade tem o `a`, o `p` e a `hora` atualizados, sem nova faixa.
  - Novo gatilho `parada_acao_no_plano`, para quando muda o `acao` ou o cadeado.
- **`tg_agendado_no_plano`:** põe no plano todos os tipos, menos `ligar`, que não é parada de rua.
- **`itens_do_plano` e `rotas_da_semana`:** devolvem `acao` (o chip), para o Planejamento e a Rua › Rotas mostrarem o mesmo rótulo.
- **Casamento compromisso ↔ parada:** uma função só no app (`src/utils/casamento.ts`), na ordem:
  1. negócio (id do HubSpot);
  2. nome normalizado no mesmo bairro;
  3. cadastro.

## 6. Riscos
- **`rotas_da_semana` muda de assinatura** (drop + create na mesma transação). O Cockpit lê as colunas pelo nome.
- **`planejamento_do_time` e `dossie_de_campo`** fazem `select *` de `itens_do_plano` e usam as colunas pelo nome: a coluna a mais não quebra.
- **Follow-up passa a virar parada.** O único futuro hoje entra na grade do dia dele.
- **O executivo também planeja pelo Cockpit** (Julyan, 06/10). A faixa posta no Cockpit continua sendo do Cockpit:
  - o app só mexe na faixa que ele mesmo pôs (`origem = 'app'`), e a do Cockpit vem sem `origem`;
  - o selo "do mapa" ou "do Cockpit" sai desse campo.
