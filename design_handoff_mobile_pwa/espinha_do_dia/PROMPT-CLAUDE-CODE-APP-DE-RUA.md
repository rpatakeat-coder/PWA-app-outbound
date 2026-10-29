# Prompt para o Claude Code · App de rua otimizado (a espinha do dia)

28/10/2026 · Takeat Field Sales · tela: **app de rua / app de campo** (PWA, celular 375 e 390 px e PC, claro e escuro) + **2 pontos no Cockpit do gestor**.

## Objetivo

Os executivos só usam o Mapa. Agenda, Tarefas, Playbook e Meu desempenho estão bons, mas ninguém abre. Então **o app para de pedir que eles saiam do Mapa**:

1. **Barra de baixo: 6 abas → 3** (Mapa · Hoje · Eu).
2. **Linha do dia:** 48 px abaixo das lentes do Mapa, sempre visível. Mostra o placar e muda de tom quando o dia escapa.
3. **A folha do Mapa muda com o momento:** abrir (plano) → indo → na porta → saí (próximo passo) → entre portas (ligação) → fechar (18h00).
4. **Toda visita tem próximo passo.** É pedido ao sair. Se ele não der, a cobrança sobe uma escada, **sem travar nada**.
5. **O gestor vê** quem não planejou (e monta o dia dele no Cockpit), quem não fechou o dia e quantas visitas ficaram sem próximo passo.

Regra-mãe, fixada por Julyan: **obrigatório é avisar, não travar.** Nenhum estado impede abrir o Mapa ou dar Cheguei.

---

## Pasta

- `prancha/App de rua otimizado - Prancha.dc.html`: **a referência principal.** Arquitetura (6→3), ciclo da porta (2a–2d), entre portas (3a), aba Hoje (4a), aba Eu (5a), fecho (6a), escada da cobrança, regras e KPIs.
- `prancha/Espinha do dia - Prancha.dc.html`: **o detalhe de abrir e fechar.** Os estados da linha do dia, plano feito no Cockpit (1a), proposta sem plano (1b), trocar (1c), ignorar (1d), 9h00 (1e), gestor montou (1f), rua no ritmo, atrás e escapando (2a–2c), fecho (3a), fechado (3b), ignorado (3c), dia seguinte (3d).
- `ref/PEDIDO-dia-do-executivo.md`: o pedido original, com os números medidos em 28/10 e as decisões.
- `ref/PROMPT-anterior-AGENDA.md` e `ref/PROMPT-anterior-TAREFAS-POR-DIA.md`: os pacotes que já foram ou estão indo para o ar. **Este pacote depende dos dois** e não refaz nada deles.
- `ref/PLAYBOOK-gatilhos.md`: a tabela de gatilhos do Playbook (a mesma da Fala pronta do Mapa).

Abra as pranchas no navegador (precisam de `support.js`, `mapa-base.svg` e `takeat-t-branco.png` na mesma pasta). Cada celular tem um id (1a, 2c…). Use esses ids nas perguntas e nos commits.

**A fidelidade é alta:** textos, ordem, tamanhos e estados são finais. Nomes de restaurantes, exceto o VASCO, e os números do placar (14 de 30, faixa 1) são ilustrativos. Os reais vêm dos dados.

### Tokens: nenhuma cor nova

As pranchas foram desenhadas só no tema escuro, com valores literais. No código, use os tokens que o app já tem (os mesmos dos pacotes Agenda e Tarefas por Dia). O tema claro sai pelos tokens, sem desenho próprio.

| prancha (escuro) | token |
|---|---|
| `#121417` fundo / `#17191D` folha e barra | `--surface` / `--surface-2` |
| `rgba(255,255,255,.06–.12)` cartão, chip | `--surface-3` |
| `rgba(255,255,255,.14)` / `.2` linha | `--border` / `--stroke-strong` |
| `#F4F5F7` / `.74` / `.6` texto | `--text` / `--text-muted` / `--text-subtle` |
| `#E51A31` ação / `#FF6B78` kicker vermelho | `--vermelho-acao` / `--vermelho-texto` |
| `#0F2E1B` / `#86EFAC` ok | `--ok-fundo` / `--ok-texto` |
| `#3A2A06` / `#FDE68A` âmbar | `--tint-amber` / `--tint-amber-text` |
| `#4A0F16` / `#FFD0D5` vermelho de fundo | **pergunta 0.9**: use o token de alerta crítico que já existir. Se não existir, não crie: me mostre. |

