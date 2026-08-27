# Como aplicar este redesign com o Claude Code

## Por que em prompts pequenos

`App.tsx` tem **8.445 linhas / 383 KB**. Três das telas (Rota, Agenda, Tarefas) são funções de render dentro dele, de 200 a 600 linhas cada; `GestorScreen.tsx` tem 47 KB. Pedir "aplique o README" faz o Claude Code editar o que está à mão e parar antes das telas grandes — e, mesmo quando chega nelas, pula detalhes.

Cada arquivo aqui é **uma tarefa fechada**, do tamanho de um diff que dá para revisar. Rode um por vez, leia a resposta, confira na tela, siga.

## Estrutura

Cada tela tem prompts de **aplicação** (`a`, `b`, `c`…) e um de **revisão** (`R`).

O prompt de revisão trabalha em duas fases: **audita primeiro** (responde OK / FALTA / DIVERGE item por item, sem editar) e só corrige depois que você confirma. É o que pega os detalhes pequenos que passaram.

## Sequência

### Pendente

| Pasta | O que | Prompts |
|---|---|---|
`01-base/` | tokens, contraste no escuro, fonte | `01a` `01b` `01c` |
`02-extrair/` | **refactor sem mudança visual** | `02a` `02b` `02c` |
`06-rota/` | Rota | `06a`…`06e` + `06R` |
`07-agenda/` | Agenda | `07a`…`07d` + `07R` |
`08-tarefas/` | Tarefas | `08a`…`08d` + `08R` |
`09-gestor/` | Painel do gestor | `09a`…`09f` + `09R` |
`10-meu-desempenho/` | Meu desempenho | `10a` `10b` `10c` + `10R` |

### Já aplicado — só revisão

| Pasta | O que |
|---|---|
`03-casca/` | `03R` — sidebar colapsável e header |
`04-mapa/` | `04R` — mapa com painel de trabalho |
`05-lista/` | `05R` — lista em tabela |
`11-ficha-e-modais/` | `11R` — drawer da ficha e os três modais |
`12-login/` | `12R` — login fora da casca |

Rode essas cinco revisões **antes** de seguir para as pendentes: elas dizem o que ficou incompleto nas tentativas anteriores, e algumas correções (a casca, principalmente) afetam todas as telas.

## Dois prompts que não editam código

`09a-inventario.md` e `10a-inventario.md` só leem e relatam. **Não pule.** Sem eles, o redesign do Gestor e do Meu desempenho vira invenção de métrica — foi o que aconteceu antes.

## O prompt que destrava

`02-extrair/` não muda nada visualmente: tira Rota, Agenda e Tarefas do `App.tsx` para arquivos próprios. Depois disso cada tela cabe numa sessão e os prompts 06–08 funcionam. **Sem ele, eles vão falhar de novo.**

## Regra em todos os prompts

Cada um diz explicitamente: **não toque em outra região nem em outro arquivo**. Se o Claude Code encontrar algo errado fora do escopo, ele anota e segue — a revisão pega depois. É isso que impede uma tarefa de virar cinco meio-feitas.

## Ao fim de cada prompt

Ele responde em três linhas: o que mudou, o que ficou fora do escopo, e o que do README não deu para aplicar e por quê. **Leia a terceira linha** — é onde aparece divergência entre o design e o que o código permite.

## Como conferir

1. `npm start`, abra a tela em **1440px**
2. Compare com o screenshot em `design_handoff_desktop_web/screenshots/`
3. **1024px** e **900px** — nada corta nem sobrepõe
4. Alterne o tema e repita no **escuro**
5. `npm run typecheck`

## Se você já aplicou parcialmente

`git status` e decida: continuar de onde parou (rodando as revisões primeiro), ou `git checkout` e começar pelo `01a`.
