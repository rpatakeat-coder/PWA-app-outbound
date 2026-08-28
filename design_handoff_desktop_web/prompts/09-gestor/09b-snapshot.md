# 09b — Gestor: barra de composição da base

**Arquivo:** `src/screens/GestorScreen.tsx` · **Escopo:** só o bloco de snapshot (hoje "Visão geral (snapshot atual)", ~L1034)

> Leia `09a` primeiro. Tarefa única: não toque no ranking, no rail nem nos cards de atividade.

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

## O que existe hoje

Cinco números em cards separados — Total de leads, Leads, Visitados, Clientes, Churn — cada um com uma cor diferente (roxo, azul, verde, vermelho). Nada indica que quatro deles somam o primeiro.

## O que fazer

Um card único: `padding:24px`, fundo `--surface`, borda 1px `--border`, raio 8, `shadow/02`.

**Cabeçalho** (`justify-content:space-between`, `align-items:baseline`, `margin-bottom:16px`):
- Esquerda: "COMPOSIÇÃO DA BASE" 12/16/0.5 peso 700 `--text-secondary` uppercase, e abaixo "Snapshot atual, independente do período" 12/16/0.4 `--text-tertiary`.
- Direita: `total_clients` em 28/36 peso 700 `--text-primary` com `tabular-nums`, e "registros" 11/16/0.5 peso 600 `--text-tertiary`.

**Barra proporcional**: `display:flex; height:32px; border-radius:4px; overflow:hidden`, trilha `--surface-3`. Três segmentos com `width` = percentual sobre `total_clients`:
- Leads `#0ea5e9` · Clientes `#16a34a` · Churn `#475569`
- Dentro de cada segmento, o percentual em 11/16/0.5 peso 700 branco, `padding-left:8px`, `white-space:nowrap`.
- `title` no segmento com "Leads: 1.128 (19%)" para tooltip nativo.
- **Se um segmento fica abaixo de ~8% de largura, esconda o rótulo interno** — ele vaza para o vizinho.

**Legenda clicável** (`margin-top:16px`, `display:flex; gap:24px; flex-wrap:wrap`): cada item é um `<button>` sem borda nem fundo que abre o drill-down (`useMetricLeads` com `metric:'status'`), composto de dot 10px da cor + número 20/28 peso 600 `--text-primary` `tabular-nums` + rótulo 12/16/0.5 peso 600 `--text-tertiary`.

**`total_visited` fica fora da barra**, depois de uma régua vertical de 1px `--border` (`align-self:stretch`): ícone `where_to_vote` 20px `--text-tertiary` + número 20/28 peso 600 + "já visitados". É marca de atividade, não estado da base — somar na barra estaria errado.

**Números em português**: `toLocaleString('pt-BR')` — 5.789, não 5789.

## Não fazer

- Não pinte os números de roxo/azul/verde/vermelho. **Todos em `--text-primary`**; a cor vive no dot e no segmento da barra.
- Não invente um sexto número.
- Não some `total_visited` na barra.

## Pronto quando

- [ ] um card, não cinco
- [ ] a barra mostra as três proporções e elas somam 100%
- [ ] os três números e o "já visitados" abrem o drill-down
- [ ] `total_visited` visualmente separado por régua
- [ ] nenhum número colorido; milhares com separador pt-BR
- [ ] `npm run typecheck` limpo

## Ao terminar

Três linhas: o que mudou, o que ficou fora do escopo, e qualquer valor que não deu para aplicar.
