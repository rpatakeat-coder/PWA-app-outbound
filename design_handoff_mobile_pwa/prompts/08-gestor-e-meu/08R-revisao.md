# 08R — Revisão: Gestor e Meu desempenho

**Arquivos:** `src/screens/GestorScreen.tsx`, `src/screens/MeuDesempenhoScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *5. Painel do gestor (mobile)* · screenshot `design_handoff_mobile_pwa/screenshots/06-gestor.png` e `07-meu-desempenho.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Ambas com header `arrow_back` 48×48 — são alcançadas pelo menu do perfil, não por aba.
2. Nenhuma das duas tem bottom nav; `padding-bottom` de 16, não 40.
3. Gestor: KPIs 2×2, card raio 16, valor **18/24 peso 700** (não 28/36).
4. Delta em `--tint-green-text` / `--tint-red-text`, não hexes.
5. Funil com barra de **18px** (não 22) e cores vindas de `stages.ts`.
6. Time em linhas de duas alturas com avatar 32px e badge de meta — **não** a tabela de 7 colunas.
7. Drill-down por vendedor preservado (se existia).
8. Meu: banner raio 16, título **18/24 peso 700**, com barra de progresso de 8px.
9. Meu: KPIs 2×2 com valor 18/24; delta de atrasadas em `--tint-red-text`.
10. Heatmap com células `aspect-ratio:1` fluidas e o **hoje-vazio tracejado `1.5px dashed #C8131B`**.
11. Todos os auxiliares do 08a presentes, com destino declarado.
12. Nenhuma métrica inventada; nenhuma query nova.
13. Nenhum hexadecimal fora dos literais permitidos; spacing só até 24; maior tipo 18/24.

## Armadilhas conhecidas desta tela

- **Métrica inventada** quando o hook não tinha o campo. Confira contra a tabela do 08a.
- **Tipos de desktop portados** — 28/36 no banner e nos KPIs, barra de funil de 22px, células de heatmap de 28px fixos.
- **Tabela de 7 colunas** do Gestor portada para 390px.
- **Hoje-vazio sem o tracejado.**
- **`MinhaDailyCard` descartado.**
- **Header sem `arrow_back`** — a tela fica sem saída, já que não é aba.

## Conferência

- Abrir em **390 × 844** (DevTools, iPhone 14) e comparar com o screenshot
- Testar com o **polegar**: todo alvo tem 48px?
- Alternar o tema e repetir no **escuro**
- No PWA instalado: nada embaixo da barra de gestos
