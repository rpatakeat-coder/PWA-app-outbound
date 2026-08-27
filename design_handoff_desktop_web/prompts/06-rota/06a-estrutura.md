# 06a — Estrutura em duas colunas

**Tela:** Rota  ·  **Arquivo:** `src/screens/RotaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *3. Rota do dia*
**Escopo:** só o container da tela — nada de conteúdo ainda

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Trocar a coluna única por `display:flex; height:calc(100vh - 64px)`.
- Mapa à esquerda com `flex:1; min-width:0`.
- Rail à direita com `width:420px; flex:0 0 420px`, fundo `--surface`, borda esquerda 1px `--border`, `display:flex; flex-direction:column`.
- Dentro do rail, três faixas vazias por enquanto: topo (`flex:0 0 auto`), lista (`flex:1; overflow-y:auto`), rodapé (`flex:0 0 auto`).
- Abaixo de 1024px (`!layout.ehDesktop`), voltar à coluna única atual — o mapa vira faixa e os cartões empilham, como hoje.

## Não fazer

- Não estilize o conteúdo ainda. O objetivo é só a caixa certa.

## Pronto quando

- [ ] mapa e rail lado a lado em 1440px
- [ ] coluna única abaixo de 1024px
- [ ] nada de conteúdo perdido — pode estar fora de lugar, mas presente
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
