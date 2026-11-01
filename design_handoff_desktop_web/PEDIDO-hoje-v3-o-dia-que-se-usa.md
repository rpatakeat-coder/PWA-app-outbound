# Hoje v3: o dia que o executivo usa de verdade (app primeiro, Cockpit espelho)

**Para:** Claude Design · **De:** Julyan (Head comercial, Field Sales Takeat) · **Data:** 01/11/2026
**Onde:** o dia do executivo. São duas telas:
- **No app (celular, 390 px), a tela principal:** o que abre de manhã, a pílula do mapa e o fecho do dia.
- **No Cockpit, o espelho:** a aba **Hoje** da visão de executivo (1280 a 1600 px).

Temas claro e escuro.

**Substitui em parte:**
- `PEDIDO-hoje-do-executivo.md` (06/10, Cockpit);
- `PEDIDO-o-dia-do-executivo-na-rua.md` (28/10, app: a "espinha do dia", com o plano e o fecho do dia).

Os dois foram entregues. O que muda aqui é **como fazer o executivo usar**.

> "Vamos refazer a aba Hoje? Será que estão usando de verdade? Preciso que eles usem isso." (Julyan, 01/11)

## O problema em uma frase

O executivo **vive no mapa do app** e não abre o resto: nem o Hoje do Cockpit, nem o fecho do dia. O que o produto sabe que ele deveria fazer hoje, sem passo, quente sem data e passo vencido, **não chega até ele no momento em que ele age**.

## O que existe hoje (medido no banco e no HubSpot, últimos 30 dias)

| Onde | Uso real |
|---|---|
| **App · check-in (Cheguei)** | **548 check-ins, 11 pessoas**: todo mundo, todo dia |
| **App · fichas "como foi"** | **464** |
| **App · tarefas feitas na aba Tarefas** | **102, 9 pessoas** |
| **App · paradas postas no plano** | **1.808** no total. **Só 47 (2,6%) vieram do Cockpit** |
| **Cockpit · Hoje · próximos passos marcados** | **43**, quase todos em rajadas: 24 de uma pessoa só, em 2 minutos de 29/10. **5 a 6 pessoas usaram no mês** |
| **App · fecho do dia (18h)** | **1 fecho** desde que entrou no ar (29/10) |
| **Sem próximo passo, o time inteiro** | **128 de 279 negócios abertos (46%)** |

**Leitura:**
- O app é a ferramenta do dia. O Cockpit Hoje é uma tela de mesa que quase ninguém abre.
- O fecho do dia existe, mas só aparece "na primeira vez que o app volta para a frente depois das 18h", e a essa hora o executivo já fechou o app.
- O "sem próximo passo" não cai, porque a única tela que resolve isso em lote, o Cockpit, não é aberta.

**O Hoje do Cockpit hoje, de cima para baixo:**
1. os 5 números "o que o seu gestor vê";
2. as 5 regras "a organização do seu dia";
3. o bloco vermelho "sem próximo passo";
4. a disputa e os pontos;
5. os leads quentes;
6. "o que eu faço agora" (a fila);
7. "Pronto pra rua?".

São 7 blocos, vários repetidos em outras abas: os 5 números estão também na Desenvolvimento, e a fila está também nas Tarefas do app.

## A ideia central

**O dia tem 3 momentos, e cada um vai até o executivo, em vez de esperar que ele vá até a tela.** Tudo acontece no app. O Cockpit Hoje mostra o mesmo dia na mesa, com os mesmos números.

### 1. Manhã: "seu dia em 30 segundos"
- **Até as 10h, o app abre numa folha antes do mapa**, só na primeira abertura do dia. Ela tem 3 linhas e 1 botão:
  - "**Plano de hoje: 5 paradas · 1ª às 09:00 em Madureira**", ou "nada no plano · montar com 6 sugestões" (o "Montar o dia" que já existe);
  - "**2 passos vencem hoje** · ligar Cantina às 12:30";
  - "**3 sem próximo passo** · dar data agora (1 toque cada)", com a mesma linha e o mesmo atalho da fila do Planejamento v3: "Pôr em qui 12/11".
  - **"Ir para a rua"**, que fecha a folha e cai no mapa com a 1ª porta.
- **Nada de tela cheia de números.** Se não há nada, a folha diz "dia em ordem · vá para a rua" e some.
- **Push às 8h** com a mesma frase ("5 paradas hoje · 3 leads sem passo"), pelo `push-fila`, que já existe.

### 2. Durante o dia: o mapa avisa, sem tirar o executivo do mapa
- **A pílula do mapa vira o placar do dia:**
  - "**4 de 6 com prova** · 2 sem prova · 36 pts hoje · faltam 9 para passar o 2º";
  - o número é o de visita com prova, o mesmo do Cockpit desde hoje.
- **Depois de cada Cheguei e de cada ficha:**
  - um toast curto com o que mudou: "+3 pts · sequência 4 dias" e, quando vale, "**este negócio ficou sem próximo passo · marcar agora**", com os chips de dia;
  - **é aqui que o "sem próximo passo" morre**: no minuto em que a visita acontece, não à noite no computador.
