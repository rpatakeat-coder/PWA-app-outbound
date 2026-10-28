# Respostas ao pacote "App de rua otimizado · a espinha do dia"

28/10/2026 · antes de escrever código, como o §0 do prompt pede.
Tudo abaixo foi **medido** no repositório `PWA-app-outbound`, no `cockpit-unificado` e no banco de produção (`mxyjvijclhlxrlafqcrz`) hoje. Nada é de memória.

> Leia primeiro o §11. Três coisas do pedido já existem, uma está desenhada em cima de um lugar ocupado, e uma pergunta do §0 tem resposta pior do que o pedido supõe.

---

## 1 · Navegação: onde está a barra e quais são as rotas

**A barra do celular tem 4 abas, não 6.** `App.tsx:8016` (`abasDoRodape`), desenhada em `App.tsx:9562`:

| posição | aba | selo hoje |
|---|---|---|
| 1 | **Mapa** (`map`) — ativa também em `list` | — |
| 2 | **Agenda** (`agenda`) — ativa também em `route` | número claro: paradas que faltam + agendados de hoje + tarefas do HubSpot de hoje |
| 3 | **Tarefas** (`tasks`) | texto: "6 atrasados" |
| 4 | **Playbook** (`playbook`) | — |

- **Lista já não é aba.** Desde o mapa novo, Mapa e Lista são a mesma base vista de dois jeitos e alternam dentro da tela (`App.tsx:905`, estado `vistaMapa`). No celular a lista do recorte abre pelo botão **"Ver em lista · N"** na fileira de lentes — publicado ontem (`d13eae3`).
- **Meu desempenho já não é aba.** Mora no menu do avatar (`App.tsx:9464`), junto com Gestão, Lente Calor, Modo sol, Minhas fotos, Configurações e Sair. A barra de 6 que o pedido descreve é a **da sidebar do computador** (`itensNavWeb`, `App.tsx:8060`), que é outra tela.
- **A barra de 8 entradas só existe no tipo:** `type AppTab = 'map' | 'list' | 'route' | 'agenda' | 'tasks' | 'playbook' | 'meu' | 'config'` (`App.tsx:351`).

**Rotas: não existem.** O app é uma página só com estado `tab`; não há `/agenda`, `/tarefas` nem history por aba. O que existe de ligação externa são **três parâmetros de busca**, todos com o mesmo destino:

| entrada | parâmetros | cai em |
|---|---|---|
| push da fila (`public/sw.js:83`) | `/?fila=<acao>&deal=<id>&origem=push` | `setTab('tasks')` (`App.tsx:821`) |
| service worker com o app aberto | mensagem `FILA_ACAO` com a mesma url | idem |

**O que "redirecionar" custa de verdade:** trocar as chamadas internas. Hoje são, em `App.tsx`, 6 × `setTab('agenda')`, 7 × `setTab('tasks')`, 1 × `setTab('playbook')`, 3 × `setTab('route')`, 1 × `setTab('meu')`, 1 × `setTab('list')`, 15 × `setTab('map')`, mais 11 pontos nas telas (`aoAbrirTarefas`, `aoPlaybook`, `aoVoltarAgenda`, `aoAbrirAgendaNoDia`…). **Nenhuma url quebra, porque nenhuma url existe.** O §2.1 fica muito mais barato do que parece — e a parte de "rotas antigas continuam funcionando" sai do escopo.

---

## 2 · Um plano só: sim, e já é um só — mas a origem não diz quem

**É o mesmo plano, espelhado pelo banco nos dois sentidos** (migrations 0150 em diante):

```
Cockpit (Planejamento)        app (mapa, Agenda)
planos_semanais.grade  ──┐   ┌──  field_routes + field_route_stops
                         │   │
  gatilho plano_mudou ───┘   └─── gatilho rota_para_plano
  → plano_para_rota()            → espelhar_parada_no_plano(stop, fora)
```

