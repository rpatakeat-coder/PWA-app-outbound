# Planejamento do executivo, v2: todo lead com próximo passo, uma semana que cabe na rua e app e Cockpit na hora

**Para:** Claude Design · **De:** Julyan (Head comercial, Field Sales Takeat) · **Data:** 01/11/2026
**Onde:** Cockpit Field Sales, aba **Planejamento** na visão do **executivo**, no computador (1280 a 1600 px), temas claro e escuro. O app entra só onde ele conversa com esta aba (seção 4).
**Substitui em parte:** `PEDIDO-planejamento-do-executivo.md` (05/10). O que já foi entregue dele fica. Dois itens dele **não funcionaram** e voltam aqui: a sugestão por dia e o "nada repinta sozinho".

> "Planejamento no field sales é o que importa. Integração app e cockpit na hora. Os leads precisam de próximo passo." (Julyan, 01/11)

## O problema em uma frase

A aba é bonita e cheia de coisas, mas não garante as duas coisas que o planejamento existe para garantir. Quase metade dos leads está **sem próximo passo**, e o plano da semana tem **três vezes** mais portas do que a pessoa consegue fazer. Além disso, o que o executivo faz no app só aparece aqui depois de um clique.

## O que existe hoje (medido no banco em 01/11)

| Medida | Valor | O que diz |
|---|---|---|
| Negócios abertos sem próximo passo (time, de Prospecção a Negociação) | **128 de 279 (46%)** | A regra nº 1 do funil não está sendo cumprida |
| …por etapa | Prospecção 64/95 · Visita 53/132 · Decisor 3/25 · Demo 3/11 · Negociação 5/16 | O buraco está no topo, onde mora o volume |
| …por pessoa | de **0 de 39** (o melhor) a **51 de 58** (o pior) | É hábito, não é sistema: um consegue zerar |
| Paradas no plano × feitas (semana 26 a 30/10) | **330 × 102 (31%)** | O plano não é plano, é lista de desejo |
| Paradas postas no próprio dia | **105 (32%)** | Um terço é improviso do dia |
| Planos da semana "enviados ao gestor" (26/10 e 02/11) | **0 e 0** | O botão existe e ninguém usa |
| Promessa dada para a semana de 02/11 | **0** | Idem |
| Contas sem endereço no CRM (exemplo de uma carteira) | 13 de 20 | Não dá para rotear o que não tem lugar no mapa |

**Como a tela está hoje** (de cima para baixo, em 1536 px):
1. Manchete, os chips esta/próxima semana e 3 números.
2. "A sua palavra desta semana", em 3 blocos com texto explicativo.
3. O bloco vermelho grande "Cadência da carteira": a barra de próximo passo, 5 chips, "a cadência da semana" com 5 regras numeradas, "Montar a semana" e "Enviar o plano ao gestor".
4. Só então a grade de 5 dias, abaixo da dobra.
5. A munição na direita: 7 propósitos em "Pra:", 4 blocos de cadência, criar lead, busca, "onde ▾" e a lista.

**Defeitos vistos ao vivo:**
- **O feriado parece dia normal.** 02/11 (Finados) aparece "feriado", mas com "0 · meta 6" e "sugestão para este dia". A regra "todo dia com 6+" conta 5 dias abaixo de 6 numa semana de 4 dias úteis.
- **A mesma sugestão em todos os dias.** Os 5 dias sugerem "Centro · Felsen · Casa Cabe". Isso já estava no pedido de 05/10 (item 10).
- **"Visitas agendadas: 1"** no topo, mas os 5 dias dizem "vazio" e "dias cobertos 0 de 4". O número não bate com a grade.
- **A coluna do dia é estreita:** "0 · meta 6" quebra em duas linhas e o cabeçalho "seg 02/11 feriado" se sobrepõe.
- **Sobra um vazio grande** embaixo da grade, porque a munição define a altura e a grade não.
- **O dado do app não chega na hora.** Com a aba aberta, um check-in, uma parada nova ou uma reordenação feita no app viram só um aviso no canto, e a grade fica velha até a pessoa clicar. Foi pedido assim em 05/10 ("nada pisca"); agora a prioridade é o contrário.

## A ideia central

