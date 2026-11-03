# Pedido ao design — abas Hoje e Eu do app de rua, enxutas

**Para:** Claude Design · **De:** Julyan (Head comercial, Field Sales Outbound da Takeat) · **Data:** 03/11/2026
**Onde:** o app de rua (PWA, celular, 390 px), as abas **Hoje** e **Eu** da barra Mapa · Hoje · Eu.

**Em uma frase:** o executivo tem que abrir o app e **só vender**. Hoje as duas abas têm tudo o que
precisam, mas estão longas: a Hoje tem 2.285 px e a Eu tem 3.689 px. O que importa agora fica
enterrado embaixo de explicação. Quero as duas **enxutas, de bater o olho**.

Este pedido é para **MELHORAR as telas que existem, não redesenhar regra**. Leia "Congelado" antes.

---

## 1. Relembrando o projeto

- **O time:** executivos de rua da Takeat (sistema para restaurantes) batem na porta, falam com o
  decisor, fazem demo e fecham. O HubSpot é o CRM. O Supabase guarda visitas, rotas e pontos.
- **Funil oficial (funil inverso):** 6 visitas e 1 demo por dia; 30 visitas e 5 demos por semana;
  8 clientes e R$ 3.000 de MRR por mês para um pleno (rampa: 2 clientes).
- **O app (PWA):** a barra de baixo tem **Mapa · Hoje · Eu**. O Mapa é onde o executivo vive na rua:
  lentes, próxima porta, Cheguei por GPS (a visita é o check-in) e ficha "Como foi". O **Hoje v3**
  (01/11) já trouxe folha da manhã, pílula-placar, toast depois do Cheguei e fecho das 18h por push.
- **O Cockpit** (computador) é espelho: o mesmo dia, os mesmos números. O gestor conduz a daily ali.
- **Gamificação:** bônus de R$ 250 da semana (venda 100, demo 25, visita com prova 3), missão da
  semana, sequências (na rua, fila zerada), habilidade do mês, carreira, coleção de selos e "você
  contra você".
- **Regras-mãe:** um negócio, um próximo passo; obrigatório é avisar, nunca travar; nenhuma cor fora
  dos tokens do app (`public/index.html`, claro e escuro); zero emoji.

---

## 2. Como as abas estão hoje (medido logado, 390 px, 03/11)

### Aba Hoje — 2.285 px de altura, 29 botões
De cima para baixo:
1. Cabeçalho "Hoje · 20 tarefas hoje", com o Playbook, o sino e o avatar.
2. Faixa vermelha "Missão 0 de 2 · Na rua 0 dias ›".
3. Fileira de dias: Hoje 20 · Amanhã · Qui · Sex · Seg · Depois, com a contagem de cada um.
4. Anel "0 de 20 feitas hoje · faltam 20 · de cima para baixo, termina no bloco 3".
5. **1 · Para hoje · 0** ("nada mais vence hoje").
6. **2 · Atrasados · 2**: até 3 dias, e negócio quente de qualquer data. Os cartões trazem etapa,
   contato, "venceu há N dias", "O que foi combinado" e os botões Ligar · WhatsApp · Pôr no plano.
7. **3 · Sem próximo passo · 20**: legenda de duas linhas e cartões com Marcar o passo · Ligar ·
   WhatsApp, 5 por vez e depois "Mostrar mais".
8. Recolhidos: Atrasados antigos · Combinados com o gestor · Feito hoje.

**O que machuca:**
- "20 tarefas hoje" e "0 de 20" ao lado de "Para hoje · 0 · nada mais vence hoje". O vendedor não
  sabe se tem 20 coisas ou zero para fazer hoje.
- **O plano do dia (as portas da rota) não aparece na aba Hoje.** Ele está no Mapa e na folha da
  manhã. O pacote "espinha do dia" (28/10, item 2.8) pedia o grupo PLANO aqui.
- Cada bloco tem legenda explicando a regra. Para quem está na rua, é texto demais.
- A faixa vermelha da Missão parece alarme, e é jogo.

### Aba Eu — 3.689 px de altura (quase 4,5 telas)
De cima para baixo:
1. "Meu desempenho", o subtítulo e os selos (Pleno · Playbook nível 1).
2. O aviso do 1:1.
3. **A semana · disputa dos R$ 250**: pontos e tabela de pontos.
4. **Missão da semana.**
5. **Sequências**: na rua e fila zerada, com os 5 dias.
6. **O mês · seu variável.**
7. **Habilidade do mês · o chefão.**
8. **Sua carreira.**
9. **Coleção.**
10. **Você contra você.**
11. Só no fim vem a lista que se usa: Planejar a semana · Playbook · Recém-abertos da semana ·
    Gestão · O time na rua · Avisos · TakeatOS · HubSpot · Ajustes e sair.

**O que machuca:**
- A pergunta "quanto eu ganho e quanto falta" está espalhada em 3 blocos (semana, mês, carreira).
- O pacote "espinha do dia" (item 2.9) pedia no topo "{Mês} · faixa N da variável" e uma grade 2×2
  (**HOJE** N de 6 · **SEMANA** · **MÊS** R$ e contratos · **PRÓXIMA VENDA** +R$). Hoje não existe
  "HOJE" na aba Eu.
