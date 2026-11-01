# Desenvolvimento v2: o jogo da carreira (o executivo abre porque quer, não porque é cobrado)

**Para:** Claude Design · **De:** Julyan (Head comercial, Field Sales Takeat) · **Data:** 01/11/2026
**Onde:**
- **App:** "Meu desempenho" no celular (390 px). **É a tela principal**, porque o executivo vive no celular.
- **Cockpit:** a aba **Desenvolvimento** do executivo (1280 a 1600 px). É o espelho do app.
- Temas claro e escuro.

**Substitui em parte:** `PEDIDO-desenvolvimento-executivo.md` (07/10). O espelho do 1:1 foi entregue e funciona, mas virou um bloco de uma linha (seção 2.6).

> "Eu tenho certeza que ninguém clica na aba Desenvolvimento. Como podemos deixar ela melhor, pra ele ver e se desenvolver? Tem que gamificar." (Julyan, 01/11)

## O problema em uma frase

A aba é de **cobrança**: o que o gestor vai olhar no 1:1. Cobrança ninguém abre por vontade. Tudo que dá vontade de voltar já existe no produto, mas está espalhado e escondido: pontos, sequência, conquistas, faixa do variável, nível do Playbook, caminho para líder.

## O que existe hoje (medido no banco em 01/11)

| Sinal de uso | Valor |
|---|---|
| Combinados aceitos pelo executivo | **0, desde sempre** |
| Treinos do PDI registrados em 30 dias | **1** (de 11 acordos) |
| Pessoas que fizeram quiz ou leram o Playbook em 30 dias / em 7 dias | **7 / 2** · o último registro é de 28/10 |
| Executivos com "habilidade do mês" combinada para outubro | **0** |
| Abertura da aba | **não medida**: o produto não registra (ver seção 5) |

**A tela hoje, de cima para baixo:**
1. "Antes do seu 1:1".
2. **Os mesmos 5 números do Hoje**, repetidos.
3. "O que combinamos", vazio: "ainda não tem 1:1 registrado".
4. "Um hábito para esta semana".
5. "Seu PDI", vazio: "ainda não anexou".
6. "Sua disciplina", em vermelho e âmbar.
7. "Playbook · nunca abriu a trilha".

Três blocos vazios e um de cobrança. Não há nada a conquistar.

**O que já existe e não aparece aqui** (tudo com dado real, nada a inventar):

| Peça | Fonte | Onde está hoje |
|---|---|---|
| Pontos da semana e a disputa dos R$ 250 | `placar_da_semana`, `disputa_da_semana` | Hoje do executivo, na Disputa |
| Conquistas: "Na rua 5 dias seguidos", "Fila zerada 5 dias", "Primeiro contrato do mês", "4 contatos em todos os quentes", "Demo 3 dias seguidos" | `minhas_conquistas()` | escondidas no app |
| Sequência de dias e da fila zerada (feriado não quebra, desde hoje) | `_sequencia_util`, `sequencia_da_fila_zerada` | app |
| Faixa do variável: "a próxima venda vale +R$ 250 · a 6ª muda a faixa: +R$ 550" | `comissionamento.json` | Meu desempenho, numa linha |
| Nível do Playbook (capítulos com quiz) | `playbook_progresso` | Pessoas do gestor ("Nível 2 · parado há 54 dias") |
| Habilidade do mês: antes, meta e agora | `habilidade_quadro()` | gestor e app (tela 3d) |
| Os 4 critérios de líder de praça e os afilhados | `lider_quadro()` | só o gestor vê |
| A rampa do novato: fases, dia X de 60, padrinho | `rampa_quadro()`, card "Minha rampa" | app |
| Reconhecimento da sexta: o destaque de cada combinado | `combinados_quadro()` | só o gestor vê |

## A ideia central

**A Desenvolvimento vira a carreira do executivo em forma de jogo.** Uma tela que responde, em 5 segundos, **"onde eu estou, o que eu ganho a seguir e quanto falta"**. Toda conquista sai da prova que já existe (GPS, foto, HubSpot). Nenhum ponto é dado por clicar.

