# 08c — Banner de meta, KPIs e heatmap

**Tela:** Meu desempenho  ·  **Arquivo:** `src/screens/MeuDesempenhoScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *6. Meu desempenho (mobile)*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Header com `arrow_back` 48×48 + título 18/24 peso 600. Corpo `padding:16px`, coluna gap 16.
- **Banner de meta**: `padding:16px`, raio **16**, fundo `#C8131B`. Kicker "META DE {MÊS}" (11/16, `.12em`, peso 800, `rgba(255,255,255,.75)`, uppercase); título **18/24 peso 700** (não 28/36); **barra de progresso** altura 8 raio 4, trilha `rgba(255,255,255,.25)`, preenchimento branco, `margin-top:12px`; sublinha 12/16/0.4 `rgba(255,255,255,.85)`.
- A barra de progresso é o que substitui os dois números grandes que o desktop põe à direita — em 390px não há espaço para eles.
- **KPIs 2×2** gap 12, mesma anatomia do 08b: valor 18/24 peso 700. Visitas no mês · Demos · Conversão · Atrasadas (delta em `--tint-red-text`).
- **Heatmap**: card raio 16, grade `repeat(7,1fr)` gap 4, células `aspect-ratio:1` raio 4 — `--surface-3` vazio, `#8FE0D5` 1–2, `#1D9688` 3+, **hoje vazio = tracejado `1.5px dashed #C8131B`**. Células **fluidas**, não os 28px fixos do desktop.
- `MinhaDailyCard` e `SellerGoalsCard` entram como bloco abaixo, casca de card raio 16. **Não descarte.**
- Se "ritmo" não existir nos hooks (08a), omita a frase em vez de inventar cálculo.

## Pronto quando

- [ ] banner com barra de progresso e título 18/24
- [ ] KPIs 2×2 com valor 18/24
- [ ] heatmap com células fluidas e o hoje-vazio tracejado
- [ ] auxiliares preservados
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
