# Prompt para o Claude Code · App de campo › Tarefas por dia + tarefa na Agenda

20/10/2026 · Takeat Field Sales · telas: **app de campo › Tarefas** e **app de campo › Agenda** (PWA, celular 375 e 390 px e PC, claro e escuro).

**Objetivo:** três dores, um pacote.
1. Ver o que vem: a aba Tarefas mostra os outros dias.
2. Na Agenda, a ligação e o WhatsApp têm o peso de compromisso, entre as paradas.
3. Hoje lê em 3 blocos, com começo e fim.

Isto **melhora** as telas que já estão no ar. Nada de fluxo novo.

Referência visual: `prototipo/Tarefas por dia - Pranchas.dc.html`. Ela importa:
- `prototipo/TarefasDia.dc.html`: a aba Tarefas;
- `prototipo/AgendaApp.dc.html`: a Agenda, com as tarefas misturadas às paradas;
- `prototipo/Aviso.dc.html`: o componente de aviso, o mesmo do pacote Agenda.

Abra no navegador. Na `TarefasDia`, os dias da fileira são clicáveis.

**A fidelidade é alta:** cores, textos, tamanhos e estados são finais. Use os tokens do app que já existem, como no pacote Agenda: `--surface`, `--surface-2`, `--surface-3`, `--border`, `--stroke-strong`, `--text`, `--text-muted`, `--text-subtle`, `--vermelho-acao`, `--vermelho-texto`, `--verde-acao`, `--ok-fundo`, `--ok-texto`, `--tint-amber`, `--tint-amber-text`, `--info-text`. **Nenhuma cor nova.** No `TarefasDia`, os valores ficam em `TH.esc` / `TH.sol` com nomes curtos. Mapa:

| protótipo | token |
|---|---|
| `bg` | `--surface` |
| `painel` | `--surface-2` (cartão) |
| `card` / `chip` | `--surface-3` |
| `line` | `--border` |
| `line2` | `--stroke-strong` |
| `fg` / `mute` / `dim` | `--text` / `--text-muted` / `--text-subtle` |
| `acao` / `vtx` | `--vermelho-acao` / `--vermelho-texto` |
| `verde` / `okBg` / `okFg` | `--verde-acao` / `--ok-fundo` / `--ok-texto` |
| `avBg` / `avFg` | `--tint-amber` / `--tint-amber-text` |
| `gpsTx` | `--info-text` |

Fonte Poppins. Nada de emoji. Cor de etapa é dado, não decoração.

**Pasta:**
- `prototipo/`: as pranchas e as telas.
- `ref/PEDIDO-tarefas-por-dia.md`: o pedido original, com os números medidos.
- Depende do pacote `design_handoff_agenda_app/`, que já foi para o ar. Este pacote só altera a Agenda onde está escrito aqui (2.5).

---

## 0. Antes de escrever código, confirme e me mostre

1. **Onde está a aba Tarefas hoje.** Mostre os arquivos da aba, das 5 seções, dos 3 tipos de cartão (cheio, mini, falta o "como foi"), da faixa da hora das ligações e do placar.
2. **A fila de outros dias.** A Edge `fila-tarefas` devolve só hoje? Diga o que falta para ela devolver, **na mesma ordem e com a mesma regra**:
   - as tarefas por data de vencimento até sexta;
   - o resto agrupado por semana;
   - a contagem por dia, para a fileira.
   O app não ordena nem filtra; só agrupa o que o servidor manda. Responda **pronto**, **parâmetro novo** ou **Edge nova**.
3. **Adiantar.** Registrar hoje uma tarefa que vence amanhã: o "como foi" de hoje conclui a tarefa de amanhã no HubSpot? Mostre onde.
4. **Remarcar.** Já existe uma ação para mudar a data de uma tarefa, sem registro de contato? Se não existir, proponha. Ela escreve `hs_timestamp` da tarefa no HubSpot.
5. **Tarefa na Agenda.** Onde a Agenda lê "Ligar e WhatsApp de hoje" (2.7 do pacote Agenda). Essa lista vem da mesma fila da Tarefas? Precisa ser a mesma, para as duas telas contarem igual.
6. **Abrir da Agenda.** Como a Agenda abre o cartão na aba Tarefas hoje ("na fila ›"). Dá para abrir com o cartão em destaque e voltar para a Agenda no mesmo ponto da rolagem?
7. **Origem do registro.** O registro guarda de qual tela veio (Agenda ou Tarefas)? É preciso para o selo "pela Agenda" no Feito hoje. Se não guardar, proponha o campo.

