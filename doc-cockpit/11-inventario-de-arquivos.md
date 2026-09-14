# 11 — Inventário de arquivos do projeto original

Mapa para consulta: quando precisar do detalhe exato de uma regra, este arquivo diz onde
ela vive. Tamanhos aproximados.

## Raiz

| arquivo | o que é |
|---|---|
| `README.md` (16 KB) | handoff de design do redesenho (Gestor + Executivo). Descreve a **prancha**, não o CSS atual |
| `vercel.json` | só o `ignoreCommand` → `scripts/vercel-deve-buildar.js` |
| `support.js` (69 KB) | runtime **dos protótipos HTML**. **Ignorar na implementação** |
| `*.html` (14 arquivos) | protótipos navegáveis de design, por tela. Referência visual, não código de produção |

Os protótipos: `cockpit-gestor-hi-fi`, `hoje-executivo-hi-fi`, `daily-e-ritmo-gestor`,
`semana-gestor`, `pessoas-gestor`, `prospeccao-gestor`, `avisos-gestor`,
`minha-daily-executivo`, `meu-funil-executivo`, `rota-e-agenda-executivo`,
`prospeccao-executivo`, `avisos-executivo`, `desenvolvimento-executivo`,
`drawers-nivel-3`.

## `template/` e `public/`

| arquivo | o que é |
|---|---|
| `template/cockpit.template.html` (3,9 MB · 62.178 linhas · ~955 funções) | **o produto inteiro**: CSS, markup das 12 views e todo o JavaScript. Tem `{{DATA_JSON}}` |
| `public/index.html` (2,4 MB) | **gerado** pelo build. Não editar |
| `public/assets/` | logo e imagem do hero |

Como navegar as 62k linhas:
```
1–220        :root (tokens) e reset
220–9.500    CSS (por bloco/tela, com a data e o motivo de cada mudança)
9.600–9.780  tela de login
9.690–9.710  a nav (12 botões, com os SVGs)
9.785–9.975  as 12 <div class="view">
10.160+      o <script> principal
```

## `api/` — 12 funções serverless

| arquivo | tamanho | papel |
|---|---|---|
| `dados.js` | 21 KB | **a rota central**: sessão → papel → DATA filtrado + `?recurso=` |
| `negocio-acao.js` | 3,8 KB | porta única (`op`) das ações sobre negócio |
| `criar-negocio.js` | 19 KB | cria Deal no HubSpot |
| `criar-nota-negocio.js` | 1,3 KB | **apelido** de `negocio-acao op:'nota'` (documentado para o PWA) |
| `criar-empresa-prospeccao.js` | 13 KB | cria **Company** a partir de `leads_prospeccao` |
| `desfazer-negocio.js` | 12 KB | apaga negócio criado por engano no Planejamento |
| `importar-leads.js` | 24 KB | recebe lote de leads raspados → `leads_prospeccao` |
| `buscar-leads.js` | 7 KB | ponte gestor → Casa dos Dados → importação |
| `novidades-mercado.js` | 28 KB | empresas recém-abertas + contato por CNPJ |
| `restaurantes-proximos.js` | 10 KB | Overpass/OSM no servidor, com cache |
| `fila-pwa.js` | 8 KB | o que o app de campo não conseguiu subir |
| `hubspot-webhook.js` | 17 KB | assinatura + cooldown + `workflow_dispatch` |

## `lib/` — as regras compartilhadas

| arquivo | tamanho | a conta que mora ali |
|---|---|---|
| `realizado.js` | 18 KB | **o realizado do dia** — robô e tela ao vivo usam esta |
| `temperatura.js` | 5 KB | **a nota 0–100** do negócio |
| `territorios.js` | 35 KB | **quem é dono de cada conta-alvo** (3 chamadores) |
| `publicar-snapshot.js` | 8 KB | escrever em `cockpit_snapshot` + `snapshot_farol` |
| `osm.js` | 8 KB | consulta Overpass compartilhada (rota + prewarm) |
| `contato-cnpj.js` | 7 KB | extrai telefone/e-mail/sócio/endereço da consulta CNPJ |
| `hubspot-deal-guard.js` | 2,5 KB | confere pipeline e dono antes de escrever |

### `lib/acoes-negocio/` — os módulos da porta única
| arquivo | tamanho | `op` |
|---|---|---|
| `mudar-etapa-negocio.js` | 34 KB | `mudar-etapa` — inclui as propriedades obrigatórias por etapa |
| `criar-nota-negocio.js` | 21 KB | `nota` — nota, próximo passo, qualificação, parser de desfecho |
| `criar-tarefa-rota.js` | 21 KB | `tarefa-rota` |
| `atualizar-mrr.js` | — | `mrr` |
| `confirmar-sugestao-gestor.js` | — | `sugestao-gestor` |
| `ler-etapa-negocio.js` | — | `ler-etapa` (só leitura) |
| `marcador-do-plano.js` | — | helpers: origem, validação de dealId, linha do marcador |

## `scripts/` — 83 arquivos