Cores de etapa e temperatura (Q `#E23B3B`, M `#F5A524`, F `#0EA5E9`, cliente `#16A34A`) são dado, não decoração. Poppins. Nada de emoji (☎ ✓ › ★ são glifos, já usados no app). Toque mínimo de 44 px.

---

## 0. Antes de escrever código, confirme e me mostre

1. **Navegação.** Onde está a barra de 6 abas (Mapa, Lista, Agenda, Tarefas, Playbook, Meu desempenho) e as rotas de cada uma. Liste os links internos e as notificações que abrem cada rota (eles vão precisar de redirecionamento, 2.1).
2. **Um plano só.** O plano do dia que o Cockpit (Planejamento, computador) grava é o mesmo que a Agenda do app lê? Mostre a tabela e onde grava **quem montou** (executivo, app, gestor). Se não grava a origem, proponha o campo.
3. **Proposta do dia.** A função do "Montar com 6 sugestões" da Agenda pode receber "estas tarefas na frente" (promessas vencidas)? Responda **pronto**, **parâmetro novo** ou **função nova**.
4. **Promessa vencida.** Como distinguir na fila `fila-tarefas` a tarefa **de visita** (pediu para voltar) da de ligação/WhatsApp. Mostre o campo.
5. **Primeira abertura do dia.** Onde dá para detectar "primeira vez que o app vem para a frente depois das 05h00 no fuso da praça" (visibilitychange + último registro local/servidor).
6. **Saí e GPS.** O Cheguei já guarda a coordenada da porta. Existe acompanhamento de posição depois dele? Diga o custo de bateria de checar "150 m da porta ou 10 min parado em outro lugar" a cada 60 s só enquanto houver visita aberta.
7. **Desfecho.** O registro de visita de hoje (ficha) grava etapa, tarefa com data e motivo de perda? Mostre onde. O "Saí" (2c) deve usar **a mesma escrita**, não uma nova.
8. **Se ele disser.** A tabela de gatilhos do Playbook já tem as objeções por sistema atual e dor? Se só tem a fala de abertura, diga o que falta para ter até 2 objeções por casa (sem campo novo no HubSpot: a ficha já tem sistema e dor).
9. **Vermelho de fundo.** Existe token de alerta crítico (fundo e texto) no app? Qual?
10. **Cockpit do gestor.** Onde mora hoje a notificação para o gestor e a tela de Planejamento. Dá para abrir o Planejamento de um executivo e dia específicos por link (`?exec=…&dia=…`)?

**Pare e me mostre as respostas antes de seguir.**

---

## 1. Congelado: não mexer

- **O desenho do Mapa de 15/10**: pinos, lentes, cores, folha da próxima porta, Cheguei por GPS, Fala pronta, lista do recorte. O Mapa ganha a linha do dia e novos conteúdos de folha, mais nada.
- **Tarefas por Dia** e **Agenda**, por dentro: fila valor × urgência (servidor), 3 toques, Desfazer de 5 s, janelas de ligação **12:30–12:45** e **17:30–17:45**, "Tirar do plano" com motivo, 3 níveis de aviso. As telas continuam existindo (aba Hoje e Eu › Planejar a semana). Só mudam de lugar.
- **Desfecho obrigatório** (do pacote Tarefas): próximo passo datado ou sem interesse com motivo, que vai a Perdido. Não existe "Nada agora".
- **Campo de 50 caracteres**: mínimo 50, aviso e não trava.
- **Visita só se prova pelo Cheguei.**
- **HubSpot e Asaas**: nenhuma propriedade nova, nenhuma automação nova. "Plano do app/gestor", "dia fechado" e "saí" são registros do próprio app.
- **Quente** = Ag. Pagamento + as 3 etapas de venda (confirmado por Julyan em 28/10).

---

## 2. O que construir

Ordem de entrega: **fase 1** = 2.1, 2.2, 2.3, 2.4. **Fase 2** = 2.5, 2.6, 2.7. **Fase 3** = 2.8, 2.9, 2.10, 2.11. Cada fase vai para o ar sozinha.

### 2.1 Barra de baixo: Mapa · Hoje · Eu

