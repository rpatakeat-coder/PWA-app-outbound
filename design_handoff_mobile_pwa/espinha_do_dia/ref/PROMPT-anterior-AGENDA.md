# Prompt para o Claude Code · App de campo › Agenda (celular)

19/10/2026 · Takeat Field Sales · tela: **app de campo › Agenda** (PWA, celular 375 e 390 px, claro e escuro).

**Objetivo:** organizar e simplificar a Agenda. Nada de fluxo novo. O executivo abre a aba e sabe aonde ir agora, o que conseguir lá, o que tem de fechar e como está o dia. Toda visita termina com próximo passo datado.

Referência visual: `prototipo/Agenda do App - Pranchas.dc.html`. Ela importa `prototipo/AgendaApp.dc.html` (a tela) e `prototipo/Aviso.dc.html` (o componente de aviso). Abra no navegador.

**A fidelidade é alta:** cores, textos, tamanhos e estados são finais. Use os tokens do app que já existem: `--surface`, `--surface-2`, `--surface-3`, `--border`, `--stroke-strong`, `--text`, `--text-muted`, `--text-subtle`, `--vermelho-acao`, `--vermelho-texto`, `--verde-acao`, `--ok-fundo`, `--ok-texto`, `--tint-amber`, `--tint-amber-text`, `--info-text`. Os valores de `TK.esc` / `TK.sol` no protótipo usam esses mesmos nomes, em camelCase.

Fonte Poppins. Nada de emoji. Cor de etapa é dado, não decoração.

**Pasta:**
- `prototipo/`: as pranchas, a tela e o aviso.
- `telas-alvo/`: um print por estado. Os prints servem para conferir; se a quebra de linha diferir, vale o protótipo aberto no navegador.
- `ref/PEDIDO-agenda.md`: o pedido original, com a lista do que confunde hoje.

---

## 0. Antes de escrever código, confirme e me mostre

1. **Onde está a Agenda hoje.** Mostre os arquivos da aba, do card herói, da linha de parada, de "Ficou sem desfecho", de "Fora do plano", de "Feito hoje" e dos botões Montar / Refazer / Reordenar / Percurso.
2. **Distância até a parada.** O app já lê a posição (`watchPosition`) fora do Cheguei? O Cheguei em destaque precisa saber quando a pessoa está a menos de 150 m da próxima parada. Responda **sim**, **não** ou **parcial**. Se for "não", proponha o mais perto possível sem gastar bateria, por exemplo ler a posição ao abrir a aba e a cada 60 s com a aba aberta.
3. **Cliente.** Qual campo diz que o negócio é cliente ou ganho (etapa do pipeline, `lifecyclestage` da empresa, outro)? Mostre a consulta. Os 24 lembretes "ficou sem desfecho" de clientes/ganhos medidos em 19/10 têm de sair da cobrança.
4. **Próximo passo da visita.** Onde o "Como foi" grava o próximo passo datado, e como a linha da parada feita lê esse valor.
5. **Organizar o dia.** Montar meu dia, Refazer meu dia e Reordenar chamam a mesma rotina? Mostre. Os três viram um botão só (item 2.6).
6. **Marcar o próximo passo.** Existe a folha do próximo passo, separada do cartão? Hoje "Fora do plano" abre o cartão.
7. **Tirar do plano.** Onde o plano do dia é gravado (o mesmo do Planejamento do Cockpit) e como remover uma parada dele, com motivo.

**Pare e me mostre as respostas antes de seguir.**

---

## 1. Congelado: não mexer

- Visita só se prova pelo **Cheguei** (GPS). O Cheguei abre o "Como foi". Nada na Agenda conclui visita de outro jeito.
- **O plano é um só:** o que está na Agenda é o que o gestor vê no Planejamento do Cockpit. O plano se monta no mapa (pino → "Marcar o próximo passo") ou no Planejamento.
- Ligação e WhatsApp se registram na aba **Tarefas** ("na fila ›" abre o cartão lá e volta para a Agenda depois do Salvar). A Agenda não registra ligação.
- Meta do dia: **6 visitas com Cheguei**. A promessa vai para a Daily do time.
- Reunião ou retorno de **lead** que passou sem desfecho continua visível, com Aconteceu / Remarcar / Não aconteceu.
- Segunda a sexta. "Esta semana" e "Semana que vem".
- Lista | Mapa do dia (só hoje).