- **Passo que vence hoje** aparece como selo no pino e na próxima porta. Hoje ele só aparece na aba Tarefas.

### 3. Fim do dia: o fecho que acontece
- **Push às 18h** ("Feche o dia: 5 portas · 2 sem próximo passo"). O toque abre o fecho do dia, a `FolhaFechoDoDia` que já existe.
- **O fecho vira o check-out com recompensa:**
  - "Dia fechado · 5 portas · todas com próximo passo · **sequência 5 dias**";
  - conta para a missão e as medalhas do Desenvolvimento v2 (`PEDIDO-desenvolvimento-v2-o-jogo-da-carreira.md`): é o mesmo jogo.
- Quem não fechou recebe no dia seguinte, às 8h, as pendências do dia anterior no topo da folha da manhã. O gestor já vê isso em "O time na rua".
- **Continua sem travar nada.**

### O Hoje do Cockpit (espelho na mesa)
- **3 blocos, na ordem do dia:**
  1. o plano de hoje (paradas e 1ª porta, com o link "abrir no app");
  2. **"Sem próximo passo · 20 → 0"**, com **o mesmo componente da fila do Planejamento v3** (atalho de 1 clique, Pôr num dia, Ligar em, Decidir);
  3. o placar do dia: pontos, sequência e missão.
- **Saem do Hoje do Cockpit:**
  - os 5 números (ficam na Desenvolvimento);
  - as 5 regras numeradas (viram o "dia em ordem" do bloco 1);
  - a fila "o que eu faço agora" (a fila é a das Tarefas do app; aqui fica só o link);
  - o "Pronto pra rua?" (vira a folha da manhã no app).

## Regras que não mudam

- **Os números saem da mesma função no app e no Cockpit.** "Sem próximo passo" é nada marcado de hoje em diante, sem Ag. Pagamento, com passo vencido incluído. Visita conta com prova. **Nenhum número pode divergir entre as duas telas** (decisão de 01/11).
- **Avisar, não travar.** Nenhuma folha impede de ir para a rua. "Depois" sempre existe.
- **Ponto só nasce de prova.** O placar e os R$ 250 não mudam.
- **Feriado e fim de semana:** sem folha da manhã, sem push e sem cobrança.
- **Folha e push no máximo 1 vez por momento por dia.** Nada de notificação repetida.
- Design system Takeat (UIKIT), Poppins, zero emoji, alvo de clique de no mínimo 40 px. Celebração curta, que respeita "reduzir movimento".

## O que NÃO entra

- Mudar o mapa (lentes, pinos, rota). Ele funciona e é onde o executivo vive.
- Regras novas de dinheiro.
- A visão do gestor. Ela só ganha "fechou o dia: sim ou não", que já existe em "O time na rua".

## Medir uso (junto com este pedido)

Registrar em `aberturas_de_tela` (a tabela pedida no Desenvolvimento v2):
- a folha da manhã: vista, "Ir para a rua", fechada sem ação;
- o toast pós-visita: marcou passo, ignorou;
- o fecho do dia: aberto, fechado;
- o Hoje do Cockpit: aberto.

## Estados a desenhar

1. **Manhã com plano:** 5 paradas, 2 vencem hoje e 3 sem passo, com os chips de dia.
2. **Manhã sem plano:** "montar com 6 sugestões".
3. **Manhã com tudo em ordem:** a folha some em 1,5 s.
4. **Pílula do mapa ao meio-dia:** 4 de 6 com prova, 2 sem prova, pontos e "próximo a passar".
5. **Toast pós-Cheguei:** "+3 pts" e, depois da ficha, "ficou sem próximo passo · marcar", com os chips.
6. **Push e fecho às 18h:** com 2 pendentes e com 0 pendentes (o check-out com a sequência).
7. **Manhã seguinte depois de não fechar:** as pendências de ontem no topo.
8. **O Hoje do Cockpit:** os 3 blocos, incluindo a fila zerada.
9. **Feriado:** nada aparece, e o mapa mostra "sem expediente".

## O que espero receber

- As pranchas do app em 390 px (a folha da manhã, a pílula, os toasts, o fecho) e do Cockpit Hoje em 1280 px, claro e escuro.
- O protótipo do dia inteiro: manhã → Cheguei → ficha → toast → fecho.
- O texto de cada push e de cada toast.

## Como medir (aceite)

**Em 4 semanas:**
- **sem próximo passo** do time: de **46% para menos de 10%**;
- **fecho do dia:** de **1 em uma semana** para **70% dos dias úteis** por executivo;
- **folha da manhã com "Ir para a rua":** **80%** dos dias úteis;
- **passo marcado no toast pós-visita:** em **50%** das visitas que terminam sem passo.

## Recomendado (o design segue isto; o Julyan pode mudar qualquer item)

1. **O app é a tela principal do dia.** O Hoje do Cockpit é espelho e fica com 3 blocos.
2. **A folha da manhã aparece só até as 10h e só na 1ª abertura do dia.**
3. **O push é às 8h e às 18h,** pelo `push-fila`, e não sai em feriado.
4. **O "sem próximo passo" usa o mesmo componente** no Planejamento v3, no Hoje do Cockpit e na folha da manhã do app.
