# 02 — Funcionalidades, tela por tela

> Marcadores: **[GESTOR]** só o gestor vê · **[EXEC]** só o executivo vê · **[AMBOS]**
> **[ROTA]** = pertence ao módulo Rota/Mapa, **NÃO replicar** (ver `08-ESCOPO-SEM-ROTA.md`).

## Navegação por papel

| Aba (id da view) | Rótulo GESTOR | Rótulo EXEC | Visível para |
|---|---|---|---|
| `viewMeuPainel` | — | **Hoje** (home) | EXEC |
| `viewCockpit` | **Time** (home) | — | GESTOR |
| `viewDaily` | **Daily & Ritmo** | **Minha Daily** | AMBOS |
| `viewResumo` | **Semana** | — | GESTOR |
| `viewAgenda` | **Agenda** | **Rota** + **Agenda** (2 botões, 1 view, muda por `subview`) | AMBOS |
| `viewMeuFunil` | — | **Meu funil** | EXEC |
| `viewRotas` **[ROTA]** | **Rotas** | — | GESTOR |
| `viewLeadsPraca` | **Prospecção** | *(era sub-aba da Rota)* | GESTOR (ver nota) |
| `viewPDIs` | **Pessoas** | **Desenvolvimento** | AMBOS (com seção de Coaching só para o gestor) |

**Nota**: para o executivo, a Prospecção virou o "deck" ao lado do mapa da Rota. Como a Rota
sai do escopo, **no sistema novo a Prospecção precisa voltar a ser aba própria do executivo**,
mostrando só a praça dele.

Fora das abas, sempre presentes: **sino de avisos** (drawer da direita, com badge de não
lidos) e **drawer de perfil** (avatar no topo direito).

Regras de home: gestor abre em `viewCockpit`; executivo abre em `viewMeuPainel` — **nunca** no
cockpit coletivo, e nunca dependendo do dia da semana.

---

## [EXEC] Hoje — `renderMeuPainel()`

Responde: *"O que eu faço até as 9h?"*

**Banner escuro**: saudação por hora do dia + nome + 👋, diagnóstico em **uma frase** derivada
dos dados reais (ex.: "Agenda vazia e **2 leads acima do SLA** — seu dia começa por eles"),
semáforo pessoal e CTA "Fechar meu plano do dia →".

**Blocos:**

1. **Suas 3 ações de hoje** (`buildAcoesHojeHTML`) — card com borda vermelha. As 3 ações são
   **derivadas**, nunca digitadas: travados ordenados por dias em atraso → quentes → conta-alvo.
   Checkboxes **clicáveis** com toggle otimista persistido (`acaoHojeKey(ownerId, id)`);
   marcada = fundo verde-claro + texto riscado; contador 0/3 → 3/3; ao completar, o CTA do
   banner vira "Plano cumprido 🎉". **As 3 ações viram o `prometido` da Daily.**
2. **Ontem P×R** — 3 barras (visitas / avanços / propostas), prometido vs. realizado, cor por
   resultado (verde bateu / âmbar parcial / vermelho zerou) + fecho em uma frase que aponta a
   ação de hoje + rodapé com 🔥 sequência e pontos.
3. **Quentes e travados** — travados com `border-left` vermelho e badge "+N dias"; quente em
   destaque com "Fechar →".
4. **Roteiro de hoje** (`buildFilaDeHojeHTML`) — fila ordenada por `slaRatio` (quanto o lead
   passou do SLA da etapa, em %), com checkbox persistido por semana (`roteiroCheckKey`).
5. **Insights automáticos** (`buildInsightsAutomaticosHTML`) — frases calculadas: nº de
   travados graves (`slaRatio >= 200`), aderência da Daily, etapa que concentra o estoque.
6. **Vitórias da semana** (`buildVitoriasHTML`) — ganhos com MRR.
7. **Seu mês** — card vermelho hero: "N fechados · R$ X MRR", barra de progresso branca,
   posição no time, frase de empurrão.
8. **Ranking da semana** — "Você" destacado.
9. **Seu plano com o gestor** — compromissos do 1:1 (checkbox **espelhado com o gestor**,
   tabela `pdi_compromissos`), "ver tudo →" abre Desenvolvimento.
