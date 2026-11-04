# Handoff: App de rua · abas Hoje e Eu, enxutas

**Repo alvo:** PWA-app-outbound (`public/index.html`, barra Mapa · Hoje · Eu). O espelho no Cockpit é `julyanrib/cockpit-unificado` (GV2.HJ3 / DV2).
**Pedido:** Julyan, 03/11/2026. **Melhorar as telas que existem, sem mudar regra.** Tudo o que está em "Congelado" no pedido continua valendo: regras e números, gestos e o que eles gravam, fileira de dias, Mapa inteiro, Hoje v3 (folha da manhã, toasts, fecho das 18h) e "nada sai do produto".

## Sobre os arquivos
`App de Rua - Hoje e Eu.dc.html` é um **protótipo de referência em HTML** e não é código de produção.
- Abra no navegador com o `support.js` ao lado.
- **A tarefa:** recriar Hoje e Eu no app, com os componentes, tokens e dados que ele já tem.
- **O painel ao lado do celular é do protótipo:** estados, tema, largura, aba e orçamento medido. Não vai para produção.

**⚠ Cores e fontes:** o repo do app não estava acessível. O protótipo usa os tokens do Cockpit (claro = README do cockpit-unificado; escuro = a camada da Daily) e as fontes Poppins + DM Sans. **Troque tudo pelas variáveis do `:root` do app** (claro e escuro). A estrutura, os tamanhos, a hierarquia e o copy são o que vale. Sem emoji. Ícones são os do app.

## Fidelidade
**Alta** para estrutura, ordem, tamanhos, copy e comportamento. **Média** para cores, por causa da troca de tokens acima.

---

## Orçamento (aceite)
| | Antes | Depois (medido no protótipo, 390 px, recolhido) | Teto |
|---|---|---|---|
| Hoje, dia típico (com plano, 1 atrasado) | 2.285 px · 29 botões | **1.150 px · 42 botões** (6 dias + 3 abas + 1 por linha) | 1.150 |
| Hoje, fila zerada | — | 1.024 px · 30 botões | |
| Hoje, 3 atrasados (2 quentes) | — | 1.244 px | (passa do teto por ter 2 linhas a mais; aceitável) |
| Eu | 3.689 px | **1.151 px · 18 botões** | 1.600 |

**Hoje, acima da dobra:** a área útil é 844 − 47 (status) − 83 (barra de abas) = **714 px**. Nela cabem cabeçalho, contagem, dias, placar, plano (3 portas) e próxima ação. A linha tracejada "DOBRA 844" no protótipo marca o limite.

**Eu, acima da dobra:** faixa da variável, grade 2×2, linha da semana e atalhos.

**375 px:** nada quebra linha. Nomes longos cortam com reticências.

---

## Aba Hoje (de cima para baixo)
Padding lateral 16 · gap 8 entre blocos · cards com raio 16, borda 1px.

1. **Cabeçalho (~42):**
   - "Hoje" (24/800) + "ter 03/11 · 10:05" na mesma linha (12.5, ink3);
   - à direita: Playbook (pílula 34), sino (34, ponto vermelho se há aviso) e avatar (34, vermelho de ação, abre Eu).
2. **Contagem única (H2, 30):** 3 pílulas, "N atrasados · N ligar hoje · N sem passo".
   - Cada uma **rola até o seu grupo**.
   - "Atrasados" fica vermelho (fundo red-soft) quando há quente.
   - **O mesmo número aparece em 3 lugares:** o chip "Hoje" da fileira de dias e o selo da aba Hoje = atrasados + ligar hoje.
   - Sai "20 tarefas hoje" e sai o anel "0 de 20".
3. **Fileira de dias (congelada, 44):** Hoje (fundo ink) · Amanhã · Qui · Sex · Seg · Depois, com a contagem em cada um. Rola na horizontal.
4. **Placar do dia (~134):**
   - grid 1.4fr / 1fr;
   - esquerda: **PORTAS COM PROVA** "N de 6" (32/900; "de 6" 18/800 mute) e 6 segmentos de 6px (verde nos feitos);
   - direita: **DEMO** "N de 1" + "marcada · 11:30" / "feita ✓" / "nenhuma marcada";
   - embaixo: **3 selos pequenos**, "37 pts · 3º na semana" · "Na rua 4 dias" · "Missão 1 de 2". Altura 24, neutros (âmbar só para o líder). Tocar abre Eu. **Não usa vermelho de alarme** (H5).
5. **Plano (~208):**
   - título "PLANO · 5 FALTAM · 2 COM PROVA" + "ver as 7 ›" (mostra todas, incluindo as feitas com "prova ✓");
   - **3 próximas portas**, linhas de 44: hora (13/800), nome (14.5/800), "Tipo · quente" (âmbar) ou "· recém-aberto" (azul) e o botão **Ir** (36 de altura; a 1ª porta pendente em vermelho de ação, as outras neutras);
   - **Ir** abre o Mapa já na porta (próxima porta).
   - **Sem plano:** "Sem plano para hoje" + "O app sugere 6 portas perto de {bairro}, com {quente} primeiro." + botão **Montar o dia ›** (44, vermelho).
