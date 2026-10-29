# Respostas às 8 perguntas · O mapa limpo

Claude Code → Julyan · 29/10/2026 · tudo medido em `App.tsx`, `src/utils/linhaDoDia.ts`,
`src/screens/FileiraDeLentes.tsx` e `src/screens/FolhaDoMapa.tsx` do `main` de hoje.

**Resumo para quem tem 30 segundos:** cinco respostas confirmam o que a prancha supôs.
**Três mudam o desenho** e precisam da sua palavra — a 4 (o alternador perde o zoom), a 6
(o sino **não** cabe no selo de Hoje) e a 5 (a folha nova desfaz uma redução que foi feita
por medição). E há uma **discordância na 2**: a linha do dia tem **9** estados, não 14.

---

## 1 · A pilha de hoje

O bloco existe e está em `App.tsx`, logo acima de `escolherLente`:

```
══ O QUE SE EMPILHA ABAIXO DAS LENTES ══
Lentes › linha do dia › pílulas ("Limpar", "Ver em lista") › janela das ligações › área.
Calculado num lugar só, de propósito: enquanto cada peça escolhia o próprio `top`, as
pílulas (44+6) e a faixa das janelas de ligação (44+8) nasceram as duas quase no mesmo
pixel e se cobriam nas duas janelas do dia, 12:30–12:45 e 17:30–17:45.
```

As peças que ele posiciona, com as alturas reais:

| peça | altura | de onde vem |
|---|---|---|
| fileira de lentes | `ALTURA_FILEIRA_LENTES` = 44 | `FileiraDeLentes.tsx` |
| linha do dia | `ALTURA_LINHA_DO_DIA` = 48 (+8 de respiro) | `linhaDoDia.ts` |
| pílulas Limpar / Ver em lista | `ALTURA_PILULAS_DAS_LENTES` = 6 + 44 | `FileiraDeLentes.tsx` |
| janela das ligações | 72 | calculado no App |
| estado de carregamento por área | variável, `pointerEvents: none` | `styles.areaStatusWrap` |

O cálculo é uma soma só (`abaixoDasLentes = deslocDasPilulas + pílulas`) e é consumida em
dois lugares (as duas instâncias da folha). **Confirmado: sai inteiro.** Trocar por duas
constantes (fileira a 50, faixa a 106) é mais simples do que o que está lá, não mais.

## 2 · Os estados da linha do dia — **são 9, não 14**

`EstadoDaLinha` tem exatamente nove: `pendente`, `na_porta`, `escapando`, `sem_plano`,
`atras`, `acima`, `plano`, `no_ritmo`, `fim`. A prancha do pacote anterior listou 14 porque
cinco deles **ainda não existem**: `proposta`, `provisório`, `do gestor` (chegam com o item
2.3) e `fecho`, `aberto`, `ontem`, `fechado` (chegam com o 2.10).

A prioridade é a ordem em que a função testa, de cima para baixo. Classificando pelo seu
gabarito:

| estado | tom hoje | ação | verbo com prazo? | para onde |
|---|---|---|---|---|
| `pendente` | vermelho | desfecho | **sim** | faixa #1 |
| `na_porta` | neutro | desfecho | não | kicker da folha |
| `escapando` | **vermelho** | progresso | **discordo — ver abaixo** | ? |
| `sem_plano` | âmbar | montar | não (você já decidiu: é a folha) | folha sem plano |
| `atras` | âmbar | progresso | não | kicker da folha |
| `acima` | verde | progresso | não | kicker da folha |
| `plano` | neutro | progresso | não | kicker da folha |
| `no_ritmo` | neutro | progresso | não | kicker da folha |
| `fim` | neutro | progresso | não | kicker da folha |

