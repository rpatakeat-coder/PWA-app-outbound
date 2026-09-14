# 02 — Modelo de dados: o contrato `DATA`

Tudo que a tela desenha vem de **um único objeto**, `DATA`, entregue por `/api/dados`
depois do login e já filtrado pelo papel de quem pediu. Este arquivo é o contrato.

## Como o DATA nasce

```
fontes (6 chaves do cockpit_snapshot)
   ↓  scripts/montar-dados.js  →  montarDadosCompletos()
DATA completo (visão do gestor)
   ↓  scripts/montar-dados.js  →  filtrarParaPapel(DATA, usuario)
DATA do papel  →  remove chaves null recursivamente  →  resposta HTTP
```

### As 6 fontes (chaves de `cockpit_snapshot`)

| chave | quem escreve | o que é |
|---|---|---|
| `hubspot` | `fetch-hubspot.js` | a foto do CRM: kpis, funil, leads por etapa, temperatura, agenda, vendas do mês, histórico de etapas, motivos de perda (~880 KB) |
| `hubspot-previous` | `fetch-hubspot.js` | a foto anterior — só para calcular deltas |
| `narrativas` | `generate-weekly-summary.js` | por executivo: nome, praça, gargalo, boa prática, compromissos. **É ela que define quem é o time na tela** |
| `weekly-raw` | `fetch-weekly-comparison.js` | números da semana atual × anterior, ganhos, reuniões, criados |
| `resumo-semanal` | `generate-weekly-summary.js` | o texto da IA: leitura da semana, como agir, análise por pessoa |
| `sync-status` | `fetch-hubspot.js` | o que falhou na última rodada do robô |

> `temSnapshot()` exige **duas**: `hubspot.kpis` **e** `narrativas.reps`. Sem as duas,
> `/api/dados` responde **503 com motivo** — nunca uma tela de zeros.

### Configurações que não vêm do snapshot (arquivos versionados)

`usuarios.json` · `metas.json` · `cadencias.json` · `temperatura.json` ·
`territorios.json` · `leads-referencia.json` · `redes-excluidas.json` ·
`precificacao.json` · `supabase-config.json` · `maptiler-config.json`

## Estrutura do DATA

