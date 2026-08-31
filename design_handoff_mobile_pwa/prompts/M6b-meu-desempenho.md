# M6b — Meu desempenho: revisão contra o alvo visual

**Arquivo:** `src/screens/MeuDesempenhoScreen.tsx` · leitura de `src/hooks/useSellerGoals.ts`, `useMinhaDaily.ts`, `useVisitsHeatmap.ts`, `useGestorMetrics.ts` (`my_metrics`)
**Alvo visual:** `design_handoff_mobile_pwa/M6b - Meu desempenho.dc.html` — quadro **1a** (com meta) e **1b** (sem meta). Abra no browser e bata o resultado contra eles.
**Referência escrita:** `design_handoff_mobile_pwa/README.md` §*6. Meu desempenho (mobile)* · screenshots `07-meu-desempenho.png`, `16-dark-meu-desempenho.png`
**Pergunta que a tela responde:** *estou no ritmo da meta?*

> O **M6 já aplicou esta tela** (commit `abf1834`) e o relatório dele registrou que **meta mensal ficou de fora por falta de query**. Este prompt não refaz a tela: ele confere o que ficou, fecha o estado sem meta, e só liga o banner se o dado existir de verdade.
>
> **Só esta tela.** Não toque no Gestor, no menu do perfil nem em `App.tsx`.

**Tokens mobile:** maior tipo **18/24** · card raio **16** · botão 48 raio 12 · spacing ≤ 24 · alvo ≥ 48 · raios só `4 · 12 · 16 · pill`. **Sem bottom nav:** `padding-bottom` **16**, nenhuma reserva de FAB.

---

## Fase 1 · Confirmar o que existe — sem editar nada

Não repita o inventário do M6. Responda só isto:

1. **`useSellerGoals`** — devolve meta do mês para o próprio vendedor? Nome exato do campo, e o que ele devolve quando não há meta (`null`, `0`, array vazio?).
2. O que a tela renderiza **hoje** no lugar do banner de meta (o M6 omitiu o bloco — sobrou espaço, aviso, nada?).
3. **`% da meta` e "ritmo"** — existem como campo, ou seriam cálculo derivado? Se derivado, diga a fórmula que daria e **não a escreva ainda**.
4. Os quatro KPIs aplicados no M6, com o campo de cada um.
5. `useMinhaDaily` e `SellerGoalsCard` — onde o M6 os pôs.
6. O heatmap: `useVisitsHeatmap` devolve os 7 dias da semana corrente e o total?

Entregue isso **antes** da fase 2, na mesma resposta.

---

## Fase 2 · Aplicar

### A · Header

`padding:12px 16px`, fundo do tema: `arrow_back` **48×48** raio 12 `rgba(255,255,255,.18)` + "Meu desempenho" 18/24 peso 600, e sublinha 12/16/0.4 com **nome do vendedor · mês** (ambos já disponíveis; se o mês não estiver, só o nome). O `arrow_back` volta para a aba de origem — isso é trabalho do **M7**; aqui só garanta que o botão existe e não some.

### B · Banner de meta — condicional, não decorativo (quadro 1a)

**Só renderize se `useSellerGoals` devolver meta para o mês.** `padding:16px`, raio **16**, fundo `#C8131B`:

- Kicker "META DE {MÊS}" — 11/16, `letter-spacing:.12em`, peso 800, `rgba(255,255,255,.75)`, uppercase
- Título **18/24 peso 700** `tabular-nums`: "{feitos} de {meta} fechamentos" (ou a unidade que o campo real usar — não invente "fechamentos" se o campo for outro)
- Barra de progresso altura **8** raio 4, `margin-top:12px`, trilha `rgba(255,255,255,.25)`, preenchimento branco, **clampada em 100%**
- Sublinha 12/16/0.4 `rgba(255,255,255,.85)`: "{n}% da meta". A segunda metade da frase — "faltam X em Y dias úteis" — **só entra se o cálculo de dias úteis já existir**; se não, pare na porcentagem

É o **único bloco vermelho chapado** além do header. A barra substitui os dois números grandes do desktop: em 390px não cabem.

### C · Estado sem meta (quadro 1b)

