# M1d — Corpo: uso do produto, dados e timeline

**Arquivo:** `App.tsx` · **Escopo:** só a faixa do meio (rolável)

> Leia o `M1a` e rode `M1b` e `M1c` antes. **Use só os campos que o `M1a` confirmou existirem.** Campo do design sem origem no código fica de fora e vai na lista final.

`flex:1; overflow-y:auto`. Padding 24 no desktop, 16 no mobile. `display:flex; flex-direction:column`, gap 24 (desktop) / 16 (mobile).

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

## 1 · Uso do produto

**Só aparece para quem o `hubspot-usage-sync` alcança.** Sem dado, a seção não existe — não mostre "sem dados".

- Card `padding:16px`, raio 8 (desktop) / 16 (mobile), fundo `--surface-2`, borda 1px `--border` no desktop.
- Cabeçalho "USO DO PRODUTO" 12/16/0.5 peso 700 `--text-secondary` uppercase, `margin-bottom:12px`.
- Linha principal: dot de semáforo 10px + texto 14/20/0.25 `--text-secondary` — "Última comanda há `{n}` dias".
- Rodapé 11/16/0.5 `--text-faint` — "Sincronizado há `{n}` dias · `{n}` comandas".

**Semáforo** — é o dado mais acionável do painel:

| Última comanda | Dot |
|---|---|
≤ 7 dias | `--tint-green-text` |
8–30 dias | `#FFB32F` |
> 30 dias, ou nenhuma | `--tint-red-text` |

Se houver pedido de cancelamento no dado de uso, linha extra em `--tint-red-text` abaixo.

## 2 · Dados

Cabeçalho "DADOS" 12/16/0.5 peso 700 `--text-secondary` uppercase, `margin-bottom:12px`.

**Desktop** — pares em linha: `display:flex; justify-content:space-between; gap:16px`, `padding:10px 0`, borda inferior 1px `--border`. Chave 12/16/0.5 peso 600 `--text-faint` à esquerda com `flex:0 0 auto`; valor 14/20/0.25 `--text` à direita com `text-align:right`.

**Mobile** — mesma estrutura, `padding:12px 0`. Valor longo o bastante para quebrar em 390px (endereço completo) → **empilhe aquela linha**: chave acima 12/16/0.5, valor abaixo 16/24/0.5.

Ordem: **Contato · Telefone** · Etapa · Plano apresentado · Endereço · CEP · Origem do lead · Responsável · **ID HubSpot**, fechando com a **linha de link "Abrir no HubSpot"** — **filtrando os que não existem**. Campo vazio: não renderize a linha. Não mostre "—" em sete linhas.

MRR em pt-BR (`R$ 590,00`); números com `tabular-nums`.

## 3 · Timeline

Cabeçalho "TIMELINE" 12/16/0.5 peso 700 uppercase, `margin-bottom:12px`.

**Junte as fontes que o `M1a` identificou** — visitas, mudanças de etapa, reuniões, notas — numa lista única **ordenada por data, mais recente primeiro**. Sem fonte unificada, faça o merge no componente; não crie tabela nem view nova.

Item: `display:flex; gap:12px`, `padding-bottom:16px`.

Ícone em pill 32px (`flex:0 0 32px`), centralizado, com o tint do tipo:

| Tipo | Ícone | Fundo | Ícone |
|---|---|---|---|
Check-in de visita | `where_to_vote` | `#EAF7EE` | `#167532` |
Mudança de etapa | `trending_up` | `#FFF1E0` | `#8A4A0C` |
Reunião / demo | `event` | `#F1EBFE` | `#5B32C4` |
Nota | `edit_note` | `--surface-2` | `--text-secondary` |

> Esses fundos são tints claros e **não invertem no escuro** — são superfícies próprias, e o ícone fica escuro nos dois temas. Não troque por token de tema, senão o ícone verde sobre fundo verde-claro desaparece.

- Título 14/20/0.1 peso 600 `--text`: "Check-in de visita (3ª)" · "Demo/Proposta → Negociação" · "Demo realizada · 45 min" · "Nota: `{primeiras palavras}`".
- Quando 12/16/0.4 `--text-faint`: data e hora em pt-BR, mais o detalhe que existir — distância do pin no check-in, motivo na mudança de etapa.

Timeline vazia: uma linha 14/20/0.25 `--text-secondary` — "Sem histórico ainda."

**Limite**: os 6 mais recentes e um "Ver histórico completo" (text button `#018CCC`) se houver mais. O painel já passa de 1.800px de altura; timeline longa empurra o rodapé para fora do alcance.

## Pronto quando

- [ ] uso do produto só aparece com dado, semáforo nos três estados
- [ ] dados sem linha vazia; MRR em pt-BR
- [ ] mobile empilha linha de valor longo
- [ ] timeline com as fontes reais mescladas e ordenadas
- [ ] tints dos ícones **não** invertidos no escuro
- [ ] timeline limitada a 6 + "ver completo"
- [ ] **nenhum campo inventado** — os ausentes ficaram de fora e estão listados
- [ ] `npm run typecheck` limpo
