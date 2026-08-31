# M8 — Filtros de leads (prompt único, mobile)

**Arquivos:** `App.tsx` — modal de filtros ~L5359–5715 · chips ~L4324–4400 · estado ~L565–600 · `activeFilterCount` ~L1258 · `styles.filtersSheet` ~L7490 · `styles.filterIconButton` ~L7461
**Alvo visual:** `design_handoff_mobile_pwa/M8 - Filtros de leads.dc.html` — quadro **1a** (nível 1 no Mapa), **1b** (sheet de tela cheia), **1c** (vazio por filtro). Abra no browser e bata o resultado contra eles.
**Referência escrita:** `prompts-modais/M4-filtros.md` (cobre mobile + desktop; **este prompt é só o mobile**)

> `M0`–`M6` já rodaram; `M3b` corrige a Rota. **Só os filtros.** Não mexa no mapa, na lista, na ficha nem em outro overlay. Se achar problema fora do escopo, anote e siga.

**Tokens mobile:** chip 36 pill · campo/linha de opção 48 / `min-height:56` raio 16 · botão 48 raio 12 · card raio 16 · spacing ≤ 24 (+32 de rodapé) · alvo ≥ 48 · maior tipo 18/24.

---

## O problema

Sete filtros em três lugares que não conversam: `statusFilter` (chips full-bleed), `tempFilter` (grade colorida no modal), `stageFilter` e `stateFilter` (dropdowns que abrem um **segundo overlay** — `isPickingStage`, `isPickingUf`), `visitFilter`, `vendorFilterHubspotId`, `contaAlvoOnly` — mais `showOnlyMyArea`, que **não é filtro**: os sete recortam o que já foi carregado, esse decide o que a query busca (`bounds: showOnlyMyArea ? activeBounds : null`).

Três consequências: duas camadas para escolher um valor de lista; `activeFilterCount` diz *quantos* e nunca *quais*; e "Limpar tudo" desliga o escopo, fazendo a query varrer o país.

---

## Fase 1 · Inventário — sem editar nada

1. Confirmar onde cada um dos oito estados é lido e escrito, com a linha.
2. Confirmar que `matchesVisitFilter` aceita as strings `'never'`, `'visited'`, `'visited:N'`, `'not_visited:N'` — e **listar os valores realmente usados hoje** na UI.
3. Listar os dois `useEffect` que zeram `stateFilter` / `stageFilter` quando o valor sai de `availableStates` / `availableStages`.
4. Dizer se `clientsForCount` existe e o que ele já calcula.
5. Dizer quantas etapas `availableStages` devolve na prática e quantas UFs `availableStates` devolve.

Entregue isso **antes** da fase 2, na mesma resposta.

---

## Fase 2 · Aplicar

### A · Nível 1 — sempre visível (quadro 1a)

Faixa `padding:12px 16px`, fundo `--surface`, borda inferior 1px `--border`, `overflow-x:auto`, gap 8. Nela: o **botão de funil** (48×36 pill, borda 1px `--stroke-default`, badge 18px pill `#C8131B` 11/18 peso 700) ancorado à esquerda, seguido dos **chips de temperatura**.

- Chip: altura **36**, `padding:0 14px`, raio pill, borda 1px, dot 8px + rótulo 12/16/0.5 peso 600, `flex:0 0 auto`, `white-space:nowrap`. Ativo `--tint-red` / borda `#C8131B` / texto `--tint-red-text`; inativo `--surface` / `--stroke-default` / `--text-muted`.
- Cores literais de `TEMP_COLORS`, **não invertem no escuro**: Quente `#C8131B` · Morno `#FFB32F` · Frio `#0ea5e9` · Fechado `#16a34a` · Perdido `#475569` · Conta Alvo `#7c3aed`.
- **Sem contagem no rótulo** — em 390px não cabe. A contagem por chip é só desktop.
- **A legenda de temperatura sobre o mapa sai** (`styles.tempLegend`): os chips ensinam as cores e o mapa recupera ~um quarto da altura. Informação duplicada, não as duas.

