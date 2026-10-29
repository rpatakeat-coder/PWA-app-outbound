# Pedido ao Claude Design · o mapa limpo

**De:** Julyan Ribeiro (Head comercial, Field Sales Takeat) · **Data:** 29/10/2026
**Onde:** app de rua (PWA), aba Mapa, no celular do executivo (390 px é o aparelho dele)
**Print:** `screenshots/18-mapa-poluido-29-10.webp` — conta real, 13:23 de 29/10, Rio

> "o mapa ficou muita coisa... não curti. o mapa, que é o que eles mais usam, ficou
> com uma poluição visual que não dá. podemos ter uma aba só pra lista e aí as outras.
> pense, vamos deixar esse app o mais BONITO e FUNCIONAL para um executivo de excelência."

---

## 0. O problema em uma frase

**O mapa virou um painel com um mapa atrás.** Cada peça que entrou nos últimos 15 dias
entrou certa e entrou sozinha; somadas, elas cobrem a cidade e escondem a única coisa
que o executivo veio ver — onde estão as portas e qual é a próxima.

Isto **não** é um pedido para tirar funcionalidade. É um pedido de **hierarquia**: uma
coisa principal, o resto esperando a vez.

---

## 1. O que está sobre o mapa, medido

### 1.1 No print de 13:23, de cima para baixo

| # | camada | o que diz |
|---|---|---|
| 1 | busca | "Buscar lead, rua ou bairro" + sino com **3** + avatar **J** |
| 2 | fileira de lentes | `Meu dia 234` · `Clientes 20` · `R…` (cortada) · botão de filtro |
| 3 | linha do dia | faixa âmbar `Dia sem plano · o gestor vê quem planejou · Montar ›` |
| 4 | pílula da lista | `Ver em lista · 234` |
| 5 | placas sobre o mapa | `Jacarezinho · 3 clientes`, `Sao Cristovao ·`, `6 novos clientes Takeat` + os rótulos do próprio Google |
| 6 | botão de localização | canto esquerdo |
| 7 | botão "+" | canto direito, vermelho |
| 8 | folha recolhida | barra `0/6 ⌃` |
| 9 | barra de abas | `Mapa · Hoje · Eu`, com selo `6 atrasados` |

**Nove camadas.** As de 2 a 4 ficam todas encostadas no canto superior esquerdo, uma
embaixo da outra, e **se atropelam no print**: `Clientes 20` está parcialmente coberta,
a terceira lente aparece como `R…` e o botão de filtro corta a fileira. A 5 escreve por
cima do mapa em três lugares diferentes.

### 1.2 O que o código já sabe (não é opinião minha)

Em `App.tsx` existe um bloco com este nome, escrito por quem montou:

```
══ O QUE SE EMPILHA ABAIXO DAS LENTES ══
Lentes › linha do dia › pílulas ("Limpar", "Ver em lista") › janela das ligações › área.
Calculado num lugar só, de propósito: enquanto cada peça escolhia o próprio `top`, as
pílulas (44+6) e a faixa das janelas de ligação (44+8) nasceram as duas quase no mesmo
pixel e se cobriam nas duas janelas do dia, 12:30–12:45 e 17:30–17:45.
```

São **cinco faixas** possíveis em pilha, e **duas delas já se cobriram em produção**. O
arranjo atual não é um desenho: é um cálculo de `top` para as peças não baterem.

Há outro comentário, sobre a contagem do recorte:

```
era uma linha de 32px de chrome dizendo um numero que muda a cada arraste
```

Isso vale para os números das lentes também: **`234` e `20` são contagens da área
visível**. Arrastar o mapa dois centímetros muda os dois. Às 12:02 do mesmo dia, o mesmo
app mostrava `Meu dia 143 · Clientes 49`. **Número que muda sozinho a cada gesto não é
informação: é ruído com aparência de dado.**

### 1.3 O que mais pode aparecer, e não está no print

- pílula **`Limpar`** (quando há filtro)
- faixa da **janela das ligações** (12:30–12:45 e 17:30–17:45)
- faixa de **estado do carregamento por área**
- **cartão da quadra** (ao tocar numa pilha de pinos)
- **lente Calor** (só gestor)
- os outros 13 estados da **linha do dia** (ela tem 14 — ver `espinha_do_dia/`)

No pior minuto do dia — 12:30, com filtro ligado, dia sem plano — o executivo tem
**cinco faixas** entre a busca e o primeiro pino.

---

## 2. Eu, executivo de excelência: por que isso me atrapalha

**2.1 Eu venho ver a rua, não o placar.** O mapa é a ferramenta; o resto é contexto. Hoje
o contexto ocupa o topo inteiro e a rua fica na metade de baixo, atrás de três etiquetas.

**2.2 Os números piscam e eu paro de confiar.** `234` vira `143` porque eu arrastei. Quando
um número se mexe sem motivo, eu paro de olhar para **todos** os números — inclusive o
`0/6`, que é o único que decide se eu bato a meta.

**2.3 Eu não sei qual é a coisa principal.** Vermelho no "+", vermelho no selo de atrasados,
âmbar na faixa do plano, branco nas pílulas. Quatro pesos visuais disputando, nenhum
vencendo. Numa calçada, com sol, de pé, eu preciso de **uma** coisa óbvia.

**2.4 A lista é meio escondida e muito usada.** `Ver em lista · 234` é uma pílula branca no
meio da pilha. Lista e mapa são o mesmo recorte visto de dois jeitos, e eu alterno entre
eles o dia inteiro.

---

## 3. A ideia central para o design resolver

> Como o mapa volta a ser um mapa, sem que nada do que já existe deixe de ser alcançável?

