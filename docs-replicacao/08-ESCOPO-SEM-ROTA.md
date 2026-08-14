# 08 — Escopo: o que fica de fora (módulo Rota/Mapa)

O pedido é replicar **tudo, menos Rota**. Este documento define a fronteira exata.

## Resumo em uma frase

Sai **tudo que depende de mapa, coordenada ou sequenciamento de visitas**. Fica tudo que é
funil, Daily, agenda por horário, prospecção como fila, PDI/1:1, avisos e as automações de IA.

---

## 1. Arquivos que NÃO devem ser enviados / portados

| Arquivo | Motivo |
|---|---|
| `lib/osm.js` | Consulta Overpass/OpenStreetMap. Só serve para o mapa. |
| `scripts/prewarm-osm.js` | Robô que pré-aquece o cache de OSM. |
| `api/restaurantes-proximos.js` | Endpoint do OSM. |
| `data/regioes-prewarm.json` | Âncoras geográficas do pré-aquecimento. |
| `data/maptiler-config.json` | Chave do MapTiler (geocodificação). |
| `rota-e-agenda-executivo.html` | Protótipo da tela de Rota. |
| `api/novidades-mercado.js` + `data/redes-excluidas.json` | **Decisão sua** — ver §5. |
| `scripts/fetch-clientes-ativos.js` + `data/clientes-ativos.json` | **Decisão sua** — ver §5. |
| `api/criar-tarefa-rota.js` | **Decisão sua** — ver §5. |

## 2. Views inteiras que saem

- **`viewRotas`** (aba "Rotas", só gestor) — a tela que mostra a rota de cada executivo com
  mapa, sequenciamento e "empurrar conta-alvo para a rota dele". Remova o botão
  `#tabBtnRotas`, o `<section class="exec-support-hero">` correspondente, `#rotasContent`, e
  o drawer `#rotaOverlay` / `#rotaDrawer`.
- **A subview "hoje" com mapa** dentro de `viewAgenda` (executivo). A `viewAgenda` **fica**,
  mas só com a grade de horários e os buracos da semana.

## 3. Funções a remover de `public/index.html`

**Rotas do time (gestor)**
`rotasRepsVisiveis` · `territorioDe` / `TERRITORIO_DO_EXECUTIVO` · `carregarRotasDoTime` ·
`rotaOrigemDoPlano` · `renderRotas` · `abrirRotaDrawer` · `fecharRotaDrawer` ·
`desenharRotaDrawer` · `rotaParadasParaSequenciar` · `rotaSequenciaAtual` ·
`montarListaAdicionar` · `adicionarNaRotaDoRep` · `tirarDaRota`

**Geodistância e sequenciamento**
`distanciaKm` (Haversine) · `ordenarPorProximidade` · `totalPercursoKm` · `montarMicrorota` ·
`manchaDeAtuacao` · `circuloGeoJSON`

**Mapa (MapLibre + OpenFreeMap)**
`carregarMapLibre` · `estiloPlanoMapa` · `podarCamadasDoBasemap` · `montarMapaRota` ·
`montarPlanoMapa` · `gerarRotaPlanoMapa` · `sincronizarFiltrosDoMapa` / `planoMapaFiltro` ·
`abrirAdicionarManual` · `criarPontoNoMapa` · `fecharPontoNovo` · `agruparParaOMapa` ·
`abrirPainelCluster` · `fecharPainelCluster` · `cardClusterHTML` ·
`buscarRestaurantesNoMapa` · `materializarLeadDoMapa` · `mapaEnderecoCompleto` ·
`agendaVerNoMapaDaRota` · `MAPA_MAX_PINOS`

**Geocodificação (MapTiler)**
`geocodificarQuente` · `geocodificarLocalAtuacao` · `buscarLocais` · `ligarBuscaLocal` ·
`fecharSugestoesLocal` · `pintarSugestoesLocal` · `escolherLocal` · `localEscolhido` ·
`enderecoDoCRM` · `geolocalizacaoAtual`

**Novidades de mercado** (se você optar por não portar — ver §5)
`buscarNovidadesPraca` · `buscarNovidadesMercado` · `montarNovidadesPracas` ·
`importarNovidade` · `pracasDoTime` · `diasDesde`

**Bibliotecas sob demanda**: `carregarMapLibre()` some. **`carregarSheetJs()` FICA** — é da
importação de planilha da Prospecção, não do mapa.

## 4. Colunas e tabelas do Supabase que saem

- Tabela **`restaurantes_osm`** — não criar.
- Tabela **`novidades_mercado`** — não criar (salvo §5).
- Em `planos_diarios`, ficam sem uso: `local_atuacao`, `local_atuacao_lat`,
  `local_atuacao_lng`, `contas_alvo`. **Recomendo manter as colunas** (nulas) para não fechar
  a porta, mas remover os campos da UI.
