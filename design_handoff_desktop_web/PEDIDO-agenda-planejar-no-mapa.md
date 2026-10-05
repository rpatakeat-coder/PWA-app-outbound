# Pedido para a Claude Design: Agenda do computador, onde o executivo se planeja no mapa

**De:** Julyan (Head comercial, Field Sales Takeat) · **Data:** 05/10/2026
**Produto:** APP Outbound (PWA), no **computador** (1280 a 1600 px de largura). O celular não entra neste pedido.

## 1. O problema, nas palavras de quem usa

- "A agenda é onde o executivo se planeja; eu preciso que seja visualmente bom pra ele. Já que o Cockpit é bom de mexer, o app no PC também tem que ser."
- "A agenda tem que ser interativa: o executivo planeja no mapa e já vai pra lá."
- "Quando eu clicar no lead da agenda, tem que mostrar ele no mapa, não botar só o card. Ele tem que abrir a microrota ali."
- "Preciso ver os outros dias da semana: os passados e a semana que vem."

## 2. Quem usa e quando

- **Executivo de rua (Field Sales).** Visita restaurantes, de 6 a 10 portas por dia, em bairros que são o território dele.
- **No computador**, na véspera ou no começo do dia, ele monta o plano:
  - escolhe os dias e os bairros da semana;
  - põe as contas (leads, contas-alvo, clientes em queda) em cada dia, na ordem em que vai andar;
  - confere o que está marcado: reuniões, retornos, follow-ups.
- **Na rua**, ele usa o celular. O plano montado no computador vira a rota do dia e aparece no Planejamento do Cockpit do gestor.

## 3. Como está hoje (computador)

- **Duas colunas:**
  - **Esquerda, ~470 px:** a Agenda, com:
    - seletor Esta semana / Semana que vem;
    - faixa de 5 dias (seg a sex) com o propósito ou a contagem de cada dia;
    - "quantas visitas você faz hoje?" (4/6/8/10);
    - cartão da próxima parada (etapa, último contato, contatos x de 4, preparo);
    - linha do tempo do dia;
    - reuniões e retornos.
  - **Direita:** o mapa do Google, com os pinos do plano do dia numerados, o anel da microrota (~250 m) e, embaixo, a barra "Planejar pelo mapa": dias, lista das paradas, Confirmar e Pronto.
- **Tocar num pino** põe ou tira do plano daquele dia. Confirmar grava, e a mudança chega ao Planejamento do Cockpit.
- **Tocar num lead da lista:** o mapa vai até ele com a microrota, e o cartão do lead abre à direita.
- **Botão "Esconder painel"** (no mapa e no painel): o mapa ocupa a tela toda.
- **Restaurantes do Google no mapa:** tocar abre nome, nota e telefone, com "Virar lead".

**O que não funciona bem (por isso este pedido):**
- **Duas listas brigando por espaço:** a linha do tempo da esquerda e a barra do Planejar embaixo do mapa mostram as paradas duas vezes. Numa tela de notebook (altura ~600 px), o mapa fica espremido.
- **Planejar e ir para a rua são telas diferentes.** Ele monta o dia e depois precisa ir a outra aba para ver o caminho.
- **Faltam as respostas de planejamento:**
  - Onde estão os leads que vencem a régua?
  - Quais contas-alvo estão perto do que eu já marquei?
  - Quanto tempo de rua o dia tem?
- **Os dias passados** não mostram o resultado (visitado ou não, com prova).

## 4. O que a tela precisa permitir (requisitos)

1. **Ver a semana inteira e trocar de dia** sem perder o mapa: esta semana (incluindo dias passados) e a próxima.
2. **Montar o dia pelo mapa:**
   - clicar no pino para pôr ou tirar;
   - arrastar para reordenar;
   - ver a ordem e o caminho desenhado entre as paradas;
   - ver o tempo e os km estimados do dia.
3. **Sugestões para o dia**, perto do que já está marcado:
   - leads que passaram da régua (dias úteis sem toque acima do limite da etapa);
   - contas-alvo da munição;
   - clientes em queda;
   - restaurantes do Google ainda fora da base (com nota).
4. **Clicar num lead** em qualquer lugar da tela: o mapa centra nele com a microrota, e o cartão abre **sem tirar a pessoa da Agenda**.
5. **Fixar o horário** de uma parada (reunião com o dono às 15:00) e marcar o propósito do dia (região/bairro).
6. **Dia passado:** o que foi visitado, com prova (GPS) ou não, e o que ficou para trás, com um botão para remarcar.
7. **Dia vazio:** convite claro ("escolha um bairro" + sugestões), nunca uma tela morta.
8. **"Ir para a rua":** do plano do dia direto para o modo rota (a mesma tela no celular), sem refazer nada.
9. **Esconder ou mostrar o painel**, para o mapa ganhar a tela.
10. **Nada se perde:**
    - desfazer em 5 s nas ações de lote;
    - confirmar ao sair com marcações pendentes;
    - nunca redesenhar a tela enquanto a pessoa planeja (dado novo vira aviso, não piscar).

## 5. O que já existe de dado (não inventar campo)

- **Por dia:**
  - paradas (ordem, horário se combinado, feito ou não, com prova);
  - propósito do dia (Funil, Prospecção…);
  - reuniões e retornos (HubSpot e app);
  - meta de visitas do dia.
- **Por lead:**
  - etapa (8 etapas do funil);
  - dias úteis na etapa e régua da etapa;
  - temperatura (quente/morno/frio);
  - último contato e contatos (x de 4);
  - telefone, bairro, posição exata.
- **Contas-alvo** (munição, com nota do Google quando houver), **clientes em queda**, **lugares do Google** (nome, nota, avaliações, telefone).
- **Distância e tempo** entre paradas (rota pelas ruas).

## 6. Regras de desenho (não negociáveis)

- **Design system da Takeat** (UIKIT): Poppins, tokens claro/escuro, ícones do kit, **zero emoji**.
- **Cores de etapa e de temperatura são dado** (pintam os pinos), não decoração.
- **Larguras:** 1280 e 1600 px; altura útil mínima de ~600 px (notebook). O celular não muda.
- **Mesma linguagem do Planejamento do Cockpit** (o gestor vê o mesmo plano lá), mas aqui é a visão de quem executa.
- **Alvos de clique de no mínimo 40 px;** texto não pode cortar nome de restaurante importante (usar 2 linhas).

## 7. O que eu preciso receber

1. **Prancha em 1440 × 900 e em 1280 × 640**, nos estados:
   - hoje com 6 paradas;
   - outro dia da semana;
   - semana que vem (dia vazio);
   - dia passado (com o resultado);
   - modo planejar com sugestões abertas;
   - lead em foco (microrota + cartão);
   - painel escondido.
2. **O que SAI da tela de hoje:** quais blocos somem ou se juntam (hoje há duas listas de paradas).
3. **Interações anotadas:** clique, arraste, hover, teclado (Esc fecha, setas trocam de dia) e o que acontece com o mapa em cada uma.
4. **Orçamento de cliques:** planejar um dia de 6 paradas em até ~2 minutos, sem trocar de aba.

## 8. Como vou medir que ficou bom

- O executivo monta o dia seguinte sem sair da Agenda.
- O mapa nunca fica com menos de metade da altura útil.
- Clicar num lead nunca leva a outra aba.
- Nenhuma tela pisca enquanto ele planeja.
