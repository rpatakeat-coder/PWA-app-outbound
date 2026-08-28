# 09d — Gestor: ranking de vendedores

**Arquivo:** `src/screens/GestorScreen.tsx` · **Escopo:** só a lista de vendedores

> Leia `09a` primeiro. **Esta é a tarefa de maior impacto da tela.**

---

## Tokens desta tela (não precisa abrir outro arquivo)

| Papel | Variável | Light | Dark |
|---|---|---|---|
Fundo da página | `--bg` | `#F6F6F6` | `#121212` |
Card / painel | `--surface` | `#FFFFFF` | `#1E1E1E` |
Container aninhado, hover de linha, header de tabela | `--surface-2` | `#F6F6F6` | `#262626` |
Trilha de barra, fill | `--surface-3` | `#EDEDED` | `#2A2A2A` |
Texto primário, valores | `--text` | `#222222` | `rgba(255,255,255,.92)` |
Texto secundário | `--text-muted` | `#545454` | `rgba(255,255,255,.64)` |
Texto terciário, rótulos | `--text-faint` | `#7A7A7A` | `rgba(255,255,255,.42)` |
Divisor, borda de card | `--border` | `#EDEDED` | `rgba(255,255,255,.08)` |
Borda de botão outline | `--stroke-default` | `#C6C6C6` | `rgba(255,255,255,.14)` |
Borda de input | `--stroke-strong` | `#7A7A7A` | `rgba(255,255,255,.24)` |
Marca, CTA | — | `#C8131B` | `#C8131B` |
Texto vermelho legível | `--tint-red-text` | `#94090F` | `#E5A1A4` |
Fundo tonal vermelho | `--tint-red` | `#FAE8E9` | `#3A1416` |
Texto verde legível | `--tint-green-text` | `#167532` | `#77BD8B` |
Link, ação secundária | — | `#018CCC` | `#66CFFF` |

**Tipografia** — Poppins. Formato `tamanho/altura/letter-spacing`:
Label Small 11/16/0.5 · Body Small 12/16/0.4 · Label Medium 12/16/0.5 · Body Medium 14/20/0.25 · Label Large 14/20/0.1 · Title Small 16/24/0.15 · Title Medium 18/24/0 · Heading XS 20/28 · Heading Small 24/32 · Heading Medium 28/36.
Números **sempre** com `font-variant-numeric: tabular-nums` e milhares em `toLocaleString('pt-BR')`.

**Espaçamento** 8pt: 4 · 8 · 12 · 16 · 24 · 32 · 40.
**Raio**: 4 (badge, célula, input de tabela) · 8 (**padrão** — card, painel, dropdown) · 12 (botão Large).
**Sombras**: `shadow/01` `0 1px 2px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` · `shadow/02` `0 2px 4px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`.
**Botão Large**: altura 40, `padding:0 16px`, raio 12, tipo 14/20/0.1 peso 600, ícone 24px, gap 8, **rótulo flush-left**.
**Botão Small**: altura 32, `padding:0 12px`, raio 4, tipo 12/16/0.5 peso 600.
**Foco**: `outline: 2px solid #016999; outline-offset: 2px`.
**Alvo tocável no desktop**: 40px.

> `#94090F` e `#167532` dão ~2,6:1 sobre superfície escura — **nunca use o hex como cor de texto**; use `--tint-red-text` / `--tint-green-text`, que já fazem o par no repo. Exceção: texto sobre fundo tonal claro (`#FAE8E9`, `#FFF8EB`, `#EAF7EE`), que são superfícies próprias e não mudam com o tema.

## O problema

Hoje cada vendedor é um bloco com oito tiles de métrica, uma linha de tarefas com dois tiles e um chip de status — cerca de **500px de altura por pessoa**. Com 17 vendedores ativos, são ~8.500px de rolagem, e comparar o #1 com o #7 exige rolar para cima e para baixo lembrando números.

O painel do gestor existe para comparar. Comparação pede tabela.

## O que fazer

Card com `overflow:hidden`, fundo `--surface`, borda 1px `--border`, raio 8, `shadow/02`.

**Cabeçalho** `padding:16px`, borda inferior 1px `--border`, `justify-content:space-between`:
- "Vendedores" 16/24/0.15 peso 700 `--text-primary`; abaixo, "Ordenado por atividade ponderada · clique numa célula para ver os leads" 12/16/0.4 `--text-tertiary`.
- À direita, botão "Ordenar" Small outline com ícone `swap_vert`.

