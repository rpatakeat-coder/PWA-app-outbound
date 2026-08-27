# 09d — Heatmap e exportação

**Tela:** Gestor  ·  **Arquivo:** `src/screens/GestorScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *6. Painel do gestor*
**Escopo:** só a coluna de 4fr ao lado do funil

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Coluna `display:flex; flex-direction:column; gap:24px`.
- Card do heatmap: `padding:24px`, mesma casca dos outros. Título 16/24/0.15 peso 700, `margin-bottom:16px`.
- Grade: `grid-template-columns:repeat(7,28px); gap:4px`. Célula **28×28**, raio 4. Três níveis: vazio `--surface-3` · 1–2 `#8FE0D5` · 3+ `#1D9688`.
- **Hoje sem visita = tracejado `1.5px dashed #C8131B`** na célula. Detalhe pequeno e fácil de esquecer.
- `title` na célula com a contagem, para tooltip nativo.
- Legenda abaixo, `margin-top:16px`, gap 12: quadrado 12px raio 2 + rótulo 11/16/0.5 peso 600 `--text-faint` — `0`, `1–2`, `3+`.
- Abaixo do card: "Exportar relatório completo" — Large outline em `#1D9688`, altura 40, raio 12, ícone `download` 24px, **rótulo flush-left**. Chama a edge `export-report` — **não mexa no payload nem no fluxo de signed URL**.

## Pronto quando

- [ ] células 28×28 com os três níveis
- [ ] **hoje-vazio com borda tracejada vermelha**
- [ ] legenda com os três degraus
- [ ] exportação funcionando, rótulo flush-left
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
