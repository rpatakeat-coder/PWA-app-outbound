# 10R — Revisão: Meu desempenho

**Arquivos:** `src/screens/MeuDesempenhoScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *7. Meu desempenho* · screenshot `design_handoff_desktop_web/screenshots/07-meu-desempenho.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Container `padding:24px`, gap 24, `max-width:1200px`.
2. Banner `padding:24px`, raio 8, fundo `#C8131B`.
3. Kicker 11/16 com `letter-spacing:.12em` peso 800 uppercase.
4. Título do banner 28/36 peso 700; sublinha 14/20/0.25 peso 500.
5. Dois números à direita, 28/36 peso 700, `tabular-nums`, com sublabel.
6. Valores reais dos hooks — nenhum número fixo.
7. Quatro KPIs em grid de 4, valor **24/32 peso 600** (não 28/36).
8. Delta de "Tarefas atrasadas" em `--tint-red-text`.
9. Heatmap (se existe) no mesmo padrão do Gestor, incluindo o hoje-vazio tracejado.
10. `MinhaDailyCard` e `SellerGoalsCard` presentes e reestilizados.
11. Abaixo de 1024px: KPIs 2×2, banner empilhado.
12. O banner vermelho é o único bloco chapado da tela.
13. Nenhum hexadecimal fora dos literais permitidos; spacing na escala 8pt.

## Armadilhas conhecidas desta tela

- **KPI com 28/36** copiado do Gestor — aqui é 24/32.
- **Ritmo inventado** ("1,3/dia") quando o hook não calcula isso.
- **`MinhaDailyCard` descartado.**
- **Segundo bloco vermelho chapado** na tela — só o banner.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