6. **Próxima ação · maior valor (~104):**
   - borda 1.5 vermelha;
   - kicker; nome (17/800) + "etapa · R$ · venceu ontem · quente";
   - à direita, **um verbo** (44 de altura, mínimo 88 de largura): Ligar / Ir / Montar o dia;
   - "combinado: …" numa linha;
   - tocar no nome abre a linha no grupo, com as outras ações.
   - **Regra da escolha:** 1º atrasado (quentes primeiro) → senão a 1ª de Ligar hoje → senão a próxima porta → senão "Montar o dia". Usa a mesma `ordemPorDinheiro`.
   - **O item escolhido não se repete no grupo:** o grupo mostra a linha "↑ {nome} está na próxima ação".
7. **Grupos, em ordem (H3):**
   - **ATRASADOS**, **LIGAR HOJE** (com "janela 12:30/17:30") e **SEM PRÓXIMO PASSO** (3 linhas + "ver os N ›" no cabeçalho).
   - **Cabeçalho do grupo:** título, número, "ver os N ›" e "?". O "?" abre a regra numa caixa (H4: as legendas saem da tela).
   - **Linha fechada (46+):** ponto âmbar se quente, nome, 1 sub-linha e **1 verbo** (Ligar · Dar o passo). O verbo é vermelho se quente, neutro nos outros casos.
   - **Tocar na linha abre** "O que foi combinado" + as outras ações (WhatsApp · Pôr no plano · Remarcar · Sem interesse).
   - **Qualquer ação** vira "✓ Desfazer 5s" na linha e um toast. Depois de 5 s, a linha sai e a contagem do topo cai junto.
   - **Vazio:** texto verde ("Nada atrasado." / "Fila zerada ✓ · sequência N dias").
8. **Recolhidos (42):** 3 botões lado a lado com número + rótulo (Antigos · Com o gestor · Feito hoje). Tocar abre a lista embaixo; só um fica aberto por vez.

## Aba Eu (de cima para baixo)
1. **Identidade:** avatar 40 + nome (20/800) + selos (Pleno ou "Rampa · dia 12 de 60" em red-soft; "Playbook nível N" em azul-soft).
2. **Faixa da variável (bloco escuro, o único da tela):**
   - "NOVEMBRO · FAIXA 1 DA VARIÁVEL" (kicker);
   - **R$ do mês** (36/900) + "N vendas · meta 8";
   - escada com 1 degrau por venda (feita cheia, próxima com contorno, futura apagada);
   - **o que falta** em vermelho-no-escuro: "Faltam 4 vendas para a faixa 2 · a próxima vale +R$ 250." ou "A próxima venda muda a faixa: +R$ 300 por venda."
3. **Grade 2×2 (E1):**
   - **HOJE** "2 de 6" (portas com prova · demo 0 de 1) → Hoje;
   - **SEMANA** "37 pts" (3º · disputa dos R$ 250) → folha da semana;
   - **MÊS** "R$ 250" (1 contrato de 8);
   - **PRÓXIMA VENDA** "+R$ 250" em verde (faixa N / muda a faixa).
4. **A semana numa linha (E2):**
   - **Linha:** "37 pts · 3º · faltam 9 para passar Gama" + a menor ação ("4 visitas com prova já passam" / "uma demo (25) já passa").
   - **Líder:** fundo âmbar-soft, "lidera por 56".
   - **Zerada:** "0 pts · semana zerada · a 1ª visita com prova vale 3".
   - **Tocar abre uma folha de baixo** com o pódio (3), "o próximo a passar", a regra (100 venda · 25 demo · 3 visita com prova) e "Ver o ranking completo" (a FolhaRanking de hoje).
5. **Atalhos (E4):** 3 tiles de 64, Planejar a semana · Playbook (nível · próximo capítulo) · Recém-abertos (N esta semana).
6. **1:1 em uma linha.**
7. **MEU JOGO (E3):** 6 cartões compactos de 56, nesta ordem (o que tem prazo primeiro):
   - Missão (prazo · título · bolinhas n de m);
   - Sequências (Na rua N · Fila zerada N · 5 bolinhas dos dias);
   - Habilidade (agora → meta);
   - Carreira;
   - Coleção (N de 13 · o mais perto);
   - Você contra você.
   - Tocar abre 1 a 3 linhas de detalhe (o que hoje são os blocos grandes).
8. **Mais:** fechado com o resumo; abre Gestão · O time na rua · Avisos · TakeatOS · HubSpot · Ajustes e sair.

