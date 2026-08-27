# 08a — Critério das três colunas

**Tela:** Tarefas  ·  **Arquivo:** `src/screens/TarefasScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *5. Tarefas (kanban)*
**Escopo:** só a lógica de agrupamento — visual no próximo prompt

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Agrupar as tarefas em **Atrasadas · Hoje · Próximas** usando `src/utils/sla.ts` e o campo de vencimento da task. **Atrasadas** = vencimento no passado; **Hoje** = vence hoje; **Próximas** = futuro.
- **Não invente critério.** Se o campo de vencimento não existir como você espera, pare e relate qual campo encontrou.
- `visibleTasks` e `tasksActiveVendor` — o recorte por papel (gestor vê todas, vendedor vê as suas) — **não mudam**. O agrupamento acontece depois deles.
- O badge da barra de navegação lê a mesma contagem. **Confira que o número continua idêntico** ao de antes.

## Não fazer

- Não mexa em `sla.ts` nem em `useClientTasks`.

## Pronto quando

- [ ] os três grupos vêm de `sla.ts` / vencimento, não de heurística nova
- [ ] **o badge da nav mostra o mesmo número que antes**
- [ ] você relatou o nome exato do campo de vencimento usado
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
