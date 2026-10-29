# Prompt para o Claude Code · A ordem da porta, e as lentes de volta

29/10/2026 · Takeat Field Sales · tela: **app de rua (PWA), aba Mapa + ficha de rua**, celular 390 px (e 375), claro e escuro. Vem **depois** de `PROMPT-CLAUDE-CODE-APP-DE-RUA.md` e `PROMPT-CLAUDE-CODE-MAPA-LIMPO.md` e não refaz nada deles.

## Objetivo

Duas coisas, nesta ordem:

1. **Primeiro a porta, depois o desfecho.** O Cheguei é o que não pode *falhar*; o desfecho ("E agora?") é o que não pode ser *esquecido*. A ficha de rua continua abrindo na chegada, como hoje, mas **salvar deixa de exigir o "E agora?"**. O que ficou em branco volta **na saída**, numa linha, pela faixa pendente que o mapa limpo já criou.
2. **As lentes voltam, embaixo.** Uma fileira pequena de pílulas entre o botão de localização e o +, encostada na folha. O topo do mapa limpo (posições 50 e 106) **não muda**.

Regra-mãe, igual aos pacotes anteriores: **obrigatório é avisar, não travar.** Nada impede o Cheguei.

**Os pinos não mudam.** Tamanhos, letras (Q/M/F 26/24/22), anel da próxima, rótulos e cores ficam como no pacote do Mapa do Executivo.

---

## Pasta

- `prancha/Ordem da porta - Prancha.dc.html`: **a referência deste pacote.** Decisões, 1a–1c (chegada), 2a–2c (saída), 3a–3b (esqueci), 4a–4d (lentes), tabela "se ele ignorar", o que muda no código, medidas da fileira e como medir.
- `prints-ordem-da-porta/*.png`: um print de cada celular, com legenda (Vê · Toca · Se ignorar). Nomes = ids da prancha.
- `prancha/Mapa limpo - Prancha.dc.html`: o pacote anterior. A fileira de controles, a faixa da vez, a fila da faixa e a folha continuam valendo, **com as duas exceções da seção 4 e 5 deste prompt**.
- `prancha/App de rua otimizado - Prancha.dc.html`: a ficha de rua, o ciclo da porta e o Fecha o dia.

Abra as pranchas no navegador com a pasta `prancha/` inteira. Use os ids (1a, 2c…) nas perguntas e nos commits.

**Fidelidade alta:** posições, alturas, textos e estados são finais. Nomes, horários e números de restaurantes são ilustrativos.

### Tokens: nenhuma cor nova

| prancha | token |
|---|---|
| folha, fileira, botões do mapa | `--surface-2` |
| opção da ficha, pílula inativa | `--surface-2` / `--surface-3`, borda `--border` |
| lente ativa, selo do filtro | invertido: fundo `--text`, texto `--surface` |
| Cheguei, Salvar, Montar o dia | `--vermelho-acao` (**único vermelho cheio da tela**) |
| faixa pendente: fundo / texto | o tom de alerta claro da pergunta 0.9 do mapa limpo (`--tint-red` / `--tint-red-text` ou equivalente) |
| faixa pendente: borda e botão Dar | contorno `--vermelho-acao`, sem preenchimento |
| prova "GPS confere" | `--tint-green` / `--ok-texto` |
| ponto da lente | `--lente-*` que já existem |

Se o token de alerta claro não existir, **pergunte antes de criar** (item 0.6).

Poppins. Sem emoji. Toque mínimo de 44 px. HubSpot e Asaas não se tocam.

---

## 0. Antes de escrever código, confirme e me mostre

1. **Validação da ficha.** Em `FichaDeRua.tsx`, mostre a regra que desabilita o botão enquanto Como foi e E agora não estão respondidos ("Falta como foi e o próximo passo"). Ela vai mudar: salvar fica ativo sempre.
2. **Ordem de gravação.** Confirme que o Cheguei grava o check-in (ponto + GPS + hora) **antes** de a ficha abrir, e que fechar no × não desfaz nada. Se hoje o check-in só grava no Salvar, diga, porque isso muda o pacote inteiro.
3. **Visita sem desfecho.** Como fica no banco uma visita com check-in e sem próximo passo? Já existe o estado "sem próximo passo" (usado no Fecha o dia e no número do gestor)? Mostre o campo.
4. **Detecção de saída.** Onde mora a detecção do item 2.6 (150 m da porta, 10 min parado em outro lugar, ou Cheguei na próxima)? Ela já dispara algum evento que a faixa possa ouvir?
5. **Faixa pendente.** Mostre onde a faixa da vez decide a fila (mapa limpo §2) e onde nasce hoje a faixa pendente. Diga quando ela nasce hoje (no × da ficha? no Salvar?).
6. **Tom de alerta claro.** Existe token para fundo e texto de alerta claro (usado na pergunta 0.9)? Se não, proponha nomes e valores nos dois temas e espere meu ok.
7. **Regra do Cheguei em contorno.** Mostre o trecho que troca o Cheguei para contorno quando a faixa é vermelha. Ele sai.
8. **Lentes hoje.** Onde está `FileiraDeLentes.tsx` (ou o chip da lente do mapa limpo) e o que a `FolhaLentes` recebe. Confirme que a lente ativa vem de um estado só, que a fileira e a folha vão compartilhar.
9. **Gestos.** O mapa usa qual lib de gesto? Confirme que dá para um arrasto horizontal na fileira **não** mover o mapa e um vertical passar para a folha.

