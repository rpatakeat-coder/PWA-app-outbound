# 06a — Header e tira da semana

**Tela:** Agenda  ·  **Arquivo:** `src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *3. Agenda*
**Escopo:** header e seletor de dia

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Header `padding:12px 16px`: título "Agenda" 18/24 peso 600 + avatar 48px à direita.
- **Tira da semana** `margin-top:12px`, gap 6: sete botões `flex:1`, `min-height:48px`, raio 12, coluna centralizada gap 2 — dia (11/16/0.5 peso 600, opacidade .8), número (14/20/0.1 peso 700 `tabular-nums`), dot 4px indicando se há compromisso.
- Hoje: fundo `#fff`, texto `#C8131B` (no escuro `#1E1E1E`), dot `#C8131B`. Outros: fundo `rgba(255,255,255,.14)`, texto branco, dot `rgba(255,255,255,.6)`.
- **O calendário de 7 colunas do desktop não cabe em 390px.** A tira dá a visão da semana; o corpo mostra **um dia**. Estado novo: `diaSelecionado`.

## Pronto quando

- [ ] sete botões de 48px na tira
- [ ] hoje destacado com fundo branco
- [ ] trocar o dia troca o conteúdo do corpo
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
