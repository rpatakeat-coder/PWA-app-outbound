# 08c — Card de tarefa

**Tela:** Tarefas  ·  **Arquivo:** `src/screens/TarefasScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *5. Tarefas (kanban)*
**Escopo:** só o card

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- `padding:16px`, borda 1px `--border`, raio 8, fundo `--surface`, sombra `0 1px 2px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`, hover `border-color:--stroke-strong`.
- Linha superior: lead 14/20/0.1 peso 600 `--text` + badge de SLA à direita (`padding:2px 6px`, raio 4, 11/16/0.5 peso 600) — **D5** `#FAE8E9`/`#94090F` · **D2** `#FFF8EB`/`#99670F` · **—** `--surface-2`/`--text-faint`.
- Tarefa: 12/16/0.4 `--text-muted`, `margin-top:6px`.
- Metadados `margin-top:12px`, gap 12: ícone `schedule` 16px + prazo, ícone `person` 16px + vendedor. Texto 11/16/0.5 peso 600 `--text-faint`.
- Ações `margin-top:12px`, gap 8: "Agendar" (`flex:1`, altura 32, raio 8, fundo `--tint-red`, texto `--tint-red-text`, 14/20/0.1 peso 600, **flush-left** com `padding:0 12px`) + concluir (32×32, raio 8, borda 1px `--stroke-default`, ícone `check` 20px).
- Conclusão é **toggle otimista**: pinta na hora, persiste em seguida, reverte se falhar. Se já é assim hoje, preserve.

## Pronto quando

- [ ] badge de SLA com o tint certo (D5 vermelho, D2 âmbar)
- [ ] "Agendar" com rótulo flush-left
- [ ] concluir funciona e é otimista
- [ ] hover muda a borda, não o fundo
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
