# Handoff: Field Sales Outbound — Web Desktop

## Overview

O app de campo outbound da Takeat (`rpatakeat-coder/PWA-app-outbound`) roda hoje em Expo/react-native-web e é a **mesma interface de celular esticada** no navegador: header vermelho sem navegação, busca e chips full-bleed, cards de lead em três colunas, FAB flutuante e a barra de abas virada de lado (`LARGURA_LATERAL = 72`, rótulos de 8px). Nenhuma tabela, nenhum painel lateral, nenhuma densidade de desktop.

Este handoff cobre a **superfície desktop web** repensada para a plataforma: navegação em sidebar colapsável, listas em tabela, mapa com painel de trabalho ancorado, kanban, calendário semanal e painel de gestor. O mobile PWA foi redesenhado em paralelo e **não faz parte deste pacote** (arquivo `Field Sales - Mobile PWA.dc.html` no projeto de design).

## About the Design Files

Os arquivos deste bundle são **referências de design feitas em HTML** — protótipos que mostram aparência e comportamento pretendidos, **não código de produção para copiar**. Eles usam um runtime de protótipo (`support.js`) que não é código de produção.

A tarefa é **recriar esses designs no ambiente já existente do codebase**: React 19 + react-native-web sob Expo SDK 54, com `@tanstack/react-query` para dados, os hooks em `src/hooks/`, as telas em `src/screens/` e os tokens CSS de `public/index.html`. Não introduzir framework novo, não trocar o mecanismo de tema, não substituir o Google Maps JS API.

**Nota importante sobre o ambiente**: react-native-web não aceita `@media`, então os cortes de largura já vivem em `src/hooks/useLayout.ts`. Este redesign **muda os degraus desse hook** (ver *Responsive behavior*).

## Onde cada tela vive no código — LEIA ANTES DE COMEÇAR

`App.tsx` tem **8.445 linhas / 383 KB**. Quatro das telas deste redesign não são arquivos: são funções de render dentro dele. Uma passada única no `App.tsx` não alcança todas — **trabalhe tela por tela, na ordem abaixo, e confirme cada uma antes de seguir.**

| # | Tela | Onde está hoje | Âncora |
|---|---|---|---|
| 1 | Casca (sidebar + header) | `App.tsx` | `return (` do componente principal, ~L4246; header ~L4260; nav lateral/inferior ~L4866–4945 |
| 2 | Estilos da casca | `App.tsx` | `const styles = StyleSheet.create({` ~L7253; `header` ~L7256; `bottomNav`/`navLateral`/`navItem` ~L7740–7797 |
| 3 | Mapa | `App.tsx` | bloco `tab === 'map'` ~L4403–4790; `styles.map`/`tempLegend`/`mapButton`/`fab` ~L7536–7700 |
| 4 | Lista → tabela | `App.tsx` | `renderClientItem` ~L2604; `renderListRow` ~L2650; `FlatList` ~L4791; `styles.clientCard` ~L7855 |
| 5 | **Rota** | `App.tsx` | `const renderRouteScreen = () => {` **~L2699–3160** |
| 6 | **Tarefas** | `App.tsx` | `const renderTasksScreen = () => {` **~L3160–3384**; estilos do kanban ~L8086 |
| 7 | **Agenda** | `App.tsx` | `const renderAgendaScreen = () => {` **~L3384–3984**; estilos do calendário ~L7797–7850 |
| 8 | **Gestor** | `src/screens/GestorScreen.tsx` | arquivo inteiro (47 KB) + `src/hooks/useGestorMetrics.ts`, `useVisitsHeatmap.ts` |
| 9 | Meu desempenho | `src/screens/MeuDesempenhoScreen.tsx` | arquivo inteiro |
| 10 | Login | `src/screens/LoginScreen.tsx` | arquivo inteiro |
| 10b | **Configurações** | **não existe como tela** | hoje é o modal `isPasswordModalOpen` (JSX ~L5170–5340, `styles.passwordModalCard` ~L7284, `gestaoButton` ~L7296, `themeRow`/`themeChip` ~L7310). Criar `src/screens/ConfiguracoesScreen.tsx` |
| 11 | Ficha do lead | `App.tsx` | props do sheet ~L4180–4245; o componente do sheet é irmão no mesmo arquivo |
| 12 | Mudança de etapa | `src/screens/ChangeStageModal.tsx` | arquivo inteiro (43 KB) |
| 13 | Agendar | `src/screens/ScheduleMeetingModal.tsx` | arquivo inteiro |
| 14 | Cadastro + CEP | `src/screens/CEPStep.tsx` + `src/screens/OutboundCadastroScreen.tsx` | arquivos inteiros |

> Números de linha são de `main` no momento do handoff — **localize pelo nome da função**, não pela linha.

### Recomendação: extrair antes de redesenhar

Itens 5, 6 e 7 são ~1.300 linhas de JSX presas no meio do `App.tsx`. Antes de aplicar o design, extraia cada uma para `src/screens/RotaScreen.tsx`, `TarefasScreen.tsx` e `AgendaScreen.tsx` — recebendo por props o que hoje leem do escopo do componente (`clients`, `routeStops`, `fieldOps`, `visibleTasks`, `meetingsByClient`, `layout`, `insets`, os handlers). É refactor sem mudança de comportamento, e depois cada tela cabe numa passada.

Se preferir não extrair, edite uma função por vez e rode `npm run typecheck` entre cada uma.

### Ordem de trabalho

1. Tokens — adicionar `--stroke-default`, `--stroke-strong`, `--text-disabled` e o peso 700 da Poppins em `public/index.html`; remapear `--green-dark`/`--teal-dark`/`--blue-dark` no bloco escuro (ver *Correção de contraste*)
2. `src/hooks/useLayout.ts` — os degraus novos (ver *Responsive behavior*)
3. Casca: sidebar colapsável + header neutro (itens 1 e 2)
4. Mapa e Lista (itens 3 e 4)
5. **Rota, Tarefas, Agenda** (itens 5, 6, 7) — extrair primeiro
6. **Gestor** e Meu desempenho (itens 8 e 9)
7. Ficha, modais, Cadastro (itens 11–14)
8. **Configurações** (item 10b) — precisa existir antes de o header perder a engrenagem e o "Sair"
9. Login (item 10)

### Checklist de conclusão

Uma tela só está pronta quando: não sobrou nenhum `#` hexadecimal fora da lista de literais permitidos (temperatura do funil, tints de etapa/estado, marca); nenhum spacing fora da escala 8pt; todo alvo tocável tem 40px no desktop; e o modo escuro foi conferido — é onde os problemas de contraste aparecem.

## Fidelity

**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, raios, sombras, estados de hover e copy são finais e vêm do UI Kit oficial da Takeat (`takeat-design/UIKIT@main` — `foundations.md` e `components.md`). Recriar pixel-perfect usando os tokens abaixo.

O que **não** é final: os mapas nos protótipos são placeholders de grade CSS — no app é o `<MapView>` real de `src/map/`. Os ícones são Material Symbols Rounded, escolhidos porque `components.md` referencia nomes Material (`event_available`, `search`, `close`); o app de produção já importa os ícones oficiais de `takeat-design-system-ui-kit/icons/*` via `src/components/icons.tsx` — **usar os oficiais** e mapear pela tabela de ícones abaixo.

---

## Design Tokens

### Cores semânticas (`foundations.md` §1)

Os tokens já existem em `public/index.html` sob outros nomes. **Não criar variáveis novas** — a coluna "Variável no repo" é a que deve ser usada.

| Papel | Variável no repo | Light | Dark | Uso |
|---|---|---|---|---|
| `surface/background` | `--bg` | `#F6F6F6` | `#121212` | canvas da página |
| `surface/raised` | `--surface` | `#FFFFFF` | `#1E1E1E` | cards, modais, inputs, sidebar, header |
| `surface/nested` | `--surface-2` | `#F6F6F6` | `#262626` | container aninhado, hover de linha, header de tabela |
| `surface/fill` | `--surface-3` | `#EDEDED` | `#2A2A2A` | trilha de barra, input filled, disabled |
| `text/primary` | `--text` | `#222222` | `rgba(255,255,255,.92)` | títulos, valores numéricos |
| `text/secondary` | `--text-muted` | `#545454` | `rgba(255,255,255,.64)` | corpo, rótulos de nav — **a cor de texto mais usada** |
| `text/tertiary` | `--text-faint` | `#7A7A7A` | `rgba(255,255,255,.42)` | metadados, captions |
| `text/disabled` | — | `#C6C6C6` | `rgba(255,255,255,.28)` | placeholder, texto desabilitado |
| `stroke/subtle` | `--border` | `#EDEDED` | `rgba(255,255,255,.08)` | divisores, borda de card |
| `stroke/default` | — | `#C6C6C6` | `rgba(255,255,255,.14)` | borda de botão outline, separadores |
| `stroke/strong` | — | `#7A7A7A` | `rgba(255,255,255,.24)` | borda de input em repouso |

Faltam três no repo hoje — **adicionar a `public/index.html`**:

```css
:root{
  --stroke-default:#C6C6C6;
  --stroke-strong:#7A7A7A;
  --text-disabled:#C6C6C6;
}
:root[data-theme='dark'], @media(prefers-color-scheme:dark){:root:not([data-theme='light']){
  --stroke-default:rgba(255,255,255,.14);
  --stroke-strong:rgba(255,255,255,.24);
  --text-disabled:rgba(255,255,255,.28);
}}
```

### Cores de marca e famílias

