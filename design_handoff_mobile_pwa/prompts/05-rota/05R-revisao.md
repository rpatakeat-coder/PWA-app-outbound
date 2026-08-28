# 05R — Revisão: Rota

**Arquivos:** `src/screens/RotaScreen.tsx`, `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *2. Rota* · screenshot `design_handoff_mobile_pwa/screenshots/03-rota.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Kicker uppercase 11/16 `.12em` peso 800; data 18/24 peso 600; avatar 48px.
2. Três KPIs em `rgba(255,255,255,.14)`, valor 16/24 peso 700 com `tabular-nums`.
3. Mapa em faixa de **180px**, não tela cheia.
4. Polyline `#C8131B` largura **4**; geometria OSRM com fallback tracejado preservada.
5. Marcador da parada atual 30×30 borda 3px branca.
6. Card de parada: raio 16, padding 16, sombra 01; borda `#C8131B` só na atual.
7. Índice 32px pill com as três cores de estado.
8. Nome 16/24/0.15 peso 600 truncado; detalhe 12/16/0.4.
9. Tags com o tint certo: Visitado, Agora, SLA, Demo, Alvo.
10. **Só a parada atual mostra "Check-in" e `navigation`.**
11. Check-in `flex:1` altura 48 `#27A84C`.
12. Scroll com `padding-bottom:40px` e o FAB não cobre nenhum botão ao rolar até o fim.
13. Os seis cards auxiliares alcançáveis, com destino declarado.
14. Estado vazio com a copy original.
15. Nenhum hexadecimal fora dos literais permitidos; spacing só até 24 (+ reserva de 40).

## Armadilhas conhecidas desta tela

- **Ações em todas as paradas** — no celular, em movimento, é toque errado garantido.
- **Polyline com largura 5** (valor do desktop).
- **Mapa em tela cheia** — a sequência é o que importa nesta tela.
- **Auxiliares descartados** em vez de movidos para o sheet.
- **FAB cobrindo o "Check-in"** do último card.

## Conferência

- Abrir em **390 × 844** (DevTools, iPhone 14) e comparar com o screenshot
- Testar com o **polegar**: todo alvo tem 48px?
- Alternar o tema e repetir no **escuro**
- No PWA instalado: nada embaixo da barra de gestos
