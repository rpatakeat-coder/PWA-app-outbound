# 12b — Split panel do desktop

**Tela:** Login  ·  **Arquivo:** `src/screens/LoginScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *8. Login*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- **Só no desktop** (`layout.ehDesktop`). Abaixo de 1024px o layout vertical atual é preservado — ele é o que roda no celular. **Não delete o layout atual.**
- `display:grid; grid-template-columns:1fr 1fr; height:100vh`.
- Painel esquerdo: fundo `#C8131B`, `padding:64px`, coluna com `justify-content:space-between`. Logo branco altura 32 no topo com `align-self:flex-start`. No meio: kicker "FIELD SALES OUTBOUND" (11/16, `letter-spacing:.12em`, peso 800, `rgba(255,255,255,.7)`, uppercase) + frase 28/36 peso 700 branca com `max-width:22ch` e `text-wrap:pretty`. Embaixo: "Contas são criadas pelo administrador" 12/16/0.4 `rgba(255,255,255,.7)`.
- Painel direito: fundo `--bg`, centralizado, `padding:64px`, bloco `max-width:400px` em coluna gap 16.
- Título "Entrar na conta" 24/32 peso 700 `--text` — **não 32px**, que é token de mobile.
- Campo: rótulo 14/20/0.1 peso 600 `--text-muted` com `margin-bottom:8px`; caixa altura **40**, `padding:0 16px`, raio **8** (desktop), borda 1px `--stroke-strong`, fundo `--surface`, ícone 20px `--text-faint` (`mail` / `lock`), texto 14/20/0.25.
- Botão "Entrar" Large filled `#C8131B`, **rótulo flush-left** com `padding:0 24px`, hover `#94090F`.
- Link "Esqueci minha senha" 14/20/0.1 peso 600 `#018CCC`.
- Erro de credencial: texto 12/16/0.4 `--tint-red-text` acima do botão; borda do campo inválido `#C8131B`.
- `aria-label` nos dois campos; foco `2px solid #016999` com `outline-offset: 2px`.

## Pronto quando

- [ ] split 1fr 1fr em 1440px; layout vertical atual preservado abaixo de 1024px
- [ ] título 24/32, inputs de 40px raio 8
- [ ] botão "Entrar" com rótulo flush-left
- [ ] erro de credencial visível e legível nos dois temas
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