| Token | Hex | Uso |
|---|---|---|
`red/default` | `#C8131B` | CTA primário, nav ativa, marca. Já é literal no código (`styles.header`, `styles.fab`) |
`red/dark` | `#94090F` | hover/pressed do CTA primário; texto vermelho legível no claro (`--tint-red-text`) |
`red/tint` (derivado) | `#FAE8E9` | fundo tonal, badge, nav ativa (`--tint-red`) |
`teal/dark` | `#1D9688` | exportações ("Baixar planilha"), outline do botão de download |
`blue/dark` | `#018CCC` | hyperlink, texto de link. **Foco de input: `#016999`** |
`yellow/default` | `#FFB32F` | atenção, pendente, semáforo âmbar |
`yellow/dark` | `#CC8C1D` | pressed do estado de atenção |
`green/default` | `#27A84C` | confirmação (botão de check-in) |
`green/dark` | `#167532` | valores positivos, MRR, meta batida (`--tint-green-text`) |

**Temperatura do funil** — literais, não invertem no dark (`src/constants/stages.ts`, `TEMP_COLORS`):

`hot #C8131B` · `warm #FFB32F` · `cold #0ea5e9` · `won #16a34a` · `lost #475569` · Conta Alvo `#7c3aed`

### ⚠ Correção de contraste no modo escuro

`#94090F` (red/dark) e `#167532` (green/dark) dão ~2,6:1 sobre `#121212`/`#1E1E1E` — reprovam como cor de texto. No escuro trocar por:

```
#94090F → #E5A1A4   (primary.red.200 — já é --brand-text no dark)
#167532 → #77BD8B   (já é --tint-green-text no dark)
#1D9688 → #5FD3C6
#018CCC → #66CFFF   (já é --info-text no dark)
```

Onde aparece: delta negativo de KPI, "última visita > 30 dias", MRR positivo na tabela do time, texto de exportação. **Usar os tokens (`--tint-red-text`, `--tint-green-text`, `--brand-text`, `--info-text`), que já fazem esse par no repo — não os hexes.**

Badges com fundo tonal claro (`#FAE8E9`, `#FFF8EB`, `#EAF7EE`) mantêm texto escuro nos dois modos: são superfícies próprias, não herdam o fundo do tema.

**Tints de etapa** (fundo de badge no modo claro; no dark usar `--surface-2` com texto `--text`):

| Etapa | bg | fg |
|---|---|---|
Prospecção | `#E6F7FF` | `#016999` |
Visita | `#E6FBF8` | `#0F6B61` |
Conversa com decisor | `#F1EBFE` | `#5B32C4` |
Demo/Proposta | `#FFF8EB` | `#99670F` |
Negociação | `#FFF1E0` | `#8A4A0C` |
Ag. Pagamento | `#FAE8E9` | `#94090F` |
Negócio Fechado / Enviado Onboarding | `#EAF7EE` | `#167532` |
Perdido / Reciclagem | `#EDEDED` | `#545454` |

### Tipografia

**Poppins** é a única família (já carregada em `public/index.html`, pesos 400/500/600/800 — **adicionar 700**, usado em títulos e nav ativa).

Tokens desktop de `foundations.md` §2. Números **sempre** com `font-variant-numeric: tabular-nums`.

| Token | px / lh / ls | Onde usar neste design |
|---|---|---|
Details | 8 / 12 / 0 | — (não usar; era o rótulo de nav de 8px que estamos removendo) |
Label Small | 11 / 16 / 0.5 | kickers, sublabels de KPI, badges, rótulos de heatmap |
Body Small | 12 / 16 / 0.4 | subtítulo do header, metadados, info de input |
Label Medium | 12 / 16 / 0.5 | **cabeçalho de coluna de tabela (700)**, chips, tags, contadores |
Body Medium | 14 / 20 / 0.25 | células de tabela, corpo de lista, texto de input |
Label Large | 14 / 20 / 0.1 | **rótulo de botão (600)**, item de nav, nome de entidade, nav ativa (700) |
Body Large | 16 / 24 / 0.5 | — |
Title Small | 16 / 24 / 0.15 | título de seção/card (700) |
Title Medium | 18 / 24 / 0 | título de drawer e modal (600) |
Title Large | 22 / 28 / 0 | **título da página no header (700)** |
Heading XS | 20 / 28 / 0 | KPI numérico médio (600) |
Heading Small | 24 / 32 / 0 | maior valor numérico do desktop (600) |
Heading Medium | 28 / 36 / 0 | KPI de destaque, título de banner (700) |

### Espaçamento (base 8pt)

`2 · 4 · 8 · 12 · 16 · 24 · 32 · 40`

| Contexto | Padding | Gap |
|---|---|---|
Chip/badge | 4v / 8h | — |
Botão Small | 4v / 8h | 8 |
Botão Medium | 10v / 16h | 8 |
Botão Large | 8v / 16h (24h se só rótulo) | 8 |
Input desktop | 10v / 16h (12h com ícone) | 8 |
Card | 16 | 12 entre linhas |
Modal/drawer | 24 | 16 entre seções |
Seção de página | 24 | 24 entre blocos |
Célula de tabela | 12v / 16h | 16 entre colunas |

### Raio

`4` inputs, linhas de tabela, tooltips, chips pequenos, badges de etapa · `8` **padrão** — cards, dropdowns, modais, chips de filtro, inputs · `12` botões Large e chips de segmento · `pill 9999` avatar, toggle, dot de status, badge de contagem

**Regra do kit**: botão Large é raio 12, input desktop é raio 8. Não unificar.

### Sombras (elevação)

| Token | box-shadow |
|---|---|
`shadow/01` | `0 1px 2px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` |
`shadow/02` **padrão** | `0 2px 4px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` |
`shadow/03` | `0 4px 8px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` |
`shadow/04` | `0 8px 16px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` |
`shadow/05` | `0 10px 25px rgba(0,0,0,.14), 0 0 8px rgba(0,0,0,.2)` |

Uso: card `02` · card dentro de kanban `01` · botão flutuante sobre mapa `03` · sidebar expandida `4px 0 16px rgba(0,0,0,.14)` · drawer `-8px 0 16px rgba(0,0,0,.14)` · modal `05`.

### Foco

```css
outline: 2px solid #016999; outline-offset: 2px;
```
`#016999` é o azul de foco de `components.md` (States — Outlined, Focused). Nunca deixar o anel azul padrão do browser.

---

## Grid e chrome global

**Grid desktop** (`foundations.md` §3): 12 colunas, gutter 16, margem 16–20, **largura mínima 1024px**. Combinações usadas: `12` (cheia), `8+4` (principal + rail), `4+4+4` e `3+3+3+3` (cards de KPI).

### Sidebar colapsável

Substitui a `styles.navLateral` atual (72px com rótulos de 8px).

- Posição: `fixed`, `left:0; top:0; bottom:0`, `z-index:40`
- Largura: **72px em repouso → 240px no hover** (`transition: width .16s cubic-bezier(.2,.7,.3,1)`), `overflow:hidden`
- Fundo `--surface`, borda direita 1px `--border`; expandida ganha `4px 0 16px rgba(0,0,0,.14)`
- **Topo (64px, `flex:0 0 64px`)**: borda inferior 1px `--border`, padding `0 20px`, gap 12. Ícone da marca 28×28 (`assets/takeat-icon.svg`), depois bloco de texto que aparece só expandido: "Field Sales" (14/20/0.1, 700, `--text`) sobre "Outbound" (11/16/0.5, 500, `--text-faint`)
- **Itens** (`padding:12px 8px`, gap 2): altura 44, `padding:0 16px`, raio 8, gap 16 entre ícone e rótulo. Ícone 24px. Rótulo 14/20/0.1, peso 500 (700 quando ativo)
  - repouso: fundo transparente, `--text-muted`
  - hover: fundo `--surface-2`
  - ativo: fundo `--tint-red`, texto `--tint-red-text`
  - **badge de contagem**: `min-width:18px; height:18px; padding:0 5px; border-radius:9px`, fundo `#C8131B`, texto branco 11/18 peso 700. Posição absoluta `top:6px`; `left:34px` colapsada, `left:176px` expandida
- **Rodapé** (borda superior 1px `--border`): item de tema (mesma anatomia dos itens) + linha de usuário — avatar 32px pill fundo `--tint-red` texto `--tint-red-text` 12/32/0.5 peso 700 com as iniciais, depois nome (12/16/0.5, 600, `--text`) sobre papel (11/16/0.5, 500, `--text-faint`)
- Rótulos: `opacity 0 → 1` com `transition: opacity .16s`. **Não animar largura de texto** — o `overflow:hidden` do container faz o corte
- `title` em cada item para tooltip nativo quando colapsada

**Ordem dos itens**: Mapa · Lista · Rota · Agenda · Tarefas *(badge)* · Gestor · Meu desempenho. Rota/Agenda/Tarefas escondidos para `role === 'view'`; Gestor só para `role === 'gestor'` — mesma lógica de `isViewer` / `canViewGestor` que já existe em `App.tsx`.

### Header (64px, sticky)

Substitui o header vermelho de altura 52 (`styles.header`, fundo `#C8131B`). **O vermelho sai do header** — passa a ser a cor do CTA. O header agora é `--surface` com borda inferior 1px `--border`, `position:sticky; top:0; z-index:20`, `padding:0 24px`.

