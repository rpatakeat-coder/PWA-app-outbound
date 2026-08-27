# 09b — Faixa de KPIs

**Tela:** Gestor  ·  **Arquivo:** `src/screens/GestorScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *6. Painel do gestor*
**Escopo:** só o primeiro bloco

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Container da tela: `padding:24px`, `display:flex; flex-direction:column; gap:24px`, `max-width:1600px`.
- Faixa: `grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px`.
- Card: `padding:16px`, fundo `--surface`, borda 1px `--border`, raio 8, sombra `0 2px 4px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`.
- Dentro: linha com rótulo (14/20/0.1, peso 500, `--text-muted`) e ícone de tendência 20px à direita na cor do sinal; valor (28/36, peso 700, `--text`, `tabular-nums`) com `margin-top:8px`; delta (12/16/0.4, peso 500) com `margin-top:4px`.
- **Cor do sinal:** positivo `--tint-green-text`, negativo `--tint-red-text`. Não use `#167532`/`#94090F` direto — reprovam no escuro.
- Os quatro: **Visitas · Demos realizadas · Fechamentos · MRR novo**, com os campos que o 09a confirmou.

## Não fazer

- Não invente métrica. Se algum dos quatro não existe, use o que existe e relate a troca.

## Pronto quando

- [ ] quatro cards em grid de 4
- [ ] valor 28/36 peso 700 com `tabular-nums`
- [ ] delta usando os tokens de cor, não os hexes
- [ ] números vindos do hook
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
