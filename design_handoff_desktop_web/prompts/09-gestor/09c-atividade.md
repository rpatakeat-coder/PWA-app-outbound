# 09c — Gestor: atividade no período

**Arquivo:** `src/screens/GestorScreen.tsx` · **Escopo:** só a faixa de atividade

> Leia `09a` primeiro.

---

## Tokens desta tela (não precisa abrir outro arquivo)

| Papel | Variável | Light | Dark |
|---|---|---|---|
Fundo da página | `--bg` | `#F6F6F6` | `#121212` |
Card / painel | `--surface` | `#FFFFFF` | `#1E1E1E` |
Container aninhado, hover de linha, header de tabela | `--surface-2` | `#F6F6F6` | `#262626` |
Trilha de barra, fill | `--surface-3` | `#EDEDED` | `#2A2A2A` |
Texto primário, valores | `--text` | `#222222` | `rgba(255,255,255,.92)` |
Texto secundário | `--text-muted` | `#545454` | `rgba(255,255,255,.64)` |
Texto terciário, rótulos | `--text-faint` | `#7A7A7A` | `rgba(255,255,255,.42)` |
Divisor, borda de card | `--border` | `#EDEDED` | `rgba(255,255,255,.08)` |
Borda de botão outline | `--stroke-default` | `#C6C6C6` | `rgba(255,255,255,.14)` |
Borda de input | `--stroke-strong` | `#7A7A7A` | `rgba(255,255,255,.24)` |
Marca, CTA | — | `#C8131B` | `#C8131B` |
Texto vermelho legível | `--tint-red-text` | `#94090F` | `#E5A1A4` |
Fundo tonal vermelho | `--tint-red` | `#FAE8E9` | `#3A1416` |
Texto verde legível | `--tint-green-text` | `#167532` | `#77BD8B` |
Link, ação secundária | — | `#018CCC` | `#66CFFF` |

**Tipografia** — Poppins. Formato `tamanho/altura/letter-spacing`:
Label Small 11/16/0.5 · Body Small 12/16/0.4 · Label Medium 12/16/0.5 · Body Medium 14/20/0.25 · Label Large 14/20/0.1 · Title Small 16/24/0.15 · Title Medium 18/24/0 · Heading XS 20/28 · Heading Small 24/32 · Heading Medium 28/36.
Números **sempre** com `font-variant-numeric: tabular-nums` e milhares em `toLocaleString('pt-BR')`.

**Espaçamento** 8pt: 4 · 8 · 12 · 16 · 24 · 32 · 40.
**Raio**: 4 (badge, célula, input de tabela) · 8 (**padrão** — card, painel, dropdown) · 12 (botão Large).
**Sombras**: `shadow/01` `0 1px 2px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` · `shadow/02` `0 2px 4px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`.
**Botão Large**: altura 40, `padding:0 16px`, raio 12, tipo 14/20/0.1 peso 600, ícone 24px, gap 8, **rótulo flush-left**.
**Botão Small**: altura 32, `padding:0 12px`, raio 4, tipo 12/16/0.5 peso 600.
**Foco**: `outline: 2px solid #016999; outline-offset: 2px`.
**Alvo tocável no desktop**: 40px.

> `#94090F` e `#167532` dão ~2,6:1 sobre superfície escura — **nunca use o hex como cor de texto**; use `--tint-red-text` / `--tint-green-text`, que já fazem o par no repo. Exceção: texto sobre fundo tonal claro (`#FAE8E9`, `#FFF8EB`, `#EAF7EE`), que são superfícies próprias e não mudam com o tema.

## O que fazer

Cabeçalho de seção "ATIVIDADE NO PERÍODO · {n} VENDEDORES" 12/16/0.5 peso 700 `--text-secondary` uppercase, `margin-bottom:12px`.

Grid de **seis** cards: `grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px`. Cada card é um `<button>`: `padding:16px`, fundo `--surface`, borda 1px `--border`, raio 8, `shadow/01`, hover `border-color:--stroke-strong`, `text-align:left`.

Dentro: ícone 20px `--text-tertiary` no topo; número 24/32 peso 600 `--text-primary` `tabular-nums` com `margin-top:8px`; rótulo 12/16/0.5 peso 600 `--text-tertiary`.

Os seis, na ordem, com o campo do hook:

| Rótulo | Campo | Ícone |
|---|---|---|
Visitados | `visited_in_period` | `where_to_vote` |
Criados | `created_in_period` | `add_business` |
Reuniões | `meetings_in_period` | `event` |
Follow-ups | `follow_ups_in_period` | `phone_in_talk` |
Mudanças | `stage_changes_in_period` | `trending_up` |
Notas | `notes_in_period` | `edit_note` |

Cada card abre o drill-down com a `GlobalMetricKey` correspondente (`'created'`, `'visited'`, `'meetings'`, `'follow_ups'`, `'stage_changes'`, `'notes'`) — o `useMetricLeads` já aceita exatamente essas chaves.

**`won_in_period`** também existe no hook. Se a tela já o mostra, mantenha como sétimo card e passe o grid para 7 colunas; se não mostra, **não acrescente** — não há `GlobalMetricKey` `'won'` no `useMetricLeads` (só em `useMyMetricLeads`), então o card não teria drill-down.

**Seletor de período** acima: cinco botões Small (altura 32, `padding:0 12px`, raio 4, 12/16/0.5 peso 600, borda 1px `--stroke-default`), ativo `#C8131B`/branco — **Hoje · 7 dias · 30 dias · Tudo · Personalizado**, espelhando `GestorPeriodPreset`. À direita da faixa, a nota "Snapshot lido agora · atividade no período" 12/16/0.4 `--text-tertiary`.

## Atenção — bug conhecido

A `queryKey` **não pode** conter o range calculado com `Date.now()` dos presets relativos: isso muda a cada render e joga o React Query em refetch infinito. O comentário no hook documenta esse bug ("os botões de período não carregam, mas o intervalo personalizado sim"). **Não toque na `queryKey`.**

## Pronto quando

- [ ] seis cards em grid de 6, todos clicáveis
- [ ] cada um mapeado ao campo certo do hook
- [ ] números em `--text-primary`, sem cor decorativa, com separador pt-BR
- [ ] seletor de período com os cinco presets, ativo em `#C8131B`
- [ ] **`queryKey` inalterada**
- [ ] `npm run typecheck` limpo
