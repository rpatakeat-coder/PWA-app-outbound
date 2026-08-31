# M0 — Base (prompt único)

**Arquivos:** `public/index.html` · `src/hooks/useLayout.ts` · `src/components/icons.tsx` · busca no repo
**Referência visual:** `design_handoff_mobile_pwa/Field Sales - Mobile PWA.dc.html`
**Escopo:** fundação. Nenhuma tela muda de layout aqui. É o que faz as próximas onze tarefas terem token para usar.

> Substitui `01a-tokens.md`, `01b-contraste-escuro.md` e `01c-fonte-e-alvos.md` — leia só este.
>
> Tarefa única. Não redesenhe nenhuma tela. Se encontrar algo errado fora do escopo, **anote e siga**.

---

## Contexto do ambiente (não mexer)

React 19 + react-native-web sob Expo SDK 54, `@tanstack/react-query`, hooks em `src/hooks/`, telas em `src/screens/`, tokens CSS em `public/index.html`, mapa em `src/map/`. Não introduza framework, não troque o mecanismo de tema (`src/theme.ts` escreve `data-theme` no `<html>`), não toque no service worker, no `useForceReload`, no `scripts/build-web.js` nem no `vercel.json`.

**Tokens mobile ≠ desktop.** Input 48px raio **16** · botão 48px raio 12 tipo 16/600 · card raio **16** · maior tipo Title Medium **18/24** · spacing só até **24** · alvo **48px**. O pacote desktop usa outros valores; não copie de lá.

---

## 1 · Três tokens que faltam

Só o bloco `<style id="takeat-theme">` do `public/index.html`.

Adicionar ao `:root` claro:

```
--stroke-default: #C6C6C6;
--stroke-strong:  #7A7A7A;
--text-disabled:  #C6C6C6;
```

Declarar os pares escuros:

```
--d-stroke-default: rgba(255,255,255,.14);
--d-stroke-strong:  rgba(255,255,255,.24);
--d-text-disabled:  rgba(255,255,255,.28);
```

E apontar os três nos **dois** seletores de tema escuro — o `@media (prefers-color-scheme: dark)` **e** o `:root[data-theme='dark']`. Faltar num dos dois é o bug clássico: funciona no aparelho do dev e quebra na escolha manual.

**Não** renomeie nem remova token existente. **Não** mexa no `<style id="expo-reset">` — é ele que resolve `100dvh` e a área segura.

Para referência, os tokens semânticos que já existem e devem ser usados no lugar de hex cru:

| Papel | Variável | Light | Dark |
|---|---|---|---|
Fundo | `--bg` | `#F6F6F6` | `#121212` |
Superfície | `--surface` | `#FFFFFF` | `#1E1E1E` |
Aninhada | `--surface-2` | `#F6F6F6` | `#262626` |
Preenchimento | `--surface-3` | `#EDEDED` | `#2A2A2A` |
Texto | `--text` | `#222222` | `rgba(255,255,255,.92)` |
Secundário | `--text-muted` | `#545454` | `rgba(255,255,255,.64)` |
Terciário | `--text-faint` | `#7A7A7A` | `rgba(255,255,255,.42)` |
Borda sutil | `--border` | `#EDEDED` | `rgba(255,255,255,.08)` |

---

## 2 · Contraste no modo escuro

`#94090F` (red/dark) e `#167532` (green/dark) dão ~2,6:1 sobre `#121212`/`#1E1E1E` — reprovam. Buscar no repo por **`#94090F`, `#167532`, `#1D9688`, `#018CCC`** e, para cada ocorrência, **classificar antes de mudar**:

- **(a) cor de texto ou ícone sobre superfície do tema** → trocar pelo token: `--tint-red-text`, `--tint-green-text`, `--info-text`. Onde aparece: prazo vencido de tarefa, delta negativo de KPI, "última visita > 30 dias", valores positivos, texto de exportação.
- **(b) texto sobre fundo tonal claro** (`#FAE8E9`, `#FFF8EB`, `#EAF7EE`) → **deixar como está**. Esses fundos são superfícies próprias, não herdam o tema; o texto escuro segue legível nos dois modos.
- **(c) fundo ou régua decorativa** → caso a caso.

