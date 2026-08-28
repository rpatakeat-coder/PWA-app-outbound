# 05b — Lista de paradas

**Tela:** Rota  ·  **Arquivo:** `src/screens/RotaScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *2. Rota*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Scroll `padding:16px 16px 40px` (reserva do FAB), coluna gap 12.
- Card `padding:16px`, raio **16**, fundo `--surface`, borda 1px — **`#C8131B` na parada atual**, `--border` nas outras. Sombra 01.
- Índice 32px pill, 14/32/0.1 peso 700: concluída `#EAF7EE`/`#167532`, atual `#C8131B`/branco, pendente `--surface-2`/`--text-muted`.
- Nome 16/24/0.15 peso 600 truncado + tag opcional (`padding:2px 6px`, raio 4, 11/16/0.5 peso 600): **Visitado** `#EAF7EE`/`#167532` · **Agora** `--tint-red`/`--tint-red-text` · **SLA** `#FFF8EB`/`#99670F` · **Demo**/**Alvo** `#F1EBFE`/`#5B32C4`.
- Detalhe 12/16/0.4 `--text-faint`: horário, cidade, motivo.
- **Só a parada atual expõe ações**: "Check-in" (`flex:1`, altura 48, raio 12, `#27A84C`, ícone `where_to_vote`) + `navigation` 48×48 outline. As outras ficam limpas — reduz toque errado com o polegar em movimento.
- Os cards auxiliares (`RouteConfigCard`, `RouteHistorySection`, `MinhaDailyCard`, `DismissedContaAlvoCard`, "Rota personalizada", "Adicionar lead manualmente") **não podem desaparecer**: vão para um botão de configuração no header, abrindo um sheet de tela cheia. Declare onde cada um foi.

## Pronto quando

- [ ] card da parada atual com borda vermelha
- [ ] só a parada atual tem ações
- [ ] os seis auxiliares alcançáveis e declarados
- [ ] reserva de 40px no fim do scroll
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
