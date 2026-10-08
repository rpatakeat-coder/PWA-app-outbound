# Pedido ao Claude Design · Cockpit do gestor v5

**De:** Julyan Ribeiro, Head comercial do Field Sales da Takeat · **Data:** 08/10/2026
**Base:** `AUDITORIA-COCKPIT-GESTOR-COMPLETA.md` (anexa) e as capturas de hoje em `ref-hoje/`.
**Onde:** Cockpit do gestor. Desktop 1440 e 1600, notebook 1280, e 640 (o gestor também abre no celular). Os dois temas, com o escuro como padrão.

> "Eu como gestor preciso ver tudo o que eles fazem, a rota deles, e como consigo ajudar e acelerar mais. **Eu gosto do formato que tem hoje**, só que algumas telas estão bem confusas."

## 0. A regra desta entrega: manter o formato, arrumar a casa

**Fica como está:**
- o menu lateral (símbolo oficial, um item por aba, barra de 3 px no ativo, 220/72/64);
- os tokens `--gv2-*` e o tema escuro;
- os cartões de número no topo;
- as tabelas densas;
- a gaveta à direita;
- o Daily;
- Propostas e Playbook.

**O trabalho é de arquitetura e de clareza:**
- cada pergunta do gestor tem **uma casa**;
- cada número tem **uma regra só**;
- o que ele precisa ver e não vê ganha tela: a jornada e a qualidade da visita.

**A pergunta do diretor de Field Sales, em quatro horários:**
1. **08h:** todo mundo tem plano? O plano é bom (praça certa, quentes, contas-alvo)?
2. **11h–17h:** quem está andando, quem travou e onde cada um está?
3. **Fim do dia e da semana:** o que cada um fez de verdade (jornada, portas, decisor, próximo passo) e onde o funil e o dinheiro param?
4. **Sempre:** onde o meu tempo rende mais (ir junto, 1:1, cobrar)?

## 1. As abas: mesma casca, uma pergunta por aba

| Aba hoje | Aba v5 | A pergunta | O que muda |
|---|---|---|---|
| Time | **Hoje** | Como está o dia do time agora? | Os cartões ficam. "Quem precisa de você" é agrupado por situação (§2.2). "Por pessoa" ganha a jornada (§2.3). Daily intacto. |
| Rua (Rotas, Agora no mapa, Grade) | **Rua** | O que cada um planejou, por onde andou e o que falta? | Vira a casa do **planejamento e da rota**, em 4 modos (§3). "Agora no mapa" entra no modo Hoje. |
| Raio X › Funil | **Funil** | Onde o funil e o dinheiro param? | Sem os cartões repetidos do Time; tudo clicável abre a gaveta (já é assim). |
| Raio X › Praça + Prospecção | **Território** | Onde atacar e quem precisa de contas? | Junta o estudo da praça com abastecer e aprovar contas, **no visual do v5**. A tela antiga de Prospecção sai. |
| Pessoas | **Pessoas** | Como cada um está e onde eu ajudo? | Uma página por pessoa em 3 blocos (§5). No topo, "Onde o seu tempo rende". |
| Propostas | Propostas | (fica) | — |
| Playbook | Playbook | (fica) | — |

São **7 abas**, como hoje, e 2 trocam de nome (Time → Hoje, Raio X → Funil). Se preferir manter os nomes atuais, diga por quê.

## 2. Hoje (antes: Time)

### 2.1 Os cartões do topo: uma regra só
**O defeito:** o mesmo "hoje" aparece como "5 de 42" (meta), "37 paradas" (plano) e "5/32" (rota). **A regra v5:**
- **Visitas com prova:** "5 de 37 do plano · meta 42". O plano é o denominador; a meta aparece ao lado.
- **Planos de hoje:** "7 de 7 · 37 paradas · 1 sem rota (com agenda)".
- Quentes · Travados · Mês: como hoje.

### 2.2 "Quem precisa de você", agrupado por situação
Hoje ao meio-dia são 5 linhas iguais. **v5:** uma linha por situação, com as pessoas em chips e uma ação para o grupo:

| Situação | A regra |
|---|---|
| **Travou** | plano com hora e nenhuma visita 1 h depois da primeira parada → Chamar |
| **Ainda não saiu** | antes da janela habitual dele (as 4 últimas semanas) → só informa, sem cobrar |
| **Sem rota** | sem rota hoje, com ou sem agenda → Cobrar o plano |
| **Furou ontem** | → Ver na daily |
| **Dinheiro parado** | quentes sem passo e o maior travado → Cobrar |

