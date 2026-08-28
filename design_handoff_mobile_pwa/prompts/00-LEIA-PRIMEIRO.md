# Como aplicar o redesign mobile com o Claude Code

## Por que em prompts pequenos

`App.tsx` tem **8.445 linhas / 383 KB**. Três das telas (Rota, Agenda, Tarefas) são funções de render dentro dele, de 200 a 600 linhas cada. Pedir "aplique o README" faz o Claude Code editar o que está à mão e parar antes das telas grandes — e, quando chega nelas, pula detalhes.

Cada arquivo aqui é **uma tarefa fechada**, do tamanho de um diff que dá para revisar. Rode um por vez, leia a resposta, confira no aparelho, siga.

## Estrutura

Cada tela tem prompts de **aplicação** (`a`, `b`, `c`…) e um de **revisão** (`R`). O de revisão **audita primeiro** — responde OK / FALTA / DIVERGE item por item, sem editar — e só corrige depois que você confirma. É o que pega os detalhes pequenos.

## Sequência

| Pasta | O que | Prompts |
|---|---|---|
`01-base/` | tokens, contraste no escuro, fonte | `01a` `01b` `01c` |
`02-extrair/` | **refactor sem mudança visual** | `02a` `02b` `02c` |
`03-casca/` | bottom nav de 4 abas + FAB, headers | `03a` `03b` + `03R` |
`04-mapa/` | Mapa e Lista | `04a`…`04d` + `04R` |
`05-rota/` | Rota | `05a` `05b` + `05R` |
`06-agenda/` | Agenda | `06a` `06b` + `06R` |
`07-tarefas/` | Tarefas | `07a` `07b` + `07R` |
`08-gestor-e-meu/` | Gestor e Meu desempenho | `08a` `08b` `08c` + `08R` |
`09-ficha-e-sheets/` | Ficha, etapa, agendar, cadastro | `09a`…`09d` + `09R` |
`10-perfil-e-config/` | Menu do perfil e **Configurações** | `10a` `10b` + `10R` |
`11-login/` | Login | `11a` + `11R` |

## Os três prompts que mais importam

- **`02-extrair/`** — não muda nada visualmente, mas é o que faz Rota, Agenda e Tarefas caberem numa sessão. Sem ele, `05`, `06` e `07` falham por tamanho de arquivo.
- **`03-casca/`** — a barra de 4 abas + FAB tem duas armadilhas que já custaram retrabalho: o badge precisa se ancorar no **ícone** (não no botão, que tem 73px e joga o badge em cima do ícone) e todo conteúdo encostado no rodapé precisa reservar **40px** para o FAB. Estão documentadas no prompt.
- **`08a`** — só lê os hooks e relata quais métricas existem. **Não pule**; sem ele o Gestor vira invenção de métrica.

## Regra em todos os prompts

Cada um diz: **não toque em outra região nem em outro arquivo**. Se encontrar algo errado fora do escopo, anota e segue — a revisão pega depois. É isso que impede uma tarefa de virar cinco meio-feitas.

## Ao fim de cada prompt

Ele responde em três linhas: o que mudou, o que ficou fora do escopo, e o que do README não deu para aplicar e por quê. **Leia a terceira linha.**

## Como conferir

1. `npm start`, DevTools em **390 × 844** (iPhone 14)
2. Comparar com o screenshot em `design_handoff_mobile_pwa/screenshots/`
3. Alternar o tema e repetir no **escuro**
4. `npm run build && npm run serve` e instalar como PWA: conferir área segura no rodapé
5. `npm run typecheck`

## Tokens mobile ≠ desktop

O erro mais comum ao aplicar os dois pacotes é copiar valor de um no outro:

| | Mobile | Desktop |
|---|---|---|
Input | 48px, raio **16** | 40px, raio 8 |
Botão | 48px, raio 12, tipo 16/600 | 40px, raio 12, tipo 14/600 |
Card | raio **16** | raio 8 |
Maior tipo | Title Medium **18/24** | Title Large 22/28, Heading 24–28 |
Spacing | até **24** | até 40 |
Alvo | **48px** | 40px |
