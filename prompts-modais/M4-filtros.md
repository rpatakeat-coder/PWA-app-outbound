# M4 — Filtros de leads

**Arquivos:** `App.tsx` (modal de filtros ~L5170–5700, chips ~L4325–4400, estado ~L565–600, `activeFilterCount` ~L1258)
**Referência:** `design_handoff_mobile_pwa/README.md` §*1. Mapa / Lista* · `design_handoff_desktop_web/README.md` §*1. Mapa comercial* e §*2. Leads (tabela)*

> Tarefa única: **só os filtros**. Não mexa no mapa, na lista, na tabela nem em outro overlay. Se encontrar algo errado fora do escopo, anote e siga.
>
> **Este prompt cobre as duas plataformas.** Os valores são diferentes — aplique o bloco da plataforma que você está editando:
>
> | | Mobile (< 1024px) | Desktop (≥ 1024px) |
> |---|---|---|
> | Chip | altura **36**, raio pill | altura 32, raio 8 |
> | Campo / dropdown | 48px, raio **16** | 40px, raio 8 |
> | Botão | 48px, raio 12, tipo 16/600 | 40px, raio 12, tipo 14/600 |
> | Linha de opção | `min-height:56px`, raio 16 | altura 40, raio 8 |
> | Spacing | até 24 | até 40 |
> | Forma | sheet de tela cheia | painel ancorado de 352px |

## O problema atual

São **sete filtros** espalhados por três lugares que não conversam:

| Estado | Onde mora hoje |
|---|---|
`statusFilter` | chips full-bleed acima do conteúdo |
`tempFilter` | grade de chips colorida dentro do modal |
`stageFilter` | dropdown que abre um segundo overlay (`isPickingStage`) |
`stateFilter` | dropdown que abre um segundo overlay (`isPickingUf`) |
`visitFilter` | chips de recência dentro do modal |
`vendorFilterHubspotId` | toggle "meus leads" |
`contaAlvoOnly` | toggle |
`showOnlyMyArea` | `Switch` no topo do modal — **não é filtro de conteúdo, é escopo de carregamento** |

Três problemas concretos:

1. **Dropdown dentro de modal** — UF e etapa abrem um segundo overlay sobre o primeiro (`isPickingUf`, `isPickingStage`). Duas camadas para escolher um valor de uma lista.
2. **`activeFilterCount` conta, mas não diz o quê.** O vendedor vê "3" e precisa abrir o modal para descobrir quais.
3. **`showOnlyMyArea` está junto dos filtros** e não é um deles: os outros sete recortam o que já foi carregado; esse decide **o que a query busca**. Misturados, o vendedor desliga o escopo achando que está limpando um filtro, e a query passa a varrer o país.

## Princípio da reorganização

**Dois níveis, não sete controles soltos.**

- **Nível 1 — sempre visível:** os filtros que o vendedor troca a toda hora. **Temperatura** e **status**, como chips. Mais nada.
- **Nível 2 — no painel/sheet:** os que ele ajusta uma vez por semana. Etapa, UF, recência de visita, responsável, Conta Alvo.
- **Fora dos filtros:** `showOnlyMyArea`. Vai para o controle de escopo do mapa (ver seção própria).

## Nível 1 — chips sempre visíveis

**Mobile.** Faixa `padding:12px 16px`, fundo `--surface`, borda inferior 1px `--border`, `overflow-x:auto`, gap 8.

- Chip: altura **36**, `padding:0 14px`, raio pill, borda 1px, dot 8px + rótulo 12/16/0.5 peso 600, `flex:0 0 auto`, `white-space:nowrap`.
- Ativo: fundo `--tint-red`, borda `#C8131B`, texto `--tint-red-text`. Inativo: fundo `--surface`, borda `--stroke-default`, texto `--text-muted`.
- Ordem: **Todos · Quente · Morno · Frio · Conta Alvo** (+ Fechado/Perdido conforme o status ativo).
- **Substitui a legenda de temperatura que ficava sobre o mapa** (`styles.tempLegend`, linhas de 104px em duas colunas): os chips ensinam as cores e o mapa recupera um quarto da altura.

**Desktop.** No **Mapa**, dentro do painel de 352px; na **Lista**, na barra de ferramentas acima da tabela.

- Chip: altura 32, `padding:0 12px`, raio 8, borda 1px `--stroke-default`, dot 10px + rótulo 12/16/0.5 peso 600 + **contagem** no mesmo tamanho peso 500 `--text-faint`.
- Cabeçalho da seção "TEMPERATURA DA ETAPA" 11/16/0.5 peso 600 uppercase `--text-faint`, com **"Limpar"** à direita (12/16/0.5 peso 600 `#018CCC`, sem borda nem fundo).
- A contagem por chip só existe no desktop: em 390px o rótulo com número não cabe sem quebrar.

