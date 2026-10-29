# Prompt para o Claude Code · O mapa limpo

29/10/2026 · Takeat Field Sales · tela: **app de rua (PWA), aba Mapa**, celular 390 px (e 375), claro e escuro. Vem **depois** de `PROMPT-CLAUDE-CODE-APP-DE-RUA.md` e não refaz nada dele.

## Objetivo

O mapa virou um painel com um mapa atrás: nove camadas no topo, cinco faixas possíveis em pilha, números que mudam a cada arraste. **O pedido é de hierarquia, não de corte.** Nada deixa de existir; tudo vai para um lugar fixo.

No fim, o mapa tem quatro camadas no estado quieto:

1. **Uma fileira de controles** (50 px do topo): chip da lente + Buscar, e o alternador **Mapa | Lista**. Altura fixa, nunca cresce.
2. **A faixa da vez** (106 px do topo, 48 px de altura): **só existe quando há um verbo com prazo.** Uma por vez.
3. **A folha**, que recolhida já mostra o placar e **a próxima porta com Cheguei**.
4. **Os botões do mapa** (localização e +), neutros, encostados na folha.

**O mapa em si não muda.** Pinos, tamanhos, letras, halo, rótulos, placas de bairro, cores de etapa e o Cheguei por GPS ficam exatamente como no pacote do Mapa do Executivo (`design_handoff_mapa_executivo/README.md` §1 e §5). Julyan foi explícito: **não troque os pinos, só tire a sujeira de cima do mapa.**

Regra-mãe: **obrigatório é avisar, não travar.** Nenhum estado impede abrir o mapa ou dar Cheguei.

---

## Pasta

- `prancha/Mapa limpo - Prancha.dc.html`: **a referência deste pacote.** Decisões (direção, lista, números), 0a (hoje, 13:23), 1a/1b (quieto, 10:00), 2a/2b (pior minuto, 12:30), 2c (folha da lente), 3a/3b (Lista), 3c (contra-prova da 4ª aba, **não construir**), a régua, a fila da faixa, para onde foi cada camada e quando duas disputam.
- `prancha/App de rua otimizado - Prancha.dc.html` e `prancha/Espinha do dia - Prancha.dc.html`: o pacote anterior. A folha e a linha do dia de lá continuam valendo; aqui só muda **onde** a linha do dia aparece.
- `ref/PEDIDO-mapa-limpo.md`: o pedido de Julyan, com as medições do print de 13:23.

Abra as pranchas no navegador com a pasta `prancha/` inteira. Cada celular tem um id (1a, 2c…). Use esses ids nas perguntas e nos commits.

**Fidelidade alta:** posições, alturas, textos e estados são finais. Nomes e números de restaurantes são ilustrativos.

### Tokens: nenhuma cor nova

A prancha foi desenhada nos dois temas com os valores dos tokens. No código, só tokens:

| prancha | token |
|---|---|
| fundo / folha, fileira, barra | `--surface` / `--surface-2` |
| cartão da faixa neutra, chip | `--surface-3` |
| linha / contorno de botão | `--border` / `--stroke-strong` |
| texto / secundário / terciário | `--text` / `--text-muted` / `--text-subtle` |
| selecionado (alternador, selo do filtro, chip ligado, botão Ligar) | invertido: fundo `--text`, texto `--surface` |
| Cheguei, anel da próxima porta, Montar o dia | `--vermelho-acao` |
| kicker verde "no ritmo" / âmbar "dia sem plano" | `--ok-texto` / `--tint-amber-text` |
| faixa âmbar | `--tint-amber` / `--tint-amber-text` |
| linha de carregamento | o mesmo token do ponto de GPS que o mapa já usa |

Poppins. Sem emoji. Toque mínimo de 44 px. HubSpot e Asaas não se tocam.

---

## 0. Antes de escrever código, confirme e me mostre

1. **A pilha de hoje.** Mostre o bloco `O QUE SE EMPILHA ABAIXO DAS LENTES` em `App.tsx` e liste cada peça que ele posiciona (lentes, linha do dia, pílulas Limpar e Ver em lista, janela das ligações, área). Esse cálculo de `top` **sai inteiro**: no fim só existem duas posições fixas (fileira a 50, faixa a 106).
2. **Os 14 estados da linha do dia.** Liste-os com a prioridade atual e diga, para cada um, se ele tem um **verbo com prazo** (vai para a faixa) ou é **contexto** (vai para o topo da folha). Use a tabela da seção 3 como gabarito e me mostre onde discordar.
3. **Contagens das lentes.** Onde nascem os números 234 / 20 (contagem da área visível)? Confirme que dá para removê-los da pílula sem afetar a lista.
4. **Lista.** A Lista do recorte hoje recebe a lente e o filtro do mapa por qual estado? O alternador vai trocar a vista sem desmontar o mapa (posição e zoom preservados ao voltar)?
5. **Folha recolhida.** Qual é a altura mínima de hoje (a barra `0/6 ⌃`)? A folha recolhida nova precisa de 114 px acima da barra de abas (1a). Mostre se algo depende da altura antiga (botões do mapa, padding do mapa).
6. **Sino.** O que o sino com 3 conta hoje? Confirme que cabe no selo da aba Hoje (atrasados + sem próximo passo) ou diga o que sobra.
7. **Avatar.** O que o toque no avatar J abre? Confirme que tudo isso já existe na aba Eu.
8. **Cartão da quadra.** Hoje ele é sobreposição ou folha? Ele passa a **tomar o lugar da folha** enquanto aberto.

