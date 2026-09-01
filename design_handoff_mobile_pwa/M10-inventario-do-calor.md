# M10 — inventário do mapa de calor, e por que o módulo não foi feito

Levantamento de 01/09/2026, fase 1 do `handoff-M10/prompts/M10-mapa-de-calor-completo.md`.
O prompt queria transformar o calor num **seletor de quatro camadas no celular**.
A fase 1 mostrou que três das quatro não tinham dado íntegro, e a decisão foi
**remover o calor do mobile** em vez de expandi-lo. O painel do desktop ficou.

Fica registrado porque o que se descobriu vale além do M10.

---

## O que impediu o módulo

### `clients` é carregado por área visível

```
const [showOnlyMyArea, setShowOnlyMyArea] = useState(true);   // App.tsx
bounds: showOnlyMyArea ? activeBounds : null
```

Com o filtro ligado — o padrão — `clients` traz só o retângulo do mapa. As camadas
"densidade de leads", "não visitados" e "clientes fechados" mediriam o **recorte da
tela**, e a mancha mudaria a cada arrasto. É o oposto do que um mapa de calor promete.
Já consta nas armadilhas do `CLAUDE.md`; aqui ela decidiu um módulo inteiro.

### `sector_visibility` esconde `lead` de quase todo mundo

Quem não é `view` só enxerga os status liberados para o setor. Na data do
levantamento, **só `Outbound` e `RPA` tinham `lead`**:

```
Outbound → cliente, churn, lead        RPA → cliente, churn, lead
Geral, Marketing, Suporte, Sucesso,
Onboarding, Setup, Produto, RH,
Tecnologia, Financeiro, Inbound → cliente, churn
```

Um vendedor de setor "Geral" abriria "Densidade de leads" e veria mancha vazia — não
por falta de lead, mas por RLS.

---

## O que foi medido (01/09/2026)

| | |
|---|---|
| Total de `clients` | 5.838 (5.835 com lat/lon) |
| `status = 'lead'` | 1.148 |
| `status = 'cliente'` | 2.869 |
| `status = 'churn'` | 1.821 |
| `status = 'ganho_fs'` | **0** |
| `status = 'ativo'` | **0** — só existe no `STATUS_OPTIONS` hardcoded |
| `won_at` não nulo | **2** |
| `visited_at IS NULL` | **5.283** (90%) |

Consequências: para "clientes fechados", o sinal é `status = 'cliente'` e **não**
`won_at` (que tem 2 linhas). E a camada "não visitados" seria quase idêntica à de
densidade de leads, porque 90% da base nunca foi visitada.

## "Não visitado" não é definido pelas tarefas

O prompt mandava usar "a mesma definição que as tarefas usam". **Não existe**:
`TASK_RULES` tem só `agendar_demo` (etapa sem demo futura) e `sla_etapa` (parado além
do SLA da etapa) — nenhuma olha visita.

A definição do app é o filtro de visita: `'never'` = `visited_at IS NULL`; há também
`not_visited:<N>` (nunca **ou** visitado há mais de N dias).

## `src/utils/heatmap.ts`

`buildHeatCells(points: { lat, lon }[])` **serve para qualquer conjunto de lat/lon** —
não toca em vendedor nem em data. Agrega numa grade de `HEAT_CELL_M = 180`m e corta em
`HEAT_MAX_CIRCLES = 300`, mantendo as células mais quentes.

`heatColor` é **teal** (`#D6F2EC → #1D9688`), não laranja. A escolha é deliberada e está
comentada no arquivo: verde→amarelo→laranja→vermelho é a escala de **temperatura do
funil** (`stages.ts`), e no calor vermelho significaria *muita visita* (bom) enquanto no
pin significa *lead quente*. A mesma paleta dizendo coisas opostas no mesmo mapa.

O prompt pedia rampa laranja para Visitas e, no item 10 da auditoria, "comportamento
idêntico ao de antes" — os dois não podiam valer juntos.

## `src/hooks/useVisitsHeatmap.ts`

| | |
|---|---|
| Busca | `client_visits` com `visited_at_lat/lon` não nulos |
| Cap | `MAX_POINTS = 8000` (`PAGE = 1000`) |
| Janela de tempo | nenhuma — ordena por `visited_at desc`, o cap é o único limite |
| Filtro por vendedor | **não existe no servidor** — a lista de vendedores é derivada dos pontos e o filtro é client-side |

Ou seja: qualquer tela que mostre "só as minhas visitas" recebe os pontos dos colegas
pela rede de qualquer jeito. Se isso virar requisito, precisa de filtro no servidor.