- Os atalhos do dia a dia (Planejar a semana, Playbook) ficam no fim de 3.689 px.

---

## 3. CONGELADO — não mexer

- **As regras e os números.** A fila (valor × urgência, do servidor), "sem próximo passo" (vencido +
  nunca marcado, Ag. Pagamento fora), o atrasado antigo (mais de 3 dias e não quente vai para o
  recolhido), os pontos (100 / 25 / 3), metas, faixas da variável, missão, sequências, habilidade e
  carreira. Número errado é defeito meu, não pedido de tela.
- **Os gestos e o que eles gravam:** Ligar · WhatsApp · Pôr no plano · Marcar o passo · Remarcar ·
  Sem interesse com motivo · Desfazer de 5 s · as janelas de ligação 12:30 e 17:30 · "Visita só
  conclui com o Cheguei".
- **A fileira de dias** (Hoje, os 4 dias úteis seguintes, Depois) e o que cada dia abre.
- **O Mapa** inteiro: lentes, pinos, próxima porta, Cheguei, ficha "Como foi" e a pílula-placar.
- **O Hoje v3:** folha da manhã, toasts depois do Cheguei, fecho das 18h por push.
- **Nada sai do produto.** Tudo o que deixar a primeira tela continua a 1 toque (recolhido, gaveta
  ou "ver tudo"), com a mesma ação.

---

## 4. O que eu quero

**H1 · Hoje responde "o que eu faço agora" na primeira tela, sem rolar.**
Em 390×844, acima da dobra:
- o placar do dia (portas com prova N de 6 e demo 0 de 1);
- **o plano do dia** (as portas que faltam, com hora e um verbo: **Ir**, que volta ao Mapa naquela
  porta);
- a **próxima ação** de maior valor (o 1º da fila).

Quem não tem plano vê o estado vazio com a ação: "Montar o dia ›".

**H2 · Um número só no topo, que bate com o que aparece.**
Troque "20 tarefas hoje" e "0 de 20" por números que o vendedor entende sem legenda, por exemplo
"2 atrasados · 16 sem passo · 0 vencem hoje". Cada número abre o seu grupo. O selo do rodapé, o
cabeçalho e os grupos contam a mesma coisa.

**H3 · Grupos na ordem da espinha do dia (2.8).**
ATRASADOS → PLANO → LIGAR HOJE (com a janela) → SEM PRÓXIMO PASSO. Cada linha tem **um verbo
principal** (Ir · Ligar · Dar o passo). Os outros botões ficam ao abrir a linha. O cartão fechado
cabe em 1 a 2 linhas.

**H4 · Menos explicação na tela.**
As legendas de regra viram um "?" ou somem. A tela fala com quem está na rua, não com quem audita.

**H5 · Missão e sequências como incentivo, não como alarme.**
Saem do vermelho de alerta. Devem estar à vista, mas pequenas: uma linha ou um selo.

**E1 · Eu abre com "quanto eu ganho e quanto falta".**
No topo:
- "{Mês} · faixa N da variável";
- o que falta para a próxima faixa;
- a grade 2×2 HOJE · SEMANA · MÊS · PRÓXIMA VENDA, como na espinha do dia (2.9).

**E2 · A semana dos R$ 250 numa linha que puxa.**
Exemplo: "37 pts · 3º · faltam 10 para passar o 2º". Tocar abre a disputa completa.

**E3 · O jogo fica, mas recolhido e por ordem de uso.**
Missão, Sequências, Habilidade, Carreira, Coleção e Você contra você viram cartões compactos ou
uma gaveta "Meu jogo". O que tem prazo esta semana (missão, sequência) aparece primeiro.

**E4 · Os atalhos sobem.**
Planejar a semana · Playbook · Recém-abertos ficam visíveis sem rolar ou numa fileira fixa.
Gestão, O time na rua, TakeatOS, HubSpot e Ajustes podem ficar num grupo "Mais".

---

## 5. Aceite e entrega

- **Orçamento:**
  - Hoje: o essencial (placar, plano e próxima ação) sem rolar a 390×844; a tela inteira com metade
    da altura de hoje (≤ 1.150 px num dia típico).
  - Eu: topo (faixa + 2×2 + semana) sem rolar; tela inteira ≤ 1.600 px.
  - Diga quantos botões ficam em cada tela.
- **Estados:**
  - executivo com plano e no ritmo;
  - sem plano antes das 9h;
  - atrasado com 2 quentes;
  - fila zerada;
  - executivo em rampa;
  - líder da semana;
  - semana zerada;
  - os dois temas (claro e escuro), a 375 e a 390 px.
- **Entrega:** a prancha e uma lista com **o que entra / o que sai (e para onde vai, a 1 toque) /
  o orçamento**. Para cada número novo, diga de onde você imagina que ele vem. Eu confiro se o dado
  existe antes de construir.