- **A tabela do app:** `field_routes` (`seller_id`, `route_date`, `status`, `source`, `created_by`) + `field_route_stops` (`route_id`, `client_id`, `position`, `status`, `planned_at`, `mandatory_reason`, `horario_fixo`, `acao`, `motivo_remocao`). Escritas em `src/utils/paradaDoDia.ts`.
- **A tabela do Cockpit:** `planos_semanais` (`owner_id`, `data_segunda`, `grade` jsonb, `fechado_em/por`, `promessa*`).

**Onde a origem já é gravada — e o que ela não diz.**

Por parada, `field_route_stops.mandatory_reason`. Medido hoje em produção:

| mandatory_reason | planned | done | removed |
|---|---|---|---|
| `plano_cockpit` | 878 | 181 | 318 |
| (nulo) | 185 | 448 | 229 |
| `sla` | 4 | — | 5 |
| `conta_alvo` | 4 | — | 4 |

Por item da grade, `origem`:

| origem | itens | o que é |
|---|---|---|
| (nulo) | 6185 | posto à mão no Planejamento do Cockpit |
| `app` | 471 | veio do mapa/Agenda do app |
| `passo` | 326 | próximo passo datado na ficha do negócio |
| `app-agenda` | 44 | posto pela Agenda do app |
| `territorio` | 30 | entrou pelo território |

**O furo:** a origem diz **por qual tela** o item entrou, não **quem** o pôs. E o executivo também planeja pelo Cockpit (decisão sua, 06/10). Então, hoje, **"feito no Cockpit" não distingue o executivo do gestor** — que é exatamente a distinção que o §2.3 e o §2.11 precisam para escrever "Plano do gestor · montado às HH:MM".

**Proposta (um campo, nenhum no HubSpot):** acrescentar `quem` ao item da grade, com lista fechada `executivo | gestor | app`, gravado por `plano_poe_slot` (que já recebe `p_origem`) a partir do usuário autenticado do Cockpit, comparado com o `owner_id` do plano. Fora isso, nada muda: a ponte, os gatilhos e o espelho continuam como estão.

---

## 3 · Proposta do dia: nem pronto, nem função nova — **parâmetro novo**, em duas funções diferentes

Existem **três** montadores hoje, e o pedido cita o nome de um e o comportamento de outro:

| função | onde | o que faz | quem chama |
|---|---|---|---|
| `montar(n)` | `src/screens/AgendaPC.tsx:468` | pega as sugestões não-no-dia na ordem `régua → conta-alvo → queda` | botão **"Montar com N sugestões"**, só no computador |
| `montarDiaComMicrorrotas()` | `App.tsx:3954` | varre a carteira num raio de 8 km do GPS e pontua | botão **"Montar meu dia"**, celular |
| `generateDailyRoute()` | `App.tsx:3502` | o montador antigo da aba Rota | só sem o mapa novo |

O botão que você viu na varredura ("Montar com 6 sugestões") é o **do computador**. No celular o equivalente é o "Montar meu dia".

**A boa notícia:** `montarDiaComMicrorrotas` **já põe promessa vencida na frente**, por peso: `if (comTarefa.has(c.id)) p += 35;`, onde `comTarefa` são as tarefas do HubSpot com vencimento ≤ hoje. Mas é peso, não garantia — uma proposta quente com SLA estourado (+40) passa na frente de uma promessa.

**Resposta: parâmetro novo.** `montarDiaComMicrorrotas({ primeiro: string[] })` — os ids entram nas primeiras posições sem passar pela pontuação, e o resto completa até a meta como hoje. O `montar(n)` do computador recebe o mesmo parâmetro e a mesma semântica, para o plano montado nos dois lugares ficar igual. Não é função nova e nada do que existe muda de comportamento quando `primeiro` vem vazio.

---

## 4 · Promessa vencida: o campo existe e é `verbo`

Em `supabase/functions/_compartilhado/filaDoDinheiro.ts`, cada item da fila carrega:

- `presencial: boolean` — `true` para visita **e** reunião;
- `verbo: 'Ligar' | 'Visitar' | 'WhatsApp' | 'Registrar'`.

**Para "pediu para voltar", o campo é `verbo === 'Visitar'`** — `presencial` não serve, porque inclui reunião. A classificação sai de `tipoDaTarefa(assunto, corpo)` (linha 183), por texto:

```
/^\s*visita\b/ no assunto  ou  /:visita:/ no corpo   → visita
/^\s*reuniao\b|^\s*demo\b|:reuniao:/                 → reuniao
/whats|wpp|zap\b/                                    → whatsapp
/cobran|boleto|pagamento|asaas/                      → cobranca
resto                                                → ligar
```

Vencida = `venceu === true`. Então a proposta do §2.3 é: `itens.filter(i => i.verbo === 'Visitar' && i.venceu)`, já na ordem valor × urgência que a fila devolve. **Nada novo.** O resto (`Ligar`, `WhatsApp`) sobra naturalmente para o §2.7, como o pedido quer.

---

## 5 · Primeira abertura do dia: já existe — e **o lugar já está ocupado**

O padrão exato que o §2.3 pede está em `App.tsx:1250`, chamado "Antes da rua":

```js
const chave = `antes-da-rua-${filaNaTela.data.hoje ?? diaBRT(new Date())}`;
try { if (window.localStorage.getItem(chave)) return; window.localStorage.setItem(chave, '1'); } catch { return; }
setAntesDaRua(true);
```

Guarda por dia, por aparelho, só com o Mapa na tela e só antes das 19h de Brasília. O retorno do segundo plano é `AppState.addEventListener('change')` (`App.tsx:1518`) — no react-native-web isso é `visibilitychange`, então funciona no PWA.

**O conflito:** "Antes da rua" **já sobe uma folha sozinha na primeira abertura do dia**, com os quentes esfriando e o Ligar. A folha de plano do §2.3 quer o mesmo instante. Duas folhas automáticas no mesmo gesto é uma a mais do que o executivo aguenta às 8h.

**Precisa de decisão de desenho**, e eu recomendo a terceira opção:
1. o plano vem primeiro e "Antes da rua" vira o segundo cartão — duas folhas seguidas;
2. "Antes da rua" sai — perde-se o resgate do quente esfriando, que foi feito para isso;
3. **os dois viram uma folha só**: o plano é o corpo, e o quente esfriando entra como a faixa de cima ("ANTES DO PLANO · 2 quentes esfriando"), do mesmo jeito que o §2.10 já faz o fecho de ontem vir antes do plano.

---

## 6 · Saí e GPS: o custo é **zero** enquanto o mapa está na tela

- **O Cheguei já guarda a porta:** `client_visits` tem `visited_at_lat`, `visited_at_lon`, `distance_m`, `accuracy_m`, `visited_at`.
- **Já existe acompanhamento contínuo:** `src/map/MapView.tsx:448`, `navigator.geolocation.watchPosition` com `enableHighAccuracy: true`, `maximumAge: 5000`, religando no `visibilitychange`. Ele roda **enquanto o mapa está montado**, que é a maior parte do dia do executivo.

**Custo de bateria, medido pela arquitetura e não por chute:**

| situação | custo do "150 m ou 10 min" |
|---|---|
| mapa na tela | **nenhum.** O fluxo de posição já existe; a conta é uma subtração de coordenadas por ponto recebido |
| aba Hoje ou Eu | o `watchPosition` é desligado no desmonte do mapa. Um timer de 60 s aqui seria **custo novo** |
| app em segundo plano | o navegador suspende o `watchPosition`. Um timer não acorda |

**Recomendação: não criar timer de GPS.** A "pendente" nasce de três gatilhos, dois deles sem GPS nenhum:
1. o toque em **"Depois"** (custo zero);
2. o próximo **Cheguei** (custo zero — já é um evento);
3. **150 m da porta**, derivado do fluxo que o mapa já tem.

E o "10 min parado em outro lugar" vira um `setTimeout` simples disparado no Cheguei, **sem** acordar o GPS: quando ele volta à tela, a última posição conhecida (`ultimaPosicao`, já guardada em `MapView.tsx`) resolve. Assim o §2.6 não custa bateria nenhuma, e o executivo não perde visita por causa de um timer que o iPhone matou.

---

## 7 · Desfecho: já existe, com nome, e o "Saí" deve usá-lo inteiro