- 3 itens, mesma altura e estilo da barra atual (84 px com a área segura). Ativo em `--vermelho-acao`.
- **Hoje** tem selo numérico vermelho = atrasados + visitas sem próximo passo. Some no zero.
- **Lista** sai da barra e vira o botão "Lista" dentro da busca do Mapa, no lugar do avatar (o avatar vai para a aba Eu). Abre a lista do recorte que já existe.
- **Redirecionamento:** rotas antigas continuam funcionando. Agenda (dia) e Tarefas → Hoje. Agenda (semana) → Eu › Planejar a semana. Playbook → Eu › Playbook. Meu desempenho → Eu.
- O app **sempre abre no Mapa**.

### 2.2 Linha do dia (Mapa)

- Posição: `top` logo abaixo da fileira de lentes (na prancha, 158 px num celular de 844), 12 px de margem lateral, `min-height` 48, raio 14, sombra da folha. Acima do mapa, abaixo da busca.
- Conteúdo: ponto de 8 px · título 13,5/700 · subtítulo 12/500 · à direita 12,5/700, sem quebra.
- **Sem X.** Tocar abre a folha do momento.
- Estados e textos exatos (o `N`, `R$` e nomes vêm do dado):

| estado | tom | título | subtítulo | direita | quando |
|---|---|---|---|---|---|
| proposta | âmbar | Hoje ainda sem plano | 6 portas prontas para confirmar | | folha de proposta aberta |
| sem plano | âmbar | Dia sem plano | às 9h00 o gestor vê | Montar › | antes de 9h00, sem plano |
| plano feito | neutro | Plano de hoje · feito no Cockpit (ou "no app") | ontem, 19:12 · 0 de 6 portas | 6 › | já existia plano |
| provisório | âmbar | Plano provisório · gestor avisado | você não confirmou · 0 de 6 | Confirmar › | 9h00 sem plano |
| do gestor | neutro | Plano do gestor · N de 6 portas | montado às HH:MM | 6 › | gestor salvou |
| no ritmo | neutro | N de 6 portas · no ritmo | faltam R$ X para a próxima venda | +R$ X | rua |
| atrás | âmbar | N de 6 · faltam K, restam Hh | J delas a menos de 400 m | Ver › | rua |
| escapando | vermelho | N de 6 · faltam K e resta M min | as J mais perto cabem até as 18h | Ir › | rua |
| na porta | neutro | Na porta · {nome} | visita provada às HH:MM | N de 6 | depois do Cheguei |
| pendente | vermelho | {nome} sem próximo passo | visita das HH:MM | Dar › | 2.6 |
| fecho | âmbar | Fecha o dia · K sem próximo passo | N de 6 portas | Fechar › | 18h00 até fechar |
| aberto | âmbar | Dia aberto · K sem desfecho | fica até você fechar | Fechar › | não fechou |
| ontem | âmbar | Ontem ficou aberto | K portas sem desfecho | Fechar › | dia seguinte |
| fechado | verde | Dia fechado · N de 6 portas | amanhã já começa com K | ✓ | até 23h59 |

- **Prioridade quando dois valem:** pendente > escapando > ontem > fecho > provisório/sem plano > atrás > o resto.
- **Ritmo** (dia útil de 8h00 a 18h00, meta 6): `esperado = 6 × (agora − 8h) ÷ 10h`. Neutro se `feitas ≥ esperado − 1`. Âmbar abaixo disso. Vermelho quando `faltam × 45 min > tempo até 18h00`. Passou de 6: verde, "7 de 6". "Feitas" = visitas provadas por Cheguei. A meta e o "+R$" vêm da mesma fonte do Meu desempenho.

### 2.3 Abrir: o plano vem até ele (Espinha 1a–1f, Otimizado 1a)