### Produção (o que roda no CI/cron)
| arquivo | tamanho | o que faz |
|---|---|---|
| `fetch-hubspot.js` | **141 KB** | o robô do CRM — ids, SLAs, todos os cálculos |
| `montar-dados.js` | 40 KB | `montarDadosCompletos()` + `filtrarParaPapel()` |
| `build.js` | 8 KB | gera `public/index.html` e roda as guardas |
| `generate-weekly-summary.js` | 43 KB | resumo semanal por IA + `narrativas` |
| `fetch-weekly-comparison.js` | 17 KB | números da semana atual × anterior |
| `radar-semanal.js` | 43 KB | TAM das praças + notícias do setor |
| `backfill-casa-dos-dados.js` | 31 KB | sourcing semanal de contas-alvo |
| `backfill-google-places.js` | 14 KB | sourcing mensal dos mais bem avaliados |
| `backfill-dailies-semana.js` | 7 KB | recuperação manual de 7 dias |
| `build-playbook.js` | 34 KB | compila o playbook (MD → JSON) |
| `prewarm-osm.js` | 7 KB | aquece o cache de estabelecimentos |
| `cortar-comentarios.js` | 10 KB | tira comentário do publicado, com 4 provas |
| `publicar`/`vercel-deve-buildar.js` | 5 KB | decide se vale um deploy da cota |

### Desenvolvimento
`preview-local.js` (20 KB) · `servir-preview.js` · `mascarar.js` ·
`ler-time-do-banco.js` · `ler-politicas-do-banco.js` · `cota-de-deploy.js` ·
`css-morto.js` · `listar-funcao-orfa.js` · `remover-funcao-orfa.js` ·
`auditar-cliques.js` · `auditar-executivo.js` · `robo-local.cmd`

### Guardas (`checar-*.js`, 9)
`arraste-sem-ouvinte` · `backtick-em-comentario` · `botao-delegado-sem-ouvinte` ·
`chave-com-objeto` · `css-sem-markup` · `migrations-versionadas` · `ordem-declaracao` ·
`politica-do-front` · `time-nas-duas-fontes`

### Suítes (`testar-*.js`, 46)
As maiores, que é onde estão as regras mais densas:
`testar-nucleo.js` (115 KB) · `testar-kanban-etapas.js` (107 KB) ·
`testar-gestor-analitico.js` (88 KB) · `testar-pl6-contas.js` (76 KB) ·
`testar-playbook-v7.js` (46 KB) · `testar-semana-v4.js` (43 KB) ·
`testar-propostas.js` (39 KB) · `testar-minha-daily.js` (36 KB) ·
`testar-daily-le-a-grade.js` (35 KB)

Rodam **sem rede e sem navegador** — leem o template como texto e exercitam as funções.

### `check-scripts.js` (119 KB) — o portão do build
Roda ~20 verificações estruturais. As principais:
`conferirVariaveisCss` · `checarBreakpoints` · `checarDestinos` ·
`checarChamadasSemDeclaracao` · `checarPlacarDoExecutivo` · `checarSeletoresDeFiacao` ·
`checarModoTv` · `checarEspelhoDoProximoPasso` · `checarPisoDeToque` ·
`checarAlcanceDasVariaveis` · `checarAtoDoPlanoNaDaily` · `checarHoraDaTrava` ·
`checarMinhaDailySemCliqueMorto` · `checarDeclaracoesUsadas` · `checarGeradosForaDoGit` ·
`checarRotulosDeLista` · `checarHojeDaAgenda` · `checarGestorSemZeroInventado` ·
`checarPropriedadesEspelhadas` · `checarObrigatoriasEspelhadas` · `checarChavesDoEstilo` ·
`checarComentarioAbertoNoEstilo`

## `data/`

| arquivo | versionado? | o que é |
|---|---|---|
| `usuarios.json` | ✅ | o time: e-mail, papel, ownerId, nome |
| `metas.json` | ✅ | as três metas por executivo + ajustes de mês de competência |
| `temperatura.json` | ✅ | a régua da temperatura (pesos, rank, teto, faixas) |
| `cadencias.json` | ✅ | a régua de cadência (passos por situação) |
| `territorios.json` | ✅ | bairros/cidades por executivo |
| `leads-referencia.json` | ✅ | leads por praça |
| `redes-excluidas.json` | ✅ | redes que não entram na prospecção |
| `precificacao.json` | ✅ | planos e preços (aba Propostas) |
| `playbook-catalogo.json`, `playbook-prova.json`, `field-sales-playbook.md` (217 KB) | ✅ | conteúdo do playbook |
| `field-sales-playbook.compiled.json` (732 KB) | ✅ | playbook compilado (servido por `/api/dados?recurso=playbook`) |
| `supabase-config.json`, `maptiler-config.json` | ✅ | chaves públicas |
| `regioes-prewarm.json`, `expogo.json` | ✅ | apoio |
| `hubspot.json`, `hubspot-previous.json`, `narrativas.json`, `weekly-raw.json`, `resumo-semanal.json`, `sync-status.json` | ❌ **gitignored** | as 6 fontes do snapshot — vivem no Supabase |

## `supabase/`

`migrations/` (baseline + 28 migrations) · `APLICADAS.txt` · `README.md` ·
`POLITICAS.txt` · `TIME.txt` · `fora-de-migration.sql`

## `docs/` (do projeto original)

| arquivo | o que é |
|---|---|
| `cockpit-dentro-do-pwa.md` | o Cockpit como aba de gestão dentro do app de campo; contrato do deep link; quem é dono de cada ação |
| `pwa-para-cockpit.md` | o que falta o app mandar: qualificação, desfecho estruturado, tarefas |
| `contrato-eventos-rpa.md` (16 KB) | formato do touchpoint e do bloco `DESFECHO_VISITA v1` |

## `.github/workflows/`

`daily-refresh.yml` (30 KB — o maior, com alarme) · `weekly-summary.yml` ·
`radar-semanal.yml` · `casa-dos-dados-semanal.yml` · `google-places-mensal.yml` ·
`backfill-dailies.yml`
