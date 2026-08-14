# 03 — Integração HubSpot

Toda a leitura acontece em `scripts/fetch-hubspot.js` (1.324 linhas), que roda no GitHub
Actions 3× ao dia e escreve `data/hubspot.json`. É o **único** arquivo que muda sozinho.

## Configuração do pipeline

```js
const PIPELINE_ID = '916011864';

const STAGES = {
  backlog:      '1396007427',
  prospeccao:   '1395880469',
  visita:       '1396005401',
  diagnostico:  '1395880470',   // "Conversa com Decisor"
  demoProposta: '1395880471',
  negociacao:   '1395880472',
  agPagamento:  '1395880473',
  ganho1:       '1396006162',
  ganho2:       '1396006163',
  perdido:      '1396006164',
  reciclagem:   '1398311191'
};

const OPEN_STAGES = [prospeccao, visita, diagnostico, demoProposta, negociacao, agPagamento];
const META_MENSAL_FECHADOS = 80;        // meta do time
const META_MENSAL_POR_EXECUTIVO = 10;   // 8 executivos × 10 = 80
```

### SLA, rank e descrições por etapa

| Etapa | Label | SLA (dias úteis) | Rank | Cor |
|---|---|---|---|---|
| Prospecção | Prospecção | 5 | 1 | `#E8A33D` |
| Visita | Visita | 5 | 2 | `#4A7FC7` |
| Diagnóstico | Conversa com Decisor | 4 | 3 | `#7C6FE0` |
| Demo/Proposta | Demo/Proposta | 3 | 4 | `#2FA88A` |
| Negociação | Negociação | 7 | 5 | `#D9668F` |
| Ag. Pagamento | Ag. Pagamento | 2 | 6 | `#E51A31` |

`STAGE_DESCRIPTIONS` traz uma frase por etapa, usada nos tooltips.
`STAGE_RANK` mede "quão avançado" o lead está — entra no cálculo de temperatura.

### Executivos

`REPS` é uma lista `{ ownerId, name }` que precisa bater com `data/narrativas.json` e
`data/usuarios.json`. Owner id é o **HubSpot owner id**.

---

## Regras de cálculo que você precisa copiar exatamente

### 1. Fuso horário — America/Sao_Paulo, sempre

```js
function agoraBrasilia()  { return new Date(Date.now() - 3*60*60*1000); }
function hojeISOBrasilia(){ return agoraBrasilia().toISOString().slice(0,10); }
```

**Bug real corrigido**: usar `getUTCFullYear/Month/Date` direto significa data em UTC. Entre
21h e 23h59 de Brasília o UTC já virou o dia seguinte — a janela de busca ficava invertida
(início depois do fim) e a API sempre voltava vazio. Visitas e avanços do dia sumiam.

**Início da semana** = segunda 00:00 Brasília = `Date.UTC(y, m, d - diasDesdeSegunda, 3, 0, 0)`.
Semana é **civil (segunda a agora)**, nunca rolante de 7 dias — rolante numa quinta inclui a
quinta/sexta da semana passada: número certo com rótulo errado.

### 2. "Dias parado" — só dias úteis, e nunca por `hs_lastmodifieddate`

```js
function daysInCurrentStage(properties) {
  const entered  = properties[`hs_v2_date_entered_${properties.dealstage}`];
  const lastAct  = properties.notes_last_updated;
  const created  = properties.createdate;
  return diasUteisEntre(Math.max(entered, lastAct, created), Date.now());
}
```

**NÃO use `hs_lastmodifieddate`.** Ele muda em qualquer alteração de propriedade, inclusive
updates automáticos do próprio HubSpot (reindexação, sync, bulk update) — que podem tocar
*todos* os negócios do portal ao mesmo tempo. Isso zerava o "dias parado" de todo mundo de
uma vez: negócio parado há 13 dias aparecia como "0 dias". `notes_last_updated` só muda quando
uma pessoa loga uma interação de verdade.

`diasUteisEntre()` pula sábado e domingo — fim de semana não empurra lead para SLA estourado.

### 3. SLA e temperatura

```js
slaBreach = dias > (SLA_DAYS[stageId] || 999)
slaRatio  = Math.round(dias / SLA_DAYS[stageId] * 100)   // 200 = 2× o prazo
temperatura: quente = rank alto E dentro do prazo · frio = rank baixo OU estourado
```

### 4. Filtros de higiene

- `isTestDeal(dealname)` — descarta negócios de teste por padrão de nome.
- `isExcludedDeal(deal)` — descarta negócios fora do escopo do time.

### 5. Rate limit

