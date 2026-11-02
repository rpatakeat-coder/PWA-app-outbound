# Pedido ao Claude Design · o mapa na rua, rico e sem poluição

**De:** Julyan Ribeiro (Head comercial, Field Sales Takeat) · **Data:** 02/11/2026
**Onde:** app de rua (PWA), aba Mapa, **no zoom de rua**, no celular do executivo — iPhone (390 e 430 pt) e Android (360 e 412 px)
**Print:** `screenshots/19-mapa-na-rua-poluido-02-11.webp` — conta real, 13:53 de 02/11 (feriado), Vitória

> "É nessa parte que tenho receio de ficar muito poluído... queria ter um jeito disso ficar
> melhor, mas sem perder a riqueza de conteúdo. Gosto da lista ainda, sendo uma aba ou lente."

Continuação do `PEDIDO-o-mapa-limpo.md` (29/10). Aquele cuidou do que fica **em volta** do mapa
(busca, lentes, faixas, placas de bairro no zoom afastado) — já entrou no app em 02/11. Este cuida
do que fica **dentro** do mapa quando o executivo aproxima para andar: **os pinos, os nomes e as
etiquetas**.

---

## 0. O problema em uma frase

**No zoom de rua, todo pino quer falar ao mesmo tempo.** O mapa tem informação valiosa — quem é
cliente, quem é recém-aberto e há quantos dias, onde há dois restaurantes no mesmo ponto, qual é a
próxima porta — mas tudo aparece com o mesmo peso, e o olho não acha a próxima porta.

Não é pedido para tirar informação. É pedido de **hierarquia e revelação progressiva**: o que
importa agora aparece; o resto está a um toque.

---

## 1. O que está dentro do mapa, medido (print de 13:53)

| camada | o que mostra no print | regra de hoje (código) |
|---|---|---|
| pinos P2 por família | logo verde (cliente Takeat), roxo (mais avaliado), amarelo-limão (recém-aberto, losango), laranja/azul (lead por temperatura) | `pinoP2.ts` · 5 famílias, cor por temperatura |
| selos no pino | "↓" laranja (cliente em queda), "F" (frio/fora?), número "3", "90" no losango | selo por pino, sem limite por tela |
| **nomes** | "Make a Coffee -…", "Senhor Bacon", "BERLIMBISS LTDA +1", "CANTINA 1912 +1", "Chocolateri…", "Piu Re… 88 dias sem toque" | **até 8 nomes** no zoom de rua (`MAX_NOMES = 8`), prioridade plano › cobrar › recém ≤ 30 d › …, sem sobrepor |
| 2ª linha do nome | "aberto há 81 dias", "aberto há 80 dias", "aberto há 63 dias", "88 dias sem toque" | etiqueta de tempo embaixo do nome |
| **pilhas** | anéis tracejados com "2" (dois restaurantes no mesmo ponto), um deles com o halo da sugestão | pilha até 8 abre em leque; maior aproxima |
| halo | círculo tracejado grande em volta de "Senhor Bacon" / "BERLIMBISS" (a sugestão / próxima porta) | halo da porta sugerida |
| posição do executivo | bolinha azul, **embaixo** do nome "BERLIMBISS" e do halo | — |
| rótulos do Google | "Clínica SAMP", "Atacado São Paulo", "Churrascaria e Restaurante…", ruas | POIs do Google ligados |

**Medido no print:** 6 nomes + 4 segundas linhas + 2 anéis + 1 halo + ~25 pinos + ~12 selos + POIs
do Google, numa área de ~390 × 900 pt. Um nome ("aberto há 63 dias") fica **cortado por baixo da
faixa do dia**; "BERLIMBISS LTDA +1" cobre a **posição do próprio executivo**.

---

## 2. O que precisa ficar (a riqueza)

