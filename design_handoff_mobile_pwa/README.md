# Handoff: Field Sales Outbound — PWA Mobile

## Overview

O app de campo outbound da Takeat (`rpatakeat-coder/PWA-app-outbound`) é instalado no celular como PWA e é onde o vendedor trabalha de fato — em pé, na rua, com uma mão. Hoje a barra inferior comporta **até sete abas** (Mapa · Lista · Rota · Agenda · Tarefas · Gestor · Meu): em 390px cada alvo fica em ~53px de largura e o rótulo de 11px encosta no do vizinho. A legenda de temperatura ocupa um quarto da altura do mapa, e o header vermelho gasta 52px com logo, nome do vendedor, engrenagem e "Sair" — nenhum dos quatro é ação de campo.

Este handoff cobre a **superfície mobile** redesenhada: **quatro abas + FAB central**, bottom sheets no lugar de modais, alvos de 48px e a hierarquia reorganizada para o que se faz na rua — encontrar o lead, chegar, fazer check-in, agendar.

O desktop web foi redesenhado em paralelo e tem pacote próprio (`design_handoff_desktop_web/`). **Os dois compartilham os mesmos tokens**; o que muda é altura de controle, raio, densidade e navegação.

## About the Design Files

Os arquivos deste bundle são **referências de design feitas em HTML** — protótipos que mostram aparência e comportamento pretendidos, **não código de produção para copiar**. Eles usam um runtime de protótipo (`support.js`) que não é código de produção. O aparelho desenhado em volta da tela é moldura de apresentação: **não** implementar bezel, barra de status falsa nem relógio "9:41".

A tarefa é **recriar esses designs no ambiente já existente do codebase**: React 19 + react-native-web sob Expo SDK 54, `@tanstack/react-query` para dados, hooks em `src/hooks/`, telas em `src/screens/`, tokens CSS em `public/index.html`, mapa em `src/map/`. Não introduzir framework novo, não trocar o mecanismo de tema (`src/theme.ts` escreve `data-theme` no `<html>`), não mexer no service worker nem no `useForceReload`.

**Restrições reais do ambiente que este design respeita:**
- `viewport-fit=cover` + `env(safe-area-inset-*)` via `react-native-safe-area-context` — todo rodapé fixo reserva a área segura. O padrão `paddingBottom: navPaddingBottom` já existente continua valendo
- `user-scalable=no` na página; a pinça do mapa é da Google
- `overscroll-behavior-y: contain` — o arraste para baixo é pan, não pull-to-refresh
- `height: 100dvh` com fallback `-webkit-fill-available`
- `body { overflow: hidden }`; o scroll é dos `<ScrollView>`/`<FlatList>`

## Onde cada tela vive no código — LEIA ANTES DE COMEÇAR

`App.tsx` tem **8.445 linhas / 383 KB**. Três das telas deste redesign não são arquivos: são funções de render dentro dele. Uma passada única no `App.tsx` não alcança todas — **trabalhe tela por tela, na ordem abaixo, e confirme cada uma antes de seguir.**

**A numeração desta tabela é a mesma da seção `Screens / Views`.** "Tela 4" é Tarefas aqui e lá.

### 0 · Base (fazer primeiro, antes de qualquer tela)

| O que | Arquivo | Âncora |
|---|---|---|
Tokens de cor | `public/index.html` | `<style id="takeat-theme">`, bloco `:root` — adicionar `--stroke-default`, `--stroke-strong`, `--text-disabled`; remapear `--green-dark`/`--teal-dark`/`--blue-dark` no bloco escuro |
Peso 700 da Poppins | `public/index.html` | o `<link>` do Google Fonts: `wght@400;500;600;800` → `400;500;600;700;800` |
Degraus de largura | `src/hooks/useLayout.ts` | `alvo: 48` abaixo de 1024px já está correto — **conferir, não mexer** |
Ícones | `src/components/icons.tsx` | adicionar os que faltam (tabela de ícones no fim deste README) |

### Telas

| # | Tela | Onde está hoje | Âncora |
|---|---|---|---|
| — | **Casca: bottom nav + FAB** | `App.tsx` | JSX da barra ~L4866–4945 (`styles.bottomNav`, os `TouchableOpacity` de aba, o badge de Tarefas); estilos `bottomNav`/`navItem`/`navItemActive`/`navBadge`/`fab` ~L7740–7797 e ~L7677 |
| — | **Header de tela** | `App.tsx` | JSX `{/* Header */}` ~L4260; `styles.header`/`headerLeft`/`headerLogo`/`headerActions`/`headerIconButton`/`logoutButton` ~L7256–7283 |
| 1 | **Mapa / Lista** | `App.tsx` | bloco `tab === 'map'` ~L4403–4790; busca e chips ~L4325–4400; `renderClientItem` ~L2604; `FlatList` da lista ~L4791; estilos `map`/`tempLegend`/`mapButton`/`searchBar`/`filterChip`/`clientCard` ~L7359–7378, ~L7439–7470, ~L7536–7600, ~L7855 |
| 2 | **Rota** | `App.tsx` | `const renderRouteScreen = () => {` **~L2699–3160**; `renderCompactClient` ~L2678 |
| 3 | **Agenda** | `App.tsx` | `const renderAgendaScreen = () => {` **~L3384–3984**; `renderMeetingChip` ~L6070; estilos `cal*` ~L7797–7850 (**hoje são desktop-only — no mobile a tira da semana é nova**) |
| 4 | **Tarefas** | `App.tsx` | `const renderTasksScreen = () => {` **~L3160–3384**; estilos `kanban*` ~L8086 (**o kanban sai — viram abas**) |
| 5 | **Painel do gestor** | `src/screens/GestorScreen.tsx` | arquivo inteiro (47 KB) + `src/hooks/useGestorMetrics.ts`, `useVisitsHeatmap.ts` |
| 6 | **Meu desempenho** | `src/screens/MeuDesempenhoScreen.tsx` | arquivo inteiro + `src/hooks/useSellerGoals.ts`, `useMinhaDaily.ts` |
| 7 | **Login** | `src/screens/LoginScreen.tsx` | arquivo inteiro |
| 8 | **Ficha do lead** | `App.tsx` | props do sheet ~L4180–4245; o componente do bottom sheet é irmão no mesmo arquivo — buscar por `selectedClientSheet` |
| 9 | **Mudança de etapa** | `src/screens/ChangeStageModal.tsx` | arquivo inteiro (43 KB) — passa a ser sheet de tela cheia |
| 10 | **Agendar** | `src/screens/ScheduleMeetingModal.tsx` | arquivo inteiro — passa a ser sheet de tela cheia |
| 11 | **Cadastro + CEP** | `src/screens/CEPStep.tsx` (+ `OutboundCadastroScreen.tsx`) | arquivos inteiros; a navegação de 3 passos já existe — manter |
| 13 | **Configurações** | **não existe como tela** | hoje é o modal `isPasswordModalOpen` (JSX ~L5170–5340, `styles.passwordModalCard` ~L7284, `gestaoButton` ~L7296, `themeRow`/`themeChip` ~L7310). Criar `src/screens/ConfiguracoesScreen.tsx`, alcançado pelo Menu do perfil |
| 12 | **Menu do perfil** | **não existe** | criar `src/screens/PerfilSheet.tsx`. Recebe o que hoje vive no header e no modal de senha: `profile`, `logout`, `updatePassword` (`AuthContext`), o seletor de tema (`useTheme` de `src/theme.ts`) e a navegação para as telas 5 e 6. O `isPasswordModalOpen` / `passwordModalCard` (~L4266, ~L7284) passa a ser aberto daqui |

> Números de linha são de `main` no momento do handoff — **localize pelo nome da função ou do estilo**, não pela linha.

### Recomendação: extrair antes de redesenhar

