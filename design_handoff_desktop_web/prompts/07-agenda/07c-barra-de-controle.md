# 07c — Barra de navegação e legenda

**Tela:** Agenda  ·  **Arquivo:** `src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *4. Agenda*
**Escopo:** só a barra acima da grade

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- `margin-bottom:16px`, `display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap`.
- Esquerda: seta 32×32 raio 4 borda 1px `--stroke-default` · intervalo da semana (18/24, peso 600, `--text`) · seta · botão "Hoje" (Small: altura 32, `padding:0 12px`, raio 4, borda 1px `--stroke-default`, 12/16/0.5 peso 600).
- Direita: legenda dos três tipos (quadrado 10px raio 2 + rótulo 12/16/0.5 peso 600 `--text-muted`) e, com `margin-left:8px`, "Exportar JSON" — Large outline em `#1D9688`, ícone `download` 24px.
- Filtro por vendedor (só gestor): entra nesta barra, à esquerda da legenda.
- A exportação chama a edge `export-agenda`. **Não mexa no payload nem no fluxo de signed URL.**

## Pronto quando

- [ ] navegação de semana e "Hoje" funcionam
- [ ] legenda com os três tipos
- [ ] exportação JSON funcionando
- [ ] filtro por vendedor presente para gestor
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