O que hoje é uma omissão silenciosa passa a ser um aviso: card `padding:16px` raio 16, borda **1px dashed `--stroke-default`**, ícone `flag` 24px `--text-faint` + "Sem meta definida para {mês}" 14/20/0.1 peso 600 sobre "Seu gestor define a meta do mês. Os números abaixo continuam contando." 12/16/0.4 `--text-faint`.

**Nunca renderize "0% da meta" nem uma barra vazia quando não há meta** — é a diferença entre "não bati" e "ninguém definiu".

### D · KPIs 2×2

`grid-template-columns:1fr 1fr` gap 12. Card `padding:16px` raio 16 `--surface`, borda 1px `--border`, sombra 01: rótulo 12/16/0.5 peso 600 `--text-faint` uppercase · valor **18/24 peso 700** `tabular-nums` · delta 11/16/0.5 peso 600 em **`--tint-green-text` / `--tint-red-text`** (tokens, não hexes).

Os quatro: **Visitas no mês · Demos · Conversão · Atrasadas**. Se o M6 aplicou outros por falta de campo, **mantenha os que existem** — não troque por métrica inventada.

### E · Heatmap da semana

Card raio 16. Cabeçalho "VISITAS NA SEMANA" 12/16/0.5 peso 700 `--text-muted` uppercase, com o **total à direita** 12/16/0.4 `tabular-nums`. Grade `repeat(7,1fr)` gap 4, células `aspect-ratio:1` raio 4, **fluidas** (não os 28px fixos do desktop):

- `--surface-3` vazio · `#8FE0D5` 1–2 · `#1D9688` 3+
- **hoje vazio = `1.5px dashed #C8131B`**
- contagem dentro da célula quando ≥ 1, 12/16 peso 700 (`#0C3B36` sobre o teal claro, branco sobre o escuro)
- rótulo do dia abaixo, 11/16/0.5 peso 600 `--text-faint`; **hoje em `--tint-red-text`**
- **legenda de três degraus** abaixo da grade (swatch 12px + rótulo 11/16/0.5 `--text-faint`): sem a legenda o teal não se explica

### F · Auxiliares

`MinhaDailyCard` e `SellerGoalsCard` continuam na tela, em casca de card raio 16, **depois** do heatmap. Não descarte nenhum dos dois. Se o M6 já os colocou, só confira a casca e a ordem.

---

## Não fazer

- **Não invente métrica nem escreva query nova.** Se "ritmo", "% da meta" ou "dias úteis" não existem, omita a frase e diga qual campo falta.
- Não porte tipo de desktop (28/36, células de 28px, dois números grandes no banner).
- Não use `#167532` / `#94090F` como cor de texto sobre superfície do tema — são `--tint-green-text` / `--tint-red-text`.
- Não adicione bottom nav nem reserva de FAB.
- Não descarte auxiliar.

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Header com `arrow_back` 48×48 e sublinha com nome · mês.
2. Sem bottom nav; `padding-bottom` 16.
3. Banner de meta **só quando há meta**, raio 16, título 18/24 peso 700, barra de 8px clampada em 100%.
4. **Sem meta → aviso tracejado**, e nenhuma barra nem "0%".
5. KPIs 2×2, card raio 16, valor 18/24 peso 700 `tabular-nums`.
6. Delta em `--tint-green-text` / `--tint-red-text`, não hexes.
7. Heatmap com células `aspect-ratio:1` fluidas, contagem dentro, total no cabeçalho.
8. **Hoje-vazio tracejado `1.5px dashed #C8131B`**; rótulo de hoje em `--tint-red-text`.
9. Legenda de três degraus presente.
10. `MinhaDailyCard` e `SellerGoalsCard` presentes, depois do heatmap.
11. Nenhuma métrica inventada; nenhuma query nova.
12. Nenhum hex fora dos literais permitidos; spacing ≤ 24; maior tipo 18/24; raios só `4 · 12 · 16 · pill`; alvo ≥ 48.
13. O `periodoChip` de 36px listado no M6 — resolvido ou declarado. Diga o que aconteceu.
14. `npm run typecheck` limpo.

**Conferir em 390×844**, comparar com os quadros 1a e 1b do DC e com `07-meu-desempenho.png` / `16-dark-meu-desempenho.png`, **alternar o tema e repetir no escuro**.

## Ao terminar

As respostas da fase 1, depois três linhas: **o que mudou** · **se o banner ficou ligado ou no estado sem meta, e por quê** · **o que não deu para aplicar, nomeando o campo que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
