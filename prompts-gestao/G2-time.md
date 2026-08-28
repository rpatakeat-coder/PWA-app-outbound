# G2 — Time

**Arquivo:** `gestao/src/telas/Cockpit.tsx` · **Dados:** `gestao/src/dados/cockpit.ts`
**Referência visual:** o preview `Cockpit de Gestão - Casca web.dc.html`, aba **Time**
**Pergunta que a tela responde:** *Onde eu ajo hoje?* — é o subtítulo no header, e o critério para decidir o que fica e o que sai

> Rode o `G1-casca-web.md` antes. Este prompt assume a sidebar e o header já no lugar.
>
> Tarefa única: **só esta tela**. Se encontrar algo errado em outra, anote e siga.

---

## Tokens (não precisa abrir outro arquivo)

Os nomes são os do `gestao/src/estilos/tokens.css`. **Não renomeie nada** — as sete telas já os usam.

| Papel | Variável | Light | Dark |
|---|---|---|---|
Fundo da página | `--bg` | `#f6f6f6` | `#121212` |
Cartão | `--panel` | `#ffffff` | `#1e1e1e` |
Container aninhado | `--panel2` | `#f6f6f6` | `#262626` |
Trilha de barra | `--sunk` | `#ededed` | `#2a2a2a` |
Texto primário | `--ink` | `#222222` | `rgba(255,255,255,.92)` |
Texto secundário | `--muted` | `#545454` | `rgba(255,255,255,.64)` |
Texto terciário | `--ter` | `#7A7A7A` | `rgba(255,255,255,.38)` |
Divisor | `--line` | `#ededed` | `rgba(255,255,255,.12)` |
Divisor fraco | `--line-soft` | `#f6f6f6` | `rgba(255,255,255,.08)` |
Borda de botão | `--line-btn` | `#c6c6c6` | `rgba(255,255,255,.16)` |
Marca | `--red` | `#c8131b` | `#e5a1a4` |
Tinta vermelha | `--red-soft` | `#fae8e9` | `#3a1416` |
Positivo | `--green` | `#167532` | `#77bd8b` |
Tinta verde | `--green-soft` | `#eaf7ee` | `#14301d` |
Atenção (texto) | `--amber-ink` | `#99670f` | `#ffd894` |
Tinta âmbar | `--amber-soft` | `#fff8eb` | `#33280f` |

**`--ter` mudou de `#6b6b6b` para `#7A7A7A`** no `G1`, alinhando com o app de campo. Ele passa a ser só para o que **não se lê como frase**: rótulo de eixo, contagem ao lado de um número, caption de 11px. Frase que precisa ser lida usa `--muted`.

**Tipografia** — Poppins, `tamanho/altura/letter-spacing`:
11/16/0.5 (caption, badge) · 12/16/0.4 (metadado) · 12/16/0.5 peso 600 uppercase (`.titulo-secao`) · 14/20/0.25 (corpo, é o `body`) · 14/20/0.1 peso 600 (nome de entidade) · 18/24 peso 700 (número médio) · 22/28 peso 700 (título de tela) · 28/36 peso 700 (KPI).
Números com `font-variant-numeric: tabular-nums` e milhares em `toLocaleString('pt-BR')`.

**Espaçamento** 8pt: 4 · 8 · 12 · 16 · 20 · 24.
**Raio**: 4 (badge, barra, célula) · 8 (**cartão** — mudou de 12 no `G1`) · 9999 (avatar, pill).
**Cartão**: `background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:var(--sombra-card); padding:16px 20px`.
**`.titulo-secao`**: 12/16/0.5 peso 600 uppercase `--muted`, `margin:0 0 12px`.
**Foco**: `outline: 2px solid #016999; outline-offset: 2px`.
**Alvo**: 32px (é ferramenta de mesa, só web, só gestor).

> **Cores fora da tabela.** As de etapa do funil são literais e vêm de `stages.ts`: Prospecção `#0ea5e9` · Visita `#14b8a6` · Conversa com decisor `#8B5CF6` · Demo/Proposta `#FFB32F` · Negociação `#f97316` · Ag. Pagamento `#C8131B` · Negócio Fechado `#16a34a` · Perdido `#475569`. Qualquer outro hex cru é erro.

## O que já existe

Os dois títulos de seção estão no código: **"Funil por etapa"** (L192) e **"Por executivo"** (L253). A estrutura está certa; o que muda é a grade e a densidade.

## O que fazer

**Faixa de KPIs** — `grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px`. Cartão com rótulo 12/16/0.5 peso 600 uppercase `--muted`, valor **28/36 peso 700** `--ink` `tabular-nums`, delta 12/16/0.4 na cor do sinal (`--green` / `--red`).

Use os quatro que o `cockpit.ts` já entrega. Se forem outros que os do preview, **use os reais** — o preview é ilustrativo.

**Grade `7fr 5fr`, gap 20, `align-items:start`:**

**Funil por etapa** (7fr) — uma barra por etapa: rótulo 12/16/0.5 peso 600 `--muted` à esquerda, contagem à direita em `--ter` `tabular-nums`, `margin-bottom:4px`. Barra de **20px** de altura, raio 4, trilha `--sunk`, preenchimento na cor da etapa. Largura proporcional à maior, não ao total — senão as etapas do fim viram fios.

**Por executivo** (5fr) — linha `padding:8px 0`, borda inferior 1px `--line-soft`: avatar 28px pill `--panel2`/`--muted` com iniciais, nome 14/20/0.1 peso 600 `--ink` truncado, número 14/20 peso 600 `--muted` `tabular-nums`, e badge de estado — **Em dia** `--green-soft`/`--green` · **Atenção** `--amber-soft`/`--amber-ink` · **Sem atividade** `--red-soft`/`--red`.

Ordenado por atividade, como já é. Contas de automação fora, se o filtro já existir.

## Não fazer

- Não mexa na consulta de dados nem invente métrica. Se um número do preview não existir no arquivo de `dados/`, **diga qual e pare**.
- Não renomeie tokens.
- Não mexa na navegação por hash nem nas guardas de sessão.
- Não toque em outra tela.

## Ao terminar

Três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer coisa do preview que não existe no código — nomeando o campo**.

E o de sempre: se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
