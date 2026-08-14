# 10 — Plano de implementação (8 fases)

Roteiro para o Claude Code do projeto de destino. Cada fase é entregável e testável sozinha.
**Não pule para a fase seguinte com a anterior quebrada** — o sistema é uma cadeia: dado
errado no fetch vira número errado na tela e texto errado da IA.

---

## Fase 0 — Decisões antes de escrever código

Responda antes de começar:

1. **Stack do front**: manter HTML/CSS/JS vanilla em arquivo único (mais fiel, mais simples de
   portar) ou migrar para framework? Se migrar, o resultado visual e comportamental deve ser
   **idêntico** aos protótipos.
2. **CRM**: é HubSpot também? Se for outro, `03-HUBSPOT.md` vira a especificação **semântica**
   (o que buscar e por quê) e você reescreve as consultas.
3. **Pipeline e etapas**: quais são os IDs, labels e **SLA em dias úteis** de cada etapa?
   Isso é a espinha dorsal — sem SLA definido, não há "travado", não há semáforo, não há
   "onde agir hoje".
4. **Time**: lista de `{ email, role, ownerId, nome }`.
5. **Metas**: meta mensal do time e por executivo.
6. **Decisões de escopo** de `08-ESCOPO-SEM-ROTA.md` §5 (tarefa de visita, clientes ativos,
   novidades de mercado).

---

## Fase 1 — Fundação: auth, shell protegido e papéis

**Entregável**: alguém loga, vê o shell com o nav do seu papel, e o "ver código-fonte" não
mostra nenhum dado do CRM.

1. Projeto Supabase novo; auth por e-mail/senha; usuários criados.
2. `data/usuarios.json` com o mapeamento e-mail → papel + `ownerId`.
3. Tela de login com os 3 fluxos: entrar, esqueci a senha, definir nova senha.
4. `build.js` gerando o shell com placeholders vazios **do tipo certo**.
5. `api/dados.js` com validação de sessão + 403 para não cadastrado.
6. `aplicarVisaoPorPapel()` — nav diferente por papel, home do papel como **fallback**
   (lembre: `onAuthStateChange` dispara mais de uma vez).

**Teste de aceite**: abrir o HTML publicado sem logar e confirmar que `<script id="cockpit-data">`
não tem nenhum nome de cliente. Logar como executivo e confirmar que as abas de gestor não
existem no DOM visível.

---

## Fase 2 — Pipeline de dados do CRM

**Entregável**: `data/hubspot.json` gerado por comando, com números que batem com o CRM.

1. `fetch-hubspot.js`: KPIs, funil por etapa, `funilLeads`, temperatura, `reps`, `vendasMes`.
2. **Copie exatamente** as regras de `03-HUBSPOT.md`:
   - fuso Brasília em toda conta de "hoje"/"mês"/"semana";
   - semana **civil** (segunda 00:00), nunca rolante;
   - `daysInCurrentStage` = `max(entered, notes_last_updated, createdate)` em **dias úteis**;
   - **nunca** `hs_lastmodifieddate`;
   - rate limit com retry e paginação.
3. `hubspot-previous.json` (snapshot de KPIs para os deltas ▲▼).
4. `montar-dados.js` com `montarDadosCompletos()` + o semáforo (`<15% ok`, `<35% atenção`,
   `≥35% crítico`).
5. `filtrarParaPapel()` — **com atenção ao `snapshotReps`**, que o spread deixa vazar.

**Teste de aceite**: conferir 3 números na mão contra o CRM (leads em aberto, fechados no mês,
leads travados). Logar como executivo e inspecionar a resposta de `/api/dados` procurando por
nome de cliente de colega — **não pode haver nenhum**.

---

## Fase 3 — Telas de funil (Time + Meu funil)

**Entregável**: gestor vê o time; executivo vê o próprio funil.

- Faixa de KPIs com deltas · funil por barras com nota de gargalo · leads quentes ·
  tabela por executivo com dossiê inline · vendas do mês com **edição inline de MRR**
  (`POST /api/atualizar-mrr`).