- **Esquerda**: título da tela (22/28, 700, `--text`) + subtítulo contextual (12/16/0.4, 500, `--text-faint`), alinhados por `align-items:baseline`, gap 12
- **Direita** (gap 12):
  - Busca global: altura 40, `padding:0 12px`, raio 8, borda 1px `--stroke-strong`, `min-width:280px`. Ícone `search` 20px `--text-faint`, input 14/20/0.25 `--text-muted`, e um hint `⌘K` (11/16/0.5, 600, `--text-disabled`, borda 1px `--border`, raio 4, padding `1px 5px`)
  - Botão de avisos: 40×40, raio 8, borda 1px `--stroke-default`, fundo `--surface`, ícone `notifications` 20px. Dot de não-lido: 8px pill `#C8131B` com borda 1.5px `--surface`, `top:6px; right:6px`
  - **CTA "Novo lead"**: altura 40, `padding:0 16px`, raio 12, fundo `#C8131B`, texto branco 14/20/0.1 peso 600, ícone `add` 24px, gap 8. Hover `#94090F`

**Títulos e subtítulos por tela** (copy final):

| Tela | Título | Subtítulo |
|---|---|---|
Mapa | Mapa comercial | `{n}` leads na área visível · `{regiões}` |
Lista | Leads | `{n}` resultados · `{n}` filtros ativos |
Rota | Rota do dia | `{n}` paradas · `{km}` km · início `{hh:mm}` |
Agenda | Agenda | Rotas, demos e follow-ups da semana |
Tarefas | Tarefas | `{n}` cobranças abertas · escalonamento D2 → D5 |
Gestor | Painel do gestor | `{mês}` `{ano}` · `{n}` vendedores |
Meu desempenho | Meu desempenho | `{mês}` `{ano}` · `{nome}` |

### Login

**Fora do shell.** Sem sidebar, sem header, sem busca, sem avisos, sem avatar, sem CTA. Detalhe na seção de telas.

---

## Screens / Views

### 1. Mapa comercial

**Propósito**: encontrar e qualificar leads geograficamente; ponto de partida da visita.

**Layout**: `display:flex; height:calc(100vh - 64px)`. Painel de trabalho fixo de **352px** à esquerda + mapa preenchendo o resto. Sem overlays sobre o conteúdo do mapa além dos controles.

**Painel (352px, `flex:0 0 352px`, fundo `--surface`, borda direita 1px `--border`, coluna flex)**

Bloco de filtros (`padding:16px`, borda inferior 1px `--border`, gap 16):
1. **Segmented de status** — Leads / Clientes / Ex-clientes. Altura 40, `padding:0 12px`, 12/16/0.5 peso 600, `flex:1` cada. Raio 12 só nos cantos das pontas (`12px 0 0 12px` / `0` / `0 12px 12px 0`). Selecionado: fundo `#C8131B`, borda `#C8131B`, texto branco. Não-selecionado: transparente, borda 1px `--stroke-default`, `--text-muted`. Máximo 4 segmentos (regra do kit)
2. **Chips de temperatura** — cabeçalho "TEMPERATURA DA ETAPA" (11/16/0.5, 600, `--text-faint`, uppercase) com "Limpar" à direita (12/16/0.5, 600, `#018CCC`, sem borda nem fundo). Chips: altura 32, `padding:0 12px`, raio 8, borda 1px `--stroke-default`, fundo `--surface`, gap 8 — dot 10px da cor + rótulo 12/16/0.5 peso 600 `--text-muted` + contagem no mesmo tamanho peso 500 `--text-faint`. Seis chips: Quente, Morno, Frio, Fechado, Perdido, Conta Alvo
3. **Toggle "Calor de visitas"** (só gestor) — linha com `padding:12px`, raio 8, fundo `--surface-2`. Título 14/20/0.1 peso 600 `--text`, sublinha 12/16/0.4 `--text-faint` com contagem e janela ("1.284 check-ins · 90 dias"). Switch 44×24 pill: trilha `--stroke-default` → `#C8131B`, botão 20px branco com `0 1px 2px rgba(0,0,0,.3)`, `justify-content` alterna, `transition:all .16s`

Lista de resultados (`flex:1; overflow-y:auto`):
- Cabeçalho `padding:12px 16px 8px`: "NESTA ÁREA · `{n}`" (12/16/0.5, 700, `--text-muted`, uppercase) e "por distância" à direita (11/16/0.5, 500, `--text-faint`)
- Linha: `padding:12px 16px`, borda inferior 1px `--border`, gap 12, `align-items:flex-start`. Barra de temperatura 4px de largura, `align-self:stretch`, `min-height:40px`, raio 2. Nome 14/20/0.1 peso 600 `--text` truncado com ellipsis; sublinha `{etapa} · {cidade}` 12/16/0.4 `--text-faint`. Distância à direita 11/16/0.5 peso 600 `--text-faint`
- Hover: fundo `--surface-2`. Clique abre o drawer da ficha

**Mapa (`flex:1`)** — `<MapView>` real de `src/map/`. Mantém clustering (`radius 50`, `minPoints 3`, `maxZoom 14`), `animationEnabled={false}` e a camada de `<Circle>` do heatmap exatamente como estão.

- **Pin**: 40×40 pill da cor da temperatura, borda 2.5px branca, `0 4px 8px rgba(0,0,0,.24)`, logo branco 20px dentro (`assets/pin-logo.png` do repo). Seta abaixo: triângulo CSS `border-left/right: 7px transparent; border-top: 9px {cor}`, `margin-top:-1px`. **Pin cresceu de 36 para 40** — no desktop há espaço e o alvo de clique melhora
- **Controles** (`right:16px; top:16px`, coluna, gap 8): 40×40, raio 8, fundo `--surface`, borda 1px `--border`, `shadow/03`. `my_location` (cheio + `#C8131B` quando seguindo o vendedor, vazado + `--text-muted` quando a câmera está livre) e `layers`
- **Legenda** (`left:16px; bottom:16px`): barra horizontal `padding:12px 16px`, raio 8, fundo `--surface`, `shadow/03`, `display:flex; flex-wrap:wrap; gap:8px 16px; max-width:calc(100% - 32px)`. Cada item: dot 10px + rótulo 12/16/0.5 peso 600 `--text-muted`. **Substitui a legenda de duas colunas que comia um quarto da tela no mobile.** O `flex-wrap` + `max-width` é obrigatório: em 1024px a barra de seis itens não caberia numa linha
- **Sem FAB.** A criação de lead virou o CTA "Novo lead" no header

### 2. Leads (tabela)

**Propósito**: varrer, filtrar, ordenar e comparar a base inteira — o que os cards de três colunas não permitem.

**Layout**: `padding:24px; max-width:1600px`.

**Barra de ferramentas** (`margin-bottom:16px`, `justify-content:space-between`, `flex-wrap:wrap`, gap 16):
- Esquerda: chips de temperatura — altura 32, `padding:0 12px`, raio 8, dot 8px + rótulo 12/16/0.5 peso 600. Ativo: fundo `--tint-red`, texto `--tint-red-text`, borda da mesma cor do fundo. Inativo: fundo `--surface`, borda 1px `--stroke-default`, `--text-muted`
- Direita: "Filtros" (Large outline — altura 40, raio 12, borda 1px `--stroke-default`, ícone `filter_list` 24px, badge de contagem 18px pill `#C8131B`) e "Baixar planilha" (Large outline em `#1D9688`, ícone `download` 24px — a cor de exportação do kit)

**Tabela** — fundo `--surface`, borda 1px `--border`, raio 8, `overflow:hidden`, `shadow/02`.

Grid de colunas (idêntico em cabeçalho e linhas):
```
minmax(240px,2fr) minmax(150px,1fr) 160px 120px minmax(140px,1fr) 110px 96px 48px
gap: 16px
```
`minmax()` é o que permite degradar sem quebrar, como já se faz nos grids atuais.

- **Cabeçalho**: `padding:12px 16px`, fundo `--surface-2`, borda inferior 1px `--stroke-default`, rótulos 12/16/0.5 peso 700 `--text-muted`
- **Linha**: `padding:12px 16px`, borda inferior 1px `--border`, `align-items:center`, `cursor:pointer`, hover fundo `--surface-2`. Clique abre o drawer

| Coluna | Conteúdo |
|---|---|
Restaurante | barra de temperatura 4×32 raio 2 + nome (14/20/0.1, 600, `--text`, truncado) sobre status (12/16/0.4, `--text-faint` — "Lead · 3 visitas") |
Contato | 14/20/0.25 `--text-muted`, truncado |
Etapa | badge `padding:4px 8px` raio 4, tint de etapa da tabela acima, 11/16/0.5 peso 600 |
Temperatura | dot 10px + rótulo 12/16/0.5 peso 600 `--text-muted` |
Cidade / UF | 14/20/0.25 `--text-muted` |
Última visita | 12/16/0.5 peso 600. `--text-muted` normal; `--text-disabled` quando "—"; `#94090F` quando > 30 dias |
Reuniões | centralizado, 14/20 peso 600, tabular-nums |
— | `chevron_right` 20px `--text-faint`, alinhado à direita |

- **Rodapé**: `padding:12px 16px`, `justify-content:space-between`. "Mostrando `{n}` de `{total}` leads" (12/16/0.4, `--text-faint`) e paginação — botões 32×32 raio 4, borda 1px `--stroke-default`; página atual fundo `#C8131B` texto branco 12/600

> Manter o agrupamento por etapa em acordeão que já existe (`renderListRow`, `expandedStages`) como **modo alternativo**, não como padrão: no desktop a tabela plana com ordenação por coluna resolve melhor.

### 3. Rota do dia

**Layout**: `flex; height:calc(100vh - 64px)`. Mapa à esquerda (`flex:1`) + rail de **420px** à direita — o inverso do Mapa, porque aqui a sequência é o objeto de trabalho.

**Mapa**: polyline `#C8131B` largura 5, `stroke-linecap/linejoin: round`; geometria real do OSRM quando disponível, reta tracejada `[8,4]` como fallback (comportamento atual). Marcadores numerados 36×36 pill, borda 3px branca, `shadow/03`, número 14/20 peso 700 branco. Fundo: `#167532` concluída, `#C8131B` a atual, `--text-faint` as pendentes.