**Segmented de status** (Leads / Clientes / Ex-clientes) fica no header, altura 40, raio 12 **só nas pontas**, 12/16/0.5 peso 600, `flex:1` cada; selecionado `#C8131B`/branco.

### B · Chips removíveis substituem o contador solto

Faixa própria abaixo do nível 1, só quando houver filtro do nível 2 ativo: altura **32**, `padding:0 4px 0 12px`, raio pill, fundo `--surface-2`, borda 1px `--border`. Rótulo 12/16/0.5 peso 600 `--text-muted` + `IconClose` 16px cujo **alvo tem 48px** (a área excede a caixa visual via `padding` / `hitSlop` — o chip é pequeno, o toque não).

Rótulo **legível, nunca o valor cru**: `stageFilter:'Negociação'` → "Etapa: Negociação" · `visitFilter:'not_visited:30'` → "Sem visita há 30+ dias" · `vendorFilterHubspotId` → "Meus leads" · `stateFilter:'ES'` → "ES". Com 2 ou mais, um chip **"Limpar tudo"** ao fim.

O badge do funil continua: **o badge diz quantos, os chips dizem quais.**

### C · Sheet de tela cheia (quadro 1b)

Header `padding:12px 16px` no fundo do tema: `arrow_back` 48×48 raio 12 `rgba(255,255,255,.18)` + "Filtros" 18/24 peso 600 e a contagem de ativos na sublinha 12/16/0.4. Corpo `flex:1; overflow-y:auto; padding:16px 16px 32px`, coluna gap **24**. Cabeçalho de grupo 12/16/0.5 peso 700 `--text-muted` uppercase, `margin-bottom:12px`.

**`isPickingUf` e `isPickingStage` deixam de existir** — não os reestilize, apague. Etapa e UF viram listas inline.

1. **Etapa** — linha `min-height:56px`, `padding:0 16px`, raio 16, borda 1px; dot 10px da cor da etapa (**de `stages.ts`**) + rótulo 16/24/0.15 peso 600 + `IconCheck` 20px `--tint-red-text` quando selecionada. Primeira linha "Todas as etapas". **Mostre 5 linhas + um "Ver as {n} etapas"** (text button de 48px): oito linhas de 56px empurram UF para fora da primeira dobra. Se a lista já vier selecionada, a etapa ativa entra entre as 5 visíveis.
2. **UF** — mesma anatomia, primeira linha "Todos os estados", contagem à direita 12/16/0.4 `tabular-nums`. Lista de `availableStates` — **preserve o `useEffect` que zera o filtro quando o UF selecionado desaparece**, senão o app trava num recorte que não casa com nada. Com mais de 8 UFs, campo de busca 48px raio 16 acima da lista.
3. **Última visita** — chips na anatomia do nível 1: Qualquer · Nunca visitado · Visitado · Últimos 7 dias · Últimos 30 · Sem visita há 30+ · Sem visita há 60+. **Não mude o formato das strings** que `matchesVisitFilter` interpreta.
4. **Responsável** (só gestor) — segmented "Todos / Meus leads", altura 48, raio 12 nas pontas. **Mantenha a restrição**: não-gestor só seta o próprio `id_hubspot`.
5. **Conta Alvo** — card raio 16 `padding:16px`: título 14/20/0.1 peso 600 + explicação 12/16/0.4 `--text-faint` ("Só os leads materializados pela Rota do dia.") + switch 44×24 pill, trilha `--stroke-default` → `#C8131B`, botão 20px branco com `0 1px 2px rgba(0,0,0,.3)`.

