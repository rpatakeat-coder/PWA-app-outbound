# 11R — Revisão: Login

**Arquivos:** `src/screens/LoginScreen.tsx`, `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *7. Login* · screenshot `design_handoff_mobile_pwa/screenshots/08-login.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. **Nenhuma bottom nav** quando não autenticado.
2. Topo `#C8131B` com `padding:40px 24px 24px`; logo branco altura 28 alinhado à esquerda.
3. Kicker 11/16 `.12em` peso 800 uppercase.
4. "Entrar na conta" **22/28 peso 700** — não 32px.
5. Folha do formulário com raio `24px 24px 0 0` e fundo `--bg`.
6. Campos altura **48**, raio **16**, borda 1px `--stroke-strong`, ícone 20px.
7. Campo de senha com `visibility`.
8. Botão "Entrar" 48px raio 12 largura total.
9. Link "Esqueci minha senha" centralizado, `#018CCC`.
10. Rodapé "Contas são criadas pelo administrador".
11. Erro em `--tint-red-text` com borda do campo `#C8131B`.
12. `KeyboardAvoidingView` preservado; o botão não fica atrás do teclado.
13. `aria-label` nos campos; foco `2px solid #016999`.
14. Nenhum hexadecimal fora dos literais permitidos; spacing só até 24 (+40 do topo).

## Armadilhas conhecidas desta tela

- **Bottom nav visível no login.**
- **Título 32px** — token que não existe no mobile.
- **Inputs com raio 8** (valor do desktop) em vez de 16.
- **Split panel do desktop portado** — em 390px não cabe.
- **Botão atrás do teclado** por perder o `KeyboardAvoidingView`.

## Conferência

- Abrir em **390 × 844** (DevTools, iPhone 14) e comparar com o screenshot
- Testar com o **polegar**: todo alvo tem 48px?
- Alternar o tema e repetir no **escuro**
- No PWA instalado: nada embaixo da barra de gestos