---

## 2. O que construir

### 2.1 Ordem dos blocos (hoje)
1. Cabeçalho: "Agenda" + "segunda 19/10 · 13:20" + avatar.
2. Aviso de **Atenção** do aparelho (sem sinal, erro ao salvar), só quando acontece.
3. Esta semana | Semana que vem (44 px) e a faixa de 5 dias: `HOJE` / `19` / `6 paradas`. Dia vazio mostra "sem plano" em `--tint-amber-text`. O dia selecionado tem fundo invertido.
4. Lista | Mapa do dia (44 px), só hoje.
5. **Próxima parada** (2.2). Sem plano, no lugar dela vai o aviso de Atenção "Hoje ainda não tem paradas", com **Organizar o dia** como ação principal e **Abrir o mapa** ao lado.
6. **Para fechar** (2.4), quando houver.
7. **Como está o seu dia** (2.5).
8. Depois das 18h com paradas: o aviso de Atenção "Passou das 18h e N paradas ficaram" + "Pôr as N amanhã".
9. **Depois** (2.3): as paradas seguintes. No fim: Organizar o dia · Percurso no Maps.
10. **Ligar e WhatsApp de hoje** (2.7).
11. **Marcados no HubSpot, sem dia no plano** (2.8).
12. **Feito hoje** (2.9), sempre aberto.
13. **Sem endereço no mapa**.

**Outro dia da semana** usa a mesma tela, com estas mudanças:
- Sem próxima parada, placar, Lista | Mapa e Feito.
- Título "Terça, 20/10" + "Follow-up · 5 paradas · plano fechado com o gestor".
- A lista "Paradas · N" usa a mesma linha.
- Ficam Organizar o dia / Percurso e as ligações daquele dia.
- Rodapé: "É o mesmo plano que o seu gestor vê no Planejamento do Cockpit."

### 2.2 Próxima parada (o card herói)
De cima para baixo:
- **Rótulo** "PRÓXIMA PARADA · 2 DE 6" (11/700, `--vermelho-texto`). À direita, a hora: "10:40 · marcada" (700, `--text`) ou "por volta de 11:50" (500, `--text-subtle`).
- **Nome** 20/800, até 2 linhas.
- **Selos:**
  - QUENTE (`--vermelho-acao`, para lead quente);
  - etapa com bolinha na cor da etapa;
  - o que vai fazer (Visita, Demo, Follow-up, Cobrar, Relacionamento).
- **Endereço + distância.** Perto: "R. Pernambuco, 88 · você está a 80 m" em `--ok-texto`.
- **Preparo**, só aqui (fundo `--surface-3`, raio 12):
  - **régua da etapa:** "Negociação · 9 dias na etapa" / "régua de 7 dias";
  - **barra de 6 px:** verde até 70%, âmbar `#D97706` de 70% a 100%, `--vermelho-acao` depois;
  - frase da régua: "Passou 2 dias da régua. Saia com o próximo passo datado." ou "Faltam N dias para a régua.";
  - Último toque · Quem decide;
  - **"O que conseguir hoje"** (ícone de alvo, 14/700): o que a próxima etapa pede.
- **Ir · Cheguei**, sempre os dois, sempre nesta ordem, 52 px, 2 colunas iguais:
  - **longe:** Ir cheio `--vermelho-acao`, Cheguei contornado;
  - **a menos de 150 m:** Cheguei cheio, Ir contornado, e a borda do card fica 2 px `--vermelho-acao`;
  - o rótulo nunca muda com a hora.
- **Ligar · Cartão · Playbook**: 3 colunas iguais, 44 px, fundo `--surface-3`, sempre os mesmos.
- **Tirar do plano**: link pequeno centralizado embaixo (ícone ×, 12/600, `--text-subtle`), com área de toque de 44 px.
  - Abre uma folha com o motivo: Fechado / Sem tempo hoje / Passar para outro dia (escolhe o dia).
  - Ao confirmar, a parada sai do plano, que é o mesmo do Planejamento, e a seguinte sobe para a próxima parada.
  - Toast "Tirou do plano · Desfazer" por 5 s.

