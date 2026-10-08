# App do executivo · auditoria completa e pedido ao design

**Data:** quinta 08/10/2026, das 20h às 20h40.
**Conta usada:** André Gomes (executivo, Rio), logado pelo Julyan.
**Onde:**
- o app do celular (`/`): Mapa, Agenda, Tarefas, Meu desempenho, menu;
- o cockpit do executivo (`/gestao/cockpit`): Hoje, Meu funil, Planejamento, Desenvolvimento, Propostas, Playbook.

**Como foi medido:**
- tudo em produção, com os dados reais do dia;
- números conferidos contra o banco (Supabase) e contra o cockpit do gestor v5 para a mesma pessoa e o mesmo dia;
- cliques feitos com tudo que grava interceptado (banco, HubSpot, WhatsApp, links). Nada foi escrito.

Este arquivo tem três partes:
1. **O que fica.** Não mexer.
2. **Os achados**, com o número medido, e quem resolve cada um. Eu resolvo o que é dado; o design resolve o que é tela.
3. **O pedido ao design**, pronto para colar.

---

## 1. O que está bom e fica (não mexer no formato)

| O que | Por que funciona |
|---|---|
| **Agenda do celular** | Tudo bate com o cockpit, conferido para o André:<br>- Ficou sem desfecho: 3;<br>- Dia fechado: 5 visitas provadas e 1 demo;<br>- Feito hoje: 5, 1 sem registro;<br>- Ficou para trás: as 6 paradas que faltaram;<br>- No plano, sem lugar no mapa: 3. |
| **Feito hoje (Agenda)** | Mostra cada porta com hora, prova (GPS a X m) e o "como foi". É exatamente o que o gestor quer ver. |
| **Meu desempenho** | Variável do mês, próxima venda, temporada com ranking e histórico por dia. Claro e motivador. |
| **Desenvolvimento (cockpit)** | Um 1:1 com data, mês, ritmo, disciplina e carteira. Usa a mesma conta da página da pessoa no gestor. |
| **Tarefas** | Fila por valor × urgência, filtros Ligar/Visitar/WhatsApp, Modo foco e o motivo de cada linha. |
| **Velocidade do cockpit do executivo** | Trocar de aba leva de 10 a 63 ms. Nenhum erro no console. |
| **Cliques** | 140 botões testados nas 6 abas do cockpit do executivo. Um só não funcionava (achado E1, já corrigido). |

---

## 2. Os achados

### O central: o mesmo dia do André aparece em sete contas diferentes

Quinta 08/10, às 20h. Os dados reais no banco:
- 13 itens no Planejamento, sendo 3 sem endereço (Mike Lanches, Rafa Burger, Tiago Pizza);
- 11 paradas na rota do app, sendo uma o Boteco do Gavião, posto na rota na hora (fora do plano);
- 5 visitas com prova: 4 em clientes do plano e 1 fora do plano;
- meta do dia: 6.

| Onde | O que mostra | O que conta |
|---|---|---|
| Cockpit do **gestor** (Hoje, Rua, Grade, Pessoas, Daily) | **4 de 13** | visita com prova em cliente do plano ÷ itens do plano |
| Cockpit do executivo › Hoje, manchete | **5 de 11 paradas feitas hoje** | parada da rota marcada como feita, ou cliente com qualquer check-in hoje, mesmo sem prova ÷ paradas da rota |
| Cockpit do executivo › Hoje › Fechar o dia | **Check-ins 5 de 11** | a mesma conta da manchete |
| Cockpit do executivo › Planejamento | **Hoje 0/5 registrados · 5 esperando**, em vermelho | parada com a hora passada E marcada à mão nesta tela ÷ paradas com a hora passada. **Ignora o check-in.** |
| App › topo do mapa | **Plano de hoje: 5 de 11** · 5 visitas no dia · meta 6 | rota do app; a visita fora do plano entra como parada feita e aumenta os dois lados |
| App › pílula do mapa | **5/6 · 5 prov.** | toda visita do dia, inclusive sem prova ÷ meta |
| App › Agenda › chip do dia | **Funil · 14** | itens crus da grade, com o Restaurante Sabor da Hora contado duas vezes |
| App › Agenda e Meu desempenho | **5 de 6 visitas provadas** | toda visita com prova ÷ meta |
| App › Meu desempenho › semana | **17 provadas** e a frase "os mesmos números do Cockpit" | toda visita com prova. O gestor mostra 13 para o André na semana, só as do plano: **a frase é falsa hoje.** |

