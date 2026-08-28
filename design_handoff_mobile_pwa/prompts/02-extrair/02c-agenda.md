# 02c — Extrair Agenda do App.tsx

**Tela:** Extração: Agenda  ·  **Arquivo:** `App.tsx → src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *Onde cada tela vive no código*
**Escopo:** só a função `renderAgendaScreen` (~L3384–3984)

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24 (32 e 40 são desktop, com uma exceção documentada). Não copie valor de desktop.

## Fazer

- **Refactor puro. Nada muda visualmente.** Se a tela ficar diferente, foi erro de extração.
- Ler `renderAgendaScreen` inteira e listar tudo que usa do escopo do pai — estado, dados de hooks, handlers, `layout`, `insets`, `iconColors`, `styles`.
- Criar `src/screens/AgendaScreen.tsx` recebendo esses itens **por props**, com `interface Props` tipada. Sem `any`.
- Mover só os estilos exclusivos desta tela. Os compartilhados ficam e passam a ser importados (ou vão para `src/screens/sharedStyles.ts`).
- **Atenção:** `allAgendaItems` junta `routeStops`, reuniões e follow-ups — confira se alguém mais usa o resultado.
- `renderMeetingChip` (~L6070) é usado pela Agenda **e pela ficha do lead**. Não mova: prop ou componente próprio.

## Não fazer

- Não aplique design nenhum aqui.
- Não mexa em outra das três telas neste prompt.

## Pronto quando

- [ ] `src/screens/AgendaScreen.tsx` existe com `interface Props` tipada
- [ ] **a tela está pixel-idêntica ao que era antes**
- [ ] `npm run lint` sem erro novo
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
