# 08a — Inventário de Gestor e Meu desempenho (não edite nada)

**Arquivos:** `src/screens/GestorScreen.tsx` (47 KB), `src/screens/MeuDesempenhoScreen.tsx`, `src/hooks/useGestorMetrics.ts`, `src/hooks/useVisitsHeatmap.ts`, `src/hooks/useSellerGoals.ts`, `src/hooks/useMinhaDaily.ts`

> **Nenhuma linha de código muda aqui.** É o passo que faltou nas tentativas anteriores: sem ele, o redesign destas duas telas vira invenção de métrica.

## Fazer

1. Ler `GestorScreen.tsx` **inteiro** e listar as seções que renderiza hoje, na ordem, com o nome do estilo de cada bloco.
2. Mesmo para `MeuDesempenhoScreen.tsx`.
3. Ler os quatro hooks e listar **quais métricas existem de fato**, com o nome exato do campo retornado.
4. Preencher:

| O redesign pede | Tela | Existe? | Campo |
|---|---|---|---|
| Visitas (mês) | Gestor | | |
| Demos | Gestor | | |
| Fechamentos | Gestor | | |
| MRR novo | Gestor | | |
| Contagem por etapa do funil | Gestor | | |
| Por vendedor: visitas e fechados | Gestor | | |
| Meta por vendedor (% ou status) | Gestor | | |
| Meta do mês do próprio vendedor | Meu | | |
| % da meta | Meu | | |
| Visitas / Demos / Conversão | Meu | | |
| Tarefas atrasadas | Meu | | |
| Heatmap de visitas por dia | ambos | | |

5. Listar os componentes auxiliares importados por cada tela (`SellerClassificationCard`, `SellerGoalsCard`, `MinhaDailyCard`, `RouteHistorySection`, outros).
6. Dizer se existe drill-down por vendedor no Gestor e como abre.

## Pronto quando

- [ ] as duas listas de seções atuais estão completas
- [ ] a tabela está preenchida
- [ ] **se alguma métrica não existe, você disse qual e parou** — não sugira query nova sem eu confirmar
- [ ] nenhum arquivo foi modificado
