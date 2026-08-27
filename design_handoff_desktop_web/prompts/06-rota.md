# Prompt 06 — Rota

Cole este prompt inteiro no Claude Code, na raiz do repo `PWA-app-outbound`.
Rode **um prompt por vez** e confira o resultado antes de passar para o próximo.

**Contexto obrigatório**: leia `design_handoff_desktop_web/README.md` antes de editar — as seções *Design Tokens*, *Grid e chrome global* e a de tela específica citada abaixo. Todos os valores vêm de lá. Não invente cor, espaçamento, raio ou tamanho de tipo.

Leia a seção **`3. Rota do dia`** do README (layout, medidas e copy) e o screenshot `screenshots/03-rota.png`.

**Pré-requisito**: prompt 02 rodado — a tela deve estar em `src/screens/RotaScreen.tsx`. Se ainda estiver dentro do `App.tsx` (`renderRouteScreen`, ~L2699), rode o 02 primeiro.

## O que existe hoje

Uma coluna de cartões empilhados, desenhada para celular e esticada no desktop:

- card **"Rota personalizada"** (`styles.panelCard` + `panelTitle` + `panelHint`) — quantidade de leads, seleção de status, responsável
- card **"Adicionar lead manualmente"** — busca por nome
- lista de paradas via `renderCompactClient`, com o índice em `styles.routePosition`
- estado vazio: *"Nenhum lead na rota. Use a sugestao ou abra um pin no mapa."*
- cards auxiliares importados: `RouteConfigCard`, `RouteHistorySection`, `MinhaDailyCard`, `DismissedContaAlvoCard`

## Para onde vai

**Duas colunas**: mapa à esquerda (`flex:1`) + rail de **420px** à direita (`flex:0 0 420px`). No mapa, a polyline e as paradas numeradas; no rail, a sequência do dia.

O rail tem três faixas: topo com data + navegação de dia + três KPIs (paradas · distância · em rota), lista de paradas rolável no meio, e rodapé fixo com "Iniciar navegação" (Large filled) e "Otimizar paradas" (Large outline).

Medidas exatas, cores de tag por estado da parada e anatomia da linha: no README.

## Decisões a tomar

- **"Rota personalizada" e "Adicionar lead manualmente"** não cabem no rail sem empurrar a sequência para baixo. Coloque as duas atrás de um botão de configuração no topo do rail, abrindo o drawer padrão de 480px (o mesmo componente da ficha do lead — não invente um segundo padrão de painel). Se preferir outra solução, mantenha a regra: **a sequência do dia é o que ocupa o rail**.
- `RouteHistorySection` e `MinhaDailyCard` também vão para dentro desse drawer, ou para uma segunda aba do rail. Não empilhe acima da lista.
- Preserve a composição por largura: abaixo de 1024px a tela volta a ser coluna única, como é hoje.


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

- [ ] mapa e rail lado a lado em 1440px; coluna única abaixo de 1024px
- [ ] a lista de paradas é o elemento dominante do rail
- [ ] reordenação por arraste funciona (handle `drag_indicator`)
- [ ] os dois CTAs do rodapé têm rótulo flush-left
- [ ] nenhuma funcionalidade da tela antiga desapareceu — rota personalizada, adicionar manual, histórico e daily continuam alcançáveis
- [ ] modo escuro conferido
