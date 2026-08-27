# 06b — Topo do rail: data e KPIs

**Tela:** Rota  ·  **Arquivo:** `src/screens/RotaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *3. Rota do dia*
**Escopo:** só a faixa de topo do rail

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- `padding:24px`, borda inferior 1px `--border`.
- Linha: kicker "ROTA DO DIA" (11/16/0.5, peso 600, `--text-faint`, uppercase) sobre a data (18/24, peso 600, `--text`); à direita, duas setas 32×32 raio 4, borda 1px `--stroke-default`, para navegar o dia.
- Abaixo, `margin-top:16px`: três KPIs em `grid-template-columns:repeat(3,1fr)` gap 8. Cada um `padding:12px`, raio 8, fundo `--surface-2` — valor 20/28 peso 600 `--text` com `tabular-nums`, rótulo 11/16/0.5 peso 500 `--text-faint`.
- Os três: **paradas · distância · em rota**. Valores reais do estado da rota, não fixos.

## Pronto quando

- [ ] kicker, data e setas na primeira linha
- [ ] três KPIs com números reais e `tabular-nums`
- [ ] navegação de dia funcionando
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
