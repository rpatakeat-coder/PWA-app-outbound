# G4 — Semana (prompt único)

**Arquivo:** `gestao/src/telas/Semana.tsx` · **Dados:** `gestao/src/dados/semana.ts`
**Referência visual:** `Cockpit de Gestão - Casca web.dc.html`, aba **Semana** — é o alvo exato.
**Pergunta que a tela responde:** *O que mudou e o que eu faço?* — é o subtítulo do header e o critério para decidir o que fica e o que sai.

> Rode o `G1-casca-web.md` antes: este prompt assume a sidebar e o header no lugar.
> Substitui `G4-semana.md` — leia só este.
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
Trilha de barra | `--sunk` | `#ededed` | `#2a2a2a` |
Texto primário | `--ink` | `#222222` | `rgba(255,255,255,.92)` |
Texto secundário | `--muted` | `#545454` | `rgba(255,255,255,.64)` |
Texto terciário | `--ter` | `#7A7A7A` | `rgba(255,255,255,.38)` |
Divisor | `--line` | `#ededed` | `rgba(255,255,255,.12)` |
Divisor fraco | `--line-soft` | `#f6f6f6` | `rgba(255,255,255,.08)` |
Marca | `--red` | `#c8131b` | `#e5a1a4` |
Tinta vermelha | `--red-soft` | `#fae8e9` | `#3a1416` |
Positivo | `--green` | `#167532` | `#77bd8b` |
Tinta verde | `--green-soft` | `#eaf7ee` | `#14301d` |
Atenção (texto) | `--amber-ink` | `#99670f` | `#ffd894` |
Tinta âmbar | `--amber-soft` | `#fff8eb` | `#33280f` |

**`--ter` é para o que não se lê como frase**: rótulo de eixo, contagem ao lado de um número, caption de 11px. Frase que precisa ser lida usa `--muted`.

**Tipografia** — Poppins, `tamanho/altura/letter-spacing`:
11/16/0.5 peso 600 (badge, iniciais, nota de bloco) · 12/16/0.4 (sublinha, metadado) · 12/16/0.5 peso 600 (rótulo e valor de barra) · 12/16/0.5 peso 600 uppercase (`.titulo-secao`, rótulo de KPI) · 14/20/0.25 (corpo) · 14/20/0.1 peso 600 (nome de entidade) · 28/36 peso 700 (KPI).
Todo número com `font-variant-numeric: tabular-nums`; milhares em `toLocaleString('pt-BR')`.

**Espaçamento** 8pt: 4 · 8 · 12 · 16 · 20 · 24. **Raio**: 4 (badge, barra) · 8 (cartão) · 9999 (avatar).
**Cartão**: `background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:var(--sombra-card); padding:16px 20px`.
**`.titulo-secao`**: 12/16/0.5 peso 600 uppercase `--muted`, `margin:0 0 12px`.
**Foco**: `outline:2px solid #016999; outline-offset:2px`. **Alvo**: 32px (ferramenta de mesa, só web, só gestor).

> **Cores de etapa do funil são literais e vêm de `stages.ts`:** Prospecção `#0ea5e9` · Visita `#14b8a6` · Conversa com decisor `#8B5CF6` · Demo/Proposta `#FFB32F` · Negociação `#f97316` · Ag. Pagamento `#C8131B` · Negócio Fechado `#16a34a` · Perdido `#475569`. Qualquer outro hex cru é erro.

---

## Ordem da tela

1. **Faixa de 4 KPIs**
2. **Cartão “O que mudou de etapa”** (largura cheia)
3. **Cartão “Exige decisão sua”** (largura cheia, abaixo)

Sem faixa preta de destaque nesta aba — a Semana não tem manchete; a leitura começa nos KPIs. **Grade `12fr`**: os dois cartões empilhados em largura cheia, nunca lado a lado. É tela de leitura, não de comparação.

O título e o intervalo da semana são montados em tempo de execução (dois pontos no arquivo, por volta de L72 e L311). **Preserve a lógica** — aplique só o estilo.

### 1. KPIs

`display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px`.

| Rótulo (uppercase) | Valor | Qualificador | Cor do qualificador |
|---|---|---|---|
`ENTRARAM NO FUNIL` | `184` | *+31 vs semana anterior* | `--green` |
`AVANÇARAM` | `97` | *+9%* | `--green` |
`PERDIDOS` | `23` | *+6 vs semana anterior* | `--red` |
`PARADOS 7+ DIAS` | `61` | *exigem ação* | `--red` |