**Pare e me mostre as respostas antes de seguir.**

---

## 1. Congelado: não mexer

- **A regra e a ordem da fila** vêm do servidor (Edge `fila-tarefas`): um cartão por negócio, valor × urgência.
- **Os 3 toques:** verbo (Ligar / WhatsApp / Pôr no plano) → como foi → Salvar.
- **Desfecho obrigatório:** próximo passo datado ou "Sem interesse" com motivo, que vai a Perdido. Não existe "Nada agora".
- **O Desfazer de 5 s** e a fila sem sinal: o registro espera a rede.
- **Concluir tarefa é toque no HubSpot.** Nada de "concluir todas" ou de ação em lote.
- **Visita só se prova pelo Cheguei** (GPS). A ligação não conclui tarefa de visita.
- **Sem próximo passo:** a seção continua, com "a meta é zero".
- **A Agenda do pacote anterior:** próxima parada, linha de parada, placar, os 3 níveis de aviso. A tarefa nova usa a mesma família.
- Janelas de ligação **12:30–12:45** e **17:30–17:45**.

---

## 2. O que construir

### 2.1 A fileira de dias (P1, aba Tarefas)
- **Posição:** logo abaixo do cabeçalho "Tarefas" + "segunda 19/10 · 10:20" + avatar, e do aviso de Atenção sem sinal, quando houver.
- **Grid:** `repeat(6, minmax(0,1fr))`, gap 5. Cada dia tem no mínimo 58 px de altura, raio 12, e três linhas:
  - `HOJE` / `AMANHÃ` / `QUA` / `QUI` / `SEX` / `DEPOIS` (10/700);
  - o **número** de tarefas daquele dia (16/800, tabular);
  - a data: `19/10` · `26/10+` (10/500, `--text-muted`).
- **Selecionado:** fundo invertido (`--text` como fundo, `--surface` como texto).
- **Ponto vermelho** de 7 px no canto de Hoje quando há atrasado.
- **Contagem zero:** o rodapé diz "zerado" (Hoje, em `--ok-texto`) ou "livre" (outro dia, em `--tint-amber-text`).
- **Hoje abre por padrão**, sempre, inclusive depois de voltar da Agenda.
- O número de Hoje conta o que **falta** (Atrasados + Para hoje + Sem próximo passo). O Feito hoje não entra.

### 2.2 Hoje em três blocos (P3)
De cima para baixo:

1. **Placar** (cartão, raio 16):
   - anel de 52 px, verde `--verde-acao` sobre `--border`, proporcional a feitas ÷ total;
   - "**N de M** feitas hoje" (21/800 + 13,5/600 `--text-muted`);
   - embaixo: "faltam N · de cima para baixo, termina no bloco 3".
   - Só atrasados: "5 atrasados esperando · comece pelo bloco 1", em `--vermelho-texto`.
   - **Sai do placar:** o contador de Sem próximo passo (virou o bloco 3), o chip de filtro e a barra "O que o seu gestor vê".
2. **Bloco 1 · Atrasados · N:** o mais antigo primeiro. A legenda diz "o mais antigo primeiro · o que foi combinado em cada um".
3. **Bloco 2 · Para hoje · N:** a legenda diz "ligações sem hora entram na hora das ligações · 12:30 e 17:30".
4. **Bloco 3 · Sem próximo passo · N:** título em `--vermelho-texto` quando N > 0. A legenda diz "a meta é zero".
5. **Linha de fim:** um fio de 1 px dos dois lados e o texto "FIM DA FILA DE HOJE" (11,5/600, caixa alta, `--text-subtle`). Quando não falta nada: "FILA DE HOJE ZERADA".
6. **Combinados com o gestor · N**, recolhido.
7. **Feito hoje · N**, recolhido.

**Cabeçalho de bloco:**
- disco de 28 px com o número 1, 2 ou 3 (fundo invertido);
- título 15/700 "Atrasados · 2";
- legenda 11,5/500 `--text-subtle` embaixo.

