# 07R — Revisão: Agenda

**Arquivos:** `src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *4. Agenda* · screenshot `design_handoff_desktop_web/screenshots/04-agenda.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Grade `repeat(7,minmax(0,1fr))` gap 8; coluna `min-height:520px`, raio 8, borda 1px `--border`.
2. Cabeçalho da coluna: dia uppercase 11/16/0.5 peso 600 + número 20/28 peso 600 com `tabular-nums`.
3. Hoje: borda `#C8131B`, cabeçalho `--tint-red`, texto `--tint-red-text`.
4. Item: `padding:8px`, raio 4, borda esquerda 3px na cor do tipo.
5. Tints: Rota `#FAE8E9`, Demo `#F1EBFE`, Follow-up `#E6F7FF`; no escuro caem para `--surface-2`.
6. Hora 11/16/0.5 peso 700 na cor do tipo, com `tabular-nums`.
7. As três fontes (`routeStops`, reuniões, follow-ups) aparecem na grade.
8. Barra: setas 32×32, intervalo 18/24 peso 600, botão "Hoje" Small.
9. Legenda com os três tipos à direita.
10. "Exportar JSON" Large outline em `#1D9688`; exportação funciona.
11. Filtro por vendedor presente para gestor.
12. Estilos `cal*` reaproveitados, sem conjunto paralelo.
13. Dia cheio com comportamento definido; nada vaza.
14. Abaixo de 1024px cai para a lista cronológica, que continua existindo.
15. Clique no item preserva o comportamento anterior.
16. Nenhum hexadecimal fora dos literais permitidos.
17. Nenhum spacing fora da escala 8pt.

## Armadilhas conhecidas desta tela

- **Lista cronológica deletada** ao construir o calendário — ela é o layout abaixo de 1024px.
- **Estilos `cal*` ignorados** e um conjunto novo criado do zero.
- **Dia cheio sem tratamento** — passa desapercebido em dados de teste e explode em produção.
- **Follow-up e Demo com a mesma cor** — são `#01AFFF` e `#7c3aed`, tipos diferentes.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