10. **Recado do seu gestor** — últimas 3 linhas de `sugestoes_planos` (borda violeta).
11. **Plano do dia** (`montarPlanoDoDia`) — prioridades 1-2-3, bloqueios, observação,
    autosave em `planos_diarios`, streak de dias úteis com plano fechado.
    **[ROTA]** as partes de `local_atuacao` + mapa + contas-alvo saem; o resto fica.

---

## [GESTOR] Time (Cockpit) — home do gestor

Responde: *"Onde eu ajo hoje?"*

1. **Título + faixa de KPIs** (`renderCockpitTitleRow`, `renderKpiStripHero`) — semana ISO,
   em aberto, fechados/meta, travados, taxa de avanço com delta ▲▼, dailies fechadas hoje.
2. **Funil por etapa** (`renderFunilBarras`) — barras horizontais de 22px, contagem dentro da
   barra, % à direita, **nota de gargalo** em box. Clique na etapa → modal com os leads
   daquela etapa (`openStageModal`).
3. **Leads quentes** (`renderLeadsPrioritarios`) — leads avançando de etapa **e** dentro do
   prazo. Filtrados por `slaDays` da etapa.
4. **Vendas do mês** (`renderVendasMes`) — tabela por executivo: clientes fechados + MRR.
   O MRR é **editável inline** e escreve de volta no HubSpot via `POST /api/atualizar-mrr`
   (`wireVendasMesEdicao`).
5. **Por executivo** (`renderRepsList`) — uma linha por pessoa: avatar-iniciais, praça, tag de
   alerta, abertos, travados (colorido), Daily hoje, fechados, barra de meta. **Clique abre o
   dossiê inline** logo abaixo (`renderCockpitDossieInline`) com scroll suave.
6. **Dossiê do executivo** — gargalo (escrito pela IA), boas práticas, travados com SLA,
   quentes, compromissos do 1:1, aderência da Daily, links "Abrir no HubSpot ↗".
7. **Onde agir hoje** (`renderDecisoes`) — **fica estacionado na Daily**, ver abaixo.

---

## [AMBOS] Daily & Ritmo / Minha Daily — `renderDaily()`

Responde: *"Quem prometeu, quem cumpriu, quem está vazio?"* (gestor) ·
*"Cumpri o que prometi?"* (executivo)

### Modelo de dados da Daily

Tabela `dailies`, uma linha por `(owner_id, data)`:
`prometido_visitas/avancos/propostas` · `realizado_visitas/avancos/propostas/fechamentos` ·
`nota_campo` · `compromisso_amanha`.

**O realizado NÃO é digitado** — chega sozinho do HubSpot (o cron grava o snapshot do dia).
O executivo só confirma e comenta.

### Cálculos derivados (nunca chumbados)

```js
pontosDoDia   = visitas*10 + avancos*25 + propostas*40 + fechamentos*100
totalPrometido = prometido_visitas + prometido_avancos + prometido_propostas
totalRealizado = visitas + realizado_avancos + realizado_propostas
bateuPrometido = totalPrometido > 0 && totalRealizado >= totalPrometido
calcularSequencia = dias úteis consecutivos (para trás) com bateuPrometido, máx. 60 dias
```

`visitasDoRow()` prefere o valor **derivado do HubSpot** (`visitasReaisDoOwnerNoDia`) e só cai
para `realizado_visitas` do banco se o derivado for `null` — assim uma escrita do robô que
falhou à noite não trava o placar nem as conquistas.

### Conquistas (`calcularConquistas`) — só desbloqueiam com dado real

| Ícone | Título | Condição |
|---|---|---|
| 🔥 | Sequência de 4 | `seq >= 4` |
| 🔥🔥 | Sequência de 10 | `seq >= 10` |
| 🎯 | Palavra é palavra | bateu o prometido em todos os 5 dias úteis |
| 💎 | Dia perfeito | bateu visitas **E** avanços **E** propostas no mesmo dia |
| 📈 | Recorde pessoal | mais propostas hoje que em qualquer um dos 9 dias úteis anteriores |
| ⚡ | Destravador | zero leads com SLA estourado agora |
| 🏆 | Meta do mês | `ganhosSemana >= 2` (ritmo compatível com a meta) |
| 📝 | Daily de ferro | preencheu a Daily nos últimos 10 dias úteis sem falhar |
| 🥇 | Topo da praça | mais fechamentos da semana entre quem está na mesma praça |

