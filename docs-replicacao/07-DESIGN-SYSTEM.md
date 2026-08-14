# 07 — Design system

Estética: **papel quente** (fundo bege, superfícies creme), um único bloco escuro por tela,
vermelho reservado a ação/seleção. Referência de largura: **desktop 1440px**.

## Tokens CSS (`:root` de `public/index.html`)

```css
:root{
  /* superfícies */
  --bg:#EFE9DC;        /* canvas da página */
  --panel:#FDFBF0;     /* superfície de card */
  --panel2:#FBF6EC;    /* superfície 2 / hover de linha */
  --sunk:#F3EDE0;      /* trilha de barra, hover de pill */

  /* texto */
  --ink:#1A1613;       /* título e corpo forte */
  --muted:#6E6558;     /* secundário */
  --muted2:#736857;    /* terciário */
  --ter:#A2937A;       /* quaternário */

  /* bordas */
  --line:#E4DBC6;      /* padrão */
  --line-soft:#F0E9D8; /* linhas de tabela */
  --line-btn:#D8CFBA;  /* botões outline */

  /* ação */
  --red:#E51A31; --red-dk:#C7142A; --red-soft:#FBEEF0;

  /* estado */
  --green:#1E7A63; --green-soft:#E9F4EF;
  --amber:#B0782A; --amber-soft:#FBF1DF;
  --amber-ink:#8A5D1F;   /* âmbar sobre --amber-soft: o par padrão dá 3.37:1, abaixo do AA */

  /* bloco escuro (banner/nav ativa) */
  --dark:#1A1613; --dark-ink:#FFFDF8; --dark-mut:#9C9284;
  --dark-fill:rgba(253,251,240,.07);

  /* informação */
  --violet:#7A6EF0; --blue:#2563EB; --pink:#D63C7D;

  /* sombras */
  --shadow:0 1px 3px rgba(26,22,19,.05);
  --shadow-lg:0 24px 56px -28px rgba(26,22,19,.55);

  /* raios */
  --r-sm:8px; --r-md:12px; --r-lg:18px; --r-xl:18px; --r-pill:999px;

  /* espaçamento (grid de 8) */
  --sp-1:4px; --sp-2:8px; --sp-3:16px; --sp-4:24px; --sp-5:32px; --sp-6:48px;

  /* ícones, foco, nav */
  --icon-sm:16px; --icon-md:20px; --icon-lg:24px;
  --focus-ring:0 0 0 3px rgba(37,99,235,.45);
  --nav-width:220px; --nav-width-compact:72px;

  /* curva de movimento única — todo hover tem a mesma sensação */
  --ease:cubic-bezier(.2,.7,.3,1);
}
```

### Cores das etapas do funil (fixas, não tokens)

| Etapa | Cor |
|---|---|
| Backlog | `#6B7280` |
| Prospecção | `#E8A33D` |
| Visita | `#4A7FC7` |
| Conversa com Decisor | `#7C6FE0` |
| Demo/Proposta | `#2FA88A` |
| Negociação | `#D9668F` |
| Ag. Pagamento | `#E51A31` |
| Fechado/Onboarding | `#1FA35C` |
| Perdido | `#8C1220` |
| Reciclagem | `#8B92A3` |

## Tipografia

- **Poppins** 600/700/800 — títulos e números. `letter-spacing: -.01em` em títulos grandes.
- **DM Sans** 400/500/700 — corpo.
- Números **sempre** com `font-variant-numeric: tabular-nums` (classes `.mono`, `.num`) —
  sem isso as colunas dançam a cada atualização.
- Escala: 9.5 · 10 · 10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 14 · 15px (UI) ·
  20–22px (títulos de banner) · 26–28px (KPIs) · 40–42px (hero).

## Sombras por contexto

| Contexto | Valor |
|---|---|
| Card | `0 1px 3px rgba(26,22,19,.05)` |
| Card de decisão | `0 4px 16px rgba(229,26,49,.1)` |
| CTA vermelho | `0 4px 14px rgba(229,26,49,.4)` |
| Drawer | `-18px 0 44px rgba(26,22,19,.3)` |
| Card de pessoa (hover) | `0 6px 18px rgba(229,26,49,.18)` |

## Acessibilidade — decisões documentadas no CSS

```css
:focus-visible { outline:none; box-shadow:var(--focus-ring); border-radius:var(--r-sm); }
[tabindex="-1"]:focus { outline:none; }
h1,h2,h3,h4 { line-height:1.25; }
.chart-card h3 { line-height:1.35; }
b, strong    { line-height:1.35; }
```

- `activateTab()` **foca o título da view** (`tabindex="-1"`) para leitores de tela. Sem a
  supressão do outline nesse caso, o browser pintava um anel azul em todos os títulos
  escuros, parecendo campo editável. `tabindex="-1"` nunca é alcançável por teclado, então
  suprimir ali não prejudica navegação — o `:focus-visible` dos interativos continua.