**Cores da temperatura** (literais de `TEMP_COLORS`, não invertem no escuro): Quente `#C8131B` · Morno `#FFB32F` · Frio `#0ea5e9` · Fechado `#16a34a` · Perdido `#475569` · Conta Alvo `#7c3aed`.

**Segmented de status** (Leads / Clientes / Ex-clientes) fica acima dos chips: altura 40, raio 12 **só nas pontas** (`12px 0 0 12px` / `0` / `0 12px 12px 0`), 12/16/0.5 peso 600, `flex:1` cada. Selecionado `#C8131B`/branco; os outros com borda 1px `--stroke-default`. Máximo 4 segmentos — é a regra do kit.

## Nível 2 — o painel de filtros

**Fim do dropdown-dentro-de-modal.** UF e etapa passam a ser **listas inline no próprio painel**, não um segundo overlay. `isPickingUf` e `isPickingStage` deixam de existir.

**Mobile — sheet de tela cheia.** Overlay opaco `--bg`; header `padding:12px 16px` no fundo do tema com `arrow_back` 48×48 raio 12 + "Filtros" 18/24 peso 600 e a contagem de ativos na sublinha 12/16/0.4. Corpo `flex:1; overflow-y:auto; padding:16px 16px 32px`, coluna gap 24.

**Desktop — o painel de 352px do Mapa**, ou o mesmo conteúdo no drawer padrão de 480px quando aberto da Lista. Não invente um modal centrado.

Cada grupo tem cabeçalho 12/16/0.5 peso 700 `--text-muted` uppercase, `margin-bottom:12px`.

**Etapa** — lista inline. Linha: `min-height:56px` (mobile) / altura 40 (desktop), `padding:0 16px`, raio 16 / 8, borda 1px. Dot 10px da cor da etapa + rótulo 16/24/0.15 peso 600 (mobile) / 14/20/0.1 peso 600 (desktop) + `IconCheck` 16px `--tint-red-text` quando selecionada. Primeira linha é **"Todas as etapas"**. Cores de `stages.ts` — não invente.

**UF** — mesma anatomia. Primeira linha "Todos os estados". A lista vem de `availableStates`, que é **derivada dos leads carregados**: se o UF selecionado desaparece, o `useEffect` atual zera o filtro. **Preserve esse comportamento** — sem ele o app fica preso num filtro que não casa com nada. Com mais de 8 UFs, campo de busca de 48px/40px raio 16/8 acima da lista.

**Última visita** — chips na mesma anatomia do nível 1: Qualquer · Nunca visitado · Visitado · Últimos 7 dias · Últimos 30 · Sem visita há 30+ · Sem visita há 60+. Os valores continuam sendo as strings `'never'`, `'visited'`, `'visited:N'`, `'not_visited:N'` que `matchesVisitFilter` já interpreta — **não mude o formato**.

**Responsável** (só gestor) — segmented "Todos / Meus leads" ou lista de vendedores. Não-gestor só consegue setar o próprio `id_hubspot`; **mantenha a restrição**.

**Conta Alvo** — linha com toggle: título 14/20/0.1 peso 600 + explicação 12/16/0.4 `--text-faint` ("Só os leads materializados pela Rota do dia."). Switch 44×24 pill, trilha `--stroke-default` → `#C8131B`, botão 20px branco com `0 1px 2px rgba(0,0,0,.3)`.

**Rodapé.** Mobile: fixo, `padding:16px 16px 32px`, borda superior 1px `--border`, fundo `--surface` — "Ver N leads" (48px, raio 12, `#C8131B`, largura total) e "Limpar filtros" acima como text button de 48px. Desktop: no fim do painel, "Limpar filtros" text button.

**"Ver N leads" mostra o número real do resultado**, calculado com os filtros pendentes. É o que evita aplicar um recorte e descobrir que zerou.

## O contador: de número a lista

`activeFilterCount` (~L1258) soma sete condições e devolve um número. Substituir por **chips removíveis** entre o nível 1 e o conteúdo, quando houver algum filtro do nível 2 ativo:

- Chip removível: altura 32 (mobile) / 28 (desktop), `padding:0 8px 0 12px`, raio pill, fundo `--surface-2`, borda 1px `--border`. Rótulo 12/16/0.5 peso 600 `--text-muted` + `IconClose` 16px em alvo de **48px no mobile** (o alvo pode exceder a caixa visual via `padding` — o chip é pequeno, o toque não).
- Rótulo legível, não o valor cru: `stageFilter: 'Negociação'` → "Etapa: Negociação"; `visitFilter: 'not_visited:30'` → "Sem visita há 30+ dias"; `vendorFilterHubspotId` → "Meus leads".
- Um chip **"Limpar tudo"** ao fim quando houver 2 ou mais.
- O botão "Filtros" mantém o badge numérico (18px pill `#C8131B`, 11/18 peso 700) — o badge diz *quantos*, os chips dizem *quais*.

