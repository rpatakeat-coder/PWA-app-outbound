# M1b — Casca do painel: drawer e bottom sheet

**Arquivo:** `App.tsx` · **Escopo:** só o container e o comportamento de abrir/fechar

> Leia o `M1a` primeiro. Nada de conteúdo interno neste prompt — só a caixa e o comportamento.

---

## Tokens (não precisa abrir outro arquivo)

**Mobile ≠ desktop.** Copiar valor de uma plataforma para a outra é o erro mais provável aqui.

| | Mobile (< 1024px) | Desktop (≥ 1024px) |
|---|---|---|
Forma do painel | bottom sheet, `max-height:92%` | drawer 480px à direita |
Raio do painel | `16px 16px 0 0` | 0 — encosta na borda |
Padding das faixas | 16 | 24 |
Botão | 48px, raio 12, tipo 16/24/0.15 peso 600 | 40px, raio 12, tipo 14/20/0.1 peso 600 |
Card interno | raio 16 | raio 8 |
Input | 48px, raio 16, texto 16/24/0.5 | 40px, raio 8, texto 14/20/0.25 |
Alvo tocável | **48px** | 40px |
Rótulo de botão | centralizado (largura = rótulo) | **flush-left** |
Overlay | `rgba(0,0,0,.4)` | `rgba(0,0,0,.32)` |
Spacing disponível | até 24 | até 40 |

**Cores** — as variáveis já existem em `public/index.html`:

| Papel | Variável | Light | Dark |
|---|---|---|---|
Card / painel | `--surface` | `#FFFFFF` | `#1E1E1E` |
Container aninhado | `--surface-2` | `#F6F6F6` | `#262626` |
Texto primário | `--text` | `#222222` | `rgba(255,255,255,.92)` |
Texto secundário | `--text-muted` | `#545454` | `rgba(255,255,255,.64)` |
Texto terciário, rótulos | `--text-faint` | `#7A7A7A` | `rgba(255,255,255,.42)` |
Divisor, borda de card | `--border` | `#EDEDED` | `rgba(255,255,255,.08)` |
Borda de botão outline | `--stroke-default` | `#C6C6C6` | `rgba(255,255,255,.14)` |
Marca, CTA | — | `#C8131B` | `#C8131B` |
Hover do CTA | — | `#94090F` | `#94090F` |
Texto vermelho legível | `--tint-red-text` | `#94090F` | `#E5A1A4` |
Fundo tonal vermelho | `--tint-red` | `#FAE8E9` | `#3A1416` |
Texto verde legível | `--tint-green-text` | `#167532` | `#77BD8B` |
Confirmação (check-in) | — | `#27A84C` | `#27A84C` |
Atenção (semáforo âmbar) | — | `#FFB32F` | `#FFB32F` |
Link | — | `#018CCC` | `#66CFFF` |

**Temperatura do funil** — literais de `TEMP_COLORS`, **não invertem no escuro**:
`hot #C8131B` · `warm #FFB32F` · `cold #0ea5e9` · `won #16a34a` · `lost #475569` · Conta Alvo `#7c3aed`

**Tipografia** — Poppins, formato `tamanho/altura/letter-spacing`:
Label Small 11/16/0.5 · Body Small 12/16/0.4 · Label Medium 12/16/0.5 · Body Medium 14/20/0.25 · Label Large 14/20/0.1 · Body Large 16/24/0.5 · Title Small 16/24/0.15 · Title Medium 18/24/0.
No mobile o maior tipo é **Title Medium 18/24** — não use Title Large nem Heading.
Números com `font-variant-numeric: tabular-nums`; moeda e milhares em pt-BR.

**Raio**: 4 (badge, tag) · 8 (card no desktop) · 12 (botão) · 16 (card e input no mobile, topo da folha) · pill (avatar, dot).
**Sombras**: `shadow/01` `0 1px 2px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` · drawer `-8px 0 16px rgba(0,0,0,.14)` · bottom sheet `0 -4px 16px rgba(0,0,0,.14)`.
**Foco**: `outline: 2px solid #016999; outline-offset: 2px`.

> `#94090F` e `#167532` dão ~2,6:1 sobre superfície escura — **nunca como cor de texto**; use `--tint-red-text` / `--tint-green-text`. Exceção: texto sobre fundo tonal claro (`#FAE8E9`, `#FFF8EB`, `#EAF7EE`, `#FFF1E0`, `#F1EBFE`), que são superfícies próprias e não mudam com o tema.

## O que construir

**Um único componente**, com a forma decidida por `layout.ehDesktop`. **Não crie duas implementações.**

### Desktop (≥ 1024px) — drawer

- Overlay: `position:fixed; inset:0`, `background:rgba(0,0,0,.32)`, `z-index:60`.
- Painel: `width:480px`, encostado à direita, `height:100vh`, fundo `--surface`, sombra `-8px 0 16px rgba(0,0,0,.14)`. **Sem raio** — encosta na borda da janela.
- Coluna flex de três faixas: topo (`flex:0 0 auto`), corpo (`flex:1; overflow-y:auto`), rodapé (`flex:0 0 auto`).
- Entrada: slide da direita, 220ms ease-out, com fade do overlay.

### Mobile (< 1024px) — bottom sheet

- Overlay `rgba(0,0,0,.4)`.
- Folha ancorada no rodapé: `max-height:92%`, raio `16px 16px 0 0`, fundo `--surface`, largura total.
- Mesmas três faixas.
- Entrada: slide de baixo, 220ms ease-out.
- **Handle** 36×4 raio 2 `--stroke-default`, centralizado no topo.

## Fechamento

Nas quatro formas:

1. **X** no topo
2. **Toque/clique no overlay**
3. **`Esc`** (desktop) — `keydown` no `document`, removido no unmount
4. **Voltar do sistema** (mobile) — Android back e gesto do iOS. Se não há histórico por overlay, empurre um estado ao abrir e trate o `popstate`

No mobile, também no **arraste para baixo** com velocidade mínima.

## Acessibilidade

`role="dialog"`, `aria-modal="true"`, `aria-label` com o nome do lead. Foco vai para o painel ao abrir e volta ao elemento que o abriu ao fechar. `:focus-visible` com `outline: 2px solid #016999; outline-offset: 2px`.

## Um único padrão de painel

Avisos, configuração de rota, ficha do lead, perfil e os drill-downs do gestor usam **esta mesma casca**. Se o projeto ainda não tem um componente reutilizável, **crie agora** (`src/components/Panel.tsx` ou equivalente) e use aqui — os outros prompts vão consumi-lo.

## Não fazer

- Não crie duas implementações por plataforma.
- Não coloque conteúdo ainda.
- Não use `position:absolute` dentro de container com scroll — o overlay cobre a viewport.

## Pronto quando

- [ ] drawer de 480px à direita em 1440px; bottom sheet em 390px
- [ ] fecha nas quatro formas (testar uma por uma)
- [ ] no mobile fecha também no arraste para baixo
- [ ] `role`, `aria-modal`, `aria-label` presentes
- [ ] foco entra e volta
- [ ] um componente só, forma decidida por `layout.ehDesktop`
- [ ] `npm run typecheck` limpo

## Ao terminar

Três linhas: o que mudou, o que ficou fora do escopo, e o que da especificação não deu para aplicar.