### [GESTOR] Placar da Daily

Tabela de **uma linha por executivo** — é o roteiro da reunião das 9h:
prometido hoje · ontem P×R (✓ / ◐ / ✗) · sequência 🔥 · pontos · status pill ·
linha de execução (visitas feitas, marcadas, avanços com nomes, propostas com nomes) ·
resumo do plano do dia dele (prioridades, bloqueios) expandível.
Linhas pendentes com fundo vermelho-claro. Exceções primeiro, com "Cobrar plano →".

Blocos que **migraram do Cockpit para a Daily** (são o insumo da reunião das 9h):
**Onde agir hoje** (`renderDecisoes`). Ficam estacionados em `#dailyBlocosParcados` (hidden)
e a `renderDaily` **move o nó** para o slot — assim o executivo nunca os vê, já que a view
é compartilhada.

**`renderDecisoes()` — os 3 sinais**, nesta ordem de prioridade:
1. SLA estourado por etapa aberta, **nomeando quem concentra** os casos (`nomesQueConcentramSla`).
2. Queda real na taxa de avanço do time (só gestor — é métrica de time).
3. Aderência da Daily abaixo de 75%, por executivo.

### [GESTOR] Alerta de sincronização

Se `data/sync-status.json` tem falhas da última rodada do robô, a Daily mostra um aviso — o
gestor precisa saber que o número pode estar errado antes de cobrar alguém.

### [EXEC] Minha Daily

- **Você contra o que você prometeu** — barras de 10px, hoje.
- **Meu plano de hoje** — herdado das 3 ações do Hoje.
- Campo de texto "o que travou / o que rendeu" → vira insumo da leitura do gestor.
- **Sua semana** — 5 células (✓ cumpriu verde / ◐ parcial âmbar / hoje tracejado).
- **Pódio e conquistas** com incentivo ("feche hoje e complete a semana cheia 🏆 +15 pts").

---

## [GESTOR] Semana (Resumo Semanal) — `renderResumoSemanal()`

Responde: *"O que mudou e o que eu faço?"*

- **Janela rotulada** sempre visível (ex.: "janela: 01–07/08").
- **A leitura da semana** — prosa escrita pela IA (`resumo-semanal.json.resumoGeral`),
  14px/1.7, editável.
- **Como agir** — card vermelho, 3 ações numeradas (`comoAgir`).
- **Semana × anterior** — deltas de 24px ▲▼, **coloridos por bom/ruim** (não por sinal: mais
  "perdidos" é ruim mesmo sendo ▲). Função `deltaHtml(atual, anterior, inverter)`.
- **Cards clicáveis** de ganhos / reuniões / quentes → abrem a lista dos leads.
- **Leitura por executivo** — uma linha por pessoa, urgentes em vermelho-claro; o parágrafo
  individual (`porRep[ownerId].resumoIndividual`) abre no drawer.
- **Onde atacar esta semana (por praça)** — usa `weekly-raw.json.snapshotReps`; calcula
  veredito e "runway" por praça a partir do backlog de prospecção pendente.
- **Pódio da semana + Meta do mês** (`renderPodioMeta`) — cartão consolidado. Fica **fora**
  de `#resumoContent` de propósito: `renderResumoSemanal` reescreve aquele nó inteiro via
  `innerHTML` e apagaria o cartão a cada render.

---

## [AMBOS] Agenda — `renderAgenda()`

Responde: *"Minha semana está planejada?"*

Fonte: `data/hubspot.json.agenda.itens` — mistura de **meetings**, **tasks** e **notes** do
HubSpot, normalizados por `agendaNormalizar()` numa estrutura única de evento.

### Normalização (`agendaDoHubspot*`)

Cada tipo vira um evento com `{ id, tipo, titulo, inicio, fim, ownerId, leadNome, criadoEm }`:
- **Meeting** → `hs_meeting_title/body/start_time/end_time`.
- **Task** → `hs_task_subject/body/status/type`. O app de campo cria tarefas no padrão
  `"Visita - <restaurante>"` — `agendaTipoDoTexto()` reconhece esse padrão e classifica.