Rótulo 12/16/0.5 peso 600 uppercase `--muted`; valor 28/36 peso 700 **sempre `--ink`**, `tabular-nums`, `margin-top:8px`; qualificador 12/16/0.4 na terceira linha, `margin-top:2px`. **Nunca colorir o número** — a cor vive no qualificador, e verde/vermelho aqui significam *melhorou/piorou*, não *bom/ruim*.

### 2. O que mudou de etapa

Cabeçalho do cartão: `.titulo-secao` “O que mudou de etapa” + nota `24 a 28 de agosto` em 11/16/0.5 peso 500 `--ter`, à direita, `white-space:nowrap`.

**O rótulo é a transição, não a etapa.** Seis barras, `display:flex; flex-direction:column; gap:10px`, escala comum com máximo 88 (a maior barra ocupa 100%):

| Rótulo | Valor | Cor da barra |
|---|---|---|
Prospecção → Visita | 88 | `#14b8a6` |
Visita → Conversa com decisor | 54 | `#8B5CF6` |
Conversa → Demo/Proposta | 31 | `#FFB32F` |
Demo → Ag. Pagamento | 18 | `#C8131B` |
Ag. Pagamento → Fechado | 12 | `#16a34a` |
Qualquer etapa → Perdido | 23 | `#475569` |

**A cor é sempre a da etapa de destino** — é para onde o lead foi que interessa. A linha de perdidos fecha a lista em cinza-ardósia, fora da progressão cromática, para não parecer mais um avanço.

**Anatomia da barra:** linha de rótulo com `display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:4px` — rótulo 12/16/0.5 peso 600 `--muted` truncado com reticências, valor 12/16/0.5 peso 600 `--ter` `tabular-nums` à direita. Abaixo, trilha `height:20px; border-radius:4px; background:var(--sunk); overflow:hidden` com o preenchimento em `width:<pct>%; height:100%; border-radius:4px`.

Sem rodapé âmbar neste bloco.

### 3. Exige decisão sua

É a resposta à segunda metade da pergunta. Cabeçalho: `.titulo-secao` “Exige decisão sua”, sem nota.

**Linha sem avatar** (ao contrário da Daily e da Time — aqui a entidade é o lead, não a pessoa): `display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--line-soft)`.

- Nome do lead: 14/20/0.1 peso 600 `--ink`, truncado com reticências.
- Sublinha: 12/16/0.4 `--ter`, truncada — traz **etapa, tempo parado e responsável**, separados por ` · `.
- Badge à direita: `padding:2px 8px; border-radius:4px`, 11/16/0.5 peso 600, `white-space:nowrap`, `flex:0 0 auto`.

| Lead | Sublinha | Badge | Tinta |
|---|---|---|---|
Bar do Zé | Negociação há 22 dias · Bruno Martins | `Desconto pedido` | `--amber-soft` / `--amber-ink` |
Cantina Bella Napoli | Ag. Pagamento há 11 dias · Kelly | `Sem retorno` | `--red-soft` / `--red` |
Empório Vila Rica | Conta Alvo · 3 tentativas | `Escalar` | `--amber-soft` / `--amber-ink` |

Vermelho é para o que estourou prazo; âmbar é para o que espera uma decisão sua. Verde não aparece neste bloco — nada aqui é boa notícia.

**Se o `semana.ts` não tiver um recorte de “exige decisão”, diga e pare.** É o bloco que dá sentido à segunda metade da pergunta da tela, e inventar critério aqui é pior que não ter o bloco.

### Lista vazia

Bloco sem itens: 14/20/0.25 `--muted`, centralizado — usando a copy que o app já tiver. Não deixe cartão vazio com só o título.

---

## Um detalhe que aparece aqui mas não é da tela

**Sidebar no tema escuro.** O item ativo tem contorno vermelho de 1px além do fundo `--red-soft`, e parece anel de foco preso. Ativo é só fundo `--red-soft` + ícone e rótulo em `--red`, sem borda. Contorno só no `:focus-visible`. (Se o `G3-daily-completo.md` já corrigiu isso, não há nada a fazer.)

## Não fazer

- Não mexa na consulta de dados nem invente métrica. Se um número do desenho não existir em `dados/`, **diga qual e pare**.
- Não renomeie tokens.
- Não mexa na montagem do título nem na navegação por hash ou nas guardas de sessão.
- Não crie filtro nem estado que a tela não tenha — avise.
- Não toque em outra tela.

## Ao terminar

Três linhas: **o que mudou**, **o que já estava certo e você não tocou**, e **o que não deu para aplicar — nomeando o campo, o filtro ou o estado que falta**.

E o de sempre: se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
