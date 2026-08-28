# 11a — Folha sobre o vermelho

**Tela:** Login  ·  **Arquivo:** `src/screens/LoginScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *7. Login*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- **Sem bottom nav nesta tela.** Confirme que a barra não renderiza quando não autenticado.
- Topo: fundo `#C8131B`, `padding:40px 24px 24px`, coluna alinhada à esquerda gap 16 — logo branco altura 28 (`assets/takeat-logo-white.svg`); kicker "FIELD SALES OUTBOUND" (11/16, `.12em`, peso 800, `rgba(255,255,255,.7)`, uppercase) + "Entrar na conta" **22/28 peso 700** branco.
- Formulário: `flex:1`, fundo `--bg`, **raio `24px 24px 0 0`** (a folha subindo sobre o vermelho), `padding:24px`, coluna gap 16.
- Campo: rótulo 14/20/0.1 peso 600 `--text-muted` `margin-bottom:8px`; caixa altura **48**, `padding:0 16px`, raio **16**, borda 1px `--stroke-strong`, fundo `--surface`, ícone 20px `--text-faint` (`mail` / `lock`), texto 16/24/0.5. Senha com `visibility` à direita.
- Botão "Entrar" altura **48**, raio 12, `#C8131B`, 16/24/0.15 peso 600, largura total. Link "Esqueci minha senha" 14/20/0.1 peso 600 `#018CCC` centralizado. Rodapé "Contas são criadas pelo administrador" 12/16/0.4 `--text-faint` centralizado.
- Erro: texto 12/16/0.4 `--tint-red-text` acima do botão; borda do campo inválido `#C8131B`.
- A tela atual já é vertical com card sobre vermelho — a mudança é modesta: **título 32 → 22** (Heading não existe no mobile), inputs 48px raio 16, e o card virar folha de raio 24 colada no rodapé.
- `KeyboardAvoidingView` já está no arquivo — preserve.

## Pronto quando

- [ ] sem bottom nav
- [ ] título 22/28, não 32
- [ ] inputs de 48px raio 16
- [ ] folha com raio 24 no topo
- [ ] erro legível nos dois temas
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
