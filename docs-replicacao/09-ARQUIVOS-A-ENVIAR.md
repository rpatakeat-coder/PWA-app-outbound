# 09 — Manifesto de arquivos

> **Este pacote já está montado.** Todos os arquivos listados abaixo já foram copiados para
> dentro de `docs-replicacao/`. Basta zipar a pasta e mandar para o outro projeto.
> As seções de "como foi montado" ficam documentadas para quando você precisar regerar.

## Estrutura do pacote

```
docs-replicacao/
├── 00-LEIA-PRIMEIRO.md … 10-PLANO-DE-IMPLEMENTACAO.md   ← a documentação (11 arquivos)
├── gerar-amostras.js                                     ← regera as amostras anonimizadas
│
├── referencia/                     ← código original, para consulta (NÃO copiar literalmente)
│   ├── index.html                  ← front-end inteiro (17.828 linhas) — chaves sanitizadas
│   ├── scripts/  (8 arquivos)      ← pipeline de dados + geradores de IA
│   ├── api/      (7 arquivos)      ← rotas serverless
│   ├── workflows/(3 arquivos)      ← crons do GitHub Actions
│   └── prototipos/                 ← 13 telas hi-fi + support.js + HANDOFF-DESIGN.md + logo
│
└── amostras-dados/                 ← formatos JSON ANONIMIZADOS (12 arquivos)
```

## O que está em `referencia/`

### Front-end
| Arquivo | Linhas | Por quê |
|---|---|---|
| `index.html` | 17.828 | Todo o front-end. É a única fonte do comportamento real. |

**Sanitizado**: o `<script id="cockpit-data">` teve `supabase.url`, `supabase.anonKey` e
`maptiler` substituídos por placeholders. O resto do arquivo é idêntico ao original.

### `scripts/`
| Arquivo | Linhas | Por quê |
|---|---|---|
| `montar-dados.js` | 387 | **O mais importante depois do index.** Montagem do DATA + `filtrarParaPapel()` (corte de privacidade). |
| `build.js` | 57 | O modelo de "shell protegido". Curto e crítico. |
| `fetch-hubspot.js` | 1.324 | Toda a integração com o CRM: IDs, SLA, temperatura, agenda, snapshot da Daily. |
| `fetch-weekly-comparison.js` | 232 | Comparativo semanal + `snapshotReps`. |
| `generate-daily-gargalo.js` | 180 | Prompt + robustez do cliente Claude. |
| `generate-weekly-summary.js` | 583 | Prompts de time e individual + fechamento mensal. |
| `generate-individual-analysis.js` | 418 | Coaching + regra de compromissos automáticos. |
| `backfill-dailies-semana.js` | 163 | Recuperação de dados. Útil desde o dia 1. |

### `api/`
| Arquivo | Linhas | Por quê |
|---|---|---|
| `dados.js` | 66 | O gate de autenticação/autorização. |
| `atualizar-mrr.js` | 116 | Padrão de escrita validada no CRM. |
| `criar-negocio.js` | 111 | Criação de deal. |
| `criar-empresa-prospeccao.js` | 114 | Criação de company + dedupe. |
| `importar-leads.js` | 371 | Ingestão, normalização, dedupe, régua de qualidade. |
| `confirmar-sugestao-gestor.js` | 136 | Fluxo gestor→executivo na agenda. |
| `criar-tarefa-rota.js` | 225 | **Renomear para `criar-tarefa-visita.js`** — ver `08` §5(a). Não tem mapa; é o que faz a visita aparecer na Agenda. |

### `workflows/`
`daily-refresh.yml` · `weekly-summary.yml` · `backfill-dailies.yml` — crons, ordem dos passos,
push resiliente com rebase, Issue em falha.

### `prototipos/`
13 HTMLs de tela + `support.js` + `HANDOFF-DESIGN.md` (era o `README.md` do projeto) +
`logo-takeat.png`.