- **Primeira abertura do dia** (pergunta 0.5): a folha sobe sozinha, cobrindo do topo da linha até o fim da tela (sem barra), com o mapa visível atrás. Nas outras aberturas, não sobe; a linha basta.
- **Já existe plano** (Cockpit ou app, feito ontem ou hoje): kicker "BOM DIA · {DIA}, {DD/MM}", direita "feito no Cockpit ontem" (ou "no app"), título "Seu plano de hoje: N portas. Vamos?", as N paradas em ordem, botões **Trocar uma** (secundário) e **Começar o dia** (primário). Promessa vencida **fora** do plano: faixa âmbar "{nome} pediu retorno e venceu há D dias. Está fora do plano. Pôr na frente ›".
- **Não existe plano:** título "Hoje são estas 6, nesta ordem. Confirma?", subtítulo com a rota ("Rota de 3,8 km · começa a 600 m de você"), pinos **tracejados** no mapa (proposta), botões **Trocar uma** e **Confirmar as 6**, link "Agora não · a linha fica âmbar e às 9h00 o gestor vê".
- **Proposta** = promessas vencidas de visita (selo PROMESSA, na ordem valor × urgência da fila), completadas até 6 com o "Montar com 6 sugestões" da Agenda. Ligação e WhatsApp atrasados não entram (vão para entre portas). Mais de 6 promessas: entram as 6 primeiras e a linha diz "+K promessas fora do plano".
- **Trocar uma (1c):** tocar numa parada → 3 alternativas perto da rota ("mesma distância ou menos") com "Pôr". **Promessas não aparecem para troca:** só saem por "Tirar do plano" com motivo, na folha da porta.
- **Confirmar** grava o mesmo plano que a Agenda grava, com origem "executivo".
- **9h00 sem plano (1e):** a proposta vira plano com origem "app" (provisório), halo na 1, toast "09:00 · Seu gestor foi avisado. Até ele mexer, seguem estas 6.", e **1 aviso ao gestor** (2.10). Se já existia plano, nada disso acontece.
- **Gestor salvou (1f):** o app relê o plano ao voltar para a tela e a cada 60 s. Toast "HH:MM · Seu gestor montou seu dia: trocou K portas." A folha da próxima porta lista "O QUE O GESTOR MUDOU" com selo GESTOR. Se o gestor mexer num plano feito pelo executivo, mesma coisa.

### 2.4 Indo: a folha da próxima porta (Otimizado 2a)

- É a folha de hoje (kicker PRÓXIMA PORTA · N DO PLANO, Para entrar, Ir, Cheguei). Entra **um bloco novo**, abaixo do Para entrar: **"SE ELE DISSER · PARA ESTA CASA"**, com até 2 linhas de 44 px: a objeção entre aspas, à direita o motivo curto (sistema ou dor) e ›.
- Escolha: pela tabela de gatilhos (pergunta 0.8), com o sistema atual e a dor da ficha. Sem ficha, o bloco some. Funciona sem sinal (mesmo cache da Fala pronta).

### 2.5 Na porta (Otimizado 2b)

- Depois do Cheguei (prova de GPS igual à de hoje), a folha vira **Na porta**: kicker "NA PORTA · VISITA PROVADA ✓" em `--ok-texto`, hora à direita, título "{nome} · {decisor}, {papel}", subtítulo "Da última vez: {próximo passo combinado}".
- Bloco **FALA PRONTA**: a frase do porquê e a fala inteira entre aspas.
- **Se ele disser**: tocar abre a resposta **ali mesmo**, sem sair da folha (o ícone vira –). A página inteira do Playbook continua em Eu › Playbook.
- Botão único: **Saí · como ficou?**

### 2.6 Saí: o próximo passo (Otimizado 2c e 2d)

- Folha cheia (sem barra). Kicker "COMO FICOU · {NOME}", direita "leva 20 s", título "Qual é o próximo passo?".
- **4 opções** em grade 2×2 (60 px): Fechou (vai para Ag. Pagamento) · Demo marcada (dia e hora) · Voltar (dia, e o que levar) · Perdeu (motivo, como hoje). "Perdeu" usa **o mesmo fluxo** do "Sem interesse" das Tarefas, que vai a Perdido. Só o rótulo é curto por causa da largura.
- Conforme a opção: chips de dia (Amanhã · próximo dia útil · o seguinte · Outro) e, se Demo, a hora. Depois o campo **"O QUE FICOU COMBINADO"** (mínimo 50, aviso e não trava, contador "N caracteres · mínimo 50 ✓").
- **O que já se sabe não é perguntado** (decisor, etapa, MRR, proposta): vem da ficha/negócio.
- Grava **exatamente** como o registro de visita grava hoje (pergunta 0.7). Voltar vira tarefa de visita, que entra no plano daquele dia como PROMESSA.
- Primário: **Salvar e ir para a {N+1}**, com Desfazer de 5 s. Link "Depois · fica pendente no topo da próxima folha".
- **Pendente (2d):** visita com Cheguei e sem desfecho quando (a) ele toca "Depois", ou (b) está a 150 m da porta, ou (c) passaram 10 min parado em outro lugar. Então: linha vermelha "pendente" e, **no topo de toda folha**, o bloco "ANTES DA PRÓXIMA · Como ficou a {nome}?" com os 4 botões (cada um abre o 2c já na opção). **Cheguei na próxima continua funcionando.**

