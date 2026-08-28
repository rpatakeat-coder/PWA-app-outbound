# 07R — Revisão: Tarefas

**Arquivos:** `src/screens/TarefasScreen.tsx`, `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *4. Tarefas* · screenshot `design_handoff_mobile_pwa/screenshots/05-tarefas.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Três abas de estado `flex:1` altura 40, raio 12 nas pontas, com contagem.
2. Ativo `#C8131B`/branco; inativo `--surface-2`/`--text-muted`.
3. Agrupamento vindo de `sla.ts` / vencimento.
4. `visibleTasks` / `tasksActiveVendor` intactos.
5. **Badge da barra inferior com o mesmo número de antes.**
6. Card raio 16, padding 16, sombra 01, borda esquerda 4px na cor do SLA.
7. Badge de SLA: D5 `#FAE8E9`/`#94090F`, D2 `#FFF8EB`/`#99670F`, — neutro.
8. **Régua esquerda no escuro: `#E5A1A4` (D5) / `#FFD894` (D2)** — variável diferente da do badge.
9. Prazo vencido em `--tint-red-text`, legível no escuro.
10. "Agendar" `flex:1` altura **48**; concluir 48×48.
11. Conclusão otimista.
12. Modal de regras alcançável por botão no header.
13. Scroll com `padding-bottom:40px`; FAB não cobre o "Agendar" do último card.
14. Copy do estado vazio preservada ("Nenhuma tarefa pendente.").
15. Nenhum hexadecimal fora dos literais permitidos; spacing só até 24 (+ reserva de 40).

## Armadilhas conhecidas desta tela

- **Badge da barra mudou de número** — sinal de que o recorte por papel foi alterado. É a regressão mais séria desta tela.
- **Badge e régua com a mesma variável** — a régua desaparece no escuro. Já aconteceu.
- **FAB cobrindo o "Agendar"** do último card ao rolar.
- **Kanban portado do desktop** com rolagem horizontal.
- **Ações com 32px.**

## Conferência

- Abrir em **390 × 844** (DevTools, iPhone 14) e comparar com o screenshot
- Testar com o **polegar**: todo alvo tem 48px?
- Alternar o tema e repetir no **escuro**
- No PWA instalado: nada embaixo da barra de gestos
