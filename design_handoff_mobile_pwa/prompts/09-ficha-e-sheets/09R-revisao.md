# 09R — Revisão: Ficha e sheets

**Arquivos:** `App.tsx`, `src/screens/ChangeStageModal.tsx`, `src/screens/ScheduleMeetingModal.tsx`, `src/screens/CEPStep.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *8. Ficha do lead (bottom sheet)* · screenshot `design_handoff_mobile_pwa/screenshots/09-sheet-ficha-do-lead.png`, `10-sheet-mudanca-de-etapa.png`, `11-sheet-agendar.png`, `12-sheet-cadastro-cep.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Ficha: overlay `rgba(0,0,0,.4)`, folha `max-height:92%`, raio `16px 16px 0 0`.
2. Ficha fecha no X, no overlay, no arraste para baixo **e no voltar do sistema**.
3. `role="dialog"`, `aria-modal="true"`, `aria-label` nos quatro overlays.
4. Handle 36×4 centralizado; X em 48×48 raio 12 `--surface-2`.
5. Ações "Etapa" e "Agendar" em grade `1fr 1fr`, altura 48, **rótulos curtos**.
6. Semáforo de uso com os três estados (verde ≤7, âmbar 8–30, vermelho >30).
7. Rodapé fixo da ficha com "Marcar visita (GPS)" 48px `#27A84C`; vira "Re-marcar" após check-in.
8. Validação de 200m e Task no HubSpot inalteradas.
9. Etapa e Agendar e Cadastro são **tela cheia**, com `arrow_back`/`close` de 48×48.
10. Etapa: opções `min-height:56px` raio 16, radio 24×24.
11. Etapa: campos em **coluna única**, altura 48 raio 16; bloco com borda esquerda 4px `#CC8C1D`.
12. Etapa: máscaras de `STAGE_FIELDS_BY_ID` inalteradas; regra de avanço preservada.
13. `KeyboardAvoidingView` presente nos sheets com formulário — o rodapé sobe com o teclado.
14. Agendar: coluna única; mês em Poppins Bold 16 `#C8131B`; dia selecionado em **círculo**.
15. Agendar: células do calendário com altura 40; chips de horário 48px; textarea **140px**.
16. Agendar: CTA repete data e hora.
17. Cadastro: barra de progresso de 3 segmentos e a navegação de 3 passos preservada.
18. Cadastro: **pin no centro do mapa, não da tela** (`mapLayout`).
19. Rodapés fixos com `padding-bottom:32px` (área segura).
20. Nenhum hexadecimal fora dos literais permitidos; spacing só até 24 (+32 do rodapé).

## Armadilhas conhecidas desta tela

- **Um segundo padrão de painel** — ficha, perfil, configurações e sheets usam a mesma estrutura.
- **Voltar do sistema saindo do app** em vez de fechar o sheet.
- **"Mudar etapa" como rótulo** — quebra em duas linhas em 390px.
- **Sheet parcial com formulário longo** — com teclado aberto sobra quase nada.
- **Dia selecionado como retângulo** em vez de círculo.
- **Pin do cadastro no centro da tela** — salva coordenada errada.
- **Sem `KeyboardAvoidingView`** — o CTA fica atrás do teclado.

## Conferência

- Abrir em **390 × 844** (DevTools, iPhone 14) e comparar com o screenshot
- Testar com o **polegar**: todo alvo tem 48px?
- Alternar o tema e repetir no **escuro**
- No PWA instalado: nada embaixo da barra de gestos