- **Note** → `hs_note_body` + timestamp; nota de campo vira registro de visita.

Helpers importantes: `agendaParaBRT()` (tudo em America/Sao_Paulo), `agendaEhPrime()`
(horário nobre), `agendaDiaUtil()`, `agendaMesmoLead(a,b)` (comparação tolerante de nomes,
sem acento e sem pontuação), `agendaNomeDoLead()` (extrai o nome do lead do texto livre).

### Blocos

- **Grade da semana** própria (`agendaGradeCard`, `agendaGradeHoras`) — desenhada à mão, não
  é FullCalendar (removido em 11/08: eram ~200KB de CDN). Colunas seg–sex (sáb condicional),
  linhas de hora, chips por evento.
- **Buracos da semana** (`agendaBuracos`) — dias sem compromisso; hoje vazio = vermelho
  "Preencher →"; próxima semana = âmbar "Planejar →".
- **[GESTOR] Matriz do time** (`agendaMatrizTime`, `agendaGradeTime`) — heatmap de células:
  verde escuro 3+ compromissos, verde claro 1–2, cinza vazio, **hoje-vazio tracejado vermelho**.
- **Quentes sem compromisso** (`agendaQuentes`, `agendaQuentesLinhas`) — leads quentes que não
  aparecem em nenhum evento da semana.
- **Agendador rápido** (`abrirAgendadorRapido`) — popover no clique de uma célula vazia:
  escolhe lead + hora, cria a tarefa/reunião. **[GESTOR]** pode sugerir na agenda do executivo
  (marcador de sugestão → `POST /api/confirmar-sugestao-gestor`).
- **Ficha do compromisso** (`abrirFichaCompromisso`) — drawer com o evento, o lead, o histórico
  do cliente e ações.
- **Placar de agendamento** (`agendaPlacarRep`, `agendaStreak`) — quantos compromissos foram
  criados com antecedência real (`inicio > criadoEm`).

---

## [EXEC] Meu funil — `renderMeuFunil()`

Responde: *"Onde estou presa?"*

- **Faça isso hoje** — até 3 cards de ação (`montarAcoesMeuFunil`).
- **Três colunas por temperatura** — quentes / mornos / frios.
- **Funil pessoal** — mesmas barras do gestor, SLA por etapa à direita, nota do gargalo.
- **Travados — resolver primeiro** — borda vermelha; cada travado com 3 ações:
  Avançar / Registrar motivo / **[ROTA]** ＋rota.
- **Tabela de todos os leads abertos** — filtros por etapa; colunas lead / etapa / dias /
  próximo passo; dias acima do SLA em vermelho.
- **Padrão de trabalho** (`padraoTrabalhoLinhasHTML`) — leads sem próximo passo definido,
  contagem de travados, aderência da Daily.
- **Última nota do HubSpot** por lead (`construirIndiceNotas`, `ultimaNotaHTML`) e
  **selo de SLA** (`seloSlaHTML`, mostra "2× o prazo" quando `slaRatio >= 200`).
- **Contas-alvo** carregadas do Supabase — leads da carteira sem negócio aberto.

---

## [AMBOS] Prospecção — `renderProspeccaoNova()`

Responde: *"O que eu aprovo hoje?"* (gestor) · *"Quais contas eu ataco esta semana?"* (exec)

Fonte: tabela `leads_prospeccao` (staging). **Nada vira Company/Deal automaticamente** — só
quando alguém confirma manualmente.

### Régua de qualidade (decisão de produto explícita)

- **A nota NÃO define fit comercial.** O único corte de potencial é **volume de avaliações**.
  A nota fica na ficha como contexto, mas nunca filtra, ordena ou desempata.
- Ordenação da fila: `avaliacoes DESC`, desempate por nome.
- `prospeccaoEhRedeGrande()` — nomes em `data/redes-excluidas.json` saem da fila recomendada
  e vão para "Revisar escopo" (não somem).