**A folha existe:** `src/screens/DesfechoVisitaSheet.tsx`. Ela já sobe sozinha logo depois do check-in, com saída visível ("Agora não"), e nunca segura a visita.

**A escrita existe:** `enviarDesfechoDaVisita` (`src/utils/hubspotSync.ts`), três escritas independentes:
1. **qualificação** — `nome_do_sistema` e `gargalo_operacional` no negócio;
2. **nota** — bloco `DESFECHO_VISITA v1`, datado na visita e não no envio, formato de contrato lido pelo Cockpit (`doc-cockpit/08-regras-de-negocio.md`);
3. **tarefa do próximo passo** — só existe se ele prometeu alguma coisa, `concluida: false`.

**O modelo existe:** `src/utils/desfechoVisita.ts` — `DESFECHOS` com 6 valores (`falou_com_decisor`, `decisor_ausente`, `pediu_retorno`, `sem_interesse`, `estabelecimento_fechado`, `outro`), `CANAIS` com 4, `GARGALOS` com 6 (enumeração do HubSpot: valor fora da lista volta erro cru da API), `PRAZOS` em dias úteis D+1/D+3/D+7.

**Como as 4 opções do §2.6 mapeiam no que já existe:**

| botão do §2.6 | desfecho | próximo passo |
|---|---|---|
| Fechou | `falou_com_decisor` | etapa → Ag. Pagamento (fluxo de hoje) |
| Demo marcada | `falou_com_decisor` | tarefa canal `visita`/`reuniao` com dia e hora |
| Voltar | `pediu_retorno` | tarefa `Visita - <restaurante>` no dia escolhido |
| Perdeu | `sem_interesse` | o mesmo fluxo que vai a Perdido, com motivo |

**Resposta à pergunta:** o "Saí" **não escreve nada novo** — ele é um rosto novo sobre `enviarDesfechoDaVisita`. O que muda é o enquadramento (grade 2×2, "leva 20 s", primário "Salvar e ir para a {N+1}") e o que *deixa* de ser perguntado quando a ficha já sabe. Duas ressalvas:

- **"Perdeu" não é só um rótulo curto.** Hoje `sem_interesse` pede motivo e manda o negócio a Perdido. Numa grade de 2×2 na calçada, "Perdeu" fica a um toque de "Fechou". Vale um confirma de um toque só nessa opção — não uma trava, um "tem certeza?" que o certo atravessa sem pensar.
- **A pergunta do sistema e da dor não pode sumir.** Elas são a razão de a folha existir (medido em 14/09: 134 de 154 negócios na etapa Visita sem `nome_do_sistema`). O §2.6 diz "o que já se sabe não é perguntado" — concordo, mas **só quando já se sabe**. Sem sistema e sem dor na ficha, as duas perguntas continuam, e são elas que alimentam o "Se ele disser" da próxima porta (§8).

---

## 8 · Se ele disser: as objeções existem, o índice por casa **não**

**O que existe:**
- `objecoesDoPlaybook(pb)` (`src/utils/playbook.ts:146`) lê a página `objecoes` e devolve `{ pergunta, curta, fala, seInsistir, diagnostico, followUp }` por `<h3>`. **Nada é escrito no app**: mudar a página no Cockpit muda a resposta na rua.
- Hoje a página tem **5 objeções**: *caro / setup*, *já tenho o sistema X*, *cliente tradicional prefere papel*, *restaurante pequeno*, *e se a internet cair*. Mais a página inteira `objecao-ja-tenho-sistema`.
- O Playbook tem **33 páginas**, incluindo `gatilhos-do-mapa` ("Na porta: as 9 falas do mapa") — os 9 gatilhos do `PLAYBOOK-gatilhos.md` **já estão publicados**.
- `cartaoContextual(pb, ctx)` já escolhe por contexto, com `ContextoPorta = { etapa, temNegocio, celular, gargalo, sistema }`. Ordem: decisor desconhecido → dor declarada → sistema declarado → etapa.