**Por que importa:** o gestor cobra "4 de 13" e o executivo lê "5 de 11". Os dois estão certos, cada um na sua conta, e nenhum dos dois sabe disso. É a pior discussão de 1:1 possível.

**A regra que proponho: dois números, com o mesmo nome em todo lugar** (gestor, cockpit do executivo e app).

| Nome | Regra | André hoje |
|---|---|---|
| **Plano** | paradas do plano com visita provada ÷ paradas do plano. O mesmo restaurante conta uma vez por dia. A parada sem lugar no mapa conta no "y" e aparece à parte: "3 sem lugar". Fonte: `planejamento_do_time` (o executivo já pode ler, testado na conta dele). | **4 de 13** · 3 sem lugar |
| **Visitas** | toda visita com prova do dia, dentro ou fora do plano ÷ meta do dia. A de fora do plano aparece como "+1 fora do plano". | **5 de 6** · +1 fora do plano |

- Visita sem prova não entra em nenhum dos dois; aparece como "N sem prova".
- "Registrado" deixa de existir como número: o que vale é o check-in.

### A lista, com quem resolve

| # | Achado | Medido | Quem resolve |
|---|---|---|---|
| **E1** | No Hoje do executivo, o número "7 régua estourada" tem cara de botão e não fazia nada. O ouvinte dele só existia dentro do cartão da fila. | clique sem efeito | **eu: corrigido** (abre o Meu funil em quem passou da régua) |
| **E2** | Planejamento: "Hoje 0/5 registrados · 5 esperando", em vermelho, para quem fez 5 visitas com prova. O número acusa quem trabalhou direito. | André: 5 com prova, a tela diz 0 | **eu (dado):** passa a ser o "Plano" da regra acima. **Design:** o lugar do número na tela. |
| **E3** | Sete contas para o mesmo dia (tabela acima). | 4 de 13 · 5 de 11 · 0/5 · 5/6 · Funil 14 · 17 contra 13 | **eu (dado):** os dois números, com uma fonte só. **Design:** como "Plano" e "Visitas" aparecem juntos em cada tela (seção 3). |
| **E4** | "Régua estourada" conta o negócio repetido duas vezes. O gestor conta uma vez só (regra v4). | André: 7 no executivo; o Sushi Delícia entra duas vezes (Conversa com decisor e Visita) | **eu (dado)** |
| **E5** | Tarefas mostra "Visitar Top Gourmet" duas vezes: dois negócios com o mesmo nome e o mesmo dono. | 2 linhas | **eu (dado):** uma linha, com "repetido ×2" como no gestor. **Design:** o selo de repetido no cartão do app. |
| **E6** | "Feitas hoje" e "na fila" não batem entre o app e o cockpit do executivo. | app: 0 feitas · 57 na fila; cockpit: feitas ✓ 4 · todas 55 | **eu (dado):** uma definição só. Feita = tarefa marcada "Feito" na fila ou concluída no HubSpot hoje; fila = a mesma consulta (Edge `fila-tarefas`) nas duas telas. |
| **E7** | O Sushi Delícia foi visitado hoje às 11:37 com prova, mas a tarefa de retorno continua "venceu há 9 dias" no topo da fila. | 1 caso hoje | **design:** o estado "visitou hoje, falta registrar o próximo passo", com a ação de registrar ali mesmo. Hoje parece que ele não fez nada. |
| **E8** | Às 20h o app diz "Ir pra rua →"; o cockpit do executivo já diz "Montar amanhã" (o corte das 18h). | 20:15 | **design:** o estado da noite no topo do mapa. **Eu:** a mesma regra das 18h nas duas telas. |
| **E9** | Meu desempenho diz "Os mesmos números do Cockpit", e não são (17 contra 13 na semana). | ver E3 | **eu:** o texto fica verdadeiro quando E3 entrar |
| **E10** | Jargão no Planejamento do executivo: "200 contas na munição". | — | **eu:** "200 contas para visitar" |
| **E11** | O app faz 51 chamadas ao banco ao abrir; a primeira leva útil termina em 4,6 s. A mais lenta é a fila de Tarefas: 3,2 s numa chamada só (a função consulta o HubSpot por dentro). | 51 chamadas · 4,6 s · 3,2 s | **eu:** a fila sai do caminho da abertura (carrega depois do mapa) e o selo usa o número guardado |
| **E12** | O menu do vendedor tem "Gestão", que leva ao cockpit do executivo. O nome sugere a tela do gestor. | — | **design:** o nome e o lugar no menu ("Meu cockpit") |
| **E13** | O chip do dia na Agenda ("Funil · 14") conta o item repetido e o sem lugar como se fossem 14 paradas. | 14 contra 13 contra 11 | **eu (dado):** o chip usa o "y" do Plano |

