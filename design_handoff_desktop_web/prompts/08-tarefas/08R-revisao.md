# 08R — Revisão: Tarefas

**Arquivos:** `src/screens/TarefasScreen.tsx`, `App.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *5. Tarefas (kanban)* · screenshot `design_handoff_desktop_web/screenshots/05-tarefas.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Agrupamento vem de `sla.ts` / vencimento, não de heurística nova.
2. `visibleTasks` / `tasksActiveVendor` intactos.
3. **Badge da barra de navegação com o mesmo número de antes.**
4. Três colunas de **380px** (não 360), raio 8, borda 1px `--border`, sombra 02.
5. Cabeçalho: dot 10px + título 14/20/0.1 peso 600 + pill de contagem 24px.
6. Cores por coluna: Atrasadas `#C8131B`, Hoje `#FFB32F`, Próximas `#0ea5e9`; pills com os tints correspondentes.
7. Card: `padding:16px`, raio 8, sombra 01, hover em `border-color`.
8. Badge de SLA: D5 `#FAE8E9`/`#94090F`, D2 `#FFF8EB`/`#99670F`, — neutro.
9. Metadados com ícones 16px e texto 11/16/0.5 peso 600.
10. "Agendar" tonal `flex:1` altura 32 **flush-left**; concluir 32×32 outline.
11. Conclusão otimista.
12. Modal de regras alcançável por botão no topo.
13. Filtro por vendedor no topo para gestor.
14. Abaixo de 1024px cai para lista única, que continua existindo.
15. Copy do estado vazio preservada.
16. Nenhum hexadecimal fora dos literais permitidos; spacing na escala 8pt.

## Armadilhas conhecidas desta tela

- **Badge da nav mudou de número** — sinal de que o recorte por papel foi alterado junto com o agrupamento. É a regressão mais séria desta tela.
- **Colunas de 360px** — herdado do `kanbanColuna` atual; o card com dois botões não cabe.
- **Card de regras descartado** em vez de virar botão de ajuda.
- **Lista única deletada** — é o layout abaixo de 1024px.
- **Critério de coluna inventado** ("quente/morno/frio", por exemplo) em vez de vencimento.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