**O que falta, exatamente:** `cartaoContextual` escolhe **uma página**; o §2.4 quer **até 2 objeções nomeadas**. E nada liga uma objeção a um sistema ou a uma dor — a única ponte é `buscarObjecoes(lista, termo)`, busca por palavra. Buscar "Fila" nas 5 objeções devolve ruído.

**Proposta, sem campo novo no HubSpot e sem tabela nova:** uma linha `Quando:` dentro de cada `<h3>` da página de objeções, lida pelo mesmo parser que já lê `Fala pronta:` e `Se ele insistir:`:

```
Quando: dor=Fila, Demora na divisão de contas · sistema=*
```

`GARGALOS` é enumeração fechada de 6 valores, então a lista é conferível. O texto continua morando no Cockpit, você edita sem deploy, e o app só casa `ficha.gargalo` e `ficha.sistema` contra a linha. Sem ficha, o bloco some — como o pedido já manda. Funciona sem sinal pelo mesmo cache da Fala pronta.

**O que eu preciso de você, Julyan:** as 5 objeções de hoje não cobrem as 6 dores. Escrever objeção nova é texto de vendas, não de código — ou você aprova 3 ou 4 novas na página, ou o bloco vai aparecer em menos casas do que o desenho promete.

---

## 9 · Vermelho de fundo: existe, não crie

| prancha | token do app | escuro | claro |
|---|---|---|---|
| `#4A0F16` fundo | `--tint-red` | `#3A1416` | `#FAE8E9` |
| `#FFD0D5` texto | `--tint-red-text` | `#E5A1A4` | `#94090F` |
| (borda, se precisar) | `--tint-red-border` | `#7A2E32` | `#E5A1A4` |

**Duas correções na tabela de tokens do prompt**, para a implementação não inventar cor:

- `#FF6B78` (o kicker vermelho) **não** é `--vermelho-texto` (que é `#FF8A92`). É `--arma-kicker`, que já existe e é exatamente `#FF6B78`.
- `#121417` e `#17191D` da prancha não têm par exato: no app o fundo escuro é `--bg` = `#121212` e a folha é `--surface` = `#1E1E1E`. A diferença é imperceptível e **o token vence a prancha** — como o próprio prompt manda.

Os demais pares da tabela conferem: `--ok-fundo` `#0F2E1B`, `--ok-texto` `#86EFAC`, `--tint-amber` `#33280F`, `--tint-amber-text` `#FFD894`, `--vermelho-acao` `#E51A31`, `--stroke-default` e `--stroke-strong`.

---

## 10 · Cockpit do gestor: o link existe, o aviso não

**O link existe e funciona** (`template/cockpit.template.html:64123`, `pt6LerPedidoDoEndereco`):

```
/gestao/#/planejamento?semana=AAAA-Www&dia=AAAA-MM-DD&pessoa=<ownerId>
```

Abre o dossiê daquela pessoa naquele dia, e se o dia for de outra semana ele anda até 8 semanas para trás sozinho. **O parâmetro é `pessoa`, não `exec`** — o pedido usa o nome errado.

**O que o gestor já vê:** na aba Planejamento, cada executivo tem o selo **`Sem plano` / `Planejado` / `Em execução`** (`template/cockpit.template.html:58866`). Então "o gestor vê quem não planejou" **já é verdade** — como estado numa tela que ele abre, não como aviso que o procura.

**O que não existe:** um centro de avisos do gestor. O único canal entre as duas pontas hoje é o contrário — `sugestoes_planos` (`owner_id`, `texto`, `autor`, `created_at`), que é o **"Cobrar"** do gestor chegando no app do executivo (`App.tsx:12575`).

**Consequência para o §2.11:** os dois avisos (09:00 "não planejou", 08:00 "não fechou") precisam de **uma superfície nova no Cockpit**, não de um lugar existente. É a parte mais cara do pacote inteiro e a única que não reaproveita nada. Como a fase 3 é a última, dá para começar barato: o selo `Sem plano` ganhar o link direto para `#/planejamento?pessoa=…&dia=…` com as 6 propostas já postas resolve **metade** do §2.11 sem construir centro de avisos nenhum. O número novo (visitas sem próximo passo, item 3) é só uma coluna onde já há "visitas provadas" — esse é barato.

