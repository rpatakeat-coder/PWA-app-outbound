# 05a — Header com KPIs e faixa de mapa

**Tela:** Rota  ·  **Arquivo:** `src/screens/RotaScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *2. Rota*
**Escopo:** header e mapa

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Header `padding:12px 16px`, fundo do tema: kicker "ROTA DE HOJE" (11/16, `letter-spacing:.12em`, peso 800, `rgba(255,255,255,.75)`, uppercase) + data 18/24 peso 600; avatar 48px à direita.
- Abaixo, `margin-top:12px`: três KPIs em linha gap 12, cada um `padding:8px 12px`, raio 12, fundo `rgba(255,255,255,.14)` — valor 16/24 peso 700 `tabular-nums`, rótulo 11/16/0.5 peso 600 `rgba(255,255,255,.75)`. **paradas · distância · em rota**.
- **Mapa em faixa de 180px** (`flex:0 0 180px`), não tela cheia: em rota o objeto de trabalho é a sequência; o mapa é orientação.
- Polyline `#C8131B` largura **4** (no mobile; o desktop usa 5), `round`. Marcador da parada atual 30×30 pill, borda 3px branca, número 12/700 branco.

## Pronto quando

- [ ] três KPIs com valores reais
- [ ] mapa em 180px
- [ ] polyline largura 4
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