### 2.3 A linha de parada (igual em todos os dias)
- **Grid:** `48px 28px minmax(0,1fr) 44px`, gap 10, padding vertical 12, borda de cima `--border`.
- **Hora:** 13,5 px, números tabulares.
  - Marcada (no HubSpot ou com o gestor) em 700 `--text`.
  - Prevista pela rota em 500 `--text-subtle`.
  - Sem "~" e sem cadeado.
  - Legenda **uma vez** no topo da lista: "Hora em negrito: marcada. Em cinza: prevista pela rota."
- **Disco** de 28 px com o número da ordem.
  - Lead: na cor da etapa, número `#111418`.
  - Cliente: vazado, borda 2 px `--verde-acao`, número `--ok-texto`.
- **Texto:**
  - nome 14,5/700, até 2 linhas com reticências;
  - selos (QUENTE / CLIENTE / "tarefa do HubSpot");
  - "Follow-up · Visita · 1,4 km";
  - cadência: "último toque: WhatsApp há 6 dias · passou da régua de 5 dias", em `--vermelho-texto` se passou;
  - objetivo: "Consiga: conversa com quem decide".
- **Cliente:** "Relacionamento · 1,1 km" / "cliente desde mar/26 · usa o cardápio digital" / "Hoje: pedir indicação de 2 vizinhos". Sem régua, sem QUENTE, sem "Consiga".
- **Verbo:** um só, o botão **Ir** de 44 × 44 (ícone, abre o Maps).
- **Tocar no texto** abre embaixo, nas colunas 3 e 4:
  - "Na etapa: 6 de 5 dias · Visita" e "Quem decide";
  - dois botões: **Fazer esta agora** (vira a próxima parada) e **Abrir o cartão**.
  - O Cheguei **não** aparece na linha. Ele fica só na próxima parada.
- **Depois das 18h**, cada parada que falta ganha **Pôr amanhã** (44 px) embaixo do texto.
- **Ordem:** quentes antes, prospecção depois, cliente por último. Quem ordena é o Organizar o dia (servidor); o app não reordena sozinho.
- **Quente** = Conversa com Decisor, Demo/Proposta, Negociação, Ag. Pagamento. Confirme comigo se Ag. Pagamento entra.
- **Cores de etapa:** Prospecção `#94A3B8` · Visita `#60A5FA` · Conversa com Decisor `#A78BFA` · Demo/Proposta `#F59E0B` · Negociação `#F97316` · Ag. Pagamento `#10B981`.
- **Régua em dias:** Prospecção 5 · Visita 5 · Conversa com Decisor 4 · Demo/Proposta 3 · Negociação 7 · Ag. Pagamento 2.

### 2.4 Para fechar (aviso Agir agora)
- **Entra:**
  - reunião ou retorno de **lead** que passou sem desfecho;
  - visita com Cheguei sem Como foi.
- **Cada item** vem num cartão interno `--surface-2` com o nome (14,5/700) e a linha "Demo · sex 16/10, 15:00 · Demo/Proposta". Os botões ficam **embaixo** do texto, em colunas iguais:
  - reunião: **Aconteceu** (cheio) / Remarcar / Não aconteceu;
  - visita: **Registrar o Como foi**.
- **Rodapé:** "3 reuniões de antes de 12/10 ficam só no HubSpot. Reunião com cliente não entra aqui."
- **Cliente e ganho não entram.** A reunião passada de cliente abre o Como foi de relacionamento pelo cartão (pedir indicação, conferir o uso, upsell), sem Remarcar de venda.

### 2.5 Como está o seu dia (placar)
- **Promessa:** antes do meio-dia e sem resposta, a primeira linha do card é "Visitas hoje?" + 4 botões de 44 × 44 (4 / 6 / 8 / 10).
  - Respondeu: a linha some e o valor vai para a Daily.
  - Não mostra "prometeu N às HH:MM".
- **Número:** "N de 6" 24/800 + "visitas com Cheguei". Embaixo, 6 traços de 6 px: verdes até N, `--border` no resto.
- **Linhas com bolinha:**
  - "N saíram com próximo passo" (`--ok-texto`);
  - "N sem próximo passo" (`--vermelho-texto`);
  - "N falta o Como foi" (`--vermelho-texto`).
  - Com zero visitas: "Toda visita termina com o próximo passo datado."