1. **A próxima porta** é sempre a coisa mais forte do mapa (é para lá que ele vai andar).
2. **Quem é quem** sem abrir: cliente Takeat, lead quente/morno/frio, recém-aberto, mais avaliado.
3. **O recém-aberto com a idade** (é o que manda visitar primeiro: "aberto há 12 dias" vale mais que "há 81").
4. **Dois no mesmo ponto** (a pilha) sem esconder nenhum.
5. **O que cobra** (passo vencido, "88 dias sem toque", em queda) — mas só onde ele pode agir.
6. **A lista** — o Julyan gosta dela. Decidir: **aba própria** ou **lente** ("Ver em lista") — proponha.

---

## 3. O que pedimos

1. **Hierarquia em 3 níveis no zoom de rua:**
   - **Nível 1, sempre:** a próxima porta (pino grande + nome) e a posição do executivo (nunca coberta).
   - **Nível 2, o que pede ação perto:** até **3** nomes (não 8), escolhidos por quem pede ação a até ~400 m (plano, cobrar, recém ≤ 30 d) — proponha o número e o critério.
   - **Nível 3, o resto:** pino só, sem nome e sem 2ª linha; o toque abre o cartão com tudo.
2. **A 2ª linha ("aberto há N dias", "N dias sem toque")** sai do mapa e vai para o cartão do pino — ou fica só no nível 1/2. Proponha.
3. **Selos:** no máximo um por pino e só os que pedem ação (ex.: em queda, passo vencido). O "90" dentro do losango do recém-aberto: manter ou trocar por faixa de idade (≤ 30 d · 31–60 · 61–90)?
4. **Pilhas:** um desenho que diga "2 aqui" sem anel tracejado grande sobre os vizinhos.
5. **Halo da sugestão:** menor, e nunca cobrindo a bolinha azul do executivo.
6. **POIs do Google** (hospital, mercado): desligar no zoom de rua, ou deixar só os de referência? Proponha.
7. **Lista:** aba ou lente — e o que ela mostra que o mapa não mostra (distância, idade, por que visitar, próximo passo).
8. **A transição de zoom:** afastado (placas de bairro, já feito) → bairro (pino inteiro, só a próxima com nome) → rua (os 3 níveis acima).

---

## 4. Regras

- **Nada some do produto:** o que sair do mapa aparece no cartão do pino ou na lista. Entregar a tabela "hoje no mapa → onde fica".
- **Mesmos dados e mesmas regras** do app e do Cockpit (temperatura, recém-aberto ≤ 90 dias de CNPJ, sem próximo passo, prova).
- **Celular primeiro:** 360 e 412 (Android), 390 e 430 (iPhone); fonte do sistema maior (até 130%) não pode quebrar; alvo de toque ≥ 44 pt; barra de gestos do Android e área segura do iPhone respeitadas.
- **Claro e escuro** (o print é o escuro), sol forte na rua.
- Zero emoji.

## 5. Estados a desenhar

1. Rua, 13h, plano com 6 portas, a próxima a 120 m (o print, arrumado).
2. Rua com 2 restaurantes no mesmo ponto (pilha) perto da próxima porta.
3. Rua num bairro de recém-abertos (5 losangos a até 300 m): como mostrar a idade sem poluir.
4. Rua sem plano (feriado ou "Dia sem plano"): o que vira nível 1.
5. O cartão do pino ao tocar (com tudo que saiu do mapa).
6. A lista (aba ou lente), com o mesmo recorte do mapa.
7. Transição afastado → bairro → rua (3 quadros).

## 6. O que espero receber

- Pranchas em 360, 390 e 430, claro e escuro, com os 7 estados.
- A regra de cada nível (quem entra, quantos, em que ordem) escrita, para virar código e teste.
- A tabela "hoje no mapa → onde fica".

## 7. Como medir (aceite)

- No print-teste (estado 1): **≤ 3 nomes** no mapa além da próxima porta; **nenhum** texto cortado por barra; a bolinha do executivo **nunca** coberta.
- Tempo para achar a próxima porta (teste de 5 segundos com 3 executivos): ela é a primeira coisa apontada.
- Uso da lista (aba/lente) medido em `eventos_do_mapa`.
