# G5 — Agenda

**Arquivo:** `gestao/src/telas/Agenda.tsx` · **Dados:** `gestao/src/dados/agenda.ts`
**Referência visual:** o preview `Cockpit de Gestão - Casca web.dc.html`, aba **Agenda**
**Pergunta que a tela responde:** *A semana está planejada?* — é o subtítulo no header, e o critério para decidir o que fica e o que sai

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

Um título montado em execução (L147) e **"Reuniões da semana · {n}"** (L228). O segundo já traz a contagem no título — mantenha o padrão.

## O que fazer

**Faixa de KPIs** em 4 colunas: reuniões na semana · rotas montadas · dias sem nada · ocupação média. "Dias sem nada" e "rotas montadas" com delta em `--red` quando há buraco — é a resposta direta da pergunta.

**Grade `12fr`**, dois blocos empilhados.

**A semana do time** — grade de **cinco colunas** (seg a sex), gap 8. Coluna: borda 1px `--line`, raio 8, `min-height:150px`, `overflow:hidden`. Cabeçalho `padding:8px 10px`, borda inferior 1px `--line`: dia minúsculo 11/16/0.5 peso 600 uppercase `--ter` sobre o número 18/24 peso 700 `--ink`. **Hoje**: borda `--red`, cabeçalho `--red-soft`, textos `--red`.

Evento dentro da coluna: `padding:6px 8px`, raio 4, **borda esquerda 3px** na cor do tipo, fundo com o tint do tipo no claro e `--panel2` no escuro. Hora 11/16/0.5 peso 700 na cor do tipo, título 11/16/0.4 peso 600 `--ink`.

**Rota `#c8131b` (tint `#FAE8E9`) · Demo `#8B5CF6` (tint `#F1EBFE`) · Interno `#01AFFF` (tint `#E6F7FF`).**

Aqui o evento é **agregado** — "13 rotas", "3 demos" —, não um por linha. É a visão do time, não de uma pessoa; 34 reuniões individuais em cinco colunas não cabem.

**Sábado e domingo ficam fora.** Cinco colunas em vez de sete dão 40% mais largura a cada dia, e a pergunta é sobre a semana de trabalho.

**Reuniões da semana · {n}** — lista: nome do lead 14/20/0.1 peso 600, sublinha 12/16/0.4 com **dia, hora, duração e responsável**, badge de estado — **Confirmada** `--green-soft`/`--green` · **A confirmar** `--amber-soft`/`--amber-ink` · **Sem retorno** `--red-soft`/`--red`.

## Não fazer

- Não mexa na consulta de dados nem invente métrica. Se um número do preview não existir no arquivo de `dados/`, **diga qual e pare**.
- Não renomeie tokens.
- Não mexa na navegação por hash nem nas guardas de sessão.
- Não toque em outra tela.

## Ao terminar

Três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer coisa do preview que não existe no código — nomeando o campo**.

E o de sempre: se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