- `prospeccaoFazSentido()` — categoria compatível com foodservice.
- Fontes: Outscraper, Google Places, TripAdvisor, iFood, Casa dos Dados, Manual.
  **Casa dos Dados é isenta do corte de avaliações** — empresa aberta há 10 dias não tem 100
  avaliações; é lead novo, não lead ruim.

### Blocos

- **[GESTOR] Cards por praça** — contagem pendente âmbar; em dia = verde ✓. Com veredito e
  runway por praça (quantas semanas de backlog restam no ritmo atual).
- **Fila de aprovação** — filtros em pills (todas / praça / sem telefone), tabela com
  checkbox, nome + badge "sem telefone", praça, avaliações, executivo, origem.
  Ações em lote: aprovar seleção / devolver para revisão. Paginação.
- **[EXEC] Novas desta semana** + **backlog** com status por lead:
  `pendente` · `atribuido` · `na rota hoje` · `visitada` · `virou lead` ✓ · `criado_hubspot`.
- **Progresso de ataque** — uma barra + "N viraram lead — X%". Sem gráfico decorativo.
- **Ficha do lead** (`abrirFichaProspeccaoDrawer`) — drawer com contato, endereço, horário,
  fonte, e o botão **"Criar empresa no HubSpot"** (`POST /api/criar-empresa-prospeccao`).
- **Importação por planilha** (`abrirImportacaoProspeccao`) — carrega SheetJS sob demanda,
  mapeia cabeçalhos, envia para `POST /api/importar-leads`.
- **Roteamento por território** (`donoDoTerritorio(bairro, municipio)`) — decide o
  `responsavel_owner_id` na importação.
- **[ROTA]** "＋ rota", "na rota ✓" e **[ROTA]** "Novidades de mercado" (Casa dos Dados) saem.

---

## [AMBOS] Pessoas / Desenvolvimento — `renderPDIs()`

Responde: *"Quem precisa de mim no 1:1?"* (gestor) · *"Como eu evoluo?"* (executivo)

### [GESTOR] Pessoas

- **Grid do time ordenado por urgência**: urgentes com borda vermelha + fundo vermelho-claro +
  "Preparar 1:1 →"; em acompanhamento com card claro + "Abrir dossiê →"; ok em linha compacta.
- Cada card: **gargalo OU boa prática** + status de PDI/1:1.
- **Roteiro de coaching** — pauta derivada do gargalo real; vira compromissos com checkbox
  **espelhados no executivo** (`pdi_compromissos`).
- **Coaching** (`renderCoaching`) — seção embutida, **privada, só o gestor vê**:
  análise semanal e mensal escritas pela IA (`analise_individual_semanal` / `_mensal`),
  badge de tendência, ações individuais, e o campo para mandar um **recado ao executivo**
  (`sugestoes_planos`, aparece no Hoje dele).
- **Histórico de 1:1** (`carregarUmAUm`) — timeline da tabela `um_a_um`.

### [AMBOS] Documentos de PDI

Upload de PDF para o bucket `pdi-documentos`, registro em `pdi_documentos`
(`owner_id, titulo, caminho_arquivo, nome_arquivo, autor, compromissos, data`), listagem por
data desc, download por URL assinada, exclusão com modal de confirmação.

### [EXEC] Desenvolvimento

- **Diagnóstico escrito pela IA** para ele — manchete + números da semana + delta vs. semana
  anterior por etapa.
- **O plano em 3 partes** — o que manter, o que corrigir, o que aprender.
- **Compromissos do 1:1** com checkbox espelhado em tempo real com o gestor.
- **PDI ativo** — metas quantitativas calculadas do HubSpot, qualitativas marcadas no 1:1,
  vencimentos coloridos.

---

## [AMBOS] Avisos / Comunicados — `renderAvisos()`

- **Sino no topbar** com badge de não lidos (`atualizarSinoAvisos`); abre um **drawer** da
  direita (`abrirAvisosDrawer`). O conteúdo vive num nó único (`#avisosContent`), renderizado
  só quando o drawer está aberto.
- **Lista estilo inbox**: não lidos primeiro com fundo vermelho-claro + "Confirmar leitura";
  lido = ponto cinza. Fixado ganha ícone de sino âmbar e prazo.
