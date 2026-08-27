# 01b — Contraste no modo escuro

**Tela:** Base  ·  **Arquivo:** `vários (busca no repo)`
**Referência:** `design_handoff_desktop_web/README.md`, seção *Correção de contraste no modo escuro*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Buscar no repo por `#94090F`, `#167532`, `#1D9688` e `#018CCC`.
- **Classificar cada ocorrência** antes de mudar: (a) cor de texto/ícone sobre superfície do tema → trocar pelo token (`--tint-red-text`, `--tint-green-text`, `--info-text`); (b) texto sobre fundo tonal claro (`#FAE8E9`, `#FFF8EB`, `#EAF7EE`) → **deixar como está**, esses fundos não mudam com o tema; (c) fundo ou borda decorativa → avaliar caso a caso.
- Confirmar que no bloco escuro `--tint-green-text` é `#77BD8B` e `--info-text` é `#66CFFF`.
- Onde faltar par escuro para verde/teal/azul usados como texto, criar seguindo o padrão `--d-*`.

## Não fazer

- Não troque as cores de temperatura do funil (`TEMP_COLORS`) — são literais de propósito e não invertem.

## Pronto quando

- [ ] você listou cada ocorrência com a classificação (a/b/c) antes de editar
- [ ] nenhum dos quatro hexes sobrou como cor de texto sobre superfície do tema
- [ ] os fundos tonais claros continuam com texto escuro nos dois temas
- [ ] `npm run typecheck` limpo
- [ ] nenhum arquivo além de `vários (busca no repo)` no diff

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
