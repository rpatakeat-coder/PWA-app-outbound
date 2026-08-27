# 09a — Inventário do Gestor (não edite nada)

**Arquivos:** `src/screens/GestorScreen.tsx` (47 KB), `src/hooks/useGestorMetrics.ts`, `src/hooks/useVisitsHeatmap.ts`

> **Este prompt não muda uma linha de código.** É o passo que faltou nas tentativas anteriores: sem ele, o redesign do Gestor vira invenção de métrica.

## Fazer

1. Ler `GestorScreen.tsx` **inteiro** e listar as seções que ele renderiza hoje, **na ordem**, com o nome do estilo de cada bloco. Formato: `1. <título visível> — styles.<nome> — <o que mostra>`.
2. Ler `useGestorMetrics.ts` e listar **quais métricas existem de fato**, com o nome exato do campo retornado.
3. Ler `useVisitsHeatmap.ts` e dizer qual é a granularidade do dado (por dia? por vendedor? que janela?).
4. Cruzar com o que o redesign pede e responder:

| O redesign pede | Existe no hook? | Campo | Observação |
|---|---|---|---|
| Visitas (total do mês) | | | |
| Demos realizadas | | | |
| Fechamentos | | | |
| MRR novo | | | |
| Contagem por etapa do funil | | | |
| Heatmap de visitas por dia da semana | | | |
| Por vendedor: visitas, demos, fechados, MRR, conversão, meta | | | |

5. Listar os componentes auxiliares que esta tela importa hoje (`SellerClassificationCard`, `SellerGoalsCard`, `RouteHistorySection`, outros).
6. Dizer se existe drill-down por vendedor hoje e como ele abre.

## Pronto quando

- [ ] a lista de seções atuais está completa e ordenada
- [ ] a tabela acima está preenchida
- [ ] **se alguma métrica não existe, você disse qual e parou** — não sugira query nova nem valor derivado sem eu confirmar
- [ ] nenhum arquivo foi modificado