A ordem é pela gravidade. "Ainda não saiu" fica em neutro, porque a rua da maioria começa às 14h (medido em 07/10).

### 2.3 Por pessoa: entra a jornada
**Colunas:** Plano hoje · Visitas hoje · **Jornada** (1º check-in, último, minutos por porta) · Ontem · Quentes · Travados · Ação.

Clicar em Plano ou em Jornada abre a **Rua › Pessoa · dia** daquela pessoa.

### 2.4 A rua agora
O mapa do Time fica, com Expandir. Ele leva à Rua › Hoje. O "Agora no mapa" da Rua deixa de existir: hoje ele está quebrado e repete este mapa.

## 3. Rua: a casa do planejamento e da rota

Quatro modos no seletor do topo: **Hoje · Semana · Pessoa · dia · Amanhã**.

### 3.1 Hoje: a linha do tempo do time
- **Uma faixa por pessoa no eixo das horas (08h–20h):**
  - os check-ins como pontos, com prova cheio e declarada vazio;
  - as paradas planejadas com hora como marcas;
  - a agenda do HubSpot como ícones (ligação, reunião);
  - "agora" como uma linha vertical.
- À direita, o mapa com os pinos ao vivo (o atual do Time, maior).
- Clicar na faixa abre Pessoa · dia.
- **É a resposta para "ver tudo que eles fazem"**: janela de rua, buracos, check-ins colados.

### 3.2 Semana (a Grade atual)
- Pessoas × dias, com cumpriu, furou, sem plano e planejado. A Grade atual fica.
- **Toda célula abre aquele Pessoa · dia.** Hoje ela não é clicável.
- Coluna "Feito + plano" contra a meta da semana.

### 3.3 Pessoa · dia (a Rotas atual, consertada)
- **A ordem da lista (corrigir):**
  1. o que **já aconteceu**, pela hora do check-in, com prova, "como foi" e decisor;
  2. o que **falta**, pela hora planejada;
  3. por fim, sem hora e "sem lugar no mapa" (negócio sem endereço).
- **A linha do mapa** segue essa ordem. Hoje ela cruza a cidade porque ordena pela hora digitada e põe 18:00 antes da manhã.
- **Ao lado:** a agenda do HubSpot do dia e as visitas **fora do plano**.
- **No pé:** "Ver a semana" e "Abrir na Pessoas".

### 3.4 Amanhã
- Quem já montou o plano de amanhã e quem não montou.
- Do que montou: quantas paradas, propósito (funil, nova, relacionamento), contas-alvo, quentes e a praça.
- **Ação:** "Pedir o plano" (WhatsApp e sino, já existem).
- É o "08h" do diretor, visto na véspera.

## 4. Funil (antes: Raio X › Funil)
- **Sai:** os 5 cartões que repetem o Time.
- **Entram 4 cartões do funil:** Porta → fechado · Taxa Decisor → Demo · Ciclo (mediana) · Perdas do mês.
- **Ficam:** "Funil do mês", "Funil por pessoa", "Onde o dinheiro trava", "Tempo de ciclo", "Perdas do mês" e "Negócios", tudo abrindo a gaveta (já no ar).
- **"Funil por pessoa":** deixe claro que é "contagem do mês por passo, não a mesma turma". Mostre a taxa só quando o passo anterior tiver 3 ou mais. Hoje sai "Demo 4 · 400%".

## 5. Pessoas
- **Topo da aba: "Onde o seu tempo rende esta semana"**, com no máximo 3 cartões, cada um com o motivo e a ação. Exemplos:
  - "Ir a campo com Sérgio: 6 travados, porta → decisor 41%" → Marcar ida;
  - "1:1 com Bruno: primeiro 1:1, 9 de 9 ontem" → Abrir pauta;
  - "Cobrar Sandro: 16 reuniões sem desfecho" → Cobrar.
- **A lista da esquerda** fica, ordenada pela necessidade (a regra atual), **sem repetir o motivo do Hoje**.
- **A página da pessoa, em 3 blocos fixos** (uma rolagem, sem segundo nível de abas):
  1. **Agora e semana:** onde está, jornada de hoje, plano × feito da semana, Ver na Rua.
  2. **Coaching:** último 1:1, combinados com conferência, pauta pronta, Campo (próxima ida e roteiro).
  3. **Evolução:** ritmo de 4 semanas, disciplina (reuniões sem desfecho, portas sem como foi, decisor), funil do mês contra o time, Playbook.