Protótipos navegáveis de **alta fidelidade** — cores, tipografia, espaçamento e copy são
finais. Abra `cockpit-gestor-hi-fi.html` e `hoje-executivo-hi-fi.html` primeiro.
**`support.js` não é código de produção** — é só o runtime dos protótipos.

## O que está em `amostras-dados/`

| Arquivo | Tratamento |
|---|---|
| `hubspot.AMOSTRA.json` | 2 executivos, 3 leads por lista. Nomes de restaurante, vendedor e **o texto livre das notas** substituídos. Endereço zerado. |
| `weekly-raw.AMOSTRA.json` | 1 `snapshotReps`, 2 registros por lista, anonimizados. |
| `resumo-semanal.AMOSTRA.json` | 1 `porRep`; listas de detalhe esvaziadas. |
| `narrativas.AMOSTRA.json` | 1 rep, nome trocado. |
| `historico-semanal-mes.AMOSTRA.json` | 1 semana. |
| `leads-referencia.AMOSTRA.json` | 1 praça, 3 leads anonimizados. |
| `usuarios.AMOSTRA.json` | **E-mails fictícios**, estrutura preservada (inclui o caso `aComecar`). |
| `sync-status.AMOSTRA.json` | 3 falhas, nomes trocados. |
| `supabase-config.EXEMPLO.json` | **Só o formato.** Gere as suas chaves. |
| `hubspot-previous.json` | Cópia direta — são só KPIs agregados. |
| `expogo.json` | Cópia direta — snapshot agregado, sem nomes. |
| `redes-excluidas.json` | Cópia direta — lista de marcas, não de pessoas. |

Para regerar depois de um fetch novo: `node docs-replicacao/gerar-amostras.js`

## O que ficou de fora, e por quê

### 🚫 Segredos
| Arquivo | Motivo |
|---|---|
| `data/supabase-config.json` | `url` + `anonKey` do projeto **real**. Substituído por `supabase-config.EXEMPLO.json`. |
| `data/maptiler-config.json` | Chave do MapTiler — e é do módulo de rota, que sai do escopo. |

### 🚫 Módulo de rota (ver `08-ESCOPO-SEM-ROTA.md`)
`lib/osm.js` · `scripts/prewarm-osm.js` · `api/restaurantes-proximos.js` ·
`data/regioes-prewarm.json` · `rota-e-agenda-executivo.html`

### 🚫 Dados reais completos
`data/hubspot.json` (432 KB) · `data/weekly-raw.json` (130 KB) · `data/resumo-semanal.json` ·
`data/narrativas.json` · `data/leads-referencia.json` · `data/clientes-ativos.json` ·
`data/usuarios.json` — todos têm nome de cliente e/ou e-mail do time. Os **schemas completos**
estão em `03-HUBSPOT.md` e `04-SUPABASE.md`, então as amostras bastam.

### ➖ Redundante
`template/cockpit.template.html` é **idêntico** a `public/index.html` exceto pelo placeholder
`{{DATA_JSON}}`. Só `index.html` foi para o pacote; a relação entre os dois está em
`01-ARQUITETURA.md`.

### 🤔 Decisão sua (ver `08` §5)
`api/novidades-mercado.js` + `data/redes-excluidas.json` (o JSON **foi** para as amostras) ·
`scripts/fetch-clientes-ativos.js` + `data/clientes-ativos.json`

---

## Uma ressalva sobre nomes

O `referencia/` mantém os **nomes reais do time** onde eles fazem parte do código: a constante
`REPS` em `fetch-hubspot.js` e os dados de exemplo dentro dos protótipos HTML. Não foram
alterados de propósito — mexer neles descaracterizaria o código de referência, e o destino é
outro projeto seu.

Se o pacote for sair da empresa, rode um `grep` pelos nomes antes de enviar. Nas
`amostras-dados/` isso já está limpo — sobram apenas dois `_comment` mencionando o primeiro
nome do gestor, em campos que explicam quem mantém o arquivo.

