# 09R — Revisão: Painel do gestor

**Arquivos:** `src/screens/GestorScreen.tsx`, `src/hooks/useGestorMetrics.ts`
**Referência:** `design_handoff_desktop_web/README.md` §*6. Painel do gestor* · screenshots `17-gestor.png`, `18-gestor-ranking.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Item por item: **OK**, **FALTA** ou **DIVERGE** (cite o encontrado e o esperado). **Não edite nada.** Feche com o resumo OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto para o menor.

## Checklist

1. **Nenhum funil por etapa, heatmap, MRR, taxa de conversão ou delta "vs mês anterior" na tela** — nada disso existe no hook.
2. Container `display:flex; align-items:flex-start; gap:24px; padding:24px`, coluna principal + rail de 320px.
3. Snapshot é **um card com barra proporcional**, não cinco cards soltos.
4. Os três segmentos somam 100% e usam `#0ea5e9` / `#16a34a` / `#475569`.
5. Segmento com menos de ~8% não mostra rótulo interno.
6. `total_visited` **fora** da barra, separado por régua.
7. Os três números e o "já visitados" abrem drill-down.
8. Seis cards de atividade em grid de 6, cada um clicável, mapeados aos campos `*_in_period`.
9. Seletor de período com os cinco presets de `GestorPeriodPreset`.
10. **`queryKey` do `useGestorMetrics` inalterada** (sem `Date.now()` na chave).
11. Ranking é **uma linha por vendedor**, não um bloco por vendedor.
12. Grid do cabeçalho idêntico ao das linhas.
13. Dez colunas: # · Vendedor · Visitados · Criados · Reuniões · Follow-ups · Mudanças · Notas · Tarefas · Ações.
14. Ordem vinda do hook, **sem reordenação no componente**.
15. Score = `visited*3 + created*2 + meetings + follow_ups + stage_changes + notes`.
16. Rank em `#C8131B` nos três primeiros.
17. Avatar do próprio usuário em `--tint-red`/`--tint-red-text`.
18. Visitados é a única numérica com destaque de peso; as outras cinco em `--text-secondary`.
19. Tarefas "`pending` / `done`" cruzadas por `id_hubspot`, com "—" quando ausente; pendentes ≥ 5 em `--tint-red-text`.
20. Barra de Ações proporcional ao maior score.
21. Rodapé menciona que contas RPA ficam fora; **o filtro continua no hook**, não no componente.
22. Rail: quatro cards-link + bloco de exportação.
23. Cada card do rail abre o **drawer padrão de 480px**, não acordeão.
24. `RouteConfigCard`, `SellerGoalsCard`, `DismissedContaAlvoCard` e a criação de usuário **continuam funcionando**.
25. Dois botões de exportação, rótulo flush-left, `exportReport` e a edge inalterados.
26. Drill-down no drawer de 480px, abrindo de todos os números.
27. `actor_name` visível quando difere do responsável.
28. `status_breakdown` com destino definido (não simplesmente removido).
29. **Nenhum número com cor decorativa.** Cor só em: rank top-3, tarefas em risco, barra de score, dots da composição.
30. Milhares com separador pt-BR (`toLocaleString('pt-BR')`).
31. Nenhum hexadecimal fora dos literais permitidos; spacing na escala 8pt.
32. Abaixo de 1280px o rail desce; abaixo de 1024px a tabela reduz.
33. Modo escuro conferido — nenhum `#94090F` / `#167532` como cor de texto.

## Armadilhas conhecidas

- **Métrica inventada.** Se aparecer funil, heatmap, MRR ou conversão, os números são falsos. É o defeito nº 1 desta tela.
- **Números em arco-íris** — roxo, azul, verde, laranja, amarelo no mesmo bloco. A cor tem que significar algo.
- **Blocos de 500px por vendedor mantidos** — 17 vendedores = 8.500px de rolagem, e comparar fica impossível.
- **Reordenação local** duplicando o que o hook já faz, com critério diferente.
- **`queryKey` mexida** → refetch infinito nos presets relativos. O bug está documentado no hook.
- **Cards do rail como acordeão** em 320px — conteúdo apertado e vizinhos empurrados.
- **`status_breakdown` e os cards auxiliares descartados** ao reorganizar.
- **Drill-down pré-carregado** em vez de sob demanda — era exatamente a lentidão que o RPC resolveu.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com os screenshots
- **1280px** (rail desce) e **1024px** (tabela reduz)
- Alternar o tema e repetir no escuro
- Trocar os cinco presets de período e confirmar que **todos carregam** (o bug do refetch infinito aparece aqui)
