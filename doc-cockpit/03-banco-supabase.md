# 03 — Banco (Supabase): schema e segurança

30 tabelas em `public`. Todo o schema está em `supabase/migrations/` — o baseline
(`20260724000000_…`) foi **lido do `pg_catalog`**, não reconstruído de memória, e é
idempotente (`create table if not exists` + `drop policy if exists` antes de cada
`create policy`).

## A raiz de toda a segurança

```sql
create table public.mapa_usuarios (
  email    text primary key,
  owner_id text,
  role     text not null,   -- 'manager' | 'rep'
  nome     text not null
);
```

**Toda política de RLS cruza o e-mail do JWT com esta tabela** para descobrir `owner_id`
e `role`. Sem ela, ninguém lê nada. Ela é espelho de `data/usuarios.json` — existe uma
guarda (`scripts/checar-time-nas-duas-fontes.js`) que reprova se as duas divergirem.

O padrão da policy, na forma otimizada (o `(select …)` faz o Postgres avaliar **uma vez
por consulta** em vez de uma por linha — ganho real medido):

```sql
create policy "leitura X" on public.X for select using (
  owner_id = (select owner_id from mapa_usuarios where email = (select auth.email()))
  or (select role from mapa_usuarios where email = (select auth.email())) = 'manager'
);
```

## As tabelas, por domínio

### Ritual diário e semanal
| tabela | chave | o que guarda |
|---|---|---|
| `dailies` | `(owner_id, data)` unique | prometido/realizado de visitas, avanços, propostas, fechamentos + `nota_campo`, `compromisso_amanha` |
| `planos_diarios` | `(owner_id, data)` unique | `prioridades` jsonb, `contas_alvo`, `agenda_resumo`, `daily_snapshot`, `bloqueios`, `status`, `local_atuacao` + lat/lng |
| `planos_semanais` | `(owner_id, data_segunda)` unique | `regioes` jsonb (5 regiões, uma por dia útil), `grade` jsonb (matriz 5×7: id do lead, `'__b'` bloqueado, ou `null`), `fechado_em` |
| `registros_rodada` | `(tipo, owner_id, data)` unique | `cobranca_plano` \| `reconhecimento` — o gesto do gestor na Daily, idempotente |
| `sugestoes_planos` | — | sugestão de plano que o gestor manda para um executivo |

### Desenvolvimento
| tabela | chave | o que guarda |
|---|---|---|
| `pdi_compromissos` | `(owner_id, versao_analise)` unique | `checked` boolean[], `treino_feito_em`, `treino_foco`, `validado_em[]`, `validado_por[]`, `devolvido_em[]`, `devolvido_motivo[]` |
| `pdi_documentos` | — | PDF do PDI (storage) + `compromissos` jsonb |
| `um_a_um` | — | ata do 1:1: `resumo`, `compromissos` jsonb |
| `analise_individual_semanal` | — | escrita pela IA: `gargalo_semana`, `como_agir`, `tendencia`. **Leitura só de gestor** |
| `analise_individual_mensal` | — | `resumo_mes`, `acoes_recomendadas` jsonb. **Leitura só de gestor** |

### Comunicação
| tabela | o que guarda |
|---|---|
| `comunicados` | `tipo`, `titulo`, `mensagem`, `imagem_url`, `resumo_ia` — escrita só de gestor |
| `comunicados_lidos` | `(comunicado_id, email_leitor)` — insert só do próprio leitor |
| `perfis` | `email` → `foto_caminho` |

### Prospecção
| tabela | o que guarda |
|---|---|
| `leads_prospeccao` | staging de leads frios: `place_id`, `fonte`, `nome`, `categoria`, endereço/bairro/cidade, `telefone_normalizado`, `nota`, `avaliacoes`, lat/lng, `responsavel_owner_id`, `status`, `data_rota`, `ja_existe_hubspot`, `hubspot_company_id`, `hubspot_deal_id`, `cnpj`, `socio`, `data_abertura` |
| `restaurantes_osm` | cache de consulta Overpass: `chave` → `itens` jsonb |
| `novidades_mercado` | cache Casa dos Dados: `chave` → `itens` jsonb |
| `radar_pracas` | `(praca, data_semana)` — TAM food, `tam_fonte` (`contagem_api`/`piso_paginado`/`nao_medido`), `tocado`, `pct_tocado`, `clientes`, `leitura` |
| `noticias_setor` | `url` unique — manchete + fonte + link. **Nunca o texto da matéria** (robots.txt). `relevancia` só ordena, nunca esconde |