**A aba deixa de ser "monte a sua semana" e passa a ser "nenhum lead fica sem próximo passo, e a semana cabe na rua".** Três perguntas, nesta ordem, e a tela responde as três sem rolar:

1. **Quem está sem próximo passo?** É a fila de trabalho. Cada lead sai dela com uma data (vira parada num dia ou tarefa com data) ou com uma decisão (perdido ou reciclar). Quando a fila zera, a tela comemora.
2. **A semana cabe?** Por dia: quantas portas, a meta real do dia (feriado = 0) e uma capacidade que pare de aceitar 15 portas quando a pessoa faz 5. Mostre o histórico dela ("você faz em média 5,2 por dia") ao lado da meta.
3. **O que mudou desde que eu abri?** O app e o Cockpit são o mesmo plano. O que acontece na rua aparece na grade em segundos, sem a pessoa perder o lugar.

## O que pedimos

### 1. "Sem próximo passo" vira o centro da tela, não um bloco vermelho de leitura
- **Uma fila à esquerda ou no topo** com os leads sem próximo passo, ordenados por dinheiro: Negociação, depois Demo, depois Decisor, depois Visita, depois Prospecção. Os quentes primeiro.
- **Cada linha com uma ação de um clique**, sem abrir ficha:
  - **"Pôr num dia ▾"** (vira parada);
  - **"Ligar / WhatsApp em ▾"** (tarefa com data no HubSpot);
  - **"Decidir ▾"** (perdido com motivo, ou reciclar com retorno).
  - Desenhe o estado "feito" da linha: ela sai da fila com um selo "passo em qui 05/11".
- **O contador "128 → 0"** fica fixo no topo da aba. É o número que o gestor cobra (o mesmo do card "Sem próximo passo" do Hoje).
- **"Montar a semana"** vira "Dar data a todos": propõe um dia para cada lead da fila, respeitando a capacidade, e a pessoa confirma ou ajusta. Ele já existe em rascunho (`PL7.montar`); só ganha esse papel.
- **Passo vencido** (a data passou sem toque) volta para a fila com o selo "venceu ter 27/10". É a mesma medida do combinado "Próximo passo e data" que a Pessoas do gestor já usa.

### 2. A semana que cabe
- **A grade sobe para a primeira dobra.** A "palavra da semana" e as regras da cadência viram uma faixa de uma linha com números; o detalhe abre num clique.
- **Cabeçalho do dia:** "qua 04/11 · 3 de 6 · Madureira", sem quebrar em 1280.
  - Feriado e fim de semana com outro desenho, sem meta e sem sugestão: "feriado · Finados".
  - A capacidade mostra a média real da pessoa, e o dia pede confirmação acima de 1,5× essa média ("você costuma fazer 5; quer manter 9?"). **Avisar, não travar.**
- **Sugestão por dia:** cada conta sugerida em um dia só. Agrupe por bairro, do mesmo bairro do que já está no dia, e mostre "Pôr as 3".
- **Conta sem endereço:** o selo "sem lugar no mapa" e uma ação "pôr endereço" que grava no cadastro. Não dá para planejar rota com 13 de 20 sem endereço.
- **Topo coerente:** "visitas agendadas" e "dias cobertos" contam exatamente o que está na grade.

### 3. "Como foi a semana" (o plano contra o real)
- Uma linha por dia que já passou: "plano 9 · feitas 3 · fora do plano 1". Clicar abre o que ficou para trás, com "repor em outro dia" ou "decidir".
- **O que ficou para trás volta para a fila do item 1**, sem passo, e não some.

### 4. App e Cockpit na hora (o comportamento, não só o desenho)
Hoje o banco já avisa a tela em menos de 1 s (canal `sinais_ao_vivo`, trigger `rota_para_plano`). Falta o desenho de **como a mudança aparece sem atrapalhar quem está planejando**:
- **Repinta só o dia que mudou**, no lugar, sem pular a rolagem.
  - O cartão novo ou alterado ganha um destaque curto (≈2 s) e um selo da origem: "pelo app · 10:42" ou "check-in · 10:42".
  - Desenhe os estados do cartão: entrou, saiu, feito com check-in, reordenado.
