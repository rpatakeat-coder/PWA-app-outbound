# 04d — Card de lead na vista Lista

**Tela:** Mapa / Lista  ·  **Arquivo:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *1. Mapa / Lista*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Scroll: `padding:16px 16px 40px` (a reserva do FAB), coluna gap 12.
- Card: `padding:16px`, raio **16**, fundo `--surface`, borda 1px `--border`, **borda esquerda 4px da cor da temperatura**, sombra 01. A estrutura atual (`styles.clientCard`) já é raio 16 / padding 16 / borda esquerda 4px — **está certa**.
- **O que muda é o conteúdo.** Sai: "Contato: …", "Etapa: …", cidade e telefone em quatro linhas soltas. Entra: nome 16/24/0.15 peso 600 truncado + sublinha `{etapa} · {cidade}` 12/16/0.4 `--text-faint` + badge de temperatura no canto, e uma linha de metadados `margin-top:12px` gap 16 com `near_me` + distância e `where_to_vote` + última visita (ícones 16px, texto 12/16/0.5 peso 600 `--text-faint`).
- Distância e recência são o que decide a próxima visita — é por isso que substituem telefone e cidade repetida.
- Tints do badge de temperatura: Quente `#FAE8E9`/`#94090F` · Morno `#FFF8EB`/`#99670F` · Frio `#E6F7FF`/`#016999` · Fechado `#EAF7EE`/`#167532` · Perdido `#EDEDED`/`#545454`. No escuro caem para `--surface-2`/`--text`.

## Pronto quando

- [ ] card com a linha de metadados (distância + recência)
- [ ] telefone e "Contato:" fora do card
- [ ] badge de temperatura com o tint certo nos dois temas
- [ ] reserva de 40px no fim do scroll
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