Quatro camadas, da mais rápida para a mais longa:

### 2.1 A semana: placar e missão (o que dá para ganhar até sexta)
- **Barra de pontos da semana**, com a regra do placar (venda 100, demo 25, visita com prova 3), a sua posição e "faltam N para passar o 2º". É a mesma disputa dos R$ 250, agora com cara de jogo.
- **Missão da semana: uma só, com recompensa visível.** É o "hábito de maior distância para o time" que já existe, transformado em missão: "Registrar o como foi antes de ligar o carro · 1 de 2 · cumpra até sexta e ganhe o selo **Registro na hora**".
  - Ela fecha sozinha quando a prova chega.
  - Desenhe o estado "missão cumprida" com a celebração.
- **Sequências:** "Na rua há 4 dias seguidos · recorde 9" e "Fila zerada 2 dias". A chama apaga se o dia útil passar sem fazer. Fim de semana e feriado não apagam.

### 2.2 O mês: o variável e a habilidade
- **A escada do variável** como barra de fases: a faixa de hoje, a próxima e "a 6ª venda vale +R$ 550". É o motivador mais forte que temos e hoje é uma linha de texto.
- **A habilidade do mês como o "chefão" do mês:** antes 18% → meta 25% → agora 21%. O dia em que bate, vira medalha. Sem habilidade combinada, o bloco convida: "combine no 1:1 de terça".

### 2.3 A carreira: o caminho até líder de praça
Uma trilha visível de degraus. Cada degrau tem critérios reais, com marca de cumprido ou pendente, e o próximo passo sempre escrito:
1. **Rampa (dia 1 a 60):** as 4 fases do playbook, o dia X de 60 e o padrinho. Para o novato, é aqui que a rampa aparece, agora que a aba Rampa saiu do gestor.
2. **Pleno:** bateu a rampa, meta de 8 clientes.
3. **Líder de praça:** os 4 critérios do `lider_quadro()`.
   - **Os 4:** 3 meses no ritmo de 6 visitas com prova por dia útil; demo vira cliente acima do time; registro verdadeiro; padrinho de um novato que se formou.
   - **Hoje só o gestor vê esses critérios. Passam a ser do executivo.**
   - Exemplo de texto: "2 de 4 · falta 1 mês no ritmo (outubro ficou em 5,7)".
- **O Playbook vira nível:** "Nível 2 de 6 · próximo capítulo: Objeções (quiz de 5 min)". Ler e passar no quiz sobe o nível, e o nível aparece no perfil.

### 2.4 Coleção: as medalhas
- O mural das conquistas de `minhas_conquistas()` mais os selos das missões e das habilidades batidas.
  - Cada uma com a data em que foi ganha.
  - As ainda bloqueadas aparecem em cinza, com o progresso: "3 de 5 dias".
- **O reconhecimento da sexta aparece para o executivo:** "Você foi o destaque da semana em Ficha na hora (100%)". Hoje só o gestor vê.

### 2.5 Comparação: com você primeiro, com o time só para cima
- **Primeiro, você contra você:** "sua melhor semana: 48 pts", "seu recorde de sequência: 9 dias", "este mês × o anterior".
- **O time só aparece como pódio e como o próximo a passar.** Ninguém é exposto como último. A posição completa só aparece no ranking que já existe.

### 2.6 O 1:1 encolhe para uma linha
"Seu 1:1 é terça 08:30 · leve: 2 combinados cumpridos · 1 missão". O detalhe abre num clique. Os 5 números do Hoje **saem** desta aba, porque já estão no Hoje.

## 3. Como ele chega na tela (o porquê de ninguém clicar)

Ninguém abre uma aba por obrigação; a pessoa abre quando acontece alguma coisa. Desenhe as entradas:
- **No momento da vitória:**
  - Conquista desbloqueada, missão cumprida ou faixa do variável mudou: aparece um toast ou uma folha no app, logo depois do check-in ou da venda. Por exemplo: "Selo Na rua 5 dias · ver a coleção".
  - O toque leva à Desenvolvimento.