**Onde eu discordo: `escapando`.** Ele é o único estado de ritmo que é vermelho hoje, e tem
prazo de verdade — *"N de 6 · faltam K e resta M min · as J mais perto cabem até as 18h"*. A
sua fila da faixa não o inclui, e o kicker da folha só tem exemplos em verde e âmbar. Então
uma das duas: **ou ele vira um kicker vermelho na folha** (e a folha passa a ter três tons),
**ou ele entra na fila da faixa** (e a fila passa a ter seis). Prefiro o kicker, porque
"escapando" é informação sobre o dia inteiro e não um verbo que se resolve num toque — mas
quem decide é você, e isso muda o desenho da folha.

**Nota sobre a faixa #2 ("não salvou / sem sinal"):** não é estado da linha do dia. Vive em
`filaOffline.ts` + `AvisoSemSinal.tsx`. Entra na faixa sem problema, mas é código novo de
ligação, não mudança de lugar.

**Das 5 vagas da fila, só 2 têm fonte hoje:** `pendente` e a janela das ligações. "Sem sinal"
existe noutro lugar; "ontem ficou aberto" e "fecha o dia" **não existem** — chegam com o
2.10. Até lá a faixa vai ter no máximo três ocupantes possíveis.

## 3 · As contagens das lentes

Nascem em `contagensDasLentes`, que varre `itensMapaNovo` — **os pinos carregados para a área
atual** — com a mesma regra do mapa (`visivelNaLente`). Logo: **sim, são contagem de
viewport**, e mudam conforme o mapa carrega e descarrega.

**Confirmado que dá para remover da pílula sem tocar na lista:** a Lista é montada por
`montarLista`/`linhasDaLista`, caminho separado, que não lê `contagensDasLentes`.

Um detalhe a seu favor: o contador de **Recém-abertos já é exceção** — `contagensDasLentes`
pula `novos` e `calor` de propósito, e o "2 de 5" vem do contador de meta da semana. Ou seja,
a meta com dono que você quer na folha da lente **já está separada** do número de viewport.

## 4 · Lista: a lente passa, o zoom **não** — isto muda o desenho

A Lista recebe lente e filtro pelo mesmo estado do mapa (`lente`, `filtros`), então **a
primeira metade da pergunta é sim**: as duas vistas mostram o mesmo recorte, sempre.

**A segunda metade é não.** Hoje o alternador (`vistaMapa`) **desmonta o mapa**: o JSX do mapa
só é renderizado quando `vistaMapa !== 'lista'`. E quando ele volta, monta com
`initialRegion={mapCenter}` — e `mapCenter` é **o GPS do executivo com delta fixo de 0,05**,
não a última região que ele arrastou. Resultado: ir à Lista e voltar **joga o mapa de volta
em cima dele, no zoom padrão**, perdendo para onde ele tinha navegado.

Hoje isso quase não incomoda porque "Ver em lista" é uma pílula fraca que pouca gente usa. Se
o alternador passar a ser fixo e óbvio — que é o objetivo — o executivo vai alternar o dia
inteiro, e **esse salto vira o novo defeito do mapa**.

Para cumprir "voltar ao Mapa preserva posição e zoom" é preciso uma destas duas, e eu
preciso saber qual antes de codar:

- **(a) Manter o mapa montado** e desenhar a Lista por cima dele (o mapa fica vivo, só
  escondido). É o que entrega exatamente o pedido. Custo: o mapa segue consumindo bateria e
  pedindo tiles enquanto ele lê a lista.
- **(b) Guardar a última região** e passá-la como `initialRegion` ao remontar. Mais barato,
  mas há um piscar na volta, porque o mapa reinicializa.

**Minha recomendação é (a)**, porque o pedido inteiro é sobre o mapa parecer sólido.

## 5 · A folha recolhida — a prancha desfaz uma redução feita por medição

Hoje há **três** estados, não dois:

- `pilulaMini` — a barra `0/6 ⌃` do seu print, ~40 px flutuando a 8 px do rodapé.
- `pilula` — 60 px, com nome, distância, progresso em tracinhos e **Cheguei**.
- folha cheia — `maxHeight: 88%`.

O comentário de quem fez a pílula explica por que ela existe:

```
a folha espiada de 88 px + rodapé de 90 px eram 178 px de faixa sólida (21% da tela)
```

