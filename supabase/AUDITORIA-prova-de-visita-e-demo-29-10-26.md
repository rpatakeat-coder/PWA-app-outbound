# A foto não confirma o GPS, ela passa por cima dele — e a demo só conta uma vez por negócio

Auditoria de 29/10/26, pedida pelo Julyan a partir de dois relatos: executivo
registrando pino num lugar e indo para outro, e o André dizendo que teve demo
nesta semana e não contabilizou. São dois defeitos diferentes. Testei se tinham
a mesma raiz (pino ruim) e **não têm** — zero visitas declaradas estão em pino
de centróide.

---

## 1. A prova de visita tem uma porta aberta: a foto

A regra em `_visitas_com_prova` é bem desenhada e vale dizer o que ela acerta:
visita **declarada não conta** como prova; o raio é 200 m, ou 500 m quando o
pino é aproximado; e há até uma guarda contra "em série" (outro lead no mesmo
ponto em menos de 3 minutos e 50 m). Nada disso é frouxo.

O problema é a ordem dos fatores:

```sql
provada = (foto existe)
       or (gestor validou)
       or (não declarada and pino não movido and distancia <= limite and not em_serie)
```

A foto vem **primeiro**, com `or`. Ela não confirma o GPS — ela dispensa o GPS.
E a foto é casada com a visita só por janela de tempo (−30 min / +2 h) e por
cliente. **A coordenada da própria foto nunca é olhada**, embora
`fotos_visita.lat` e `fotos_visita.lng` existam e estejam preenchidas.

### Medido em outubro de 2026 (579 visitas)

    464  provadas por GPS dentro do raio
    113  provadas por FOTO
      1  validada pelo gestor
      1  declarada sem GPS e sem foto (única que não contou)

Das 113 provadas por foto:

     67  a foto foi tirada DENTRO do raio       — prova de verdade
     23  a foto não tem coordenada
     23  a foto foi tirada FORA do raio         — 9 delas acima de 1 km

As 23 de fora, por pessoa, com a pior distância:

    Kelly Travieso       11 casos   pior 4.904 m   média 1.120 m
    Bruno Martins         4 casos   pior 33.481 m  média 8.912 m
    André Gomes           3 casos   pior 2.939 m   média 1.656 m
    Sérgio Caetano        2 casos   pior 9.473 m   média 9.470 m
    Marco Filho           1 caso    pior   773 m
    Sandro Brito          1 caso    pior   291 m
    Renata Pessoa         1 caso    pior   279 m

Os três últimos (279 m, 291 m, 773 m) são da ordem de grandeza de deriva de
GPS, pino do outro lado da quadra, terreno grande. **Uma foto a 33 km não é
deriva.** Quem decide o que isso significa sobre cada pessoa é o Julyan; o dado
é este.

### O rótulo mente, e é por isso que ninguém viu

Das 47 visitas declaradas em outubro, **23 carregam uma coordenada de GPS
precisa** — precisão média de 9 metros no mês, nenhum caso de GPS ruim. E o
motivo que o sistema escreve para elas é **"declarada sem GPS, sem foto"**.

`declarada` não quer dizer "o aparelho não conseguiu localizar". Quer dizer "a
pessoa escolheu declarar". Nas 17 visitas acima de 400 m, o aparelho tinha
posição exata, a foto também tinha, e as duas apontavam para o mesmo lugar
errado. O sistema guardou as duas provas da contradição e escreveu "sem GPS".

### Isso mexe em dinheiro

Visita provada entra em `pontos_eventos` como `visita_provada`, que alimenta
`pontos_da_semana`, que é o bônus de R$ 250 por semana. Por isso **não mudei
nada**: apertar a regra hoje reclassifica visitas já pontuadas e mexe em
pagamento de gente. É decisão do Julyan.

### Conserto proposto (NÃO aplicado)

1. **A foto confirma, não dispensa.** Quando a foto tiver coordenada, exigir que
   ela esteja dentro do mesmo raio. Foto sem coordenada continua valendo como
   hoje — senão as 23 sem GPS viram injustiça retroativa.
2. **O rótulo para de mentir.** `"declarada sem GPS, sem foto"` só quando
   realmente não há coordenada. Havendo, escrever a distância:
   `"declarada a 33.481 m do pino, com GPS preciso"`.
3. **Uma tela para o gestor ver.** Hoje isso só aparece para quem roda SQL. O
   relato chegou ao Julyan por conversa, não pelo Cockpit.
4. **Valer daqui para frente ou retroagir** é escolha dele, e muda o bônus de
   outubro. Minha recomendação: ligar a regra nova a partir de novembro e usar
   a lista acima para conversa, não para estorno.

---

## 2. A demo do André: o negócio já tinha pontuado em 08/10

O que o André viu está certo. Nesta semana ele tem **um** `demo_realizada`
(Karolinas Restaurante, 29/10). Mas ele moveu **dois** negócios para
Demo/Proposta: Karolinas e **Paladare** — e o Paladare não gerou ponto.

Por quê: o Paladare **já tinha ganhado seu ponto de demo em 08/10**. Em 27/10 o
André o encontrou em **Reciclagem**, visitou (`falou_com_decisor`), fez a demo
de novo, e em 29/10 moveu de volta para Demo/Proposta. Nenhum ponto novo.

A regra é essa mesmo, e é absoluta: **154 pontos de demo, 154 negócios
distintos, zero repetidos.** Um negócio pontua demo uma vez na vida. Se esfria,
volta para Reciclagem e é retrabalhado meses depois, a segunda demo não existe
para o placar.

Tamanho: aconteceu **2 vezes na história**, 1 nesta semana — a do André. É raro,
mas quando acontece o executivo trabalha de graça e não tem como saber por quê.

### E tem um buraco atrás disso: a ficha de rua não sabe dizer "fiz demo"

`fichas_de_rua.como_foi` tem exatamente quatro valores, e nenhum é demo:

    falou_com_decisor        238
    decisor_ausente          220
    estabelecimento_fechado   31
    sem_interesse              5

Em outubro foram 494 fichas de rua e só **7** levaram alguém para
Demo/Proposta. Contra 154 pontos de demo no mesmo período. Ou seja: a demo
quase nunca é registrada pela ficha — a ficha é o que o executivo preenche logo
depois da visita, e ela não tem onde dizer que a demo aconteceu. O ponto só
nasce quando ele lembra de mover a etapa noutra tela, às vezes dias depois (o
André moveu o Paladare dois dias após a visita).

Das 14 fichas do André nesta semana, **13 estão com `etapa_depois` nulo**. No
time, 494 fichas e só 114 com etapa de destino.

### Conserto proposto (NÃO aplicado)

1. **"Fiz a demo" vira opção da ficha de rua** — é o único momento em que o
   executivo tem o fato na mão.
2. **A segunda demo conta**, desde que o negócio tenha passado por Reciclagem
   ou Perdido entre uma e outra. Retrabalhar lead frio é trabalho; a regra atual
   diz que não é.
3. Se a decisão for manter uma demo por negócio para sempre, então o app
   precisa **dizer isso na hora**: "este negócio já pontuou demo em 08/10".
   Trabalhar sem saber que não conta é pior que não contar.