As telas 2, 3 e 4 são ~1.300 linhas de JSX presas no meio do `App.tsx`. Antes de aplicar o design, extraia cada uma para `src/screens/RotaScreen.tsx`, `AgendaScreen.tsx` e `TarefasScreen.tsx` — recebendo por props o que hoje leem do escopo do componente (`clients`, `routeStops`, `fieldOps`, `visibleTasks`, `meetingsByClient`, `layout`, `insets`, os handlers). É refactor sem mudança de comportamento, e depois cada tela cabe numa passada.

Se preferir não extrair, edite uma função por vez e rode `npm run typecheck` entre cada uma.

### Ordem de trabalho

1. **Base** (seção 0) — tokens, fonte, ícones
2. **Casca** — bottom nav de 4 abas + FAB central e os headers de tela. Duas armadilhas conhecidas, ambas documentadas em *Navegação*: o **badge se ancora no ícone**, não no botão; e todo conteúdo encostado no rodapé reserva **40px** para o FAB
3. **Tela 1** (Mapa / Lista) — inclui o segmented, o peek sheet e a saída da legenda sobre o mapa
4. **Telas 2, 3 e 4** (Rota, Agenda, Tarefas) — extrair primeiro
5. **Telas 5 e 6** (Gestor, Meu desempenho) — versões condensadas
6. **Tela 12** (Menu do perfil) — precisa existir antes de o header perder a engrenagem e o "Sair"
7. **Telas 8, 9, 10, 11** (Ficha e os sheets) e **Tela 7** (Login)

> A tela 12 vem antes das 8–11 de propósito: ela é o destino de tudo que sai do header. Fazer o header primeiro e o menu depois deixa o app sem logout e sem seletor de tema no meio do caminho.

### Checklist por tela

Uma tela só está pronta quando:

- [ ] nenhum `#` hexadecimal sobrou fora dos literais permitidos (temperatura do funil, tints de etapa/estado/SLA, marca) — o resto é `var(--token)`
- [ ] nenhum spacing fora de `2 · 4 · 8 · 12 · 16 · 24` (32 e 40 são desktop-only; a única exceção é o `padding-bottom: 40px` da reserva do FAB)
- [ ] raios só `4 · 12 · 16 · pill` — input 16, botão 12
- [ ] todo alvo tocável tem **no mínimo 48px**
- [ ] nenhum token de tipografia desktop-only (Title Large 22, Heading XS/Small/Medium) — o maior do mobile é Title Medium 18
- [ ] **modo escuro conferido** — é onde os problemas de contraste aparecem; ver *Correção de contraste no modo escuro*
- [ ] `npm run typecheck` limpo

### O que NÃO mexer

Comportamento que este redesign não altera. Se um diff tocar nestes pontos, é regressão:

- service worker, `useForceReload`, `scripts/build-web.js`, `vercel.json`
- `src/theme.ts` — o mecanismo de tema (`data-theme` no `<html>`) e o `ThemePref`
- clustering do mapa (`radius 50`, `minPoints 3`, `maxZoom 14`, `animationEnabled={false}`) e o carregamento por área visível (`renderBounds`, `mapRegion`, `showOnlyMyArea`)
- `src/constants/stages.ts` — etapas, IDs, `subFields`, regras de avanço, `TEMP_COLORS`
- `src/utils/hubspotSync.ts` e as Edge Functions — nenhum payload muda
- validação de distância do check-in (200m) e a Task concluída no HubSpot
- os hooks de dados: `useClients`, `useMeetings`, `useClientTasks`, `useFieldOps`, `useGestorMetrics`, `useVisitsHeatmap`, `useRouteHistory`, `useSellerGoals`, `useMinhaDaily`
- `public/manifest.json` (só o `theme_color`, se quiser alinhar ao `#C8131B` — hoje é `#0f172a`, que não é cor do app)

## Fidelity

**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, raios, sombras e copy são finais e vêm do UI Kit oficial da Takeat (`takeat-design/UIKIT@main` — `foundations.md` e `components.md`). Recriar pixel-perfect usando os tokens abaixo.

O que **não** é final: o mapa nos protótipos é placeholder de grade CSS — no app é o `<MapView>` real de `src/map/`. Os ícones são Material Symbols Rounded porque `components.md` referencia nomes Material; **em produção usar os oficiais** de `src/components/icons.tsx` (tabela de tradução no fim).

---

## Design Tokens

Idênticos ao pacote desktop. Os tokens já existem em `public/index.html` sob outros nomes — a coluna "Variável no repo" é a que deve ser usada. **Não criar variáveis novas.**

### Cores semânticas (`foundations.md` §1)

| Papel | Variável no repo | Light | Dark |
|---|---|---|---|
`surface/background` | `--bg` | `#F6F6F6` | `#121212` |
`surface/raised` | `--surface` | `#FFFFFF` | `#1E1E1E` |
`surface/nested` | `--surface-2` | `#F6F6F6` | `#262626` |
`surface/fill` | `--surface-3` | `#EDEDED` | `#2A2A2A` |
`text/primary` | `--text` | `#222222` | `rgba(255,255,255,.92)` |
`text/secondary` | `--text-muted` | `#545454` | `rgba(255,255,255,.64)` |
`text/tertiary` | `--text-faint` | `#7A7A7A` | `rgba(255,255,255,.42)` |
`text/disabled` | — | `#C6C6C6` | `rgba(255,255,255,.28)` |
`stroke/subtle` | `--border` | `#EDEDED` | `rgba(255,255,255,.08)` |
`stroke/default` | — | `#C6C6C6` | `rgba(255,255,255,.14)` |
`stroke/strong` | — | `#7A7A7A` | `rgba(255,255,255,.24)` |

Faltam três no repo — **adicionar a `public/index.html`**: `--stroke-default`, `--stroke-strong`, `--text-disabled` (valores acima).

### Cores de marca

| Token | Hex | Uso |
|---|---|---|
`red/default` | `#C8131B` | header do app, CTA primário, aba ativa, FAB, marca |
`red/dark` | `#94090F` | pressed do CTA; **texto vermelho legível no claro** (`--tint-red-text`) |
`red/tint` | `#FAE8E9` | fundo tonal, badge, aba ativa (`--tint-red`) |
`teal/dark` | `#1D9688` | exportações |
`blue/dark` | `#018CCC` | link. **Foco de input `#016999`** |
`yellow/default` | `#FFB32F` | atenção, semáforo âmbar |
`yellow/dark` | `#CC8C1D` | régua de bloco obrigatório |
`green/default` | `#27A84C` | **botão de check-in** |
`green/dark` | `#167532` | valores positivos, parada visitada |

**⚠ Correção de contraste no modo escuro.** `#94090F` (red/dark) e `#167532` (green/dark) dão ~2,6:1 sobre `#121212`/`#1E1E1E` — reprovam. No escuro trocar por:

```
#94090F → #E5A1A4   (primary.red.200 — já é o valor de --brand-text no dark)
#167532 → #77BD8B   (já é --tint-green-text no dark)
#1D9688 → #5FD3C6
#018CCC → #66CFFF   (já é --info-text no dark)
```

Onde isso aparece: prazo vencido de tarefa, delta negativo de KPI, "última visita > 30 dias", MRR positivo, texto de exportação. `--tint-red-text` e `--tint-green-text` já fazem esse par no repo — **usar os tokens, não os hexes**.

Badges com **fundo tonal claro** (`#FAE8E9`, `#FFF8EB`, `#EAF7EE`) mantêm o texto escuro nos dois modos: são superfícies próprias, não herdam o fundo do tema.

**Temperatura do funil** — literais, não invertem no dark (`src/constants/stages.ts`, `TEMP_COLORS`):
`hot #C8131B` · `warm #FFB32F` · `cold #0ea5e9` · `won #16a34a` · `lost #475569` · Conta Alvo `#7c3aed`

**Tints de temperatura** (badge no card de lead; no dark cai para `--surface-2` com texto `--text`):

| Temperatura | bg | fg |
|---|---|---|
Quente | `#FAE8E9` | `#94090F` |
Morno | `#FFF8EB` | `#99670F` |
Frio | `#E6F7FF` | `#016999` |
Fechado | `#EAF7EE` | `#167532` |
Perdido | `#EDEDED` | `#545454` |