- **Depois das 18h:** o rótulo vira "Seu dia · 18:20" e entra "1 demo marcada · qui 22/10". O card DIA FECHADO sai.

### 2.6 Organizar o dia
- **Um botão só**, que substitui Montar meu dia, Refazer meu dia e Reordenar:
  - plano vazio: monta o dia;
  - plano com paradas: reordena pelo caminho, quentes antes, sem tirar nem pôr parada.
- **Percurso no Maps** fica ao lado, como ação secundária (texto `--text-muted`, sem borda).

### 2.7 Ligar e WhatsApp de hoje
- **Janelas 12:30 e 17:30:** marcos na lista, como aviso de **Informação**: "12:30 · Hora das ligações" / "Até 12:45 · 2 na fila. Comece pelo Frango Chic."
  - Some quando a janela passa.
  - A faixa invertida no topo da Agenda sai.
- **Cada ligação ou WhatsApp:** grid `48px 28px minmax(0,1fr)`, com hora, disco `--surface-3` com o ícone, nome e "Ligar · última tentativa antes do Perdido".
  - **na fila ›** (44 px) fica embaixo do texto.
  - Abre o cartão na aba Tarefas, como no pacote Tarefas (P4).

### 2.8 Marcados no HubSpot, sem dia no plano
- Substitui "FORA DO PLANO", que era a caixa tracejada.
- **Texto de apoio:** "Têm tarefa no HubSpot, mas nenhuma parada combina. Marque o passo para entrar no plano."
- **Cada item** é um cartão com o nome e "Follow-up · venceu sex 16/10 · Visita, 8 dias na etapa".
- **Botão "Marcar o próximo passo"** abre **a folha do próximo passo**, não o cartão.
- **Compromisso que casa com parada** não aparece aqui: leva o selo "tarefa do HubSpot" na linha da parada. O texto verde "já estão nas paradas, sem repetir" sai.

### 2.9 Feito hoje (aberto)
- Grid `48px 28px minmax(0,1fr)`, com a hora real (700, `--text-muted`), disco `--ok-fundo` com check, nome e "Visita com Cheguei · GPS 12 m".
- **Linha do próximo passo:**
  - com passo: check + "Próximo passo: Demo qui 22/10, 10:00" (12,5/700, `--ok-texto`);
  - sem passo: ícone de alerta + "Sem próximo passo" (`--vermelho-texto`) e o botão cheio **Marcar o próximo passo** (44 px) embaixo do texto.
- **Sem sinal:** o selo "guardado no aparelho" em `--surface-3`.
- **"Registrar de novo" sai.**

### 2.10 Um sistema de aviso só (`Aviso.dc.html`)
- **Desenho fixo:**
  - raio 14, borda 1,5 px, padding 12/14/14;
  - ícone de 20 px numa coluna fixa à esquerda;
  - título 14/700, texto 12,5/500;
  - itens em cartão interno e botões embaixo, em colunas iguais;
  - botão principal cheio `--vermelho-acao`, os outros contornados `--stroke-strong`.
- **Os 3 níveis:**

| Nível | Fundo | Borda | Ícone / título | Ícone |
|---|---|---|---|---|
| Agir agora | `#3A1519` / `#FDE8EA` | `#5A1F27` / `#F1C4C7` | `--vermelho-texto` | círculo com ! |
| Atenção | `--tint-amber` | `#5C4410` / `#E9C46A` | `--tint-amber-text` | triângulo com ! |
| Informação | `--surface-3` | `--border` | `--info-text` / `--text` | círculo com i |

(escuro / claro). Se `agirFundo`, `agirBorda` e `ambBorda` não existirem no kit, crie os três tokens com esses valores. São os únicos novos.

**Inventário (os 11 formatos de hoje viram estes):**
- **Agir agora:**
  - ficou sem desfecho e falta o Como foi vão para o Para fechar;
  - quente sem próximo passo fica na linha do Feito hoje;
  - erro ao salvar: "Não salvou" + "Tentar de novo".
