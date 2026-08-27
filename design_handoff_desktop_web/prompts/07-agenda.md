# Prompt 07 — Agenda

Cole este prompt inteiro no Claude Code, na raiz do repo `PWA-app-outbound`.
Rode **um prompt por vez** e confira o resultado antes de passar para o próximo.

**Contexto obrigatório**: leia `design_handoff_desktop_web/README.md` antes de editar — as seções *Design Tokens*, *Grid e chrome global* e a de tela específica citada abaixo. Todos os valores vêm de lá. Não invente cor, espaçamento, raio ou tamanho de tipo.

Leia a seção **`4. Agenda`** do README e o screenshot `screenshots/04-agenda.png`.

**Pré-requisito**: prompt 02 rodado — `src/screens/AgendaScreen.tsx`. Se ainda estiver no `App.tsx` (`renderAgendaScreen`, ~L3384), rode o 02 primeiro.

## O que existe hoje

Lista cronológica única (passado / hoje / futuro), montada em `allAgendaItems` juntando três fontes: `routeStops`, reuniões e follow-ups. Cada item é renderizado por `renderMeetingChip`. Estado vazio: *"Agenda vazia."* Já existem estilos de calendário semanal (`calSemana`, `calDia`, `calDiaHoje`, `calDiaTitulo`, `calVazio`, `calNav`, `calNavBotao`) marcados como **só desktop** — é a base do que este redesign quer, e provavelmente estão subaproveitados.

## Para onde vai

**Calendário de sete colunas**: `grid-template-columns: repeat(7, minmax(0,1fr))`, gap 8, coluna com `min-height: 520px`. A semana inteira de uma vez, no lugar da lista.

Barra acima: navegação de semana + botão "Hoje" (Small) à esquerda; legenda de tipos e "Exportar JSON" (Large outline teal) à direita.

Item dentro da coluna do dia: `padding:8px`, raio 4, borda esquerda 3px na cor do tipo, fundo = tint do tipo. Hora, título, sublinha. **Rota `#C8131B` · Demo `#7c3aed` · Follow-up `#01AFFF`.**

Coluna de hoje: borda `#C8131B`, cabeçalho com fundo `--tint-red`.

## Decisões a tomar

- Os estilos `cal*` existentes já cobrem parte disso. **Reaproveite e ajuste aos tokens do README** em vez de criar um conjunto paralelo.
- Um dia com muitos compromissos estoura os 520px. Defina o comportamento: coluna rolável, ou "+N mais" abrindo o dia num drawer. Escolha uma e aplique nas sete.
- O filtro por vendedor (gestor) vai para a barra de cima, ao lado da navegação de semana.
- A exportação JSON chama a edge `export-agenda` — **não mexa no payload**.
- Abaixo de 1024px, volta a ser a lista cronológica atual. O calendário de 7 colunas é desktop.


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

- [ ] sete colunas em 1440px, com hoje destacado
- [ ] os três tipos de item aparecem com a cor e o tint corretos
- [ ] as três fontes de dados continuam entrando (`routeStops`, reuniões, follow-ups)
- [ ] navegação de semana e "Hoje" funcionam
- [ ] "Exportar JSON" continua funcionando
- [ ] dia cheio tem comportamento definido, não vaza
- [ ] abaixo de 1024px cai para a lista cronológica
- [ ] modo escuro conferido