### Tipografia — tokens **mobile** de `foundations.md` §2

**Poppins**, já carregada (pesos 400/500/600/800 — **adicionar 700**).

Três tokens do kit são **proibidos no mobile**: Title Large (22), Heading XS (20), Heading Small (24), Heading Medium (28). Label Small (11) é "caution". A escala mobile deste design:

| Token | px / lh / ls | Onde |
|---|---|---|
Label Small | 11 / 16 / 0.5 | kicker, sublabel de KPI, rótulo de aba, badge, tag, dia da semana |
Body Small | 12 / 16 / 0.4 | metadados, subtítulo de header, detalhe de parada |
Label Medium | 12 / 16 / 0.5 | chips, contadores, cabeçalho de seção (700, uppercase) |
Body Medium | 14 / 20 / 0.25 | corpo de tarefa, valor de campo de ficha |
Label Large | 14 / 20 / 0.1 | rótulo de campo (600), índice de parada, nome em lista compacta |
Body Large | 16 / 24 / 0.5 | **texto e placeholder de input** |
Title Small | 16 / 24 / 0.15 | **rótulo de botão mobile (600)**, nome de lead em card, título de card |
Title Medium | 18 / 24 / 0 | **título de tela e de sheet (600)** — o maior tipo do mobile |

Números **sempre** `font-variant-numeric: tabular-nums`.

Exceção única: o banner de meta em Meu desempenho usa 18/24 peso 700 para o número — não subir para Heading no mobile.

### Espaçamento (base 8pt) — mobile

Disponíveis no mobile: `2 · 4 · 8 · 12 · 16 · 24`. **`32` e `40` são desktop-only** — não usar.

| Contexto | Padding | Gap |
|---|---|---|
Chip/badge | 4v / 8h | — |
Botão mobile | 12v / 16h (24h se só rótulo) | 8 |
Input mobile | 12v / 16h | — |
Card | 16 | 12 entre linhas |
Sheet | 16 | 16 entre seções |
Header de tela | 12v / 16h | 12 |
Lista | 16 nas laterais | 12 entre cards |

### Raio — mobile

| Token | Onde |
|---|---|
`4` | badge, tag, item de agenda, célula de heatmap, chip de dia |
`12` | **botão mobile**, chip de segmento, card de KPI compacto |
`16` | **input mobile**, card de lead, card de tarefa, topo do bottom sheet, tela de sheet |
`pill 9999` | avatar, FAB, dot, badge de contagem, chip de filtro |

**Regra do kit**: input mobile é raio 16 (não 8 como no desktop); botão mobile é raio 12. Não unificar.

### Sombras

`shadow/01` `0 1px 2px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` — card de lead, card de tarefa, item de agenda
`shadow/03` `0 4px 8px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` — botão flutuante sobre mapa, pin
`shadow/04` — bottom sheet: `0 -4px 16px rgba(0,0,0,.14)` (para cima)
FAB: `0 8px 16px rgba(200,19,27,.32)` — sombra tingida da marca, o único caso

### Alvo de toque

**48px mínimo** em tudo que se toca (`components.md`, tabela de Button — "min 48px touch target"). `useLayout.ts` já devolve `alvo: 48` abaixo de 1024px; **manter**. Não usar 32px nem 40px no mobile: são tamanhos desktop.

O `minHeight: 48` que hoje existe em `styles.navItem` está correto e deve continuar.

### Foco

`outline: 2px solid #016999; outline-offset: 2px`.

---

## Navegação

### Bottom nav: 4 abas + FAB central

Substitui a barra de até sete abas.

- Container: fundo `--surface`, borda superior 1px `--border`, `padding-bottom` = área segura (o `navPaddingBottom` atual). `position: relative` — o FAB é filho absoluto
- Quatro abas em `display:flex`, cada uma `flex:1`, `min-height:56px`, `padding:8px 0`, coluna centralizada, gap 2. **Um vão de 72px (`flex:0 0 72px`) no meio** reserva o espaço do FAB
- Ícone 24px, rótulo 11/16/0.5. Ativa: peso 700 + `#C8131B` (ícone e rótulo). Inativa: peso 500 + `--text-faint`
  - **Sem pill de fundo na aba ativa.** A `navItemActive` atual (fundo `--tint-red`, raio 12, margem 4) sai: com quatro abas a cor do ícone e o peso do rótulo já resolvem, e a pill brigava visualmente com o FAB
- Badge de contagem: `min-width:18px; height:18px; padding:0 5px`, raio 9, fundo `#C8131B`, texto branco 11/18 peso 700, borda 1.5px `--surface`
  - **Ancorado no ÍCONE, não no botão.** Envolver só o ícone num container `position:relative` e posicionar o badge em `top:-6px; right:-12px`, pendurado no canto superior direito do ícone — é exatamente o que o `App.tsx` já faz (o `<View>` em volta do `<NavIcon>` + `styles.navBadge`). Ancorado no botão, que tem ~73px de largura, o `right` resolve para o centro e o badge cobre o ícone inteiro; e piora conforme o número cresce ("99+")
- **FAB**: 60×60, pill, `position:absolute; left:50%; top:-24px; transform:translateX(-50%)`, fundo `#C8131B`, borda 4px `--surface` (recorta o FAB da barra), ícone `add` 32px branco, `0 8px 16px rgba(200,19,27,.32)`. Abre o cadastro de lead
  - **Todo conteúdo que encosta no rodapé nas quatro telas com barra precisa reservar os 24px que o FAB protrai.** Em prática: `padding-bottom: 40px` (16 + 24) no peek sheet do mapa e nos scrolls de Lista, Rota, Agenda e Tarefas — senão o círculo vermelho cai sobre o CTA do último card. Telas sem barra (Gestor, Meu desempenho, Login) e os sheets, que têm rodapé fixo próprio, seguem com 16px
  - Substitui o FAB de 56px que flutuava sobre o canto inferior direito do mapa (`styles.fab`) e cobria conteúdo

**As quatro abas**: **Mapa · Rota · [FAB] · Agenda · Tarefas**

O que aconteceu com as outras três:
- **Lista** virou alternância dentro do Mapa (segmented Mapa/Lista no header) — é a mesma base de dados, não outro destino
- **Gestor** e **Meu desempenho** foram para o **menu do perfil** (avatar no header) — são consulta, não trabalho de campo; não competem por espaço na barra

Recorte por papel: `role === 'view'` fica só com Mapa (Rota/Agenda/Tarefas e o FAB escondidos); Gestor aparece no menu do perfil só para `role === 'gestor'`. Mesma lógica de `isViewer` / `canViewGestor` já em `App.tsx`.

### Header de tela

Fundo `#C8131B` no claro, `--surface` no escuro (**o vermelho chapado no topo cansa no modo noturno e briga com a superfície escura**). `padding:12px 16px`. Não é sticky separado: faz parte da coluna da tela.

Composição varia por tela, mas o avatar de 48px pill (`rgba(255,255,255,.18)`, iniciais 14/20/0.1 peso 700 branco) fica **sempre** no canto superior direito e abre o menu do perfil. Some a engrenagem e o botão "Sair" — os dois foram para dentro do menu.

---

## Screens / Views

### 1. Mapa / Lista

**Propósito**: encontrar o próximo lead e sair para a visita.

**Header** (fundo do tema, `padding:12px 16px 8px`, coluna gap 12):
1. Linha de busca + avatar: campo `flex:1`, altura **48**, `padding:0 16px`, raio **16**, fundo `rgba(255,255,255,.18)`, ícone `search` 20px branco, placeholder 16/24/0.5 `rgba(255,255,255,.7)`. Avatar 48px pill ao lado
2. **Segmented Mapa / Lista**: dois botões `flex:1`, altura 40, raio 12 nas pontas (`12px 0 0 12px` / `0 12px 12px 0`), ícone 20px + rótulo 14/20/0.1 peso 600, centralizado. Ativo: fundo `#fff`, texto `#C8131B` (no dark `#1E1E1E`). Inativo: fundo `rgba(255,255,255,.18)`, texto branco

