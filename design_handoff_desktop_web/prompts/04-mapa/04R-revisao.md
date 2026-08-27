# 04R — Revisão: Mapa comercial

**Arquivos:** `App.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *1. Mapa comercial* · screenshot `design_handoff_desktop_web/screenshots/01-mapa.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Layout `display:flex; height:calc(100vh - 64px)`: painel `flex:0 0 352px` + mapa `flex:1`.
2. Painel: fundo `--surface`, borda direita 1px `--border`, coluna flex.
3. Bloco de filtros `padding:16px`, borda inferior 1px `--border`, gap 16.
4. Segmented Leads/Clientes/Ex-clientes: altura 40, 12/16/0.5 peso 600, raio 12 só nas pontas, selecionado `#C8131B`.
5. Cabeçalho "TEMPERATURA DA ETAPA" 11/16/0.5 peso 600 uppercase `--text-faint` + "Limpar" 12/16/0.5 peso 600 `#018CCC`.
6. Chips de temperatura: altura 32, `padding:0 12px`, raio 8, borda 1px `--stroke-default`, dot 10px + rótulo + contagem.
7. Seis chips: Quente, Morno, Frio, Fechado, Perdido, Conta Alvo, com as cores de `TEMP_COLORS` + `#7c3aed`.
8. Toggle "Calor de visitas" (só gestor): linha `padding:12px` raio 8 fundo `--surface-2`, switch 44×24 pill com botão 20px.
9. Lista de resultados: cabeçalho "NESTA ÁREA · {n}" 12/16/0.5 peso 700 uppercase + "por distância" à direita.
10. Linha: `padding:12px 16px`, borda inferior 1px `--border`, barra de temperatura 4px `align-self:stretch`, nome 14/20/0.1 peso 600 truncado, sublinha `{etapa} · {cidade}`, distância à direita.
11. Hover da linha: fundo `--surface-2`. Clique abre o drawer da ficha.
12. Pin: **40×40** pill, borda 2.5px branca, sombra `0 4px 8px rgba(0,0,0,.24)`, logo branco 20px, seta CSS `border-top:9px`.
13. Controles do mapa em `right:16px; top:16px`: 40×40 raio 8 fundo `--surface` borda 1px `--border` sombra 03 — `my_location` e `layers`.
14. `my_location` cheio + `#C8131B` quando seguindo o vendedor; vazado + `--text-muted` quando livre.
15. Legenda: barra horizontal `left:16px; bottom:16px`, `padding:12px 16px`, raio 8, `flex-wrap:wrap`, `max-width:calc(100% - 32px)`, dot 10px + rótulo 12/16/0.5 peso 600.
16. **A legenda de duas colunas com linhas de 104px foi removida.**
17. **Sem FAB no mapa.**
18. Clustering intacto: `radius 50`, `minPoints 3`, `maxZoom 14`, `animationEnabled={false}`.
19. Carregamento por área visível intacto (`renderBounds`, `mapRegion`, `showOnlyMyArea`) e a pill de status no topo do mapa preservada.
20. Camada de heatmap (`<Circle>`) preservada; pins somem com o calor ligado.
21. Nenhum hexadecimal fora dos literais permitidos; spacing na escala 8pt.

## Armadilhas conhecidas desta tela

- **Legenda sem `flex-wrap` / `max-width`** — em 1024px os seis itens cortam "Conta Alvo".
- **Pin ainda com 36px** (valor do mobile) em vez de 40.
- **Filtros como overlay sobre o mapa** em vez do painel ancorado de 352px.
- **Clustering alterado** ao mexer no MapView — `maxZoom 14` e `animationEnabled={false}` existem por motivos de performance e de bug conhecido no iOS.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
