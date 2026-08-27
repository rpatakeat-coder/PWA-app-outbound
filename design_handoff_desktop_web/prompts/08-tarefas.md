# Prompt 08 — Tarefas

Cole este prompt inteiro no Claude Code, na raiz do repo `PWA-app-outbound`.
Rode **um prompt por vez** e confira o resultado antes de passar para o próximo.

**Contexto obrigatório**: leia `design_handoff_desktop_web/README.md` antes de editar — as seções *Design Tokens*, *Grid e chrome global* e a de tela específica citada abaixo. Todos os valores vêm de lá. Não invente cor, espaçamento, raio ou tamanho de tipo.

Leia a seção **`5. Tarefas (kanban)`** do README e o screenshot `screenshots/05-tarefas.png`.

**Pré-requisito**: prompt 02 rodado — `src/screens/TarefasScreen.tsx`. Se ainda estiver no `App.tsx` (`renderTasksScreen`, ~L3160), rode o 02 primeiro.

## O que existe hoje

Lista única de tarefas, com o recorte por papel (gestor vê todas, vendedor vê as suas) calculado em `visibleTasks` / `tasksActiveVendor` — **valores compartilhados com o badge da barra de navegação**, então não mude o cálculo. Estado vazio: *"Nenhuma tarefa pendente."* Já existem estilos de kanban (`kanbanColuna`, com `width: 360`) e um card de regras ("Como as tarefas são geradas", `taskRulesCard`).

## Para onde vai

**Kanban de três colunas**, `display:flex; gap:16px; overflow-x:auto; align-items:flex-start`. Colunas de **380px** (`flex:0 0 380px`) — os 360 atuais ficam apertados com dois botões no card.

**Atrasadas `#C8131B` · Hoje `#FFB32F` · Próximas `#0ea5e9`.**

Cabeçalho da coluna: dot 10px + título + contagem em pill com o tint do estado. Card: lead + badge de SLA (D2/D5), a tarefa, metadados (prazo, vendedor) e duas ações — "Agendar" (tonal, `flex:1`) e concluir (32×32 outline).

Medidas, tints de SLA e anatomia completa: no README.

## Decisões a tomar

- **A regra de agrupamento nas três colunas** vem do SLA e da data de vencimento. Use `src/utils/sla.ts` e o campo de vencimento da task — não invente critério. Atrasadas = vencimento no passado; Hoje = vence hoje; Próximas = futuro.
- O card "Como as tarefas são geradas" (`taskRulesCard`) vira um botão de ajuda no topo da tela, abrindo o mesmo modal que já existe. Não ocupe uma coluna com ele.
- O filtro por vendedor (gestor) vai para o topo da tela, acima das colunas.
- Conclusão é **toggle otimista**: pinta na hora, persiste em seguida, reverte se falhar. Se hoje já é assim, preserve.
- Abaixo de 1024px, volta a ser lista única. Kanban com rolagem horizontal não serve no celular.


## Regras que valem para esta tela

- Cores, espaçamentos, raios, sombras e tipografia: **só os tokens do README**. Nenhum hexadecimal novo. Os literais permitidos são a temperatura do funil (`TEMP_COLORS`), os tints de etapa/estado e o vermelho da marca.
- Alvo tocável no desktop: 40px. Botão Large = altura 40, raio 12, tipo 14/600. Botão Medium (32px) só em ação secundária de modal ou ação de linha.
- Rótulo de botão é **flush-left** quando o botão é mais largo que o texto (`justify-content: flex-start; padding: 0 16px`).
- Números com `font-variant-numeric: tabular-nums`.
- Foco: `outline: 2px solid #016999; outline-offset: 2px`.
- **Confira o modo escuro** antes de considerar pronto. `#94090F` e `#167532` reprovam como cor de texto sobre superfície escura — usar `--tint-red-text` / `--tint-green-text`.
- `npm run typecheck` limpo no fim.

## Não mexer

Nada de comportamento muda nesta tarefa. Se o diff tocar nestes pontos, é regressão:

- os hooks de dados e suas queries
- `src/constants/stages.ts` (etapas, IDs, `subFields`, regras de avanço)
- `src/utils/` (roteamento, geocoding, hubspotSync)
- service worker, `useForceReload`, `vercel.json`
- clustering do mapa e carregamento por área visível

## Pronto quando

- [ ] três colunas de 380px, com contagem correta em cada uma
- [ ] o critério de agrupamento vem de `sla.ts` / vencimento, não de heurística nova
- [ ] `visibleTasks` / `tasksActiveVendor` intactos — **o badge da nav continua com o mesmo número**
- [ ] badge de SLA com o tint certo (D5 vermelho, D2 âmbar)
- [ ] concluir e "Agendar" funcionam; conclusão é otimista
- [ ] o modal de regras continua alcançável
- [ ] abaixo de 1024px cai para lista única
- [ ] modo escuro conferido
