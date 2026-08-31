# M2b — Mapa: ajustes sobre o que foi aplicado

**Arquivo:** `App.tsx` (bloco `tab === 'map'`, header da tela, overlays do mapa) · **Casca:** rodapé do app
**Base:** foto do aparelho real, escuro, 390×844 — não é o protótipo.
**Diagnóstico:** o cabeçalho consome **~185px dos 844** antes de o mapa começar, e o segmented Mapa/Lista não existe. A tela perde um quarto da altura para chrome de filtro que se usa uma vez por dia.

> Continua o `M2-mapa-lista-completo.md`. Só o que está aqui muda; o resto do M2 permanece.
>
> Tarefa única: **só o Mapa e dois pontos da casca**. Se encontrar algo errado em outra tela, anote e siga.

---

## 1 · O cabeçalho, de quatro faixas para duas

Hoje, de cima para baixo: **(1)** linha vazia só com o avatar · **(2)** busca · **(3)** status `Lead / Cliente / Ex-Cliente / Ganho - Fi…` · **(4)** chips de temperatura · **(5)** barra `126 leads no recorte`. Passa a ser duas.

**Faixa 1 — busca + avatar na MESMA linha.** `padding:12px 16px 8px`, `display:flex; align-items:center; gap:12px`: campo `flex:1` altura 48 raio 16, avatar 48px pill. **A linha vazia acima do avatar sai** — hoje são ~56px de nada no topo da tela.

**Faixa 2 — segmented Mapa / Lista.** Está **faltando**: sem ele a vista Lista não tem caminho no celular desde o M1. Dois botões `flex:1`, altura 40, raio 12 só nas pontas, ícone 20px + rótulo 14/20/0.1 peso 600. Ativo no escuro: fundo `--surface-2` (`#262626`), texto `--brand-text`. Inativo: `rgba(255,255,255,.18)`, texto branco. No claro: ativo `#fff`/`#C8131B`.

**Faixa 3 — uma única linha de filtro**, `padding:12px 16px`, fundo `--surface`, **borda inferior 1px `--border`** (hoje o slab do header e o mapa se encostam sem divisor), `overflow-x:auto`, gap 8:

1. **Botão de filtro** 36×36 pill, borda 1px `--stroke-default`, `IconFilter`/`IconSquareMenu` 20px `--text-muted`, `flex:0 0 auto` — abre o sheet de filtros.
2. Chips de temperatura como já estão: **Todos · Quente · Morno · Frio · Conta Alvo**, altura 36.

**O status sai da tela e vai para o sheet de filtros.** `Lead / Cliente / Ex-Cliente / Ganho - Fixo…` é recorte de sessão, não alternância de segundo a segundo: ocupa uma faixa inteira de 48px, tem raio 0 (fora da escala) e o quarto rótulo já corta em "Ganho - Fi…". Enquanto o sheet não existir, mantenha a faixa **mas** só com o status ativo visível, como chip removível (`Lead ✕`) na mesma linha dos chips de temperatura.

**A contagem sai da faixa própria.** `126 leads no recorte` vira **pill flutuante sobre o mapa**, no topo, `pointerEvents:none` — mesma anatomia da pill de status que já existe ("Aproxime para carregar os clientes desta região"): `padding:4px 12px`, raio pill, fundo `--surface`, sombra 01, texto 12/16/0.5 peso 600 `--text-muted`. É informação sobre o mapa, não controle. **Se as duas pills puderem aparecer juntas, empilhe com gap 8** — a de carregamento acima.

Resultado: header de ~185px para **~140px**, e o mapa ganha 45px.

## 2 · Overlays do mapa

- **Recentrar está no rodapé esquerdo — sobe.** 48×48, raio **16** (não círculo), `left:16px`, `top: mapLayout.y + 16`, fundo **`--surface`** (hoje é um círculo quase preto que se lê como furo no mapa), sombra 03, ícone 24px: `IconLocationFilled` + `#C8131B` seguindo, `IconLocation` + `--text-muted` livre.
- **O segundo botão redondo escuro do rodapé direito** (ícone de tendência) segue a mesma regra: 48×48 raio 16, fundo `--surface`, `right:16px`, `top: mapLayout.y + 16`. Nenhum controle fica no rodapé do mapa — lá embaixo estão a barra, o FAB e o peek sheet.

## 3 · Dois pontos da casca

- **A sombra do FAB está virando um halo difuso** no fundo escuro. Mantenha `0 8px 16px rgba(200,19,27,.32)` **no claro** e troque para `0 6px 12px rgba(0,0,0,.32)` **no escuro** — no escuro a sombra tingida não separa o FAB do fundo, só suja em volta.
- **"developed by RPA" ocupa uma linha inteira abaixo das abas**, dentro da área segura. Remova do rodapé mobile; a assinatura vai para a seção **SOBRE** de Configurações (M10). O `padding-bottom` da barra volta a ser só `insets`.
- **Conferir o badge de Tarefas** (`90`) — na foto ele encosta na borda superior da barra. Garanta que o container da barra e o do ícone **não** recortam (`overflow: visible`); o badge fica pendurado em `top:-6px; right:-12px` do ícone.

---

## Não fazer

- Não toque no clustering, no carregamento por área visível nem na pill de status de carregamento.
- Não devolva a Lista para a barra de abas.
- Não crie o sheet de filtros aqui (é o M4) — só o botão e o chip de status removível.
- Não mexa em `TEMP_COLORS`.

## Pronto quando

- [ ] busca e avatar na mesma linha; nenhuma linha vazia no topo
- [ ] segmented Mapa/Lista presente e funcionando, com o ativo em `--surface-2`/`--brand-text` no escuro
- [ ] uma única faixa de filtro, com botão de filtro + chips, e borda inferior 1px `--border`
- [ ] a faixa de status de 48px não existe mais como faixa
- [ ] `126 leads no recorte` é pill sobre o mapa
- [ ] recentrar e o segundo botão em 48×48 raio 16 `--surface`, no **topo** do mapa
- [ ] nenhum controle no rodapé do mapa
- [ ] sombra do FAB neutra no escuro
- [ ] "developed by RPA" fora do rodapé
- [ ] badge de Tarefas inteiro, sem recorte
- [ ] altura do header medida e reportada (esperado ~140px)
- [ ] `npm run typecheck` limpo

## Ao terminar

Três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o estado, o ícone ou o destino que falta** — e a **altura do header medida** no aparelho.
