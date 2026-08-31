# G3 — Daily (prompt único)

**Arquivo:** `gestao/src/telas/Daily.tsx` · **Dados:** `gestao/src/dados/daily.ts`
**Referência visual:** `Cockpit de Gestão - Casca web.dc.html`, aba **Daily** — é o alvo exato.
**Pergunta que a tela responde:** *Quem cumpriu, quem está vazio?* — é o subtítulo do header e o critério para decidir o que fica e o que sai.

> Rode o `G1-casca-web.md` antes: este prompt assume a sidebar e o header no lugar.
> Substitui `G3-daily.md` e `G3b-daily-ajustes.md` — leia só este.
>
> Tarefa única: **só esta aba**. Se encontrar algo errado em outra, anote e siga.

---

## Tokens (não precisa abrir outro arquivo)

Nomes do `gestao/src/estilos/tokens.css`. **Não renomeie nada** — as sete telas já os usam.

| Papel | Variável | Light | Dark |
|---|---|---|---|
Fundo da página | `--bg` | `#f6f6f6` | `#121212` |
Cartão | `--panel` | `#ffffff` | `#1e1e1e` |
Container aninhado | `--panel2` | `#f6f6f6` | `#262626` |
Texto primário | `--ink` | `#222222` | `rgba(255,255,255,.92)` |
Texto secundário | `--muted` | `#545454` | `rgba(255,255,255,.64)` |
Texto terciário | `--ter` | `#7A7A7A` | `rgba(255,255,255,.38)` |
Divisor | `--line` | `#ededed` | `rgba(255,255,255,.12)` |
Divisor fraco | `--line-soft` | `#f6f6f6` | `rgba(255,255,255,.08)` |
Marca | `--red` | `#c8131b` | `#e5a1a4` |
Tinta vermelha | `--red-soft` | `#fae8e9` | `#3a1416` |
Positivo | `--green` | `#167532` | `#77bd8b` |
Atenção (texto) | `--amber-ink` | `#99670f` | `#ffd894` |

**Tipografia** — Poppins, `tamanho/altura/letter-spacing`:
11/16/0.5 peso 600 uppercase (cabeçalho de coluna, rótulo de grupo, iniciais) · 12/16/0.4 (metadado, célula de dia, rodapé) · 12/16/0.5 peso 600 uppercase (`.titulo-secao`) · 14/20/0.25 (corpo) · 14/20/0.1 peso 600 (nome) · 14/20 peso 600 (número de célula) · 22/28 peso 700 (título de tela) · 28/36 peso 700 (KPI).
Todo número com `font-variant-numeric: tabular-nums`; milhares em `toLocaleString('pt-BR')`.

**Espaçamento** 8pt: 4 · 8 · 12 · 16 · 20 · 24. **Raio**: 4 (badge, célula) · 8 (cartão) · 9999 (avatar).
**Cartão**: `background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:var(--sombra-card); padding:16px 20px`.
**`.titulo-secao`**: 12/16/0.5 peso 600 uppercase `--muted`, `margin:0 0 12px`.
**Foco**: `outline:2px solid #016999; outline-offset:2px`. **Alvo**: 32px (ferramenta de mesa, só web, só gestor).

> Cores de etapa do funil, quando aparecerem, são literais e vêm de `stages.ts`. Qualquer outro hex cru é erro.

---

## Ordem da tela

1. **Faixa preta de destaque**
2. **Faixa de 3 KPIs**
3. **Cartão “Placar de hoje”** (único bloco, largura cheia)
4. **Rodapé de nota** dentro do cartão

### 1. Faixa preta

`background:var(--ink); color:var(--bg); border-radius:8px; padding:14px 20px`, texto 14/20/0.25 com a parte forte em peso 700 **na mesma cor** (sem vermelho, sem segunda cor). Conteúdo: *“12 de 15 sem nenhum registro hoje — o time soma 11 visitas e 0 fechamentos.”* Uma linha; não deixe a faixa com o dobro da altura necessária.

### 2. KPIs

`display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px`. Três cartões, com os **mesmos números que a faixa já calcula** — se não estiverem disponíveis fora do texto da faixa, **não crie consulta nova**: avise na resposta.

| Rótulo (uppercase) | Valor | Qualificador |
|---|---|---|
`SEM REGISTRO` | `12` | *de 15 executivos* — `--red` |
`VISITAS` | `11` | *meta do time: 90/dia* — `--red` |
`FECHAMENTOS` | `0` | *hoje* — `--ter` |

Rótulo 12/16/0.5 peso 600 uppercase `--muted`; valor 28/36 peso 700 **sempre `--ink`**, `tabular-nums`; qualificador 12/16/0.4 na terceira linha. **Nunca colorir o número** — a cor vive no qualificador.