- **Ficha do lead como componente único** desde já — ela é reutilizada em 5 lugares. Fazer
  certo agora economiza retrabalho nas fases 5 e 6.
- Modal de etapa (clique na barra do funil) e "todos os travados".

**Teste de aceite**: a mesma ficha de lead abre de quentes, de travados, do funil e da
prospecção, com o mesmo layout.

---

## Fase 4 — Daily gamificada

**Entregável**: o ritual das 9h funciona ponta a ponta.

1. Tabela `dailies` + `upsert` com `onConflict: 'owner_id,data'`.
2. Escrita do **realizado pelo robô** (`gravarSnapshotDailyVerificado`, hoje **e** ontem, com
   conferência pós-escrita) + `data/sync-status.json`.
3. `pontosDoDia`, `bateuPrometido`, `calcularSequencia`, `calcularConquistas` — **exatamente**
   as fórmulas de `02-FUNCIONALIDADES.md`.
4. `visitasDoRow()` preferindo o derivado do CRM sobre o valor gravado.
5. Placar da Daily do gestor (uma linha por executivo) + Minha Daily do executivo.
6. `renderDecisoes()` — os 3 sinais de "Onde agir hoje", estacionados na Daily.

**Teste de aceite**: prometer 3 visitas, registrar 3 no CRM, rodar o fetch, e ver a Daily
marcar como cumprido, somar 30 pontos e avançar a sequência.

---

## Fase 5 — Agenda

**Entregável**: a semana de cada um, com buracos visíveis e agendamento funcionando.

1. `fetchAgenda()` — meetings + tasks + notes.
2. `enriquecerAgendaComNegocio()` → `lead_owner_id`. **Sem isso o filtro por papel come
   compromissos reais** (17 sumiam na base original).
3. `agendaNormalizar()` + os helpers (`agendaParaBRT`, `agendaMesmoLead`, `agendaTipoDoTexto`,
   `agendaNomeDoLead`).
4. Grade própria da semana (não use biblioteca de calendário — a grade à mão é ~200KB mais
   leve e carrega a identidade visual).
5. Buracos da semana · matriz do time (heatmap) · quentes sem compromisso.
6. Agendador rápido + sugestão do gestor (`POST /api/confirmar-sugestao-gestor`) +
   criação da tarefa de visita.

**Teste de aceite**: gestor e executivo abrem a mesma semana e veem **exatamente os mesmos
compromissos** daquela pessoa.

---

## Fase 6 — Prospecção

**Entregável**: fila de leads que vira company no CRM com confirmação manual.

1. Tabela `leads_prospeccao`.
2. `POST /api/importar-leads` — normalização, dedupe paginado, régua de qualidade.
   **A nota não filtra. Só `avaliacoes` filtra.** Casa dos Dados isenta do corte.
3. Aba própria para os dois papéis (ver `08` §6.1): gestor vê a fila do time com aprovação em
   lote; executivo vê a praça dele.
4. `POST /api/criar-empresa-prospeccao` com dedupe por nome e `409` informativo.
5. Importação por planilha (SheetJS sob demanda) + roteamento por território.

**Teste de aceite**: importar a mesma planilha duas vezes e confirmar que a segunda importa
**zero** leads novos.

---

## Fase 7 — Pessoas, PDI, 1:1 e Avisos

**Entregável**: o lado humano do sistema.

1. `pdi_compromissos` com o **espelhamento gestor ↔ executivo** e a chave
   `(owner_id, versao_analise)`.
2. `pdi_documentos` + bucket privado com URL assinada.
3. `um_a_um` (histórico) e `sugestoes_planos` (recado do gestor → "Hoje" do executivo).
4. `comunicados` + `comunicados_lidos` + sino com badge + drawer + imagem em bucket privado.
5. Perfil: bucket `avatares`, `perfis`, `avatarHTML()`, medalhas com a prova do lado.

**Teste de aceite**: gestor marca um compromisso; o executivo vê marcado ao recarregar.

---

## Fase 8 — IA e automações

**Entregável**: o sistema se atualiza sozinho e avisa quando falha.