- **[GESTOR]** contador "n/N leram" (vermelho <50%, âmbar <100%, verde tudo ✓) e painel
  lateral de **leitura pendente** com avatar + "lembrar →" individual.
  `linhaLeituraComunicado()` é o helper único: gestor vê "visto por n/N", executivo vê
  "lido por você" ou "novo".
- **[GESTOR] Novo comunicado** — modal com tipo (geral / atualização / urgente), título,
  mensagem e **imagem opcional** (bucket `comunicados-imagens`, servida por URL assinada de 1h).
- Aviso com ação ganha "＋ virar item do plano".

---

## [AMBOS] Perfil — `abrirPerfilDrawer()`

Drawer da direita: cartão escuro com avatar 88px, nome, e-mail, pill do papel.
- **Progresso** (`montarPerfilProgresso`) — números do mês, visitas registradas na semana
  (mesma fonte da Agenda), dias úteis até hoje, sequência.
- **Medalhas com a prova do lado** — cada conquista mostra o número que a desbloqueou.
- Troca de **foto de perfil** → bucket `avatares`, registro em `perfis`, exibida por
  `avatarHTML()` (foto ou inicial em círculo vermelho) em todo o sistema.
- **Sair da conta**.

---

## Componentes transversais

| Componente | Função | Comportamento |
|---|---|---|
| **Ficha do lead** | `abrirFichaLeadFunilDrawer`, `fichaLeadFunilBodyHTML` | **Um componente**, reutilizado em quentes, travados, funil, prospecção e nos dois papéis. Nome, etapa + SLA, mini-trilha do funil, última nota, contato, endereço, ações, "Abrir no HubSpot ↗". Gestor ganha "cobrar executivo". |
| **Modal de etapa** | `openStageModal`, `renderStageModalBody` | Clique numa barra do funil lista os leads daquela etapa. |
| **Todos os travados** | `abrirTodosTravados` | Lista consolidada de `slaBreach` por etapa. |
| **Toast** | `mostrarToast(msg, tipo)` | Feedback de escrita. |
| **Modal de confirmação** | `abrirModalConfirmacao({titulo, corpoHTML, confirmarLabel, aoConfirmar})` | Fecha no X, no overlay e no `Esc`. |
| **Timeout de rede** | `comPrazoGlobal(promessa, ms, rotulo)` | Toda chamada externa tem prazo — nunca spinner infinito. |
| **Token de sessão** | `tokenDeSessaoGlobal()` | Pega o access token atual do Supabase para as rotas `/api/*`. |
| **Avatar** | `avatarHTML(email, nome, size, variant)` | Foto do bucket ou inicial. |
| **Semáforo** | `saude` em `montar-dados.js` | `pct = travados/abertos` → **ok <15% · atenção <35% · crítico ≥35%**. |
| **Health badge** | `preencherHealthBadge` | Badge compacto de uma linha junto do "HubSpot atualizado em…" — nunca um banner repetido em cada aba. |
| **Idade do dado** | `preencherCabecalhoRodape` | Calcula horas desde o último sync; passou do esperado, avisa em vermelho. |

## Regras de produto inegociáveis

1. **Três níveis por tela**: Nível 1 = decisão imediata (acima da dobra, 900px);
   Nível 2 = aprofundamento (scroll); Nível 3 = detalhe operacional (**sempre em drawer de
   480px pela direita, nunca inline**). Nenhuma tela mostra os três ao mesmo tempo.
2. **Nada de dado removido** — o que sai da tela vai para drawer ou expansão.
3. **Vermelho só para ação e seleção.** Estado usa verde/âmbar/vermelho como *pill + texto*,
   nunca fundo inteiro.
4. **1 bloco escuro por tela** — o banner do topo. Nada mais é escuro.
5. **Janela de tempo sempre rotulada** junto ao número ("taxa de avanço · semana").
6. **Números vêm do banco, nunca hardcoded.** Se o dado não existe ainda, mostrar estado
   vazio honesto — não inventar valor plausível.
7. **Não declarar sincronização sem backend funcionando.** (Ver o adaptador
   `PlanoSyncExpogo`: `disponivel: false`, e o `enviar()` lança erro de propósito.)
8. Não transformar índice de prioridade em probabilidade. Sem gráficos decorativos.
