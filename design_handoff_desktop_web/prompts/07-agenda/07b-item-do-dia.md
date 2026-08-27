# 07b — Item dentro da coluna

**Tela:** Agenda  ·  **Arquivo:** `src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *4. Agenda*
**Escopo:** só o item de compromisso

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Item: `padding:8px`, raio 4, **borda esquerda 3px na cor do tipo**, fundo = tint do tipo no claro / `--surface-2` no escuro.
- Conteúdo: hora (11/16/0.5, peso 700, na cor do tipo, `tabular-nums`), título (12/16/0.4, peso 600, `--text`), sublinha (11/16/0.5, `--text-faint`).
- **Três tipos, cores fixas:** Rota `#C8131B` (tint `#FAE8E9`) · Demo `#7c3aed` (tint `#F1EBFE`) · Follow-up `#01AFFF` (tint `#E6F7FF`).
- As três fontes de dados continuam entrando: `routeStops`, reuniões e follow-ups — é o `allAgendaItems` que já existe.
- Clique no item abre o que já abre hoje (ficha ou reagendamento). Não mude o comportamento.
- Coluna sem compromisso: usar o `calVazio` que já existe.

## Pronto quando

- [ ] os três tipos com cor e tint corretos
- [ ] as três fontes de dados aparecem
- [ ] hora com `tabular-nums`
- [ ] clique preserva o comportamento atual
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
