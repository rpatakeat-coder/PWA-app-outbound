# M1 — Casca mobile: bottom nav de 4 abas + FAB e headers de tela (prompt único)

**Arquivo:** `App.tsx` — barra inferior (JSX ~L4866–4945; estilos `bottomNav`/`navItem`/`navItemActive`/`navBadge`/`fab` ~L7740–7797 e ~L7677) e header de tela (JSX `{/* Header */}` ~L4260; estilos `header`/`headerLeft`/`headerLogo`/`headerActions`/`headerIconButton`/`logoutButton` ~L7256–7283).
**Referência visual:** `design_handoff_mobile_pwa/Field Sales - Mobile PWA.dc.html` + `screenshots/01-mapa.png` e `14-dark-mapa.png`.

> Substitui `03a-bottom-nav-e-fab.md`, `03b-headers-e-reserva-do-fab.md` e `03R-revisao.md` — leia só este.
> O `M0-base-completo.md` já rodou: os tokens existem e a Poppins 700 carrega.
>
> Tarefa única: **só a casca**. Não redesenhe o conteúdo de nenhuma tela. Se encontrar algo errado fora do escopo, anote e siga.

**Tokens mobile ≠ desktop.** Input 48px raio **16** · botão 48px raio 12 tipo 16/600 · card raio **16** · maior tipo Title Medium **18/24** · spacing só até **24** (a **única** exceção é o `padding-bottom: 40px` da reserva do FAB) · alvo **48px** · raios só `4 · 12 · 16 · pill`.

Números de linha são do handoff — **localize pelo nome do estilo ou da função**, não pela linha.

---

## 1 · Bottom nav: de sete abas para quatro + FAB

Hoje a barra comporta até sete abas (Mapa · Lista · Rota · Agenda · Tarefas · Gestor · Meu): em 390px cada alvo fica em ~53px e o rótulo de 11px encosta no do vizinho. Passa a ser:

**Mapa · Rota · [FAB] · Agenda · Tarefas**

As outras três não somem, mudam de lugar — e **isso é feito nos prompts seguintes, não aqui**:

- **Lista** vira alternância dentro do Mapa (segmented no header) — prompt M2.
- **Gestor** e **Meu desempenho** vão para o menu do perfil — prompt M10.

Nesta tarefa as três abas apenas **saem da barra**. Se as telas ainda não têm outro caminho, deixe o destino alcançável por estado (ou anote na terceira linha da resposta) — não invente navegação nova.

**Container:** fundo `--surface`, borda superior 1px `--border`, `position: relative` (o FAB é filho absoluto), `padding-bottom` = área segura — **o `navPaddingBottom` atual, somando `insets`**. Não substitua por valor fixo: no iPhone instalado a barra cai embaixo da barra de gestos.

**Abas:** `display:flex`; cada uma `flex:1`, `min-height:56px`, `padding:8px 0`, coluna centralizada, gap 2. **Um vão de 72px (`flex:0 0 72px`) no meio** reserva o espaço do FAB.

**Ícone** 24px, **rótulo** 11/16/0.5.
- Ativa: peso **700** + `#C8131B` no ícone e no rótulo.
- Inativa: peso 500 + `--text-faint`.

**Remover a pill de fundo da aba ativa** (`styles.navItemActive`: fundo `--tint-red`, raio 12, margem 4). Com quatro abas a cor do ícone e o peso do rótulo já resolvem, e a pill brigava visualmente com o FAB.

**Recorte por papel:** `role === 'view'` fica só com Mapa — Rota, Agenda, Tarefas **e o FAB** escondidos. Mesma lógica de `isViewer` já em `App.tsx`.

Ícones em produção: `IconLocation`/`IconLocationFilled` (Mapa) · `IconCar` (Rota) · `IconCalendar` (Agenda) · `IconClipboardCheck` (Tarefas) · `IconPlus` (FAB). Cor vem por prop `fill` via `useIconColors()` — `var(--token)` não resolve em prop de ícone.

## 2 · FAB central

60×60 pill, `position:absolute; left:50%; top:-24px; transform:translateX(-50%)`, fundo `#C8131B`, **borda 4px `--surface`** (é ela que recorta o FAB da barra), ícone `add`/`IconPlus` 32px branco, sombra `0 8px 16px rgba(200,19,27,.32)` — a única sombra tingida da marca no app. Abre o cadastro de lead. `aria-label="Adicionar lead"`. No toque: `scale(.94)` 120ms.

**Remover o FAB solto** de 56px que flutuava no canto inferior direito sobre o mapa (`styles.fab`) — ele cobria conteúdo, e manter os dois cria dois caminhos para criar lead.

## 3 · Badge de Tarefas — leia com atenção

`min-width:18px; height:18px; padding:0 5px`, raio 9, fundo `#C8131B`, texto branco 11/18 peso 700, borda 1.5px `--surface`, `box-sizing:content-box`.

