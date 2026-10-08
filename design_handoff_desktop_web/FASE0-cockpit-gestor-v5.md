# Fase 0 · Cockpit do gestor v5

**Data:** 08/10/2026, fim da tarde.
**Insumos:**
- a entrega `go.zip`: 20 telas-alvo, o protótipo e o `dados-v5.js`;
- o código no ar (gestor v2 em `cockpit-unificado`, injetado pelos arquivos `gv2-*`);
- o banco `mxyjvijclhlxrlafqcrz`, medido como gestor.

## 0.1 Inventário

| Aba hoje | Arquivos | Fonte dos números | Destino no v5 |
|---|---|---|---|
| Menu lateral | `gv2-ui.js` (ABAS, navHTML), `gv2.css` (--nv-*) | — | **fica**; renomeia Time→Hoje, Raio X→Funil, Prospecção→Território |
| Time | `gv2-ui.js` render.time, `gv2-dados.js` montar | `planejamento_do_time`, `visitas_com_prova`, `DATA.agenda`, funil v4 | **muda** → Hoje (1a–1e) |
| Daily | `gv2-daily*.js` | idem | **fica** |
| Raio X › Funil | `gv2-v4-raiox.js`, `gv2-rxgav.js` (gaveta) | `funilLeads` + regras v4 | **muda** → Funil (5a–5b); saem os 5 cartões repetidos; gaveta fica |
| Raio X › Praça | `gv2-praca-ui.js`, `gv2-praca.css` | `leads_prospeccao`, `gestor_v4_leituras`, `fichas_de_rua` | **vai** para Território › Onde atacar |
| Rua › Rotas | `gv2-rota-pessoa.js` | `rotas_da_semana`, `visitas_com_prova` | **muda** → Pessoa · dia (2d–2h) |
| Rua › Agora no mapa | `gv2-ui.js` ruaHoje, `gv2-ctl.js` GV2.mapa | `p.hoje` | **sai** (vira o mapa do Rua › Hoje, 2a) |
| Rua › Grade | `gv2-ui.js` ruaSemana | `p.semana` | **fica** (2c); célula clicável desde 08/10 |
| Prospecção (antiga) | template `rt*`, `GV2.visitar('rotas')` | `leads_prospeccao` | **sai** → Território › Abastecer |
| Pessoas | `gv2-pessoas-v3.js`, `gv2-v4-pessoas.js`, `gv2-pessoas.js` | `um_a_um`, `gestor_idas_campo`, `client_meetings`, `fichas_de_rua` | **muda** (3a–3b): 3 blocos sem abas; sai "Promessa de hoje" |
| Propostas, Playbook | template + `GV2.vender` | — | **ficam** |

## 0.2 GAP por tela

| Tela | Já pronto | Falta | Dado |
|---|---|---|---|
| 2d/2h Pessoa · dia | ordem do dia (08/10), agenda, chips de dia | seletor de pessoa em chips; cabeçalho com "x de y"; prova e "como foi" na linha; Jornada; Fora do plano; linha cheia no feito e tracejada no que falta; pé com Ver a semana e Abrir na Pessoas | `visitas_com_prova` (distância, foto), `fichas_de_rua` (como_foi, decisor) |
| 2e jornada curta | — | aviso "check-ins colados" (C9); "sem como foi" em âmbar | idem |
| 2f sem rota com agenda | agenda já lida | cartão tracejado no lugar da lista | `DATA.agenda` |
| 2a/2b/2i Rua › Hoje | mapa ao vivo (GV2.mapa), praças | a linha do tempo 08h–20h por pessoa (check-ins, paradas, sem lugar, agenda, janela, agora); a lista abaixo do mapa | tudo já carregado; falta a hora de cada check-in em `p.hoje` |
| 2c Grade | quase tudo | "Feito + plano" contra 30 (hoje é meta × dias); borda azul do hoje | — |
| 2g Amanhã | `planejamento_do_time` (sexta) | a tela inteira; "Pedir o plano" reaproveita o pedido já existente (WhatsApp e sino) | propósito, contas-alvo e quentes por item |
| 1a–1e Hoje | cartões, por pessoa, mapa, daily | Quem precisa de você por situação, com chips; coluna Jornada; Ontem com janela; estado "fonte fora" sem 0 inventado | idem + janela habitual (C7) |
| 3a–3b Pessoas | pauta, campo, combinados, funil × time | "Onde o seu tempo rende" (3 cartões); uma rolagem em 3 blocos; lista por motivo de coaching | já carregado |
| 4a Território | calor, bairros, contra quem, voz da rua | coluna Abastecer: estoque por pessoa, fila de aprovação, sem dono (hoje na tela antiga) | `leads_prospeccao` |
| 5a–5b Funil | funil do mês, por pessoa, dinheiro, perdas, travados | 4 cartões novos (porta→fechado, decisor→demo, ciclo, perdas); taxa só com 3+ | funil v4 |

