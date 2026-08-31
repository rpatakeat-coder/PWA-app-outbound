# M7 — Menu do perfil e Configurações (prompt único)

**Arquivos:** `App.tsx` (header, avatar, sheet novo) · criar `src/screens/ConfiguracoesScreen.tsx`
**Referência visual:** `screenshots/13-dark-menu-do-perfil.png` · README seções *12. Menu do perfil (bottom sheet)* e *13. Configurações*
**Pergunta que as telas respondem:** *quem sou eu aqui, e por onde saio?*

> Substitui `10a-menu-do-perfil.md`, `10b-configuracoes.md` e `10R-revisao.md` — leia só este.
> `M0` a `M6` já rodaram. Não toque em nenhuma outra tela.
>
> **Este prompt fecha três dívidas abertas no M6:** Gestor e Meu desempenho não têm entrada no celular (nada chama `setTab('gestor')` / `setTab('meu')`), o `arrow_back` dessas duas volta para o Mapa por falta de origem, e o avatar do header ainda usa o atalho provisório do M1. O menu do perfil é o destino das três.

**Tokens mobile ≠ desktop.** Maior tipo **18/24** · input 48px raio **16** · botão 48px raio **12** · card raio **16** · spacing só até **24** (+32 de rodapé de área segura) · alvo **48px** · raios só `4 · 12 · 16 · pill`.

---

## Fase 1 · Inventário — sem editar nada

Sem isto, mover o modal para uma tela perde lógica silenciosamente.

1. Listar o que o modal `isPasswordModalOpen` renderiza **hoje**, na ordem, com o nome do estilo de cada bloco e a **condição de papel** de cada item (`styles.passwordModalCard`, `gestaoButton`, `themeRow`/`themeChip` e o que mais houver).
2. Listar o que o header renderiza hoje à direita do título: engrenagem (`styles.headerIconButton`), "Sair", avatar — e **para onde o avatar leva agora** (o provisório do M1).
3. Dizer se existem, e com que nome exato: `updatePassword`, o link `/gestao`, `app_force_reload.triggered_at`, versão do app, build do Service Worker, sync de uso.
4. Preencher:

| O desenho pede | Existe? | Onde / campo |
|---|---|---|
Nome · E-mail · Papel · ID HubSpot | | |
Troca de senha | | |
Seletor de tema (3 opções) | | |
Link `/gestao` | | |
Vendedores e usuários | | |
Forçar atualização | | |
Versão do app / build do SW | | |
Logout | | |

**Se um item não existir, diga qual e não o desenhe.** Não crie query, rota nem cálculo novo — omitir a linha é melhor que inventar dado.

Entregue a tabela **antes** de começar a fase 2, na mesma resposta.

---

## Fase 2 · Aplicar

### A · Menu do perfil (bottom sheet, componente novo em `App.tsx`)

Faça **este bloco primeiro**, antes de mexer no header e antes das Configurações — senão o app fica sem logout e sem tema no meio do caminho.

- Abre pelo **avatar 48×48 do header**, nas quatro telas com barra. Substitui o atalho provisório do M1.
- Overlay `rgba(0,0,0,.4)`; folha raio `16px 16px 0 0`, fundo `--surface`, `padding:12px 16px 32px`.
- Handle 36×4 raio 2 centralizado, `margin-bottom:16px`.
- **Identidade:** avatar 48px pill `--tint-red`/`--tint-red-text` com iniciais 16/48/0.15 peso 700; nome 16/24/0.15 peso 600 `--text` sobre "`{papel}` · `{email}`" 12/16/0.4 `--text-faint`. `padding-bottom:16px`, borda inferior 1px `--border`.
- **Itens:** `min-height:56px`, borda inferior 1px `--border`, `display:flex; align-items:center; gap:16px` — ícone 24px + rótulo 16/24/0.15 peso 500 + `chevron_right` 24px `--text-disabled`.
- Os cinco, nesta ordem: **Painel do gestor** (só `canViewGestor`) · **Meu desempenho** (esconder para `isViewer`, que já é redirecionado) · **Exportar dados** · **Configurações** · **Sair** (ícone e rótulo `#C8131B`).
- **Painel do gestor** chama `setTab('gestor')`; **Meu desempenho** chama `setTab('meu')` — é a entrada que faltava. Ao navegar, feche a folha e **guarde a aba de origem** para o `arrow_back` (ver C).

### B · Configurações (`src/screens/ConfiguracoesScreen.tsx`)

`interface Props` tipada (`profile`, `logout`, `updatePassword` + o que o inventário apontar), sem `any`. **Preserve toda a lógica do modal.**

Sheet de **tela cheia**, alcançado pelo item "Configurações" do menu. Header `padding:12px 16px`: `arrow_back` 48×48 raio 12 `rgba(255,255,255,.18)` + "Configurações" 18/24 peso 600. **O `arrow_back` reabre o menu do perfil**, não a tela anterior.

Corpo `flex:1; overflow-y:auto; padding:16px 16px 32px`, coluna gap 24. Cada seção: cabeçalho **fora** do card (12/16/0.5 peso 700 `--text-muted`, uppercase, `margin-bottom:12px`) + card raio **16** borda 1px `--border`.

