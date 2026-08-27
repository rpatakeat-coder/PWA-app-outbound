# Prompt 02 — Extrair Rota, Agenda e Tarefas do App.tsx

Cole este prompt inteiro no Claude Code, na raiz do repo `PWA-app-outbound`.
Rode **um prompt por vez** e confira o resultado antes de passar para o próximo.

**Contexto obrigatório**: leia `design_handoff_desktop_web/README.md` antes de editar — as seções *Design Tokens*, *Grid e chrome global* e a de tela específica citada abaixo. Todos os valores vêm de lá. Não invente cor, espaçamento, raio ou tamanho de tipo.

**Esta tarefa é refactor puro. Nada muda visualmente. Não aplique design nenhum aqui.**

É o passo que destrava os prompts 06, 07 e 08: hoje as três telas são funções dentro de um arquivo de 8.445 linhas, e por isso não cabem numa sessão de edição.

## O que extrair

| Função | Linhas aprox. | Arquivo destino |
|---|---|---|
`renderRouteScreen` | ~2699–3160 | `src/screens/RotaScreen.tsx` |
`renderTasksScreen` | ~3160–3384 | `src/screens/TarefasScreen.tsx` |
`renderAgendaScreen` | ~3384–3984 | `src/screens/AgendaScreen.tsx` |

Localize pelo nome da função, não pela linha.

## Como

Para cada uma, na ordem (menor primeiro: Tarefas → Rota → Agenda):

1. Leia a função inteira e liste **tudo que ela usa do escopo do componente pai** — estado, dados de hooks, handlers, `layout`, `insets`, `iconColors`, `styles`.
2. Crie o arquivo novo exportando um componente que recebe esses itens **por props**, com uma `interface Props` explícita e tipada. Sem `any`.
3. Os estilos: mova para o novo arquivo **apenas os que só aquela tela usa**. Os compartilhados (`panelCard`, `panelTitle`, `panelHint`, `emptyState`, `emptyStateText`, `clientCard`, botões) ficam onde estão e passam a ser importados — extraia-os para `src/screens/sharedStyles.ts` se for mais limpo que importar de `App.tsx`.
4. No `App.tsx`, substitua a chamada pelo componente novo, passando as props.
5. `npm run typecheck` **depois de cada uma**, antes de começar a próxima.

## Pontos de atenção

- `renderRouteScreen` compõe diferente por largura (`layout.ehCelular` vs `ehDesktop`) — preserve essa lógica exatamente.
- `renderAgendaScreen` monta `allAgendaItems` juntando `routeStops`, reuniões e follow-ups. Esse cálculo pode ir para o componente novo, mas confira se alguém mais no `App.tsx` usa o resultado.
- `renderTasksScreen` usa `visibleTasks` / `tasksActiveVendor`, que são **compartilhados com o badge da barra de navegação**. Esses cálculos ficam no `App.tsx` e vão por props.
- `renderMeetingChip` (~L6070) é usado pela Agenda e pela ficha do lead. Não mova: passe por prop ou extraia para um componente próprio usado pelos dois.

## Pronto quando

- [ ] os três arquivos existem, com `interface Props` tipada, sem `any`
- [ ] `App.tsx` encolheu ~1.300 linhas
- [ ] `npm run typecheck` limpo
- [ ] **as três telas estão pixel-idênticas ao que eram antes** — abra e compare; se algo mudou, foi erro de extração
- [ ] `npm run lint` sem erro novo