- **Se a pessoa está arrastando ou com um menu aberto, a mudança espera** e entra quando ela solta. Este é o único caso de aviso.
- **O inverso também vale:** o que se põe aqui aparece na Agenda do app em segundos. Desenhe o "salvo · no app" discreto depois de cada ação.
- **A semana vira no mesmo momento nos dois.** Hoje o Cockpit abre a semana seguinte na sexta e o app só no fim de semana. Proponha uma regra só e mostre "planejando: próxima semana" quando for o caso.

### 5. O que sai ou encolhe
- **"Enviar o plano ao gestor"** (0 uso em duas semanas). Proponha: some, e o gestor passa a ver o plano sempre ao vivo. Ou vira automático no domingo às 20h. **Para o Julyan decidir.**
- **"A sua palavra desta semana"** (0 promessas). Encolhe para uma linha. **Para decidir:** se continua.
- **Os 7 propósitos do "Pra:"** e os 4 blocos de cadência na munição viram **um** filtro com 3 opções visíveis (Sem passo · Quentes · Contas-alvo) e "mais".

## Regras que não mudam
- Design system Takeat (UIKIT): Poppins, tokens claro/escuro, ícones do kit, zero emoji. Alvo de clique de no mínimo 40 px. Nome do restaurante nunca cortado em uma linha.
- Cores de etapa e temperatura são dado e não mudam (as mesmas do pino do mapa).
- **Cockpit = a semana; app = o dia** (a ordem, o horário estimado e os cadeados continuam no app).
- **Obrigatório é avisar, não travar.**
- Agendar uma conta continua criando a tarefa no HubSpot antes de gravar a grade. Nada de campo novo no HubSpot.
- Não inventar dado. Tudo sai do que existe:
  - `planos_semanais` (grade, promessa, `fechado_em`);
  - `field_routes`/`field_route_stops` (o dia no app, `horario_fixo`, `posto_por`);
  - o funil do HubSpot (próximo passo = tarefa aberta com data);
  - a munição (contas-alvo);
  - `client_visits` (check-in com prova).

## O que NÃO entra
- O celular, cuja Agenda do dia já tem pedido próprio (`PEDIDO-o-dia-do-executivo-na-rua.md`).
- A visão do gestor (Rua › Semana).
- Mexer em como o HubSpot guarda as tarefas.

## Estados a desenhar
1. Segunda 08:00, semana nova: fila com 31 sem passo e grade vazia.
2. Quarta 14:00: grade com dias passados (plano × feitas), hoje em andamento e um check-in chegando do app na tela.
3. Semana com feriado (02 a 06/11).
4. Fila zerada ("todo lead com próximo passo"), com a comemoração discreta.
5. Dia acima da capacidade (o aviso, não a trava).
6. Conta sem endereço sendo arrastada para um dia.
7. Mudança chegando do app enquanto a pessoa arrasta.
8. Executivo novato (meta 3 no mês, 6 visitas por dia, carteira pequena: 2 a 10 negócios).

## O que espero receber
- As pranchas em 1280 e em 1536, claro e escuro, com os 8 estados.
- Um protótipo do fluxo "dar data a 10 leads sem passo".
- A anotação do comportamento ao vivo (item 4): o que repinta, quando espera, o selo de origem e a duração do destaque.

## Como medir (critérios de aceite)
- **Dar data a um lead da fila:** 1 clique + escolher o dia (2 no total), sem abrir ficha.
- **Dar data a 20 leads com "Dar data a todos":** no máximo 25 cliques, revisando.
- **A grade aparece inteira sem rolar** em 1280 × 800.
- **Mudança feita no app aparece na grade em até 3 s**, sem recarregar e sem perder a rolagem.
- **Em 4 semanas:**
  - "sem próximo passo" do time sai de 46% para menos de 10%;
  - "feitas ÷ plano" sai de 31% para mais de 70%, com o plano encolhendo para o real, não com a rua inflando.

## Para aprovar (Julyan)
- [ ] "Enviar o plano ao gestor" some ou vira automático?
- [ ] A "palavra da semana" continua?
- [ ] A capacidade do dia avisa acima de 1,5× a média da pessoa: esse é o número?
- [ ] A semana vira na sexta às 17h nos dois (app e Cockpit)?
