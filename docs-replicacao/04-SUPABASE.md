# 04 — Supabase: auth, tabelas e storage

## Autenticação

- **E-mail + senha** (`supa.auth.signInWithPassword`).
- Fluxo completo implementado em `iniciarAuth()`:
  - login;
  - **"Esqueci minha senha"** → `resetPasswordForEmail`;
  - **"Definir nova senha"** depois de clicar no link do e-mail → `updateUser`;
  - `onAuthStateChange` → `aplicarSessao(email)`.
- **Atenção**: `onAuthStateChange` **dispara mais de uma vez**. Todo efeito colateral de
  login precisa ser idempotente. A home do papel tem que ser *fallback*
  (`if (!posicaoNavRestaurada) activateTab(...)`), nunca chamada incondicional — senão a
  segunda passada atropela a posição de navegação restaurada e a regrava no `sessionStorage`.
- **A autorização não vem do Supabase**: quem define papel e `ownerId` é
  `data/usuarios.json`, consultado no servidor por `api/dados.js`. E-mail autenticado mas
  não cadastrado → **403**.

## Tabelas

> Convenções: `owner_id` é sempre o **HubSpot owner id** (texto). `data` é `date` (ISO
> `AAAA-MM-DD`). Todas têm `id` (uuid/serial) e `created_at` salvo indicação em contrário.

### `dailies` — a Daily gamificada
**PK lógica / unique: `(owner_id, data)`** — todo `upsert` usa `onConflict: 'owner_id,data'`.

| Coluna | Tipo | Origem |
|---|---|---|
| `owner_id` | text | — |
| `data` | date | — |
| `prometido_visitas` / `prometido_avancos` / `prometido_propostas` | int null | **pessoa** (Daily das 9h) |
| `realizado_visitas` / `realizado_avancos` / `realizado_propostas` / `realizado_fechamentos` | int null | **robô** (`fetch-hubspot.js`) |
| `nota_campo` | text null | pessoa ("o que travou / o que rendeu") |
| `compromisso_amanha` | text null | pessoa |
| `criado_por` | text | e-mail da sessão |
| `updated_at` | timestamptz | — |

Leitura no front: as **últimas ~6 semanas de todo mundo de uma vez** (`gte('data', hoje-42)`),
indexadas em memória por `` `${owner_id}_${data}` `` — assim sequência e conquistas saem sem
uma consulta por pessoa por dia.

### `planos_diarios` — plano do dia
**Unique: `(owner_id, data)`**.

| Coluna | Tipo | Nota |
|---|---|---|
| `owner_id`, `data`, `criado_por` | text/date/text | |
| `prioridades` | jsonb (array de 3 strings) | as 3 prioridades |
| `contas_alvo` | jsonb (`[{id, nome}]`) | **[ROTA]** |
| `agenda_resumo` | jsonb | |
| `daily_snapshot` | jsonb null | |
| `local_atuacao` | text null | **[ROTA]** |
| `local_atuacao_lat` / `_lng` | float null | **[ROTA]** — geocodificado só quando o texto muda |
| `bloqueios` | text null | |
| `observacao` | text null | |
| `status` | text | CHECK: `rascunho`, `plano_fechado`, `aguardando_sincronizacao`, `sincronizado`, `recebido_expogo`, `em_execucao`, `concluido`. **Só os 2 primeiros estão implementados de verdade** — os outros existem no CHECK e no adaptador, mas nunca aparecem na UI. Regra do projeto: não declarar sincronização sem backend funcionando. |
| `fechado_em` | timestamptz null | |
| `versao` | int | default 1 |
| `atualizado_em` | timestamptz | |

**Streak do plano** (`calcularStreakPlano`): dias úteis consecutivos contando **para trás a
partir de ontem** (hoje ainda está em jogo) com `status='plano_fechado'`. Para no primeiro dia
útil sem plano fechado. Sem ranking — é a série da própria pessoa.

O card tem **autosave com debounce**; a geocodificação só roda se o texto do local mudou
(geocodificar a cada tecla queimaria a cota).

### `comunicados` / `comunicados_lidos` — avisos

`comunicados`: `id`, `tipo` (`geral` | `atualizacao` | `urgente`), `titulo`, `mensagem`,
`imagem_caminho` (path no bucket `comunicados-imagens`), `autor`, `created_at`.

`comunicados_lidos`: `comunicado_id`, `email_leitor`, `created_at`.
Uma linha por leitura. `jaLi(id)` e `vistoPor(id)` são derivados em memória.

### `leads_prospeccao` — fila de prospecção (staging)

| Coluna | Tipo |
|---|---|
| `id` | uuid |
| `place_id` | text null (dedupe forte) |
| `fonte` | text — `Outscraper`, `Google Places`, `Tripadvisor`, `iFood`, `Casa dos Dados`, `Manual` |
| `nome` | text (obrigatório) |
| `categoria` | text null |
| `endereco`, `bairro`, `cidade` (obrigatório), `estado` | text |
| `telefone`, `telefone_normalizado` | text null (DDI 55 removido para dedupe) |
| `nota` | numeric null — **contexto apenas, nunca filtra/ordena** |
| `avaliacoes` | int null — **único critério de corte** |
| `lat`, `lng` | float null |
| `presencial` | bool (default true) |
| `delivery` | bool |
| `horario_funcionamento` | text null |
| `ja_existe_hubspot` | bool |
| `responsavel_owner_id` | text null |
| `status` | text — `pendente` · `atribuido` · `criado_hubspot` (+ estados de UI: na rota, visitada, virou lead) |
| `hubspot_company_id` | text null |
| `criado_por` | text |
| `created_at`, `updated_at` | timestamptz |