**Rail (`flex:0 0 420px`, fundo `--surface`, borda esquerda 1px `--border`)**

Topo (`padding:24px`, borda inferior 1px `--border`):
- Kicker "ROTA DO DIA" (11/16/0.5, 600, `--text-faint`, uppercase) + data (18/24, 600, `--text`); setas 32×32 raio 4 borda 1px `--stroke-default` à direita
- Três KPIs em `grid-template-columns:repeat(3,1fr)` gap 8: `padding:12px`, raio 8, fundo `--surface-2`. Valor 20/28 peso 600 `--text` tabular-nums, rótulo 11/16/0.5 peso 500 `--text-faint`. **paradas · distância · em rota**

Lista de paradas (`flex:1; overflow-y:auto; padding:16px 24px`) — linha `padding:12px 0`, borda inferior 1px `--border`, gap 12:
- Índice: 28px pill, 12/28/0.5 peso 700. Concluída `#EAF7EE`/`#167532`; atual `#C8131B`/branco; pendente `--surface-2`/`--text-muted`
- Nome 14/20/0.1 peso 600 `--text` truncado + tag opcional (`padding:2px 6px`, raio 4, 11/16/0.5 peso 600): **Visitado** `#EAF7EE`/`#167532` · **Agora** `--tint-red`/`#94090F` · **SLA** `#FFF8EB`/`#99670F` · **Demo** e **Alvo** `#F1EBFE`/`#5B32C4`
- Detalhe 12/16/0.4 `--text-faint`: horário, cidade e o motivo da parada
- Handle `drag_indicator` 20px `--text-faint` em botão 32×32 raio 4, hover `--surface-2` — reordenação por arraste

Rodapé (`padding:24px`, borda superior 1px `--border`, gap 8): "Iniciar navegação" (Large filled `#C8131B`, ícone `navigation`) e "Otimizar paradas" (Large outline `#C8131B`, ícone `route`, hover fundo `--tint-red`).

**Rótulos de botão são flush-left** (`justify-content:flex-start`, `padding:0 16px`) — vem do kit: botão mais largo que o rótulo começa o texto na borda de padding.

### 4. Agenda

**Layout**: `padding:24px`. Calendário semanal em `grid-template-columns:repeat(7,minmax(0,1fr))` gap 8 — a semana inteira de uma vez, no lugar da lista cronológica única do mobile.

**Barra** (`margin-bottom:16px`, `space-between`, `flex-wrap:wrap`):
- Esquerda: setas 32×32 raio 4, intervalo ("24 – 30 de agosto de 2026", 18/24 peso 600 `--text`), botão "Hoje" (Small — altura 32, `padding:0 12px`, raio 4, borda 1px `--stroke-default`, 12/16/0.5 peso 600)
- Direita: legenda de tipos (quadrado 10px raio 2 + rótulo 12/16/0.5 peso 600 `--text-muted`) — **Rota `#C8131B` · Demo `#7c3aed` · Follow-up `#01AFFF`** — e "Exportar JSON" (Large outline `#1D9688`, ícone `download`; chama a edge `export-agenda`)

**Coluna de dia**: fundo `--surface`, borda 1px `--border`, raio 8, `min-height:520px`, `overflow:hidden`.
- Cabeçalho `padding:12px`, borda inferior 1px `--border`: dia da semana minúsculo (11/16/0.5, 600, uppercase, `--text-faint`) + número (20/28, 600, `--text`, tabular-nums)
- **Hoje**: borda da coluna `#C8131B`, fundo do cabeçalho `--tint-red`, textos do cabeçalho `--tint-red-text`
- Corpo `padding:8px`, coluna flex gap 8. Item: `padding:8px`, raio 4, borda esquerda 3px da cor do tipo, fundo = tint do tipo no claro (`#FAE8E9` / `#F1EBFE` / `#E6F7FF`) ou `--surface-2` no dark. Hora 11/16/0.5 peso 700 na cor do tipo, tabular-nums; título 12/16/0.4 peso 600 `--text`; sublinha 11/16/0.5 `--text-faint`

### 5. Tarefas (kanban)

**Layout**: `padding:24px`, `display:flex; gap:16px; overflow-x:auto; align-items:flex-start`. Colunas de **380px** (`flex:0 0 380px`) — o repo já usa `kanbanColuna: { width: 360 }`; 380 dá folga para o card com dois botões.

Três colunas: **Atrasadas** `#C8131B` · **Hoje** `#FFB32F` · **Próximas** `#0ea5e9`.

**Coluna**: fundo `--surface`, borda 1px `--border`, raio 8, `shadow/02`.
- Cabeçalho `padding:16px`, borda inferior 1px `--border`: dot 10px + título 14/20/0.1 peso 600 `--text`; contagem à direita em pill (`min-width:24px; height:24px; padding:0 8px`, 12/24/0.5 peso 700) com o tint do estado — `#FAE8E9`/`#94090F`, `#FFF8EB`/`#99670F`, `#E6F7FF`/`#016999`
- Corpo `padding:12px`, coluna gap 12

**Card**: `padding:16px`, borda 1px `--border`, raio 8, fundo `--surface`, `shadow/01`, hover `border-color:--stroke-strong`.
- Linha superior: lead 14/20/0.1 peso 600 `--text` + badge de SLA (`padding:2px 6px`, raio 4, 11/16/0.5 peso 600) — **D5** `#FAE8E9`/`#94090F`, **D2** `#FFF8EB`/`#99670F`, **—** `--surface-2`/`--text-faint`
- Tarefa 12/16/0.4 `--text-muted`, `margin-top:6px`
- Metadados `margin-top:12px`, gap 12: `schedule` + prazo, `person` + vendedor (ícones 16px, texto 11/16/0.5 peso 600 `--text-faint`)
- Ações `margin-top:12px`, gap 8: "Agendar" (`flex:1`, altura 32, raio 8, fundo `--tint-red`, texto `--tint-red-text`, 14/20/0.1 peso 600, flush-left) e botão de concluir 32×32 raio 8 borda 1px `--stroke-default`, ícone `check` 20px

> O check é **toggle otimista**: pinta na hora, persiste em seguida, reverte se falhar.

### 6. Painel do gestor

> **Esta seção foi refeita.** A primeira versão assumia funil comercial por etapa, heatmap de visitas, MRR novo e taxa de conversão. Lido o `useGestorMetrics.ts`, **nenhuma dessas métricas existe** — o RPC `gestor_metrics` devolve um snapshot de estados, seis contadores de atividade e os mesmos seis por vendedor. O que segue é desenhado sobre o que o banco entrega.

**O que o hook entrega**

`global`, snapshot atual (independente do período): `total_clients` · `total_leads` · `total_visited` · `total_active_clients` · `total_churn`.
`global`, atividade no período: `created_in_period` · `visited_in_period` · `meetings_in_period` · `follow_ups_in_period` · `stage_changes_in_period` · `notes_in_period` · `won_in_period`.
`sellers[]`: `full_name` · `email` · `id_hubspot` · `sector` · `leads_assigned` · `status_breakdown` · `created` · `visited` · `meetings_scheduled` · `follow_ups_scheduled` · `stage_changes` · `notes_created` · `won_in_period` — já ordenados por `visited*3 + created*2 + meetings + follow_ups + stage_changes + notes`, com contas RPA filtradas fora.
`useGestorTaskMetrics`: `pending` e `done` por `id_hubspot`. `useMetricLeads`: os leads por trás de um número, sob demanda.

**Layout**: `display:flex; align-items:flex-start; gap:24px; padding:24px` — coluna principal `flex:1` + rail de **320px**.

#### Seletor de período

Cinco botões Small (altura 32, `padding:0 12px`, raio 4, 12/16/0.5 peso 600, borda 1px `--stroke-default`), ativo `#C8131B`/branco: **Hoje · 7 dias · 30 dias · Tudo · Personalizado** — os `GestorPeriodPreset`. À direita da faixa, "Snapshot lido agora · atividade no período" 12/16/0.4 `--text-faint`.

> A `queryKey` do hook **não pode** conter o range calculado com `Date.now()`: isso muda a cada render e joga o React Query em refetch infinito. O bug já aconteceu ("os botões de período não carregam, mas o intervalo personalizado sim") e está documentado no próprio hook. Não toque nela.

#### 1 · Composição da base

`total_leads + total_active_clients + total_churn = total_clients`. Não são cinco números soltos, é uma composição — e mostrada como tal, 31% de churn salta aos olhos de uma vez.

Card `padding:24px`, `--surface`, borda 1px `--border`, raio 8, `shadow/02`.

- **Cabeçalho** (`space-between`, `align-items:baseline`): "COMPOSIÇÃO DA BASE" 12/16/0.5 peso 700 uppercase `--text-muted` sobre "Snapshot atual, independente do período" 12/16/0.4 `--text-faint`; à direita, `total_clients` em 28/36 peso 700 `tabular-nums` com "registros" 11/16/0.5 peso 600 abaixo.
- **Barra proporcional**: `display:flex; height:32px`, raio 4, `overflow:hidden`, trilha `--surface-3`. Três segmentos com `width` percentual — Leads `#0ea5e9` · Clientes `#16a34a` · Churn `#475569` — cada um com o percentual em 11/16/0.5 peso 700 branco, `padding-left:8px`. **Segmento abaixo de ~8% esconde o rótulo interno**, senão vaza para o vizinho. `title` para tooltip nativo.
- **Legenda clicável** (`margin-top:16px`, gap 24): dot 10px + número 20/28 peso 600 `--text` `tabular-nums` + rótulo 12/16/0.5 peso 600 `--text-faint`. Cada item abre o drill-down.
- **`total_visited` fica fora da barra**, depois de uma régua vertical 1px `--border`: ícone `where_to_vote` 20px + número + "já visitados". É marca de atividade, não estado da base.

