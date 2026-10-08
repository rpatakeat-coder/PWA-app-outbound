# Auditoria completa · Cockpit do gestor

**Data:** 08/10/2026, das 12h às 12h10. Usei o Cockpit em produção com a sessão do Julyan, a 1440 × 900, e conferi os números no banco.
**Pedido:** "Eu como gestor preciso ver tudo que eles fazem, a rota deles, como consigo ajudar e acelerar mais. Gosto do formato que tem hoje, mas algumas telas estão bem confusas."
**Lente:** a de um diretor de Field Sales. Ele precisa saber:
- de manhã, se todo mundo tem plano;
- durante o dia, quem está andando e quem travou;
- na semana, onde o funil e o dinheiro param;
- sempre, em quem investir o tempo dele (1:1, ir junto, cobrar).

---

## 1. O que está bom e fica (não mexer no formato)

| O que | Por que funciona |
|---|---|
| O menu lateral com 7 abas, os tokens `--gv2-*`, o tema escuro e a densidade | É a identidade. O gestor gosta e já sabe usar. |
| Os 5 cartões de número no topo do Time | Uma leitura de 5 segundos. Cada número abre a lista que está por trás dele. |
| **Daily** (Conduzir a daily) | Uma pessoa por vez, Ontem · Hoje · Pra destravar, um campo de compromisso, Anterior · Próximo. É a melhor tela do cockpit. |
| **Propostas** | Quanto cada um envia, a lista com o vence em e o status, e o que o dono recebeu à direita. Claro, uma tela, uma pergunta. |
| **Playbook** do gestor | Quem está parado e em qual capítulo, com 1:1 ao lado. Curta e acionável. |
| **Raio X › Funil** + a gaveta | Desde 08/10, todo número abre quem está ali (passo, pessoa × passo, dinheiro, perdas, Mês). |
| **Rua › Rotas** | A pessoa à esquerda, a semana em chips, o mapa e a lista do dia. É a base certa para "ver a rota deles". |
| **Rua › Grade da semana** | Pessoas × dias, cumpriu, furou e sem plano. É a visão da semana. |
| **Pessoas**, com o 1:1 (pauta, combinados com conferência automática) e o Campo (ida junto, roteiro) | O conteúdo é o certo para coaching. O problema é a forma (ver 2.5). |

## 2. O que está confuso (medido)

### 2.1 A mesma pergunta respondida em quatro lugares, com números diferentes
"Como está o dia do time?" aparece no Time (cartões, A rua agora, Por pessoa), na Rua (O time, Agora no mapa, Grade), na Pessoas (lista à esquerda e o cartão Hoje) e na Prospecção ("Rotas cumpridas hoje").

**Hoje às 12:02, o mesmo "hoje" aparece com três denominadores:**

| Onde | O que mostra | Contra o quê |
|---|---|---|
| Time | "Visitas com prova 5 de 42" | a meta: 7 × 6 |
| Time | "Planos de hoje 37 paradas" | o plano |
| Prospecção | "Rotas cumpridas 5/32" | as paradas da rota do app |

Os três estão certos, mas o gestor não tem como saber qual usar.

### 2.2 "Quem precisa de você" lista o óbvio
Ao meio-dia são 5 linhas iguais: "Marco: plano de 1, nenhuma visita até 12:02 · Chamar", e o mesmo para Bruno, Kelly, Renata e Sérgio.
- Não prioriza e não junta.
- O "Chamar" de 5 pessoas não é uma decisão.
- **Não diferencia** quem ainda não saiu (a rua deles começa às 14h, ver 3.1) de quem travou.

### 2.3 Planejamento espalhado
"Eu não consigo mais ver o planejamento de ninguém." Ele existe em quatro pedaços:
- a gaveta do Time (desde 08/10);
- Rua › Rotas;
- Rua › Grade;
- Pessoas › Agora.

Nenhum responde de uma vez: o que cada um planejou, se planejou bem (praça, contas-alvo, quentes) e se amanhã já está montado.

### 2.4 A ordem da rota não é a do dia
Em Rua › Rotas, o André (13 paradas hoje) aparece assim:
- primeiro 4 paradas das 18:00 às 19:00 sem endereço;
- depois 9 sem hora, entre elas as 4 já feitas de manhã.

A linha do mapa cruza a cidade em zigue-zague. O gestor não vê o que já aconteceu, nem em que ordem, nem o que falta.

### 2.5 Pessoas é rica e pesada
- **Altura:** a página de uma pessoa tem 3.569 px de rolagem interna.
- **Navegação em dois níveis:** 5 cartões-resumo e mais 6 abas (Agora, Ritmo, Disciplina, Funil, 1:1, Campo).
- **Coisa que não vale nada aparece igual ao que importa:** por exemplo "Promessa de hoje —", sendo que ninguém usa a promessa.
- **Dois "Quem precisa de você":** a lista à esquerda repete o do Time com outra ordem e outro motivo.

