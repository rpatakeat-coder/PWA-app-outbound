# Pedido ao Claude Design · a ordem da porta, e as lentes de volta

**De:** Julyan Ribeiro (Head comercial, Field Sales Takeat) · **Data:** 29/10/2026
**Onde:** app de rua (PWA), aba Mapa, 390 px (e 375), claro e escuro
**Vem depois de:** `espinha_do_dia/PROMPT-CLAUDE-CODE-APP-DE-RUA.md` (itens 2.5 e 2.6) e
`espinha_do_dia/PROMPT-CLAUDE-CODE-MAPA-LIMPO.md` (que está inteiro no ar e **fica**)

> "óbvio que o lead não pode sair sem próximo passo, mas o **CHEGUEI e marcar o check-in é
> mais importante**, depois o próximo passo. Do jeito que tava antes tava legal."
>
> "só as fichas do card que tava bom do jeito que estava antes, **o mapa mais limpo eu gostei**."
>
> "eu gostava das lentes, dá para deixar elas também? talvez menor e arrastável lateralmente."

---

## 0. O que aconteceu, para o design não repetir

Em 29/10 o item 2.6 foi implementado assim: o Cheguei passava a abrir uma *visita*, a folha
trocava para "Na porta · {nome}" com um botão só — "Saí · como ficou?" — e a ficha só abria
depois, já na opção escolhida.

**Foi desfeito no mesmo dia, a pedido do Julyan, por dois motivos.** O primeiro é um erro de
execução que não se discute: enquanto a visita estava aberta, a folha **substituía a si mesma**
e o Cheguei da próxima porta sumia da tela — o item 2.6 §2d já mandava o contrário, com todas
as letras ("Cheguei na próxima continua funcionando").

O segundo é o que este pedido quer resolver, e é de hierarquia:

> **Marcar a visita é o que não pode FALHAR. O desfecho é o que não pode ser ESQUECIDO.**
> São duas coisas, em dois momentos, e a segunda nunca pode tomar o lugar da primeira.

O Cheguei é a prova: ele vira ponto, e o ponto vira o bônus de R$ 250. Qualquer desenho em que
o desfecho dispute espaço com o Cheguei está errado, por mais bem-intencionado que seja.

---

## 1. O problema que continua de pé, com número

O diagnóstico que motivou o 2.6 **não foi desfeito** — só a solução foi.

Em `App.tsx` está escrito: *"Ficha de rua: abre depois do check-in"*. Ou seja, o app pergunta
"como foi?" no instante em que o executivo **encosta** na porta, antes de falar com ninguém.

E o número que isso produz, medido em 29/10 no banco:

- "Apresentei agora" (a opção que move para Demo/Proposta) existe desde **14/10**
- de lá para cá: **7 de 314 fichas** levaram alguém a Demo/Proposta
- no mesmo mês houve **154 pontos de demo** — ou seja, a demo acontece e a ficha quase nunca sabe

A opção não está escondida. **Ela é oferecida cedo demais.**

---

## 2. O que eu quero que o design resolva

> Como pedir o desfecho no momento certo **sem** que ele tire espaço, atenção ou toque do
> Cheguei — e sem transformar o dia do executivo em dois formulários?

Pontos fixos, que não se negociam:

- **O Cheguei está sempre a um toque**, em qualquer estado, com visita aberta ou não.
- **O desfecho nunca substitui a folha.** No máximo se soma a ela, e perdendo a disputa de
  destaque para o Cheguei.
- **Nada trava.** Regra-mãe da casa: obrigatório é avisar, não travar.
- **A ficha de rua é a mesma.** Nenhum formulário novo — isso o pedido anterior já dizia e
  continua valendo.
- A visita sem desfecho **já é cobrada hoje** pela linha do dia no estado `pendente`, que é
  vermelha e abre o desfecho. Essa cobrança existe e funciona; use-a em vez de criar outra.

Três direções possíveis (escolha uma, ou proponha a quarta):

- **A · A ficha continua abrindo na chegada, e ganha um segundo momento.** Ela abre como hoje
  (nada muda para quem já se acostumou), e o que estiver em branco volta a ser perguntado na
  saída, em uma linha. Vantagem: zero mudança de hábito. Risco: perguntar duas vezes.
