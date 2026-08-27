# 02c — Extrair Agenda do App.tsx

**Tela:** Extração: Agenda  ·  **Arquivo:** `App.tsx → src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *Onde cada tela vive no código*
**Escopo:** só a função `renderAgendaScreen` (~L3384–3984)

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- **Refactor puro. Nada muda visualmente.** Se a tela ficar diferente, foi erro de extração.
- Ler `renderAgendaScreen` inteira e listar tudo que ela usa do escopo do componente pai — estado, dados de hooks, handlers, `layout`, `insets`, `iconColors`, `styles`.
- Criar `src/screens/AgendaScreen.tsx` com um componente que recebe esses itens **por props**, com `interface Props` explícita e tipada. Sem `any`.
- Mover só os estilos que **apenas esta tela** usa. Os compartilhados (`panelCard`, `panelTitle`, `panelHint`, `emptyState`, `emptyStateText`, `clientCard`, botões) ficam onde estão e passam a ser importados — se ficar feio importar de `App.tsx`, extraia para `src/screens/sharedStyles.ts`.
- No `App.tsx`, substituir a chamada pelo componente novo.
- **Atenção:** `allAgendaItems` junta `routeStops`, reuniões e follow-ups. O cálculo pode ir para o componente novo, mas confira se alguém mais no `App.tsx` usa o resultado.
- `renderMeetingChip` (~L6070) é usado pela Agenda **e pela ficha do lead**. Não mova: passe por prop ou extraia para componente próprio usado pelos dois.

## Não fazer

- Não aplique design nenhum aqui.
- Não renomeie variável nem função de negócio.
- Não mexa em outra das três telas neste prompt.

## Pronto quando

- [ ] `src/screens/AgendaScreen.tsx` existe com `interface Props` tipada, sem `any`
- [ ] **a tela está pixel-idêntica ao que era antes** — abra e compare
- [ ] `npm run lint` sem erro novo
- [ ] `npm run typecheck` limpo
- [ ] nenhum arquivo além de `App.tsx → src/screens/AgendaScreen.tsx` no diff

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