### 2.6 Prospecção é de outro produto
- **Visual de outro sistema:** a tela antiga (Rotas & Prospecção) usa outra tipografia, CAIXA ALTA, outras cores e textos longos. Por exemplo: "722 conta(s) parada(s) no nome de quem saiu do campo · 3 sem pôr conta em rota nas últimas 4 semanas. Comece por Sandro."
- **Jargão:** "torneira", "backlog seco", "munição".
- **Clicável sem cara de clicável:** checkbox, "aprovar selecionadas", "importar" e "território órfão" convivem num quadro só.
- **Entrada duplicada:** a Rua abre essa tela pelo botão "Tomada de contas e Radar".

### 2.7 Raio X repete o Time
- **Mesmos números:** os 5 cartões do Raio X repetem 3 do Time (Quentes, Travados, Mês).
- **Conta estranha:** o "Funil por pessoa" conta passos do mês, não a mesma turma. Sai "Marco · Demo 4 · 400%", que é correto e confuso ao mesmo tempo.
- **Praça é outra tela:** a Praça (mapa de calor, onde atacar, contra quem, voz da rua) é uma tela de estudo dentro da aba de funil.

### 2.8 Defeitos vistos durante a auditoria
| # | Defeito | Estado |
|---|---|---|
| D1 | O Time mostrou "0 de 7 planos" e todos "sem rota": o plano estourava o tempo do banco (4,3 s por chamada) | **corrigido em 08/10** (0183/0184): agora 0,19 s |
| D2 | **Rua › Agora no mapa** não desenha o mapa nem os pinos, só linhas tracejadas | aberto |
| D3 | **Raio X › Praça**: a camada de calor passa da área do mapa (o calor fica fora dos ladrilhos) | aberto |
| D4 | **Rua › Rotas**: a ordem da lista e a linha do mapa (ver 2.4) | aberto |
| D5 | **Grade da semana**: a célula não abre o dia daquela pessoa (não é clicável) | aberto |

## 3. O que falta para "ver tudo que eles fazem" (o dado existe)

### 3.1 A jornada de cada um
Do primeiro ao último check-in, os intervalos e o tempo em cada porta. **Ontem (07/10), medido:**

| Pessoa | Janela de rua (1º ao último check-in) | Visitas com prova no dia (Grade) |
|---|---|---|
| André | 10:58–17:17 | 5 |
| Renata | 13:56–18:27 | 4 |
| Sérgio | 14:39–16:12 | 8 |
| Bruno | 14:31–15:57 | 9 |
| Kelly | 17:18–18:56 | 11 |
| Sandro | 14:38–15:27 | 7 |
| Marco | sem check-in | 0 |

Janela curta, com check-ins colados, pode ser porta a porta rápido ou check-in em lote. O gestor precisa ver isso para perguntar certo. **Hoje nenhuma tela mostra.** O dado está em `client_visits` (hora, GPS, distância, prova).

### 3.2 A qualidade da visita
O "como foi" de cada porta: falou com o decisor, sistema, dor, próximo passo e motivo de perda. Em 7 dias foram 14 a 25 fichas por pessoa. Hoje isso aparece só agregado (decisor nomeado, portas sem como foi). O dado está em `fichas_de_rua`.

### 3.3 O que cada um produziu na semana

| Pessoa | Leads criados (7 dias) | Reuniões marcadas no app (7 dias) |
|---|---|---|
| Sérgio | 71 | 1 |
| Renata | 47 | 0 |
| Kelly | 39 | 11 |
| Marco | 34 | 2 |
| Bruno | 29 | 0 |
| André | 28 | 0 |
| Sandro | 26 | 13 | O Feito da fila do app quase ninguém usa (2 na semana). O dado está em `clients.created_by`, `client_meetings` e `fila_feitas`.

### 3.4 Onde o gestor ajuda
Ir junto (Campo), 1:1 e cobrar já existem, mas cada um mora numa aba. Falta um lugar que diga: **"esta semana, seu tempo rende mais em: ir a campo com X (motivo), 1:1 com Y (motivo), cobrar Z (negócio)"**.

## 4. Conclusão

O formato é bom e fica. O que confunde é:
- (a) a mesma pergunta respondida em vários lugares com números diferentes;
- (b) o planejamento e a rota sem uma casa;
- (c) a jornada e a qualidade da visita invisíveis;
- (d) a Prospecção antiga.

O pedido ao design (`PEDIDO-cockpit-gestor-v5.md`) reorganiza as abas por pergunta, mantendo o visual.
