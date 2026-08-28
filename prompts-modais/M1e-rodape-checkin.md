# M1e — Rodapé: check-in de visita

**Arquivo:** `App.tsx` · **Escopo:** só a faixa de rodapé

> Leia o `M1a`, item 5 (sobre `markAsVisited`), antes.

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

Faixa fixa, `flex:0 0 auto`, borda superior 1px `--border`, fundo `--surface`.

- **Desktop**: `padding:24px`.
- **Mobile**: `padding:16px` mais a área segura embaixo (`16px + insets.bottom`, ou o `navPaddingBottom` que o projeto já usa). Sem isso o botão fica sob a barra de gestos do iPhone.

**Botão de largura total**:
- Desktop: altura 40, raio 12, tipo 14/20/0.1 peso 600, **rótulo flush-left** (`justify-content:flex-start; padding:0 16px`).
- Mobile: altura 48, raio 12, tipo 16/24/0.15 peso 600, centralizado.
- Fundo `#27A84C`, texto branco, ícone `where_to_vote` 24px, gap 8.
- Rótulo: **"Marcar visita (check-in GPS)"** no desktop, **"Marcar visita (GPS)"** no mobile.
- Já houve check-in hoje: vira **"Re-marcar visita"**.

## Comportamento — preserve o que existe

O `M1a` descreveu `markAsVisited`. **Nada disso muda:**

- o raio de validação de distância que o código já usa
- a conclusão da Task no HubSpot
- o que acontece quando o GPS não está disponível ou a permissão foi negada

Este prompt define só a forma. Se o check-in hoje mora em outro lugar da tela, **mova para cá sem alterar a chamada**.

## Estados

- **Carregando**: spinner no lugar do ícone, **fundo inalterado** (regra do kit: Loading mantém o fill de Rest), botão desabilitado.
- **GPS pendente**: botão habilitado; a validação acontece no clique.
- **Permissão negada**: desabilitado a 45% de opacidade, com uma linha 12/16/0.4 `--tint-red-text` acima — a copy que o app já usa.
- **Fora do raio**: o retorno de `markAsVisited` decide. Erro como linha 12/16/0.4 `--tint-red-text` acima do botão, **nunca `alert()`**.

## Não fazer

- Não mude o raio de validação.
- Não use `alert()` nem `confirm()` do browser.
- Não deixe o botão rolar com o corpo — a faixa é fixa.

## Pronto quando

- [ ] rodapé fixo, botão de largura total `#27A84C`
- [ ] rótulo flush-left no desktop, centralizado no mobile
- [ ] vira "Re-marcar visita" quando já houve check-in hoje
- [ ] no mobile respeita a área segura
- [ ] os quatro estados
- [ ] validação de distância e Task do HubSpot **inalteradas**
- [ ] `npm run typecheck` limpo