**Ancorado no ÍCONE, não no botão.** Envolva **só o ícone** num container `position:relative; display:inline-flex` e ponha o badge dentro dele em `top:-6px; right:-12px`, pendurado no canto superior direito do ícone. É exatamente a estrutura que o `App.tsx` já usa (o `<View>` em volta do `<NavIcon>` + `styles.navBadge`) — **preserve-a**.

Ancorado no botão, que tem ~73px de largura, o `right` resolve para perto do centro e o badge cobre o ícone da prancheta inteiro; e piora conforme o número cresce ("99+"). É o erro nº 1 desta tela.

Os cálculos de `visibleTasks` / `tasksActiveVendor` que alimentam o badge **ficam onde estão** — não mova.

## 4 · Header de tela

Fundo `#C8131B` no claro e **`--surface` no escuro** — o vermelho chapado no topo cansa no modo noturno e briga com a superfície escura. `padding:12px 16px`. Faz parte da coluna da tela; **não** é sticky separado.

**Avatar 48px pill** (`rgba(255,255,255,.18)`, iniciais 14/20/0.1 peso 700 branco) **sempre** no canto superior direito, abrindo o menu do perfil.

**Sai do header:** o logo de 32px, o nome do vendedor, o botão de engrenagem 44×44 (`styles.headerIconButton`) e o `logoutButton`. Todos vão para o menu do perfil — **prompt M10**. Como o menu ainda não existe nesta etapa, ligue o avatar ao estado que abrirá o sheet (`perfilAberto`) e **mantenha o `logout` alcançável** por ele ou anote explicitamente que o app fica sem logout até o M10. Não deixe o app sem saída sem avisar.

A composição do resto do header varia por tela e é definida em cada prompt de tela. Aqui só o esqueleto: fundo, padding, avatar à direita, e o que saiu.

## 5 · A reserva de 40px — vale para as quatro telas com barra

O FAB protrai **24px** acima da borda superior da barra. Todo conteúdo ancorado no rodapé precisa de `padding-bottom: 40px` (16 + 24):

- o peek sheet do mapa
- os scrolls de **Lista, Rota, Agenda e Tarefas**

Sem isso o círculo vermelho cai em cima do CTA do último card — e só aparece quando você rola até o fim. É o erro nº 2.

Telas **sem** barra (Gestor, Meu desempenho, Login) e os sheets, que têm rodapé fixo próprio, seguem com 16px.

---

## Não fazer

- Não mexa no `navPaddingBottom` nem na leitura de `insets`.
- Não mexa na máquina de estado da aba (`const [tab, setTab] = useState<AppTab>('map')`).
- Não redesenhe o conteúdo de nenhuma tela — só a casca.
- Não toque no service worker, no `useForceReload`, no `src/theme.ts` nem nos hooks de dados.
- Não crie o menu do perfil aqui (é o M10).

## Auditoria final — responda item por item

Depois de aplicar, percorra a lista e responda **OK / FALTA / DIVERGE** (citando valor encontrado e esperado):

1. Quatro abas: Mapa · Rota · Agenda · Tarefas, com vão de 72px no meio.
2. Aba `flex:1`, `min-height:56px`, `padding:8px 0`, ícone 24px, rótulo 11/16/0.5.
3. Ativa peso 700 + `#C8131B`; inativa peso 500 + `--text-faint`.
4. Sem pill de fundo na aba ativa.
5. FAB 60×60 pill, `top:-24px`, borda 4px `--surface`, ícone 32px, sombra `0 8px 16px rgba(200,19,27,.32)`.
6. FAB com `aria-label`.
7. **Badge ancorado no ícone** — o ícone da prancheta de Tarefas está visível.
8. Badge com borda 1.5px `--surface` e `box-sizing:content-box`.
9. O FAB solto de 56px não existe mais.
10. `navPaddingBottom` / `insets` preservados.
11. Viewer vê só Mapa, sem FAB.
12. Header `#C8131B` no claro, `--surface` no escuro, `padding:12px 16px`.
13. Avatar 48px pill no canto direito.
14. Logo, nome, engrenagem e "Sair" saíram do header — e o logout continua alcançável (ou foi anotado).
15. Reserva de 40px no peek sheet e nos quatro scrolls.
16. Rolando até o fim de cada lista, o FAB não cobre nenhum botão.
17. Telas sem barra e sheets seguem com 16px.
18. Nenhum hex fora dos literais permitidos; spacing só até 24 (exceto a reserva de 40); raios só `4 · 12 · 16 · pill`; todo alvo ≥ 48px.
19. `npm run typecheck` limpo.

**Conferir em 390 × 844** (DevTools, iPhone 14), comparar com o screenshot, **alternar o tema e repetir no escuro**, e no PWA instalado conferir que nada fica embaixo da barra de gestos.

## Ao terminar

Três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o estado, o ícone ou o destino que falta** — mais a auditoria acima.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