Responda as 8, espere meu ok, e só então codifique.

---

## 1. A fileira de controles (top 50 px, left/right 12, gap 8)

**Campo** (flex 1, 48 px, raio 24, `--surface-2`, borda `--border`, sombra leve):
- **Chip da lente** à esquerda, separado por linha `--border`: ponto de 10 px na cor da lente (`--lente-*` que já existem), nome 14/600, ▾. Toque abre a **folha da lente** (2c).
- **Com filtro ligado:** selo de 22 px invertido com o número de filtros ("2"), entre o nome e o ▾. É o único aviso de filtro, e ele não some nunca enquanto houver filtro.
- **Buscar** à direita: lupa 16 + "Buscar" 14/500 `--text-muted`. Comportamento da busca igual ao de hoje.
- **Sem contagem nenhuma** no chip.

**Alternador Mapa | Lista** (128 × 48, raio 24, `--surface-2`, borda `--border`, padding 3):
- Dois segmentos iguais, 13,5/600. Selecionado = invertido.
- **Mesmo pixel nas duas vistas.** Não some, não muda de tamanho, não divide espaço com mais nada.

**Sai do topo:** sino (vai para o selo de Hoje), avatar (vai para a aba Eu), a fileira de lentes, o botão de filtro, a pílula "Ver em lista", a pílula "Limpar".

**Carregamento por área:** linha de 3 px logo abaixo do campo (top 100), no lugar da faixa de estado de carregamento. Some ao terminar.

## 2. A folha da lente (2c)

Abre por cima do mapa com véu. Conteúdo, nesta ordem:
- Kicker "O QUE O MAPA MOSTRA" · à direita "o mesmo na Lista".
- Lentes como linhas de 52 px com rádio: **Meu dia** ("o plano e o que está perto"), **Clientes** ("a carteira ativa"), **Recém-abertos** ("meta da semana: 2 de 5"), e as demais que já existem. **Calor só para gestor.**
- "ETAPAS · N LIGADAS": chips de 40 px (Quente, Morno, Frio, Cliente…) com o ponto da cor. Ligado = invertido.
- Botões: **Limpar** (contorno) · **Ver no mapa** (invertido, não vermelho).

O contador da meta de Recém-abertos (antes na pílula) mora **aqui** e na folha. É meta com dono, não contagem de viewport.

## 3. A faixa da vez (top 106, left/right 12, 48 px, raio 14)

**Só nasce quando há um verbo com prazo.** Contexto calmo nunca usa a faixa.

Desenho: título 13,5/700 + linha 12/500 (uma linha cada, reticências) e, à direita, o verbo num botão de 36 px dentro da faixa (a faixa inteira é o alvo de toque, 48 px).

**Fila, uma por vez, nesta ordem:**

| # | estado | tom | quando some |
|---|---|---|---|
| 1 | Visita sem próximo passo | vermelho de alerta (o mesmo token da pergunta 0.9 do pacote anterior) | ao dar o desfecho |
| 2 | Não salvou / sem sinal | `--tint-amber` | ao enviar |
| 3 | Hora das ligações | neutro: `--surface-3`, borda `--stroke-strong`, botão Ligar invertido | sozinha às 12:45 e 17:45 |
| 4 | Ontem ficou aberto | `--tint-amber` | no primeiro Cheguei do dia, ou ao fechar |
| 5 | Fecha o dia | `--tint-amber` | ao fechar |

- **Duas ao mesmo tempo:** ganha a de cima. A outra vira um "+1" de 28 px na ponta direita da faixa; tocar abre a fila numa folha curta.
- **Busca aberta** esconde a faixa; fechar a busca devolve a mesma.
- **Faixa vermelha × Cheguei:** enquanto a faixa 1 estiver na tela, o Cheguei da folha passa para **contorno** (`--stroke-strong`, texto `--text`). Continua funcionando. Nunca dois vermelhos cheios.
- **"Dia sem plano" não é faixa.** É a folha (2a/2b), que é a mesma folha que sobe sozinha na primeira abertura (item 2.3 da espinha).

## 4. A folha recolhida

Alça + kicker + conteúdo, 14 px de padding embaixo. Encosta na barra de abas.

**Com plano (1a/1b), 114 px:**
- Kicker "2 DE 6 PORTAS · NO RITMO" em `--ok-texto` · à direita "+R$ 250 na próxima venda" `--text-muted`. É o estado neutro da linha do dia, que **saiu do topo**. Os outros estados neutros (atrás do ritmo, plano feito no Cockpit, na porta) usam este mesmo kicker com o texto e o tom deles.
- Linha da próxima porta: disco de 36 px na cor da etapa com o número, nome 16,5/700, "450 m · 6 min · proposta pronta" 13/500, **Cheguei** 48 px `--vermelho-acao`.
- Puxar a folha abre a folha da próxima porta do pacote anterior (Para entrar, Se ele disser), sem mudança.

