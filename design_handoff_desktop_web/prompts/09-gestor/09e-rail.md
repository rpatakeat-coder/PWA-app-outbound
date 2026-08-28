# 09e — Gestor: rail de administração e exportação

**Arquivo:** `src/screens/GestorScreen.tsx` · **Escopo:** só o rail direito

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

## O que existe hoje

Cinco painéis acordeão empilhados à direita: Vendedores & usuários, Config Rota do dia, Metas por vendedor, Contas Alvo dispensadas, e o bloco Exportar TUDO. Cada um abre expandindo no lugar, empurrando os de baixo.

## O que fazer

Rail de **320px** (`flex:0 0 320px`) ao lado da coluna principal, com o container da tela em `display:flex; align-items:flex-start; gap:24px; padding:24px`.

**Os quatro primeiros viram cards-link**, não acordeões: `padding:16px`, fundo `--surface`, borda 1px `--border`, raio 8, `shadow/01`, hover `border-color:--stroke-strong`. Cada um: ícone em quadrado 40×40 raio 8 (`--surface-2`/`--text-secondary`) + título 14/20/0.1 peso 600 sobre descrição 12/16/0.4 `--text-tertiary` + badge de contagem opcional (pill 24px `--surface-2`/`--text-secondary`, 12/24/0.5 peso 700) + `chevron_right` 20px `--text-disabled`.

| Card | Descrição | Badge | Componente atual |
|---|---|---|---|
Vendedores e usuários | Criar conta, papel e id do HubSpot | nº de vendedores | edge `criar-usuario` |
Config Rota do dia | Raio, nota mínima e avaliações | — | `RouteConfigCard.tsx` |
Metas por vendedor | Alvo mensal de cada um | — | `SellerGoalsCard.tsx` |
Contas Alvo dispensadas | Descartadas pelos vendedores | nº dispensadas | `DismissedContaAlvoCard.tsx` |

Cada um abre no **drawer padrão de 480px** — o mesmo componente da ficha do lead. Acordeão dentro de rail estreito faz o conteúdo do card ficar apertado em 320px e empurra os vizinhos; o drawer dá largura para editar. **Não invente um segundo padrão de painel.**

**Bloco de exportação** no fim do rail: `padding:24px`, mesma casca. Ícone `database` 20px `--color-teal-dark` + "Exportar tudo" 14/20/0.1 peso 600. Descrição 12/16/0.4 `--text-tertiary` com `text-wrap:pretty`. Dois botões Large em coluna gap 8, `margin-top:16px`, **rótulo flush-left**:
- "Semana anterior" — filled `#C8131B`, ícone `download`. Chama `exportReport()` sem range.
- "Período selecionado" — outline neutro, ícone `date_range`. Chama `exportReport({start, end})` com o período ativo.

**O fluxo de exportação é inalterado**: `exportReport` valida por lista fixa de e-mails (`GESTOR_EMAILS`) na edge `export-report`, não pelo `role` — está documentado em `docs/DECISOES.md`. Não toque nem no payload nem na signed URL.

**Abaixo de 1280px** o rail desce para o fim da coluna principal, em grid de 2 colunas.

## Pronto quando

- [ ] rail de 320px, quatro cards-link + bloco de exportação
- [ ] cada card abre o drawer padrão de 480px, não acordeão
- [ ] os quatro componentes atuais continuam funcionando dentro do drawer
- [ ] os dois botões de exportação funcionam, rótulo flush-left
- [ ] `exportReport` e a edge inalterados
- [ ] abaixo de 1280px o rail desce
- [ ] `npm run typecheck` limpo
