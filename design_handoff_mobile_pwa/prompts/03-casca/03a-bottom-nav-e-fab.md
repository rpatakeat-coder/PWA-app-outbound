# 03a — Bottom nav de 4 abas + FAB central

**Tela:** Casca  ·  **Arquivo:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *Bottom nav: 4 abas + FAB central*
**Escopo:** só a barra inferior

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- De sete abas para **quatro + FAB**: **Mapa · Rota · [FAB] · Agenda · Tarefas**. Lista vira alternância dentro do Mapa (prompt 04); Gestor e Meu desempenho vão para o menu do perfil (prompt 10).
- Container: fundo `--surface`, borda superior 1px `--border`, `position:relative`, `padding-bottom` = área segura (o `navPaddingBottom` atual).
- Quatro abas em `display:flex`, cada uma `flex:1`, `min-height:56px`, `padding:8px 0`, coluna centralizada gap 2. **Um vão de 72px (`flex:0 0 72px`) no meio** reserva o FAB.
- Ícone 24px, rótulo 11/16/0.5. Ativa: peso 700 + `#C8131B` no ícone e no rótulo. Inativa: peso 500 + `--text-faint`.
- **Remover a pill de fundo da aba ativa** (`styles.navItemActive`: `--tint-red`, raio 12, margem 4). Com quatro abas a cor e o peso resolvem, e a pill brigava com o FAB.
- **FAB**: 60×60 pill, `position:absolute; left:50%; top:-24px; transform:translateX(-50%)`, fundo `#C8131B`, **borda 4px `--surface`** (recorta o FAB da barra), ícone `add` 32px branco, sombra `0 8px 16px rgba(200,19,27,.32)`. Abre o cadastro de lead. `aria-label="Adicionar lead"`.
- **Remover o FAB solto** de 56px do canto inferior direito (`styles.fab`).
- **Badge de Tarefas — leia com atenção:** envolver **só o ícone** num container `position:relative; display:inline-flex` e pôr o badge dentro dele em `top:-6px; right:-12px`, 18px pill `#C8131B`, texto 11/18 peso 700, borda 1.5px `--surface`, `box-sizing:content-box`. **Ancorado no botão não funciona** — o botão tem ~73px de largura e o `right` resolve no centro, cobrindo o ícone inteiro. É a estrutura que o `App.tsx` já usa hoje (`<View>` em volta do `<NavIcon>` + `styles.navBadge`).
- Recorte por papel: `role === 'view'` fica só com Mapa (Rota/Agenda/Tarefas e o FAB escondidos).

## Não fazer

- Não mexa no `navPaddingBottom` nem na leitura de `insets` — é o que mantém a barra acima da barra de gestos do iPhone.

## Pronto quando

- [ ] quatro abas + FAB central, com o vão de 72px
- [ ] sem pill de fundo na aba ativa
- [ ] **o ícone da prancheta de Tarefas está visível, com o badge no canto** — não coberto
- [ ] o FAB antigo do canto direito não existe mais
- [ ] viewer vê só Mapa, sem FAB
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