- **No Hoje:** uma pílula pequena e fixa, por exemplo "Missão: 1 de 2 · Sequência 4 dias", que abre a aba.
- **Na segunda às 8h,** um push: "Sua missão da semana: …".
- **Na sexta às 17h,** um push: "Você fechou a semana com 312 pts, 4º · seu recorde é 348". Use o mesmo `push-fila` que já existe.

## 4. Regras que não mudam

- **Ponto só nasce de prova:** GPS ou foto na visita, HubSpot na demo e na venda. Clicar, ler ou abrir a aba não dá ponto. O placar e a regra dos R$ 250 **não mudam**.
- **A meta de cada pessoa é a da planilha:** pleno 8 e novato 3 em novembro. O novato tem a trilha dele e não compete em degrau com o pleno.
- **Feriado e fim de semana não quebram sequência nem missão.**
- **Avisar, não travar. Ninguém é exposto como pior.**
- Design system Takeat: Poppins, tokens claro e escuro, ícones do kit, zero emoji. Celebração curta (até 2 s) e que respeita "reduzir movimento".
- O número de cada bloco é o mesmo do Cockpit e do app, da mesma fonte. Desde hoje, app e Cockpit não podem divergir.

## O que NÃO entra

- Dinheiro novo, prêmio novo ou mudança na regra do variável e do bônus. Isso é decisão comercial, fora deste pedido.
- Ranking completo nesta tela. Ele já existe na Disputa.
- A visão do gestor (Pessoas). Só ganha o "o executivo viu a missão" se for barato.

## 5. Medir uso (pedido junto)

Hoje não sabemos quem abre a aba. Faz parte deste pedido:
- registrar a abertura da Desenvolvimento e do Meu desempenho (tabela `aberturas_de_tela`: pessoa, tela, quando);
- registrar quando o executivo vê uma conquista.

O gestor vê "abriu esta semana: sim ou não" na Pessoas.

## Estados a desenhar

1. Pleno na quarta: missão 1 de 2, sequência de 4 dias, 3º no placar e a 6ª venda a 1 de distância.
2. Missão cumprida: a celebração e o selo entrando na coleção.
3. Novato no dia 12 de 60: a trilha da rampa (S1 aprovada, S2–3 em curso), o padrinho e a meta de 3.
4. A semana que começou zerada (segunda 8h): missão nova, sequência 0 e "sua melhor semana: 48 pts".
5. Perto de líder: 3 de 4 critérios, com o que falta.
6. Sem habilidade combinada e sem 1:1: os convites, sem bloco vazio.
7. Toast de conquista no app depois do check-in.
8. Feriado no meio da semana: a sequência mantida, com o aviso "feriado não conta".

## O que espero receber

- As pranchas do app em 390 px (a tela principal) e do Cockpit em 1280 px, claro e escuro, com os 8 estados.
- Um protótipo do momento da vitória: check-in, toast, coleção.
- O texto de cada missão possível (uma por combinado) e de cada medalha.

## Como medir (aceite)

**Em 4 semanas:**
- executivos que abrem a aba ou o Meu desempenho pelo menos 1 vez por semana: **≥ 80%** (hoje não medido);
- missões cumpridas: **≥ 50%** das semanas;
- quem fez quiz do Playbook na semana: de **2 para 6**;
- combinados aceitos: de **0** para todos depois do 1:1.

O 1:1 começa pelo que a pessoa conquistou, não pelo que faltou.

## Recomendado (o design segue isto; o Julyan pode mudar qualquer item)

1. **Medalha é reconhecimento, não dinheiro.** O dinheiro continua só no variável e nos R$ 250.
2. **A posição no time aparece como pódio e como "o próximo a passar".** Nunca como lista do último ao primeiro nesta tela.
3. **A trilha tem três degraus: Rampa, Pleno e Líder de praça.** Não criamos um degrau novo, porque cada degrau tem critério que já é medido.
4. **A tela principal é o app**, e o Cockpit espelha.