Três direções possíveis (escolha uma, ou proponha a quarta):

- **A · Uma faixa só, que troca de conteúdo.** Abaixo da busca existe **uma** faixa de 48 px,
  sempre no mesmo lugar, e ela mostra por vez a coisa mais importante do momento (a
  prioridade da linha do dia já define essa ordem). Lentes e filtro viram um controle
  compacto. Vantagem: altura fixa, previsível, nunca empilha. Risco: esconder a lente ativa.
- **B · O topo recolhe quando o dedo toca o mapa.** Tudo some ao arrastar e volta ao soltar
  (ou com um puxador). Vantagem: a rua inteira aparece quando ele está lendo a rua. Risco:
  estado escondido, ele esquece que há filtro ligado.
- **C · A folha de baixo assume o contexto.** O topo fica só com busca e lente; placar,
  lista, filtro e plano moram na folha, que ele já usa e já puxa. Vantagem: um lugar só
  para contexto. Risco: a folha vira a nova gaveta de tudo.

Qualquer que seja: **os números das lentes precisam de decisão** — ou deixam de ser contagem
de viewport, ou saem da pílula. O design diz qual.

---

## 4. A tensão que precisa da minha palavra, e eu já dou

Eu levantei "uma aba só pra lista". Preciso ser honesto sobre o custo, porque **acabamos de
fazer o contrário**: em 29/10 a barra foi de 6 abas para 3 (`Mapa · Hoje · Eu`) justamente
porque os executivos não saíam do mapa, e a Lista virou botão dentro da busca.

- **Lista como aba (4ª):** acha-se sozinha, sai da pilha do topo. Mas desfaz a redução que
  acabou de ir ao ar, e separa em duas abas o que é **o mesmo recorte** — mudar a lente no
  mapa teria de mudar a lista na outra aba, ou os dois passam a mentir um para o outro.
- **Lista como vista do mapa (hoje):** mantém os dois colados no mesmo recorte e a barra em 3.
  Mas a entrada é uma pílula fraca no meio da pilha.

**Minha inclinação é a segunda, com a entrada resolvida de verdade** — um alternador
mapa/lista evidente e fixo, do tipo que não divide espaço com mais nada. **Mas esta é a
pergunta que eu quero que o design responda com desenho, não com texto:** se a prancha
mostrar que a 4ª aba fica melhor para o executivo, eu aceito e volto atrás.

---

## 5. O que NÃO entra (orçamento)

- **Nada deixa de existir.** Toda peça do item 1 continua alcançável. O pedido é de
  hierarquia, não de corte de função.
- **Os pinos, as cores de etapa e temperatura e o Cheguei por GPS não mudam.** Cor de etapa
  (Q `#E23B3B`, M `#F5A524`, F `#0EA5E9`, cliente `#16A34A`) é **dado**, não decoração.
- **A barra de 3 abas só muda se o item 4 decidir que muda.**
- **Nenhuma cor nova.** Só os tokens que o app já tem (`--surface`, `--surface-2`,
  `--surface-3`, `--border`, `--stroke-strong`, `--text`, `--text-muted`, `--text-subtle`,
  `--vermelho-acao`, `--vermelho-texto`, `--ok-fundo`, `--ok-texto`, `--tint-amber`,
  `--tint-amber-text`). Claro e escuro saem pelos tokens. Poppins. Sem emoji. Toque mínimo
  de 44 px.
- **Não se trava nada.** A regra da casa é **obrigatório é avisar, não travar**: nenhum
  estado pode impedir abrir o mapa ou dar Cheguei.
- **HubSpot e Asaas não se tocam.** Nenhuma propriedade, nenhuma automação.

---

## 6. O que já existe e deve ser reaproveitado (não refazer)

| peça | onde está | observação |
|---|---|---|
| Linha do dia | topo do mapa | **14 estados** com prioridade definida, em `espinha_do_dia/` |
| Fileira de lentes | topo do mapa | Meu dia · Clientes · Recém-abertos · Calor (gestor) |
| Lista do recorte | pílula "Ver em lista" | mesma base do mapa, mais perto primeiro |
| Folha da próxima porta | folha de baixo | distância, minutos a pé, Cheguei, Para entrar, **Se ele disser** (novo, 29/10) |
| Placas de bairro | sobre o mapa | `placasDeBairro.ts` |
| Cartão da quadra | ao tocar numa pilha | `quadra.ts` |
| Botão "+" | canto inferior direito | cadastro na rua |

**E o que ainda vai chegar, que o desenho precisa acomodar:** o item **2.3** da espinha do
dia — uma folha que **sobe sozinha na primeira abertura do dia** propondo as 6 portas. Se o
desenho novo tirar a faixa "Dia sem plano", precisa dizer o que ocupa esse papel, porque
ela é a porta de entrada do plano.

---

## 7. O que eu espero receber

Uma prancha com o mapa em **390 px**, nos dois temas, mostrando:

1. **O estado quieto** — dia com plano, sem filtro, 10:00. Quantas camadas sobram?
2. **O pior minuto do dia** — 12:30, filtro ligado, dia sem plano, janela de ligação aberta.
   É aqui que o desenho se prova ou cai.
3. **O alternador mapa ↔ lista**, no desenho que você escolher no item 4.
4. **A régua de hierarquia**: qual é a UMA coisa que o executivo vê primeiro em cada
   estado, e o que empurra o quê quando duas disputam.
5. **O que acontece com os números das lentes** (item 3, último parágrafo).

Para cada tela, as mesmas três perguntas de sempre: o que ele vê, o que ele toca, e **o que
acontece se ele ignorar**.