### 3. Placar de hoje

Cabeçalho do cartão: `.titulo-secao` “Placar de hoje” + nota `28/08/2026 · sex` em 12/16/0.4 `--ter`, à direita.

**Grade da tabela:** `minmax(0,1fr) 64px 72px 80px 64px 64px 56px 176px`, `gap:12px` — nome · Visitas · Avanços · Propostas · Fechou · Pontos · Seq. · semana.

**Cabeçalho de coluna:** 11/16/0.5 peso 600 uppercase `--ter`, `padding-bottom:8px`, borda inferior 1px `--line`. Nunca 14px peso 700 (confunde com dado). A última coluna, no lugar de um rótulo “Semana”, traz os cinco dias: `display:grid; grid-template-columns:repeat(5,32px); gap:4px; justify-content:end`, cada dia 11/16/0.5 peso 600 uppercase centralizado — **hoje em `--ink`, os outros em `--ter`**. Os dias aparecem **só aqui**, nunca repetidos por linha.

**Agrupamento, não tinta.** Duas seções dentro do mesmo cartão, nesta ordem — quem está vazio é o que gera ação hoje; quem cumpriu é confirmação:

1. Rótulo `SEM REGISTRO HOJE · 12` — 11/16/0.5 peso 600 uppercase **`--red`**, seguido de um filete 1px `--line-soft` ocupando o resto da largura, `padding:12px 0 6px`.
2. As linhas do grupo, **com o fundo normal do cartão**.
3. Rótulo `COM REGISTRO · 3` — mesma anatomia, cor `--ter`.
4. As linhas do grupo.

Nenhuma linha ganha fundo tingido, e o hover não é vermelho. Nenhuma linha repete um texto “sem registro hoje”: o rótulo do grupo e a faixa já dizem isso.

**Linha:** `padding:8px 0`, borda inferior 1px `--line-soft` — cerca de 44px, para os quinze executivos caberem sem rolagem interna.

**Nome:** avatar 28px pill `--panel2` / `--muted` com as iniciais (11/16/0.5 peso 700), `gap:10px`, nome 14/20/0.1 peso 600 `--ink` truncado com reticências — igual à tabela da Time, para as duas telas lerem como a mesma coisa.

**Células numéricas:** `text-align:right`, `tabular-nums`, 14/20 peso 600 `--muted`. Ausência é travessão `—` em `--ter` (não hífen curto). Zero de verdade (como `Seq.`) é `0` em `--ter`.

**Células da semana:** mesma grade de 32px do cabeçalho, `height:24px; border-radius:4px`, valor 12/16/0.4 peso 600 `tabular-nums` centralizado. Fundo `--panel2` **só** na coluna de hoje; transparente nas outras. Cor do número contra a meta global de 6 visitas/dia:

- `0` → `--ter`
- `1` a `5` → `--amber-ink`
- `6` ou mais → `--green`

Vermelho é para ausência e para prazo estourado; “pouco” é âmbar.

### 4. Rodapé

A nota sobre a meta global sai de qualquer faixa cinza e vira nota de rodapé no fim do cartão: 12/16/0.4 `--ter`, `margin-top:12px`, sem fundo e sem borda. Texto: *“Sem meta individual, o executivo cai na meta global de 6 visitas/dia. Metas por vendedor ficam no app de campo.”*

### Lista vazia

Se um dos grupos vier vazio, oculte o rótulo dele. Se a tabela toda vier vazia: 14/20/0.25 `--muted`, centralizada — usando a copy que o app já tiver.

---

## Dois detalhes que aparecem aqui mas não são da tela

- **Contas de teste.** `TESTE RPA` e `Revisão UX (temporário)` entram na contagem e fazem a faixa dizer *12 de 15*. **Se já existir filtro de conta de automação, aplique-o** — a faixa passa a dizer *10 de 13* sozinha. Se não existir, **não crie**: deixe como está e avise.
- **Sidebar no tema escuro.** O item ativo tem contorno vermelho de 1px além do fundo `--red-soft`, e parece anel de foco preso. Ativo é só fundo `--red-soft` + ícone e rótulo em `--red`, sem borda. Contorno só no `:focus-visible`.

---

## Não fazer

- Não mexa na consulta de dados nem invente métrica. Se um número do desenho não existir em `dados/`, **diga qual e pare**.
- Não renomeie tokens.
- Não mexa na navegação por hash nem nas guardas de sessão.
- Não crie filtro nem estado que a tela não tenha — avise.
- Não toque em outra tela.

## Ao terminar

Três linhas: **o que mudou**, **o que já estava certo e você não tocou**, e **o que não deu para aplicar — nomeando o campo, o filtro ou o estado que falta**.

E o de sempre: se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