Responda as 9, espere meu ok, e só então codifique.

---

## 1. A chegada (1a, 1b, 1c)

Ver `prints-ordem-da-porta/1a-cheguei-escuro.png`, `1b-cheguei-claro.png`, `1c-visita-aberta.png`.

- O Cheguei grava o check-in como hoje e **a ficha abre logo depois, igual**. Nada muda na ordem nem na aparência, exceto:
- **Botão:** `Salvar o que sei`, sempre ativo, `--vermelho-acao`.
- **Legenda sob o botão:** `A visita já contou às HH:MM. O que ficar em branco volta quando você sair.`
- **E agora recolhido:** linha tracejada `2 · E AGORA?` + `depende do como foi · se ainda não sabe, fica para a saída`.
- Pílula de prova no topo: `GPS confere · check-in feito às HH:MM` (já existe).
- **× fecha sem perguntar.** O check-in fica; os campos em branco ficam em branco.
- **1c, visita aberta:** a folha volta com o kicker `NA PORTA · <NOME>` em verde, à direita `desde HH:MM · N de 6`, e a próxima porta com o Cheguei vermelho cheio, no mesmo pixel de sempre. **Nenhuma faixa** enquanto ele está na porta.

## 2. A saída (2a, 2b, 2c)

Ver `2a-saiu-escuro.png`, `2b-saiu-claro.png`, `2c-tocou-dar.png`.

- Dispara com a detecção do item 2.6. **Só se o E agora está em branco.** Se ele já deu o E agora na porta, não aparece nada.
- A faixa da vez (top 106, 48 px, raio 14) vira a **faixa pendente**:
  - linha 1: `<Nome> · e agora?` 13,5/700
  - linha 2: `ficou N min na porta · apresentou? marcou?` 12/500 (N = Cheguei até a saída)
  - botão `Dar`, 36 px, contorno `--vermelho-acao`, sem preenchimento
  - fundo e texto no tom de alerta claro, borda 1 px `--vermelho-acao`
- A folha embaixo **não muda**: placar e a próxima porta com Cheguei cheio.
- Selo da aba Hoje soma +1.
- **Dar (2c)** abre a mesma ficha, com o que já foi respondido recolhido numa linha (`1 · COMO FOI · Falei com quem decide · trocar`, como o A1 do App Menos Tela) e o E agora aberto. Ordem: `Apresentei agora` (vai a Demo/Proposta) e `Reunião hoje, mais tarde` grandes; depois Reunião amanhã, em 3 dias, em 1 semana, Voltar outro dia, Ligar amanhã, Sem interesse. Botão `Salvar visita`. `Apresentei agora` segue para plano e MRR como hoje.
- × devolve 2a, com a faixa igual.

## 3. O esqueci (3a, 3b)

Ver `3a-esqueci-escuro.png`, `3b-esqueci-claro.png`.

- Duas ou mais pendentes: **uma faixa**, a mais antiga, linha 2 `desde HH:MM · mais N sem próximo passo`, e um `+N` (28 px, contorno) antes do Dar. `+N` abre a fila numa folha curta (já previsto no mapa limpo).
- A faixa **não muda de tom com o tempo, não pisca, não abre a ficha sozinha**, não entra na ficha da próxima porta e nunca tira o Cheguei do lugar.
- Na fila da faixa (mapa limpo §2), pendente continua fila 1. Se cair hora das ligações, a ligação vira o `+1`.

### Se ele ignorar (gabarito; testar cada linha)

| quando | o que acontece |
|---|---|
| Fecha a ficha no × ao chegar | Nada se perde. Como foi e E agora em branco voltam juntos na saída. |
| Sai sem dar o E agora | Nasce a faixa pendente (2a). |
| Dá Cheguei na próxima com pendente | Check-in grava, ficha nova abre normal. A pendente fica na faixa; não pede antes. |
| Duas ou mais pendentes | Uma faixa, a mais antiga, com `+N`. |
| O dia passa | A faixa não muda. O selo de Hoje conta. |
| 18h00 | Fecha o dia lista as pendentes em SEM PRÓXIMO PASSO, cada uma com Dar (item 2.10, já existe). |
| 23h59 | Entram no número "sem próximo passo" do gestor. Dia seguinte: "Ontem ficou aberto" até o primeiro Cheguei. |
| Nunca | Trava o Cheguei, troca a folha, abre a ficha sozinha ou some com a próxima porta. |