### 2.7 Entre portas (Otimizado 3a)

- Bloco âmbar no topo da folha da próxima porta: "ANTES DE ANDAR · 2 MIN", direita "K de J hoje", título "Ligar para {contato}, {lead}", texto "Combinado: “{o que foi combinado}”. Venceu há D dias." e botões **Ligar** (primário) · WhatsApp · Depois.
- **Quando aparece:** depois de um desfecho salvo; parado mais de 5 min; nas janelas 12:30–12:45 e 17:30–17:45. **Um por vez**: a ligação/WhatsApp de maior valor × urgência da fila. "Depois" esconde por 30 min.
- Ligar/WhatsApp e o registro são os 3 toques das Tarefas, sem mudança.

### 2.8 Aba Hoje (Otimizado 4a)

- Tela cheia, sem mapa. No topo, a fileira de dias da Tarefas por Dia (Hoje · Amanhã · Sex · Depois, com contagem). Título "{Dia}, {DD/MM} · N de 6 portas".
- Grupos, nesta ordem: **ATRASADOS** (âmbar: promessas no plano e ligações vencidas) · **PLANO** (as paradas que faltam, com hora prevista) · **LIGAR HOJE** (com a janela) · **SEM PRÓXIMO PASSO** (vermelho, "Dar" em `--vermelho-acao`).
- Cada linha tem **um verbo**: Ir · Ligar · Dar. Ir volta ao Mapa com a folha daquela porta. Ligar e Dar abrem os mesmos fluxos de 2.7 e 2.6.
- É a mesma fila e o mesmo plano: **a contagem bate com a linha do dia e com o selo**.

### 2.9 Aba Eu (Otimizado 5a)

- Título "{Mês} · faixa N da variável" e subtítulo do que falta para a próxima faixa (dados do Meu desempenho).
- Grade 2×2: HOJE (N de 6, portas provadas) · SEMANA · MÊS (R$, contratos) · PRÓXIMA VENDA (+R$). Mesma fonte do Meu desempenho.
- Lista: **Planejar a semana** (a Agenda de semana, sem mudança) · **Playbook** (biblioteca com busca, sem mudança) · **Recém-abertos da semana** (abre a lente do Mapa) · **Ajustes e sair**.

### 2.10 Fechar (Espinha 3a–3d, Otimizado 6a)

- **18h00**, na primeira vez que o app vem para a frente depois disso, a folha sobe sozinha (cheia). Kicker "FIM DO DIA · {DIA}, {DD/MM}", direita "N de 6 portas ✓" se bateu. Título "N portas, J com próximo passo, K sem. Fecha?". Subtítulo com as ligações ("Ligações: 1 de 2 feitas · a outra passa para amanhã").
- Grupo **SEM PRÓXIMO PASSO** (cada um com Dar → 2.6). Grupo **AMANHÃ JÁ COMEÇA COM** (os Voltar e ligações de amanhã).
- Primário: **Fechar o dia**, com Desfazer de 5 s. Link "Depois".
- **Fechado (3b):** linha verde até 23h59. Toast "Salvou. Dia fechado. Desfazer".
- **Não fechou até 23h59:** o dia conta como não fechado. Na primeira abertura do dia seguinte (3d), **o fecho de ontem vem antes do plano** ("ANTES DO PLANO · ONTEM FICOU ABERTO"), com o primário "Fechar ontem e ver o plano" e o link "Pular para o plano · {dia} fica como não fechada para o gestor".
- K = 0: o fecho mostra só o placar e "Fechar o dia".

### 2.11 Cockpit do gestor (2 pontos)