## Estados (botões no protótipo; prints em `prints/`)
- **Com plano, no ritmo:** Kelly, 10:05, 2 portas com prova, demo marcada 11:30, 1 atrasado quente.
- **Sem plano antes das 9h:** 08:12, Plano vazio com "Montar o dia ›", próxima ação = 1º atrasado.
- **Atrasado com 2 quentes:** 3 atrasados, quentes primeiro, o 1º vira a próxima ação.
- **Fila zerada:** grupos vazios em verde, próxima ação = próxima porta ("Ir").
- **Em rampa:** Delta, meta 3, 1 faixa, carreira de rampa, missão de novato.
- **Líder da semana:** 286 pts, selo e linha em âmbar, "lidera por 56".
- **Semana zerada:** segunda 08:40, 0 pts, nenhuma porta feita.
- **Tema e largura:** claro/escuro · 390/375.

## Interações
- **Toast:** 2,4 s, acima da barra de abas.
- **Desfazer:** 5 s (contagem regressiva no botão da linha).
- **Folha da semana:** fecha no overlay.
- **Chips da contagem:** rolagem suave até o grupo (offsetTop − 8).
- **Ir:** troca para a aba Mapa com a porta em foco (no app: abrir o Mapa na porta, como a "próxima porta" de hoje).
- **Gestos e o que gravam:** iguais aos de hoje. Ligar · WhatsApp · Pôr no plano (tarefa no HubSpot antes da parada) · Marcar o passo · Remarcar · Sem interesse com motivo · Desfazer de 5 s.

## O que sai (e onde fica, a 1 toque)
| Sai | Vai para |
|---|---|
| "20 tarefas hoje" + anel "0 de 20" | contagem por grupo (cada chip abre o seu) |
| "1 · Para hoje · 0" | some quando vazio; o que vence hoje entra em Ligar hoje / Atrasados |
| Legendas de regra | "?" do grupo |
| Faixa vermelha da Missão | selos do placar + cartão Missão em Eu |
| 3 botões em todo cartão | 1 verbo; o resto ao tocar na linha |
| 5 sem passo por vez | 3 + "ver os N ›" |
| Pódio, regra e próximo a passar (Eu) | folha da semana |
| Blocos grandes de Missão, Sequências, Habilidade, Carreira, Coleção, Você × você | cartões de Meu jogo (abrem no toque) |
| Gestão, O time na rua, Avisos, TakeatOS, HubSpot, Ajustes | "Mais" (Avisos também no sino do Hoje) |

## De onde vem cada número (conferir)
| Número | Fonte | Situação |
|---|---|---|
| Portas com prova N de 6 | `diaDoExecutivo().contagem.comProva` (hojeV3.ts) · meta em `meta_visitas` | existe |
| Demo N de 1 | `pontos_eventos` demo_realizada de hoje + parada tipo Demo do plano | conferir o tipo da parada |
| Plano (portas, hora, tipo, prova) | `field_route_stops` de hoje × `visitas_com_prova` (a lista do plano do Hoje v3) | existe |
| Próxima ação | 1º de `ordemPorDinheiro` (atrasado → ligar) · senão `porta.proxima` | existe |
| Atrasados / Ligar hoje / Sem passo | `montarFila` (Edge fila-tarefas) + `semProximoPassoDaFila`; janelas em `cadencias.json` | existe |
| Selos e linha da semana | `desenvolvimento_quadro().semana` (pts, posição, próximo); missão e sequências do mesmo quadro | existe |
| Faixa N, R$ do mês, próxima venda | `GV2.variavel` / `comissionamento.json` (a escada de hoje) | existe |
| Recém-abertos da semana | lente Recém-abertos, contagem da semana | existe |
| Bônus R$ 250 | config (não texto fixo) | criar config |

## Arquivos
- `App de Rua - Hoje e Eu.dc.html`: o protótipo (regras em `renderVals` e `estadoDe`).
- `support.js`: runtime do protótipo (não vai para produção).
- `prints/`: os prints foram tirados com a página reduzida a 55%. Algumas quebras de linha (ex.: "Meu jogo", "1 venda · meta 8") são efeito da redução; **vale o protótipo a 100%**.
  - `01–17-claro`:
    - 01 Hoje ritmo · 02 Hoje ritmo rolado · 03 Eu ritmo · 04 Eu rolado;
    - 05 Hoje sem plano · 06 Eu sem plano;
    - 07 Hoje 2 quentes · 08 rolado nos grupos;
    - 09 Hoje fila zerada · 10 rolado;
    - 11 Hoje rampa · 12 Eu rampa · 13 Eu rampa rolado;
    - 14 Hoje líder · 15 Eu líder;
    - 16 Hoje semana zerada · 17 Eu semana zerada.
  - `01–10-escuro`: ritmo (Hoje, rolado, Eu, rolado) · sem plano · 2 quentes · fila zerada · Eu rampa · Eu líder · Hoje semana zerada.
  - `01–10-interacao`:
    - 01 linha aberta (combinado + ações) · 02 Desfazer 5s · 03 sem passo aberto;
    - 04 plano "ver as 7" · 05 recolhido "Feito hoje" aberto;
    - 06 folha da semana · 07 Missão aberta + Mais aberto;
    - 08 Hoje a 375 · 09 Eu a 375 · 10 Ir → Mapa.
- `referencia/`: as fixtures do Hoje v3 e do Desenvolvimento v2, de onde saíram o copy e os números de exemplo.