Confirmar que o bloco escuro tem: `--tint-red-text: #E5A1A4` · `--tint-green-text: #77BD8B` · `--info-text: #66CFFF` · `--brand-text: #E5A1A4`. E que `#1D9688 → #5FD3C6` no escuro, onde for texto.

**Caso concreto que já custou retrabalho:** a régua esquerda do card de tarefa usava a mesma variável do texto do badge de SLA. **São duas variáveis, não uma.** O badge tem fundo tonal claro (texto fica `#94090F` / `#99670F` sempre); a régua fica sobre `--surface` e no escuro precisa do par claro — `#E5A1A4` para D5, `#FFD894` para D2. Com uma variável só, a régua vira vinho sobre quase-preto e desaparece.

`#C8131B` como **texto** no escuro também reprova (2,64:1) — usar `--brand-text`. Sobre `--bg` claro dá ~3:1: serve para ícone, texto grande e chrome, **não para corpo**.

**Não troque as cores de temperatura do funil** (`TEMP_COLORS` em `src/constants/stages.ts`): `hot #C8131B` · `warm #FFB32F` · `cold #0ea5e9` · `won #16a34a` · `lost #475569` · Conta Alvo `#7c3aed`. São literais e não invertem no escuro.

---

## 3 · Poppins 700

No `<link>` do Google Fonts em `public/index.html`: `wght@400;500;600;800` → `wght@400;500;600;700;800`. O peso 700 é usado em aba ativa, número de KPI, índice de parada e kicker.

---

## 4 · Alvos de toque — conferir, não mexer

`src/hooks/useLayout.ts` devolve `alvo: ehDesktop ? 40 : 48`. **Está correto** — confirmar e deixar. `styles.navItem` tem `minHeight: 48` — também correto.

Varrer o app por controles com altura efetiva abaixo de 48px no mobile e **listar sem corrigir**. A correção acontece na tarefa de cada tela; corrigir aqui espalha diff por doze arquivos.

---

## 5 · Ícones que faltam

`src/components/icons.tsx` é a fonte de verdade em produção (os protótipos usam Material Symbols só porque o kit referencia nomes Material). Tradução:

| Protótipo | Produção |
|---|---|
`location_on` / `my_location` / `where_to_vote` | `IconLocation` / `IconLocationFilled` |
`format_list_bulleted` | `IconSquareMenu` |
`directions_car` | `IconCar` |
`calendar_month` / `event` | `IconCalendar` |
`assignment_turned_in` | `IconClipboardCheck` |
`insights` / `trending_up` | `IconTrendingUp` / `IconBarGraph` |
`person` | `IconUser` · `search` → `IconSearch` · `add` → `IconPlus` |
`close` / `check` | `IconClose` / `IconCheck` |
`arrow_back` / `chevron_left` | `IconArrowBack` · `chevron_right` → `IconArrowFoward` |
`mail` / `lock` | `IconMail` / `IconLock` |
`settings` / `schedule` / `download` | `IconSettings` / `IconClock` / `IconDownload` |
`call` / `phone_in_talk` | `IconCall` · `visibility` → `IconEye` · `edit_note` → `IconPencil` |

**Não existem em `icons.tsx`**: `near_me`, `navigation`, `expand_more`, `drag_indicator`, `layers`, `logout`, `notifications`. Adicionar do pacote oficial se houver equivalente (`IconArrowDown` serve para expand, `IconArrowFoward` para navegação). **Se não houver, liste quais faltam e pare** — não desenhe SVG novo por conta própria.

Ícones recebem cor por **prop `fill`**, onde `var(--token)` não resolve — usar o `useIconColors()`, que já existe e lê o tema em JS. Escala mobile: **24px** em botão e aba · 20px em ícone de input · 16px em metadado inline.

---

## Pronto quando

- [ ] os três tokens novos resolvem nos **dois** temas, e os **dois** seletores escuros os listam
- [ ] cada ocorrência dos quatro hexes foi listada com a classificação (a/b/c)
- [ ] nenhum dos quatro sobrou como cor de texto sobre superfície do tema
- [ ] badge e régua do card de tarefa usam variáveis **diferentes**
- [ ] Poppins 700 carrega
- [ ] `useLayout.ts` **não** mudou
- [ ] lista de controles abaixo de 48px entregue
- [ ] lista de ícones ausentes entregue
- [ ] `npm run typecheck` limpo

## Ao terminar

Três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o token, o ícone ou o arquivo que falta**.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
