# 04c — Peek sheet do lead mais próximo

**Tela:** Mapa / Lista  ·  **Arquivo:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *1. Mapa / Lista*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Ancorado no rodapé do mapa: `padding:16px 16px 40px`, raio `16px 16px 0 0`, fundo `--surface`, sombra `0 -4px 16px rgba(0,0,0,.14)`.
- **Os 40px de `padding-bottom` não são decorativos** — são 16 + os 24px que o FAB invade acima da barra. Sem eles o círculo vermelho cai em cima do "Check-in".
- Handle 36×4 raio 2 centralizado, `margin-bottom:12px`.
- Linha: barra de temperatura 4px `align-self:stretch` `min-height:44px` + nome 16/24/0.15 peso 600 + sublinha `{etapa} · {dist} · {n}ª visita` 12/16/0.4 `--text-faint` + badge de temperatura à direita.
- Ações gap 8: **"Check-in"** (`flex:1`, altura 48, raio 12, fundo `#27A84C`, texto 16/24/0.15 peso 600 branco, ícone `where_to_vote` 24px) · `navigation` 48×48 outline · `call` 48×48 outline.
- Arrastar para cima abre a ficha completa; para baixo colapsa.

## Pronto quando

- [ ] `padding-bottom:40px` presente e o FAB não toca o "Check-in"
- [ ] três ações com 48px
- [ ] arraste para cima abre a ficha
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
