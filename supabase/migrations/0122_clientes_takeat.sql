-- 0122 · Clientes Takeat sempre sincronizados: lista, última comanda, ex-clientes e queda
--
-- Pedido do Julyan (27/09/26): "lista de clientes e última comanda PERFEITA, e ex-clientes,
-- sempre sincronizado; e os clientes que estão diminuindo volume, para os executivos
-- visitarem".
--
-- AUDITORIA do caminho antigo (hubspot-usage-sync, 0048–0050), que está parado desde 05/08:
--   1. o agendamento mandava "Bearer SUA_SERVICE_ROLE_KEY" literal — nunca autenticou;
--   2. lia data_da_ultima_comanda_emitida, que no HubSpot virou "[Desativado]";
--   3. lia 4 etapas fixas: uma não existe mais (0 negócios) e ficavam de fora Risco (381),
--      Engajamento, Integração, todo o Onboarding menos Acompanhamento, e a etapa de
--      cancelados (140).
--
-- A FONTE: os negócios dos pipelines Onboarding (87106112) e Sucesso (87367429) no HubSpot,
-- que o sistema da Takeat atualiza toda madrugada (data_ultima_comanda, faturamento dos
-- últimos meses, variacao_faturamento = "Variação último bimestre", comandas totais).
--
-- CLASSIFICAÇÃO (decisão do Julyan, 27/09):
--   ativo    = todo o Onboarding; Sucesso Saudável, Risco, Engajamento, Integração
--   em_risco = 162579097 (pediu cancelamento, segue emitindo) e 171389298 (comanda parada)
--   ex       = Churn (1122729590) e 1154518702 (cancelado)
-- EM QUEDA (decisão do Julyan): ativo/em_risco com variação do bimestre <= -20%, ou sem
--   comanda há 5 dias ou mais. Dono da visita: pelo território (fase 2, coluna já aqui).
--
-- Tabelas: clientes_takeat (um por negócio), clientes_takeat_dia (foto diária, para a
-- tendência), clientes_takeat_rodadas (registro de cada sincronização).
-- Os pinos do mapa (clients, por id_hubspot) recebem as MESMAS colunas hs_* que o app já
-- lê — hs_situacao continua 'ativo' | 'churn' (em_risco conta como ativo ali).

create table if not exists public.clientes_takeat (
  deal_id               text primary key,
  nome                  text,
  pipeline              text,
  etapa_id              text,
  etapa                 text,
  situacao              text not null check (situacao in ('ativo', 'em_risco', 'ex', 'desconhecida')),
  dono_cs_owner_id      text,
  ultima_comanda        date,
  ultima_comanda_takeat date,
  ultima_comanda_integracoes date,
  comandas_total        integer,
  faturamento_mes0      numeric,
  faturamento_mes1      numeric,
  faturamento_mes2      numeric,
  faturamento_mes3      numeric,
  variacao_bimestre     numeric,
  cancelamento_pedido   date,
  ultimo_caixa          date,
  ultima_cobranca       date,
  cnpj                  text,
  celular               text,
  logradouro            text,
  numero                text,
  bairro                text,
  cidade                text,
  estado                text,
  cep                   text,
  latitude              double precision,
  longitude             double precision,
  em_queda              boolean not null default false,
  motivo_queda          text,
  executivo_owner_id    text,                 -- dono da visita pelo território (fase 2)
  client_id             uuid references public.clients (id) on delete set null,
  hs_modificado_em      timestamptz,
  sincronizado_em       timestamptz not null default now()
);
create index if not exists clientes_takeat_situacao on public.clientes_takeat (situacao);
create index if not exists clientes_takeat_queda on public.clientes_takeat (em_queda) where em_queda;
create index if not exists clientes_takeat_client on public.clientes_takeat (client_id);

create table if not exists public.clientes_takeat_dia (
  deal_id          text not null,
  dia              date not null,
  situacao         text,
  ultima_comanda   date,
  comandas_total   integer,
  faturamento_mes0 numeric,
  faturamento_mes1 numeric,
  variacao_bimestre numeric,
  primary key (deal_id, dia)
);

create table if not exists public.clientes_takeat_rodadas (
  id          bigserial primary key,
  rodou_em    timestamptz not null default now(),
  negocios    integer not null default 0,
  pinos       integer not null default 0,
  por_situacao jsonb,
  etapas_sem_classificacao jsonb,
  erro        text,
  duracao_ms  integer
);