#### 2 · Atividade no período

Cabeçalho "ATIVIDADE NO PERÍODO · `{n}` VENDEDORES" 12/16/0.5 peso 700 uppercase.

Grid de **seis** cards `repeat(6,minmax(0,1fr))` gap 12. Cada um é um `<button>`: `padding:16px`, `--surface`, borda 1px `--border`, raio 8, `shadow/01`, hover `border-color:--stroke-strong`. Ícone 20px `--text-faint`; número 24/32 peso 600 `--text` `tabular-nums`; rótulo 12/16/0.5 peso 600 `--text-faint`.

**Visitados** (`where_to_vote`) · **Criados** (`add_business`) · **Reuniões** (`event`) · **Follow-ups** (`phone_in_talk`) · **Mudanças** (`trending_up`) · **Notas** (`edit_note`) — cada um abrindo o drill-down com a `GlobalMetricKey` correspondente.

`won_in_period` existe no hook, mas **não há `GlobalMetricKey` `'won'`** no `useMetricLeads` — se for exibido, fica sem drill-down. Mantenha se já existe; não acrescente.

#### 3 · Ranking de vendedores

Hoje cada vendedor é um bloco de ~500px com oito tiles. Com 17 ativos são ~8.500px de rolagem, e comparar o #1 com o #7 exige rolar de volta lembrando números. **O painel existe para comparar; comparação pede tabela.**

Card `overflow:hidden`, `--surface`, borda 1px `--border`, raio 8, `shadow/02`. Cabeçalho `padding:16px`: "Vendedores" 16/24/0.15 peso 700 sobre "Ordenado por atividade ponderada · clique numa célula para ver os leads" 12/16/0.4; botão "Ordenar" Small outline com `swap_vert` à direita.

Grid **idêntico** no cabeçalho e nas linhas:
```
32px minmax(200px,2fr) repeat(6,minmax(76px,1fr)) 96px 88px
gap: 12px
```

Dez colunas: **# · Vendedor · Visitados · Criados · Reuniões · Follow-ups · Mudanças · Notas · Tarefas · Ações**.

| Coluna | Tratamento |
|---|---|
**#** | "#1" 12/16/0.5 peso 700 `tabular-nums`; **`#C8131B` nos três primeiros**, `--text-faint` no resto |
**Vendedor** | avatar 32px pill com iniciais (12/32/0.5 peso 700) + nome 14/20/0.1 peso 600 truncado sobre "`{sector}` · `{leads_assigned}` leads" 11/16/0.5 `--text-faint`. O próprio usuário ganha avatar `--tint-red`/`--tint-red-text` |
**Visitados** | 14/20 peso 600 `tabular-nums`. **Única numérica com destaque de peso** — `--text` quando alta, `--text-muted` no resto. Reflete o peso 3× no score |
**Criados … Notas** | 14/20 peso 600 `--text-muted` `tabular-nums`, à direita |
**Tarefas** | "`{pending}` / `{done}`" 12/16/0.5 peso 600 `tabular-nums`; **pendentes ≥ 5 em `--tint-red-text`**, a barra em `--text-disabled`. De `useGestorTaskMetrics`, cruzado por `id_hubspot` — "—" quando ausente |
**Ações** | barra 44×6 raio 3 (trilha `--surface-3`, preenchimento `#C8131B` no top-3, `--stroke-strong` no resto) + total 12/16/0.5 peso 600 `--text-faint` |

Linha `padding:12px 16px`, borda inferior 1px `--border`, hover `--surface-2`. **Cada numérica abre o drill-down** daquele vendedor naquela `SellerMetricKey`; a coluna Vendedor abre `metric:'assigned'`.

**A ordem vem do hook** — não reordene no componente. O filtro de contas RPA também é do hook.

Rodapé `padding:12px 16px`: "`{n}` vendedores ativos no período · contas de automação (RPA) ficam fora do ranking" 12/16/0.4.

#### 4 · Rail de administração

Os cinco painéis acordeão de hoje viram quatro **cards-link** + o bloco de exportação. `padding:16px`, `--surface`, borda 1px `--border`, raio 8, `shadow/01`, hover `border-color:--stroke-strong`: ícone em quadrado 40×40 raio 8 (`--surface-2`/`--text-muted`) + título 14/20/0.1 peso 600 sobre descrição 12/16/0.4 + badge de contagem opcional (pill 24px) + `chevron_right` 20px `--text-disabled`.

**Vendedores e usuários** (edge `criar-usuario`) · **Config Rota do dia** (`RouteConfigCard`) · **Metas por vendedor** (`SellerGoalsCard`) · **Contas Alvo dispensadas** (`DismissedContaAlvoCard`).

Cada um abre no **drawer padrão de 480px** — o mesmo da ficha do lead. Acordeão em rail de 320px aperta o conteúdo e empurra os vizinhos; o drawer dá largura para editar.

**Bloco de exportação** `padding:24px`: ícone `database` 20px `--color-teal-dark` + "Exportar tudo" 14/20/0.1 peso 600; descrição 12/16/0.4 com `text-wrap:pretty`; dois botões Large em coluna gap 8, rótulo flush-left — "Semana anterior" (filled `#C8131B`, `download`) e "Período selecionado" (outline neutro, `date_range`).

> `exportReport` valida por **lista fixa de e-mails** (`GESTOR_EMAILS`) na edge `export-report`, não pelo `role` — está em `docs/DECISOES.md`. Payload e signed URL inalterados.

#### 5 · Drill-down

Todo número abre "quais leads compõem esse dado", no **drawer padrão de 480px**.

- Topo: kicker "`{MÉTRICA}` · `{PERÍODO}`" ou "`{MÉTRICA}` · `{VENDEDOR}`" 11/16/0.5 peso 600 uppercase; título com o número e o rótulo 18/24 peso 600; X 40×40.
- Linha por `MetricLead`: barra 4px da cor do status + nome (`empresa || nome`) 14/20/0.1 peso 600 truncado; sublinha 12/16/0.4 com a data (`at`, pt-BR) e `responsavel_nome`. **`actor_name` aparece quando difere do responsável** — é o que responde "quem fez o quê" e hoje se perde. Métrica Notas mostra o `note` em 2 linhas (`-webkit-line-clamp:2`).
- Clique na linha abre a ficha do lead **empilhada**, não substituindo.
- Carregando: skeleton `--surface-3` raio 4. Vazio: "Nenhum lead nesse recorte."
- Tarefas usam `useGestorTasksList` com `hubspotId` + `status`: título da tarefa, lead, `severity` em badge e `days_in_stage` quando presente.

**Carregamento sob demanda é essencial**: o painel antes baixava a tabela `clients` inteira (~4,7k linhas) e agregava em JS a cada troca de filtro. O RPC resolveu; não pré-carregue os drill-downs.

**Responsivo**: abaixo de 1280px o rail desce para o fim da coluna, em grid de 2. Abaixo de 1024px a tabela reduz a # · Vendedor · Visitados · Ações.

**Cor**: nenhum número é colorido. A cor entra em quatro lugares e só neles — rank do top-3, tarefas pendentes em risco, barra de score e os dots da composição. Milhares com `toLocaleString('pt-BR')`.

### 7. Meu desempenho

**Layout**: `padding:24px`, coluna gap 24, `max-width:1200px`.

1. **Banner de meta** — `padding:24px`, raio 8, fundo `#C8131B`, texto branco. `space-between`, `flex-wrap:wrap`, gap 24. Kicker "META DE AGOSTO" (11/16, `letter-spacing:.12em`, 800, `rgba(255,255,255,.75)`, uppercase); título 28/36 peso 700 ("8 de 12 fechamentos"); sublinha 14/20/0.25 peso 500 `rgba(255,255,255,.85)` com o que falta e o ritmo. À direita, dois números 28/36 peso 700 tabular-nums com sublabel 11/16/0.5 peso 600 — **% da meta** e **MRR novo**.
   Este é o **único bloco vermelho chapado da superfície** — é a pergunta que a aba responde. Não repetir o padrão em outras telas.
2. **Quatro KPIs** — `repeat(4,minmax(0,1fr))` gap 16, mesma anatomia do Gestor mas valor em 24/32 peso 600: Visitas no mês · Demos · Taxa de conversão · Tarefas atrasadas (delta em `#94090F`).

### 8. Login

**Fora do shell** — sem sidebar, sem header. `display:grid; grid-template-columns:1fr 1fr; height:100vh`.

- **Painel esquerdo**: fundo `#C8131B`, `padding:64px`, coluna com `justify-content:space-between`. Logo branco no topo (`assets/takeat-logo-white.svg`, altura 32, `align-self:flex-start`). No meio: kicker "FIELD SALES OUTBOUND" (11/16, `.12em`, 800, `rgba(255,255,255,.7)`) + frase 28/36 peso 700 branca, `max-width:22ch`, `text-wrap:pretty`. Embaixo: "Contas são criadas pelo administrador" (12/16/0.4, `rgba(255,255,255,.7)`)
- **Painel direito**: fundo `--bg`, centralizado, `padding:64px`. Bloco `max-width:400px`, coluna gap 16. Título "Entrar na conta" 24/32 peso 700 `--text`. Campos: rótulo 14/20/0.1 peso 600 `--text-muted` com `margin-bottom:8px`; caixa altura 40, `padding:0 16px`, raio 8, borda 1px `--stroke-strong`, fundo `--surface`, ícone 20px `--text-faint` (`mail` / `lock`) + input 14/20/0.25 `--text-muted`. Botão "Entrar" Large filled `#C8131B` flush-left (`padding:0 24px`). Link "Esqueci minha senha" 14/20/0.1 peso 600 `#018CCC`
- Erro de credencial: texto 12/16/0.4 `#C8131B` acima do botão; borda do campo inválido passa a `#C8131B`

