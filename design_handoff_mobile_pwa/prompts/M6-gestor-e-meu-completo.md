# M6 — Gestor e Meu desempenho (prompt único)

**Arquivos:** `src/screens/GestorScreen.tsx` (47 KB) · `src/screens/MeuDesempenhoScreen.tsx` · leitura de `src/hooks/useGestorMetrics.ts`, `useVisitsHeatmap.ts`, `useSellerGoals.ts`, `useMinhaDaily.ts`
**Referência visual:** `screenshots/06-gestor.png`, `07-meu-desempenho.png`, `16-dark-meu-desempenho.png`.
**Perguntas que as telas respondem:** Gestor — *quem está entregando?* · Meu — *estou no ritmo da meta?*

> Substitui `08a-inventario.md`, `08b-gestor.md`, `08c-meu-desempenho.md` e `08R-revisao.md` — leia só este.
> `M0`, `M1`, `M2`/`M2b`, `M3`, `M4` e `M5` já rodaram.
>
> São duas telas irmãs, mesma anatomia de KPI: por isso vêm num prompt só. Não toque em nenhuma outra.

**Tokens mobile ≠ desktop.** Maior tipo **18/24** — nada de 22/28, 24 ou 28/36. Card raio **16** · botão 48px raio 12 · spacing só até **24** · alvo **48px** · raios só `4 · 12 · 16 · pill`.

**As duas telas não têm bottom nav** (são alcançadas pelo menu do perfil): `padding-bottom` de **16**, não 40. Nenhuma reserva de FAB aqui.

---

## Fase 1 · Inventário — sem editar nada

É o passo que faltou nas tentativas anteriores: sem ele, o redesign destas duas telas vira invenção de métrica.

1. Ler `GestorScreen.tsx` **inteiro** e listar as seções que renderiza hoje, na ordem, com o nome do estilo de cada bloco.
2. O mesmo para `MeuDesempenhoScreen.tsx`.
3. Ler os quatro hooks e listar **quais métricas existem de fato**, com o nome exato do campo retornado.
4. Preencher:

| O redesign pede | Tela | Existe? | Campo |
|---|---|---|---|
Visitas (mês) | Gestor | | |
Demos | Gestor | | |
Fechamentos | Gestor | | |
MRR novo | Gestor | | |
Contagem por etapa do funil | Gestor | | |
Por vendedor: visitas e fechados | Gestor | | |
Meta por vendedor (% ou status) | Gestor | | |
Meta do mês do próprio vendedor | Meu | | |
% da meta | Meu | | |
Visitas / Demos / Conversão | Meu | | |
Tarefas atrasadas | Meu | | |
Heatmap de visitas por dia | ambos | | |

5. Listar os auxiliares importados por cada tela (`SellerClassificationCard`, `SellerGoalsCard`, `MinhaDailyCard`, `RouteHistorySection`, `RouteConfigCard`, `DismissedContaAlvoCard`, outros).
6. Dizer se existe drill-down por vendedor no Gestor e como abre.

**Se uma métrica do desenho não existir, diga qual e não a desenhe.** Não crie query nem cálculo derivado sem confirmação — omitir o bloco é melhor que inventar número.

Entregue a tabela **antes** de começar a fase 2, na mesma resposta.

---

## Fase 2 · Aplicar

### Header (as duas telas)

`padding:12px 16px`, fundo do tema: **`arrow_back` 48×48 raio 12 `rgba(255,255,255,.18)`** (`IconArrowBack`) + título 18/24 peso 600 e sublinha 12/16/0.4. Sem aba, a tela precisa de volta explícita — sem o `arrow_back` ela fica sem saída.

Hoje as duas são alcançadas pelo provisório do M1 (`setTab('config')`); o menu do perfil chega no M7. O `arrow_back` volta para de onde veio.

### Anatomia do KPI (compartilhada pelas duas)

`grid-template-columns:1fr 1fr` gap 12. Card `padding:16px`, raio **16**, fundo `--surface`, borda 1px `--border`, sombra 01:

- rótulo 12/16/0.5 peso 600 `--text-faint`
- valor **18/24 peso 700** `tabular-nums` (28/36 é desktop)
- delta 11/16/0.5 peso 600 na cor do sinal — **`--tint-green-text` / `--tint-red-text`**, tokens, não hexes

### Gestor

Corpo `padding:16px`, coluna gap 16, na ordem:

1. **KPIs 2×2** — os quatro que a fase 1 confirmar.
2. **Funil** — card `padding:16px` raio 16. Por etapa: rótulo 12/16/0.5 peso 600 + contagem à direita `--text-faint` `tabular-nums`; barra de **18px** de altura (o desktop usa 22), raio 4, trilha `--surface-3`, preenchimento na cor da etapa **vinda de `stages.ts`** (Prospecção `#0ea5e9` · Visita `#14b8a6` · Conversa `#8B5CF6` · Demo/Proposta `#FFB32F` · Negociação `#f97316` · Ag. Pagamento `#C8131B` · Fechado `#16a34a` · Perdido `#475569`).
3. **Time** — card raio 16. Linha `padding:10px 0`, borda inferior 1px `--border`: avatar 32px pill `--surface-2`/`--text-muted` com iniciais, nome 14/20/0.1 peso 600 truncado sobre "`{n}` visitas · `{n}` fechados" 11/16/0.5 `--text-faint`, badge de meta à direita — `#EAF7EE`/`#167532` no alvo, `#FFF8EB`/`#99670F` abaixo.

**A tabela de 7 colunas do desktop não cabe em 390px.** Cada vendedor é uma linha de duas alturas com as duas métricas que importam e a meta. **Se houver drill-down, preserve** — a linha inteira é o alvo (mín. 48px).

Auxiliares (`RouteConfigCard`, `RouteHistorySection`, `DismissedContaAlvoCard`, `SellerClassificationCard`, `SellerGoalsCard`): **nenhum desaparece.** Dê destino — bloco no fim ou dentro do drill-down — e declare qual foi.

### Meu desempenho

Corpo `padding:16px`, coluna gap 16:

1. **Banner de meta** — `padding:16px`, raio **16**, fundo `#C8131B`. Kicker "META DE {MÊS}" (11/16, `.12em`, peso 800, `rgba(255,255,255,.75)`, uppercase); título **18/24 peso 700**; **barra de progresso** altura 8 raio 4, trilha `rgba(255,255,255,.25)`, preenchimento branco, `margin-top:12px`; sublinha 12/16/0.4 `rgba(255,255,255,.85)`. É o único bloco vermelho chapado além do header. A barra substitui os dois números grandes que o desktop põe à direita — em 390px não há espaço para eles.
2. **KPIs 2×2** — Visitas no mês · Demos · Conversão · Atrasadas (delta em `--tint-red-text`).
3. **Heatmap da semana** — card raio 16, grade `repeat(7,1fr)` gap 4, células `aspect-ratio:1` raio 4, **fluidas** (não os 28px fixos do desktop): `--surface-3` vazio · `#8FE0D5` 1–2 · `#1D9688` 3+ · **hoje vazio = `1.5px dashed #C8131B`**.
4. **`MinhaDailyCard` e `SellerGoalsCard`** entram como bloco abaixo, casca de card raio 16. Não descarte.

Se **"ritmo"** não existir nos hooks, **omita a frase** em vez de inventar cálculo.

---

## Não fazer

- Não invente métrica nem crie query: use o que a fase 1 confirmou.
- Não porte tipo de desktop (28/36, 22px de barra, 28px de célula, tabela de 7 colunas).
- Não descarte auxiliar.
- Não use `#167532`/`#94090F` como cor de texto sobre superfície do tema — são `--tint-green-text` / `--tint-red-text`.
- Não adicione reserva de FAB: estas telas não têm barra.

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Ambas com header `arrow_back` 48×48.
2. Nenhuma com bottom nav; `padding-bottom` 16.
3. Gestor: KPIs 2×2, card raio 16, valor **18/24 peso 700**.
4. Delta em `--tint-green-text` / `--tint-red-text`, não hexes.
5. Funil com barra de **18px** e cores de `stages.ts`.
6. Time em linhas de duas alturas com avatar 32px e badge de meta — não a tabela de 7 colunas.
7. Drill-down preservado (se existia), com alvo ≥ 48.
8. Meu: banner raio 16, título **18/24 peso 700**, barra de progresso de 8px.
9. Meu: KPIs 2×2 com valor 18/24; delta de atrasadas em `--tint-red-text`.
10. Heatmap com células `aspect-ratio:1` fluidas e o **hoje-vazio tracejado `1.5px dashed #C8131B`**.
11. Todos os auxiliares presentes, com destino declarado.
12. Nenhuma métrica inventada; nenhuma query nova.
13. Nenhum hex fora dos literais permitidos; spacing ≤ 24; maior tipo 18/24; raios só `4 · 12 · 16 · pill`; alvo ≥ 48.
14. `npm run typecheck` limpo.

Os controles destas telas na lista dos 23 abaixo de 48px — **`navBtn` e `periodoChip` 36 no Gestor, `periodoChip` 36 no Meu** — devem sair resolvidos ou declarados. Diga o que aconteceu com cada um.

**Conferir em 390 × 844**, comparar com `06-gestor.png`, `07-meu-desempenho.png` e `16-dark-meu-desempenho.png`, **alternar o tema e repetir no escuro**.

## Ao terminar

A tabela da fase 1, depois três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o campo que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