1. Cliente Claude com o **padrão de robustez completo** (`06-IA-E-AUTOMACOES.md`):
   retry em 429/529/5xx, retry em resposta sem bloco de texto, retry em JSON malformado,
   `extrairJSON` tolerante a cerca de código.
2. `generate-daily-gargalo` — e a regra do que ele **nunca toca** (`compromissos`,
   `_atualizado_em`).
3. `generate-weekly-summary` — resumo de time (**sem citar nomes**) + individual em 2ª pessoa
   + fechamento mensal com o mesmo formato de saída.
4. `generate-individual-analysis` — idempotente por `DELETE` + rede de segurança dos
   compromissos.
5. Os 3 workflows do GitHub Actions, com **push resiliente com rebase**, `git add` guardado
   por `[ -f "$f" ]`, Issue em falha e `continue-on-error` nas fontes instáveis.
6. **Falha de IA visível na tela** — `_falhasIA` no JSON de saída + `sync-status.json` no
   alerta da Daily.

**Teste de aceite**: quebre a `ANTHROPIC_API_KEY` de propósito, rode o workflow, e confirme
que (a) o resto do pipeline continua, (b) abre uma Issue, (c) a tela mostra a falha em vez de
apresentar texto velho como se fosse novo.

---

## Erros do original que você não precisa repetir

| Erro | Consequência real | Como evitar |
|---|---|---|
| `hs_lastmodifieddate` como "última atividade" | Lead parado há 13 dias aparecia como "0 dias"; SLA estourado mascarado no time inteiro | Use `notes_last_updated` |
| Datas em UTC | Entre 21h e 23h59 a janela invertia e a API voltava vazio; visitas do dia sumiam | Converta para Brasília **antes** de extrair ano/mês/dia |
| Semana rolante de 7 dias com rótulo "esta semana" | Número certo, rótulo errado | Semana civil (segunda 00:00) |
| Model string inválido da Claude | 4 dias de textos congelados, invisível | Falhe alto: `_falhasIA` gravado no output e exibido na tela |
| IDs de etapa crus no prompt | A IA escreveu "etapa 1395880470" no texto do executivo | Traduza IDs → labels antes do prompt |
| Campos não copiados para o contexto do prompt | "0 ganhos, 0 de 10 fechados" para todo mundo | Teste o prompt com dados reais de 2 pessoas diferentes |
| `spread` do `resumoSemanal` deixando `snapshotReps` passar | Executivo recebia funil, travados e meta do time inteiro | Corte explícito, e teste inspecionando a resposta da API |
| Filtro da agenda só por `hubspot_owner_id` | 17 compromissos reais sumiam para o executivo | Fallback em `lead_owner_id` |
| `activateTab` incondicional no login | `onAuthStateChange` dispara 2× e atropela a navegação restaurada | Home como fallback |
| `git add` em arquivo que ainda não existe | Workflow inteiro falhava com "pathspec did not match" | `[ -f "$f" ] && git add "$f"` |
| Dados do CRM embutidos no HTML público | CRM inteiro visível sem login | Shell protegido desde o dia 1 |
| Duplicar HTML de um bloco compartilhado entre abas | Perdia o wiring de eventos | **Mova o nó** no DOM |
| Renderizar dentro de um nó que outra função reescreve por `innerHTML` | O cartão sumia a cada render | Mantenha fora do nó reescrito |

## Princípios que valem mais que qualquer linha de código

1. **Número vem do banco. IA escreve texto.** Nunca o contrário.
2. **Se o dado não existe, mostre estado vazio honesto** — não invente valor plausível.
3. **Rotule a janela de tempo junto do número**, sempre.
4. **Rotule a idade do dado** e avise em vermelho quando estiver velho.
5. **Não declare integração que não existe.** (`PlanoSyncExpogo.disponivel = false`, e o
   `enviar()` lança erro de propósito.)
6. **Fail-closed**: sem configuração, a rota se recusa a operar.
7. **Um componente por conceito.** A ficha do lead é uma só. O drawer é um só.
8. **Toda chamada externa tem prazo** — nunca spinner infinito.
