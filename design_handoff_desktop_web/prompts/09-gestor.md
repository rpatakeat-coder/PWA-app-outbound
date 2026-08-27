# Prompt 09 — Painel do gestor

Cole este prompt inteiro no Claude Code, na raiz do repo `PWA-app-outbound`.
Rode **um prompt por vez** e confira o resultado antes de passar para o próximo.

**Contexto obrigatório**: leia `design_handoff_desktop_web/README.md` antes de editar — as seções *Design Tokens*, *Grid e chrome global* e a de tela específica citada abaixo. Todos os valores vêm de lá. Não invente cor, espaçamento, raio ou tamanho de tipo.

Leia a seção **`6. Painel do gestor`** do README e o screenshot `screenshots/06-gestor.png`.

Arquivo: `src/screens/GestorScreen.tsx` (**47 KB — leia inteiro antes de editar**). Dados: `src/hooks/useGestorMetrics.ts` e `src/hooks/useVisitsHeatmap.ts`.

## Antes de editar

Este é o arquivo maior do redesign. Comece assim:

1. Leia `GestorScreen.tsx` inteiro e **liste as seções que ele renderiza hoje**, na ordem, com o nome do estilo de cada bloco.
2. Leia `useGestorMetrics.ts` e liste **quais métricas existem de fato** — o design abaixo assume KPIs, funil por etapa, heatmap de visitas e uma tabela por vendedor. Se alguma não existir no hook, **diga qual e pare**: não invente métrica nem query nova.
3. Só então edite.

## Para onde vai

Quatro blocos, `padding:24px`, coluna gap 24, `max-width:1600px`:

1. **Faixa de KPIs** — `repeat(4, minmax(0,1fr))` gap 16. Visitas · Demos realizadas · Fechamentos · MRR novo. Valor 28/36 peso 700, delta na cor do sinal.
2. **Funil + rail** — `grid-template-columns: 8fr 4fr` gap 24. À esquerda, uma barra de **22px** por etapa com contagem e percentual; clique na etapa abre o modal com os leads. À direita, o heatmap da semana (células 28×28, três níveis, hoje-vazio tracejado) e o botão "Exportar relatório completo".
3. **Tabela do time** — grid `minmax(180px,2fr) repeat(6, minmax(88px,1fr))`. Vendedor · Visitas · Demos · Fechados · MRR novo · Conversão · Meta. Numéricas à direita, tabular-nums, MRR em verde. Linha clicável (drill-down).

Cores de etapa, tints de meta e medidas: no README.

## Decisões a tomar

- Se o arquivo hoje já tem drill-down por vendedor, **preserve o comportamento** e só reestilize.
- A exportação chama a edge `export-report` — **não mexa no payload nem no fluxo de signed URL**.
- Os cards auxiliares que hoje vivem nesta tela (`SellerClassificationCard`, `SellerGoalsCard`, `RouteHistorySection` se aplicável) precisam de lugar: ou entram como quarto bloco abaixo da tabela, ou vão para o drill-down do vendedor. **Escolha e justifique no commit** — não descarte.
- Abaixo de 1024px: KPIs em 2×2, funil em largura cheia, tabela reduzida às três colunas essenciais.


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

- [ ] você listou as seções atuais e as métricas reais do hook antes de editar
- [ ] nenhuma métrica nova foi inventada; nenhuma query mudou
- [ ] os quatro blocos na ordem e nas proporções do README
- [ ] clique na etapa do funil e na linha do vendedor continuam funcionando
- [ ] exportação de relatório funcionando
- [ ] os cards auxiliares têm lugar definido
- [ ] modo escuro conferido