Executivo lê com `.eq('responsavel_owner_id', ownerId)`; gestor lê tudo.

### `pdi_compromissos` — compromissos do 1:1 (espelhados gestor ↔ executivo)
**Unique: `(owner_id, versao_analise)`**.

`owner_id`, `versao_analise` (= `narrativas._atualizado_em`), `checked` (jsonb array de
índices marcados), `data_um_a_um` (date null), `atualizado_por`, `updated_at`.

A chave incluir `versao_analise` é intencional: quando a IA gera compromissos novos, a versão
avança e o check-off da semana passada é resetado — compromisso novo, check novo.

### `pdi_documentos` — PDFs de PDI
`owner_id`, `titulo`, `caminho_arquivo` (bucket `pdi-documentos`), `nome_arquivo`, `autor`,
`compromissos` (jsonb array), `data`, `created_at`.

### `um_a_um` — histórico de 1:1
`owner_id`, `data` (date), `autor`, `resumo` (text), `compromissos` (jsonb array de strings),
`created_at`.

### `sugestoes_planos` — recado do gestor para o executivo
`owner_id`, `texto`, `autor`, `created_at`. O executivo vê as 3 mais recentes no "Hoje".

### `analise_individual_semanal` — coaching semanal (IA)
`owner_id`, `semana_label` (ex.: `08/08 – 14/08`), `numero_semana_mes` (int),
`mes_ano` (`AAAA-MM`), `gargalo_semana` (text), `como_agir` (jsonb array), `tendencia` (text),
`created_at`.

**Idempotente**: o gerador faz `DELETE where owner_id + semana_label` antes de inserir, então
rodar o job várias vezes na mesma semana não duplica.

### `analise_individual_mensal` — fechamento mensal (IA)
`owner_id`, `mes_ano` (`AAAA-MM`), `resumo_mes` (text), `acoes_recomendadas` (jsonb array),
`created_at`.

### `perfis` — foto de perfil
`email` (PK), `foto_caminho` (bucket `avatares`), `updated_at`.

### `restaurantes_osm` **[ROTA]** — cache de estabelecimentos do OpenStreetMap
`chave` (unique), `lat`, `lng`, `raio_m`, `itens` (jsonb), `buscado_em`.
Validade 30 dias; o robô renova aos 21. Busca por chave exata **e** por bounding box
(`lat/lng` dentro da faixa **e** `raio_m >= raio pedido`).

### `novidades_mercado` **[ROTA/opcional]** — cache da Casa dos Dados
`chave` (unique), `itens` (jsonb), `buscado_em`.

## Storage — 3 buckets

| Bucket | Conteúdo | Acesso |
|---|---|---|
| `avatares` | fotos de perfil | **público** (`getPublicUrl`) |
| `comunicados-imagens` | imagem anexada a um comunicado | **privado** → `createSignedUrl(path, 3600)` |
| `pdi-documentos` | PDFs de PDI | **privado** → URL assinada |

## RLS — o que o projeto original faz e o que recomendo

O front-end usa a `anonKey` e conversa **direto** com as tabelas acima. Só as escritas que
precisam de token de terceiro (HubSpot) ou de service key passam por `/api/*`.

**Isso significa que o RLS é a única barreira** entre um executivo autenticado e o dado dos
colegas nessas tabelas. O corte de `filtrarParaPapel()` protege apenas o que vem de
`/api/dados` (o CRM); **não protege as tabelas do Supabase**.

Ao replicar, recomendo policies explícitas por tabela:

```sql
-- Exemplo para dailies: executivo só lê/escreve a própria linha; gestor lê tudo.
-- Requer uma tabela/claim que mapeie auth.uid() ou auth.email() → owner_id + role.

create table public.membros (
  email    text primary key,
  owner_id text,
  role     text not null check (role in ('manager','rep'))
);

create or replace function public.meu_owner_id() returns text
language sql stable as $$
  select owner_id from public.membros where email = auth.jwt()->>'email'
$$;

create or replace function public.sou_gestor() returns boolean
language sql stable as $$
  select coalesce((select role = 'manager' from public.membros
                   where email = auth.jwt()->>'email'), false)
$$;

alter table public.dailies enable row level security;

create policy dailies_leitura on public.dailies for select
  using (public.sou_gestor() or owner_id = public.meu_owner_id());

create policy dailies_escrita on public.dailies for all
  using  (public.sou_gestor() or owner_id = public.meu_owner_id())
  with check (public.sou_gestor() or owner_id = public.meu_owner_id());
```

Aplique o mesmo padrão em `planos_diarios`, `leads_prospeccao` (`responsavel_owner_id`),
`pdi_compromissos`, `pdi_documentos`, `um_a_um`, `sugestoes_planos`,
`analise_individual_*` (**só gestor lê** — é material de coaching privado).

`comunicados` = leitura para todo autenticado, escrita só gestor.
`comunicados_lidos` = insert só da própria linha (`email_leitor = auth.jwt()->>'email'`).
`perfis` = leitura para todos, escrita só da própria linha.
