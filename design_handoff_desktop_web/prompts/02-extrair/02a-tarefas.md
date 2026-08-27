# 02a — Extrair Tarefas do App.tsx

**Tela:** Extração: Tarefas  ·  **Arquivo:** `App.tsx → src/screens/TarefasScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *Onde cada tela vive no código*
**Escopo:** só a função `renderTasksScreen` (~L3160–3384)

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- **Refactor puro. Nada muda visualmente.** Se a tela ficar diferente, foi erro de extração.
- Ler `renderTasksScreen` inteira e listar tudo que ela usa do escopo do componente pai — estado, dados de hooks, handlers, `layout`, `insets`, `iconColors`, `styles`.
- Criar `src/screens/TarefasScreen.tsx` com um componente que recebe esses itens **por props**, com `interface Props` explícita e tipada. Sem `any`.
- Mover só os estilos que **apenas esta tela** usa. Os compartilhados (`panelCard`, `panelTitle`, `panelHint`, `emptyState`, `emptyStateText`, `clientCard`, botões) ficam onde estão e passam a ser importados — se ficar feio importar de `App.tsx`, extraia para `src/screens/sharedStyles.ts`.
- No `App.tsx`, substituir a chamada pelo componente novo.
- **Atenção:** `visibleTasks` e `tasksActiveVendor` são compartilhados com o badge da barra de navegação. Esses cálculos **ficam no `App.tsx`** e vão por props.

## Não fazer

- Não aplique design nenhum aqui.
- Não renomeie variável nem função de negócio.
- Não mexa em outra das três telas neste prompt.

## Pronto quando

- [ ] `src/screens/TarefasScreen.tsx` existe com `interface Props` tipada, sem `any`
- [ ] **a tela está pixel-idêntica ao que era antes** — abra e compare
- [ ] `npm run lint` sem erro novo
- [ ] `npm run typecheck` limpo
- [ ] nenhum arquivo além de `App.tsx → src/screens/TarefasScreen.tsx` no diff

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
