# 06b — Timeline do dia

**Tela:** Agenda  ·  **Arquivo:** `src/screens/AgendaScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *3. Agenda*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Scroll `padding:16px 16px 40px` (reserva do FAB), coluna gap 16.
- Cada item é uma linha de duas colunas gap 12: coluna de hora com **52px fixos** (`flex:0 0 52px`) — hora 14/20/0.1 peso 700 `--text` `tabular-nums` sobre duração 11/16/0.5 `--text-faint` — e o card `flex:1`.
- Card: `padding:16px`, raio **16**, fundo `--surface`, borda 1px `--border`, **borda esquerda 4px da cor do tipo**, sombra 01. Ícone 20px da cor do tipo + título 16/24/0.15 peso 600; sublinha 12/16/0.4 `--text-faint`.
- **Tipos:** Rota `#C8131B` (`directions_car`) · Demo `#7c3aed` (`event`) · Follow-up `#01AFFF` (`phone_in_talk`).
- Compromissos agendáveis mostram "Reagendar" (altura 48, raio 12, `--tint-red`/`--tint-red-text`) e "Cancelar" (altura 48 outline), gap 8, `margin-top:12px`.
- As três fontes continuam entrando: `routeStops`, reuniões e follow-ups.

## Pronto quando

- [ ] coluna de hora com 52px fixos
- [ ] os três tipos com cor e ícone corretos
- [ ] ações com 48px
- [ ] reserva de 40px no fim do scroll
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
