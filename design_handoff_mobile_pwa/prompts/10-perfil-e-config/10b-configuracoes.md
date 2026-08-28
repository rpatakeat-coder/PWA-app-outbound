# 10b — Sheet de tela cheia (novo)

**Tela:** Configurações  ·  **Arquivo:** `App.tsx → criar src/screens/ConfiguracoesScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *13. Configurações*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- **Configurações não é uma tela hoje** — é o modal `isPasswordModalOpen` aberto pela engrenagem do header (JSX ~L5170–5340, `styles.passwordModalCard` ~L7284, `gestaoButton` ~L7296, `themeRow`/`themeChip` ~L7310).
- Primeiro **liste** o que o modal contém hoje, na ordem, com o nome do estilo, e as condições de papel de cada item.
- Criar `src/screens/ConfiguracoesScreen.tsx` recebendo `profile`, `logout`, `updatePassword` e o que o inventário apontar. `interface Props` tipada, sem `any`. **Preserve toda a lógica.**
- Alcançado pelo **Menu do perfil** (item "Configurações"). Sheet de **tela cheia** com header `arrow_back` 48×48 + "Configurações" 18/24 peso 600. O `arrow_back` volta para o menu do perfil, não para a tela anterior.
- Corpo `flex:1; overflow-y:auto; padding:16px 16px 32px`, coluna gap 24. Cinco seções, cada uma com cabeçalho fora do card (12/16/0.5 peso 700 `--text-muted`, uppercase, `margin-bottom:12px`) e card raio **16** com borda 1px `--border`.
- **1 · CONTA** — linhas **empilhadas**, não em duas colunas: `padding:12px 16px`, borda inferior 1px `--border`, `flex-direction:column; gap:2px` — chave 12/16/0.5 peso 600 `--text-faint` acima, valor 16/24/0.5 `--text` abaixo. Em 390px "Rafael Pereira" quebrava na coluna da direita. Nome · E-mail · Papel · ID HubSpot, e uma nota final 12/16/0.4: "Nome, e-mail e papel são definidos pelo administrador."
- **2 · APARÊNCIA** — card `padding:16px`: "Tema" 14/20/0.1 peso 600; explicação 12/16/0.4 ("Automático segue o aparelho. A escolha manual vale também no mapa."); segmented **Automático · Claro · Escuro** com altura **48**, raio 12 só nas pontas, 14/20/0.1 peso 600, selecionado `#C8131B`/branco.
- **3 · SENHA** — card `padding:16px`: hint com a copy atual ("Digite uma nova senha. Mínimo de 6 caracteres."); dois campos em **coluna** gap 16, altura **48** raio **16**; CTA "Salvar nova senha" altura 48 raio 12 `#C8131B` largura total.
- **4 · ÁREA DO GESTOR** (só gestor) — dois cards-link `padding:16px` raio 16 gap 12: ícone em quadrado 40×40 raio 12 (o primeiro `--tint-red`/`--tint-red-text` com `bar_chart`; o segundo `--surface-2`/`--text-muted` com `group`), título 16/24/0.15 peso 600 sobre descrição 12/16/0.4, e `open_in_new` / `chevron_right` 24px à direita. "Painel de gestão" (*"Melhor no computador. Abre em nova aba."*) e "Vendedores e usuários".
- **"Painel de gestão" continua sendo um `<a href>` de verdade para `/gestao`, não `window.open`** — há um comentário no código explicando o motivo.
- **5 · SOBRE** — linhas de leitura (versão do app, build do SW, sync de uso) com `tabular-nums`, e abaixo "Sair da conta" altura 48 raio 12 outline `#C8131B` com `logout`, largura total.
- Remover do header a engrenagem (`styles.headerIconButton`) e o botão "Sair"; remover o `isPasswordModalOpen`.
- O gatilho de **forçar atualização** (`app_force_reload.triggered_at`), se existe hoje no modal, entra como seção de administração — **não descarte**.

## Não fazer

- Não mude `updatePassword`, o link `/gestao` nem o `app_force_reload`.
- Não reescreva as copies que já existem.

## Pronto quando

- [ ] inventário do modal entregue com as condições de papel
- [ ] `ConfiguracoesScreen.tsx` existe, alcançado pelo menu do perfil
- [ ] linhas de Conta **empilhadas** (chave acima, valor abaixo)
- [ ] segmented de tema com 48px de altura
- [ ] campos de senha em coluna, 48px raio 16
- [ ] trocar senha, `/gestao` e forçar atualização **funcionando**
- [ ] engrenagem e "Sair" saíram do header
- [ ] trocar o tema aqui repinta a interface **e o mapa**
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
