# 06c — Lista de paradas

**Tela:** Rota  ·  **Arquivo:** `src/screens/RotaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *3. Rota do dia*
**Escopo:** só a faixa do meio do rail

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- `flex:1; overflow-y:auto; padding:16px 24px`. Linha: `padding:12px 0`, borda inferior 1px `--border`, `display:flex; gap:12px`.
- Índice: 28px pill, 12/28/0.5 peso 700, `flex:0 0 28px`. Concluída `#EAF7EE`/`#167532`; atual `#C8131B`/branco; pendente `--surface-2`/`--text-muted`.
- Nome 14/20/0.1 peso 600 `--text`, truncado com ellipsis. Ao lado, tag opcional `padding:2px 6px` raio 4, 11/16/0.5 peso 600: **Visitado** `#EAF7EE`/`#167532` · **Agora** `--tint-red`/`--tint-red-text` · **SLA** `#FFF8EB`/`#99670F` · **Demo** e **Alvo** `#F1EBFE`/`#5B32C4`.
- Detalhe 12/16/0.4 `--text-faint`: horário, cidade e o motivo da parada.
- Handle de arraste à direita: botão 32×32 raio 4, ícone `drag_indicator` 20px `--text-faint`, hover fundo `--surface-2`. Reordenação por arraste deve funcionar.
- Estado vazio: manter a copy atual — *"Nenhum lead na rota. Use a sugestao ou abra um pin no mapa."*

## Pronto quando

- [ ] índice com as três cores conforme o estado
- [ ] tags com o tint correto
- [ ] arraste reordena
- [ ] estado vazio com a copy original
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
