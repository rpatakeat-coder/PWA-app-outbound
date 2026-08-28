# G1 — Cockpit de gestão: mesma casca do app web

**Aplicação:** `gestao/` — projeto Vite separado, servido em `/gestao/`
**Referência da casca:** `design_handoff_desktop_web/README.md` §*Grid e chrome global* · screenshots `01-mapa.png` (sidebar e header) e `06-gestor.png`

> **Este cockpit já está bem construído.** O `tokens.css` vem do `design-system.json` oficial da Takeat, com contraste medido contra o AA da WCAG linha por linha e as duas divergências declaradas. O modo escuro usa os tokens oficiais de `foundations.md §1`. A navegação por hash e a régua na aba ativa são decisões certas.
>
> **Não é uma repaginação — é alinhamento de casca.** O conteúdo das sete telas não muda neste prompt. Muda o que envolve elas, para que `/gestao/` pareça o mesmo produto que `/`.

## O que muda

| Hoje | Passa a ser |
|---|---|
Sete abas em linha no topo, régua vermelha na ativa | **Sidebar colapsável** 72 → 240px no hover |
Sem header | **Header de 64px** com título e subtítulo por tela |
`.envoltorio` `max-width:1320px`, `padding:20px 24px 48px` | conteúdo ao lado da sidebar, `padding:24px`, teto por tela |
`.cartao` raio **12** | raio **8** |
Link "App de campo →" no fim da barra de abas | rodapé da sidebar |

## 1 · Sidebar

Idêntica à do app de campo — a especificação completa está em `design_handoff_desktop_web/README.md` §*Sidebar colapsável*. O resumo:

- `position:fixed`, `left/top/bottom:0`, `z-index:40`, largura **72px em repouso → 240px no hover**, `transition: width .16s cubic-bezier(.2,.7,.3,1)`, `overflow:hidden`. Expandida ganha `4px 0 16px rgba(0,0,0,.14)`.
- Fundo `--panel`, borda direita 1px `--line`.
- **Topo** (64px, borda inferior 1px `--line`, `padding:0 20px`, gap 12): ícone da marca 28×28, e o bloco de texto que aparece só expandido — **"Gestão"** 14/20/0.1 peso 700 `--ink` sobre **"Cockpit"** 11/16/0.5 peso 500 `--ter`.
- **Itens** (`padding:12px 8px`, gap 2): altura 44, `padding:0 16px`, raio 8, gap 16. Ícone 24px, rótulo 14/20/0.1 peso 500 — 700 quando ativo. Ativo: fundo `--red-soft`, texto `--red`. Hover: fundo `--panel2`.
- Rótulos com `opacity 0 → 1`, `transition: opacity .16s`. `title` em cada item, para tooltip quando colapsada.
- **Rodapé** (borda superior 1px `--line`): o link "App de campo" com ícone `arrow_forward`, mesma anatomia dos itens, e abaixo a linha do usuário — avatar 32px pill `--red-soft`/`--red` com as iniciais, nome 12/16/0.5 peso 600 `--ink` sobre "Gestor" 11/16/0.5 peso 500 `--ter`. O `nome` já vem do `profiles` no `App.tsx`.

**As sete abas viram os sete itens**, na mesma ordem, com o `id` do hash preservado:

| Aba | Hash | Ícone |
|---|---|---|
Time | `#/time` | `groups` |
Daily | `#/daily` | `today` |
Semana | `#/semana` | `date_range` |
Agenda | `#/agenda` | `calendar_month` |
Rotas | `#/rotas` | `route` |
Prospecção | `#/prospeccao` | `travel_explore` |
Pessoas | `#/pessoas` | `badge` |

**A navegação por hash não muda.** Os itens continuam sendo `<a href="#/{id}">` — é o que faz recarregar cair no mesmo lugar e o botão voltar funcionar, e o comentário no `App.tsx` explica por quê. Trocar por `onClick` + estado desfaz uma correção de bug.

## 2 · Header de 64px

Novo. `position:sticky; top:0; z-index:20`, altura 64, fundo `--panel`, borda inferior 1px `--line`, `padding:0 24px`, `justify-content:space-between`.

**Esquerda** (`align-items:baseline`, gap 12): título da tela 22/28 peso 700 `--ink`, e ao lado o subtítulo 12/16/0.4 peso 500 `--ter`.

**Use as descrições que já existem no `ABAS`** — elas já são perguntas, e são boas:

| Título | Subtítulo |
|---|---|
Time | Onde eu ajo hoje? |
Daily | Quem cumpriu, quem está vazio? |
Semana | O que mudou e o que eu faço? |
Agenda | A semana está planejada? |
Rotas | Ver, editar e montar a rota de cada vendedor |
Prospecção | O que entra no topo do funil? |
Pessoas | Quem precisa de mim no 1:1? |

Hoje elas vivem no `title` do link e só aparecem no hover. No header ficam visíveis, e cada tela passa a declarar a pergunta que responde. **Não reescreva nenhuma.**

