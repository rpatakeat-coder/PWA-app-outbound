# 01c — Poppins 700 e conferência de alvos

**Tela:** Base  ·  **Arquivo:** `public/index.html + src/hooks/useLayout.ts`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *Tipografia / Alvo de toque*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24 (32 e 40 são desktop, com uma exceção documentada). Não copie valor de desktop.

## Fazer

- No `<link>` do Google Fonts: `wght@400;500;600;800` → `wght@400;500;600;700;800`.
- **Confirmar** (não mudar) que `useLayout.ts` devolve `alvo: 48` abaixo de 1024px, e que `styles.navItem` tem `minHeight: 48`.
- Varrer o app por controles abaixo de 48px de altura efetiva no mobile e listar — sem corrigir agora.

## Pronto quando

- [ ] Poppins 700 carrega
- [ ] lista de controles abaixo de 48px entregue
- [ ] o hook não mudou
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