- **Sai:** "Promessa de hoje". Ninguém do time usa; foram 0 promessas em 21 dias.
- Os 5 cartões-resumo do topo da pessoa ficam (são o espelho da Desenvolvimento do executivo).

## 6. Território (antes: Raio X › Praça + Prospecção antiga)
- **Uma tela no visual v5, em duas colunas:**
  - **Onde atacar:** o mapa de calor, bairros com muito lead e pouca visita, contra quem (sistemas) e a voz da rua;
  - **Abastecer:** quem precisa de contas (estoque ÷ consumo), a fila de aprovação por dono e o território órfão.
- **Sem jargão.** "Torneira", "munição" e "backlog seco" viram "contas para visitar", "contas no estoque" e "sem estoque".
- **Toda ação é um botão:** Importar, Aprovar selecionadas, Decidir o território.

## 7. O dado (tudo já existe; não invente número)

| Bloco | Fonte | Regra |
|---|---|---|
| Plano do dia e da semana | `planejamento_do_time` / `rotas_da_semana` (o Planejamento) | o mesmo restaurante conta uma vez por dia; "sem lugar no mapa" = negócio sem endereço |
| Visitas com prova | `visitas_com_prova` | GPS até 200 m ou foto; "x de y" = visitas com prova ÷ paradas do plano |
| Agenda do dia | HubSpot (`DATA.agenda`: tarefas e reuniões) | nota e tarefa concluída não contam; sem parada + agenda = "sem rota", nunca "sem plano" |
| Jornada | `client_visits` (hora, GPS, distância) | 1º e último check-in, minutos entre portas |
| Qualidade da visita | `fichas_de_rua` | como foi, decisor, sistema, dor, próximo passo, motivo da perda |
| Reuniões sem desfecho | `client_meetings` | só os 30 últimos dias |
| Funil, quentes, travados, provável | `funilLeads` + regras v4 | provável = fechados + Ag. Pagamento + 60% da Negociação |
| 1:1, combinados, Campo | `um_a_um`, `gestor_idas_campo` | — |
| Território | `leads_prospeccao`, `gestor_v4_leituras` | conta-alvo = a importada pelo Cockpit |

**Número que a fonte não deu é "—" com o nome da fonte, nunca 0.**

## 8. Estados para as pranchas (dado real de 08/10)
- **Meio-dia, a maioria ainda sem sair:** Sérgio 0 de 5, Renata 0 de 5, Kelly 0 de 2 e Marco 0 de 1. André 4 de 13 e Sandro 1 de 6 já em visita.
- **Fim do dia com jornada curta:** Sandro em 07/10, 7 visitas entre 14:38 e 15:27.
- **Sem rota, com agenda:** o Marco em 08/10 antes de montar o plano, com 1 ligação às 12:45.
- **Plano com itens sem lugar:** o André com 13 paradas, 4 sem endereço.
- **Amanhã:** quem tem sexta montada (André 7, Kelly 13) e quem não tem.
- **Fonte fora:** o plano sem responder → "—" e o nome da fonte (aconteceu de verdade em 08/10).
- **Mapa sem o Google:** o mapa reserva, e a lista continua.

## 9. Testes de aceite
1. O "x de y" de uma pessoa é o mesmo no Hoje, na Rua (todos os modos), na Grade, na Pessoas e no Daily.
2. Cada pergunta do §0 tem **uma** aba que a responde inteira; as outras levam até ela em 1 clique.
3. Pessoa · dia lista as mesmas paradas e a mesma agenda que o app daquela pessoa mostra naquele dia, na ordem do que aconteceu.
4. Todo número clicável abre o que está por trás dele (gaveta ou tela); nenhum botão sem destino.
5. Nenhuma tela antiga dentro do v5 (a Prospecção sai).
6. Sem rolagem horizontal em 640, 1280, 1440 e 1600, nos dois temas.
7. A página de uma pessoa cabe em uma rolagem, sem segundo nível de abas.

## 10. Entregue
O mesmo formato das entregas anteriores:
- README;
- `PROMPT-*.md` com a Fase 0;
- pranchas `.dc.html` de todos os estados;
- `telas-alvo/*.png`, um por estado, por aba e por tamanho;
- `tokens.json`.

**Prioridade, se precisar dividir:**
1. Rua (os 4 modos);
2. Hoje (§2.1–2.3);
3. Pessoas;
4. Território;
5. Funil.