## 0.3 Uma função para o "x de y"

`GV2.xdy(p, iso)` em `gv2-dados.js` devolve `{ x, y, fora, semLugar, texto }`:
- **x** = visitas com prova da pessoa no dia, só nos clientes do plano;
- **y** = paradas do plano no dia, contando o restaurante uma vez.

A visita fora do plano não entra no "x"; aparece em "Fora do plano" (C6).

Passam a chamá-la: Hoje (cartão, Por pessoa, Quem precisa), Rua (Hoje, Semana, Pessoa · dia, Amanhã), Grade, Pessoas e Daily. O teste cruza as oito telas para as 7 pessoas no mesmo carregamento.

**Mudança de regra:** hoje o "x" conta toda visita com prova do dia. A v5 conta só as do plano.

## 0.4 Os conflitos, medidos

| # | Medido no banco (08/10) | Regra que adoto |
|---|---|---|
| C1 | O plano muda durante o dia: 6 dos 7 planos foram editados depois das 12:02 de hoje. O número das 12:02 não se reconstrói. | O cartão mostra o plano **no momento da leitura**: "N de 7 · P paradas · K sem rota (com agenda)". "Ninguém sem rota" quando K = 0. |
| C2 | Bruno hoje: **7 paradas, todas sem hora**; 2 com prova (15:44 e 15:45). | Sem caso especial: entra como qualquer um. |
| C3 | Sérgio em outubro: 18 fichas, 14 com decisor. O "41%" do protótipo é ilustrativo. | O funil por pessoa continua sendo a função v4 que já está no ar. Pessoas e Funil leem a mesma função. |
| C4 | Renata: 1ª parada planejada às 09:30, 1º check-in às 14:03, janela habitual de 14:08 (9 dias). Com "Travou vence", ela travaria toda manhã. | **Travou** = passou 1 h da primeira parada com hora **e** passou a janela habitual. Antes disso, "Ainda não saiu". **Peço o seu ok:** é a única regra em que divirjo do protótipo. |
| C5 | Ontem (07/10): André 5 de 9, **Renata 4 de 13**, Sérgio 8 de 15, Kelly 11 de 15, Bruno 9 de 9, Sandro 7 de 12, Marco sem plano e sem visita. | Furou ontem = menos da metade do plano. Ontem só a Renata. Marco sai como "sem plano ontem", não como furou. |
| C6 | Visitas com prova fora do plano: André 2 ontem e 1 hoje; Sandro 1 hoje; Sérgio 1 ontem. | Não entra no "x"; aparece em "Fora do plano". |
| C7 | Mediana do 1º check-in (4 semanas): André 12:15 (19 dias), Sandro 14:03 (13), Renata 14:08 (9), Bruno 14:41 (9), Kelly 14:58 (11), Sérgio 15:54 (9). **Marco: 2 dias, 16:35.** | Janela habitual só com 5 dias ou mais. Abaixo disso: "sem janela habitual" e vale a regra do plano. |
| C8 | Contas atribuídas não visitadas por pessoa: de 174 (Sandro) a 755 (Renata). O "30 no estoque" do protótipo é ilustrativo. | Regra mantida (< 1 semana: sem estoque; < 1,5: acompanhar). Hoje ninguém está perto. |
| C9 | Ontem: **Sandro 8 min por porta** (7 visitas em 49 min), Kelly 10, Bruno 11. Hoje: Bruno 2 visitas em 1 min. | Aviso quando der < 10 min por porta **e** houver 4 visitas ou mais (2 visitas coladas não dizem nada). Ontem: só o Sandro. |

**Mais um dado:** em 4 semanas, 52 das 469 visitas (11%) ficaram sem prova. Delas, 19 foram declaradas. O ponto vazio da linha do tempo tem caso real.

## 0.5 Plano de PRs

O repositório é público e as capturas trazem nomes de clientes. Por isso as capturas ficam em `Downloads\v5-capturas\`, lado a lado com o PNG de referência, e não vão no PR.

Agrupado em 3 publicações, por causa da cota de deploy:
1. **Rua inteira:**
   - PR 1: a função `xdy` e a jornada;
   - PR 2: Pessoa · dia (2d, 2e, 2f, 2h);
   - PR 3: Rua › Hoje (2a, 2b, 2i) e a saída do "Agora no mapa";
   - PR 4: Semana (2c) e Amanhã (2g).
2. **Hoje e Pessoas:** PR 5 (1a–1e) e PR 6 (3a, 3b).
3. **Território e Funil:**
   - PR 7: Território (4a) e a saída da Prospecção antiga;
   - PR 8: Funil (5a, 5b) e o novo nome das abas no menu.