**Bloco vazio:**
- o número vira **✓** em disco `--ok-fundo` / `--ok-texto`, e o título fica "· 0";
- no lugar dos cartões, uma linha tracejada de 44 px com borda `--ok-texto` (opaca) e texto `--ok-texto`: "nenhum atrasado", "nada mais vence hoje", "zero · meta batida".

**Recolhidos:**
- linha de 52 px, cartão raio 14;
- título 14/700 e legenda: "Top Gourmet · até sex 23/10" / "cada um com o próximo passo que ficou";
- pílula com o número e a seta, que gira 90° quando abre.
- **Abre sozinho:**
  - Feito hoje, logo depois de um registro (2.6) e em sem sinal;
  - nos outros casos, recolhido.

**Hora das ligações:**
- **Fora da janela**, só a legenda do bloco 2.
- **Na janela** (12:30–12:45, 17:30–17:45), entra uma faixa invertida no topo do bloco 2, raio 14:
  - ponto vermelho + "Hora das ligações · até 12:45" + "faltam 7 min";
  - barra de 5 px com o tempo que passou.
- **No PC**, ela vira o card "Horas das ligações" na coluna da direita (2.8).
- A faixa solta entre seções **sai**.

**Hoje zerado** (nada em Atrasados, Para hoje e Sem próximo passo):
- O placar e os 3 blocos saem.
- Entra o painel `--ok-fundo` com borda `--ok-texto` 1,5 px, raio 20:
  - anel de 72 px com check;
  - "Hoje zerado" 24/800;
  - "9 de 9 · zerou às 16:50";
  - "Todo negócio de hoje saiu com o próximo passo datado ou com o motivo do Perdido.";
  - botão **Ver amanhã · 41 tarefas** (48 px), que seleciona Amanhã na fileira.
- Depois, "FILA DE HOJE ZERADA", e os dois recolhidos continuam.

**Sem sinal:**
- aviso de **Atenção** no topo, sem botão: "Sem sinal" / "Pode seguir. O registro fica guardado no aparelho e sobe sozinho para o HubSpot quando o sinal voltar.";
- a linha no Feito hoje ganha o selo "no aparelho" no lugar do check.

### 2.3 Um cartão de tarefa para tudo (P3)
Toda tarefa a fazer, em qualquer dia e em qualquer bloco, usa **o mesmo cartão**. Os cartões "mini" e "falta o como foi" **saem**.

**Desenho** (raio 16, padding 14, gap 10):
1. **Nome** 15,5/700, até 2 linhas com reticências. À direita, o selo **QUENTE** (`--vermelho-acao`, para etapa de venda) e/ou **da Agenda** (2.6).
2. **Etapa:** pílula `--surface-3` com a bolinha de 10 px na cor da etapa. Ao lado, o contato: "Rogério, o dono" (12,5/500 `--text-muted`).
3. **Quando:** ícone de 14 px + texto 12,5/700.
4. **Caixa** `--surface-3`, raio 10, com o rótulo em caixa alta (10,5/600 `--text-subtle`) e o texto (13,5/600).
5. **Nota** opcional (11,5/500 `--tint-amber-text`).
6. **Três botões** em `repeat(3, minmax(0,1fr))`, 44 px, raio 12, com ícone de 15 px. Um cheio (`--vermelho-acao`, texto branco); os outros `--surface-3` com borda `--stroke-strong`.

**Variações (só estas):**

| Onde | Borda | Quando (cor · texto) | Rótulo da caixa | Texto da caixa | Botões (cheio em **negrito**) |
|---|---|---|---|---|---|
| Atrasados | 1,5 px, borda de erro do Agir agora | `--vermelho-texto` · "venceu seg 13/10 · há 6 dias" | o que foi combinado | "Ligar: cobrar a data do pagamento" | **verbo** · outro verbo · Pôr no plano |
| Para hoje | `--border` | `--tint-amber-text` · "vence hoje · 12:35" ou "vence hoje · sem hora, entra às 12:30" | o que fazer | "WhatsApp: confirmar a reunião de qua 21/10" | **verbo** · outro verbo · Pôr no plano |
| Sem próximo passo | `--border` | `--vermelho-texto` (ícone de alerta) · "Sem próximo passo · última visita qui 15/10" | o que falta | "Um próximo passo datado, ou o Sem interesse com o motivo" | **Marcar o passo** · Ligar · WhatsApp |
| Outro dia (P1) | `--border` | `--text-muted` · "ter 20/10 · 09:00" | o que fazer | "Ligar: primeiro contato do evento" | **verbo** · outro verbo · Remarcar |
| Combinado com o gestor | `--border` | `--info-text` (ícone de pessoa) · "combinado no 1:1 de seg 19/10 · até sex 23/10" | combinado com o gestor | "Visitar: levar a proposta impressa" | Ligar · WhatsApp · **Pôr no plano** |
| Veio da Agenda (2.6) | 2 px `--vermelho-acao` + anel `0 0 0 3px` de 22–28% | igual ao bloco | igual | igual | igual |

