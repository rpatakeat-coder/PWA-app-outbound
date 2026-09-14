# 05 — Robôs e automações

Seis workflows do GitHub Actions. Nenhum deles roda no navegador; todos publicam no
Supabase (`cockpit_snapshot` + `snapshot_farol`).

## 1. `daily-refresh.yml` — o robô principal

**Quando:** 8h30, 10h30, 12h30, 14h30, 16h30, 18h30 e 19h BRT em dias úteis; 09h BRT nos
fins de semana. Também por `workflow_dispatch` (é o que o webhook do HubSpot dispara).

```
node scripts/fetch-hubspot.js          # busca o CRM, calcula tudo, publica
node scripts/fetch-weekly-comparison.js # números da semana (sem IA)
node scripts/prewarm-osm.js            # aquece o cache de estabelecimentos das praças
node scripts/build.js                  # gera public/index.html + roda TODAS as guardas
```

O passo "Esta rodada gera texto de IA?" decide se a rodada é barata (só números) ou cara
(texto). Há passos de alarme: abre/comenta uma issue quando a rodada falha e a fecha
quando volta a passar.

### O que `fetch-hubspot.js` produz (140 KB de script, o coração do sistema)

- KPIs do time e por executivo
- Funil por etapa + a lista de leads de cada etapa (`funilLeads`)
- Temperatura de cada negócio aberto (via `lib/temperatura.js` + `data/temperatura.json`)
- Travados (acima do SLA da etapa), críticos, quentes
- Vendas do mês com as **três** medidas: clientes, MRR e receita
- Agenda (notas e tarefas do HubSpot)
- Histórico de etapas (velocidade, ciclo, escada por turma)
- Motivos de perda (90 dias)
- Cadência diária por executivo
- `realizado` do dia por executivo (via `lib/realizado.js`)

**Os reps vêm de `data/usuarios.json`, não de uma lista no robô.** Havia uma terceira
cópia do time cravada aqui, e ela causou o defeito de 07/09: cinco reps novos nunca
entraram nessa lista, e é dela que sai todo filtro por owner. Corte atual: quem não tem
`ownerId`, e quem está com placeholder `pendente_*`.

## 2. `weekly-summary.yml` — a leitura da semana (IA)

**Quando:** domingo 22h BRT (`0 1 * * 1`).

```
node scripts/fetch-weekly-comparison.js
node scripts/generate-weekly-summary.js   # usa ANTHROPIC_API_KEY
node scripts/build.js
```

Produz `resumo-semanal` (leitura em prosa, "como agir", análise por pessoa) e grava
`analise_individual_semanal` / `analise_individual_mensal` no Supabase.

**É também quem escreve `narrativas`** — gargalo, boa prática e compromissos por
executivo. Sem `narrativas.reps`, `/api/dados` devolve 503: o quadro de executivos é
condição de existência da tela.

## 3. `radar-semanal.yml` — o setor e as praças

**Quando:** segunda 06h BRT (`0 9 * * 1`).

```
node scripts/testar-radar-semanal.js   # as regras são conferidas ANTES de gravar
node scripts/radar-semanal.js
```

Escreve `radar_pracas` (TAM food por praça, com a procedência do número) e
`noticias_setor` (manchete + fonte + link, **nunca o texto**).

