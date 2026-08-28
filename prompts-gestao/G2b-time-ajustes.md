# G2b — Time · ajustes sobre o que já foi aplicado

**Arquivo:** `gestao/src/telas/Cockpit.tsx` · **Dados:** `gestao/src/dados/cockpit.ts`
**Referência visual:** `Cockpit de Gestão - Casca web.dc.html`, aba **Time** — atualizado com os números reais da produção, é o alvo exato desta passada.

> O `G1` e o `G2` já rodaram. Este arquivo é a **diferença** entre o que está em produção hoje e o desenho: nove regiões, cada uma com o que está errado e o valor certo. Não refaça a tela.
>
> Tarefa única: **só a aba Time**. Se encontrar algo errado em outra, anote e siga.

---

## Tokens (não precisa abrir outro arquivo)

Nomes do `gestao/src/estilos/tokens.css`. **Não renomeie nada.**

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
Atenção (texto) | `--amber-ink` | `#99670f` | `#ffd894` |
Tinta âmbar | `--amber-soft` | `#fff8eb` | `#33280f` |

**Tipografia** — Poppins, `tamanho/altura/letter-spacing`: 11/16/0.5 (badge, cabeçalho de coluna) · 12/16/0.4 (metadado) · 12/16/0.5 peso 600 uppercase (título de seção) · 14/20/0.25 (corpo) · 14/20/0.1 peso 600 (nome de entidade) · 22/28 peso 700 (título de tela) · 28/36 peso 700 (KPI). Número sempre com `font-variant-numeric: tabular-nums`.

**Espaçamento** 8pt: 4 · 8 · 12 · 16 · 20 · 24. **Raio**: 4 (badge, barra, botão) · 8 (cartão) · 9999 (avatar).
**Cartão**: `background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:var(--sombra-card); padding:16px 20px`.

**Cores de etapa do funil** (literais, de `stages.ts` — qualquer outro hex cru é erro):
Prospecção `#0ea5e9` · Visita `#14b8a6` · Conversa com decisor `#8B5CF6` · Demo/Proposta `#FFB32F` · Negociação `#f97316` · Ag. Pagamento `#C8131B` · Negócio Fechado `#16a34a` · Perdido `#475569`.

---

## Antes de editar

Abra `Cockpit.tsx` e localize as nove regiões abaixo. **Se alguma já estiver como descrito, não toque nela** — diga na resposta que já estava certa. Se o código tiver um motivo para estar diferente (um dado que não existe, um estado que não é da tela), **pare e pergunte** em vez de aplicar por cima.

---

## 1. Header — falta a faixa de período

O `G1` pede três botões à direita do header: **Hoje · 7 dias · 30 dias**, 32px de altura, `padding:0 12px`, raio 4, 12/16/0.5 peso 600. Ativo: fundo `--red`, texto `#fff`, borda `--red`. Inativo: fundo `--panel`, texto `--muted`, borda `--line-btn`.

Em produção eles não aparecem. **Só coloque se a tela já tiver um estado de período** (ou se `cockpit.ts` receber uma janela). Se não tiver, **não crie o estado** — responda dizendo que a Time não tem período e o header fica sem a faixa.

Header com `height:64px` fixo, `padding:0 24px`, fundo `--panel`, borda inferior 1px `--line`. Título 22/28 peso 700 `--ink`; a pergunta *"Onde eu ajo hoje?"* ao lado, 12/16/0.4 `--ter`.

## 2. Sidebar — o ícone da marca não está carregando

No topo do rail aparece um glifo minúsculo no lugar do símbolo da Takeat. Confira o caminho do arquivo e o `width/height:28px` com `object-fit:contain`. O bloco de marca é `height:64px` com borda inferior 1px `--line`, alinhado à borda do header.

Nada mais na sidebar nesta passada.

## 3. Faixa de destaque — comprimir

A faixa preta está com o dobro da altura necessária e o raio maior que o dos cartões.

`background:var(--ink); color:var(--bg); border-radius:8px; padding:14px 20px`, texto 14/20/0.25. A parte forte (*"39 leads acima do SLA"*) é **peso 700 na mesma cor** — não vermelho, não outra cor. Em tema escuro os dois tokens se invertem sozinhos; confira que continua legível.

## 4. KPIs — o número não tem cor

Cinco cartões: `grid-template-columns:repeat(5,minmax(0,1fr)); gap:16px; align-items:stretch`.

Cada cartão em três linhas, nesta ordem:

1. **Rótulo** — 12/16/0.5 peso 600 **uppercase** `--muted`, só a palavra (`EM ABERTO`, `TRAVADOS`, `FECHADOS`, `TAXA DE AVANÇO`, `META DE VISITAS`).
2. **Valor** — 28/36 peso 700, **sempre `--ink`**, `tabular-nums`, `margin-top:8px`.
3. **Qualificador** — 12/16/0.4, `margin-top:2px`: `--red` quando é alerta (*acima do SLA*), `--green` quando é ganho, `--ter` no resto (*no funil*, *no mês*, *últimos 7 dias*, *soma do time · por dia*).