- **Atenção:** sem sinal (sem botão) · dia sem plano · passou das 18h com paradas.
- **Informação:** janelas de ligação.
- **Saem:**
  - o card da promessa vira linha no placar;
  - o texto "já estão nas paradas" vira selo;
  - o card DIA FECHADO vira placar;
  - a folha "Antes da rua" fica na aba Tarefas;
  - a tela de ativar avisos fica fora da Agenda.
- **Toast** (5 s, acima da barra de abas): Salvou, Desfazer, Pôs amanhã, Tirou do plano.

---

## 3. Textos antes → depois

| Antes | Depois |
|---|---|
| visitas provadas | visitas com Cheguei |
| Ir agora / Cheguei (pela hora) | Ir · Cheguei, sempre os dois |
| Cartão / Ir (pela hora) | Ligar · Cartão · Playbook, sempre |
| PRIMEIRA PARADA · 2 DO PLANO / AGORA · 2 DO PLANO | Próxima parada · 2 de 6 |
| ~12:20 | 12:20 em cinza (prevista) · em negrito (marcada) |
| cadeado | hora em negrito |
| a próxima etapa pede: … | O que conseguir hoje: … / Consiga: … |
| Ficou sem desfecho · N | Para fechar · N |
| N antigas, de antes de dd/mm · não entram na cobrança | N reuniões de antes de dd/mm ficam só no HubSpot |
| LIGAÇÕES DO DIA · NÃO É PARADA DE RUA | Ligar e WhatsApp de hoje |
| Hora das ligações · 15 min | 12:30 · Hora das ligações · até 12:45 |
| N compromissos do HubSpot e do app já estão nas paradas, sem repetir | (sai) selo "tarefa do HubSpot" |
| FORA DO PLANO | Marcados no HubSpot, sem dia no plano |
| Montar meu dia / Refazer meu dia / Reordenar | Organizar o dia |
| Percurso | Percurso no Maps |
| Relac. | Relacionamento |
| Quantas visitas você faz hoje? | Visitas hoje? |
| prometeu N às HH:MM / sem promessa hoje | (sai; vai para a Daily) |
| DIA FECHADO · N visitas provadas e N demos | Seu dia · 18:20 |
| X ficou para trás | N paradas ficaram |
| falta registrar como foi | falta o Como foi |
| Registrar de novo | (sai) |
| Sem lugar no mapa | Sem endereço no mapa |

---

## 4. Medidas e quebra (375 e 390 px)

- **Toque:** mínimo 44 px em tudo. Ir e Cheguei com 52 px. Promessa com 4 × 44 × 44.
- **Linha de parada:** `48 / 28 / minmax(0,1fr) / 44`. Texto livre a 375 px: 193 px; a 390: 208 px.
- **Nada de `white-space:nowrap`** em fileira com texto.
- **Rótulo e valor lado a lado** (cabeçalho do herói, régua, placar) usam `flex-wrap` com `min-width` no rótulo: se não couber, o valor desce.
- **Botões nunca dividem a fileira com o texto:**
  - entram numa fileira nova, em `repeat(N, minmax(0,1fr))`;
  - rótulo centralizado que quebra em 2 linhas antes de espremer;
  - "Não aconteceu" a 375 px cabe em 101 px.
- **Faixa de dias:** `repeat(5, minmax(0,1fr))`.
- **Teste obrigatório:** nome "Restaurante e Pizzaria Sabor da Montanha Capixaba" e hora prevista em todas as linhas, a 375 px, em iPhone real (Safari) e Android (Chrome).

---

## 5. Pronto quando

- [ ] Os 10 estados das pranchas batem com o app, claro e escuro, a 390 px, e o estado 8 também a 375 px.
- [ ] Nenhum botão muda de rótulo pela hora.
- [ ] O Cheguei aparece só na próxima parada e acende a menos de 150 m.
- [ ] Cliente e ganho não aparecem no Para fechar. A consulta exclui os 24 de 19/10.
- [ ] "Marcar o próximo passo" abre a folha do próximo passo em todos os lugares.
- [ ] "Tirar do plano" some com a parada da Agenda **e** do Planejamento do gestor, com motivo gravado e Desfazer de 5 s.
- [ ] Depois das 18h a lista continua.
- [ ] Os avisos usam só o `Aviso` nos 3 níveis.
- [ ] A 375 px nenhum texto vira coluna de uma letra e nenhuma hora quebra.