### Playbook
| tabela | o que guarda |
|---|---|
| `playbook_progresso` | `(user_email, guia_slug)` unique, `tipo in ('missao','leitura','prova')` |
| `playbook_copias` | quem copiou qual script, quando |
| função `playbook_mais_copiadas(dias)` | `SECURITY DEFINER`, devolve só o agregado — nunca a linha de quem copiou |

### Gestão
| tabela | o que guarda |
|---|---|
| `pauta_do_lider` | `chave` unique (ex.: `cobranca_daily:91477292:2026-09-06`) — clicar de novo **deleta**, então o unique é o que torna o clique idempotente. `tipo`, `alvo_owner_id` (null = time todo), `titulo`, `detalhe`, `ritual`, `feito` |
| `combinados_semana` | `(data_segunda, titulo)` unique — o combinado da semana derivado do gargalo nº 1: `justificativa` com números, `origem_gargalo`, `alvo_owner_ids[]`, `prazo`, `playbook_pagina`, `status in ('aberto','cumprido','nao_cumprido')` |
| `combinados_cumprimento` | `(combinado_id, owner_id)` unique — quem cumpriu, marcado por quem |
| `modos_de_agir` | `(data_segunda, owner_id)` unique — `modo in ('cobrar','destravar','campo','acompanhar','reconhecer')` + `modo_sugerido` (o que o sistema propunha quando o gestor discordou) |

### Infra
| tabela | o que guarda |
|---|---|
| `cockpit_snapshot` | `chave` PK, `conteudo` jsonb, `bytes`, `origem`. **RLS ligada e SEM policy, de propósito** |
| `snapshot_farol` | `chave` PK, `versao` bigint monotônico, `atualizado_em`, `origem`. Publicada em `supabase_realtime` |
| `fila_pwa` | `(owner_id, dia)` — `pendentes`, `falhas`, `ultima_tentativa`, `versao_app`. **Ausência de linha = "não sabemos", nunca zero** |
| `webhook_cooldown` | trava do webhook do HubSpot |
| `backup_donos_sp_20260901` | sobra documentada como sobra — sem PK, sem RLS, sem leitor |

## Três regras de segurança que não se negociam

### 1. `cockpit_snapshot` tem RLS ligada e **nenhuma** policy
Ela guarda o CRM inteiro do time. Sem policy, nem `anon` nem `authenticated` leem nada —
só a `service_role` do servidor. **Se algo não consegue ler essa tabela, a resposta certa
é usar a service_role no servidor, nunca criar uma policy de leitura.** Uma policy para
`authenticated` entregaria a carteira dos colegas a qualquer executivo logado — que é
exatamente o corte que `/api/dados` existe para fazer.

### 2. As análises da IA são leitura de gestor, e só
`analise_individual_semanal` e `analise_individual_mensal` contêm gargalo e "tendência"
de cada pessoa, escritos por um robô. O executivo lê a versão dele na própria tela,
filtrada pela rota — a linha crua do colega não é dele.

### 3. `snapshot_farol` não guarda dado de negócio
Ela existe só para o navegador saber que precisa chamar `/api/dados` de novo. Por isso é
a única tabela do snapshot legível por `authenticated`, e por isso ela tem `versao`
(contador monotônico) além de `atualizado_em`: duas publicações no mesmo milissegundo
dariam o mesmo timestamp, e a aba compara valores para decidir se já viu esta versão.

## Disciplina de migrations

1. O arquivo em `supabase/migrations/` com a versão que o Supabase registrou;
2. A linha em `APLICADAS.txt`.

`scripts/checar-migrations-versionadas.js` reprova se uma andar sem a outra — e essa
guarda roda dentro do build. Foi escrita porque "aplico agora e commito depois" produziu
uma divergência de 15 migrations entre banco e repositório.