---

## 11 · O que isso muda no pedido

### Três coisas já estão prontas (não construir de novo)

1. **A Lista sair da barra** (§2.1) — já saiu. O botão "Ver em lista · N" foi para o ar ontem, na fileira de lentes, não na busca. O desenho precisa decidir se move para a busca ou aceita onde está; eu aceitaria onde está, porque o time está vendo há um dia.
2. **A folha de desfecho** (§2.6) — existe inteira, com as três escritas e a saída "Agora não". O trabalho é de rosto, não de gravação.
3. **A primeira abertura do dia** (§2.3 / §0.5) — o mecanismo existe e está **ocupado** pelo "Antes da rua".

### Uma está desenhada em cima de um lugar ocupado

O §2.2 põe a linha do dia "logo abaixo da fileira de lentes, 48 px". Esse ponto exato hoje tem **três inquilinos**:

| o quê | onde | altura |
|---|---|---|
| a linha de "Limpar filtros" + "Ver em lista · N" | `FileiraDeLentes.tsx:202`, `top: 44 + 6` | ~36 px |
| **FaixaHoraDasLigacoes** — a faixa das janelas 12:30–12:45 e 17:30–17:45 | `App.tsx:7062`, `top: … + 44 + 8` | 72 px |
| a faixa de área/status | `App.tsx:6867`, logo abaixo das duas | variável |

E há uma sobreposição de **sentido**, não só de pixel: a `FaixaHoraDasLigacoes` **já faz** o que o §2.7 pede para as duas janelas de ligação — no mesmo lugar da tela. Ou o "entre portas" absorve essa faixa, ou vão existir dois convites para ligar ao mesmo tempo, às 12:31.

Nas horas de pico isso empilha linha do dia + faixa das ligações + limpar/lista, e o mapa some atrás de quatro barras. **O desenho precisa dizer quem cede.**

### Uma pergunta tem resposta pior do que o pedido supõe

O §2.3 e o §2.11 escrevem "Plano do gestor · montado às HH:MM" e "Plano de hoje · feito no Cockpit". **O banco não sabe dizer isso hoje** (§2): ele sabe por qual tela o item entrou, não por qual pessoa. E como o executivo também planeja pelo Cockpit, "feito no Cockpit" sozinho vai mentir para metade do time. Resolve-se com um campo `quem` de lista fechada, gravado por uma função que já recebe a origem — mas é trabalho que o pedido não previu, e ele é **pré-requisito da fase 1**, não da fase 3.

### O que eu recomendo entregar primeiro

A fase 1 do pedido é 2.1 + 2.2 + 2.3 + 2.4. Pela medição, eu partiria dela em duas:

- **Fase 1a (barata, mexe pouco):** o campo `quem` no plano, a barra de 3 abas, e a linha do dia nos estados que não dependem de plano (`no ritmo`, `atrás`, `escapando`, `na porta`, `fechado`). Isso já põe o placar na frente do executivo o dia inteiro, que é o §2.3 do seu pedido original — *"o número do dia me acompanha na rua"*.
- **Fase 1b:** a folha de abrir, depois que o desenho responder quem cede o lugar abaixo das lentes e o que acontece com o "Antes da rua".

---

## O que eu preciso de você antes de codar

1. **Antes da rua × folha do plano** (§5): as duas querem a primeira abertura do dia. Recomendo fundir, com o quente esfriando como faixa de cima.
2. **Quem cede abaixo das lentes** (§11): linha do dia, faixa das ligações e limpar/lista disputam o mesmo ponto. O "entre portas" do §2.7 provavelmente deve **absorver** a faixa das ligações.
3. **Objeções novas na página do Playbook** (§8): as 5 de hoje não cobrem as 6 dores. Texto de vendas, não de código.
4. **A trava × o aviso**: a pergunta do §4 do pedido original continua em aberto, e o §2 inteiro do novo pacote já assume "forçar pela atenção" ("Regra-mãe: obrigatório é avisar, não travar"). Se é isso mesmo, está decidido e eu sigo — só quero sua palavra escrita, porque foi você quem pediu "forçar o planejamento".
