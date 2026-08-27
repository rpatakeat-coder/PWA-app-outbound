# 12R — Revisão: Login

**Arquivos:** `src/screens/LoginScreen.tsx`, `App.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *8. Login* · screenshot `design_handoff_desktop_web/screenshots/08-login.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Renderiza **fora da casca**: sem sidebar, sem header, sem busca, sem avisos, sem avatar, sem CTA "Novo lead".
2. `display:grid; grid-template-columns:1fr 1fr; height:100vh`.
3. Painel esquerdo: fundo `#C8131B`, `padding:64px`, coluna com `justify-content:space-between`.
4. Logo branco altura 32, `align-self:flex-start`.
5. Kicker "FIELD SALES OUTBOUND" 11/16 `letter-spacing:.12em` peso 800 `rgba(255,255,255,.7)` uppercase.
6. Frase 28/36 peso 700 branca, `max-width:22ch`, `text-wrap:pretty`.
7. Rodapé esquerdo: "Contas são criadas pelo administrador" 12/16/0.4 `rgba(255,255,255,.7)`.
8. Painel direito: fundo `--bg`, centralizado, `padding:64px`, bloco `max-width:400px` coluna gap 16.
9. Título "Entrar na conta" 24/32 peso 700 `--text`.
10. Campo: rótulo 14/20/0.1 peso 600 `--text-muted` com `margin-bottom:8px`; caixa altura 40, `padding:0 16px`, raio 8, borda 1px `--stroke-strong`, ícone 20px `--text-faint`.
11. Botão "Entrar" Large filled `#C8131B`, **rótulo flush-left** com `padding:0 24px`.
12. Link "Esqueci minha senha" 14/20/0.1 peso 600 `#018CCC`.
13. Erro de credencial: texto 12/16/0.4 `--tint-red-text` acima do botão; borda do campo inválido `#C8131B`.
14. **O layout vertical atual é preservado abaixo de 1024px** — o split panel é desktop. Escolha por `layout.ehDesktop`.
15. `aria-label` nos campos; foco `2px solid #016999`.

## Armadilhas conhecidas desta tela

- **Layout mobile deletado** ao criar o split panel — ele é o que roda no celular.
- **Login ainda dentro da casca** — o defeito mais visível: usuário deslogado com navegação e badge de tarefas na tela.
- **Título 32px** herdado do mobile em vez de 24/32.
- **Rótulo do botão centralizado.**

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
