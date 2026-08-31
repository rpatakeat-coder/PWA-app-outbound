# M2 — Mapa / Lista (prompt único)

**Arquivo:** `App.tsx` — bloco `tab === 'map'` (~L4403–4790), busca e chips (~L4325–4400), `renderClientItem` (~L2604), a `FlatList` da lista (~L4791); estilos `map`/`tempLegend`/`mapButton`/`searchBar`/`filterChip`/`clientCard` (~L7359–7378, ~L7439–7470, ~L7536–7600, ~L7855).
**Referência visual:** `design_handoff_mobile_pwa/Field Sales - Mobile PWA.dc.html` + `screenshots/01-mapa.png`, `02-lista.png`, `14-dark-mapa.png`.
**Pergunta que a tela responde:** *qual é o próximo lead e como chego nele?*

> Substitui `04a`, `04b`, `04c`, `04d` e `04R-revisao.md` — leia só este.
> `M0-base-completo.md` e `M1-casca-completo.md` já rodaram: tokens no lugar, barra de 4 abas + FAB no lugar, reserva de 40px já aplicada nos scrolls.
>
> Tarefa única: **só esta tela**. Se encontrar algo errado em outra, anote e siga.

**Tokens mobile ≠ desktop.** Input 48px raio **16** · botão 48px raio 12 tipo 16/600 · card raio **16** · maior tipo Title Medium **18/24** · spacing só até **24** (única exceção: `padding-bottom: 40px` da reserva do FAB) · alvo **48px** · raios só `4 · 12 · 16 · pill`.

Números de linha são do handoff — **localize pelo nome do estilo ou da função**.

---

## 1 · Header: busca, avatar, segmented

`padding:12px 16px 8px`, fundo do tema (`#C8131B` claro / `--surface` escuro), coluna gap 12.

**Linha 1 — busca + avatar.** Campo `flex:1`, altura **48**, `padding:0 16px`, raio **16**, fundo `rgba(255,255,255,.18)`, ícone `IconSearch` 20px branco, placeholder 16/24/0.5 `rgba(255,255,255,.7)`. Avatar 48px pill ao lado (o do M1, que abre o perfil).

**Linha 2 — segmented Mapa / Lista.** Dois botões `flex:1`, altura 40, raio 12 **só nas pontas** (`12px 0 0 12px` / `0 12px 12px 0`), ícone 20px + rótulo 14/20/0.1 peso 600, conteúdo centralizado.
- Ativo: fundo `#fff`, texto `#C8131B` — no escuro fundo `#1E1E1E`.
- Inativo: fundo `rgba(255,255,255,.18)`, texto branco.

Ícones: `IconLocation` (Mapa) · `IconSquareMenu` (Lista).

**`vistaMapa` (`'mapa' | 'lista'`) é estado local desta tela, não uma aba da barra.** Lista deixou de ser destino porque é a mesma base de dados vista de outro jeito — se voltar a ser aba, o M1 se desfaz.

## 2 · Chips de temperatura

Faixa `padding:12px 16px`, fundo `--surface`, borda inferior 1px `--border`, `overflow-x:auto`, gap 8.

Chip: altura **36**, `padding:0 14px`, raio pill, borda 1px, dot 8px + rótulo 12/16/0.5 peso 600, `flex:0 0 auto`, `white-space:nowrap`.
- Ativo: fundo `--tint-red`, borda `#C8131B`, texto `--tint-red-text`.
- Inativo: fundo `--surface`, borda `--stroke-default`, texto `--text-muted`.

Seis chips: **Todos · Quente · Morno · Frio · Conta Alvo** (+ Fechado / Perdido conforme o filtro de status). Cores dos dots vêm de `TEMP_COLORS` (`hot #C8131B` · `warm #FFB32F` · `cold #0ea5e9` · `won #16a34a` · `lost #475569`) e `#7c3aed` para Conta Alvo — literais, não invertem no escuro.

