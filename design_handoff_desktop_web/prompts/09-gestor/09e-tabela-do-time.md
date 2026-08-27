# 09e — Tabela do time

**Tela:** Gestor  ·  **Arquivo:** `src/screens/GestorScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *6. Painel do gestor*
**Escopo:** só o terceiro bloco

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Card com `overflow:hidden`, fundo `--surface`, borda 1px `--border`, raio 8, sombra 02. Título "Time · {mês}" `padding:16px`, 16/24/0.15 peso 700, borda inferior 1px `--border`.
- Grid idêntico em cabeçalho e linhas: `grid-template-columns:minmax(180px,2fr) repeat(6,minmax(88px,1fr)); gap:16px`.
- Cabeçalho: `padding:12px 16px`, fundo `--surface-2`, borda inferior 1px `--stroke-default`, rótulos 12/16/0.5 peso 700 `--text-muted`. Colunas: **Vendedor · Visitas · Demos · Fechados · MRR novo · Conversão · Meta**. Numéricas com `text-align:right`.
- Linha: `padding:12px 16px`, borda inferior 1px `--border`, `align-items:center`, `cursor:pointer`, hover fundo `--surface-2`.
- Vendedor: avatar 32px pill fundo `--surface-2` texto `--text-muted` 12/32/0.5 peso 700 com as iniciais + nome 14/20/0.1 peso 600 truncado.
- Numéricas: 14/20 peso 600, `tabular-nums`, alinhadas à direita. **MRR em `--tint-green-text`.**
- Meta em badge: `padding:4px 8px`, raio 4 — no alvo `#EAF7EE`/`#167532`, abaixo `#FFF8EB`/`#99670F`.
- Clique na linha abre o drill-down. **Se já existe, preserve o comportamento.**

## Pronto quando

- [ ] grid igual no cabeçalho e nas linhas
- [ ] numéricas à direita com `tabular-nums`
- [ ] MRR usando o token verde
- [ ] drill-down preservado
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
