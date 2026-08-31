# M3c — Rota: gerar a rota e expandir o mapa

**Arquivo:** `App.tsx` — `cartaoRotaDoDia` ~L2717–2737 · `cartaoPersonalizada` ~L2740–2867 · `cartaoAdicionar` · `cartaoLista` ~L2944–3015 · composição ~L3139–3152 · `generateDailyRoute` ~L1599–1740
**Alvo visual:** `design_handoff_mobile_pwa/M3c - Gerar rota do dia.dc.html` — **1a** sem paradas · **1b** com paradas · **1c** o sheet de montagem · **1d** mapa expandido. Abra no browser e bata o resultado contra eles.
**Referência:** `design_handoff_mobile_pwa/README.md` §*2. Rota* · `prompts/M3-rota-completo.md` (o que já rodou)

> Duas queixas reais do uso: **não há como gerar a rota** (o M3 mandou o CTA para o sheet e ele ficou a dois toques, sem pista na tela) e **o mapa é muito enxuto** nesta aba.
>
> **Só a aba Rota.** Não toque no Mapa/Lista, na Agenda, nas Tarefas nem em outro overlay. Rode o **M3b antes** deste — ele conserta o `panelHeaderRow` que este prompt reaproveita.

**Tokens mobile:** botão 48 raio 12 · card raio 16 · sheet raio `16px 16px 0 0` · spacing ≤ 24 (+40 de reserva de FAB) · alvo ≥ 48 · maior tipo 18/24 · raios só `4 · 12 · 16 · pill`.

---

## Fase 1 · Confirmar — sem editar nada

1. `generateDailyRoute` (~L1599) — confirme que ela **não precisa de nenhum campo do cartão** para rodar: base = `userLocation` com fallback em `routeStartOverride`, meta = `DAILY_GOAL`. Diga se algum input hoje vem de estado editável do cartão.
2. Onde os três auxiliares (`cartaoRotaDoDia`, `cartaoPersonalizada`, `cartaoAdicionar`) foram parar no M3 — nome do sheet/estado que os abre.
3. O que a tela renderiza hoje quando `routeDisplayClients.length === 0` (o print mostra KPIs em "—" e um "Abrir mapa" cinza).
4. A altura fixa do mapa na Rota e como ela é definida.
5. Onde vivem hoje os botões de **calor** (`heatOn`) e **recentrar** — o M2b deixou anotado que eles vazam para a faixa de mapa da Rota.

Entregue isso **antes** da fase 2, na mesma resposta.

---

## Fase 2 · Aplicar

### A · Estado sem paradas: a tela é o CTA (quadro 1a)

Quando `routeDisplayClients.length === 0`:

- **O header perde a faixa de KPIs.** Três "—" não informam nada. Ficam só o kicker "ROTA DE HOJE", a data 18/24 peso 600 e o avatar 48px.
- **O mapa continua** — é o caminho de "abrir um pin", citado na própria copy atual. Ele ocupa o espaço que sobra.
- **Peek sheet sobre o mapa**, ancorado no rodapé: raio `16px 16px 0 0`, fundo `--surface`, borda superior 1px `--border`, `box-shadow:0 -2px 12px rgba(0,0,0,.10)`, `padding:12px 16px 40px`, handle 36×4 centralizado.
  - "Nenhuma parada hoje" 18/24 peso 600
  - explicação 14/20/0.25 `--text-muted`: monta as obrigatórias e completa até a meta, partindo de onde você está — **reaproveite a copy do `cartaoRotaDoDia`, não escreva outra**
  - **"Gerar Rota do dia"** — 48px, raio 12, `#C8131B`, largura total, ícone `bolt`, ligado direto em `generateDailyRoute`. Estado de carregando: `ActivityIndicator` no lugar do rótulo, como já é hoje.
  - abaixo, dois secundários 48px raio 12 outline, `flex:1` cada: **"Montar eu mesmo"** (abre o sheet do 1c) e **"Abrir um pin"** (`setTab('map')` — o que o "Abrir mapa" faz hoje)
- **Preserve o guard de GPS:** sem `userLocation` e sem `routeStartOverride`, o `Alert.alert('Sem localização', …)` atual continua valendo. Não substitua por botão desabilitado sem dizer o motivo.

### B · Estado com paradas: entrada visível, sem competir (quadro 1b)

A sequência continua sendo o objeto de trabalho. O CTA volta como **"Refazer rota"** no cabeçalho da lista: linha com "SEQUÊNCIA · {n} PARADAS" 12/16/0.5 peso 700 `--text-muted` uppercase à esquerda e o text button "Refazer rota" à direita — 48px de alvo, `padding:0 12px`, ícone `tune` 20px + rótulo 14/20/0.1 peso 600 `#018CCC`. Abre o sheet do 1c.

Não ponha um botão vermelho cheio aqui: gerar de novo **descarta a rota em andamento**, e um CTA primário ao lado da sequência convida ao acidente.

### C · Sheet de montagem (quadro 1c)

Os três auxiliares do M3 continuam no sheet — **nada desaparece** — mas com hierarquia declarada. Raio `16px 16px 0 0`, `padding:12px 16px 32px`, handle 36×4, título "Montar a rota" 18/24 peso 600 + sublinha 12/16/0.4.