**Direita**: se a tela tiver filtro global de período ou de vendedor, ele vem para cá — Small outline, altura 32, raio 4. Se não tiver, o header fica só com o título. **Não invente controle para preencher.**

## 3 · Conteúdo

- `main` com `margin-left:72px` (a sidebar é `fixed`; o recuo é a largura em repouso — expandir no hover **não empurra** o conteúdo).
- `.envoltorio` deixa de centralizar: `padding:24px`, `max-width:1600px` nas telas de tabela e `1200px` nas de leitura. O `max-width:1320px` atual e o `margin:0 auto` saem — com sidebar, conteúdo centralizado deixa um vão à esquerda que parece defeito.
- `padding-bottom` de 48 vira 24; o rodapé longo era compensação por não haver casca.

## 4 · Alinhamento de tokens

Duas divergências reais entre o cockpit e o app de campo. **Só estas duas.**

**Raio do cartão: 12 → 8.** O `borderRadius.lg` está sendo usado onde o kit pede o padrão. No app de campo todo card é 8. `.cartao` passa a `border-radius: 8px`.

**`--ter`: `#6b6b6b` → `#7A7A7A`.** O comentário no `tokens.css` explica a escolha: `neutral.300` (#7A7A7A) dá 4.29 e reprova o AA por pouco, então foi usado um cinza mais escuro. O raciocínio está certo, mas o app de campo usa `#7A7A7A` como `--text-faint` — e o resultado é que os dois produtos têm texto terciário de tons diferentes, lado a lado.

**Decisão:** alinhe em `#7A7A7A` e **reserve o terciário para o que não é texto de leitura** — rótulo de eixo, contagem ao lado de um número, caption de 11px. Onde `--ter` está carregando frase que precisa ser lida, troque por `--muted` (`#545454`, 7.57). O problema real não era o tom: era o terciário estar sendo usado onde deveria estar o secundário.

Se em alguma tela isso derrubar a legibilidade de algo importante, **pare e me diga qual** — é o tipo de caso em que o código sabe algo que a especificação não sabe.

**O resto já casa**, nome diferente e valor igual: `--panel`=`--surface` · `--panel2`=`--surface-2` · `--sunk`=`--surface-3` · `--ink`=`--text` · `--muted`=`--text-muted` · `--line`=`--border` · `--line-btn`=`--stroke-default` · `--red`=`#C8131B` · `--red-soft`=`--tint-red`. **Não renomeie nada** — os nomes semânticos são os que as sete telas usam, e trocá-los é um diff enorme sem ganho.

## 5 · O tema

O cockpit já lê `data-theme` do `<html>` com bootstrap antes do primeiro paint, espelhando o app de campo. **Não mexa.**

Acrescente só o **item de tema no rodapé da sidebar**, acima da linha do usuário, com a mesma anatomia dos outros itens: ícone `dark_mode`/`light_mode` e rótulo "Tema escuro"/"Tema claro". Grava na mesma chave de `localStorage` que o app de campo usa — a sessão é compartilhada, e o tema também deve ser.

## Não fazer

- Não altere o conteúdo das sete telas. Só a casca.
- Não troque a navegação por hash por estado.
- Não renomeie tokens.
- Não mexa no mecanismo de tema nem no bootstrap do `index.html`.
- Não mexa nas guardas de sessão e papel (`carregando`/`anonimo`/`sem-permissao`) — mas **as três telas de aviso também recebem a casca**? Não: elas aparecem antes de haver navegação. Ficam como estão, centralizadas, sem sidebar.

## Pronto quando

- [ ] sidebar colapsável 72 → 240 no hover, com os sete itens e os ícones da tabela
- [ ] navegação por hash preservada — recarregar cai na mesma aba, o voltar funciona
- [ ] header de 64px sticky, com o título e a **pergunta** de cada tela
- [ ] conteúdo com `margin-left:72px`, sem centralização
- [ ] expandir a sidebar **não empurra** o conteúdo
- [ ] `.cartao` em raio 8
- [ ] `--ter` em `#7A7A7A`, e nenhuma frase de leitura usando terciário
- [ ] item de tema no rodapé da sidebar, gravando na mesma chave do app de campo
- [ ] as telas de aviso (anônimo, sem permissão) seguem sem casca
- [ ] modo escuro conferido nas sete telas
- [ ] `npm run build` no `gestao/` limpo

## Ao terminar

Três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor da especificação que não deu para aplicar e por quê**.

E o de sempre: se alguma das sete telas depender da largura de 1320px centralizada, ou se o `--ter` estiver carregando texto que não pode escurecer, **pare e pergunte** em vez de aplicar por cima.

---

## Depois desta casca

O conteúdo das sete telas fica para um segundo passo. Quando quiser, o caminho é o mesmo dos outros pacotes: uma auditoria por tela, em duas fases, procurando hex cru, spacing fora da escala 8pt e densidade que escapou. `Pessoas.tsx` tem 27 KB e é por onde eu começaria.