**Retirado durante a auditoria:** o mapa parecia sem fundo na abertura. Era só o carregamento; depois desenhou normalmente.

---

## 3. Pedido ao design

> **Copie a partir daqui.**

### Contexto

O executivo usa duas telas:
- o **app no celular**, na rua: Mapa, Agenda, Tarefas e Playbook, mais Meu desempenho no menu;
- o **cockpit do executivo** no computador: Hoje, Meu funil, Planejamento, Desenvolvimento, Propostas e Playbook.

O gestor tem um cockpit novo (v5) em que o dia de cada pessoa é medido por **duas contas**: **Plano** (paradas do plano com visita provada ÷ paradas do plano) e **Visitas** (todas as visitas com prova ÷ meta). Hoje o executivo vê sete versões desse número (seção 2). Esta entrega faz o executivo ver **os mesmos dois números que o gestor vê dele**, com o mesmo nome, em todas as telas.

**O formato atual é bom e fica:** os tokens, o tema escuro, a barra de baixo do app (Mapa · Agenda · Tarefas · Playbook), as abas do cockpit e a densidade. Não é redesenho; é consolidar.

### A regra que todas as telas seguem

- **Plano: x de y.**
  - x = paradas do plano com visita provada; y = paradas do plano, com o mesmo restaurante contado uma vez.
  - A parada sem endereço conta no y e aparece à parte: "3 sem lugar no mapa".
- **Visitas: n de meta.**
  - n = todas as visitas com prova do dia, dentro ou fora do plano.
  - A de fora do plano aparece como "+1 fora do plano".
- **Sem prova** não conta em nenhum dos dois. Aparece como "N sem prova", com o caminho para resolver (foto ou GPS).
- **Depois das 18h** o dia está fechando: o convite é montar amanhã, nunca "ir pra rua".
- **Nenhum número sem destino:** tocar abre o que está por trás.
- **Sem jargão:** "contas para visitar", nunca "munição".

### Exemplo real para as telas: o André, quinta 08/10, 20h

- **Plano:** 4 de 13, com 3 sem lugar no mapa (Mike Lanches, Rafa Burger, Tiago Pizza).
- **Visitas:** 5 de 6, com 1 fora do plano (Boteco do Gavião, 16:25).
- **Feitas pela hora do check-in:**
  - Restaurante Fogueira, 10:55, GPS 11 m, falta o "como foi";
  - Metropole Food, 11:11, GPS 36 m, decisor ausente;
  - Paladare 2, 11:24, GPS 73 m, falou com o decisor;
  - Sushi Delícia, 11:37, GPS 1 m, falou com o decisor;
  - Boteco do Gavião, 16:25, GPS 9 m, falou com o decisor (fora do plano).
- **Ficaram para trás:** Restaurante Sabor da Hora, Top Gourmet, Up do Sabor, Paladare Restaurante, Esquina da Fama, Paladare.
- **Plano de amanhã:** 7 paradas montadas.
- **Ficou sem desfecho:** 3 reuniões.
- **Na fila:** 57 tarefas; o Sushi Delícia foi visitado hoje e a tarefa de retorno dele está vencida há 9 dias.
- **Mês e semana:** 2 de 2 clientes no mês; variável R$ 500; próxima venda +R$ 250; 1º da temporada.

