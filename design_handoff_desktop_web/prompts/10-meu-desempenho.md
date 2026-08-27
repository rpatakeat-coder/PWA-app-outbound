# Prompt 10 — Meu desempenho

Cole este prompt inteiro no Claude Code, na raiz do repo `PWA-app-outbound`.
Rode **um prompt por vez** e confira o resultado antes de passar para o próximo.

**Contexto obrigatório**: leia `design_handoff_desktop_web/README.md` antes de editar — as seções *Design Tokens*, *Grid e chrome global* e a de tela específica citada abaixo. Todos os valores vêm de lá. Não invente cor, espaçamento, raio ou tamanho de tipo.

Leia a seção **`7. Meu desempenho`** do README e o screenshot `screenshots/07-meu-desempenho.png`.

Arquivo: `src/screens/MeuDesempenhoScreen.tsx`. Dados: `src/hooks/useSellerGoals.ts`, `src/hooks/useMinhaDaily.ts`, e o mesmo `useGestorMetrics` no recorte do próprio vendedor.

## Antes de editar

Liste as seções atuais e confirme quais números os hooks realmente entregam. O design assume: meta do mês com progresso, MRR novo, visitas, demos, taxa de conversão e tarefas atrasadas. **Se algum não existir, diga qual e pare.**

## Para onde vai

`padding:24px`, coluna gap 24, `max-width:1200px`:

1. **Banner de meta** — `padding:24px`, raio 8, fundo `#C8131B`, texto branco. Kicker uppercase, título 28/36 peso 700 ("8 de 12 fechamentos"), sublinha com o que falta e o ritmo. À direita, dois números grandes: % da meta e MRR novo.
   **Este é o único bloco vermelho chapado da superfície desktop.** É a pergunta que a aba responde. Não replique o padrão em outra tela.
2. **Quatro KPIs** — `repeat(4, minmax(0,1fr))` gap 16, valor 24/32 peso 600. Visitas no mês · Demos · Taxa de conversão · Tarefas atrasadas (delta em vermelho).

## Decisões a tomar

- `MinhaDailyCard` e `SellerGoalsCard`, se estão nesta tela hoje, entram como terceiro bloco abaixo dos KPIs. Não descarte.
- O heatmap pessoal, se existir, segue o mesmo padrão do prompt 09 (células 28×28, três níveis, hoje-vazio tracejado).
- Abaixo de 1024px: KPIs em 2×2, banner empilhado.


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

- [ ] banner de meta com progresso real, não número fixo
- [ ] quatro KPIs com os números que os hooks entregam
- [ ] os cards auxiliares preservados
- [ ] modo escuro conferido — o banner vermelho tem texto branco nos dois temas