1. **CONTA** — linhas **empilhadas**, nunca em duas colunas: `padding:12px 16px`, borda inferior 1px `--border`, `flex-direction:column; gap:2px` — chave 12/16/0.5 peso 600 `--text-faint` acima, valor 16/24/0.5 `--text` abaixo. Nome · E-mail · Papel · ID HubSpot. Nota final 12/16/0.4: "Nome, e-mail e papel são definidos pelo administrador." *(Em 390px "Rafael Pereira" quebrava na coluna da direita.)*
2. **APARÊNCIA** — card `padding:16px`: "Tema" 14/20/0.1 peso 600; explicação 12/16/0.4 ("Automático segue o aparelho. A escolha manual vale também no mapa."); segmented **Automático · Claro · Escuro**, altura **48**, raio 12 só nas pontas, 14/20/0.1 peso 600, selecionado `#C8131B`/branco.
3. **SENHA** — card `padding:16px`: hint com a copy atual ("Digite uma nova senha. Mínimo de 6 caracteres."); dois campos em **coluna** gap 16, altura **48** raio **16**; CTA "Salvar nova senha" altura 48 raio 12 `#C8131B`, largura total.
4. **ÁREA DO GESTOR** (só gestor) — dois cards-link `padding:16px` raio 16 gap 12: ícone em quadrado 40×40 raio 12 (primeiro `--tint-red`/`--tint-red-text` com `bar_chart`; segundo `--surface-2`/`--text-muted` com `group`), título 16/24/0.15 peso 600 sobre descrição 12/16/0.4, `open_in_new` / `chevron_right` 24px à direita. "Painel de gestão" (*"Melhor no computador. Abre em nova aba."*) e "Vendedores e usuários". **"Painel de gestão" continua um `<a href>` real para `/gestao`, não `window.open`** — há comentário no código explicando o motivo.
5. **SOBRE** — linhas de leitura (versão do app, build do SW, sync de uso) com `tabular-nums`; abaixo, "Sair da conta" altura 48 raio 12 **outline** `#C8131B` com `logout`, largura total.

O gatilho de **forçar atualização** (`app_force_reload.triggered_at`), se existir hoje no modal, entra como seção de **ADMINISTRAÇÃO** — não descarte.

### C · Limpeza do header e a volta do M6

- Remover do header a engrenagem (`styles.headerIconButton`) e o botão "Sair"; remover `isPasswordModalOpen` e o estilo do card do modal se ficarem órfãos.
- Guardar a aba de origem ao entrar em `gestor` / `meu` / Configurações e fazer o `arrow_back` voltar para ela. **Sem isso o M6 continua caindo no Mapa** — se a solução mais limpa for um `abaAnterior` no state, faça e declare.
- Não mexer nos redirecionamentos de papel do `useEffect` (`isViewer`, `canViewGestor`): o menu **esconde** o item, o guard continua sendo a rede.

---

## Não fazer

- Não mude `updatePassword`, o `<a href>` de `/gestao` nem o `app_force_reload`.
- Não reescreva copies que já existem.
- Não deixe dois caminhos: a engrenagem sai quando a tela entra.
- Não porte valor de desktop (segmented de 40px, tipo 22/28 ou 24).
- Não invente item de menu, rota ou dado de "Sobre".

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Menu abre pelo avatar 48px nas quatro telas com barra; o provisório do M1 saiu.
2. Folha raio `16px 16px 0 0`, `padding:12px 16px 32px`, handle 36×4.
3. Identidade: avatar 48px `--tint-red`/`--tint-red-text`, nome 16/24/0.15 peso 600, papel e e-mail 12/16/0.4.
4. Cinco itens `min-height:56px`, ícone 24px, rótulo 16/24/0.15 peso 500, `chevron_right`.
5. "Painel do gestor" só para gestor; "Meu desempenho" oculto para viewer.
6. **`setTab('gestor')` e `setTab('meu')` são chamados daqui** — as duas telas do M6 têm entrada no celular.
7. **`arrow_back` de Gestor e Meu volta para a aba de origem**, não para o Mapa.
8. "Sair" em `#C8131B` e o logout funciona.
9. Configurações é sheet de tela cheia; `arrow_back` reabre o **menu do perfil**.
10. Cinco seções (+ Administração se existir), cabeçalho 12/16/0.5 peso 700 uppercase, card raio 16.
11. Linhas de Conta **empilhadas**; nada quebrando em 390px.
12. Segmented de tema altura **48**, raio 12 só nas pontas.
13. **Trocar o tema aqui repinta a interface E o mapa** (o mapa lê o tema em JS).
14. Campos de senha em coluna, 48 raio 16; CTA largura total 48px; hint com a copy original.
15. "Painel de gestão" é `<a href>` real para `/gestao`.
16. Forçar atualização preservado (se existia) e funcionando.
17. "Sair da conta" 48px outline `#C8131B` funcionando.
18. Engrenagem e "Sair" saíram do header; `isPasswordModalOpen` não é mais usado.
19. Seções de gestor/admin escondidas para quem não tem papel — testar os **três papéis**.
20. Rodapé `padding-bottom:32px`.
21. Nenhum hex fora dos literais permitidos; spacing ≤ 24 (+32 do rodapé); maior tipo 18/24; raios só `4 · 12 · 16 · pill`; alvo ≥ 48.
22. `npm run typecheck` limpo.

**Conferir em 390 × 844**, comparar com `13-dark-menu-do-perfil.png`, **alternar o tema e repetir no escuro**, e no PWA instalado checar que nada fica embaixo da barra de gestos.

## Ao terminar

A tabela da fase 1, depois três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o campo que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