---

## Como montar o pacote de novo (se precisar)

```bash
cd <raiz-do-projeto>
DEST=docs-replicacao
mkdir -p "$DEST"/referencia/{scripts,api,prototipos,workflows} "$DEST"/amostras-dados

cp public/index.html "$DEST/referencia/index.html"

cp scripts/montar-dados.js scripts/build.js scripts/fetch-hubspot.js \
   scripts/fetch-weekly-comparison.js scripts/generate-daily-gargalo.js \
   scripts/generate-weekly-summary.js scripts/generate-individual-analysis.js \
   scripts/backfill-dailies-semana.js "$DEST/referencia/scripts/"

cp api/dados.js api/atualizar-mrr.js api/criar-negocio.js \
   api/criar-empresa-prospeccao.js api/importar-leads.js \
   api/confirmar-sugestao-gestor.js api/criar-tarefa-rota.js "$DEST/referencia/api/"

cp .github/workflows/*.yml "$DEST/referencia/workflows/"

cp cockpit-gestor-hi-fi.html hoje-executivo-hi-fi.html daily-e-ritmo-gestor.html \
   semana-gestor.html pessoas-gestor.html prospeccao-gestor.html avisos-gestor.html \
   minha-daily-executivo.html meu-funil-executivo.html prospeccao-executivo.html \
   avisos-executivo.html desenvolvimento-executivo.html drawers-nivel-3.html \
   support.js logo-takeat.png "$DEST/referencia/prototipos/"
cp README.md "$DEST/referencia/prototipos/HANDOFF-DESIGN.md"

# Sanitiza as chaves do cockpit-data no index copiado
node -e "
const fs=require('fs'), p='$DEST/referencia/index.html';
const l=fs.readFileSync(p,'utf8').split('\n');
const i=l.findIndex(x=>x.includes('<script id=\"cockpit-data\"'));
const d=JSON.parse(l[i+1]);
d.supabase={url:'https://SEU-PROJETO.supabase.co',anonKey:'SUA_ANON_KEY_AQUI'};
d.maptiler='SUA_CHAVE_MAPTILER';
l[i+1]=JSON.stringify(d); fs.writeFileSync(p,l.join('\n'));
"

node "$DEST/gerar-amostras.js"
```

Verificação final antes de enviar:
```bash
grep -rl "SEU-PROJETO\|SUA_ANON_KEY" docs-replicacao/referencia/index.html   # deve achar
grep -rlE "[a-z.]+@(suaempresa\.com|gmail\.com)" docs-replicacao/            # deve dar vazio
```

---

## Prompt inicial sugerido para o Claude Code do outro projeto

> Este pacote descreve o **Cockpit Field Sales**, um sistema de gestão de vendas de campo que
> integra HubSpot + Supabase + API da Claude. Quero replicar **todas as funcionalidades exceto
> o módulo de Rota/Mapa**.
>
> Comece lendo `docs-replicacao/00-LEIA-PRIMEIRO.md` e siga a ordem indicada. O escopo exato do
> que fica de fora está em `08-ESCOPO-SEM-ROTA.md` — respeite essa fronteira. O roteiro de
> implementação está em `10-PLANO-DE-IMPLEMENTACAO.md`.
>
> `referencia/` contém o código original: use como fonte de comportamento, **não copie
> literalmente** — adapte à stack deste projeto. `referencia/prototipos/` são protótipos de
> design de alta fidelidade (cores, tipografia e copy são finais); `support.js` é só o runtime
> deles, não é código de produção.
>
> `amostras-dados/` tem os formatos JSON **anonimizados** — os schemas completos estão nos MDs.
>
> Antes de começar a codar, me devolva: (1) o plano de implementação adaptado à nossa stack,
> (2) o que você acha que precisa mudar em relação ao original, (3) o que ficou ambíguo na
> documentação.