1. **Rota do dia** em destaque: card `padding:16px` raio 16, fundo `--tint-red`, borda 1px `#C8131B`, ícone `bolt` 24px `--tint-red-text` + título 16/24/0.15 peso 600 + a explicação atual das obrigatórias 12/16/0.4, e o botão "Gerar Rota do dia" 48px `#C8131B` largura total.
2. **Rota personalizada** e **Adicionar lead manualmente** como cards-link `padding:16px` raio 16 borda 1px `--border`: ícone 24px `--text-muted` + título 16/24/0.15 peso 600 sobre descrição 12/16/0.4 + `chevron_right`. Abrem os formulários que já existem — **não reescreva `cartaoPersonalizada` nem `cartaoAdicionar`**, só o ponto de entrada.

Se a rota atual não estiver vazia, "Gerar Rota do dia" **confirma antes de sobrescrever** (`Alert` com Cancelar / Gerar), no mesmo padrão do "Limpar rota".

### D · Expandir o mapa (quadro 1d)

Novo estado `mapaExpandido` (só na aba Rota, `false` por padrão, **não persiste** entre sessões).

**Botão de expandir:** 48×48 pill sobre o mapa, canto **superior direito**, fundo `--surface`, borda 1px `--stroke-default`, `0 1px 3px rgba(0,0,0,.12)`, ícone `open_in_full` 22px `--text-muted`. `accessibilityLabel="Expandir mapa"`.

**Expandido:**
- header e bottom nav **somem**; o mapa ocupa a tela
- os três KPIs viram **uma pílula** sobre o mapa no topo: 48px, raio 16, `--surface`, borda 1px `--stroke-default`, sombra — "{n}" 14/20/0.1 peso 700 `tabular-nums` + "paradas · {km} km · {min} min" 12/16/0.4
- ao lado dela, o botão de **recolher** 48×48 pill com `close_fullscreen`, ícone `--tint-red-text`
- **recentrar e calor** ficam no canto inferior esquerdo, 48×48 pill cada — **é aqui que eles passam a morar**, resolvendo o vazamento anotado no M2b
- a sequência recolhe para **peek**: handle, pino 32px + nome da **próxima parada** truncado sobre "Próxima parada · {km} · {motivo}" 12/16/0.4, e duas ações 48px — "Navegar" (`#16a34a`) e "Ver as {n} paradas" (outline, abre o peek por inteiro)
- arrastar o handle para cima traz a sequência completa; **fechar também no botão de voltar do sistema** (Android/PWA) — sair da tela não deve ser a única saída
- reserva de rodapé **40** no peek, como nas outras telas com barra; sem barra visível, mantenha os 40 (a área de gestos continua lá)

**Não** duplique o mapa: é o mesmo `MapView`, com a altura mudando. Não recrie a instância ao expandir — o mapa perderia o centro e o zoom.

---

## Não fazer

- Não mude `generateDailyRoute`, `assembleDailyRoute`, `DAILY_GOAL`, `saveRoute` nem a otimização.
- Não reescreva as copies existentes; reaproveite as do `cartaoRotaDoDia`.
- Não descarte auxiliar: os três continuam alcançáveis.
- Não persista `mapaExpandido`.
- Não deixe o CTA primário ao lado da sequência quando já existe rota.
- Não altere o layout desktop desta tela.

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Sem paradas: header **sem** a faixa de KPIs; nada de "—".
2. Sem paradas: mapa presente + peek sheet com "Gerar Rota do dia" 48px `#C8131B` largura total.
3. "Gerar Rota do dia" chama `generateDailyRoute` **em um toque**, com o `ActivityIndicator` atual.
4. Guard de GPS preservado (`Alert.alert('Sem localização', …)`).
5. "Montar eu mesmo" e "Abrir um pin" como secundários 48px.
6. Com paradas: "Refazer rota" no cabeçalho da sequência, alvo ≥ 48, sem CTA primário competindo.
7. Sobrescrever rota não-vazia pede confirmação.
8. Sheet com Rota do dia em destaque + os dois manuais como cards-link; **os três auxiliares seguem alcançáveis**.
9. Botão `open_in_full` 48×48 no canto superior direito do mapa.
10. Expandido: header e barra somem; KPIs em pílula; recolher com `close_fullscreen`.
11. **Recentrar e calor no expandido** — e fora da faixa de mapa do estado normal (pendência do M2b).
12. Peek com a próxima parada + "Navegar" + "Ver as {n} paradas"; reserva 40.
13. Botão de voltar do sistema recolhe o mapa.
14. `MapView` **não** é recriado ao expandir (centro e zoom preservados).
15. `mapaExpandido` não persiste.
16. Nenhum hex fora dos literais permitidos; spacing ≤ 24 (+40); maior tipo 18/24; raios só `4 · 12 · 16 · pill`; alvo ≥ 48.
17. Desktop inalterado.
18. `npm run typecheck` limpo.

**Conferir em 390×844**, comparar com os quadros 1a–1d, **alternar o tema e repetir no escuro**, e testar o expandido no PWA instalado (nada embaixo da barra de gestos).

## Ao terminar

As respostas da fase 1, depois três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar e por quê** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
