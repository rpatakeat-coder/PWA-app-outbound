# M1f — Peek sheet do mapa (só mobile)

**Arquivo:** `App.tsx` · **Escopo:** só o estágio de peek no mapa, abaixo de 1024px

> Rode `M1b`–`M1e` antes. **Não afeta o desktop**, onde o drawer de 480px não cobre o mapa e abre completo de uma vez.

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

## O problema

No celular, tocar um pin abre a ficha completa e ela cobre o mapa inteiro. O vendedor perde a referência de onde o lead está — se é o da esquina ou o de dois bairros — que é justamente o motivo de ele estar no mapa.

## O que construir

**Dois estágios da mesma folha.**

### Estágio 1 — peek

Ancorado no rodapé do mapa, acima da barra de navegação. O mapa continua visível.

- `padding:16px 16px 40px`, raio `16px 16px 0 0`, fundo `--surface`, sombra `0 -4px 16px rgba(0,0,0,.14)`.
- **Os 40px de `padding-bottom` não são decorativos**: 16 + os 24px que o FAB central invade acima da barra. Sem eles o círculo vermelho do FAB cai em cima do "Check-in".
- Handle 36×4 raio 2 centralizado, `margin-bottom:12px`.
- Linha de identificação (`display:flex; align-items:flex-start; gap:12px`):
  - barra de temperatura 4px, `align-self:stretch`, `min-height:44px`, raio 2, cor de `TEMP_COLORS`
  - nome (`empresa || nome`) 16/24/0.15 peso 600 truncado, sobre "`{etapa}` · `{distância}` · `{n}`ª visita" 12/16/0.4 `--text-faint`
  - badge de temperatura à direita, `flex:0 0 auto`: `padding:4px 8px`, raio 4, 11/16/0.5 peso 600, tint da temperatura
- Ações `margin-top:16px`, gap 8:
  - **"Check-in"** `flex:1`, altura 48, raio 12, `#27A84C`, 16/24/0.15 peso 600 branco, ícone `where_to_vote` 24px
  - `navigation` 48×48, raio 12, borda 1px `--stroke-default` — chama `openNavigation`
  - `call` 48×48, raio 12, borda 1px `--stroke-default` — liga para o contato

A distância vem da posição do usuário até o lead. Sem GPS, omita esse pedaço da sublinha.

### Estágio 2 — ficha completa

Arrastar o peek para cima, ou tocar na linha de identificação, expande para `max-height:92%` — é o painel que `M1b`–`M1e` construíram. Arrastar para baixo volta ao peek; de novo, fecha.

**A mesma folha, dois tamanhos.** Não é um segundo componente.

## Gestos

- Arraste para cima: peek → completo
- Arraste para baixo do completo: → peek
- Arraste para baixo do peek: fecha
- Voltar do sistema: completo → peek → fecha
- Transição 220ms ease-out entre estágios

## Não fazer

- Não crie um componente separado para o peek.
- Não abra a ficha completa direto de um pin no mobile.
- Não esqueça a reserva de 40px — só aparece quando você olha o FAB junto.

## Pronto quando

- [ ] tocar um pin abre o peek, com o mapa visível acima
- [ ] arraste para cima abre a completa; para baixo volta ao peek
- [ ] **o FAB central não toca o "Check-in"**
- [ ] as três ações do peek com 48px
- [ ] `navigation` e `call` funcionam
- [ ] o voltar do sistema desce um estágio por vez
- [ ] no desktop nada mudou
- [ ] `npm run typecheck` limpo