**Grid — idêntico no cabeçalho e nas linhas:**
```
32px minmax(200px,2fr) repeat(6,minmax(76px,1fr)) 96px 88px
gap: 12px
```

**Cabeçalho da tabela**: `padding:12px 16px`, fundo `--surface-2`, borda inferior 1px `--stroke-default`, rótulos 12/16/0.5 peso 700 `--text-secondary`, numéricas à direita. Colunas: **# · Vendedor · Visitados · Criados · Reuniões · Follow-ups · Mudanças · Notas · Tarefas · Ações**.

**Linha**: `padding:12px 16px`, borda inferior 1px `--border`, `align-items:center`, `cursor:pointer`, hover `--surface-2`.

| Coluna | Conteúdo |
|---|---|
**#** | "#1" 12/16/0.5 peso 700 `tabular-nums`. **`#C8131B` nos três primeiros**, `--text-tertiary` no resto |
**Vendedor** | avatar 32px pill com iniciais (12/32/0.5 peso 700) + nome 14/20/0.1 peso 600 truncado sobre "`{sector}` · `{leads_assigned}` leads" 11/16/0.5 `--text-tertiary` truncado. O próprio usuário logado ganha avatar `--tint-red`/`--tint-red-text`; os outros `--surface-2`/`--text-secondary` |
**Visitados** | 14/20 peso 600 `tabular-nums`. **É a única numérica com destaque**: `--text-primary` quando alta, `--text-secondary` no resto — reflete o peso 3× no score |
**Criados · Reuniões · Follow-ups · Mudanças · Notas** | 14/20 peso 600 `--text-secondary` `tabular-nums`, à direita |
**Tarefas** | "`{pending}` / `{done}`" 12/16/0.5 peso 600 `tabular-nums`. **Pendentes ≥ 5 em `--tint-red-text`**; a barra "/" em `--text-disabled` |
**Ações** | barra de 44×6 raio 3 (trilha `--surface-3`, preenchimento proporcional ao maior score — `#C8131B` nos três primeiros, `--stroke-strong` no resto) + o total em 12/16/0.5 peso 600 `--text-tertiary` `tabular-nums` |

**O score é o do hook, não um novo**: `visited*3 + created*2 + meetings_scheduled + follow_ups_scheduled + stage_changes + notes_created`. A ordenação já vem pronta de `useGestorMetrics` — **não reordene no componente**.

**Tarefas** vêm de `useGestorTaskMetrics`, cruzadas por `id_hubspot`. Vendedor sem `id_hubspot` mostra "—" nessa coluna.

**Rodapé** `padding:12px 16px`: "`{n}` vendedores ativos no período · contas de automação (RPA) ficam fora do ranking" 12/16/0.4 `--text-tertiary`, e "Ver todos" como text button `#018CCC` se você limitar a lista.

**Célula clicável**: cada numérica abre o drill-down daquele vendedor naquela métrica — `useMetricLeads` com `sellerId` e a `SellerMetricKey` correspondente. A coluna Vendedor abre `metric:'assigned'` com o `hubspotId`.

## Não fazer

- Não reordene: a ordem vem do hook.
- Não filtre RPA no componente: o hook já faz (`HIDDEN_SELLER_PATTERN`).
- Não pinte cinco colunas com cinco cores. Uma cor por motivo: rank, tarefas em risco, barra de score.
- Não remova o `status_breakdown` da tela sem destino — se hoje ele aparece como chip ("Leads 195"), leve para o drill-down do vendedor.

## Pronto quando

- [ ] uma linha por vendedor; 17 vendedores cabem em ~2 telas, não 8.500px
- [ ] grid idêntico no cabeçalho e nas linhas
- [ ] ordem vinda do hook, sem reordenação local
- [ ] score calculado com a fórmula do hook
- [ ] tarefas cruzadas por `id_hubspot`, com "—" quando ausente
- [ ] pendentes ≥ 5 em `--tint-red-text`
- [ ] cada numérica abre o drill-down do vendedor + métrica
- [ ] `status_breakdown` com destino definido
- [ ] `npm run typecheck` limpo