`hsSearch()` faz retry com backoff. O HubSpot limita chamadas **por segundo** — toda chamada
passa por `sleep()` + retry, e as buscas grandes são paginadas (`hsSearchAll`,
`hsSearchTipoAll`).

---

## Propriedades lidas por objeto

**Deals** (`crm/v3/objects/deals/search`):
```
dealname, dealstage, pipeline, hubspot_owner_id, createdate, closedate, amount,
notes_last_updated, notes_next_activity_date, hs_lastmodifieddate,
hs_next_meeting_start_time, hs_v2_date_entered_<stageId>,
valor_de_mrr, data_da_reuniao, reuniao_agendada,
latitude, longitude, cep, bairro, cidade, logradouro, numero
```
> `valor_de_mrr`, `data_da_reuniao`, `reuniao_agendada`, `latitude`, `longitude` são
> **propriedades customizadas** — confira que existem no portal antes de replicar.

**Meetings**: `hs_meeting_title, hs_meeting_body, hs_meeting_start_time, hs_meeting_end_time,
hs_meeting_location, hs_meeting_outcome, hubspot_owner_id, hs_object_id, hs_createdate,
hs_lastmodifieddate`

**Tasks**: `hs_task_subject, hs_task_body, hs_task_status, hs_task_type, hs_timestamp,
hubspot_owner_id`

**Notes**: `hs_note_body, hs_timestamp, hubspot_owner_id, hs_createdate`

---

## As consultas (o que o script busca)

| Função | O que faz |
|---|---|
| `stageTotal(stageId, extras)` | Contagem total por etapa (paginada). |
| `createdLast7Days()` | Leads criados na semana civil corrente. |
| `stageTotalLast7Days(stages)` | Ganhos/perdidos da semana. |
| `stageTotalThisMonth(stages)` | Fechados no mês. |
| `stageTotalThisMonthByOwner(stages, ownerId)` | Fechados no mês, por executivo. |
| `stageDealsLast7DaysComNomes(stages)` | Ganhos da semana **com os nomes** dos clientes. |
| `stageDealsHojeByOwner(stages, ownerId, dia)` | Avanços/propostas/fechamentos **de hoje**, com nomes. |
| `repOpenDeals(ownerId)` | Funil aberto completo do executivo (abertos, travados, quentes, críticos). |
| `stageDealsTeamWide(stageId)` | Leads de uma etapa, para o modal do funil. |
| `vendasDoMesDetalhe()` | Fechados do mês com `valor_de_mrr` e `closedate`. |
| `buscarNotasDoLead(dealId, 2)` | As 2 últimas anotações de cada lead. |
| `fetchAgenda()` | Meetings + tasks + notes da semana. |
| `enriquecerAgendaComNegocio(itens)` | Resolve o **negócio associado** de cada atividade → `lead_owner_id`. Essencial para o filtro por papel da agenda. |
| `visitasTarefasHojeByOwner(ownerId, dia)` | Conta tarefas no padrão `"Visita - <nome>"`. |
| `hsAssociacoesEmLote` / `hsNegociosEmLote` | Batch de associações e de negócios (evita N+1). |

---

## Saída: `data/hubspot.json`

```jsonc
{
  "updatedAt": "2026-08-14T08:02:13.879Z",
  "kpis": {
    "leadsCriados": 0, "ganhos": 0, "perdidos": 0, "emAberto": 0,
    "emReciclagem": 0, "leadsTravados": 0, "fechadosNoMes": 0,
    "metaMensalFechados": 80,
    "taxaAvanco": 0            // % = avancaramSemana / emAberto
  },
  "kpiDetalhe": {
    "leadsCriados": [{ "nome": "...", "ownerId": "..." }],
    "perdidos":     [{ "nome": "...", "ownerId": "..." }]
  },
  "funil": {
    "labels":  ["Backlog","Prospecção","Visita","Conversa com Decisor","Demo/Proposta",
                "Negociação","Ag. Pagamento","Fechado/Onboarding","Perdido","Reciclagem"],
    "valores": [0,0,0,0,0,0,0,0,0,0],
    "cores":   ["#6B7280","#E8A33D","#4A7FC7","#7C6FE0","#2FA88A",
                "#D9668F","#E51A31","#1FA35C","#8C1220","#8B92A3"]
  },
  "temperatura": { "quentes": [Lead], "frios": [Lead] },
  "stageMeta": { "slaDays": {}, "descriptions": {}, "labels": {} },
  "funilLeads": { "<stageId>": [Lead] },
  "vendasMes":  [{ "id","nome","ownerId","mrr","closedate" }],
  "reps": { "<ownerId>": Rep },
  "agenda": { "geradoEm": "ISO", "itens": [ItemAgenda] }
}
```

