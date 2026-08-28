# 07b — Card de tarefa

**Tela:** Tarefas  ·  **Arquivo:** `src/screens/TarefasScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *4. Tarefas*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Scroll `padding:16px 16px 40px`, coluna gap 12.
- Card `padding:16px`, raio **16**, fundo `--surface`, borda 1px `--border`, **borda esquerda 4px na cor do SLA**, sombra 01.
- Lead 16/24/0.15 peso 600 + badge de SLA à direita (`padding:4px 8px`, raio 4, 11/16/0.5 peso 600): **D5** `#FAE8E9`/`#94090F` · **D2** `#FFF8EB`/`#99670F` · **—** `--surface-2`/`--text-faint`.
- Tarefa 14/20/0.25 `--text-muted`, `margin-top:6px`.
- Prazo `margin-top:8px`: `schedule` 16px + texto 12/16/0.5 peso 600 — **vencido usa `--tint-red-text`** (`#94090F` claro / `#E5A1A4` escuro), no prazo usa `--text-faint`.
- **A cor do badge e a da régua esquerda são variáveis DIFERENTES.** O badge tem fundo tonal claro nos dois temas, então o texto fica escuro sempre. A régua fica sobre `--surface`: no escuro precisa de `#E5A1A4` (D5) e `#FFD894` (D2), senão vira vinho sobre quase-preto e desaparece.
- Ações `margin-top:16px` gap 8: "Agendar" (`flex:1`, altura **48**, raio 12, `#C8131B`, 16/24/0.15 peso 600 branco) + concluir (48×48, raio 12, borda 1px `--stroke-default`, ícone `check` 24px).
- Conclusão é **toggle otimista**: pinta na hora, persiste, reverte se falhar.
- O modal "Como as tarefas são geradas" vira botão de ajuda no header.

## Pronto quando

- [ ] badge e régua com variáveis diferentes, ambos legíveis no escuro
- [ ] prazo vencido legível no escuro
- [ ] ações com 48px
- [ ] conclusão otimista
- [ ] modal de regras alcançável
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
