# 01a — Três tokens que faltam

**Tela:** Base  ·  **Arquivo:** `public/index.html`
**Referência:** `design_handoff_desktop_web/README.md`, seção *Design Tokens*
**Escopo:** só o bloco `<style id="takeat-theme">`

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Adicionar ao `:root` claro: `--stroke-default:#C6C6C6`, `--stroke-strong:#7A7A7A`, `--text-disabled:#C6C6C6`.
- Declarar os pares escuros como `--d-stroke-default:rgba(255,255,255,.14)`, `--d-stroke-strong:rgba(255,255,255,.24)`, `--d-text-disabled:rgba(255,255,255,.28)`, junto dos outros `--d-*`.
- Apontar os três nos **dois** seletores de tema escuro — o `@media (prefers-color-scheme: dark)` e o `:root[data-theme='dark']`. O arquivo já segue esse padrão; siga-o.

## Não fazer

- Não renomeie nem remova token existente.
- Não mexa no `<style id="expo-reset">`.

## Pronto quando

- [ ] os três tokens resolvem no claro e no escuro (inspecionar no browser, aba Computed)
- [ ] os dois seletores escuros listam os três
- [ ] `npm run typecheck` limpo
- [ ] nenhum arquivo além de `public/index.html` no diff

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
