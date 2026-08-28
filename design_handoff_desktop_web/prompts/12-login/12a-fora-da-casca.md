# 12a — Tirar o login de dentro da casca

**Tela:** Login  ·  **Arquivo:** `App.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *8. Login*
**Escopo:** só o roteamento — o visual do login é o 12b

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Hoje, quando não autenticado, a tela de login renderiza **dentro** do shell: sidebar, header, busca, sino de avisos, avatar e CTA "Novo lead" ficam na tela. Um usuário deslogado não pode ter navegação, badge de tarefas, avatar identificado nem ação de criar lead.
- Fazer a sidebar e o header renderizarem **condicionalmente** — só quando autenticado. O login é irmão do shell, não filho.
- O recuo do conteúdo (`paddingLeft`/`marginLeft` de 72px, `LARGURA_LATERAL`) vai a zero no login.
- A altura do login passa a ser `100vh`, não `calc(100vh - 64px)` — não há header.

## Não fazer

- Não mexa no `AuthContext` nem no fluxo de autenticação.

## Pronto quando

- [ ] com sessão deslogada: **nenhuma** sidebar, header, busca, sino, avatar ou CTA na tela
- [ ] o login ocupa 100vh
- [ ] ao autenticar, o shell aparece normalmente
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
