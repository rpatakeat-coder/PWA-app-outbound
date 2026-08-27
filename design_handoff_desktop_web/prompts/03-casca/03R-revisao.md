# 03R — Revisão: Casca — sidebar e header

**Arquivos:** `App.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *Grid e chrome global* · screenshot `design_handoff_desktop_web/screenshots/01-mapa.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Sidebar `position:fixed`, `left/top/bottom:0`, largura **72px em repouso → 240px no hover**, `transition: width .16s cubic-bezier(.2,.7,.3,1)`, `overflow:hidden`.
2. Sidebar expandida ganha sombra `4px 0 16px rgba(0,0,0,.14)`.
3. Topo da sidebar: 64px, borda inferior 1px `--border`, `padding:0 20px`, gap 12, marca 28×28.
4. "Field Sales" 14/20/0.1 peso 700 sobre "Outbound" 11/16/0.5 peso 500 — visíveis só expandida, com `transition: opacity .16s`.
5. Item da sidebar: altura 44, `padding:0 16px`, raio 8, gap 16, ícone 24px, rótulo 14/20/0.1 peso 500 (700 quando ativo).
6. Ativo: fundo `--tint-red`, texto `--tint-red-text`. Hover: fundo `--surface-2`.
7. Badge de Tarefas: 18px pill `#C8131B`, texto 11/18 peso 700, **`top:6px` com `left:34px` colapsada e `left:176px` expandida** — ou ancorado ao ícone, mas nunca cobrindo o ícone.
8. `title` em cada item, para tooltip quando colapsada.
9. Rodapé da sidebar: borda superior 1px `--border`, item de tema + linha de usuário com avatar 32px pill `--tint-red`/`--tint-red-text`.
10. Ordem dos itens: Mapa · Lista · Rota · Agenda · Tarefas · Gestor · Meu desempenho.
11. Recorte por papel: `isViewer` esconde Rota/Agenda/Tarefas; Gestor só para `canViewGestor`.
12. Header 64px, `position:sticky; top:0`, fundo `--surface`, borda inferior 1px `--border`, `padding:0 24px`. **O vermelho saiu do header.**
13. Esquerda do header: título 22/28 peso 700 + subtítulo 12/16/0.4 peso 500 `--text-faint`, `align-items:baseline`, gap 12.
14. Título e subtítulo **mudam por tela** conforme a tabela do README.
15. Busca global: altura 40, raio 8, borda 1px `--stroke-strong`, `min-width:280px`, ícone 20px, hint `⌘K`.
16. `⌘K` / `Ctrl+K` foca a busca.
17. Botão de avisos 40×40 raio 8 borda `--stroke-default`, com dot de não-lido 8px `#C8131B` e borda 1.5px `--surface`.
18. CTA "Novo lead": altura 40, `padding:0 16px`, raio 12, fundo `#C8131B`, ícone `add` 24px, hover `#94090F`.
19. **O FAB flutuante de 56px foi removido** — a criação de lead é o CTA do header.
20. Login renderiza **fora da casca**: sem sidebar, sem header, sem busca, sem avisos, sem avatar, sem CTA.
21. Conteúdo recua `margin-left:72px` (0 no login).
22. Ao trocar de aba, o título da view recebe foco (`tabindex="-1"`) com o outline suprimido só nesse caso.

## Armadilhas conhecidas desta tela

- **Sidebar sem hover** — virou só uma barra de 72px com rótulos minúsculos, que é o problema original.
- **Header ainda vermelho.** No desktop ele é `--surface`; o vermelho é o CTA.
- **Badge cobrindo o ícone de Tarefas** — ancorar ao ícone, não à borda do botão.
- **FAB mantido junto com o CTA** — dois caminhos para a mesma ação.
- **Título do header fixo** em vez de mudar por tela.
- **Login dentro da casca** — usuário deslogado com navegação, badge e avatar na tela.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