- **Verbo cheio:** é o verbo da tarefa no HubSpot (Ligar ou WhatsApp). Os três botões ficam sempre nesta ordem: verbo combinado primeiro, o outro verbo, a terceira ação.
- **Combinado com o gestor** leva a nota "Visita só conclui com o Cheguei. A ligação não conclui esta tarefa."
- **Pôr no plano** usa a folha que já existe. **Marcar o passo** abre a folha do próximo passo, a mesma da Agenda.

**A linha de feito** é o outro desenho, só no Feito hoje:
- grid `44px minmax(0,1fr) auto`, mínimo de 52 px;
- hora real (13/700 `--text-muted`);
- nome 13,5/600;
- desfecho → próximo passo: "Ligou → Demo qui 22/10", 12/600 `--ok-texto`. Perdido em `--text-muted`: "Sem interesse → Perdido · fechou a loja";
- check `--ok-texto` à direita;
- selos opcionais em `--surface-3`: "pela Agenda", "agora" (o que acabou de entrar) e "no aparelho" (sem sinal, no lugar do check);
- o item que acabou de entrar tem fundo `--ok-fundo` por 5 s.

### 2.4 Outros dias (P1)
- **Amanhã, Qua e Qui:**
  - título "Terça, 20/10" (21/800) e "41 tarefas vencem amanhã, na ordem da fila.";
  - aviso de **Informação** "Dá para adiantar": "Ligar hoje resolve pelos mesmos 3 toques e a tarefa sai de terça." Quando o servidor marcar lote de evento, a primeira frase diz quantos e de onde: "38 são leads dos eventos de sábado, todas às 09:00.";
  - os cartões (2.3, variação Outro dia), na ordem do servidor;
  - mostra os 10 primeiros e depois o botão "Mostrar mais N" (44 px).
  - **Sem placar e sem blocos.** Atrasado é sempre de hoje.
- **Adiantar:** Ligar ou WhatsApp abre os 3 toques de sempre. Ao salvar:
  - a tarefa sai daquele dia (o número da fileira cai);
  - entra no Feito hoje de hoje.
- **Remarcar:** abre a folha de data (Amanhã, Qua, Qui, Sex, Outra data). Não registra contato e não conta como feito. Toast: "Remarcou · qua 21/10 · Desfazer".
- **Dia sem nada** (contagem 0, mostrado na sexta):
  - título "Sexta, 23/10" e "Dia livre de tarefas.";
  - caixa tracejada, borda `--stroke-strong`, com o ícone de calendário: "Nenhuma tarefa vence na sexta" / "Bom dia para limpar o funil: marque o passo de quem ficou sem, ou ponha visitas no plano.";
  - "Sem próximo passo · N" com os mesmos cartões. O botão cheio é **Passo p/ sexta**: abre a folha do próximo passo já com a sexta escolhida. O negócio volta para a fila e o dia ganha tarefa;
  - botão "Montar o plano de sexta na Agenda" (44 px), que abre a Agenda nessa sexta.
- **Depois** (além de sexta):
  - título "Depois de sexta" e "19 tarefas, agrupadas por semana. Abre a semana que vem primeiro.";
  - uma linha recolhida por semana: "Semana de 26/10 a 30/10 · 14" / "próxima: seg 26/10 · 3 quentes". A primeira abre por padrão;
  - o que passar de 3 semanas entra em "Mais adiante";
  - dentro da semana: cartões, os 10 primeiros, e "Mostrar mais N".

