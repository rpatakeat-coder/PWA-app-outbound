# 10c — KPIs, heatmap e auxiliares

**Tela:** Meu desempenho  ·  **Arquivo:** `src/screens/MeuDesempenhoScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *7. Meu desempenho*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Quatro KPIs: `grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px`. Card `padding:16px`, fundo `--surface`, borda 1px `--border`, raio 8, sombra 02.
- Dentro: rótulo 14/20/0.1 peso 500 `--text-muted`; valor **24/32 peso 600** (menor que o do Gestor, que é 28/36) `--text` com `tabular-nums`, `margin-top:8px`; delta 12/16/0.4 com `margin-top:4px`.
- Os quatro: **Visitas no mês · Demos · Taxa de conversão · Tarefas atrasadas** — o delta das atrasadas em `--tint-red-text`.
- Heatmap pessoal, se existir (10a): mesmo padrão do 09d — células 28×28, três níveis, hoje-vazio tracejado.
- `MinhaDailyCard` e `SellerGoalsCard` entram como bloco abaixo dos KPIs, com a casca no padrão de card do README. **Não descarte.**
- Abaixo de 1024px: KPIs em 2×2, banner empilhado.

## Pronto quando

- [ ] quatro KPIs com valor 24/32 peso 600
- [ ] delta de atrasadas em `--tint-red-text`
- [ ] auxiliares preservados e reestilizados
- [ ] 2×2 abaixo de 1024px
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