A sua folha recolhida nova pede **114 px** encostados na barra de abas. Com a barra de 84 px,
isso dá **198 px** — **mais do que os 178 px que foram removidos por serem demais**. Pelo
conteúdo eu concordo com você (a de hoje não diz o ritmo, e kicker + próxima porta + Cheguei
é mais útil que a pílula muda); mas é uma volta atrás consciente, e quero que seja sua e não
minha.

**Depende da altura antiga:** os botões do mapa e o `paddingBottom` do mapa, ambos via
`baseInferior` e `aoMedir`/`alturaRodape` — a folha **já se mede sozinha** e avisa quem está
em volta. Então crescer não quebra nada: os botões sobem junto, como a sua seção 5 pede.

## 6 · O sino **não** cabe no selo de Hoje

O sino não conta tarefa. `useAvisos`: `selo = falhas.length + recadosNovos` — **falhas de
sincronização** (o que não subiu para o HubSpot) mais **recados do gestor**. O próprio arquivo
diz: *"O sino é para o que NÃO é tarefa — as tarefas já têm o selo na aba Tarefas"*.

O selo de Hoje é atrasados + sem próximo passo, que são **tarefas**. Juntar os dois faria o
número dizer "você tem 9 coisas" misturando "você deve 6 retornos" com "3 coisas não subiram
para o sistema" e "o gestor te mandou um recado". São três obrigações diferentes, e só a
primeira é do executivo.

**O que sobra, e precisa de casa:**
1. **falhas de sincronização** — isso é a sua faixa #2 ("não salvou / sem sinal"). Encaixa
   perfeitamente ali, e aí o sino some de verdade.
2. **recados do gestor** — não tem lugar no desenho novo. Sugestão: linha no topo da aba
   **Eu**, com ponto. Não é urgente da rua e não merece faixa.

## 7 · O avatar — quase tudo já está em Eu, **menos uma coisa**

O toque no avatar abre o menu do perfil, com: Meu desempenho · Gestão (o `/gestao`, só quem
tem permissão) · **Lente Calor** (gestor) · **Modo sol · mapa claro** · Minhas fotos ·
Planejar a semana · Playbook · Configurações · Sair.

Confirmado que a aba **Eu** cobre: Meu desempenho (é a própria aba), Planejar a semana,
Playbook, Configurações e Sair — os quatro últimos entraram na lista da 2.9. Gestão e Minhas
fotos entram como linhas, sem novidade. **Lente Calor** cabe na sua folha da lente (§2 já
prevê "Calor só para gestor"). 

**O que fica órfão: "Modo sol · mapa claro".** É um controle **do mapa** — serve para ler a
tela no sol da calçada ao meio-dia — e hoje mora no avatar. Se o avatar sai do mapa, ele vira
três toques (Eu › voltar › mapa) justamente na hora em que a pessoa está com sol na tela.
**Proponho pôr Modo sol na folha da lente**, junto com as etapas: é a folha que já fala sobre
"o que o mapa mostra". Precisa do seu ok porque não está na prancha.

## 8 · O cartão da quadra — **já é o que você quer**

Está em `App.tsx`: *"Resumo de quadra tocado: a folha mostra só os pinos dele até fechar"*
(`quadraAberta`). **Já toma o lugar da folha** e fechar devolve o conteúdo anterior. Nada a
mudar: é só garantir que, com a folha recolhida nova, fechar a quadra devolva **a próxima
porta com Cheguei**, e não a pílula antiga.

---

## O que eu preciso de você para começar

1. **`escapando`**: kicker vermelho na folha (minha preferência) ou sexta posição na faixa?
2. **Alternador**: mapa montado por trás da Lista (minha preferência, §4a) ou região guardada (§4b)?
3. **Folha de 198 px no total**: confirma a volta atrás dos 178 px?
4. **Recados do gestor**: linha no topo da aba Eu?
5. **Modo sol**: entra na folha da lente?

Com esses cinco respondidos eu começo pela fase 1 (limpar o topo) e te mostro 1a, 2a e 3a nos
dois temas a 390 px antes de seguir.
