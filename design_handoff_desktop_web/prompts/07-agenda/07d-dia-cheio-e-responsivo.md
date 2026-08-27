# 07d — Dia cheio e queda abaixo de 1024px

**Tela:** Agenda  ·  **Arquivo:** `src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *4. Agenda*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- **Dia cheio:** um dia com muitos compromissos estoura os 520px. Escolha **uma** solução e aplique nas sete colunas: (a) corpo da coluna rolável, ou (b) "+N mais" abrindo o dia no drawer padrão de 480px. Declare qual escolheu.
- **Abaixo de 1024px** (`!layout.ehDesktop`): volta a lista cronológica atual (passado / hoje / futuro com `renderMeetingChip`). O calendário de sete colunas é desktop. A lista atual **não pode ser deletada** por isso.
- Conferir em 900px que nada vaza da coluna nem sobrepõe.

## Pronto quando

- [ ] solução de dia cheio escolhida, declarada e aplicada nas sete colunas
- [ ] abaixo de 1024px cai para a lista cronológica intacta
- [ ] nada vaza em 1024px nem em 900px
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