**Rodapé fixo:** `padding:16px 16px 32px`, borda superior 1px `--border`, fundo `--surface` — "Limpar filtros" como text button de 48px acima, e **"Ver {n} leads"** (48px, raio 12, `#C8131B`, largura total) abaixo. O `{n}` é o **resultado real dos filtros pendentes** — é o que evita aplicar um recorte e descobrir que zerou. Reaproveite `clientsForCount`; se ele não servir para isso, diga e proponha antes de escrever query nova.

### D · `showOnlyMyArea` sai dos filtros

Vai para o **controle de escopo do mapa**, junto do botão de recentrar no topo esquerdo: rótulo "Só minha área" 14/20/0.1 peso 600 + explicação 12/16/0.4 "Carrega apenas os leads da região visível no mapa.", em card raio 12 `--surface` com borda 1px `--stroke-default`.

**Toda a lógica é preservada, só muda de lugar:** `getShowOnlyMyAreaPref` / `setShowOnlyMyAreaPref`, `waitingForLocation`, `areaPermissionDenied`, o debounce do `boundsContains` e o `enabled` da query. Desligado, aviso 12/16/0.4 `--tint-red-text`: "Buscando em todo o país. Pode ficar lento." GPS negado: manter a mensagem atual, agora ao lado do controle.

**"Limpar tudo" não toca em `showOnlyMyArea`.**

### E · Estados (quadro 1c)

- **Vazio por filtro:** ícone 40px `--text-faint` `margin-bottom:12px`, mensagem 14/20/0.25 `--text-muted` centralizada com a **copy atual** — *"Nenhum cliente encontrado com esses filtros."* — e abaixo um "Limpar filtros" 48px outline `#C8131B`. É a saída que hoje falta.
- **Vazio sem filtro:** manter *"Nenhum {status} encontrado"*.
- **Carregando:** os chips não somem nem viram skeleton — o vendedor precisa trocar o filtro enquanto a lista carrega.

---

## Não mexer

- `matchesVisitFilter` e o formato das strings de `visitFilter`
- `clientsForCount` e a lógica de contagem
- os dois `useEffect` de saneamento de `stateFilter` / `stageFilter`
- `stageTemperature`, `TEMP_COLORS`, `normalizeUf`, `normalizeStage`
- a mecânica de `showOnlyMyArea` (só o lugar muda)
- a restrição de `vendorFilterHubspotId` para não-gestor
- o layout desktop destes controles

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Nível 1 (funil + temperatura) sempre visível; chip 36 pill; sem contagem no rótulo.
2. Segmented de status 40px, raio só nas pontas.
3. **`isPickingUf` e `isPickingStage` não existem mais**; etapa e UF são listas inline de 56px.
4. Etapa com 5 linhas + "Ver as {n} etapas"; cores de `stages.ts`.
5. UF com contagem, busca acima de 8 itens, e o `useEffect` de saneamento intacto.
6. Recência com as strings originais.
7. Responsável só para gestor, com a restrição intacta.
8. Conta Alvo com switch 44×24 e a copy da explicação.
9. Rodapé fixo com "Limpar filtros" + **"Ver {n} leads" com o número real dos filtros pendentes**.
10. Chips removíveis com rótulo legível; X com alvo de 48px; "Limpar tudo" a partir de 2.
11. Badge numérico do funil mantido.
12. `showOnlyMyArea` fora dos filtros, no escopo do mapa, lógica intacta; **"Limpar tudo" não o toca**.
13. Legenda de temperatura sobre o mapa removida.
14. Vazio por filtro com a copy atual **e** "Limpar filtros".
15. Cores de `TEMP_COLORS` e `stages.ts`, sem hex inventado.
16. Alvos ≥ 48; spacing ≤ 24 (+32 do rodapé); maior tipo 18/24; raios só `4 · 12 · 16 · pill`.
17. Desktop inalterado.
18. `npm run typecheck` limpo.

**Conferir em 390×844**, comparar com os quadros 1a/1b/1c do DC, **alternar o tema e repetir no escuro**.

## Ao terminar

A tabela da fase 1, depois três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o campo ou cálculo que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
