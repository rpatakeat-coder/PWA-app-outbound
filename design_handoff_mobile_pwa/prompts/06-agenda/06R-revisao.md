# 06R — Revisão: Agenda

**Arquivos:** `src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *3. Agenda* · screenshot `design_handoff_mobile_pwa/screenshots/04-agenda.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Título 18/24 peso 600; avatar 48px.
2. Tira da semana: sete botões `flex:1` com `min-height:48px`, raio 12.
3. Dia 11/16/0.5 peso 600 + número 14/20/0.1 peso 700 `tabular-nums` + dot 4px.
4. Hoje com fundo `#fff` e texto `#C8131B` (`#1E1E1E` no escuro).
5. Trocar o dia na tira troca o conteúdo.
6. Coluna de hora com 52px fixos; hora 14/20/0.1 peso 700 `tabular-nums`.
7. Card com borda esquerda 4px da cor do tipo, raio 16, sombra 01.
8. Rota `#C8131B`, Demo `#7c3aed`, Follow-up `#01AFFF` — cores e ícones distintos.
9. As três fontes de dados aparecem.
10. "Reagendar" e "Cancelar" com 48px onde aplicável.
11. Scroll com `padding-bottom:40px`; FAB não cobre botão.
12. Estado vazio com a copy original ("Agenda vazia.").
13. Nenhum hexadecimal fora dos literais permitidos; spacing só até 24 (+ reserva de 40).

## Armadilhas conhecidas desta tela

- **Calendário de 7 colunas portado do desktop** — não cabe em 390px.
- **Follow-up e Demo com a mesma cor.**
- **Coluna de hora fluida** em vez de 52px fixos — as horas desalinham entre itens.
- **Ações com 32px** (valor do desktop) em vez de 48.

## Conferência

- Abrir em **390 × 844** (DevTools, iPhone 14) e comparar com o screenshot
- Testar com o **polegar**: todo alvo tem 48px?
- Alternar o tema e repetir no **escuro**
- No PWA instalado: nada embaixo da barra de gestos