**Exceção de alvo:** o chip tem 36px de altura por decisão do kit (faixa de filtro rolável, não ação primária). Se preferir 48 no alvo, ganhe pelo `padding` vertical do container, **sem** engordar o chip.

## 3 · Mapa

`flex:1`, `<MapView>` real de `src/map/`.

**Intactos:** clustering (`radius 50`, `minPoints 3`, `maxZoom 14`, `animationEnabled={false}`), o carregamento por área visível (`renderBounds`, `mapRegion`, `showOnlyMyArea`) e a pill de status no topo ("Aproxime para carregar os clientes desta região" / "Carregando esta região…", `pointerEvents:none`). Se um diff tocar nisso, é regressão.

**Pin:** 40×40 pill da cor da temperatura, borda 2.5px branca, sombra `0 4px 8px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`, logo branco 20px — **`assets/pin-logo.png`, o do repo**. Seta CSS: `border-left/right:7px transparent; border-top:9px {cor}`, `margin-top:-1px`.

**Botão de recentrar:** **48×48**, raio 16, `left:16px; top:16px`, fundo `--surface`, sombra 03, ícone 24px — `IconLocationFilled` + `#C8131B` quando está seguindo o vendedor, `IconLocation` + `--text-muted` quando a câmera está livre. **Foi para o topo**: no rodapé disputava espaço com a barra e o FAB.

**Remover a legenda de temperatura** (`styles.tempLegend`, duas colunas, linhas de 104px). Os chips no topo já ensinam as cores, e o mapa recupera um quarto da altura.

## 4 · Peek sheet do lead mais próximo

Ancorado no rodapé do mapa: `padding:16px 16px 40px`, raio `16px 16px 0 0`, fundo `--surface`, sombra `0 -4px 16px rgba(0,0,0,.14)`.

**Os 40px de `padding-bottom` não são decorativos** — são 16 + os 24px que o FAB invade acima da barra. Sem eles o círculo vermelho cai em cima do "Check-in".

Handle 36×4 raio 2 centralizado, `margin-bottom:12px`.

Linha do lead: barra de temperatura 4px `align-self:stretch; min-height:44px` + nome 16/24/0.15 peso 600 + sublinha `{etapa} · {dist} · {n}ª visita` 12/16/0.4 `--text-faint` + badge de temperatura à direita.

Ações, gap 8:
- **"Check-in"** — `flex:1`, altura 48, raio 12, fundo `#27A84C`, texto 16/24/0.15 peso 600 branco, ícone `IconLocationFilled` 24px
- `navigation` — 48×48 outline (`IconArrowFoward`)
- `call` — 48×48 outline (`IconCall`)

Arrastar para cima abre a ficha completa (`sheetExpandido`); para baixo colapsa.

## 5 · Vista Lista

Scroll `flex:1; overflow-y:auto`, `padding:16px 16px 40px` (a reserva do FAB), coluna gap 12.

**Card:** `padding:16px`, raio **16**, fundo `--surface`, borda 1px `--border`, **borda esquerda 4px da cor da temperatura**, sombra 01. A estrutura atual de `styles.clientCard` já é raio 16 / padding 16 / borda esquerda 4px — **está certa, não mexa**.

**O que muda é o conteúdo, e é aí que está o ganho da tela.**

Sai: `"Contato: …"`, `"Etapa: …"`, cidade e telefone em quatro linhas soltas (`clientCity`, `clientPhone`).

Entra:
- nome 16/24/0.15 peso 600, truncado com reticências
- sublinha `{etapa} · {cidade}` 12/16/0.4 `--text-faint`
- badge de temperatura no canto
- **linha de metadados** `margin-top:12px` gap 16: `near_me` + distância · `where_to_vote` + última visita (ícones 16px, texto 12/16/0.5 peso 600 `--text-faint`)

Distância e recência são o que decide a próxima visita — é por isso que substituem telefone e cidade repetida. Se `near_me` não existir em `icons.tsx`, use `IconLocationFilled`; a última visita usa `IconLocationFilled` também ou `IconClock`, o que já estiver em uso para recência. **Não desenhe SVG novo.**