1. **Aviso 09:00 "{Executivo} não planejou · Montar o dia dele ›"**, só se não havia plano às 9h00. Abre o Planejamento daquele executivo e dia, **com as 6 propostas já postas**. Trocar/pôr lead e salvar grava o plano com origem "gestor", e o app atualiza (2.3). Se o executivo confirmar antes, o aviso vira "confirmou às HH:MM".
2. **Aviso 08:00 "{Executivo} não fechou {dia} · K sem desfecho"**, no dia seguinte, só se ele pulou. Some quando ele fechar.
3. **Número novo por executivo**, no dia e na semana: **visitas sem próximo passo** (Cheguei sem desfecho até 23h59). Onde já mostra visitas provadas.

No máximo **2 avisos por executivo por dia**. A rua não gera aviso (o gestor já vê as visitas ao vivo).

---

## 3. Dados: de onde vem cada coisa

| na tela | fonte |
|---|---|
| plano, ordem, origem | tabela do plano (Cockpit = Agenda), + campo de origem (0.2) |
| promessa vencida | `fila-tarefas`, tarefa de visita vencida (0.4) |
| sugestões | "Montar com 6 sugestões" da Agenda (0.3) |
| N de 6, +R$, faixa | mesma fonte do Meu desempenho |
| Cheguei, hora, prova | `client_visits`, como hoje |
| decisor, sistema, dor, último combinado | fichas de rua / próxima tarefa do HubSpot |
| Para entrar, Fala, Se ele disser | Playbook, tabela de gatilhos (offline) |
| ligação entre portas | `fila-tarefas`, ligação/WhatsApp |
| desfecho | mesma escrita do registro de visita de hoje (0.7) |
| saí, pendente, dia fechado | registros do app (novos, fora do HubSpot) |

## 4. Sem sinal

Tudo o que é registro (confirmar plano, desfecho, fechar o dia) entra na **mesma fila offline** do Cheguei, com hora e GPS, e vai quando o sinal voltar. A linha do dia calcula com o que está no celular. O aviso de 9h00 ao gestor é decidido **no servidor** (não depende do celular estar online).

## 5. Eventos para medir

`plano_proposto`, `plano_confirmado {origem, hora}`, `plano_trocado`, `plano_provisorio_9h`, `plano_gestor_salvo`, `linha_tom {estado}`, `linha_toque {estado}`, `se_ele_disser_aberto {gatilho_id}`, `sai_desfecho {opcao, segundos}`, `pendente_criado {motivo: depois|150m|10min}`, `pendente_resolvido {onde: folha|hoje|fecho|dia_seguinte}`, `entre_portas_mostrado`, `entre_portas_ligou`, `fecho_mostrado`, `fecho_fechado {hora}`, `fecho_pulado`.

KPIs (4 semanas): visitas com próximo passo no mesmo dia (**meta 95%**), plano confirmado até 9h00, promessas vencidas há mais de 7 dias (meta zero), toques em "Se ele disser" por página.

## 6. Checklist de aceite

- [ ] Barra com 3 abas; rotas antigas redirecionam; o app abre no Mapa.
- [ ] Linha do dia em todos os 14 estados, com a prioridade de 2.2, nos 2 temas, a 375 e 390 px, sem quebrar o texto da direita.
- [ ] Plano feito no Cockpit aparece no app com "feito no Cockpit"; gestor salva no Cockpit e o app mostra em até 60 s.
- [ ] Sem plano: proposta com promessas na frente; 9h00 vira provisório e o gestor recebe 1 aviso, uma vez.
- [ ] Promessa não aparece em "Trocar uma".
- [ ] Na porta: Se ele disser abre a resposta na folha, sem sinal também.
- [ ] Saí grava igual ao registro de visita de hoje; o 50 caracteres avisa e não trava; Desfazer de 5 s.
- [ ] Pendente nasce por Depois, 150 m e 10 min; aparece no topo de toda folha; Cheguei na próxima funciona.
- [ ] Entre portas: um por vez, nas 3 condições; "Depois" esconde por 30 min.
- [ ] Aba Hoje: contagens iguais às da linha do dia e do selo.
- [ ] Fecho às 18h00; não fechado abre o dia seguinte antes do plano; gestor recebe o aviso das 08:00 só se pulou.
- [ ] Nenhum estado impede abrir o Mapa ou dar Cheguei.
- [ ] Nenhuma propriedade ou automação nova no HubSpot ou no Asaas.
- [ ] Nenhuma cor fora dos tokens.