alter table public.clientes_takeat enable row level security;
alter table public.clientes_takeat_dia enable row level security;
alter table public.clientes_takeat_rodadas enable row level security;

-- Quem lê: o time do Cockpit (executivos e gestores ativos). Faturamento de cliente é
-- dado sensível: fora do time, nada. Escrita só pela função (service role).
drop policy if exists clientes_takeat_time_le on public.clientes_takeat;
create policy clientes_takeat_time_le on public.clientes_takeat for select to authenticated
  using (public.is_field_admin() or exists (select 1 from public.equipe_cockpit e where e.profile_id = auth.uid() and e.ativo));
drop policy if exists clientes_takeat_dia_time_le on public.clientes_takeat_dia;
create policy clientes_takeat_dia_time_le on public.clientes_takeat_dia for select to authenticated
  using (public.is_field_admin() or exists (select 1 from public.equipe_cockpit e where e.profile_id = auth.uid() and e.ativo));
drop policy if exists clientes_takeat_rodadas_gestor_le on public.clientes_takeat_rodadas;
create policy clientes_takeat_rodadas_gestor_le on public.clientes_takeat_rodadas for select to authenticated
  using (public.is_field_admin());

-- Grava um lote vindo da Edge Function clientes-sync. Devolve quantos pinos do mapa
-- foram atualizados.
create or replace function public.gravar_clientes_takeat(p_rows jsonb)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_pinos integer;
begin
  with d as (
    select * from jsonb_to_recordset(p_rows) as x(
      deal_id text, nome text, pipeline text, etapa_id text, etapa text, situacao text,
      dono_cs_owner_id text, ultima_comanda date, ultima_comanda_takeat date, ultima_comanda_integracoes date,
      comandas_total integer, faturamento_mes0 numeric, faturamento_mes1 numeric, faturamento_mes2 numeric,
      faturamento_mes3 numeric, variacao_bimestre numeric, cancelamento_pedido date, ultimo_caixa date,
      ultima_cobranca date, cnpj text, celular text, logradouro text, numero text, bairro text, cidade text,
      estado text, cep text, latitude double precision, longitude double precision, hs_modificado_em timestamptz)
    where x.deal_id is not null
  ), q as (
    select d.*,
      (d.situacao in ('ativo', 'em_risco') and (
         (d.variacao_bimestre is not null and d.variacao_bimestre <= -0.20)
         or (d.ultima_comanda is not null and d.ultima_comanda <= (now() at time zone 'America/Sao_Paulo')::date - 5))) as em_queda,
      nullif(concat_ws(' · ',
        case when d.variacao_bimestre is not null and d.variacao_bimestre <= -0.20
             then 'faturamento ' || round(d.variacao_bimestre * 100)::text || '% no bimestre' end,
        case when d.ultima_comanda is not null and d.ultima_comanda <= (now() at time zone 'America/Sao_Paulo')::date - 5
             then 'sem comanda há ' || ((now() at time zone 'America/Sao_Paulo')::date - d.ultima_comanda)::text || ' dias' end), '') as motivo
    from d
  ), up as (
    insert into public.clientes_takeat as t (
      deal_id, nome, pipeline, etapa_id, etapa, situacao, dono_cs_owner_id, ultima_comanda, ultima_comanda_takeat,
      ultima_comanda_integracoes, comandas_total, faturamento_mes0, faturamento_mes1, faturamento_mes2, faturamento_mes3,
      variacao_bimestre, cancelamento_pedido, ultimo_caixa, ultima_cobranca, cnpj, celular, logradouro, numero, bairro,
      cidade, estado, cep, latitude, longitude, em_queda, motivo_queda, client_id, hs_modificado_em, sincronizado_em)
    select q.deal_id, q.nome, q.pipeline, q.etapa_id, q.etapa, q.situacao, q.dono_cs_owner_id, q.ultima_comanda,
      q.ultima_comanda_takeat, q.ultima_comanda_integracoes, q.comandas_total, q.faturamento_mes0, q.faturamento_mes1,
      q.faturamento_mes2, q.faturamento_mes3, q.variacao_bimestre, q.cancelamento_pedido, q.ultimo_caixa,
      q.ultima_cobranca, q.cnpj, q.celular, q.logradouro, q.numero, q.bairro, q.cidade, q.estado, q.cep,
      q.latitude, q.longitude, q.em_queda, q.motivo,
      (select c.id from public.clients c where c.id_hubspot = q.deal_id order by c.is_archived nulls first limit 1),
      q.hs_modificado_em, now()
    from q
    on conflict (deal_id) do update set
      nome = excluded.nome, pipeline = excluded.pipeline, etapa_id = excluded.etapa_id, etapa = excluded.etapa,
      situacao = excluded.situacao, dono_cs_owner_id = excluded.dono_cs_owner_id, ultima_comanda = excluded.ultima_comanda,
      ultima_comanda_takeat = excluded.ultima_comanda_takeat, ultima_comanda_integracoes = excluded.ultima_comanda_integracoes,
      comandas_total = excluded.comandas_total, faturamento_mes0 = excluded.faturamento_mes0,
      faturamento_mes1 = excluded.faturamento_mes1, faturamento_mes2 = excluded.faturamento_mes2,
      faturamento_mes3 = excluded.faturamento_mes3, variacao_bimestre = excluded.variacao_bimestre,
      cancelamento_pedido = excluded.cancelamento_pedido, ultimo_caixa = excluded.ultimo_caixa,
      ultima_cobranca = excluded.ultima_cobranca, cnpj = excluded.cnpj, celular = excluded.celular,
      logradouro = excluded.logradouro, numero = excluded.numero, bairro = excluded.bairro, cidade = excluded.cidade,
      estado = excluded.estado, cep = excluded.cep, latitude = excluded.latitude, longitude = excluded.longitude,
      em_queda = excluded.em_queda, motivo_queda = excluded.motivo_queda, client_id = excluded.client_id,
      hs_modificado_em = excluded.hs_modificado_em, sincronizado_em = now()
    returning 1
  ), foto as (
    insert into public.clientes_takeat_dia (deal_id, dia, situacao, ultima_comanda, comandas_total, faturamento_mes0, faturamento_mes1, variacao_bimestre)
    select q.deal_id, (now() at time zone 'America/Sao_Paulo')::date, q.situacao, q.ultima_comanda, q.comandas_total,
           q.faturamento_mes0, q.faturamento_mes1, q.variacao_bimestre
    from q
    on conflict (deal_id, dia) do update set situacao = excluded.situacao, ultima_comanda = excluded.ultima_comanda,
      comandas_total = excluded.comandas_total, faturamento_mes0 = excluded.faturamento_mes0,
      faturamento_mes1 = excluded.faturamento_mes1, variacao_bimestre = excluded.variacao_bimestre
    returning 1
  ), pinos as (
    -- As colunas que o app já lê (0048–0050). hs_situacao segue 'ativo' | 'churn'.
    update public.clients c set
      hs_ultima_comanda_em = q.ultima_comanda,
      hs_cancelamento_solicitado_em = q.cancelamento_pedido,
      hs_qtd_comandas = q.comandas_total,
      hs_etapa_uso = q.etapa,
      hs_situacao = case when q.situacao = 'ex' then 'churn' else 'ativo' end,
      hs_uso_sincronizado_em = now()
    from q
    where c.id_hubspot = q.deal_id
      and (c.hs_ultima_comanda_em is distinct from q.ultima_comanda
        or c.hs_cancelamento_solicitado_em is distinct from q.cancelamento_pedido
        or c.hs_qtd_comandas is distinct from q.comandas_total
        or c.hs_etapa_uso is distinct from q.etapa
        or c.hs_situacao is distinct from (case when q.situacao = 'ex' then 'churn' else 'ativo' end))
    returning 1
  )
  select (select count(*) from pinos) into v_pinos;
  return v_pinos;
end;
$$;
revoke all on function public.gravar_clientes_takeat(jsonb) from public, anon, authenticated;
grant execute on function public.gravar_clientes_takeat(jsonb) to service_role;

-- Segredo do header x-cron-secret, gerado dentro do cofre (mesmo padrão do motor, 0110).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'clientes_sync') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'clientes_sync',
      'Header x-cron-secret da Edge Function clientes-sync (0122)');
  end if;
end $$;

create or replace function public.invocar_clientes_sync()
returns bigint
language plpgsql security definer
set search_path = public, vault, net
as $$
declare v_segredo text; v_req bigint;
begin
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'clientes_sync'
   order by created_at desc limit 1;
  if v_segredo is null then raise exception 'segredo clientes_sync ausente no vault'; end if;
  select net.http_post(
    url := 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/clientes-sync',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    timeout_milliseconds := 150000
  ) into v_req;
  return v_req;
end;
$$;
revoke all on function public.invocar_clientes_sync() from public, anon, authenticated;