**A tela de login atual** (`src/screens/LoginScreen.tsx`) é vertical com logo, título 32px e card branco sobre vermelho — desenhada para 390px. No desktop ela fica com um card no meio de um mar vermelho. Este split panel é a versão desktop; **manter o layout atual no mobile** e escolher por `layout.ehDesktop`.

### 10. Configurações

**Hoje isso não é uma tela.** É o modal aberto pela engrenagem do header (`isPasswordModalOpen`, `styles.passwordModalCard`), que empilha: atalho para o painel de gestão, seletor de tema, troca de senha e o gatilho de forçar atualização. No desktop a engrenagem sai do header — e com ela o botão "Sair" — e isso vira uma tela própria na navegação, entre "Meu desempenho" e o rodapé da sidebar.

**Layout**: `padding:24px`, `display:flex; flex-direction:column; gap:32px`, `max-width:880px`. Seis seções, cada uma com um cabeçalho fora do card — 12/16/0.5 peso 700 `--text-muted`, uppercase, `margin-bottom:16px` — e um card na casca padrão (`--surface`, borda 1px `--border`, raio 8, `shadow/02`).

**1 · CONTA** — card com `overflow:hidden` e linhas de leitura: `padding:12px 16px`, borda inferior 1px `--border`, `justify-content:space-between`. Chave 12/16/0.5 peso 600 `--text-faint` com `flex:0 0 auto; white-space:nowrap` (sem isso "E-mail" e "ID HubSpot" quebram em duas linhas); valor 14/20/0.25 `--text` à direita. Nome · E-mail · Papel · ID HubSpot. Fecha com uma nota 12/16/0.4 `--text-faint`: *"Nome, e-mail e papel são definidos pelo administrador."*

**2 · SENHA** — card `padding:24px`. Hint 12/16/0.4 `--text-faint` com a copy atual — *"Digite uma nova senha. Mínimo de 6 caracteres."* — e `margin-bottom:16px`. Dois campos em `grid-template-columns:1fr 1fr` gap 16, `max-width:560px`: rótulo 14/20/0.1 peso 600 `--text-muted` com `margin-bottom:8px`, caixa altura 40, `padding:0 16px`, raio 8, borda 1px `--stroke-strong`. CTA "Salvar nova senha" Large filled `#C8131B` com ícone `lock_reset`, `margin-top:16px`, rótulo flush-left. Chama o `updatePassword` do `AuthContext` — inalterado.

**3 · APARÊNCIA** — card `padding:24px`. Rótulo "Tema" 14/20/0.1 peso 600 `--text-muted`; explicação 12/16/0.4 `--text-faint`: *"Automático segue o aparelho. A escolha manual vence o aparelho e vale também no mapa."* Segmented **Automático · Claro · Escuro**: altura 40, `padding:0 16px`, 12/16/0.5 peso 600, raio 12 **só nas pontas**, `max-width:360px`. Selecionado `#C8131B`/branco; os outros transparentes com borda 1px `--stroke-default`.

> O estado é o `ThemePref` de `src/theme.ts` (`'system' | 'light' | 'dark'`), que é **de módulo, não de componente** — por isso trocar aqui repinta a interface e o mapa juntos. O mapa lê o tema em JavaScript (o estilo vem do Google, não do CSS); se ele não re-renderizar, a interface fica clara e o mapa escuro. Esse bug já existiu no app.

**4 · ÁREA DO GESTOR** (só `role === 'gestor'`) — dois cards-link em coluna gap 12. Cada um `padding:16px`, `display:flex; align-items:center; gap:16px`, `text-decoration:none`, hover `border-color:--stroke-strong`: ícone em quadrado 40×40 raio 8, título 14/20/0.1 peso 600 sobre descrição 12/16/0.4 `--text-faint`, e `open_in_new` ou `chevron_right` 20px `--text-faint` à direita.

- **"Abrir painel de gestão"** — quadrado `--tint-red`/`--tint-red-text`, ícone `bar_chart`. *"Funil do time, travados e gargalo. Abre em nova aba."* Continua sendo um `<a href>` **de verdade** para `/gestao`, não `window.open` — o comentário no código atual explica o motivo.
- **"Vendedores e usuários"** — quadrado `--surface-2`/`--text-muted`, ícone `group`. *"Criar conta, definir papel e associar id do HubSpot."* Edge `criar-usuario`.

**5 · ADMINISTRAÇÃO** (só admin) — card `padding:24px` com **borda esquerda 3px `#CC8C1D`**. Título "Forçar atualização em todos os aparelhos" 14/20/0.1 peso 600 `--text`; explicação 12/16/0.4 `--text-faint`, `max-width:64ch`, `text-wrap:pretty`: *"Todo vendedor conectado recarrega o app em segundos. Use depois de um deploy que precisa chegar na hora — o cron das 2h já faz isso diariamente."* Botão "Forçar atualização" Large outline neutro (borda `--stroke-default`), ícone `refresh`, flush-left. Faz o `update` em `app_force_reload.triggered_at` — inalterado.

**6 · SOBRE** — card `overflow:hidden` com linhas de leitura iguais às de Conta: versão do app, build do service worker, última sincronização de uso (`hs_uso_sincronizado_em`), valores com `tabular-nums`. Abaixo, `padding:16px` com **"Sair da conta"** Large outline `#C8131B`, ícone `logout`, hover fundo `--tint-red`.

**Responsivo**: abaixo de 1024px os dois campos de senha empilham em coluna única; o resto já é uma coluna.

**O que sai do header**: o botão de engrenagem 44×44 (`styles.headerIconButton`) e o `logoutButton`. O header desktop fica com título, subtítulo, busca global, sino de avisos e o CTA "Novo lead". Identidade e tema também aparecem no rodapé da sidebar — o atalho rápido —, e a tela é o lugar completo.

### 11. Ficha do lead (drawer)

**Um único padrão de painel no sistema** — avisos, rota, ficha e perfil usam a mesma estrutura. Não inventar um segundo jeito de abrir painel.

- Overlay `rgba(0,0,0,.32)` cobrindo tudo, `z-index:60`; drawer de **480px** encostado à direita, fundo `--surface`, `-8px 0 16px rgba(0,0,0,.14)`
- Fecha no **X**, no **overlay** e no **Esc**. `role="dialog"`, `aria-modal="true"`, `aria-label`. Transição 220ms ease-out (slide + fade do overlay)
- **Topo** (`padding:24px`, borda inferior 1px `--border`): dot 10px da temperatura + kicker "`{TEMPERATURA}` · `{n}`ª VISITA" (11/16/0.5, 600, `--text-faint`, uppercase); nome 18/24 peso 600 `--text`; sublinha contato · telefone 12/16/0.4 `--text-faint`. X em botão 40×40 raio 8, hover `--surface-2`
  - Ações `margin-top:16px` gap 8: "Mudar etapa" (Large filled `#C8131B`, ícone `trending_up`, `flex:1`) · "Agendar" (Large outline `#C8131B`, ícone `event`, `flex:1`) · `more_horiz` 40×40 raio 12 borda 1px `--stroke-default` (editar, editar localização, excluir, adicionar à rota)
- **Corpo** (`flex:1; overflow-y:auto; padding:24px`, gap 24):
  - **Uso do produto** — só aparece para quem o `hubspot-usage-sync` alcança. `padding:16px`, borda 1px `--border`, raio 8, fundo `--surface-2`. Cabeçalho 12/16/0.5 peso 700 uppercase; linha com dot de semáforo 10px + texto 14/20/0.25 `--text-muted` ("Última comanda há 12 dias"); rodapé 11/16/0.5 `--text-faint` com "Sincronizado há N dias · N comandas". **Semáforo**: verde `#167532` ≤ 7 dias, âmbar `#FFB32F` 8–30, vermelho `#C8131B` > 30 ou nenhuma. Quando existe pedido de cancelamento, linha extra em `#94090F`
  - **Dados** — cabeçalho de seção 12/16/0.5 peso 700 uppercase `--text-muted`. Pares chave/valor: `padding:10px 0`, borda inferior 1px `--border`, chave 12/16/0.5 peso 600 `--text-faint` à esquerda (`flex:0 0 auto`), valor 14/20/0.25 `--text` à direita.
    Ordem: **Contato · Telefone** · Etapa · Plano apresentado · Endereço · CEP · Origem do lead · Responsável · **ID HubSpot** (`tabular-nums`). **Sem MRR** — o campo saiu por decisão do time.
    Fecha com uma **linha de link**: ícone `open_in_new` 20px + "Abrir no HubSpot" 14/20/0.1 peso 600 `#018CCC`, `padding:12px 0`. É o caminho para o registro completo e permanece no painel
  - **Timeline** — por item: ícone em pill 32px com o tint do tipo (`where_to_vote` `#EAF7EE`/`#167532`, `trending_up` `#FFF1E0`/`#8A4A0C`, `event` `#F1EBFE`/`#5B32C4`, `edit_note` `--surface-2`/`--text-muted`), depois título 14/20/0.1 peso 600 `--text` sobre quando 12/16/0.4 `--text-faint`. `padding-bottom:16px`
- **Rodapé** (`padding:24px`, borda superior 1px `--border`): "Marcar visita (check-in GPS)" — Large filled `#27A84C`, largura total, ícone `where_to_vote`, flush-left. Vira "Re-marcar visita" quando já houve check-in. Validação de distância (200m) e criação da Task concluída no HubSpot: comportamento atual, inalterado