**Sem plano (2a/2b), 196 px:**
- Kicker "DIA SEM PLANO" em `--tint-amber-text` · "o gestor vê desde 9h00".
- "6 portas perto de você, já em ordem" 18/700 · "As 2 promessas vencidas vêm na frente · 3,1 km a pé".
- **Ver as 6** (contorno) · **Montar o dia** (`--vermelho-acao`). Usa a mesma função de proposta do pacote anterior. O filtro ligado **não** muda a proposta.

**Cartão da quadra:** toma o lugar da folha enquanto aberto. Fechar devolve a próxima porta.

## 5. Os botões do mapa

Localização (esquerda) e + (direita): 44 px, círculo `--surface-2`, borda `--border`, ícone `--text`. Ficam 58 px acima do topo da folha e sobem e descem com ela. **O + deixa de ser vermelho.** Mesma função de hoje.

## 6. A Lista (3a/3b)

- Mesma fileira de controles no topo, com **Lista** selecionado.
- A faixa da vez, se houver, aparece igual, no mesmo lugar.
- Cabeçalho 12,5/500 `--text-subtle`: "Meu dia · 38 neste recorte · contado às 10:00 · mais perto primeiro". **A contagem é calculada ao abrir a Lista e ao puxar para atualizar, nunca enquanto ele olha.**
- Grupos "NO PLANO · 2 de 6" e "FORA DO PLANO, PERTO · 32" (11,5/700, `white-space: nowrap`).
- Linha de 56 px: disco de 26 px na cor da etapa (número no plano, ✓ e 55% se feita), nome, linha 2, distância (`nowrap`), botão **Ir** (contorno) ou **Cheguei** (vermelho, só a próxima porta).
- Lente e filtro são **os mesmos** do mapa. Voltar ao Mapa preserva posição e zoom.

**3c não se constrói.** É a prova de que a Lista como 4ª aba precisaria de uma segunda lente ou mostraria um recorte velho. A barra continua **Mapa · Hoje · Eu**.

## 7. Barra de abas

Igual à do pacote anterior. O selo de Hoje continua com o número (atrasados + sem próximo passo + o que o sino contava), mas em **cor neutra invertida**, não vermelho. O vermelho fica só para o que é agir agora.

## 8. Números: a regra para o código

**Um número no mapa só muda por algo que ele fez.**
- Contagem de viewport: só na Lista, congelada com a hora.
- "N de 6 portas": no kicker da folha, muda no Cheguei.
- Meta com dono (Recém-abertos 2 de 5): na folha da lente.
- Nada mais com número no topo.

---

## Fases

1. **Limpar o topo:** fileira de controles, alternador, remoção do cálculo de `top`, linha de carregamento, sino e avatar para os novos lugares, folha da lente.
2. **Faixa e folha:** fila da faixa, estados neutros da linha do dia no kicker da folha, folha recolhida com a próxima porta, folha sem plano, botões do mapa neutros.
3. **Lista e números:** cabeçalho congelado, contagens fora das lentes, selo neutro de Hoje.

Ao fim de cada fase, me mostre 1a, 2a e 3a nos dois temas, a 390 px.

## Checklist de aceite

- [ ] 10:00, com plano e sem filtro: só fileira, folha, dois botões e abas. Nenhuma faixa.
- [ ] 12:30, com filtro, sem plano e na janela: fileira com selo "2", **uma** faixa (ligações), folha "Dia sem plano". Nada mais entre a busca e o primeiro pino.
- [ ] Arrastar o mapa não muda nenhum número na tela.
- [ ] Alternador no mesmo pixel em Mapa e em Lista; voltar ao mapa preserva posição e zoom.
- [ ] Faixa vermelha na tela → Cheguei em contorno, e funcionando.
- [ ] Pinos, rótulos, halo e placas de bairro idênticos a antes (comparar print antes/depois no mesmo lugar e zoom).
- [ ] Nenhum `top` calculado por peça; só as duas posições fixas.
- [ ] Nenhuma cor literal nova; claro e escuro só pelos tokens.
- [ ] Todos os toques com 44 px ou mais.
- [ ] Tudo o que existia continua alcançável: Limpar, Calor (gestor), janela das ligações, carregamento, cartão da quadra, sino, avatar.

## Como saber se funcionou · 2 semanas

- **Toques no alternador Mapa | Lista** por executivo por dia. Se não subir em relação ao "Ver em lista", reabrir a pergunta da 4ª aba.
- **Tempo do abrir o app ao primeiro Cheguei.** Deve cair.
- **Toques em "Montar o dia"** vindos da folha sem plano, contra os da faixa antiga.
- **Filtro esquecido:** sessões que terminam com filtro ligado. Deve ficar perto de zero.
