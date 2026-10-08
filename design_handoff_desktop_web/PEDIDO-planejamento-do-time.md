# Pedido ao Claude Design · Planejamento do time (Cockpit do gestor)

**De:** Julyan Ribeiro (Head comercial, Field Sales Takeat) · **Data:** 08/10/2026
**Onde:** Cockpit do gestor, desktop 1280 e 1600, notebook 640, nos dois temas. Tokens `--gv2-*` e o menu lateral novo do gestor.

> "Eu não consigo mais ver o planejamento de ninguém. Tá tudo na aba Pessoas. Preciso ver isso pelo Time ou pelo Raio X."

**A pergunta da tela:** "O que cada um planejou para hoje e para a semana, e quem está sem plano de verdade?"

**Entregue:** o mesmo formato das entregas anteriores: README, `PROMPT-*.md`, prancha `.dc.html` com todos os estados, `telas-alvo/*.png` e `tokens.json`.

---

## 1. O que já existe (08/10, no ar)

Hoje o planejamento de cada um aparece em três lugares, cada um com um pedaço:

- **Time:** o cartão "Planos de hoje" e a coluna "Plano hoje" de cada pessoa. Desde 08/10, os dois abrem uma **gaveta à direita** com a semana da pessoa. Ela mostra:
  - os dias e o mapa;
  - as paradas na ordem da hora;
  - o que foi feito com prova;
  - a agenda do dia.
- **Raio X:** o botão "Planejamento do time" abre a mesma gaveta.
- **Rua:**
  - **Rotas:** a lista do time à esquerda e a rota da pessoa à direita.
  - **Grade da semana:** 7 pessoas × 5 dias, com "x de y".

A gaveta foi uma solução rápida. O pedido é uma **visão própria**, pensada para o gestor planejar e cobrar o planejamento do time.

## 2. O dado, e o que ele significa (medido em 08/10)

**De onde vem cada parte:**
- **O plano:** as paradas que cada executivo põe no Planejamento (`planos_semanais`), espelhadas na rota do app. É a mesma fonte do app.
- **A agenda do dia:** tarefas e reuniões do HubSpot (ligações, follow-ups). O app mostra isso junto das paradas.
- **Quem tem agenda mas não tem parada está "sem rota", não "sem plano".** Exemplo de 08/10: o Marco tinha 0 parada e 1 ligação às 12:45.

**Como contamos:**
- **"x de y"** = visitas com prova no dia contra as paradas do plano. A regra é a mesma em todo o Cockpit.
- **Sem lugar no mapa:** paradas de negócios sem endereço no HubSpot. Em 08/10 eram 3 do André e 1 da Renata, entre outros. Elas contam no plano, mas não aparecem no mapa.
- **Restaurante repetido no mesmo dia** (lead e negócio do mesmo lugar) conta uma vez.

**Cada parada traz:**
- nome, hora (quando marcada) e propósito (funil, follow, nova, relacionamento);
- a ação do pino (Visita de prospecção, Follow-up, Reunião, Demo, Cobrar);
- se foi feita com prova.

## 3. O que a tela precisa mostrar

1. **Hoje, o time inteiro:**
   - **Uma linha por pessoa:** paradas do plano, quantas já com prova, a próxima parada e a hora, e o que tem na agenda do HubSpot.
   - **Quem está sem rota** em cima, em âmbar. Diferencie "sem rota, com agenda" de "sem nada".
2. **A semana:** pessoas × dias, com o planejado, o feito e o furo. Os dias futuros mostram o que já está montado. Mostre quem ainda não montou amanhã.
3. **O dia de uma pessoa:**
   - o mapa com as paradas na ordem e a linha do percurso;
   - a lista com a hora, o propósito e a ação;
   - a agenda do HubSpot do dia;
   - o que está sem lugar no mapa.
4. **Ações do gestor:**
   - Cobrar o plano (WhatsApp e sino do app, já existem);
   - Abrir na Pessoas;
   - Ver o negócio, na ficha que já existe.
5. **Fonte e hora** de cada número, sem "0 de 0". Fonte fora do ar aparece como "—", com o nome da fonte.

## 4. Onde fica

Proponha onde a visão mora:
- uma aba própria "Planejamento" no menu do gestor; ou
- um modo novo da Rua; ou
- uma seção do Time.

Justifique pelo uso: o gestor abre o Cockpit de manhã e quer saber se todo mundo tem plano e se está andando. Tem de ser alcançável **em 1 clique a partir do Time**.

## 5. Estados para as pranchas (com o dado real de 08/10)

| Estado | Exemplo |
|---|---|
| Todos com plano | Bruno 5, Sandro 6, Kelly 2, Renata 5, Sérgio 4, André 10 |
| Sem rota, com agenda | Marco: 0 parada · 1 ligação às 12:45 |
| Sem nada | ninguém hoje (desenhe mesmo assim) |
| Plano com itens sem lugar | André: 10 paradas, 3 sem endereço |
| Dia furado | ontem: André 6 de 8, Renata 6 de 10 |
| Amanhã ainda não montado | quem tem sexta vazia |
| Mapa indisponível | o Google sem cobrança: mapa reserva, a lista segue |
| Fonte fora | o plano não respondeu: "—" e o nome da fonte |

## 6. Testes de aceite

1. O "x de y" de cada pessoa é o mesmo do Time, da Rua, da Grade e da Pessoas, na mesma hora.
2. Quem não tem parada mas tem agenda nunca aparece como "sem plano".
3. O dia de uma pessoa lista as mesmas paradas e a mesma agenda que o app dela mostra naquele dia.
4. Chega-se à visão em 1 clique a partir do Time.
5. Sem rolagem horizontal em 640, 1280 e 1600, nos dois temas.