- **B · A ficha abre na chegada, mas com a ordem invertida por dentro.** Primeiro o que ele sabe
  ao encostar (quem atendeu, está aberto?), e o "e agora?" só aparece depois — no mesmo
  formulário, mais abaixo, ou num segundo passo. Vantagem: um formulário só. Risco: rolagem.
- **C · O desfecho é um bloco de uma linha no topo da folha**, que aparece quando há visita sem
  desfecho e some quando ele dá. A folha continua inteira embaixo, com o Cheguei no lugar de
  sempre. Vantagem: respeita a hierarquia por construção. Risco: mais uma camada sobre o mapa,
  logo depois de a gente ter tirado cinco.

O item 3 de sempre — **o que acontece se ele ignorar** — é o que mais importa aqui.

---

## 3. As lentes de volta: menores e arrastáveis

Na fase 1 do mapa limpo a fileira de lentes saiu do topo e virou um **chip** no campo de busca
(`● Meu dia ▾`), que abre a folha da lente. Isso resolveu a poluição — e o Julyan **gostou do
mapa mais limpo**, isso fica.

Mas ele sentiu falta das lentes à mão: *"eu gostava das lentes, dá para deixar elas também?
talvez menor e arrastável lateralmente"*.

A tensão é real e o design precisa resolvê-la sem desfazer o que ficou bom:

- a fileira antiga tinha **44 px de altura**, ficava numa faixa própria e **empurrava** tudo o
  que vinha abaixo — foi parte das cinco faixas empilhadas que motivaram o mapa limpo;
- e ela carregava **contagens de viewport** (`Meu dia 234`), que mudavam a cada arraste. Esses
  números **não voltam** — a regra do §8 continua valendo: um número no mapa só muda por algo
  que o executivo fez.

O que eu preciso ver na prancha:

1. onde a fileira menor cabe **sem voltar a empilhar** (ela convive com a faixa da vez? some
   quando a faixa aparece? mora dentro de outra coisa?);
2. a altura exata e o tamanho do toque (o mínimo da casa é 44 px — se a fileira ficar menor que
   isso, como o alvo continua honesto?);
3. o que acontece com o **chip da lente** no campo de busca: continua, vira redundante, ou o
   chip some e a fileira assume?
4. o que marca a lente **ativa**, agora sem número;
5. e onde fica o **selo de filtro ligado**, que hoje mora dentro do chip e é o único aviso de
   que há filtro.

---

## 4. O que NÃO entra

- **O mapa limpo não se desfaz.** As duas posições fixas (fileira a 50, faixa a 106), o
  alternador Mapa | Lista, a folha com o kicker da linha do dia, a contagem congelada da Lista
  e os botões neutros ficam como estão.
- **Os pinos não mudam.** Cores de etapa e temperatura são dado, não decoração.
- **Nenhuma cor nova** — só os tokens que o app já tem. Poppins, sem emoji, toque de 44 px.
- **Nada trava**, e **HubSpot e Asaas não se tocam**.

## 5. O que já existe e se reaproveita

| peça | onde está |
|---|---|
| Ficha de rua completa, com "Apresentei agora", "Fechou", "Perdeu" e os dias | `FichaDeRua.tsx` — **não refazer** |
| Cobrança (Fechou → Ag. Pagamento, mínimo de 50 caracteres) | `cobranca.ts` |
| Cobrança da visita sem desfecho | linha do dia, estado `pendente`, já vermelha e já funcional |
| Folha da lente (lentes, etapas, Limpar, Modo sol) | `FolhaLentes.tsx`, aberta pelo chip |
| Fileira de lentes antiga, com o código ainda vivo no desktop | `FileiraDeLentes.tsx` |

## 6. O que eu espero receber

Prancha a 390 px, nos dois temas, com:

1. **O momento da chegada** — o que ele vê ao dar Cheguei, na direção escolhida no item 2.
2. **O momento da saída** — e, em cima dele, a prova de que o Cheguei da próxima porta continua
   a um toque.
3. **O estado "esqueci"** — visita sem desfecho, e como ela cobra sem atrapalhar a rua.
4. **A fileira de lentes nova**, no estado quieto e no pior minuto do dia (12:30, com filtro
   ligado, dia sem plano, janela de ligação) — é aí que se prova que ela não voltou a empilhar.