### 2.5 A tarefa na Agenda (P2)
Alteração do pacote Agenda. **A seção "Ligar e WhatsApp de hoje" (2.7 do pacote Agenda) sai.** As tarefas de hoje entram na lista do dia, junto com as paradas.

- **Ordem:** pela hora. Tarefa sem hora fica na hora da primeira janela de ligação que ainda não passou (hora em cinza `--text-subtle`; com hora, em negrito). Na mesma hora, o marco da janela vem primeiro, depois a parada, depois a tarefa.
- **Mesmo grid da linha de parada:** `48px 28px minmax(0,1fr) 44px`, gap 10, padding 12, borda de cima `--border`.
  - **Disco** vazado de 28 px, borda 2 px na **cor da etapa**, com o ícone de telefone ou de WhatsApp (13 px, `--text`) no lugar do número.
  - **Nome** 14,5/700.
  - **Selos:** QUENTE (se for etapa de venda) + **LIGAR** ou **WHATSAPP** (`--surface-3`).
  - **Linha 2:** "Helena, a dona · Conversa com Decisor".
  - **Linha 3**, `--text-muted`: o que foi combinado e onde. "combinado na visita de sex 16/10"; sem hora: "sem hora · combinado na reunião de sex 16/10".
  - **Linha 4:** "Ligar: marcar a data da demo".
  - **Botão** de 44 × 44 com o ícone do verbo, no lugar do Ir. Toque liga ou abre o WhatsApp direto e entra nos 3 toques.
  - **Sem endereço, sem distância, sem Cheguei e sem número de ordem.** A ordem das paradas continua 1, 2, 3… só nas visitas.
- **Toque no texto da tarefa** abre a aba Tarefas com o cartão dela em destaque (2.6).
- **Marco da hora das ligações**, dentro da lista: a hora na coluna 1, em `--info-text` 700, e nas colunas 2 a 4 a faixa `--surface-3`, raio 10, com "Hora das ligações" + "até 12:45 · 2 na fila". Some quando a janela passa.
- **Legenda da lista** muda para: "Hora em negrito: marcada. Em cinza: prevista. Disco vazado: ligar ou WhatsApp, na hora dele; sem hora, entra na hora das ligações."
- **Placar da Agenda:** entra a linha "Tarefas: N de M feitas · a mesma conta da aba Tarefas" (bolinha `--info-text`).
- **Outro dia da semana:** as tarefas daquele dia entram na lista do mesmo jeito.

### 2.6 O mesmo item nas duas telas (P4)
- **Agenda → Tarefas:** toque no texto da tarefa.
  - A aba Tarefas abre em Hoje, com o cartão em destaque (variação "Veio da Agenda") e a rolagem posicionada nele.
  - No topo, a barra **Voltar para a Agenda** (48 px, seta + texto `--vermelho-texto`, e "12:35 · Frango Chic" ao lado). Ela volta para a Agenda na mesma rolagem.
  - A barra some ao trocar de dia ou depois de Salvar. Depois de Salvar, a volta para a Agenda é automática, como no "na fila ›" de hoje.
- **Feito em qualquer tela:**
  - Toast invertido (5 s, acima da barra de abas): check verde + "Salvou · Vó Helena" / "Demo qui 22/10 · saiu da Agenda também" + **Desfazer · 5 s**. Na Agenda, a segunda linha diz "… · saiu da aba Tarefas".
  - O item sai da lista **nas duas** telas e vai para o Feito hoje, com o próximo passo.
  - **No Feito hoje da Agenda**, ganha o selo "tarefa concluída no HubSpot · saiu da aba Tarefas".
  - **No Feito hoje da Tarefas**, o que foi feito na Agenda leva "pela Agenda".
- **A conta é uma só:** o placar da Tarefas ("4 de 9 feitas hoje") e a linha de tarefas no placar da Agenda ("Tarefas: 4 de 9") leem o mesmo número do servidor.
- **Desfazer:** o item volta para o mesmo lugar, nas duas telas.

### 2.7 Selo na aba
- Na barra de abas (celular) e na lateral (PC), a aba Tarefas mostra a pílula "**2 atrasados**" em `--vermelho-acao` quando há atrasado.
- Sem atrasado, sem pílula.

