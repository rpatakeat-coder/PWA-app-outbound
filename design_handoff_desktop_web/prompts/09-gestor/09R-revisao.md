# 09R — Revisão: Painel do gestor

**Arquivos:** `src/screens/GestorScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *6. Painel do gestor* · screenshot `design_handoff_desktop_web/screenshots/06-gestor.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Container `padding:24px`, gap 24, `max-width:1600px`.
2. KPIs: grid de 4, card `padding:16px` raio 8 sombra 02.
3. Valor do KPI 28/36 peso 700 com `tabular-nums`; delta em `--tint-green-text` / `--tint-red-text` (não hexes).
4. Bloco funil + rail em `8fr 4fr` com `align-items:start`.
5. Barra do funil com **altura 22px**, trilha `--surface-3`, raio 4.
6. Cores das etapas vindas de `stages.ts`, uma por etapa, sem repetição.
7. Contagem e percentual por etapa, `tabular-nums`.
8. Clique na etapa do funil funciona (ou foi relatado como inexistente).
9. Heatmap: `repeat(7,28px)` gap 4, células 28×28 raio 4.
10. Três níveis de cor: `--surface-3` / `#8FE0D5` / `#1D9688`.
11. **Hoje sem visita com borda `1.5px dashed #C8131B`.**
12. Legenda do heatmap com os três degraus.
13. "Exportar relatório completo" Large outline `#1D9688`, flush-left, funcionando.
14. Tabela: grid `minmax(180px,2fr) repeat(6,minmax(88px,1fr))` igual no cabeçalho e nas linhas.
15. Cabeçalho em `--surface-2` com borda `--stroke-default`; rótulos 12/16/0.5 peso 700.
16. Sete colunas na ordem: Vendedor · Visitas · Demos · Fechados · MRR novo · Conversão · Meta.
17. Numéricas à direita, 14/20 peso 600, `tabular-nums`; MRR em verde-token.
18. Badge de meta com os dois tints.
19. Drill-down por vendedor preservado.
20. Todos os cards auxiliares do 09a têm destino e funcionam.
21. Abaixo de 1024px: KPIs 2×2, funil cheio, tabela reduzida.
22. Nenhuma métrica inventada; nenhuma query nova.
23. Nenhum hexadecimal fora dos literais permitidos; spacing na escala 8pt.

## Armadilhas conhecidas desta tela

- **Métrica inventada** quando o hook não tinha o campo. Confira cada número contra a tabela do 09a.
- **Hoje-vazio sem o tracejado** — o detalhe que mais passa batido nesta tela.
- **Delta e MRR com hex direto** (`#167532`, `#94090F`) — ilegíveis no escuro.
- **Cards auxiliares descartados** para "simplificar".
- **Grid do cabeçalho diferente do das linhas** — as colunas desalinham por 1–2px e ninguém vê até imprimir.
- **Barra do funil com 18px** (valor do mobile) em vez de 22px.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
