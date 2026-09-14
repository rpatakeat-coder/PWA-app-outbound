# 07 — Design system

> Atenção: existem **duas gerações** de tokens no repositório.
> O `README.md` na raiz descreve a **prancha de handoff** (creme `#EFE9DC`, Poppins +
> DM Sans). O que está **em produção** hoje é a identidade de 07–10/09/26, no `:root` de
> `template/cockpit.template.html` (papel frio `#E9E5DC`, **Archivo + Manrope**).
> **Replique o `:root` do template** — é o que a tela mostra. O README serve para
> entender a intenção de cada tela.

## Tokens em produção

```css
:root{
  /* superfícies */
  --bg:#E9E5DC;        /* fundo da página */
  --panel:#FDFEFF;     /* card */
  --panel2:#F7F5F0;    /* card secundário */
  --sunk:#F4F1EA;      /* superfície afundada */
  --creme:#FBFAF6; --creme-linha:#E4E0D6; --trilho:#EDEBE5;

  /* texto */
  --ink:#2B3440;       /* tinta principal */
  --muted:#5B667A; --muted2:#7A8494;
  --ter:#8B93A3;       /* texto terciário — NÃO é filete */

  /* filetes */
  --line:#DCE1EA; --line-soft:#E2E6EE; --line-btn:#C9CFDA;

  /* semântica */
  --red:#E51A31;  --red-dk:#6E1210;  --red-soft:#FDF7F7;   /* urgência e ação */
  --green:#1E9E7B; --green-soft:#EAF6F1;                    /* prova */
  --amber:#B07C1F; --amber-soft:#FDF6E7; --amber-ink:#8A6516; /* promessa */
  --blue                                                    /* TERRITÓRIO e ROTA */

  --tone:var(--red); --tone-ink:var(--red-dk); --tone-soft:var(--red-soft);

  /* painel escuro */
  --dark:#2B3440; --dark-ink:#FDFEFF; --dark-mut:#8E99AC;
  --dark-fill:rgba(253,254,255,.08); --dark-line:rgba(253,251,240,.16);
  --dark-green:#6FD3AC; --dark-red:#FF7A85; --dark-amber:#E0A64A;

  /* NÃO MEDIDO — par exclusivo deste estado, e de mais nenhum */
  --nm-ink:#7A8494; --nm-bg:#F4F1EA; --nm-line:#DCE1EA;

  --shadow:0 1px 3px rgba(26,22,19,.05);
  --shadow-lg:0 24px 56px -28px rgba(26,22,19,.55);

  --font-display:'Archivo',system-ui,-apple-system,sans-serif;
  --font-body:'Manrope','Inter',system-ui,-apple-system,sans-serif;
}
```

Fonte: `https://fonts.googleapis.com/css2?family=Archivo:wght@400..900&family=Manrope:wght@400;500;600;700;800&display=swap`

Números sempre com `font-variant-numeric: tabular-nums`.

## O vocabulário de cor — **quatro** significados, e só

| cor | significa | nunca usar para |
|---|---|---|
| **vermelho** `--red` | urgência e **ação/seleção** | estado (estado é pill + texto, nunca fundo inteiro) |
| **verde** `--green` | prova / cumprido | decoração |
| **âmbar** `--amber` | promessa / atenção | erro |
| **azul** `--blue` | **território e rota** | qualquer ação que não seja de rota |

Histórico que vale herdar: `--violet` e `--pink` foram **removidos** — "cor sem
significado no vocabulário urgência/prova/promessa é ruído". O azul quase foi removido
junto, e medir salvou: 28 das 40 regras azuis eram rota/mapa/proximidade. **Azul é o
quarto código semântico do produto**, não decoração. Para link em texto corrido existe
`.link-txt`.

## O estado "NÃO MEDIDO"

Par de tokens **exclusivo**: `--nm-ink / --nm-bg / --nm-line`. Quando ele aparece, a tela
está dizendo que a informação **não existe**, e o motivo vem ao lado. Não usar em nenhum
outro contexto — nem para vazio, nem para zero, nem para desabilitado.

## Regras de composição

1. **Um bloco escuro por tela**: o banner do topo. Nada mais é escuro.
2. **Estado usa pill + texto**, nunca fundo inteiro. Vermelho de fundo só para ação.
3. **Janela de tempo sempre rotulada junto do número** — "taxa de avanço · semana",
   "janela: 01–07/08".
4. **Ícones lineares SVG, stroke 1.75, 16–18px**, `linecap`/`linejoin: round`. Emoji só
   em celebração/gamificação (🔥 🏆 🎉 👋) — nunca como ícone de sistema.
5. **Tracejado = "existe mas não confirmado"** — convenção do arquivo inteiro
   (dia sem plano, valor não datado, hoje vazio, gravação em andamento).
6. **Sem gráficos decorativos.** Barra só quando a proporção é a informação.

## Medidas

- Topbar 52px sticky · padding lateral da página 32px
- Grid gap 18px · padding de card 18–22px · gaps internos 7–14px
- Raios: 999px pills/botões · 18px cards · 11–13px sub-cards · 9–10px linhas · 6–7px checkbox/badges
- Drawer 480px da direita, overlay `rgba(26,22,19,.32)`, sombra `-18px 0 44px rgba(26,22,19,.3)`
- **Escala de breakpoints: 420 / 640 / 760 / 900 / 1050 / 1240** — sempre o **menor** que
  cobre o caso. Há uma guarda que reprova breakpoint fora dessa escala.
- Alvo de toque: piso de 38px no desktop **exige** o par de 44px em `<=760px` (guarda).

## Cores de etapa do funil

| etapa | cor |
|---|---|
| Prospecção | `#E8A33D` |
| Visita | `#4A7FC7` |
| Conversa com Decisor | `#7C6FE0` |
| Demo/Proposta | `#2FA88A` |
| Negociação | `#D9668F` |
| Ag. Pagamento | `#E51A31` |

Estas cores são **da trilha do funil** e não reusam a paleta semântica — de propósito.

## Contraste é requisito, não preferência

Vários tokens foram **escurecidos depois de medidos**:
- `--ter` era `#C9CFDA` (filete) e ao virar texto deu contraste **1,4** em 121 lugares →
  virou `#8B93A3`.
- `--amber` sobre `--amber-soft` dava 3,37:1 → nasceu `--amber-ink:#8A6516`.
- `--nm-ink` era `#8A7D68` (3,36:1 num chip de 10px lido no celular, na rua) → `#7A8494`.

**Regra: todo par cor/fundo de texto pequeno precisa de AA.** Um chip de 10px lido na rua
não tem margem.

## Armadilha de CSS que custou caro (vale herdar a guarda)

`var(--x)` sem fallback e sem definição **não dá erro**: a declaração morre em silêncio.
Em `color` o texto herda do pai; em `background` cai para transparente; em `border-color`
cai para `currentColor` (borda quase branca no painel escuro).

Isso aconteceu **três vezes** no projeto (`--body`, `--dark-line`, `--dark-green/red/amber`,
`--creme`). Sintoma real em produção: no hero do Meu Funil, "acima do SLA", "fechados no
mês" e "quentes sem próximo passo" apareciam **sem número**.

Por isso existe `checarAlcanceDasVariaveis()`: toda variável usada tem de ser declarada em
um seletor que o markup realmente gera.