### 2.8 PC
- **Lateral de 224 px:** logo, as 4 abas e o selo.
- **Coluna principal** com no máximo 720 px, e a mesma tela do celular.
- **Coluna direita**, 320 px:
  - **A semana:** os 6 dias, cada linha de 44 px, clicáveis, iguais à fileira;
  - **Horas das ligações:** as duas janelas com quantas tarefas de hoje caem em cada uma, e a frase "Tarefa com hora fica na hora dela; sem hora, entra na primeira janela. As mesmas aparecem na lista da Agenda."

---

## 3. Textos antes → depois

| Antes | Depois |
|---|---|
| (só hoje) | Hoje · Amanhã · Qua · Qui · Sex · Depois |
| Atrasados / Para hoje / Sem próximo passo (seções soltas) | 1 Atrasados · 2 Para hoje · 3 Sem próximo passo |
| (nada) | fim da fila de hoje / fila de hoje zerada |
| Combinados com o gestor (aberto) | Combinados com o gestor · N (recolhido) |
| Feito hoje (aberto) | Feito hoje · N (recolhido) |
| cartão cheio / mini / falta "como foi" | um cartão de tarefa |
| faixa "Hora das ligações" entre seções | legenda do bloco 2 · faixa na janela |
| contador de Sem próximo passo no placar | (sai; é o bloco 3) |
| (nada) | Hoje zerado · Ver amanhã |
| (nada) | Dá para adiantar |
| (nada) | Nenhuma tarefa vence na sexta |
| LIGAR E WHATSAPP DE HOJE (Agenda) | (sai; a tarefa entra na lista, na hora) |
| na fila › | toque na tarefa · botão com o ícone do verbo |
| (nada) | Voltar para a Agenda |
| (nada) | Tarefas: N de M feitas · a mesma conta da aba Tarefas |

---

## 4. Medidas e quebra

- **Toque:** mínimo 44 px em tudo. Os dias da fileira têm no mínimo 58 px de altura.
- **Fileira de dias:** `repeat(6, minmax(0,1fr))`. A 375 px, cada dia tem ~54 px de largura; "AMANHÃ" a 10/700 cabe. Não reduzir abaixo de 10 px.
- **Botões do cartão:** `repeat(3, minmax(0,1fr))`, rótulo centralizado; se não couber, quebra em 2 linhas antes de espremer ("Marcar o passo", "Passo p/ sexta").
- **Nada de `white-space:nowrap`** em fileira com texto. Exceção: o selo da aba na barra de baixo.
- **Linha da tarefa na Agenda:** o mesmo `48 / 28 / minmax(0,1fr) / 44` da parada. Texto livre a 375 px: 193 px.
- **Teste obrigatório:** o nome "Restaurante e Pizzaria Sabor da Montanha Capixaba" como tarefa atrasada (Tarefas) e como tarefa sem hora (Agenda), a 375 px, em iPhone real (Safari) e Android (Chrome).

---

## 5. Pronto quando

- [ ] As pranchas batem com o app, claro e escuro:
  - a 390 px: P3, os estados, P1, P2 e P4;
  - no PC: P3 e Amanhã.
- [ ] A fileira mostra o número de cada dia, vindo do servidor, e Hoje abre por padrão.
- [ ] As 38 tarefas dos eventos de 20/10 aparecem hoje em Amanhã, e adiantar uma tira ela de terça.
- [ ] Hoje tem os 3 blocos numerados e a linha "fim da fila de hoje". Combinados e Feito ficam recolhidos.
- [ ] Toda tarefa a fazer usa o mesmo cartão. Mini e "falta como foi" não existem mais.
- [ ] "Hoje zerado" aparece quando os 3 blocos chegam a zero, com "Ver amanhã".
- [ ] Na Agenda, ligação e WhatsApp estão na lista pela hora, com o grid da parada. A seção separada não existe mais.
- [ ] Toque na tarefa da Agenda abre o cartão em destaque na Tarefas, e "Voltar para a Agenda" volta para o mesmo ponto.
- [ ] Feito numa tela some da outra, e os dois placares mostram o mesmo N de M.
- [ ] Desfazer de 5 s nas duas telas. A fila sem sinal funciona nas duas.
- [ ] Nada de concluir em lote. Ligação não conclui tarefa de visita.
