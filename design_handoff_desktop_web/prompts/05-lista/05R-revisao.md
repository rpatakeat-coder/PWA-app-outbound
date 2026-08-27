# 05R — Revisão: Leads (tabela)

**Arquivos:** `App.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *2. Leads (tabela)* · screenshot `design_handoff_desktop_web/screenshots/02-lista.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. `padding:24px`, `max-width:1600px`.
2. Barra de ferramentas `margin-bottom:16px`, `space-between`, `flex-wrap:wrap`, gap 16.
3. Chips de temperatura à esquerda: altura 32, raio 8, dot 8px, ativo `--tint-red`/`--tint-red-text`.
4. "Filtros" Large outline com ícone `filter_list` 24px e badge de contagem 18px `#C8131B`.
5. "Baixar planilha" Large outline em `#1D9688` com ícone `download`.
6. Tabela: fundo `--surface`, borda 1px `--border`, raio 8, `overflow:hidden`, sombra 02.
7. Grid **idêntico** no cabeçalho e nas linhas: `minmax(240px,2fr) minmax(150px,1fr) 160px 120px minmax(140px,1fr) 110px 96px 48px`, gap 16.
8. Cabeçalho: `padding:12px 16px`, fundo `--surface-2`, borda inferior 1px `--stroke-default`, rótulos 12/16/0.5 peso 700 `--text-muted`.
9. Linha: `padding:12px 16px`, borda inferior 1px `--border`, hover `--surface-2`, clique abre o drawer.
10. Coluna Restaurante: barra 4×32 raio 2 + nome 14/20/0.1 peso 600 truncado sobre status 12/16/0.4 `--text-faint`.
11. Coluna Etapa: badge `padding:4px 8px` raio 4 com o tint da etapa; **no escuro cai para `--surface-2`/`--text`**.
12. Coluna Temperatura: dot 10px + rótulo 12/16/0.5 peso 600.
13. Coluna Última visita: 12/16/0.5 peso 600 — `--text-disabled` quando "—", `--tint-red-text` quando > 30 dias.
14. Coluna Reuniões: centralizada, 14/20 peso 600, `tabular-nums`.
15. Última coluna: `chevron_right` 20px `--text-faint` à direita.
16. Rodapé: "Mostrando {n} de {total} leads" 12/16/0.4 + paginação com botões 32×32 raio 4; página atual `#C8131B`/branco.
17. Ordenação por clique no cabeçalho, com `aria-sort`.
18. `<th scope="col">` no cabeçalho.
19. O agrupamento por etapa em acordeão (`renderListRow`, `expandedStages`) continua existindo como **modo alternativo**, não como padrão.
20. Abaixo de 1024px: tabela reduzida a Restaurante · Etapa · Cidade · chevron.
21. Nenhum hexadecimal fora dos literais permitidos; spacing na escala 8pt.

## Armadilhas conhecidas desta tela

- **Grid do cabeçalho diferente do das linhas** — desalinha por 1–2px.
- **Cards mantidos em três colunas** em vez de virar tabela.
- **Acordeão por etapa deletado** — deve virar modo alternativo, não desaparecer.
- **Badge de etapa com tint claro no escuro** — texto escuro sobre fundo escuro.
- **"Última visita > 30 dias" com `#94090F`** em vez do token — ilegível no escuro.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