### 12. Mudança de etapa (modal)

Overlay `rgba(0,0,0,.32)`, `z-index:70`. Card **560px**, `max-height:88vh`, `overflow-y:auto`, fundo `--surface`, raio 8, `shadow/05`.

- **Topo** (`padding:24px`, borda inferior 1px `--border`): título "Mudar etapa · `{lead}`" 18/24 peso 600; sublinha "Hoje em `{etapa}` · sincroniza no HubSpot" 12/16/0.4 `--text-faint`. X 40×40
- **Seleção de etapa** — rótulo de grupo 14/20/0.1 peso 600 `--text-muted`, `margin-bottom:8px`. Opções em coluna gap 8: altura **48**, `padding:0 16px`, raio 8, borda 1px. Radio 20×20 (borda 2px, dot interno 10px). Rótulo 14/20/0.1 peso 600, `flex:1`. Dot da cor da etapa 10px à direita
  - selecionada: fundo `--tint-red`, borda `#C8131B`, radio e dot `#C8131B`, texto `--tint-red-text`
  - não selecionada: fundo `--surface`, borda `--stroke-default`, radio `--stroke-strong`, dot transparente, texto `--text-muted`
  - **Destinos** vêm de `APP_STAGE_IDS` filtrado pela regra de avanço: pulo livre até Demo/Proposta (`FREE_ADVANCE_MAX_STAGE_ID`), 1 por vez a partir dali; Perdido sempre disponível
- **Campos obrigatórios** — bloco `padding:16px`, raio 8, fundo `--surface-2`, **borda esquerda 3px `#CC8C1D`**. Cabeçalho "OBRIGATÓRIO EM `{ETAPA}`" 12/16/0.5 peso 700 uppercase `--text-muted`. Campos em `grid-template-columns:1fr 1fr` gap 16 (`span 2` para textarea): rótulo 12/16/0.5 peso 600 `--text-muted`, caixa altura 40, `padding:0 16px`, raio 8, borda 1px `--stroke-strong`, placeholder 14/20/0.25 `--text-disabled`, `expand_more` 20px `--text-faint` nos selects
  - Os campos e suas máscaras (`cep`, `cnpj`, `currency`, `date`, `boolean`, `select` multi) vêm de `STAGE_FIELDS_BY_ID` em `src/constants/stages.ts` — **sem mudança de lógica**, só de forma. Duas colunas em vez de uma é o ganho: Ag. Pagamento tem 13 campos e hoje é uma coluna rolando
- **Rodapé** (`padding:24px`, borda superior 1px `--border`, `justify-content:flex-end`, gap 8): "Cancelar" (Medium — altura 32, raio 8, borda 1px `--stroke-default`) e "Confirmar mudança" (Large filled `#C8131B`)

### 13. Agendar (modal)

Card **640px**, mesma casca do modal de etapa.

- Topo: "Agendar · `{lead}`" 18/24 peso 600; sublinha "Cria Meeting no HubSpot e evento no Google Calendar" 12/16/0.4
- Corpo em **duas colunas** (`1fr 1fr`, gap 24):
  - **Esquerda**: segmented Demo / Follow up (altura 40, raio 12 nas pontas, ativo `#C8131B`); select de duração (altura 40, raio 8, borda 1px `--stroke-strong`, `expand_more`); textarea de observações — **altura 120** (o default desktop do kit para Text Field), `padding:12px 16px`, raio 8
  - **Direita — Calendar popup do kit**, borda 1px `--border`, raio 8:
    - Cabeçalho `padding:12px 16px`, borda inferior 1px `--border`: setas e "Agosto 2026" em **Poppins Bold 16 `#C8131B`** (o kit manda o mês/ano e as setas na cor primária)
    - Dias da semana: Poppins Bold 14 — domingo em `--text-faint`, resto em `--text-muted`
    - Células de dia: Poppins Medium 14, altura 36, tabular-nums. Fora do mês `--text-disabled`. **Selecionada: círculo (raio 50%) fundo `#C8131B` texto branco.** Em intervalo: retângulo sem raio; bordas do intervalo: círculo
    - Horários: chips altura 32, `padding:0 12px`, raio 8, borda 1px; selecionado fundo `--tint-red`, borda `#C8131B`, texto `--tint-red-text`
- Rodapé: "Cancelar" (Medium outline) + "Agendar demo" (Large filled `#C8131B`)

### 14. Cadastro de lead + CEP (modal)

Card **720px**.

- **Topo**: título "Novo lead" 18/24 peso 600 + X. Stepper `margin-top:16px`: número em pill 24px (12/24/0.5 peso 700) + rótulo 12/16/0.5 peso 600, separados por régua 24×2px `--border`. Ativo: pill `#C8131B`/branco, rótulo `--text`. Inativo: pill `--surface-3`/`--text-faint`, rótulo `--text-faint`. Passos: **CEP e endereço · Restaurante · Pin no mapa**
- **Corpo** `padding:24px`, `grid-template-columns:1fr 1fr`, gap `16px 24px`. Campo: rótulo 14/20/0.1 peso 600 `--text-muted`; caixa altura 40 raio 8 borda 1px `--stroke-strong`; info abaixo 12/16/0.4 `--text-faint` (`margin-top:4px`)
  - `CEP` (span 1, ícone `search`, info "Busca endereço e coordenada automaticamente") · `Número` (span 1) · `Restaurante` (**span 2**) · `Contato` · `Telefone` · `Origem do lead` (select) · `Etapa inicial` (select)
  - **Mapa de ajuste do pin** — `span 2`, altura 200, raio 8, borda 1px `--border`. Pin fixo no **centro do mapa**, não da tela (o repo já calcula isso com `mapLayout`; manter). Caixa de status `left:16px; bottom:16px`, `padding:8px 12px`, raio 8, fundo `--surface`, `shadow/02`: "Arraste o mapa para ajustar o pin" (12/16/0.5 peso 600 `--text-muted`) + coordenada tabular-nums 11/16/0.5 `--text-faint`
  - No desktop os três passos cabem numa tela só — o stepper marca progresso de preenchimento, não navegação obrigatória. `src/screens/CEPStep.tsx` continua sendo o fluxo do mobile
- **Rodapé** (`space-between`): "Cancelar" (Text button — altura 32, sem borda, `--text-muted`) e "Cadastrar e sincronizar" (Large filled `#C8131B`)

---

## Interactions & Behavior

### Navegação
- Item da sidebar troca `tab` — a mesma máquina de estado atual (`const [tab, setTab] = useState<AppTab>('map')`), com `'meu'` e `'gestor'` inalterados
- Hover na sidebar expande de 72 para 240px; sair colapsa. **Não** persistir o estado expandido: é hover, não toggle
- `⌘K` / `Ctrl+K` foca a busca global do header
- `Esc` fecha drawer e modais, na ordem inversa de abertura
- Ao trocar de aba, focar o título da view (`tabindex="-1"`) para leitores de tela, e suprimir o outline **só nesse caso** (`[tabindex="-1"]:focus { outline:none }`) — senão o browser pinta um anel em todos os títulos

### Transições
- Sidebar: `width .16s cubic-bezier(.2,.7,.3,1)`; rótulos `opacity .16s`
- Hover de linha, card e chip: `.14s`–`.16s` na mesma curva
- Drawer: 220ms ease-out (slide + fade do overlay)
- Toggle do heatmap: `all .16s`

### Hover
| Elemento | Hover |
|---|---|
Linha de tabela / lista | fundo `--surface-2` |
Item da sidebar | fundo `--surface-2` |
Card de kanban | `border-color: --stroke-strong` |
Botão filled `#C8131B` | `#94090F` |
Botão outline | fundo `--tint-red` (variantes de marca) ou `--surface-2` (neutras) |
Text button | fundo `--surface-2` |

`cursor:pointer` **só** em elemento acionável.

### Estados de carregamento
- Tabela e lista: skeleton com fundo `--surface-3` e raio 4 nas dimensões da linha real (o kit usa `stroke/default` / `neutral/200` para skeleton)
- Busca global: spinner ao lado do ícone enquanto a query do servidor corre — **a busca varre a base inteira**, não só a área carregada; sem o indicador o vendedor conclui que o lead não existe
- Mapa: pill de status no topo ("Aproxime para carregar os clientes desta região" / "Carregando esta região…") — comportamento atual, mantido, `pointerEvents:none`
- Botões: `shadow/02` + spinner, fundo inalterado (regra do kit: Loading mantém o fill de Rest)

### Estados vazios
Ícone 40px `--text-faint`, `margin-bottom:12px`, mensagem 14/20/0.25 `--text-muted` centralizada. Copy atual mantida: "Nenhum cliente encontrado com esses filtros." / "Nenhum `{status}` encontrado".

### Otimismo
Checkboxes e conclusão de tarefa pintam na hora, persistem em seguida, revertem se falhar.

### Responsive behavior

Os degraus vivem em `src/hooks/useLayout.ts`. **Este redesign altera o hook**: hoje `ehDesktop` é `width >= 1024` e devolve `colunas: 3` para os cards. Passa a ser:

| Faixa | Superfície |
|---|---|
< 768 | mobile PWA, layout atual (bottom nav) — fora deste handoff |
768 – 1023 | tablet: sidebar sempre colapsada (72px, sem hover), tabela reduz para Restaurante · Etapa · Cidade · chevron; drawer vira 100% da largura |
≥ 1024 | desktop: piso do grid de 12 colunas. Sidebar com hover, tabela completa, drawer 480px |
≥ 1440 | referência de projeto. `max-width:1600px` no conteúdo de Lista/Gestor, 1200px em Meu desempenho |