### `Lead`
```jsonc
{ "name": "Bank Burguer", "id": "63044846506",
  "stage": "Ag. Pagamento", "stageId": "1395880473",
  "dias": 1, "slaBreach": false, "slaRatio": 50, "rank": 6,
  "temperatura": "quente",
  "proximaReuniao": null, "proximaAtividade": null,
  "ultimaInteracao": "2026-08-12T20:00:19.747Z",
  "valor": 279, "vendedor": "Nome", "ownerId": "94079973",
  "lat": -22.92, "lng": -43.4, "cep": "...", "bairro": null,
  "cidade": "Rio de Janeiro", "logradouro": "...", "numero": "770" }
```

### `Rep` (por `ownerId`)
```jsonc
{ "name": "Marco Filho",
  "open": 12,
  "stages": { "<stageId>": 5 },
  "criticos": [Lead], "travados": [Lead], "quentes": [Lead], "plotaveis": [Lead],
  "leadsTravados": 7,
  "ganhosSemana": 0, "ganhosSemanaNomes": [],
  "avancosHojeNomes": [], "propostasHojeNomes": [],
  "fechadosNoMes": 3, "metaMensal": 10,
  "visitasHubspotHoje": 0, "avancosHubspotHoje": 0,
  "propostasHubspotHoje": 0, "fechamentosHubspotHoje": 0 }
```

### `ItemAgenda`
Propriedades cruas do HubSpot + os campos adicionados pelo enriquecimento:
```jsonc
{ "hs_object_id": "114559978104", "hubspot_owner_id": "86100506",
  "hs_meeting_title": "DAILY OUTBOUND",
  "hs_meeting_start_time": "2026-08-11T12:00:00Z",
  "hs_meeting_end_time":   "2026-08-11T13:00:00Z",
  "hs_createdate": "...", "hs_lastmodifieddate": "...",
  "lead_owner_id": "86100506",   // ← adicionado por enriquecerAgendaComNegocio
  "lead_nome": "..." }
```

### Efeitos colaterais do mesmo script

1. **`data/hubspot-previous.json`** — antes de sobrescrever, guarda `{ updatedAt, kpis }` do
   arquivo anterior. É o que gera as setas ▲▼ "vs. última atualização" (`kpiDeltas` em
   `montar-dados.js`). Guarda só os KPIs, não o dump inteiro.
2. **Snapshot da Daily no Supabase** — `gravarSnapshotDailyVerificado()` grava
   `realizado_visitas/avancos/propostas/fechamentos` na tabela `dailies` para **hoje e ontem**
   a cada rodada (a rodada das 08:59 também refecha o dia anterior, como segurança).
   Faz **conferência pós-escrita**: relê a linha e compara. Divergiu → registra em
   `falhasSyncDaily`.
3. **`data/sync-status.json`** — `{ ultimaExecucao, totalExecutivos, falhas: [] }`.
   "0 falhas" também é informação: confirma que a rodada rodou limpa, em vez de o gestor só
   descobrir o problema quando alguém reclama.

---

## Escritas no HubSpot (só via `/api/*`, nunca do navegador)

| Rota | O que escreve |
|---|---|
| `atualizar-mrr` | `valor_de_mrr` de um deal. |
| `criar-negocio` | Deal novo no pipeline, a partir de um lead de referência. |
| `criar-empresa-prospeccao` | **Company** a partir de um lead da fila de prospecção. |
| `criar-tarefa-rota` **[ROTA]** | Task `"Visita - <nome>"`. |
| `confirmar-sugestao-gestor` | Confirma um compromisso sugerido pelo gestor. |

Detalhes em `05-APIS-SERVERLESS.md`.

## Scripts auxiliares que também leem o HubSpot

- **`fetch-weekly-comparison.js`** → `data/weekly-raw.json`: janela da semana,
  `kpisComparativo` (atual × anterior), `ganhosSemanaDetalhe`, `reunioesSemanaDetalhe`,
  `quentesDemoOuNegociacao`, `snapshotReps` (funil completo de cada executivo — usado pela
  visão por praça e pelos deltas por etapa).
- **`fetch-clientes-ativos.js`** → `data/clientes-ativos.json`: clientes Takeat já ativos.
  Filtra quem tem churn confirmado (`sugerirVisita !== false`). **[ROTA]** — só serve para
  sugerir parada de relacionamento; pode sair do escopo.
- **`backfill-dailies-semana.js`** — roda **manualmente, uma vez**: recalcula os últimos 7
  dias direto do HubSpot e regrava na tabela `dailies`. Útil quando o cron falhou por dias.
