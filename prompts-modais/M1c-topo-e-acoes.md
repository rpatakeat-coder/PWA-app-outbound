# M1c — Topo do painel e as ações

**Arquivo:** `App.tsx` · **Escopo:** só a faixa de topo

> Leia o `M1a` e rode o `M1b` antes.

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

## Estrutura

Faixa com borda inferior 1px `--border`. Padding **24** no desktop, **12px 16px 16px** no mobile (o extra embaixo compensa o handle).

**Linha de identificação** (`display:flex; align-items:flex-start; justify-content:space-between; gap:16px`):

Bloco de texto à esquerda, `min-width:0`:
- **Kicker**: dot da temperatura + "`{TEMPERATURA}` · `{n}`ª VISITA" em 11/16/0.5 peso 600 `--text-faint`, **uppercase**. Dot 10px no desktop, 8px no mobile, na cor de `TEMP_COLORS` (via `stageTemperature`). Sem visita registrada: só a temperatura, sem "· 0ª VISITA".
- **Nome**: `empresa || nome` em 18/24 peso 600 `--text`, truncado com ellipsis.
- **Sublinha**: "`{contato}` · `{telefone}`" em 12/16/0.4 `--text-faint`. Telefone formatado; sem contato, só o telefone.

**Botão X** à direita, `flex:0 0 auto`: 40×40 raio 8 no desktop (transparente, hover `--surface-2`); 48×48 raio 12 fundo `--surface-2` no mobile. Ícone `close` 24px. `aria-label="Fechar"`.

## As ações

`margin-top:16px`, `display:flex; gap:8px`.

### Desktop — três botões

| Botão | Estilo | Ícone |
|---|---|---|
Mudar etapa | Large **filled** `#C8131B`, hover `#94090F`, `flex:1` | `trending_up` 24px |
Agendar | Large **outline** `#C8131B`, hover fundo `--tint-red`, `flex:1` | `event` 24px |
Mais | 40×40, raio 12, borda 1px `--stroke-default` | `more_horiz` 24px, `aria-label="Mais ações"` |

Altura 40, `padding:0 16px`, tipo 14/20/0.1 peso 600, gap 8 entre ícone e rótulo. **Rótulo flush-left** (`justify-content:flex-start`) — regra do kit: botão mais largo que o rótulo começa o texto na borda de padding.

### Mobile — duas ações em grade

`display:grid; grid-template-columns:1fr 1fr; gap:8px`. Altura **48**, raio 12, tipo 16/24/0.15 peso 600, centralizado (aqui o botão tem a largura do rótulo, então centralizar é correto).

- "Etapa" — filled `#C8131B`, ícone `trending_up`
- "Agendar" — outline `#C8131B`, ícone `event`

**Rótulos curtos de propósito**: em 390px "Mudar etapa" quebra em duas linhas dentro de um botão de meia largura.

O menu "Mais" no mobile vai para o fim do corpo, como lista de linhas de 56px (editar, editar localização, adicionar à rota, excluir) — não como popover.

## Ligações

- "Mudar etapa" abre o `ChangeStageModal` com o lead.
- "Agendar" abre o `ScheduleMeetingModal` com o lead.
- No mobile os dois **empilham** sobre este painel; voltar reabre este.
- "Mais": as ações que o `M1a` listou. **Nenhuma pode desaparecer.**

## Pronto quando

- [ ] kicker com dot de `TEMP_COLORS` e contagem de visitas
- [ ] nome truncado, sublinha com contato e telefone
- [ ] X com `aria-label`, 40px no desktop e 48px no mobile
- [ ] desktop: três ações com rótulo **flush-left**
- [ ] mobile: duas ações de 48px, rótulos curtos
- [ ] os dois overlays abrem e empilham no mobile
- [ ] nenhuma ação que existia desapareceu
- [ ] `npm run typecheck` limpo