- `line-height >= 1.25` em títulos e bolds: sem isso, a segunda linha pintava por cima ou era
  clipada. Números grandes de linha única mantêm line-height apertado por regras mais
  específicas.
- `--amber-ink` existe porque `--amber` sobre `--amber-soft` dá **3.37:1**, abaixo do mínimo
  AA para texto pequeno.
- Todo `<input>`, `<select>` e `<button>` só com ícone tem `aria-label`.
- Drawers: `role="dialog"`, `aria-modal="true"`, `aria-label`.

## Componentes

### Topbar (52px, sticky)
Logo (24px) · divisor 1px · "Field Sales" · **sidenav em pills** (ativa = pill escura; hover
`--sunk`; badge vermelho com contagem em Prospecção e Rotas) · à direita: sino de avisos com
badge · avatar 30px + nome + papel entre parênteses.

### Banner escuro
`--dark`, `border-radius: var(--r-xl)`, padding 22px 26px.
Kicker 10px `letter-spacing:.12em` cor `--dark-mut` · título Poppins 800 22px ·
divisor vertical `rgba(253,251,240,.12)` · KPIs 28px com sublabel 11px · CTA vermelho à
direita. **Cada aba coloca no banner a pergunta que ela responde.**

### Card
`background: var(--panel)`, `border: 1px solid var(--line)`, `border-radius: var(--r-lg)`,
padding 18–22px, `box-shadow: var(--shadow)`.
Card de decisão ganha `border-left: 3px solid var(--red)` (ou borda completa de 1.5px).

### Drawer (Nível 3)
480px pela direita. Overlay `rgba(26,22,19,.32)`. Fecha no **X**, no **overlay** e no **Esc**.
Transição 220ms ease-out (slide + fade do overlay).
Um único padrão no sistema — avisos, rota, ficha do lead e perfil usam a mesma estrutura
(`.avisos-overlay` + `.avisos-drawer`). **Não invente um segundo jeito de abrir painel.**

### Barra de funil
22px de altura, contagem **dentro** da barra, % à direita, trilha `--sunk`,
`gargalo-nota-box` em `--panel2` abaixo. Clique na etapa → modal com os leads.

### Pills e badges
`border-radius: var(--r-pill)`. Estado = pill colorida + texto, **nunca fundo inteiro do card**.
Ativa: `background:var(--ink); color:var(--panel)`.
Inativa: `background:none; color:var(--muted); border-color:var(--line-btn)`.

### Heatmap da semana
Células de 28px: `#1E7A63` (3+) · `#57C29A` (1–2) · `--sunk` (vazio) ·
**hoje vazio = tracejado vermelho**.

### Ícones
SVG inline, `stroke-width: 1.75`, 16px, `stroke-linecap/linejoin: round`, `fill: none`.
**Emoji só em celebração/gamificação** (🔥 🏆 🎉 👋 💎 📈 ⚡ 📝 🥇) — nunca como ícone de sistema.

## Interação

| Elemento | Hover |
|---|---|
| Linha de tabela | `--panel2` |
| Card clicável | `translateY(-2px)` + sombra elevada + borda `--muted2` |
| Pill da nav | `--sunk` |
| Botão vermelho | `--red-dk` |
| Botão outline | borda `--ink` |

- Todo `cursor:pointer` indica elemento acionável — se não é clicável, não põe.
- Checkboxes (3 ações, plano, compromissos): **toggle otimista** — pinta na hora, persiste em
  seguida, reverte se falhar.
- Transições: `.14s`–`.16s var(--ease)`.

## Responsivo

Desktop é a superfície principal. Breakpoints existentes:
```css
@media (max-width:900px){ .meu-funil-grid{ grid-template-columns:1fr !important; } }
@media (max-width:760px){ .cockpit-hero-combo{ flex-direction:column; align-items:stretch; } }
```
Grids de tabela usam `minmax()` para degradar sem quebrar.

## Fontes

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
```

## Protótipos de referência

Os 14 HTMLs na raiz do projeto (`cockpit-gestor-hi-fi.html`, `hoje-executivo-hi-fi.html`,
`drawers-nivel-3.html`, etc.) são **protótipos navegáveis de alta fidelidade** — cores,
tipografia, espaçamentos, raios, sombras, hovers e copy são **finais**. Eles usam
`support.js` como runtime de protótipo; **`support.js` não é código de produção**.

Abra `cockpit-gestor-hi-fi.html` e `hoje-executivo-hi-fi.html` primeiro.
`drawers-nivel-3.html` e `desenvolvimento-executivo.html` estão em fidelidade média —
aplique o mesmo acabamento das demais ao implementar.