**Tints do badge de temperatura** (fundo tonal claro, texto escuro — são superfícies próprias):

| Temperatura | bg | fg |
|---|---|---|
Quente | `#FAE8E9` | `#94090F` |
Morno | `#FFF8EB` | `#99670F` |
Frio | `#E6F7FF` | `#016999` |
Fechado | `#EAF7EE` | `#167532` |
Perdido | `#EDEDED` | `#545454` |

**No escuro** o badge cai para `--surface-2` com texto `--text` — tint claro no escuro é texto escuro sobre fundo escuro.

## 6 · Estados

- **Lista carregando:** skeleton com fundo `--surface-3` raio 4 nas dimensões do card real.
- **Busca:** spinner ao lado do ícone. A busca varre a base inteira no servidor, não só a área carregada — sem indicador o vendedor conclui que o lead não existe.
- **Vazio:** ícone 40px `--text-faint`, `margin-bottom:12px`, mensagem 14/20/0.25 `--text-muted` centralizada. **Copy atual mantida:** "Nenhum cliente encontrado com esses filtros."
- **Sem swipe destrutivo** no card de lead. Na rua, swipe acidental é regra.
- `keyboardDismissMode="on-drag"` na lista — já é o comportamento atual.

---

## Não fazer

- Não toque no clustering, no `animationEnabled={false}`, no carregamento por área visível nem na pill de status.
- Não recrie a legenda de temperatura.
- Não devolva Lista para a barra de abas.
- Não mexa em `TEMP_COLORS` nem em `src/constants/stages.ts`.
- Não mexa nos hooks (`useClients`, `useFieldOps`) nem crie estado de dados novo. O único estado novo é `vistaMapa` e `sheetExpandido`.
- Não desenhe ícone novo — se falta equivalente, liste e pare.

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Busca 48px raio 16 com fundo `rgba(255,255,255,.18)`; avatar 48px ao lado.
2. Segmented com raio 12 só nas pontas; ativo `#fff`/`#C8131B` (`#1E1E1E` no escuro).
3. O segmented é estado local, não aba da barra.
4. Chips de 36px roláveis; ativo `--tint-red`/`--tint-red-text`, inativo borda `--stroke-default`.
5. Pin 40×40, borda 2.5px branca, logo 20px do `pin-logo.png`, seta `border-top:9px`.
6. Recentrar 48×48 raio 16 em `left:16; top:16`, com os dois estados.
7. Legenda de temperatura sobre o mapa **removida**.
8. Clustering (`radius 50`, `minPoints 3`, `maxZoom 14`, `animationEnabled={false}`) intacto.
9. Carregamento por área visível e pill de status intactos.
10. Peek sheet `padding:16px 16px 40px`, handle 36×4, sombra para cima.
11. **O FAB não toca o "Check-in".**
12. Check-in `flex:1` altura 48 `#27A84C`; `navigation` e `call` 48×48.
13. Arraste para cima abre a ficha.
14. Card raio 16, padding 16, borda esquerda 4px da temperatura.
15. Card tem a linha de metadados com distância e última visita.
16. "Contato:", "Etapa:" e telefone **não** aparecem mais como linhas soltas.
17. Badge de temperatura com tint claro no claro e `--surface-2` no escuro.
18. Scroll da lista com `padding-bottom:40px`.
19. Skeleton, spinner de busca e estado vazio com a copy atual.
20. Nenhum hex fora dos literais permitidos; spacing ≤ 24 (+ a reserva de 40); raios só `4 · 12 · 16 · pill`; alvo ≥ 48 (com a exceção documentada do chip).
21. `npm run typecheck` limpo.

**Conferir em 390 × 844**, comparar com `01-mapa.png` e `02-lista.png`, **alternar o tema e repetir no escuro**.

## Ao terminar

Três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o campo, o ícone ou o estado que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
