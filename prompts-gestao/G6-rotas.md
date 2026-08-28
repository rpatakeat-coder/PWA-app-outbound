# G6 — Rotas

**Arquivo:** `gestao/src/telas/Rotas.tsx` · **Dados:** `gestao/src/dados/rotas.ts`, `gestao/src/dados/mapa.ts`
**Referência visual:** o preview `Cockpit de Gestão - Casca web.dc.html`, aba **Rotas**
**Pergunta que a tela responde:** *Ver, editar e montar a rota de cada vendedor* — é o subtítulo no header, e o critério para decidir o que fica e o que sai

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

## A única tela com verbo de edição

A descrição das outras seis é uma pergunta; esta é uma ação — "ver, editar e montar". Isso muda a hierarquia: **quem não tem rota montada é o item mais importante da tela**, porque é o que exige você.

Não achei `.titulo-secao` neste arquivo. Se a tela não usa a classe, **passe a usar** — é o que dá consistência de cabeçalho com as outras seis.

## O que fazer

**Faixa de KPIs** em 4 colunas: rotas hoje · paradas · distância · concluídas. "Rotas hoje" com o delta em `--red` quando há executivo sem rota.

**Grade `7fr 5fr`, gap 20, `align-items:start`:**

**Mapa da rota selecionada** (7fr) — cabeçalho com o nome do executivo e a nota "{n} paradas · {km} km". Altura 280, raio 8, borda 1px `--line`. Polyline `#c8131b` largura 4, `round`. Marcadores numerados 30×30 pill, borda 3px branca, número 12/16 peso 700 branco — **`--green` concluída, `--red` a atual, `--ter` pendente**.

**Rotas por executivo** (5fr) — linha clicável que **troca o mapa ao lado**: avatar 28px, nome 14/20/0.1 peso 600, sublinha 12/16/0.4 `--ter` com "{n} paradas · {km} km", e à direita ou o progresso "2/7" em `tabular-nums`, ou o badge **Montar** `--red-soft`/`--red` quando não há rota.

A linha selecionada fica com fundo `--panel2`. Sem seleção, o mapa mostra o primeiro da lista.

**Os sem rota vão para o topo da lista**, antes dos que já têm — é o que a tela pede que você faça.

Se editar e montar rota já existir em algum fluxo, **preserve** e só reestilize. Se não existir, **não implemente** — diga.

## Não fazer

- Não mexa na consulta de dados nem invente métrica. Se um número do preview não existir no arquivo de `dados/`, **diga qual e pare**.
- Não renomeie tokens.
- Não mexa na navegação por hash nem nas guardas de sessão.
- Não toque em outra tela.

## Ao terminar

Três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer coisa do preview que não existe no código — nomeando o campo**.

E o de sempre: se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
