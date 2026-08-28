# 13a — Configurações: inventário e criação da tela

**Arquivo:** `App.tsx` → **criar** `src/screens/ConfiguracoesScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *10. Configurações* · screenshots `13-configuracoes-conta-senha.png`, `14-configuracoes-aparencia-gestor.png`, `15-configuracoes-admin-sobre.png`

> **Configurações não é uma tela hoje** — é um modal aberto pela engrenagem do header (`isPasswordModalOpen`). No desktop a engrenagem sai do header e isso vira uma tela própria na navegação.

## Fase 1 — inventário (não edite)

Localize o modal atual (`isPasswordModalOpen`, `styles.passwordModalCard` ~L7284, JSX ~L5170–5340) e liste **tudo** que ele contém hoje, na ordem, com o nome do estilo:

Já sei que existem, confirme e complete:

- atalho **"Abrir painel de gestão"** (`styles.gestaoButton`, link real para `/gestao`, hint "Funil do time, travados e gargalo. Melhor no computador.") — só gestor
- `styles.adminDivider`
- seletor de **tema**: chips Automático / Claro / Escuro (`styles.themeRow`, `themeChip`, `themeChipActive`)
- **"Trocar senha"** (`styles.adminSectionTitle`): hint "Digite uma nova senha. Mínimo de 6 caracteres.", campos "Nova senha" e "Confirmar nova senha", botão "Salvar nova senha"
- **forçar atualização**: `update` em `app_force_reload.triggered_at` — só admin
- botão de sair

Diga também: quais itens são condicionados por papel, e qual condição exata (`profile?.role`, `isAdmin`, `canViewGestor`).

## Fase 2 — criar a tela

- Criar `src/screens/ConfiguracoesScreen.tsx` recebendo por props: `profile`, `logout`, `updatePassword`, e o que mais o inventário apontar. `interface Props` tipada, sem `any`.
- Mover o conteúdo do modal para lá, **preservando toda a lógica** — `updatePassword`, o link para `/gestao` (que precisa continuar sendo um `<a href>` de verdade, não `window.open`), o `update` em `app_force_reload`.
- Adicionar `'config'` ao tipo `AppTab` e um item **"Configurações"** na sidebar, com ícone de engrenagem, **entre "Meu desempenho" e o rodapé**.
- Remover o botão de engrenagem do header (`styles.headerIconButton`) e o `isPasswordModalOpen`.
- O botão "Sair" do header também sai — o logout vive na tela e no rodapé da sidebar.
- Container da tela: `padding:24px`, `display:flex; flex-direction:column; gap:32px`, `max-width:880px`.

## Não fazer

- Não mude o comportamento de `updatePassword`, do link `/gestao` nem do `app_force_reload`.
- Não estilize as seções ainda — isso é o `13b`. Aqui o objetivo é a tela existir na navegação com o conteúdo dentro.

## Pronto quando

- [ ] inventário completo entregue, com as condições de papel
- [ ] `src/screens/ConfiguracoesScreen.tsx` existe, com `interface Props` tipada
- [ ] "Configurações" aparece na sidebar e abre a tela
- [ ] engrenagem e "Sair" saíram do header
- [ ] trocar senha, atalho `/gestao` e forçar atualização **continuam funcionando**
- [ ] `npm run typecheck` limpo
