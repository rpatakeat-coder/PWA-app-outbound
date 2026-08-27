# 08d — Regras, filtro e queda abaixo de 1024px

**Tela:** Tarefas  ·  **Arquivo:** `src/screens/TarefasScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *5. Tarefas (kanban)*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- O card **"Como as tarefas são geradas"** (`taskRulesCard`) vira um botão de ajuda no topo da tela, abrindo o **mesmo modal que já existe**. Não ocupe uma coluna com ele.
- Filtro por vendedor (gestor): topo da tela, acima das colunas.
- **Abaixo de 1024px**: volta a lista única atual. Kanban com rolagem horizontal não serve no celular. A lista atual **não pode ser deletada**.
- Estado vazio por coluna e estado vazio geral: manter a copy atual — *"Nenhuma tarefa pendente."*

## Pronto quando

- [ ] o modal de regras continua alcançável
- [ ] filtro por vendedor no topo
- [ ] abaixo de 1024px cai para lista única intacta
- [ ] copy do estado vazio preservada
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
