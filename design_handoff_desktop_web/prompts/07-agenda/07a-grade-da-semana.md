# 07a — Grade de sete colunas

**Tela:** Agenda  ·  **Arquivo:** `src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *4. Agenda*
**Escopo:** só a grade e a coluna de dia — itens no próximo prompt

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- `padding:24px`. Grade `display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:8px`.
- Coluna de dia: fundo `--surface`, borda 1px `--border`, raio 8, `min-height:520px`, `display:flex; flex-direction:column; overflow:hidden`.
- Cabeçalho da coluna: `padding:12px`, borda inferior 1px `--border`. Dia da semana minúsculo (11/16/0.5, peso 600, uppercase, `--text-faint`) sobre o número (20/28, peso 600, `--text`, `tabular-nums`).
- **Hoje**: borda da coluna `#C8131B`, fundo do cabeçalho `--tint-red`, textos do cabeçalho `--tint-red-text`.
- Corpo da coluna: `flex:1; padding:8px; display:flex; flex-direction:column; gap:8px`.
- Já existem estilos `calSemana`, `calDia`, `calDiaHoje`, `calDiaTitulo`, `calVazio`, `calNav`, `calNavBotao` marcados como só-desktop. **Reaproveite e ajuste aos tokens** em vez de criar um conjunto paralelo.

## Não fazer

- Não renderize os itens ainda.
- Não remova a lista cronológica atual — ela volta abaixo de 1024px (prompt 07d).

## Pronto quando

- [ ] sete colunas iguais em 1440px
- [ ] hoje destacado com borda e cabeçalho tintados
- [ ] os estilos `cal*` reaproveitados, não duplicados
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
