# 10a — Bottom sheet do perfil (novo)

**Tela:** Menu do perfil  ·  **Arquivo:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *12. Menu do perfil (bottom sheet)*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- **Componente novo.** É o destino de tudo que sai do header: engrenagem, "Sair", identidade e o acesso a Gestor e Meu desempenho.
- Aberto pelo avatar de 48px do header. Overlay `rgba(0,0,0,.4)`, folha raio `16px 16px 0 0`, fundo `--surface`, `padding:12px 16px 32px`.
- Handle 36×4 raio 2 centralizado, `margin-bottom:16px`.
- Identidade: avatar 48px pill `--tint-red`/`--tint-red-text` com iniciais 16/48/0.15 peso 700; nome 16/24/0.15 peso 600 `--text` sobre "`{papel}` · `{email}`" 12/16/0.4 `--text-faint`. `padding-bottom:16px`, borda inferior 1px `--border`.
- Itens: `min-height:56px`, borda inferior 1px `--border`, `display:flex; align-items:center; gap:16px` — ícone 24px + rótulo 16/24/0.15 peso 500 + `chevron_right` 24px `--text-disabled`.
- Os cinco: **Painel do gestor** (só `role === 'gestor'`) · **Meu desempenho** · **Exportar dados** · **Configurações** · **Sair** (ícone e rótulo em `#C8131B`).
- **Faça este prompt antes do 10b e antes de tirar a engrenagem do header** — senão o app fica sem logout e sem acesso ao tema no meio do caminho.

## Pronto quando

- [ ] sheet abre pelo avatar
- [ ] identidade com nome, papel e e-mail
- [ ] cinco itens de 56px
- [ ] "Painel do gestor" só para gestor
- [ ] "Sair" em vermelho e funcionando
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
