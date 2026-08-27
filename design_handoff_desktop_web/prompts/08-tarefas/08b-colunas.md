# 08b — Colunas do kanban

**Tela:** Tarefas  ·  **Arquivo:** `src/screens/TarefasScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *5. Tarefas (kanban)*
**Escopo:** só o container e o cabeçalho das colunas

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- `padding:24px`, `display:flex; gap:16px; overflow-x:auto; align-items:flex-start; padding-bottom:8px`.
- Coluna: `width:380px; flex:0 0 380px`, fundo `--surface`, borda 1px `--border`, raio 8, sombra `0 2px 4px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`. O `kanbanColuna` atual tem `width:360` — **380**, que 360 aperta com dois botões no card.
- Cabeçalho: `padding:16px`, borda inferior 1px `--border`, `justify-content:space-between`. Dot 10px + título 14/20/0.1 peso 600 `--text`; contagem em pill à direita (`min-width:24px; height:24px; padding:0 8px`, raio 9999, 12/24/0.5 peso 700).
- **Cores:** Atrasadas `#C8131B` com pill `#FAE8E9`/`#94090F` · Hoje `#FFB32F` com pill `#FFF8EB`/`#99670F` · Próximas `#0ea5e9` com pill `#E6F7FF`/`#016999`.
- Corpo: `padding:12px; display:flex; flex-direction:column; gap:12px`.

## Pronto quando

- [ ] três colunas de 380px
- [ ] dot e pill com as cores certas por coluna
- [ ] contagem correta em cada pill
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