**Chips de temperatura** — faixa `padding:12px 16px`, fundo `--surface`, borda inferior 1px `--border`, `overflow-x:auto`, gap 8. Chip: altura **36**, `padding:0 14px`, raio pill, borda 1px, dot 8px + rótulo 12/16/0.5 peso 600, `flex:0 0 auto`, `white-space:nowrap`. Ativo: fundo `--tint-red`, borda `#C8131B`, texto `--tint-red-text`. Inativo: fundo `--surface`, borda `--stroke-default`, `--text-muted`.
Seis chips: Todos · Quente · Morno · Frio · Conta Alvo (+ Fechado/Perdido conforme filtro).

**Vista Mapa** (`flex:1`, `<MapView>` real):
- Clustering e `animationEnabled={false}` mantidos como estão
- Pin: 40×40 pill da cor da temperatura, borda 2.5px branca, `shadow/03`, logo branco 20px (`assets/pin-logo.png`); seta CSS `border-left/right:7px transparent; border-top:9px {cor}`, `margin-top:-1px`
- Botão de recentrar: **48×48**, raio 16, `left:16px; top:16px`, fundo `--surface`, `shadow/03`, ícone 24px — cheio + `#C8131B` quando seguindo o vendedor, vazado + `--text-muted` quando a câmera está livre. **Foi para o topo**: no rodapé disputava espaço com a barra e o FAB
- **Sem legenda sobre o mapa.** A legenda de duas colunas (`tempLegend`, linhas de 104px) sai — os chips no topo já ensinam as cores, e o mapa recupera um quarto da altura
- **Peek sheet do lead mais próximo**, ancorado no rodapé do mapa: `padding:16px 16px 40px`, raio `16px 16px 0 0`, fundo `--surface`, `0 -4px 16px rgba(0,0,0,.14)`. Handle 36×4 raio 2 centralizado, `margin-bottom:12px`. Linha: barra de temperatura 4px `align-self:stretch` `min-height:44px` + nome 16/24/0.15 peso 600 + sublinha `{etapa} · {dist} · {n}ª visita` 12/16/0.4 `--text-faint` + badge de temperatura à direita
  - Ações gap 8: **"Check-in"** (`flex:1`, altura 48, raio 12, fundo `#27A84C`, texto 16/24/0.15 peso 600 branco, ícone `where_to_vote` 24px) · `navigation` 48×48 outline · `call` 48×48 outline
  - Arrastar para cima abre a ficha completa
  - **⚠ O `padding-bottom` de 40px não é decorativo**: são os 16px de padding + os **24px que o FAB central invade acima da barra**. O peek sheet encosta na borda superior da barra e o FAB protrai 24px sobre ela — sem a reserva, o círculo vermelho cai em cima do botão "Check-in". Qualquer elemento ancorado no rodapé de uma tela com bottom nav precisa dessa folga na faixa central

**Vista Lista** (`flex:1; overflow-y:auto; padding:16px`, coluna gap 12):
- Card: `padding:16px`, raio **16**, fundo `--surface`, borda 1px `--border`, **borda esquerda 4px da cor da temperatura**, `shadow/01`
- Nome 16/24/0.15 peso 600 truncado; sublinha `{etapa} · {cidade}` 12/16/0.4 `--text-faint`; badge de temperatura no canto
- Metadados `margin-top:12px` gap 16: `near_me` + distância, `where_to_vote` + última visita (ícones 16px, texto 12/16/0.5 peso 600 `--text-faint`)
- O card atual (`styles.clientCard`) já é raio 16 / padding 16 / borda esquerda 4px — **a estrutura está certa**; o que muda é o conteúdo: sai "Contato:", "Etapa:", cidade e telefone em quatro linhas soltas; entra a linha de metadados com distância e recência, que é o que decide a próxima visita

### 2. Rota

**Header** (`padding:12px 16px`): kicker "ROTA DE HOJE" (11/16, `.12em`, 800, `rgba(255,255,255,.75)`, uppercase) + data 18/24 peso 600; avatar à direita. Abaixo, três KPIs em linha gap 12: `padding:8px 12px`, raio 12, fundo `rgba(255,255,255,.14)`, valor 16/24 peso 700 tabular-nums, rótulo 11/16/0.5 peso 600 `rgba(255,255,255,.75)` — **paradas · distância · em rota**.

**Mapa** — faixa de **180px** (`flex:0 0 180px`), não tela cheia: em rota o objeto de trabalho é a sequência, o mapa é orientação. Polyline `#C8131B` largura 4, `round`. Marcador da parada atual 30×30 pill borda 3px branca com o número 12/700 branco.

