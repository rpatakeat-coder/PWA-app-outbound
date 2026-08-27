# 06R — Revisão: Rota

**Arquivos:** `src/screens/RotaScreen.tsx`, `App.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *3. Rota do dia* · screenshot `design_handoff_desktop_web/screenshots/03-rota.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** (não foi feito) ou **DIVERGE** (feito com valor diferente do README — cite o encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Corrija um por vez, do maior impacto visual para o menor.

## Checklist

1. Container: `flex` com mapa `flex:1` e rail `flex:0 0 420px`; altura `calc(100vh - 64px)`.
2. Abaixo de 1024px volta a coluna única.
3. Topo do rail: `padding:24px`, borda inferior 1px `--border`.
4. Kicker uppercase 11/16/0.5 peso 600 `--text-faint`; data 18/24 peso 600.
5. Setas de dia 32×32 raio 4 borda `--stroke-default`; navegação funciona.
6. Três KPIs em grid de 3, `padding:12px`, raio 8, fundo `--surface-2`; valor 20/28 peso 600 com `tabular-nums`.
7. Lista: `padding:16px 24px`, linha `padding:12px 0` com borda inferior 1px `--border`.
8. Índice 28px pill com as três cores de estado (concluída / atual / pendente).
9. Nome 14/20/0.1 peso 600 truncado; detalhe 12/16/0.4 `--text-faint`.
10. Tags com o tint certo: Visitado, Agora, SLA, Demo, Alvo.
11. Handle `drag_indicator` presente e a reordenação por arraste funciona.
12. Estado vazio com a copy original.
13. Rodapé: dois CTAs, filled + outline, **rótulo flush-left**.
14. Polyline largura 5, geometria OSRM com fallback tracejado preservado.
15. Marcadores numerados 36×36, borda 3px branca, três cores de estado.
16. Os seis cards auxiliares continuam alcançáveis.
17. Nenhum hexadecimal fora dos literais permitidos.
18. Nenhum spacing fora da escala 8pt.
19. Alvos de 40px no desktop.

## Armadilhas conhecidas desta tela

- **Rótulo centralizado nos CTAs** — o kit manda flush-left quando o botão é mais largo que o texto. É o erro mais comum.
- **Cards auxiliares descartados** em vez de movidos. Confira os seis por nome.
- **Polyline com largura 4** (valor do mobile) em vez de 5.
- **`renderCompactClient` reaproveitado como está** — a linha da lista é nova, não é o card compacto antigo.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