## `showOnlyMyArea` sai dos filtros

Não é filtro: os sete recortam o que já foi carregado, esse decide **o que a query busca** (`bounds: showOnlyMyArea ? activeBounds : null`).

- Vai para o **controle de escopo do mapa**: no mobile, junto do botão de recentrar no topo esquerdo; no desktop, no topo do painel de 352px, acima do segmented de status, visualmente separado por uma borda de 1px `--border`.
- Rótulo "Só minha área" com explicação 12/16/0.4: "Carrega apenas os leads da região visível no mapa."
- **Toda a lógica atual é preservada**: `getShowOnlyMyAreaPref` / `setShowOnlyMyAreaPref`, o `waitingForLocation`, o `areaPermissionDenied`, o debounce do `boundsContains` e o `enabled` da query. **Só muda de lugar.**
- Desligado, mostrar um aviso 12/16/0.4 `--tint-red-text`: "Buscando em todo o país. Pode ficar lento."
- Permissão de GPS negada: manter a mensagem atual, agora ao lado do controle.

## Estados

- **Vazio por filtro**: ícone 40px `--text-faint`, `margin-bottom:12px`, mensagem 14/20/0.25 `--text-muted` centralizada. **Copy atual preservada**: *"Nenhum cliente encontrado com esses filtros."* Abaixo, um "Limpar filtros" — é o caminho de saída que hoje falta.
- **Vazio sem filtro**: manter *"Nenhum {status} encontrado"*.
- **Carregando**: os chips não somem nem viram skeleton — o vendedor precisa poder trocar o filtro enquanto a lista carrega.
- **Contagem por chip** (desktop) é recalculada de `clientsForCount`, que aplica todos os filtros **menos** o próprio status. Esse cálculo já existe — não refaça.

## O que não mexer

- `matchesVisitFilter` e o formato das strings de `visitFilter`
- `clientsForCount` e a lógica de contagem
- os dois `useEffect` que zeram `stateFilter`/`stageFilter` quando o valor sai de `availableStates`/`availableStages`
- `stageTemperature` e `TEMP_COLORS`
- `normalizeUf`, `normalizeStage`
- toda a mecânica de `showOnlyMyArea` (só o lugar dela na tela muda)
- a restrição de `vendorFilterHubspotId` para não-gestor

## Armadilhas

- **Dropdown dentro de modal mantido** — `isPickingUf` e `isPickingStage` devem desaparecer, não ser reestilizados.
- **`showOnlyMyArea` deixado entre os filtros** — o "Limpar tudo" passa a desligar o escopo e a query varre o país.
- **"Limpar tudo" resetando `showOnlyMyArea`** mesmo depois de movido. Ele não faz parte do conjunto.
- **Chip de filtro com alvo de 32px no mobile** — precisa de 48px de área tocável, ainda que a caixa visual seja menor.
- **Contagem por chip no mobile** — o rótulo com número não cabe em 390px.
- **Rótulo cru no chip removível** — "not_visited:30" em vez de "Sem visita há 30+ dias".
- **Legenda do mapa mantida** junto com os chips — informação duplicada, e a legenda custa um quarto da altura do mapa.
- **Estado vazio sem saída** — a mensagem aparece e o vendedor não tem como limpar sem reabrir o painel.
- **Cor de etapa inventada** em vez de `stages.ts`.

## Pronto quando

- [ ] nível 1 (temperatura + status) sempre visível; nível 2 no painel/sheet
- [ ] **`isPickingUf` e `isPickingStage` não existem mais** — etapa e UF são listas inline
- [ ] chips removíveis com rótulo legível substituindo o contador numérico solto
- [ ] `showOnlyMyArea` fora dos filtros, no controle de escopo do mapa, com a lógica intacta
- [ ] "Limpar tudo" **não** toca em `showOnlyMyArea`
- [ ] "Ver N leads" com o número real do resultado pendente
- [ ] estado vazio por filtro com a copy atual **e** um "Limpar filtros"
- [ ] alvos de 48px no mobile / 40px no desktop, inclusive o X dos chips removíveis
- [ ] `matchesVisitFilter`, `clientsForCount` e os `useEffect` de saneamento inalterados
- [ ] cores de temperatura e de etapa vindas de `TEMP_COLORS` e `stages.ts`
- [ ] modo escuro conferido
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor da referência que não deu para aplicar e por quê**.