**Alvo de toque** (`components.md`): 48px em mobile/tablet, **40px no desktop** — o `alvo: ehDesktop ? 40 : 48` já existente continua correto. Botão Medium (32px) só em ação secundária de modal e ação de linha, nunca como alvo primário.

Grids de tabela usam `minmax()` para degradar sem quebrar.

## State Management

Nenhum estado de dados novo. O que muda é estado de UI:

| Variável | Tipo | Gatilho |
|---|---|---|
`tab` | `AppTab` | item da sidebar (já existe) |
`railExpanded` | `boolean` | `onMouseEnter`/`onMouseLeave` da sidebar (**novo**, local à sidebar) |
`selectedClient` | `Client \| null` | linha da tabela, linha da lista do mapa, pin (já existe) |
`changingStageFor` / `schedulingFor` / `showCepStep` | já existem | — |
`statusFilter` / `stageFilter` / `stateFilter` / `tempFilter` / `visitFilter` / `searchQuery` | já existem | segmented, chips, modal de filtros, busca do header |
`sortColumn` / `sortDir` | `string` / `'asc'\|'desc'` | clique no cabeçalho da tabela (**novo**) |
`page` | `number` | paginação (**novo** — hoje é `FlatList` infinito) |
`heatOn` / `heatVendor` | já existem | toggle do painel do mapa |
`weekStart` | `Date` | setas da agenda (**novo** — a agenda atual é lista cronológica única) |

Dados: `useClients`, `useMeetings`, `useClientTasks`, `useFieldOps`, `useGestorMetrics`, `useVisitsHeatmap`, `useRouteHistory`, `useSellerGoals`, `useMinhaDaily` — todos inalterados. O carregamento por área visível do mapa (`renderBounds`, `mapRegion`, `showOnlyMyArea`) continua como está.

## Assets

| Asset | Origem | Uso |
|---|---|---|
`takeat-icon.svg` | `takeat-design/UIKIT@main:assets/` | marca na sidebar (28px) |
`takeat-icon-white.svg` | idem | logo dentro do pin do mapa (20px) |
`takeat-logo-white.svg` | idem | logo no painel de login |
`assets/pin-logo.png` | já no repo | logo branco do pin em produção — **usar este**, não o SVG |

**Ícones**: os protótipos usam Material Symbols Rounded porque `components.md` referencia nomes Material. **Em produção, usar os ícones oficiais** já importados em `src/components/icons.tsx`:

| Protótipo (Material) | Produção (UI Kit) |
|---|---|
`location_on` | `IconLocation` / `IconLocationFilled` |
`format_list_bulleted` | `IconSquareMenu` |
`directions_car` | `IconCar` |
`calendar_month`, `event` | `IconCalendar` |
`assignment_turned_in` | `IconClipboardCheck` |
`insights`, `trending_up`, `bar_chart` | `IconTrendingUp` / `IconBarGraph` |
`person` | `IconUser` |
`search` | `IconSearch` |
`filter_list` | `IconFilterList` |
`download` | `IconDownload` |
`add` | `IconPlus` |
`close` | `IconClose` |
`check` | `IconCheck` |
`chevron_left` / `chevron_right` | `IconArrowBack` / `IconArrowFoward` |
`mail` / `lock` | `IconMail` / `IconLock` |
`settings` | `IconSettings` |
`schedule` | `IconClock` |
`where_to_vote` | `IconLocationFilled` |
`edit_note` | `IconPencil` |
`notifications`, `layers`, `my_location`, `navigation`, `route`, `drag_indicator`, `more_horiz`, `expand_more`, `phone_in_talk`, `login`/`logout`, `visibility`, `storefront` | **não existem em `icons.tsx`** — adicionar do pacote se houver equivalente, ou combinar os existentes (`IconCall` para telefone, `IconEye` para visibilidade, `IconStore` para storefront, `IconArrowDown` para expand, `IconRefresh`/`IconCached` para recarregar) |

Ícones recebem cor por **prop `fill`**, onde `var(--token)` não resolve — usar `useIconColors()`, que já existe e lê o tema em JS.

**Especificações do kit**: ícone escala com o botão — Small 16 · Medium 20 · Large 24 · Mobile 24. Icon-only é sempre quadrado e exige `aria-label`.

## Acessibilidade

- Contraste: `#C8131B` sobre `--bg` dá ~3:1 — suficiente para ícone, texto grande e chrome, **não para corpo**. Texto vermelho em tamanho de parágrafo usa `#94090F` (`--tint-red-text`). No dark, o vermelho da marca dá 2.64 sobre a superfície escura: usar `#E5A1A4` (`--brand-text`)
- `line-height >= 1.25` em títulos e bolds — sem isso a segunda linha pinta por cima ou é clipada
- `aria-label` em todo `<input>`, `<select>` e botão só com ícone
- Drawer/modal: `role="dialog"`, `aria-modal="true"`, `aria-label`
- Tabela: `<th scope="col">` no cabeçalho; ordenação anuncia `aria-sort`
- Foco `2px solid #016999` com `outline-offset: 2px` em tudo que é interativo

## O que este redesign remove

Para a implementação não recriar por hábito:

- **Header vermelho** de altura 52 com logo + nome do vendedor + engrenagem + "Sair" (`styles.header`). No desktop o header é neutro; o vermelho vira o CTA. Identidade e logout mudam para o rodapé da sidebar
- **FAB flutuante** de 56px (`styles.fab`). Virou o CTA "Novo lead" no header
- **Rótulos de nav de 8px** (`navItemTextDesktop`). A sidebar expandida resolve o problema que o 8px tentava resolver
- **Busca e chips full-bleed** acima do conteúdo. A busca é global no header; os filtros ficam no painel de trabalho da tela
- **Legenda de temperatura em duas colunas** sobre o mapa (`tempLegend`, `width:104` por linha). Virou barra horizontal com wrap
- **Cards de lead em três colunas** com teto de 1320px na aba Lista (`colunasDaLista`, `larguraMaxima`). Virou tabela. O card continua no mobile

## Files

| Arquivo | O que é |
|---|---|
`Field Sales - Desktop.dc.html` | **o design** — as 8 telas + drawer + 3 modais, claro e escuro, navegáveis pela sidebar |
`Atual - Recriação.dc.html` | recriação fiel do estado atual (desktop e mobile), para comparação |
`support.js` | runtime dos protótipos — **não é código de produção** |
`assets/*.svg` | marcas oficiais do UI Kit |
`screenshots/*.png` | capturas de referência (ver abaixo) |

### Screenshots

Capturados a ~914px de largura — abaixo do piso de 1024px do grid, então a tabela de leads e a legenda do mapa aparecem cortadas à direita e o drawer/modais mais altos que a viewport aparecem clipados. **A fonte da verdade é o HTML**, que responde à largura real; os PNGs servem para reconhecer a tela e conferir cor, peso e hierarquia.

| Arquivo | Tela |
|---|---|
`01-mapa.png` | Mapa comercial — painel de 352px + mapa, legenda com wrap |
`02-lista.png` | Leads em tabela — chips, filtros, exportação, paginação |
`03-rota.png` | Rota do dia — mapa + rail de 420px com paradas |
`04-agenda.png` | Agenda — calendário de 7 colunas, hoje destacado |
`05-tarefas.png` | Tarefas — kanban Atrasadas / Hoje / Próximas |
`06-gestor.png` | Painel do gestor — KPIs, funil 8+4, heatmap, tabela do time |
`07-meu-desempenho.png` | Meu desempenho — banner de meta vermelho + KPIs |
`08-login.png` | Login — split panel, fora do shell |
`09-drawer-ficha-do-lead.png` | Drawer de 480px — uso do produto, dados, timeline, check-in |
`10-modal-mudanca-de-etapa.png` | Modal de 560px — radios de etapa + campos obrigatórios |
`11-modal-agendar.png` | Modal de 640px — tipo/duração/obs + calendar popup do kit |
`12-modal-cadastro-cep.png` | Modal de 720px — campos em 2 colunas + ajuste do pin |
`17-gestor.png` | Painel do gestor — composição da base, atividade e rail |
`18-gestor-ranking.png` | Painel do gestor — a tabela de vendedores |
`13-configuracoes-conta-senha.png` | Configurações — seções Conta e Senha |
`14-configuracoes-aparencia-gestor.png` | Configurações — Aparência e Área do gestor |
`15-configuracoes-admin-sobre.png` | Configurações — Administração e Sobre |
`16-dark-configuracoes.png` | Configurações no escuro |
`13-dark-mapa.png` | Mapa no escuro |
`14-dark-lista.png` | Tabela no escuro — badges de etapa caem para `--surface-2` |
`15-dark-gestor.png` | Painel do gestor no escuro |
`16-dark-tarefas.png` | Kanban no escuro |

Abrir `Field Sales - Desktop.dc.html` primeiro. A sidebar navega entre as telas; "Login" está lá para inspeção e o botão "Entrar" volta ao app. O item de tema no rodapé da sidebar alterna claro/escuro — **conferir as duas versões de cada tela**.

## Fontes do design system

- `takeat-design/UIKIT@main` — `foundations.md` (cores semânticas e famílias, tipografia Poppins, spacing 8pt, grids, radius, sombras) e `components.md` (Buttons, Input, Dropdown, Calendar)
- `rpatakeat-coder/PWA-app-outbound@main` — `App.tsx`, `public/index.html`, `src/theme.ts`, `src/hooks/useLayout.ts`, `src/constants/stages.ts`, `src/components/icons.tsx`, `src/screens/*`
- `github.md` na raiz do projeto de design tem o mapa completo tela → arquivos do repo
