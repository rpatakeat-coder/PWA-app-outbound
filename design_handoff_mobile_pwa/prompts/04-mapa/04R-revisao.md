# 04R — Revisão: Mapa / Lista

**Arquivos:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *1. Mapa / Lista* · screenshot `design_handoff_mobile_pwa/screenshots/01-mapa.png` e `02-lista.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Busca 48px raio 16 com fundo `rgba(255,255,255,.18)`; avatar 48px ao lado.
2. Segmented Mapa/Lista com raio 12 nas pontas; ativo `#fff`/`#C8131B` (`#1E1E1E` no escuro).
3. O segmented é estado local, não uma aba da barra.
4. Chips de 36px roláveis, ativo `--tint-red`/`--tint-red-text`.
5. Pin 40×40, borda 2.5px branca, logo 20px, seta `border-top:9px`.
6. Recentrar 48×48 raio 16 em `left:16; top:16`, com os dois estados (seguindo / livre).
7. **Legenda de temperatura sobre o mapa removida.**
8. Clustering (`radius 50`, `minPoints 3`, `maxZoom 14`, `animationEnabled={false}`) intacto.
9. Carregamento por área visível e a pill de status intactos.
10. Peek sheet com `padding:16px 16px 40px` e handle 36×4.
11. **O FAB não toca o botão "Check-in".**
12. Check-in `flex:1` altura 48 `#27A84C`; `navigation` e `call` 48×48.
13. Arraste para cima do peek sheet abre a ficha.
14. Card da lista: raio 16, padding 16, borda esquerda 4px da temperatura.
15. Card tem a linha de metadados com distância e última visita.
16. "Contato:", "Etapa:" e telefone **não** aparecem mais como linhas soltas.
17. Badge de temperatura com tint claro no claro e `--surface-2` no escuro.
18. Scroll da lista com `padding-bottom:40px`.
19. Nenhum hexadecimal fora dos literais permitidos; spacing só até 24 (+ a reserva de 40).

## Armadilhas conhecidas desta tela

- **Legenda mantida** sobre o mapa — come um quarto da altura.
- **Recentrar ainda no rodapé** — colide com a barra e o FAB.
- **Card só reestilizado, conteúdo igual** — o ganho aqui é o conteúdo, não a casca.
- **Badge de temperatura com tint claro no escuro** — texto escuro sobre fundo escuro.
- **Clustering alterado** ao mexer no MapView.

## Conferência

- Abrir em **390 × 844** (DevTools, iPhone 14) e comparar com o screenshot
- Testar com o **polegar**: todo alvo tem 48px?
- Alternar o tema e repetir no **escuro**
- No PWA instalado: nada embaixo da barra de gestos
