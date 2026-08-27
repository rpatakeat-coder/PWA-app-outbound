# 01c — Peso 700 da Poppins e conferência de breakpoints

**Tela:** Base  ·  **Arquivo:** `public/index.html + src/hooks/useLayout.ts`
**Referência:** `design_handoff_desktop_web/README.md`, seção *Tipografia / Responsive behavior*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- No `<link>` do Google Fonts: `wght@400;500;600;800` → `wght@400;500;600;700;800`. O redesign usa 700 em título de página e nav ativa.
- Abrir `src/hooks/useLayout.ts` e **confirmar** (não mudar) que `alvo: ehDesktop ? 40 : 48` está lá e que os cortes são 768 e 1024.
- Se algum consumidor do hook precisar distinguir tablet de desktop e não conseguir com `ehLargo`/`ehDesktop`, relate — não adicione campo por conta própria.

## Pronto quando

- [ ] Poppins 700 carrega (conferir em Network que o peso veio)
- [ ] o hook não mudou, ou a mudança foi relatada e justificada
- [ ] `npm run typecheck` limpo
- [ ] nenhum arquivo além de `public/index.html + src/hooks/useLayout.ts` no diff

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