Hoje o `39` está vermelho e o `1` verde, e o qualificador está colado no rótulo na mesma linha — é isso que faz o quinto cartão quebrar em três linhas e desalinhar o número. Com o qualificador embaixo, os cinco ficam da mesma altura.

## 5. Funil — as barras estão todas vermelhas

Vermelho em toda etapa apaga a informação de etapa. Cada barra vai na **cor da sua etapa** (tabela acima), e a parcela travada entra como um bloco `--red` **no fim** do preenchimento, com largura `travados / total`:

- Trilha: `height:20px; border-radius:4px; background:var(--sunk); overflow:hidden`.
- Preenchimento: largura proporcional **à maior etapa** (55 = 100%) — como já está, mantenha. `border-radius:4px`, `display:flex; justify-content:flex-end`.
- Bloco travado: dentro do preenchimento, `background:var(--red); border-radius:0 4px 4px 0`.
- `gap:10px` entre etapas.

Linha de rótulo (`margin-bottom:4px`, `align-items:baseline`, `justify-content:space-between`):

- Esquerda: nome da etapa 12/16/0.5 peso 600 `--muted`; `· SLA 3d` em peso 500 `--ter`. Hoje está 14px peso 700 `--ink` — pesado demais para um rótulo de eixo.
- Direita: total 12/16/0.5 peso 600 `--ter` `tabular-nums`; `· 3 travados` em `--red`, `white-space:nowrap`. Etapa com 0 travados mostra só o total.

## 6. Nota do gargalo — raio e caixa

`background:var(--amber-soft); color:var(--amber-ink); border-radius:4px; padding:10px 12px`, texto 14/20/0.25, `margin-top:12px`, dentro do cartão do funil. Sem borda.

## 7. Por executivo — é tabela, e continua tabela

As quatro colunas (**Executivo · Abertos · Travados · Meta/dia**) são do código e estão certas — o `G2` descrevia uma lista com badge porque eu não tinha visto a tabela. **Ignore aquela parte do `G2`**; ajuste só a apresentação:

- Cabeçalho: 11/16/0.5 peso 600 **uppercase** `--ter`, `padding-bottom:8px`, borda inferior 1px `--line`. Hoje está 14px peso 700 `--ink` e se confunde com a primeira linha de dados.
- Grade da linha: `grid-template-columns:minmax(0,1fr) 88px 88px 88px; gap:12px; align-items:center; padding:8px 0`, borda inferior 1px `--line-soft`. Hoje cada linha ocupa ~56px.
- Nome: avatar 28px pill `--panel2` / `--muted` com as iniciais (11/16/0.5 peso 700), `gap:10px`, nome 14/20/0.1 peso 600 `--ink` truncado com reticências — *Kelly Travieso Di Domenico* não pode empurrar as colunas.
- Números: `text-align:right`, `tabular-nums`, 14/20 peso 600. **Abertos** e **Meta/dia** em `--muted`; **Travados** em `--red` quando > 0; qualquer zero em `--ter`.

## 8. As linhas 0 · 0 · 6 saem da lista

Sete executivos com atividade, oito linhas zeradas: a tabela passa do rodapé da janela e o gestor rola por nada.

Mostre só quem tem `abertos > 0`, ordenado por abertos (como já está). O resto entra atrás de um botão no fim do cartão: **"Mostrar N sem atividade"** / **"Ocultar sem atividade"** — 32px, `padding:0 12px`, borda 1px `--line-btn`, raio 4, fundo `--panel`, 12/16/0.5 peso 600 `--muted`, hover `--panel2`.

*Revisão UX (temporário)* é conta de teste. **Se já existir filtro de conta de automação, use-o.** Se não existir, não crie — ela cai na lista oculta junto com os outros zeros, e você me avisa na resposta.

## 9. Grade dos dois cartões

`grid-template-columns:7fr 5fr; gap:20px; align-items:start`. Hoje o cartão do funil estica até a altura do vizinho e sobra um vão vazio grande embaixo da nota do gargalo. O container de conteúdo: `padding:24px; max-width:1600px`.

---

## Não fazer

- Não mexa na consulta de dados nem invente métrica. Se um número do desenho não existir em `dados/`, **diga qual e pare**.
- Não renomeie tokens.
- Não mexa na navegação por hash nem nas guardas de sessão.
- Não crie estado novo (período, filtro de conta) que a tela não tenha — avise.
- Não toque em outra tela.

## Ao terminar

Três linhas: **o que mudou**, **o que já estava certo e você não tocou**, e **o que desta lista não deu para aplicar — nomeando o campo ou o estado que falta**.
