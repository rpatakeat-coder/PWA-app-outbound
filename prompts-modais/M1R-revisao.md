# M1R — Revisão: painel do lead

**Arquivos:** `App.tsx` (+ o componente de painel criado no `M1b`)
**Referência:** screenshots `09-drawer-ficha-do-lead.png` (desktop) e `09-sheet-ficha-do-lead.png` (mobile)

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Item por item: **OK**, **FALTA** ou **DIVERGE** (cite o encontrado e o esperado). **Não edite nada.** Feche com o resumo OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Casca

1. Um componente só, forma decidida por `layout.ehDesktop`.
2. Desktop: drawer 480px à direita, `height:100vh`, sem raio, sombra `-8px 0 16px rgba(0,0,0,.14)`.
3. Mobile: bottom sheet `max-height:92%`, raio `16px 16px 0 0`, handle 36×4.
4. Overlay `rgba(0,0,0,.32)` no desktop / `rgba(0,0,0,.4)` no mobile.
5. Fecha no X, no overlay, no `Esc` (desktop) e no voltar do sistema (mobile).
6. Mobile fecha também no arraste para baixo.
7. `role="dialog"`, `aria-modal="true"`, `aria-label` com o nome do lead.
8. Foco entra ao abrir e volta ao fechar.

## Topo

9. Kicker com dot de `TEMP_COLORS` + "`{TEMPERATURA}` · `{n}`ª VISITA" 11/16/0.5 peso 600 uppercase.
10. Nome 18/24 peso 600 truncado; sublinha contato · telefone 12/16/0.4.
11. X: 40×40 raio 8 no desktop, 48×48 raio 12 `--surface-2` no mobile, com `aria-label`.
12. Desktop: três ações — Mudar etapa (filled), Agendar (outline), `more_horiz` — **rótulos flush-left**.
13. Mobile: duas ações de 48px em grade `1fr 1fr`, rótulos curtos ("Etapa", não "Mudar etapa").
14. As duas abrem os overlays certos; no mobile empilham e o voltar reabre este painel.
15. Nenhuma ação que existia antes desapareceu.

## Corpo

16. Uso do produto **só aparece quando há dado** de `hubspot-usage-sync`.
17. Semáforo nos três estados: verde ≤7, âmbar 8–30, vermelho >30 ou nenhuma.
18. Dados: pares chave/valor sem linha vazia, começando por **Contato** e **Telefone**, terminando em **ID HubSpot** + a linha de link "Abrir no HubSpot". **MRR não aparece.**
19. Mobile empilha linha de valor longo (endereço).
20. **Nenhum campo inventado** — só os que existem no tipo `Client`.
21. Timeline mescla as fontes reais, ordenada por data decrescente.
22. Ícones da timeline em pill 32px com os tints corretos.
23. **Tints da timeline não invertem no escuro** (são superfícies próprias).
24. Timeline limitada a 6 + "ver histórico completo".
25. Timeline vazia com "Sem histórico ainda."

## Rodapé

26. Faixa fixa, botão de largura total `#27A84C`, ícone `where_to_vote`.
27. Rótulo flush-left no desktop, centralizado no mobile.
28. "Re-marcar visita" quando já houve check-in hoje.
29. Mobile respeita a área segura.
30. Quatro estados: normal, carregando (fundo inalterado), permissão negada, fora do raio.
31. Erro como linha de texto, **nunca `alert()`**.
32. Validação de distância e Task do HubSpot inalteradas.

## Peek sheet (mobile)

33. Tocar um pin abre o **peek**, não a ficha completa.
34. Peek com `padding:16px 16px 40px` — **o FAB não toca o "Check-in"**.
35. Barra de temperatura 4px `align-self:stretch`, badge de temperatura à direita.
36. Três ações de 48px: Check-in, `navigation`, `call`.
37. Arraste para cima abre a completa; para baixo volta ao peek; de novo fecha.
38. Desktop inalterado — drawer abre completo.

## Geral

39. Nenhum hexadecimal fora dos literais permitidos (`TEMP_COLORS`, tints de etapa/timeline, marca, verde do check-in).
40. Spacing: até 24 no mobile, até 40 no desktop (a reserva de 40 do peek é a exceção).
41. Alvos: 48px no mobile, 40px no desktop.
42. Modo escuro conferido — nenhum `#94090F` ou `#167532` como cor de texto sobre superfície do tema.

## Armadilhas conhecidas

- **Duas implementações** por plataforma, que divergem na primeira mudança.
- **`Esc` não fecha** no desktop — o mais fácil de esquecer.
- **Voltar do sistema sai do app** em vez de fechar o painel.
- **"Mudar etapa" como rótulo no mobile** — quebra em duas linhas em 390px.
- **Ficha completa abrindo direto do pin no mobile** — o vendedor perde o mapa.
- **FAB em cima do "Check-in"** — falta a reserva de 40px; só aparece com o FAB na tela.
- **Tints da timeline trocados por token de tema** — ícone verde sobre fundo verde-claro fica invisível no escuro.
- **Campo inventado nos Dados** porque o design mostrava e o tipo não tem.
- **Um segundo padrão de painel** só para este caso.

## Conferência

- `npm start`, abrir em **1440px** e comparar com o screenshot do desktop
- **390 × 844** (DevTools, iPhone 14) e comparar com o do mobile
- Testar com o **polegar** no mobile: todo alvo tem 48px?
- Alternar o tema e repetir nos dois
- No PWA instalado: o botão de check-in não fica sob a barra de gestos
