# M1 — Painel do lead: construir do zero

> **Este painel não existe no código.** A versão anterior deste prompt estava escrita como se existisse — pedia para reestilizar algo que precisa ser construído. Daí o Claude Code não gerar diff.

**Arquivo:** `App.tsx` (o painel do lead selecionado, aberto por `selectedClient`)
**Referência visual:** `design_handoff_desktop_web/screenshots/09-drawer-ficha-do-lead.png` e `design_handoff_mobile_pwa/screenshots/09-sheet-ficha-do-lead.png`
**Especificação:** `design_handoff_desktop_web/README.md` §*11. Ficha do lead (drawer)* · `design_handoff_mobile_pwa/README.md` §*8. Ficha do lead (bottom sheet)*

## Ordem

Rode um por vez, nesta ordem, conferindo entre cada um.

| Prompt | O que faz |
|---|---|
`M1a-inventario.md` | **não edita código** — descobre o que existe e quais campos são reais |
`M1b-casca.md` | o container: drawer no desktop, bottom sheet no mobile |
`M1c-topo-e-acoes.md` | identificação do lead e as três ações |
`M1d-corpo.md` | uso do produto, dados, timeline |
`M1e-rodape-checkin.md` | o botão de check-in |
`M1f-peek-sheet-mobile.md` | o estágio de peek no mapa (só mobile) |
`M1R-revisao.md` | auditoria em duas fases |

**Não pule o `M1a`.** Um redesign anterior neste projeto assumiu métricas que não existiam no banco e foi aplicado com números inventados. O `M1a` existe para isso não repetir.

## Tokens: mobile ≠ desktop

O erro mais provável é copiar valor de uma plataforma para a outra.

| | Mobile (< 1024px) | Desktop (≥ 1024px) |
|---|---|---|
Forma | bottom sheet, `max-height:92%` | drawer 480px à direita |
Raio do painel | `16px 16px 0 0` | 0 — encosta na borda |
Padding | 16 | 24 |
Botão | 48px, raio 12, tipo 16/600 | 40px, raio 12, tipo 14/600 |
Card interno | raio 16 | raio 8 |
Alvo tocável | 48px | 40px |
Rótulo de botão | centralizado (largura = rótulo) | **flush-left** |
