# 09a — Correção: o design do Gestor foi refeito

> **Leia antes de qualquer prompt desta pasta.** Se você já aplicou uma versão anterior do painel do gestor, ela estava baseada em métricas que **não existem** no projeto.

## O que estava errado

A primeira versão do design do painel do gestor assumia:

| Assumido | Existe em `useGestorMetrics`? |
|---|---|
Funil comercial por etapa (8 barras) | **Não** |
Heatmap de visitas por dia da semana | **Não** |
MRR novo por vendedor | **Não** |
Taxa de conversão por vendedor | **Não** |
Meta por vendedor como coluna de tabela | **Não** (existe como card no rail: `SellerGoalsCard`) |
Delta "+12% vs julho" | **Não** — o hook não compara períodos |

Nada disso vem do banco. Se a implementação anterior mostrou esses blocos, ou eles estão com número inventado, ou foram deixados de fora e a tela ficou meio-feita.

## O que o hook realmente entrega

`src/hooks/useGestorMetrics.ts` → RPC `gestor_metrics`:

**`global` — snapshot atual (independente do período):**
`total_clients` · `total_leads` · `total_visited` · `total_active_clients` · `total_churn`

**`global` — atividade no período:**
`created_in_period` · `visited_in_period` · `meetings_in_period` · `follow_ups_in_period` · `stage_changes_in_period` · `notes_in_period` · `won_in_period`

**`sellers[]` — por vendedor:**
`full_name` · `email` · `id_hubspot` · `sector` · `leads_assigned` · `status_breakdown` · `created` · `visited` · `meetings_scheduled` · `follow_ups_scheduled` · `stage_changes` · `notes_created` · `won_in_period`

Ordenado no próprio hook por **atividade ponderada**: `visited*3 + created*2 + meetings + follow_ups + stage_changes + notes`. Contas com "RPA" no nome ou e-mail são filtradas fora (`HIDDEN_SELLER_PATTERN`).

**`useGestorTaskMetrics`** → por vendedor, `pending` (snapshot) e `done` (no período), chaveado por `id_hubspot`.

**`useMetricLeads`** → os leads por trás de um número, sob demanda. É o que faz cada célula ser clicável.

## Duas descobertas que o design novo usa

**1. O snapshot é uma composição, não cinco números soltos.**
`total_leads + total_active_clients + total_churn = total_clients` (1.128 + 2.840 + 1.821 = 5.789). Cinco números empilhados em cards escondem isso; uma barra proporcional mostra de uma vez que 31% da base é churn. `total_visited` é de outra natureza — é marca de atividade, não estado — então fica **fora** da barra, separado por uma régua.

**2. `visited` pesa 3× no score.** O ranking já reflete isso. A coluna Visitados é a única que ganha destaque de peso na tabela; as outras cinco ficam em `--text-secondary`.

## O que o design novo faz

- **Barra de composição** da base + os três números clicáveis, com "já visitados" separado.
- **Seis cards de atividade** no período, em grid de 6, cada um clicável (abre o drill-down de `useMetricLeads`).
- **Ranking em tabela**, uma linha por vendedor — não um card de 500px de altura por vendedor. Com 17 vendedores, o layout atual gera ~8.500px de rolagem; a tabela cabe numa tela.
- **Rail de 320px** com os quatro cards de administração + o bloco de exportação.
- **Zero cor decorativa nos números.** Todos em `--text-primary` / `--text-secondary`. A cor entra só onde significa: rank nos três primeiros, tarefas pendentes acima de 5, e a barra de score.

## Como rodar isto

Leia `design_handoff_desktop_web/COMO-APLICAR.md` primeiro se ainda não leu. O resumo:

1. A pasta `design_handoff_desktop_web/` tem de estar **dentro do repo**, não anexada ao chat — os prompts referenciam o README e os screenshots por caminho relativo.
2. **Um arquivo por sessão.** Abra o Claude Code na raiz do repo e diga só isto:
   ```
   Leia design_handoff_desktop_web/prompts/09-gestor/09b-snapshot.md
   e execute o que está descrito. Não faça nada além do que o arquivo pede.
   ```
   Nada mais na mensagem. Sem "e depois o resto".
3. Aponte o caminho em vez de colar o conteúdo: colado, o prompt perde os caminhos relativos e ele não acha o README nem os screenshots.
4. Leia a resposta. Cada prompt fecha com três linhas — **a terceira** diz o que da especificação não deu para aplicar. É onde aparece "esse número não vem do hook".
5. `npm run typecheck`, abra a tela em 1440px, compare com o screenshot, alterne o tema. Commit. Só então o próximo.

## Ordem

1. `09b-snapshot.md` — barra de composição
2. `09c-atividade.md` — os seis cards do período
3. `09d-ranking.md` — a tabela de vendedores
4. `09e-rail.md` — administração e exportação
5. `09f-drill-down.md` — o modal de leads por métrica
6. `09R-revisao.md` — auditoria

Referência visual: `design_handoff_desktop_web/README.md` §*6. Painel do gestor* e os screenshots `17-gestor.png` / `18-gestor-ranking.png`.

## O que este arquivo pede que você faça agora

Este é o único prompt da pasta que **não edita código**. Faça o seguinte e pare:

1. Leia `src/hooks/useGestorMetrics.ts` inteiro.
2. Leia `src/screens/GestorScreen.tsx` (47 KB) e liste as seções que ele renderiza hoje, **na ordem**, com o nome do estilo de cada bloco. Formato: `1. <título visível> — styles.<nome> — <o que mostra>`.
3. Confirme, campo por campo, que a lista de "o que o hook realmente entrega" acima está correta. Se algum campo mudou de nome ou não existe mais, diga qual.
4. Liste os componentes auxiliares que a tela importa hoje (`RouteConfigCard`, `SellerGoalsCard`, `DismissedContaAlvoCard`, e o que mais houver).
5. Diga se existe drill-down por vendedor hoje e como ele abre.
6. Diga se algum bloco da tela mostra número que **não** vem de `useGestorMetrics` nem de `useGestorTaskMetrics` — e de onde vem.

**Não modifique nenhum arquivo.** Responda com as listas.
