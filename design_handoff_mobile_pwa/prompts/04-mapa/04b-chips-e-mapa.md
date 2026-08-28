# 04b — Chips de temperatura e o mapa

**Tela:** Mapa / Lista  ·  **Arquivo:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *1. Mapa / Lista*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Faixa de chips: `padding:12px 16px`, fundo `--surface`, borda inferior 1px `--border`, `overflow-x:auto`, gap 8. Chip: altura **36**, `padding:0 14px`, raio pill, borda 1px, dot 8px + rótulo 12/16/0.5 peso 600, `flex:0 0 auto`, `white-space:nowrap`. Ativo `--tint-red` / borda `#C8131B` / texto `--tint-red-text`.
- Seis chips: Todos · Quente · Morno · Frio · Conta Alvo (+ Fechado/Perdido conforme o filtro), com as cores de `TEMP_COLORS` e `#7c3aed`.
- Pin: **40×40** pill da cor da temperatura, borda 2.5px branca, sombra `0 4px 8px rgba(0,0,0,.24)`, logo branco 20px (`assets/pin-logo.png`), seta CSS `border-top:9px`.
- Botão de recentrar: **48×48**, raio 16, `left:16px; top:16px`, fundo `--surface`, sombra 03, ícone 24px — cheio + `#C8131B` seguindo o vendedor, vazado + `--text-muted` livre. **Foi para o topo**: no rodapé disputava com a barra e o FAB.
- **Remover a legenda de temperatura sobre o mapa** (`styles.tempLegend`, linhas de 104px em duas colunas). Os chips no topo ensinam as cores e o mapa recupera um quarto da altura.
- Clustering, `animationEnabled={false}` e o carregamento por área visível **intactos**. A pill de status ("Aproxime para carregar…") continua.

## Pronto quando

- [ ] chips roláveis de 36px
- [ ] pin de 40px
- [ ] recentrar no topo esquerdo, 48×48
- [ ] legenda de duas colunas removida
- [ ] clustering e carregamento por área inalterados
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