**A honestidade do TAM é uma feature:** `tam_fonte` é `contagem_api` (o número é o
total), `piso_paginado` (a tela escreve "≥ N") ou `nao_medido` (a tela escreve "não
medido", **nunca zero**). `pct_tocado` é nulo quando o TAM não foi medido — percentual
sobre denominador desconhecido é o número mais perigoso da tela.

## 4. `casa-dos-dados-semanal.yml` — sourcing de contas-alvo

**Quando:** segunda 01h UTC. `node scripts/backfill-casa-dos-dados.js`.
Busca empresas de foodservice recém-abertas nas praças, roteia por território
(`lib/territorios.js`) e importa via `/api/importar-leads`.

## 5. `google-places-mensal.yml` — os mais bem avaliados

**Quando:** dia 1 de cada mês. `node scripts/backfill-google-places.js`.
`GOOGLE_PLACES_API_KEY` **só existe nos Secrets do GitHub**, não na Vercel — por isso o
botão equivalente na tela do gestor fica desabilitado dizendo isso.

## 6. `backfill-dailies.yml` — recuperação manual

`workflow_dispatch` apenas. `node scripts/backfill-dailies-semana.js` recalcula os
últimos 7 dias direto do HubSpot e grava no Supabase.

---

## A cadeia de publicação

```js
// lib/publicar-snapshot.js — qualquer produtor publica pelo mesmo caminho
publicar(chave, conteudo, origem)
  → upsert em cockpit_snapshot  (conteudo, bytes, origem, atualizado_em)
  → upsert em snapshot_farol    (versao = versao + 1, atualizado_em, origem)
```

O `bytes` existe para perceber carga truncada: um snapshot que encolhe de 884 KB para
3 KB é sinal de falha, não de mês fraco.

## O farol: a tela reage em tempo real

O navegador assina `snapshot_farol` via Supabase Realtime. Quando a `versao` de uma chave
que a aba usa muda, a tela chama `/api/dados` de novo e repinta — sem F5 e sem polling.

Existe uma trava: **quem está no meio de um registro não é interrompido**. O dado novo
fica pendente e um aviso discreto aparece com um gesto só para aplicá-lo.

## O build é um portão, não um empacotador

```
node scripts/build.js
  1. monta o DATA casca (config Supabase + placeholders vazios com o TIPO certo)
  2. substitui {{DATA_JSON}} no template
  3. corta comentários do publicado (3742 KB → ~2409 KB brutos; 47% do que o executivo
     baixava na rua era comentário) — com 4 provas de que o corte não alterou o código
  4. escreve public/index.html
  5. compila o playbook
  6. roda scripts/check-scripts.js — se QUALQUER guarda reprovar, exit != 0 e o deploy
     não acontece
```

Escape: `COCKPIT_MANTER_COMENTARIOS=1 node scripts/build.js`.

Os placeholders precisam existir **e ter o tipo certo** (array vazio, objeto vazio,
`null`) porque o template tem código top-level síncrono que lê `DATA` no carregamento,
antes do login. Vazio renderiza estado vazio invisível atrás do gate; ausente quebra o
script inteiro.

## Economia de deploy (Vercel Hobby: 100 deploys/dia)

`vercel.json` aponta `ignoreCommand` para `scripts/vercel-deve-buildar.js`.
**Contrato invertido da Vercel: `exit 0` = ignora o build, `exit 1` = constrói.**

Regras:
- ramo ≠ `main` → **pula** (Preview de branch privada exige login e ninguém olhava)
- todos os arquivos mudados em caminho ignorável → **pula**
- qualquer dúvida (sem ref, sem diff, caminho desconhecido) → **constrói**

A lista de ignoráveis é **branca** (pula só se TODOS estiverem nela): caminho novo
constrói. Lista negra faria um caminho novo pular o deploy em silêncio — que é a classe
de defeito que causou este arquivo.

Ignoráveis: `scripts/testar-*.js`, `scripts/check-scripts.js`,
`supabase/migrations/*.sql`, `.github/`, `docs/`, `*.md`, `.gitignore`, `LICENSE`.

## Desenvolvimento local

```bash
node scripts/preview-local.js              # executivo (1º rep do time)
node scripts/preview-local.js gestor       # visão do gestor
node scripts/preview-local.js kelly@…      # um executivo específico
node scripts/servir-preview.js <dir> 4792  # origem http de verdade (file:// não serve)
```

O preview injeta o DATA completo já filtrado, desliga o shell protegido e chama
`mostrarApp()` — sem Supabase, sem rede. **O arquivo gerado contém dados reais do CRM**:
o destino padrão é a pasta temporária do sistema e `preview/` está no `.gitignore`. As
chaves de Supabase e MapTiler são zeradas de propósito.