**Lista de paradas** (`flex:1; overflow-y:auto; padding:16px`, gap 12):
- Card `padding:16px`, raio 16, fundo `--surface`, borda 1px — **`#C8131B` na parada atual**, `--border` nas outras. `shadow/01`
- Índice 32px pill 14/32/0.1 peso 700: concluída `#EAF7EE`/`#167532`, atual `#C8131B`/branco, pendente `--surface-2`/`--text-muted`
- Nome 16/24/0.15 peso 600 truncado + tag (`padding:2px 6px`, raio 4, 11/16/0.5 peso 600): **Visitado** `#EAF7EE`/`#167532` · **Agora** `--tint-red`/`#94090F` · **SLA** `#FFF8EB`/`#99670F` · **Demo**/**Alvo** `#F1EBFE`/`#5B32C4`
- Detalhe 12/16/0.4 `--text-faint`: horário, cidade, motivo
- **Só a parada atual expõe ações**: "Check-in" (`flex:1`, altura 48, `#27A84C`) + `navigation` 48×48 outline. As outras ficam limpas — reduz toque errado com o polegar em movimento

### 3. Agenda

**Header**: título "Agenda" 18/24 peso 600 + avatar. Abaixo, **tira da semana**: sete botões `flex:1`, `min-height:48px`, raio 12, coluna centralizada gap 2 — dia (11/16/0.5 peso 600, opacidade .8), número (14/20/0.1 peso 700 tabular-nums), dot 4px indicando se há compromisso. Hoje: fundo `#fff`, texto `#C8131B` (dark `#1E1E1E`), dot `#C8131B`. Outros: fundo `rgba(255,255,255,.14)`, texto branco, dot `rgba(255,255,255,.6)`.

> O calendário de 7 colunas do desktop não cabe em 390px. A tira dá a visão da semana; o corpo mostra **um dia**.

**Corpo** (`flex:1; overflow-y:auto; padding:16px`, gap 16) — timeline de duas colunas:
- Coluna de hora: 52px fixos (`flex:0 0 52px`), hora 14/20/0.1 peso 700 `--text` tabular-nums sobre duração 11/16/0.5 `--text-faint`
- Card: `flex:1`, `padding:16px`, raio 16, fundo `--surface`, borda 1px `--border`, **borda esquerda 4px da cor do tipo**, `shadow/01`. Ícone 20px da cor do tipo + título 16/24/0.15 peso 600; sublinha 12/16/0.4 `--text-faint`
- Tipos: **Rota `#C8131B`** (`directions_car`) · **Demo `#7c3aed`** (`event`) · **Follow-up `#01AFFF`** (`phone_in_talk`)
- Compromissos agendáveis mostram "Reagendar" (altura 48, raio 12, fundo `--tint-red`, texto `--tint-red-text`) e "Cancelar" (altura 48 outline)

### 4. Tarefas

**Header**: título "Tarefas" 18/24 peso 600 + sublinha "`{n}` atrasadas · `{n}` para hoje" 12/16/0.4 `rgba(255,255,255,.8)`; avatar à direita.

**Abas de estado** — faixa `padding:12px 16px`, fundo `--surface`, borda inferior 1px `--border`, gap 8. Três botões `flex:1`, altura 40, raio 12 nas pontas, 12/16/0.5 peso 600. Ativo `#C8131B`/branco; inativo `--surface-2`/`--text-muted`. **Atrasadas · Hoje · Próximas**, cada uma com a contagem no rótulo.

> O kanban de três colunas do desktop não funciona em 390px: rolagem horizontal em app de campo é toque errado garantido. As colunas viram abas.

**Card** (`padding:16px`, raio 16, fundo `--surface`, borda 1px `--border`, **borda esquerda 4px na cor do SLA**, `shadow/01`):
- Lead 16/24/0.15 peso 600 + badge de SLA (`padding:4px 8px`, raio 4, 11/16/0.5 peso 600): **D5** `#FAE8E9`/`#94090F` · **D2** `#FFF8EB`/`#99670F` · **—** `--surface-2`/`--text-faint`
- **A cor do badge e a da régua esquerda não são a mesma variável.** O badge tem fundo tonal claro nos dois temas, então o texto fica em `#94090F`/`#99670F` sempre. A régua fica sobre a superfície do tema: no escuro precisa do par claro — `#E5A1A4` (D5) e `#FFD894` (D2), senão vira vinho sobre quase-preto e desaparece
- Tarefa 14/20/0.25 `--text-muted`, `margin-top:6px`
- Prazo `margin-top:8px`: `schedule` 16px + texto 12/16/0.5 peso 600 — **vencido usa `--tint-red-text`** (`#94090F` claro / `#E5A1A4` escuro), no prazo usa `--text-faint`
- Ações `margin-top:16px` gap 8: "Agendar" (`flex:1`, altura 48, raio 12, `#C8131B`, 16/24/0.15 peso 600 branco) + concluir 48×48 raio 12 outline, ícone `check` 24px
- Conclusão é **toggle otimista**: pinta na hora, persiste em seguida, reverte se falhar

### 5. Painel do gestor (mobile)

Alcançado pelo menu do perfil. **Header com `arrow_back`** (48×48, raio 12, `rgba(255,255,255,.18)`) + título 18/24 peso 600 e sublinha 12/16/0.4 — não tem aba, então precisa de volta explícita.

**Corpo** (`padding:16px`, coluna gap 16):
1. **KPIs 2×2** — `grid-template-columns:1fr 1fr` gap 12. Card `padding:16px`, raio 16, borda 1px `--border`, `shadow/01`: rótulo 12/16/0.5 peso 600 `--text-faint`, valor 18/24 peso 700 `--text` tabular-nums, delta 11/16/0.5 peso 600 na cor do sinal
2. **Funil** — card `padding:16px` raio 16. Uma barra por etapa: rótulo 12/16/0.5 peso 600 + contagem à direita `--text-faint` tabular-nums; barra **18px** de altura (não 22 como no desktop), raio 4, trilha `--surface-3`, preenchimento na cor da etapa
3. **Time** — card raio 16. Linha `padding:10px 0`, borda inferior 1px `--border`: avatar 32px pill iniciais, nome 14/20/0.1 peso 600 truncado sobre "`{n}` visitas · `{n}` fechados" 11/16/0.5 `--text-faint`, badge de meta à direita (`#EAF7EE`/`#167532` no alvo, `#FFF8EB`/`#99670F` abaixo)

A tabela de 7 colunas do desktop não cabe: no mobile cada vendedor é uma linha de duas alturas com as duas métricas que importam e a meta.

### 6. Meu desempenho (mobile)

Header com `arrow_back` + título 18/24 peso 600.

1. **Banner de meta** — `padding:16px`, raio 16, fundo `#C8131B`. Kicker "META DE AGOSTO" (11/16, `.12em`, 800, `rgba(255,255,255,.75)`); título 18/24 peso 700; **barra de progresso** altura 8 raio 4, trilha `rgba(255,255,255,.25)`, preenchimento branco, `margin-top:12px`; sublinha 12/16/0.4 `rgba(255,255,255,.85)`. Único bloco vermelho chapado da superfície além do header
2. **KPIs 2×2** — mesma anatomia do Gestor
3. **Heatmap da semana** — card raio 16: grade `repeat(7,1fr)` gap 4, células `aspect-ratio:1` raio 4 — `--surface-3` vazio, `#8FE0D5` 1–2, `#1D9688` 3+, **hoje vazio = tracejado 1.5px `#C8131B`**. Células fluidas em vez dos 28px fixos do desktop

### 7. Login

**Sem bottom nav.**

- **Topo** (fundo `#C8131B`, `padding:40px 24px 24px`, coluna alinhada à esquerda gap 16): logo branco altura 28 (`assets/takeat-logo-white.svg`); kicker "FIELD SALES OUTBOUND" (11/16, `.12em`, 800, `rgba(255,255,255,.7)`) + "Entrar na conta" 22/28 peso 700 branco
- **Formulário** — `flex:1`, fundo `--bg`, **raio `24px 24px 0 0`** (a folha subindo sobre o vermelho), `padding:24px`, coluna gap 16. Campo: rótulo 14/20/0.1 peso 600 `--text-muted` `margin-bottom:8px`; caixa altura **48**, `padding:0 16px`, raio **16**, borda 1px `--stroke-strong`, fundo `--surface`, ícone 20px (`mail`/`lock`), texto 16/24/0.5. Senha tem `visibility` à direita
- Botão "Entrar" altura 48, raio 12, `#C8131B`, 16/24/0.15 peso 600, largura total. Link "Esqueci minha senha" 14/20/0.1 peso 600 `#018CCC` centralizado. Rodapé "Contas são criadas pelo administrador" 12/16/0.4 `--text-faint` centralizado
- Erro: texto 12/16/0.4 `--tint-red-text` acima do botão; borda do campo inválido `#C8131B`

O login atual (`src/screens/LoginScreen.tsx`) já é vertical com card sobre vermelho — a mudança é modesta: título 32→22 (Heading não existe no mobile), inputs 48px raio 16, e o card virar folha de raio 24 colada no rodapé.

### 8. Ficha do lead (bottom sheet)

**Um único padrão de painel no sistema.** Não inventar um segundo jeito de abrir painel.

- Overlay `rgba(0,0,0,.4)`; folha ancorada no rodapé, `max-height:92%`, raio `16px 16px 0 0`, fundo `--surface`
- Fecha no **X**, no **overlay**, no **arraste para baixo** e no botão de voltar do sistema. `role="dialog"`, `aria-modal="true"`, `aria-label`
- **Topo** (`padding:12px 16px 16px`, borda inferior 1px `--border`): handle 36×4 raio 2 centralizado `margin-bottom:16px`. Dot 8px da temperatura + kicker "`{TEMPERATURA}` · `{n}`ª VISITA" (11/16/0.5, 600, `--text-faint`, uppercase); nome 18/24 peso 600; sublinha contato · telefone 12/16/0.4. X em 48×48 raio 12 fundo `--surface-2`
- **Corpo** (`flex:1; overflow-y:auto; padding:16px`, gap 16):
  - **Duas ações em grade** `1fr 1fr` gap 8: "Etapa" (altura 48, raio 12, `#C8131B`, ícone `trending_up`) e "Agendar" (altura 48 outline `#C8131B`, ícone `event`). Rótulos curtos — em 390px "Mudar etapa" quebraria
  - **Uso do produto** — `padding:16px`, raio 16, fundo `--surface-2`: cabeçalho 12/16/0.5 peso 700 uppercase; dot de semáforo 10px + texto 14/20/0.25. **Semáforo**: verde ≤ 7 dias, âmbar 8–30, vermelho > 30 ou nenhuma. Só aparece para quem o `hubspot-usage-sync` alcança
  - **Dados** — pares chave/valor `padding:12px 0`, borda inferior 1px `--border`: chave 12/16/0.5 peso 600 `--text-faint` à esquerda (`flex:0 0 auto`), valor 14/20/0.25 `--text` à direita.
    Ordem: **Contato · Telefone** · Etapa · Plano · Endereço · Origem · Responsável · **ID HubSpot** (`tabular-nums`). **Sem MRR** — o campo saiu por decisão do time.
    Fecha com uma **linha de link** de 48px: ícone `open_in_new` 24px + "Abrir no HubSpot" 16/24/0.15 peso 600 `--info-text` — é o caminho para o registro completo e permanece no painel
  - **Timeline** — ícone em pill 32px com tint do tipo + título 14/20/0.1 peso 600 sobre quando 12/16/0.4
- **Rodapé fixo** (`padding:16px`, borda superior 1px `--border`): "Marcar visita (GPS)" — altura 48, raio 12, `#27A84C`, largura total, ícone `where_to_vote`. Vira "Re-marcar visita" quando já houve check-in. Validação de 200m e Task concluída no HubSpot: comportamento atual, inalterado

### 9. Mudança de etapa (sheet de tela cheia)

Formulário longo com campos obrigatórios: **tela cheia**, não folha parcial — folha parcial com teclado aberto sobra ~200px úteis.

- Overlay opaco `--bg`, coluna cheia
- **Header** (`padding:12px 16px`, fundo do tema): `arrow_back` 48×48 raio 12 `rgba(255,255,255,.18)` + título "Mudar etapa" 18/24 peso 600 e sublinha "`{lead}` · hoje em `{etapa}`" 12/16/0.4
- **Corpo** (`flex:1; overflow-y:auto; padding:16px`, gap 16):
  - Opções em coluna gap 8: `min-height:56px`, `padding:0 16px`, raio **16**, borda 1px. Radio **24×24** (borda 2px, dot 12px). Rótulo 16/24/0.15 peso 600 `flex:1`. Dot da cor da etapa 10px à direita
    - selecionada: fundo `--tint-red`, borda `#C8131B`, radio e dot `#C8131B`, texto `--tint-red-text`
    - não selecionada: fundo `--surface`, borda `--border`, radio `--stroke-strong`, dot transparente, texto `--text-muted`
    - Destinos de `APP_STAGE_IDS` filtrado pela regra de avanço: pulo livre até Demo/Proposta (`FREE_ADVANCE_MAX_STAGE_ID`), 1 por vez daí em diante; Perdido sempre disponível
  - **Campos obrigatórios** — bloco `padding:16px`, raio 16, fundo `--surface`, **borda esquerda 4px `#CC8C1D`**. Cabeçalho "OBRIGATÓRIO EM `{ETAPA}`" 12/16/0.5 peso 700 uppercase. Campos em **coluna única** gap 16: rótulo 14/20/0.1 peso 600, caixa altura 48 raio 16 borda 1px `--stroke-strong`, placeholder 16/24/0.5 `--text-disabled`, `expand_more` 24px nos selects
    - Campos e máscaras (`cep`, `cnpj`, `currency`, `date`, `boolean`, `select` multi) de `STAGE_FIELDS_BY_ID` — **sem mudança de lógica**
- **Rodapé fixo** (`padding:16px 16px 32px`, borda superior 1px `--border`, fundo `--surface`): "Confirmar mudança" altura 48 raio 12 `#C8131B` largura total. O `padding-bottom` extra é a área segura
- `KeyboardAvoidingView` (já existe em `src/components/`) obrigatório: o rodapé sobe com o teclado

### 10. Agendar (sheet de tela cheia)

Mesma casca do sheet de etapa. Header "Agendar" + `{lead}`.

**Corpo**, coluna única gap 16:
1. Segmented **Demo / Follow up**: dois botões `flex:1`, altura 48, raio 12 nas pontas, 16/24/0.15 peso 600. Ativo `#C8131B`/branco
2. **Calendar do kit** — card borda 1px `--border`, raio 12, fundo `--surface`:
   - Cabeçalho `padding:12px 16px`, borda inferior 1px `--border`: setas 40×40 + "Agosto 2026" **Poppins Bold 16 `#C8131B`**
   - Dias da semana Poppins Bold 14 — domingo `--text-faint`, resto `--text-muted`
   - Células: Poppins Medium 14, **altura 40** (48 no toque via padding do grid), tabular-nums. Fora do mês `--text-disabled`. **Selecionada: círculo raio 50% fundo `#C8131B` texto branco**
3. **Horário** — rótulo 14/20/0.1 peso 600; chips altura **48**, `padding:0 20px`, raio 12, borda 1px, 16/24/0.15 peso 600 tabular-nums, `flex-wrap`. Selecionado: fundo `--tint-red`, borda `#C8131B`, texto `--tint-red-text`
4. **Observações** — textarea altura **140** (o default mobile do kit), `padding:12px 16px`, raio 16, borda 1px `--stroke-strong`

**Rodapé fixo**: "Agendar demo · `{data}`, `{hora}`" — altura 48, raio 12, `#C8131B`, largura total. O CTA repete a escolha: confirmação sem voltar a conferir.

### 11. Cadastro de lead + CEP (sheet de tela cheia)

Aberto pelo FAB.

- **Header**: `close` 48×48 raio 12 + "Novo lead" 18/24 peso 600. Abaixo, **barra de progresso de 3 segmentos** (`flex:1` cada, altura 4, raio 2 — `#fff` concluído, `rgba(255,255,255,.3)` pendente) e a linha "Passo 1 de 3 · CEP e endereço" 11/16/0.5 peso 600 `rgba(255,255,255,.8)`
  - No mobile o stepper é **progresso real**, não decoração: os três passos são telas em sequência (`src/screens/CEPStep.tsx` já implementa essa navegação — manter)
- **Corpo** coluna única gap 16, campos altura 48 raio 16: `CEP` (ícone `search`, info "Busca endereço e coordenada automaticamente") · `Número` · `Restaurante` · `Telefone`
- **Mapa de ajuste do pin** — altura 200, raio 16, borda 1px `--border`. Pin fixo no **centro do mapa**, não da tela (o `mapLayout` atual já calcula; manter). Caixa de status `left:12px; right:12px; bottom:12px`, `padding:8px 12px`, raio 12, fundo `--surface`, `shadow/01`: "Arraste o mapa para ajustar o pin" 12/16/0.5 peso 600 + coordenada tabular-nums 11/16/0.5 `--text-faint`
- **Rodapé fixo**: "Continuar" altura 48 raio 12 `#C8131B` largura total

### 12. Menu do perfil (bottom sheet)

Aberto pelo avatar. Overlay `rgba(0,0,0,.4)`, folha raio `16px 16px 0 0`, `padding:12px 16px 32px`.

- Handle 36×4 centralizado
- **Identidade**: avatar 48px pill `--tint-red`/`--tint-red-text` iniciais 16/48/0.15 peso 700; nome 16/24/0.15 peso 600 `--text` sobre "`{papel}` · `{email}`" 12/16/0.4 `--text-faint`. `padding-bottom:16px`, borda inferior 1px `--border`
- **Itens**: `min-height:56px`, borda inferior 1px `--border`, ícone 24px + rótulo 16/24/0.15 peso 500 + `chevron_right` 24px `--text-disabled`
  - **Painel do gestor** (só `role === 'gestor'`) · **Meu desempenho** · **Exportar dados** · **Tema e preferências** · **Sair** (ícone e rótulo em `#C8131B`)
- É aqui que vivem a engrenagem e o "Sair" que saíram do header, e o seletor de tema (Automático / Claro / Escuro — o `ThemePref` de `src/theme.ts`, inalterado)

### 13. Configurações (sheet de tela cheia)

**Hoje isso não é uma tela.** É o modal aberto pela engrenagem do header (`isPasswordModalOpen`, `styles.passwordModalCard`), que empilha atalho para o painel de gestão, seletor de tema, troca de senha e o gatilho de forçar atualização. No mobile a engrenagem sai do header — e com ela o "Sair" — e isso vira um sheet de tela cheia alcançado pelo **Menu do perfil**.

Header `padding:12px 16px` no fundo do tema: `arrow_back` 48×48 raio 12 `rgba(255,255,255,.18)` + "Configurações" 18/24 peso 600. **O `arrow_back` volta para o menu do perfil**, não para a tela anterior.

Corpo `flex:1; overflow-y:auto; padding:16px 16px 32px`, coluna gap 24. Cada seção tem cabeçalho fora do card (12/16/0.5 peso 700 `--text-muted`, uppercase, `margin-bottom:12px`) e card raio **16** com borda 1px `--border`.

**1 · CONTA** — linhas **empilhadas**, não em duas colunas: `padding:12px 16px`, borda inferior 1px `--border`, `flex-direction:column; gap:2px` — chave 12/16/0.5 peso 600 `--text-faint` acima, valor 16/24/0.5 `--text` abaixo. Em 390px o padrão de duas colunas do desktop quebrava "Rafael Pereira" em duas linhas. Nome · E-mail · Papel · ID HubSpot, fechando com a nota 12/16/0.4: *"Nome, e-mail e papel são definidos pelo administrador."*

**2 · APARÊNCIA** — card `padding:16px`. "Tema" 14/20/0.1 peso 600 `--text-muted`; explicação 12/16/0.4 `--text-faint`: *"Automático segue o aparelho. A escolha manual vale também no mapa."* Segmented **Automático · Claro · Escuro**: altura **48**, raio 12 só nas pontas, 14/20/0.1 peso 600, selecionado `#C8131B`/branco, os outros com borda 1px `--stroke-default`.

> O estado é o `ThemePref` de `src/theme.ts` (`'system' | 'light' | 'dark'`), que é **de módulo, não de componente**. O mapa lê o tema em JavaScript (o estilo vem do Google, não do CSS); se ele não re-renderizar, a interface fica clara e o mapa escuro. Esse bug já existiu no app.

**3 · SENHA** — card `padding:16px`. Hint com a copy atual — *"Digite uma nova senha. Mínimo de 6 caracteres."* Dois campos em **coluna** gap 16: rótulo 14/20/0.1 peso 600, caixa altura **48**, raio **16**, borda 1px `--stroke-strong`, texto 16/24/0.5. CTA "Salvar nova senha" altura 48, raio 12, `#C8131B`, largura total. Chama o `updatePassword` do `AuthContext` — inalterado.

**4 · ÁREA DO GESTOR** (só `role === 'gestor'`) — dois cards-link em coluna gap 12, `padding:16px`, raio 16, `display:flex; align-items:center; gap:12px`: ícone em quadrado 40×40 raio 12, título 16/24/0.15 peso 600 sobre descrição 12/16/0.4 `--text-faint`, e `open_in_new` ou `chevron_right` 24px `--text-faint` à direita.

- **"Painel de gestão"** — quadrado `--tint-red`/`--tint-red-text`, ícone `bar_chart`. *"Melhor no computador. Abre em nova aba."* Continua sendo um `<a href>` **de verdade** para `/gestao`, não `window.open` — o comentário no código atual explica o motivo.
- **"Vendedores e usuários"** — quadrado `--surface-2`/`--text-muted`, ícone `group`. *"Criar conta e definir papel."* Edge `criar-usuario`.

**5 · SOBRE** — card com linhas de leitura em duas colunas (aqui cabe: os valores são curtos): versão do app, build do service worker, sync de uso, com `tabular-nums`. Abaixo, `padding:16px` com **"Sair da conta"** altura 48, raio 12, outline `#C8131B`, ícone `logout`, largura total.

**Administração** — se o gatilho de forçar atualização (`app_force_reload.triggered_at`) existe hoje no modal, entra como uma sexta seção com card de **borda esquerda 4px `#CC8C1D`**. Não descarte.

**O que sai do header**: o botão de engrenagem 44×44 (`styles.headerIconButton`) e o `logoutButton`. O header de tela fica com o que a tela precisa e o avatar de 48px, que abre o menu do perfil.

---

## Interactions & Behavior

### Navegação
- Aba troca `tab` — a mesma máquina de estado (`const [tab, setTab] = useState<AppTab>('map')`)
- Segmented Mapa/Lista é estado local da tela do mapa, **não** uma aba
- Botão físico de voltar do Android e o gesto de voltar do iOS fecham sheet/overlay antes de sair do app
- Sheets de tela cheia empilham no máximo **um nível** sobre a ficha (ficha → etapa, ficha → agendar). Voltar de um sheet reabre a ficha

### Transições
- Bottom sheet: slide de baixo 220ms ease-out + fade do overlay
- Sheet de tela cheia: slide da direita 220ms ease-out
- Chips, abas, cards: `.14s`–`.16s` `cubic-bezier(.2,.7,.3,1)`
- FAB no toque: `scale(.94)` 120ms
- Nada de animação no arraste do mapa: o gesto é da Google

### Gestos
- Peek sheet do mapa: arrasta para cima → ficha completa; para baixo → colapsa
- Bottom sheets fecham no arraste para baixo com velocidade mínima
- Lista de leads e de tarefas: `keyboardDismissMode="on-drag"` (já é o comportamento atual)
- **Sem swipe destrutivo** em card de lead ou tarefa: excluir e concluir são ações explícitas. Na rua, swipe acidental é regra

### Estados de carregamento
- Lista: skeleton com fundo `--surface-3` raio 4 nas dimensões do card real
- Busca: spinner ao lado do ícone — **a busca varre a base inteira no servidor**, não só a área carregada; sem indicador o vendedor conclui que o lead não existe
- Mapa: pill de status no topo ("Aproxime para carregar os clientes desta região" / "Carregando esta região…"), `pointerEvents:none`. Comportamento atual, mantido
- Botão: spinner mantendo o fill de Rest (regra do kit)

### Estados vazios
Ícone 40px `--text-faint`, `margin-bottom:12px`, mensagem 14/20/0.25 `--text-muted` centralizada. Copy atual mantida: "Nenhum cliente encontrado com esses filtros." / "Nenhum `{status}` encontrado".

### Offline
O app é PWA de campo com 3G ruim. Ação que exige rede (check-in, mudança de etapa, agendamento) mostra o estado otimista e, ao falhar, reverte com aviso — não uma tela de erro. O `useForceReload` e o service worker continuam como estão.

### Responsive behavior

Este pacote cobre `< 768px`. Os degraus completos em `src/hooks/useLayout.ts`:

| Faixa | Superfície |
|---|---|
< 768 | **este design** — bottom nav de 4 abas + FAB, coluna única |
768 – 1023 | tablet: mesmo design em duas colunas na lista (`colunas: 2`), alvo continua **48px** (o kit agrupa Tablet com Mobile) |
≥ 1024 | desktop web — pacote `design_handoff_desktop_web/` |

`alvo: ehDesktop ? 40 : 48` está correto e continua.

## State Management

Nenhum estado de dados novo. Estado de UI:

| Variável | Tipo | Gatilho |
|---|---|---|
`tab` | `AppTab` | aba da barra inferior (já existe) |
`vistaMapa` | `'mapa' \| 'lista'` | segmented no header do Mapa (**novo** — hoje são duas abas) |
`selectedClient` | `Client \| null` | peek sheet, card da lista, pin (já existe) |
`sheetExpandido` | `boolean` | arraste do peek sheet (**novo**) |
`perfilAberto` | `boolean` | avatar do header (**novo**) |
`tabTarefa` | `'atrasadas' \| 'hoje' \| 'proximas'` | abas de Tarefas (**novo**) |
`diaSelecionado` | `Date` | tira da semana da Agenda (**novo**) |
`changingStageFor` / `schedulingFor` / `showCepStep` | já existem | — |
`statusFilter` / `tempFilter` / `searchQuery` | já existem | chips, busca |
`heatOn` | já existe | — (o toggle de calor vive no desktop; no mobile fica em Preferências) |

Dados: `useClients`, `useMeetings`, `useClientTasks`, `useFieldOps`, `useGestorMetrics`, `useVisitsHeatmap`, `useRouteHistory`, `useSellerGoals`, `useMinhaDaily` — inalterados. Carregamento por área visível (`renderBounds`, `mapRegion`, `showOnlyMyArea`) mantido.

## Assets

| Asset | Origem | Uso |
|---|---|---|
`takeat-icon-white.svg` | `takeat-design/UIKIT@main:assets/` | referência do logo no pin |
`takeat-logo-white.svg` | idem | logo no topo do login |
`takeat-icon.svg` | idem | marca em fundo claro |
`assets/pin-logo.png` | já no repo | **logo do pin em produção — usar este** |

**Ícones**: os protótipos usam Material Symbols Rounded porque `components.md` referencia nomes Material. **Em produção usar os oficiais** de `src/components/icons.tsx`:

| Protótipo | Produção |
|---|---|
`location_on` / `my_location` / `where_to_vote` | `IconLocation` / `IconLocationFilled` |
`format_list_bulleted` | `IconSquareMenu` |
`directions_car` | `IconCar` |
`calendar_month` / `event` | `IconCalendar` |
`assignment_turned_in` | `IconClipboardCheck` |
`insights` / `trending_up` | `IconTrendingUp` / `IconBarGraph` |
`person` | `IconUser` |
`search` | `IconSearch` |
`add` | `IconPlus` |
`close` | `IconClose` |
`check` | `IconCheck` |
`arrow_back` | `IconArrowBack` |
`chevron_right` | `IconArrowFoward` |
`chevron_left` | `IconArrowBack` |
`mail` / `lock` | `IconMail` / `IconLock` |
`settings` | `IconSettings` |
`schedule` | `IconClock` |
`download` | `IconDownload` |
`call` / `phone_in_talk` | `IconCall` |
`visibility` | `IconEye` |
`edit_note` | `IconPencil` |
`near_me` / `navigation` / `expand_more` / `drag_indicator` / `layers` / `logout` / `notifications` | **não existem em `icons.tsx`** — adicionar do pacote se houver equivalente (`IconArrowDown` para expand, `IconArrowFoward` para navegação) |

Ícones recebem cor por **prop `fill`**, onde `var(--token)` não resolve — usar `useIconColors()`, que já existe e lê o tema em JS. Escala mobile do kit: **24px** em botão e aba; 20px em ícone de input; 16px em metadado inline.

## Acessibilidade

- **Contraste no escuro**: `#94090F` e `#167532` reprovam sobre superfície escura — usar `--tint-red-text` / `--tint-green-text`, que já fazem o par no repo. `#C8131B` como texto no escuro também reprova (2,64:1) — usar `--brand-text` (`#E5A1A4`)
- `#C8131B` sobre `--bg` claro dá ~3:1: serve para ícone, texto grande e chrome, **não para corpo**
- `line-height >= 1.25` em títulos e bolds
- `aria-label` em todo input, select e botão só com ícone — inclusive o FAB ("Adicionar lead", como já está)
- Sheets: `role="dialog"`, `aria-modal="true"`, `aria-label`
- Alvo mínimo **48px** — testado com o polegar, em pé
- Ao trocar de aba, focar o título da view (`tabindex="-1"`), com o outline suprimido só nesse caso

## O que este redesign remove

Para a implementação não recriar por hábito:

- **Barra de até 7 abas** (`styles.bottomNav` com Mapa/Lista/Rota/Agenda/Tarefas/Gestor/Meu). Vira 4 abas + FAB; Lista virou segmented, Gestor e Meu foram para o menu do perfil
- **Pill de fundo na aba ativa** (`navItemActive`: `--tint-red`, raio 12, margem 4). Cor do ícone e peso do rótulo bastam, e a pill brigava com o FAB
- **FAB solto no canto inferior direito** de 56px (`styles.fab`) sobre o mapa. Virou o FAB central da barra, recortado com borda de 4px
- **Legenda de temperatura em duas colunas** sobre o mapa (`tempLegend`, linhas de 104px). Os chips no topo ensinam as cores; o mapa recupera um quarto da altura
- **Header com logo + nome + engrenagem + "Sair"** (`styles.header`). Vira busca + avatar; identidade, tema e logout no menu do perfil
- **Botão de recentrar no rodapé** (`styles.mapButton`, `bottom: baseInferior; left:16`). Foi para o topo esquerdo, fora da zona da barra e do FAB
- **Cidade e telefone como linhas soltas** no card de lead (`clientCity`, `clientPhone`). Viram uma linha de metadados com distância e recência — o que decide a próxima visita
- **Rótulos de nav em 11px com 7 abas dividindo 390px**. Com 4 abas o mesmo 11px respira

## Files

| Arquivo | O que é |
|---|---|
`Field Sales - Mobile PWA.dc.html` | **o design** — 7 telas + 5 sheets, claro e escuro, navegáveis pelos chips no topo |
`Atual - Recriação.dc.html` | recriação fiel do estado atual (mobile e desktop), para comparação |
`support.js` | runtime dos protótipos — **não é código de produção** |
`assets/*.svg` | marcas oficiais do UI Kit |
`screenshots/*.png` | capturas de referência (abaixo) |

Abrir `Field Sales - Mobile PWA.dc.html` primeiro. A fila de chips acima do aparelho navega entre telas e sheets; "Tema e preferências" dentro do Menu do perfil alterna claro/escuro — **conferir as duas versões**.

### Screenshots

Aparelho a 390×844 renderizado a 63% para caber na captura, então o texto aparece menor do que é: **a fonte da verdade é o HTML**. Sheets mais altos que a tela aparecem com o conteúdo cortado no rodapé — eles rolam.

| Arquivo | Tela |
|---|---|
`01-mapa.png` | Mapa — busca, segmented, chips, peek sheet com Check-in, nav + FAB |
`02-lista.png` | Lista — cards com barra de temperatura, distância e recência |
`03-rota.png` | Rota — KPIs no header, faixa de mapa 180px, paradas; só a atual com ações |
`04-agenda.png` | Agenda — tira da semana + timeline do dia |
`05-tarefas.png` | Tarefas — abas Atrasadas/Hoje/Próximas, cards com SLA |
`06-gestor.png` | Painel do gestor — KPIs 2×2 e funil |
`07-meu-desempenho.png` | Meu desempenho — banner de meta com progresso, KPIs 2×2, heatmap |
`08-login.png` | Login — folha de raio 24 sobre o vermelho |
`09-sheet-ficha-do-lead.png` | Ficha do lead — bottom sheet 92%, ações Etapa/Agendar, rodapé de check-in |
`10-sheet-mudanca-de-etapa.png` | Mudança de etapa — tela cheia, radios de 56px, campos obrigatórios |
`11-sheet-agendar.png` | Agendar — segmented, calendar do kit, horários de 48px |
`12-sheet-cadastro-cep.png` | Cadastro + CEP — passo 1 de 3, campos de 48px, ajuste do pin |
`13-dark-menu-do-perfil.png` | Menu do perfil no escuro (sobre o login) |
`17-configuracoes.png` | Configurações — Conta empilhada, Aparência, Senha (as seções seguintes rolam) |
`14-dark-mapa.png` | Mapa no escuro — header vira `--surface` |
`15-dark-tarefas.png` | Tarefas no escuro — prazo vencido em `--tint-red-text`, legível |
`16-dark-meu-desempenho.png` | Meu desempenho no escuro |

## Fontes do design system

- `takeat-design/UIKIT@main` — `foundations.md` (cores semânticas e famílias, tipografia Poppins com a coluna de plataforma, spacing 8pt, grids, radius, sombras) e `components.md` (Buttons — linha Mobile/Tablet 48px, Input — 48px raio 16, Dropdown, Calendar)
- `rpatakeat-coder/PWA-app-outbound@main` — `App.tsx`, `public/index.html`, `public/manifest.json`, `src/theme.ts`, `src/hooks/useLayout.ts`, `src/constants/stages.ts`, `src/components/icons.tsx`, `src/components/KeyboardAvoidingView.tsx`, `src/screens/*`
- `github.md` na raiz do projeto de design tem o mapa completo tela → arquivos do repo
