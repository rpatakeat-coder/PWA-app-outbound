# 09f — Gestor: modal de leads por métrica

**Arquivo:** `src/screens/GestorScreen.tsx` · **Escopo:** só o overlay de drill-down

> Leia `09a` primeiro.

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

## O que é

Todo número do painel é clicável e abre "quais leads compõem esse dado" — `useMetricLeads` (global ou por vendedor) e `useGestorTasksList` (tarefas). O hook já existe e carrega **sob demanda**; o modal é a superfície dele.

## O que fazer

**O drawer padrão de 480px**, à direita — o mesmo componente da ficha do lead. Um único padrão de painel no sistema.

**Topo** `padding:24px`, borda inferior 1px `--border`:
- Kicker com o contexto: "`{MÉTRICA}` · `{PERÍODO}`" ou "`{MÉTRICA}` · `{VENDEDOR}`" — 11/16/0.5 peso 600 `--text-tertiary` uppercase.
- Título: o número e o rótulo, 18/24 peso 600 — "1.284 leads criados".
- X em botão 40×40 raio 8, hover `--surface-2`.

**Corpo** `flex:1; overflow-y:auto`. Uma linha por `MetricLead`: `padding:12px 16px`, borda inferior 1px `--border`, hover `--surface-2`, `cursor:pointer`.
- Barra 4px da cor do status à esquerda + nome (`empresa || nome`) 14/20/0.1 peso 600 truncado.
- Sublinha 12/16/0.4 `--text-tertiary`: a data da ação (`at`, formatada em pt-BR) e, quando existir, `responsavel_nome`.
- `actor_name` (quem executou a ação) aparece quando é **diferente** do responsável — é a informação que resolve "quem fez o quê" e hoje se perde.
- Métrica **Notas**: mostrar o `note` em 12/16/0.4 `--text-secondary`, no máximo 2 linhas (`-webkit-line-clamp:2`).
- Clicar na linha abre a ficha do lead **empilhada** sobre o drawer, não substituindo.

**Estados**: carregando com skeleton de linha (`--surface-3`, raio 4); vazio com ícone 40px `--text-tertiary` + "Nenhum lead nesse recorte." 14/20/0.25 `--text-secondary`.

**Rodapé** `padding:24px`, borda superior 1px `--border`: contagem "`{n}` leads" 12/16/0.4 `--text-tertiary` à esquerda, e "Baixar lista" text button `#018CCC` à direita, se a exportação por recorte existir. Se não existir, **omita — não implemente agora**.

**Tarefas** (coluna Tarefas do ranking) usam `useGestorTasksList` com `hubspotId` + `status`: mesma casca, linha com o título da tarefa, o lead e a severidade em badge (`severity`), mais `days_in_stage` quando presente.

## Não fazer

- Não pré-carregue todos os drill-downs. O hook é `enabled: enabled && !!params` de propósito — o painel antes baixava 4.7k leads e agregava em JS.
- Não mude a `queryKey` (mesma regra do refetch infinito).
- Não crie um segundo padrão de painel.

## Pronto quando

- [ ] drill-down no drawer padrão de 480px
- [ ] abre de: número do snapshot, card de atividade, célula do ranking, coluna de tarefas
- [ ] `actor_name` visível quando difere do responsável
- [ ] notas mostram o texto, limitado a 2 linhas
- [ ] linha abre a ficha empilhada
- [ ] estados de carregando e vazio
- [ ] carregamento sob demanda preservado; `queryKey` intacta
- [ ] `npm run typecheck` limpo