### As telas a entregar (cada uma em PNG no tamanho real e no protótipo clicável)

**App no celular**, a 390 px, escuro e claro:

1. **Topo do mapa (a faixa da rua e a pílula da próxima porta)**, em quatro momentos:
   - de manhã, sem visita: "Plano 0 de 13 · Visitas 0 de 6", com "Ir pra rua";
   - no meio do dia: "Plano 4 de 13 · Visitas 5 de 6 · +1 fora do plano";
   - à noite (depois das 18h): o dia fechado, com "Montar amanhã" e quantas ficaram para trás;
   - sem rota, com agenda: "Sem rota hoje · 1 ligação 12:45". Nunca "sem plano".
2. **Folha "Meu dia"**, que abre ao tocar no número:
   - os dois números, as casas da meta e as 5 portas com hora e prova;
   - o que ficou para trás e os 3 sem lugar no mapa, com o caminho para resolver (pôr a rua no negócio).
3. **Agenda**:
   - o chip de cada dia com o y do Plano (13, não 14);
   - o ritmo com os dois números;
   - o resto fica como está (Ficou sem desfecho, Dia fechado, Feito hoje, Sem lugar).
4. **Tarefas**:
   - **(a) negócio repetido:** uma linha, com o selo "repetido ×2" e as etapas dos outros, como no gestor;
   - **(b) visitou hoje e a tarefa venceu:** o estado "visitou hoje 11:37 · falta registrar o próximo passo", com o botão de registrar ali, e a linha deixa de parecer abandonada;
   - **(c) "Feitas hoje":** o mesmo número do cockpit.
5. **Meu desempenho**: a semana com os dois números (Visitas 17, Plano 13 de N) e a frase do rodapé verdadeira.
6. **Menu do avatar**: o item que leva ao cockpit do executivo com um nome claro ("Meu cockpit", não "Gestão").

**Cockpit do executivo**, a 1440 e a 1280 escuro e a 640 claro:

7. **Hoje**:
   - a manchete com os dois números: "Plano 4 de 13 · Visitas 5 de 6 · 1 visita sem ficha";
   - "Fechar o dia" com Check-ins = Visitas, Como foi e Plano de amanhã;
   - os 3 números do topo, cada um com destino; "régua estourada" abre o Meu funil filtrado.
8. **Planejamento**:
   - o cartão "Hoje" passa a ser o Plano (4 de 13, com prova); sai "0/5 registrados · 5 esperando";
   - a manchete sem "munição";
   - o resto do Planejamento fica.

### O que sai

- Toda contagem de "paradas feitas" que aceita visita sem prova.
- O "registrados · esperando" do Planejamento.
- A frase "os mesmos números do Cockpit", enquanto não for verdade (ela volta quando a regra estiver nas duas telas).
- "Ir pra rua" depois das 18h.

### Testes de aceite

1. O Plano e as Visitas do André em 08/10 dão o mesmo valor (4 de 13 e 5 de 6) em todos estes lugares:
   - no app: topo do mapa, Meu dia, Agenda e Meu desempenho;
   - no cockpit do executivo: Hoje e Planejamento;
   - no cockpit do gestor: Hoje, Rua, Grade, Pessoas e Daily.
2. Nenhuma tela conta visita sem prova como feita.
3. Nenhum negócio repetido aparece duas vezes, nem conta duas vezes.
4. Depois das 18h, nenhuma tela convida para a rua.
5. Todo número tocável abre o que está por trás.
6. Sem rolagem horizontal a 390 px (app) e a 640, 1280 e 1440 (cockpit), nos dois temas.

> **Fim do texto para colar.**

---

## 4. Ordem de execução

1. **Eu, já:** E1 (corrigido), E4, E10. O dado de E2, E3, E5, E6 e E13 (uma fonte, uma regra) pode entrar antes do desenho novo, com a tela atual mostrando os números certos.
2. **Design:** as 8 telas da seção 3.
3. **Eu, com a entrega do design:** o desenho novo das telas, a noite (E8), o selo de repetido (E5) e o estado de E7. Depois, E11 (a fila fora do caminho da abertura).
