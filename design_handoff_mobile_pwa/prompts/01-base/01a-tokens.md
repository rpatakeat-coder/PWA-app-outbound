# 01a — Três tokens que faltam

**Tela:** Base  ·  **Arquivo:** `public/index.html`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *Design Tokens*
**Escopo:** só o bloco `<style id="takeat-theme">`

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24 (32 e 40 são desktop, com uma exceção documentada). Não copie valor de desktop.

## Fazer

- Adicionar ao `:root` claro: `--stroke-default:#C6C6C6`, `--stroke-strong:#7A7A7A`, `--text-disabled:#C6C6C6`.
- Declarar os pares escuros como `--d-stroke-default:rgba(255,255,255,.14)`, `--d-stroke-strong:rgba(255,255,255,.24)`, `--d-text-disabled:rgba(255,255,255,.28)`.
- Apontar os três nos **dois** seletores de tema escuro — o `@media (prefers-color-scheme: dark)` e o `:root[data-theme='dark']`.

## Não fazer

- Não renomeie nem remova token existente.
- Não mexa no `<style id="expo-reset">` — é ele que resolve `100dvh` e a área segura.

## Pronto quando

- [ ] os três resolvem nos dois temas
- [ ] os dois seletores escuros listam os três
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