```js
{
  // ── procedência e frescor ────────────────────────────────────────────
  hubspotUpdatedAtFmt: 'hoje 14h37',   // string pronta para a tela
  hubspotUpdatedAtISO: '2026-09-14T17:37:00Z',  // cru — a tela calcula a idade
  versaoAnalise: '2026-09-08',
  syncStatus: { ultimaExecucao, falhas[] }  // gestor
            | { ultimaExecucao, houveFalha, falhaMinha },  // executivo

  // ── KPIs do time ─────────────────────────────────────────────────────
  kpisHub: { emAberto, leadsCriados, ganhos, perdidos, emReciclagem,
             fechadosNoMes, taxaAvanco, leadsTravados, ... },
  kpiDeltas: { emAberto: {sinal:'up'|'down'|'flat', valor}, ... } | null,
  kpiDetalhe: { leadsCriados: [...], perdidos: [...] },  // cortado por owner p/ rep

  // ── funil ────────────────────────────────────────────────────────────
  funil:      { labels: [], valores: [], cores: [] },
  funilLeads: { '<stageId>': [ lead, ... ] },   // cortado por owner p/ rep
  stageMeta:  { slaDays: {}, descriptions: {}, labels: {} },
  saude:      { nivel: 'ok'|'warn'|'crit', label, detalhe },
  perdidoVisivel:    { desde: '2026-09-01', ... },
  onboardingVisivel: { desde: '2026-09-02', ... },
  leadsReciclagem60: [ lead, ... ],
  opcoesHubspot: { <propriedade>: [ {label, value}, ... ] },

  // ── pessoas ──────────────────────────────────────────────────────────
  reps: [ {
    ownerId, name, praca, tag, tagLabel,
    gargalo, boasPraticas, compromissos,     // ← narrativas (IA)
    open, stages, criticos[], travados[], quentes[], leadsTravados,
    ganhosSemana, ganhosSemanaNomes[], fechadosNoMes,
    metaMensal, metaMrr, metaReceita, patamarMeta,
    visitasHubspotHoje, avancosHubspotHoje, propostasHubspotHoje,
    fechamentosHubspotHoje, avancosHojeNomes[], propostasHojeNomes[]
  } ],
  usuarios: [ { email, role, ownerId, nome, rampStage?, aComecar? } ],
  habitosTime: { porRep{}, benchmark, pessoasMedidas }   // gestor
             | { meu, benchmark, pessoasMedidas },        // executivo (anônimo)

  // ── dinheiro ─────────────────────────────────────────────────────────
  vendasMes: {
    mes: '2026-09', mesLabel: 'setembro/2026',
    totalClientes, totalMrr, totalReceita,
    porRep: [ { ownerId, name, praca, count, mrrTotal, receitaTotal, clientes[] } ],
    ajustadas: [ { nome, contaEm, motivo, ... } ]   // vendas movidas de mês
  },

  // ── priorização ──────────────────────────────────────────────────────
  temperatura: { quentes: [...], frios: [...] },
  temperaturaRegua: { pesos, etapa, valor, recencia, faixas },  // a config, inteira
  cadencias: { cadencias: { <nome>: { rotulo, passos[], encerramento } } },
  cadenciaDiaria: { dias[], porOwner{}, fonte, naoConta, truncado[] },

  // ── semana ───────────────────────────────────────────────────────────
  resumoSemanal: {
    janela, kpisComparativo, resumoGeral, comoAgir[], serieSemanal,
    porRep{}, ganhosSemanaDetalhe[], reunioesSemanaDetalhe[],
    leadsCriadosSemanaDetalhe[], quentesDemoOuNegociacao[],
    snapshotReps{}, ranking[]
  },

  // ── campo ────────────────────────────────────────────────────────────
  agenda: { itens: [ { ... , hubspot_owner_id, lead_owner_id } ] },
  territorios: [ { rep, cidade, bairros[], ... } ],
  territoriosSemDono: [ ... ],          // só gestor
  leadsReferencia: [ { nome, responsaveis[], leads[] } ],
  redesExcluidas: [ ... ],

  // ── análise ──────────────────────────────────────────────────────────
  historicoEtapas: { dias, escada{}, velocidade[], ciclo, agregado, porOwner{} },
  motivosPerda:    { dias, porMotivo{}, porOwner{}, exemplos{} },

  // ── infra ────────────────────────────────────────────────────────────
  supabase: { url, anonKey },   // só no shell público (login)
  maptiler: '<chave>',
  pwa: { deepLink } | ausente,
  shellProtegido: true          // marca que o template deve hidratar via /api/dados
}
```

A resposta HTTP de `/api/dados` embrulha isso:

```js
{
  sessao:      { email, role, ownerId, nome, aComecar },
  procedencia: { fonte: 'supabase'|'supabase-parcial'|'misto'|'arquivo',
                 motivo, chaves: [], atualizadoEm },
  dados:       { ...DATA }
}
```

## Regras do contrato que **não** podem ser afrouxadas

1. **`null` é removido recursivamente** da resposta. Medido: ~50% dos campos de negócio
   vêm `null` do HubSpot. Nenhum ponto do front usa `'campo' in objeto` — campo ausente
   e `null` são tratados igual. Isso corta ~metade do peso das listas grandes.
2. **`metaMensal` usa `!= null`, não `||`.** Zero é falsy; uma pessoa com meta 0
   aparecia com meta 10 na tela. O mesmo vale para qualquer número que pode ser zero
   legitimamente.
3. **A ordem de `reps` é a ordem de `narrativas.reps`** — pódio e seletores dependem dela.
   `filtrarParaPapel` preserva a ordem, substituindo o colega por um resumo.
4. **Toda janela de tempo é rotulada junto do número** ("taxa de avanço · semana",
   "janela: 01–07/08"). Número sem janela foi origem de inconsistência entre telas.

## Cache do snapshot (otimização que vale copiar)

`/api/dados` faz **duas perguntas**: primeiro só a *assinatura*
(`chave + atualizado_em`, algumas centenas de bytes); se for igual à da última chamada
**nesta instância**, reusa o conteúdo já em memória. Diferente, baixa os ~1,2 MB.

Não é TTL de propósito: cache com prazo serve dado velho por definição, e esta rota é o
que a tela mostra depois de "carregando seus dados".