## 4. Uma regra do mapa limpo se inverte

- **Sai:** "faixa vermelha põe o Cheguei em contorno".
- **Entra:** o Cheguei é **sempre** vermelho cheio. Quem desce de tom é a faixa (tinta clara + contorno). A regra "um vermelho cheio por tela" continua; o dono é sempre o Cheguei (ou o Salvar, dentro da ficha, ou Montar o dia, no dia sem plano).

## 5. As lentes, embaixo (4a–4d)

Ver `4a-lentes-quieto-escuro.png`, `4b-…claro.png`, `4c-lentes-pior-minuto-escuro.png`, `4d-…claro.png`.

**Topo (exceção ao mapa limpo §1):** o chip da lente **sai do campo**. No lugar entra um **botão de filtro** de 52 × 48 à esquerda do campo, separado por linha `--border`: funil 18 px + selo invertido de 22 px com o número de etapas ligadas (só aparece com filtro). Toque abre a `FolhaLentes` (lentes, etapas, Limpar, Modo sol), **sem mudança nela**. O resto do topo (Buscar, Mapa | Lista, faixa a 106) fica igual.

**A fileira:**

| | |
|---|---|
| Onde | left 64, right 64 (entre os botões de 44, com 8 de vão), top = topo da folha − 58, na mesma linha dos botões. Sobe e desce com a folha. |
| Altura | fileira 44 · pílula 32, raio 16, 13/600, ponto de 8 px, padding 0 12, vão 6 |
| Alvo | os 44 px inteiros da fileira, e encosta no da vizinha (3 px de cada lado). Sem ponto morto. |
| Arraste | só lateral, com inércia. Horizontal não move o mapa; vertical passa para a folha. Borda direita esmaece nos últimos 18% (máscara). |
| Ordem | fixa, a de hoje. Ao abrir o app, a ativa encosta à esquerda. Calor, só para gestor, no fim. |
| Ativa | invertida (fundo `--text`, texto `--surface`), ponto na cor da lente. Inativas: `--surface-2`, borda `--border`, ponto. |
| Número | **nenhum.** A regra do §8 do mapa limpo continua. |
| Some quando | a folha passa da metade (junto com os botões, como hoje), a busca abre, ou a ficha está aberta. Volta igual. |
| Desktop | não muda: lá a fileira antiga segue no topo. |

4c/4d é o pior minuto (filtro ligado, dia sem plano, hora das ligações, carregando): **o topo continua com duas posições e nada empilha.** Entre a busca e o primeiro pino, só a faixa.

---

## Fases

1. **Ficha + saída** (seções 1–3): validação, legenda, abrir no ponto que falta, faixa pendente nascendo na saída. Um PR.
2. **Tom** (seção 4): faixa pendente no alerta claro, remover o Cheguei em contorno. Um PR pequeno.
3. **Lentes** (seção 5): botão de filtro no topo, fileira embaixo, gestos. Um PR.

Depois de cada fase, me mande prints 390 px claro e escuro dos mesmos ids da prancha, lado a lado com `prints-ordem-da-porta/`.

## Checklist de aceite

- [ ] Ficha salva com E agora em branco; botão `Salvar o que sei`; legenda com a hora.
- [ ] × na ficha não desfaz o check-in.
- [ ] Nenhuma faixa enquanto ele está na porta (1c).
- [ ] Faixa pendente só nasce na saída e só se o E agora está em branco.
- [ ] Dar abre a mesma ficha, com o respondido recolhido e o E agora aberto (2c).
- [ ] `+N` com duas ou mais; a faixa nunca muda de tom, pisca ou abre sozinha.
- [ ] Cheguei vermelho cheio, no mesmo pixel, em **todos** os 12 estados da prancha.
- [ ] Fecha o dia, número do gestor e "Ontem ficou aberto" recebem as pendentes (já existem; só conferir).
- [ ] Topo: botão de filtro com selo no lugar do chip; posições 50 e 106 intactas.
- [ ] Fileira de lentes entre localização e +, sem número, alvo de 44, arraste lateral sem mover o mapa.
- [ ] Fileira some com a folha alta, a busca aberta e a ficha aberta.
- [ ] Desktop sem mudança. Pinos sem mudança. Nenhuma cor fora dos tokens.

## Como medir (2 semanas)

| métrica | leitura |
|---|---|
| Apresentei agora | fichas que levaram a Demo/Proposta contra pontos de demo. Hoje 7 de 314 fichas, com 154 demos no mês. Deve subir. |
| Onde o E agora é dado | na chegada, pela faixa, no Fecha o dia, ou nunca. Se "nunca" subir, a faixa não está sendo vista. |
| Cheguei por dia | não pode cair. |
| Toques nas lentes | por executivo por dia, fileira contra botão de filtro. Se a fileira não for usada, sai e o chip volta. |

Registre os quatro como eventos no que já existe de analytics do app; se não houver, me diga antes de criar.
