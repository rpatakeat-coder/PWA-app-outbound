# 07a — Abas de estado e agrupamento

**Tela:** Tarefas  ·  **Arquivo:** `src/screens/TarefasScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *4. Tarefas*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Header `padding:12px 16px`: "Tarefas" 18/24 peso 600 + sublinha "`{n}` atrasadas · `{n}` para hoje" 12/16/0.4 `rgba(255,255,255,.8)`; avatar 48px.
- **Abas de estado** (não kanban): faixa `padding:12px 16px`, fundo `--surface`, borda inferior 1px `--border`, gap 8. Três botões `flex:1`, altura 40, raio 12 nas pontas, 12/16/0.5 peso 600. Ativo `#C8131B`/branco; inativo `--surface-2`/`--text-muted`. **Atrasadas · Hoje · Próximas**, com a contagem no rótulo.
- **O kanban de três colunas do desktop não serve aqui**: rolagem horizontal em app de campo é toque errado garantido.
- Agrupamento por `src/utils/sla.ts` + vencimento: passado / hoje / futuro. **Não invente critério.** Se o campo não existir como esperado, pare e relate.
- `visibleTasks` e `tasksActiveVendor` **não mudam** — e **o badge da barra tem de mostrar o mesmo número de antes**.

## Não fazer

- Não mexa em `sla.ts` nem em `useClientTasks`.

## Pronto quando

- [ ] três abas de estado com contagem
- [ ] critério vindo de `sla.ts`
- [ ] **badge da barra com o mesmo número de antes**
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
