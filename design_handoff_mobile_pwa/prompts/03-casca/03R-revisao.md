# 03R — Revisão: Casca — bottom nav e headers

**Arquivos:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *Navegação* · screenshot `design_handoff_mobile_pwa/screenshots/01-mapa.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Quatro abas: Mapa · Rota · Agenda · Tarefas, com vão de 72px no meio.
2. Aba `flex:1`, `min-height:56px`, `padding:8px 0`, ícone 24px, rótulo 11/16/0.5.
3. Ativa: peso 700 + `#C8131B`. Inativa: peso 500 + `--text-faint`.
4. **Sem pill de fundo na aba ativa.**
5. FAB 60×60 pill, `top:-24px`, borda 4px `--surface`, ícone 32px, sombra `0 8px 16px rgba(200,19,27,.32)`.
6. FAB tem `aria-label`.
7. **Badge de Tarefas ancorado no ÍCONE** (`top:-6px; right:-12px` dentro de um container relativo em volta do ícone) — o ícone da prancheta está visível.
8. Badge com borda 1.5px `--surface` e `box-sizing:content-box`.
9. O FAB solto de 56px do canto inferior direito foi removido.
10. `navPaddingBottom` / `insets` preservados — a barra respeita a área segura.
11. Viewer (`role === 'view'`) vê só Mapa, sem FAB.
12. Header: `#C8131B` no claro, `--surface` no escuro, `padding:12px 16px`.
13. Avatar 48px pill no canto direito, abrindo o menu do perfil.
14. Logo, nome do vendedor, engrenagem e "Sair" **saíram** do header.
15. **Reserva de 40px** no peek sheet do mapa e nos scrolls de Lista, Rota, Agenda e Tarefas.
16. Rolando até o fim de cada uma das quatro listas, o FAB não cobre nenhum botão.
17. Telas sem barra e sheets seguem com 16px.
18. Nenhum hexadecimal fora dos literais permitidos; spacing só até 24 (exceto a reserva de 40).

## Armadilhas conhecidas desta tela

- **Badge cobrindo o ícone de Tarefas** — o erro nº 1. Ancorar no ícone, não no botão.
- **FAB em cima do CTA do último card** — falta a reserva de 40px. Só aparece quando você rola até o fim.
- **Pill da aba ativa mantida** — briga visualmente com o FAB.
- **Dois caminhos para criar lead** — FAB central e o FAB antigo do canto.
- **Header vermelho no escuro.**
- **`padding-bottom` fixo em vez de somar `insets`** — no iPhone instalado a barra fica embaixo da barra de gestos.

## Conferência

- Abrir em **390 × 844** (DevTools, iPhone 14) e comparar com o screenshot
- Testar com o **polegar**: todo alvo tem 48px?
- Alternar o tema e repetir no **escuro**
- No PWA instalado: nada embaixo da barra de gestos
