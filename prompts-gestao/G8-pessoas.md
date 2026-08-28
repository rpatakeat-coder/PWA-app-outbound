# G8 — Pessoas

**Arquivo:** `gestao/src/telas/Pessoas.tsx` · **Dados:** `gestao/src/dados/pessoas.ts`, `gestao/src/dados/equipe.ts`
**Referência visual:** o preview `Cockpit de Gestão - Casca web.dc.html`, aba **Pessoas**
**Pergunta que a tela responde:** *Quem precisa de mim no 1:1?* — é o subtítulo no header, e o critério para decidir o que fica e o que sai

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

## A maior das sete

27 KB. Se não couber numa passada, **faça as três colunas primeiro e pare** — o resto vira `G8b`.

Os três títulos estão no código e já são a estrutura certa: **"Conversar primeiro"** (L496), **"Acompanhar"** (L507), **"Em dia · {n}"** (L518). É triagem, e a ordem é de urgência decrescente.

## O que fazer

**Faixa de KPIs** em 4 colunas: executivos · conversar primeiro · acompanhar · em dia. Os dois do meio com delta em `--red`.

**Grade `4fr 4fr 4fr`, gap 20, `align-items:start`** — as três colunas lado a lado. É o formato que faz a triagem funcionar: você vê os três grupos de uma vez e sabe onde o tempo vai.

**Conversar primeiro** — avatar 28px, nome 14/20/0.1 peso 600, sublinha 12/16/0.4 `--ter` com **o motivo concreto** ("3 dias sem registro · 20% da meta", "conversão caiu 6pp"), badge **1:1** `--red-soft`/`--red`.

O motivo é o que torna a coluna útil: sem ele o gestor abre o 1:1 sem pauta.

**Acompanhar** — mesma anatomia, **sem badge** — o pertencimento à coluna já é o estado.

**Em dia · {n}** — nome, sublinha com o percentual da meta, e o número à direita em `tabular-nums`. Sem badge.

**A contagem no título só na terceira coluna**, como já é no código: as duas primeiras são curtas e se contam de olho; a terceira é longa.

Se a tela tiver hoje um drill-down por pessoa — histórico, notas de 1:1, o `GravadorDeAudio` —, **preserve tudo** e reestilize a casca. Se algo não couber nesta passada, liste no fim.

## Não fazer

- Não mexa na consulta de dados nem invente métrica. Se um número do preview não existir no arquivo de `dados/`, **diga qual e pare**.
- Não renomeie tokens.
- Não mexa na navegação por hash nem nas guardas de sessão.
- Não toque em outra tela.

## Ao terminar

Três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer coisa do preview que não existe no código — nomeando o campo**.

E o de sempre: se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