- Em `leads_prospeccao`, `lat`/`lng` viram informativos — não alimentam mais mapa nem
  ordenação por distância. A ordenação passa a ser **só por `avaliacoes DESC`**, que já é a
  regra oficial de prioridade comercial.

## 5. Três decisões que só você pode tomar

### (a) `criar-tarefa-rota.js` — recomendo **manter**

Apesar do nome, esta rota não tem nada de mapa: ela cria uma **task no HubSpot** no formato
`"Visita - <nome>"`, que é o que faz a visita aparecer sozinha na Agenda e ser contada na
Daily. Sem ela, o agendamento manual pela Agenda (o "agendador rápido") deixa de funcionar e o
executivo volta a depender de registrar tudo no app de campo.

**Sugestão**: porte a rota, renomeie para `criar-tarefa-visita.js`, e mantenha só o caminho de
agendamento pela Agenda (dia + hora + lead), descartando os parâmetros de bairro/cidade que
vinham do mapa.

### (b) Clientes ativos — pode sair

`fetch-clientes-ativos.js` existe só para sugerir "parada de relacionamento perto de onde você
vai atuar". Sem mapa, perde o propósito. **Recomendo remover** (e junto, o filtro de
`clientesAtivos` em `filtrarParaPapel`).

### (c) Novidades de mercado (Casa dos Dados) — **independente do mapa**

Este módulo busca empresas de foodservice **abertas recentemente** por CNAE. O mapa era só a
forma de apresentar. A régua ("quem acabou de abrir, não quem é bem avaliado") é uma decisão
de produto valiosa e transferível.

**Sugestão**: se você quer sourcing de leads novos, porte `api/novidades-mercado.js` +
`data/redes-excluidas.json` e apresente o resultado como **lista dentro da Prospecção**, com
botão "importar para a fila". Se não quiser, corte tudo e a tabela `novidades_mercado` junto.

---

## 6. O que PRECISA ser reconstruído por causa do corte

### 6.1 Prospecção precisa voltar a ser aba do executivo

Hoje a Prospecção do executivo é o "deck" ao lado do mapa da Rota (`tabBtnLeadsPraca` está
`display:none` para `role === 'rep'`). Com a Rota fora, **a aba tem que voltar a existir para
os dois papéis**:

```js
// antes:  btnProsp.style.display = souRep ? 'none' : 'flex';
// depois: btnProsp.style.display = 'flex';
```
Conteúdo para o executivo: "Novas desta semana" + backlog da praça dele + progresso de ataque.
O que sai: "＋ rota", pill "na rota ✓", ordenação por distância.

### 6.2 A Agenda perde a segunda entrada de nav

`tabBtnAgendaSemana` existia porque o executivo tinha duas visões da mesma view ("Rota" e
"Agenda", separadas por `agendaEstado.subview`). Sem rota, **uma aba só**, rotulada "Agenda"
para os dois papéis. Remova `tabBtnAgendaSemana` e a lógica de `subview`.

### 6.3 O "Plano do dia" fica menor, mas fica

Tira `local_atuacao`, o mapa e as contas-alvo. **Continuam**: as 3 prioridades, bloqueios,
observação, `status` (`rascunho` / `plano_fechado`), autosave com debounce e o **streak de
dias úteis com plano fechado** — que é o mecanismo de hábito, não de rota.

### 6.4 A ficha do lead perde uma ação

`Avançar` e `Registrar motivo` ficam; `＋ rota` sai. O componente continua sendo **um só**,
reutilizado em quentes, travados, funil, prospecção e nos dois papéis.

### 6.5 O "Onde atacar esta semana" (visão por praça) fica

Ele usa `snapshotReps` do `weekly-raw.json` e o backlog de prospecção — **não usa mapa**.
Calcula veredito e runway por praça. Mantenha.

---

## 7. Ganho colateral do corte

Sem o módulo de rota você elimina, além do código:
- a dependência de **MapLibre GL** (carregado sob demanda, ~200KB) e dos tiles do OpenFreeMap;
- a dependência do **MapTiler** (geocodificação, chave, restrição de domínio);
- a dependência da **Overpass API** — um serviço público mantido por voluntários que cai
  sozinho e obrigou 4 espelhos em ordem de preferência, timeout por espelho e
  `continue-on-error` no workflow;
- a dependência da **Casa dos Dados** (se optar por (c) = não);
- 2 tabelas de cache no Supabase e 1 passo do cron diário.

Estimativa grosseira: **~30–35% das ~17.800 linhas** de `public/index.html` são do módulo de
rota/mapa. É o maior bloco isolável do sistema.
