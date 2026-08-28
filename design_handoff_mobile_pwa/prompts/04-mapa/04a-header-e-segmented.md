# 04a — Header com busca, avatar e segmented

**Tela:** Mapa / Lista  ·  **Arquivo:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *1. Mapa / Lista*
**Escopo:** só o header da tela

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- `padding:12px 16px 8px`, fundo do tema, coluna gap 12.
- Linha 1: campo de busca `flex:1`, altura **48**, `padding:0 16px`, raio **16**, fundo `rgba(255,255,255,.18)`, ícone `search` 20px branco, placeholder 16/24/0.5 `rgba(255,255,255,.7)`. Avatar 48px pill ao lado.
- Linha 2: **segmented Mapa / Lista** — dois botões `flex:1`, altura 40, raio 12 nas pontas (`12px 0 0 12px` / `0 12px 12px 0`), ícone 20px + rótulo 14/20/0.1 peso 600, centralizado. Ativo: fundo `#fff`, texto `#C8131B` (no escuro `#1E1E1E`). Inativo: fundo `rgba(255,255,255,.18)`, texto branco.
- `vistaMapa` é **estado local da tela**, não uma aba da barra.

## Pronto quando

- [ ] busca de 48px raio 16
- [ ] avatar de 48px
- [ ] segmented alterna entre mapa e lista
- [ ] o segmented não virou aba
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
