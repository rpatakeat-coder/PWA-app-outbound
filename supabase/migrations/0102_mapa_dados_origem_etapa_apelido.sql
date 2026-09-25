-- 0102 — Mapa novo, entrega 1: dados e sincronização
--
-- 1. etapa_de_para: o texto livre de clients.etapa ("Perdido", "NEGÓCIO PERDIDO",
--    "PROSPECÇÃO (PAP)") vira o código canônico da etapa do Cockpit. O que não
--    casar aparece em etapa_para_revisar (fila do gestor) e no mapa como "?".
--    "CASA DOS DADOS" não é etapa, é origem: fica marcado como tal.
-- 2. vendedor_apelido: o nome gravado nas visitas ("Whell Andrade", "Sérgio",
--    "Julyan") aponta para o profile, e vendedor_nome devolve o nome do cadastro
--    do Cockpit. As visitas já gravam visited_by (profile id); o apelido só
--    corrige o que aparece na tela.
-- 3. clients.origem_lead (+ origem_detalhe, entrou_em): de onde o lead veio,
--    com as seis origens da prancha. clients.origem continua como está (manual /
--    import / api / conta_alvo é usado pelo resto do app).
-- 4. client_visits.accuracy_m e acao_id: a precisão do GPS no check-in e o ID
--    idempotente da fila offline (a mesma ação subida duas vezes grava uma).
--    mark_client_as_visited ganha p_accuracy_m, p_acao_id e p_feito_em (hora
--    real do toque, para o check-in que ficou na fila sem sinal).
--
-- Posição confiável = geo_approximate (uma verdade só): não há coluna nova.

-- ---------------------------------------------------------------- normalizar
create or replace function public.texto_normalizado(p text)
returns text language sql immutable parallel safe as $$
  select nullif(regexp_replace(lower(translate(trim(coalesce(p, '')),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g'), '')
$$;

-- ---------------------------------------------------------------- etapa_de_para
create table if not exists public.etapa_de_para (
  texto_normalizado text primary key,
  etapa_codigo text,            -- id da etapa no pipeline do Cockpit; nulo quando é_origem
  etapa_rotulo text,
  e_origem boolean not null default false,
  nota text,
  criado_em timestamptz not null default now()
);
comment on table public.etapa_de_para is
  'Texto livre de clients.etapa -> etapa canônica do Cockpit (0102). O que não casar vai para etapa_para_revisar.';

alter table public.etapa_de_para enable row level security;
drop policy if exists etapa_de_para_ler on public.etapa_de_para;
create policy etapa_de_para_ler on public.etapa_de_para for select to authenticated using (true);
drop policy if exists etapa_de_para_gestor on public.etapa_de_para;
create policy etapa_de_para_gestor on public.etapa_de_para for all to authenticated
  using (public.is_field_admin()) with check (public.is_field_admin());

insert into public.etapa_de_para (texto_normalizado, etapa_codigo, etapa_rotulo, e_origem, nota) values
  ('prospeccao',            '1395880469', 'Prospecção', false, null),
  ('prospeccao (pap)',      '1395880469', 'Prospecção', false, 'etapa antiga do porta a porta'),
  ('conversa com decisor',  '1395880470', 'Conversa com Decisor', false, null),
  ('demo/proposta',         '1395880471', 'Demo/Proposta', false, null),
  ('negociacao',            '1395880472', 'Negociação', false, null),
  ('ag. pagamento',         '1395880473', 'Ag. Pagamento', false, null),
  ('aguardando pagamento',  '1395880473', 'Ag. Pagamento', false, null),
  ('pagamento',             '1395880473', 'Ag. Pagamento', false, 'rótulo curto do app'),
  ('visita',                '1396005401', 'Visita', false, null),
  ('ganho',                 '1396006162', 'Ganho', false, null),
  ('enviado onboarding',    '1396006163', 'Enviado Onboarding', false, null),
  ('onboarding',            '1396006163', 'Enviado Onboarding', false, null),
  ('perdido',               '1396006164', 'Perdido', false, null),
  ('negocio perdido',       '1396006164', 'Perdido', false, 'etapa antiga'),
  ('backlog',               '1396007427', 'Backlog', false, null),
  ('reciclagem',            '1398311191', 'Reciclagem', false, null),
  ('reciclagem 90 dias',    '1398311191', 'Reciclagem', false, 'etapa antiga'),
  ('conta alvo',            '1413529973', 'Conta Alvo', false, null),
  ('casa dos dados',        null, null, true, 'é origem (Casa dos Dados), não etapa')
on conflict (texto_normalizado) do nothing;

create or replace function public.etapa_canonica(p_etapa text)
returns text language sql stable parallel safe
set search_path = public, pg_temp as $$
  select d.etapa_codigo from public.etapa_de_para d
   where d.texto_normalizado = public.texto_normalizado(p_etapa)
$$;

-- Fila de revisão: texto de etapa em uso que a tabela não conhece.
create or replace view public.etapa_para_revisar with (security_invoker = true) as
  select public.texto_normalizado(c.etapa) as texto_normalizado,
         min(c.etapa) as exemplo, count(*) as leads
    from public.clients c
   where not coalesce(c.is_archived, false)
     and public.texto_normalizado(c.etapa) is not null
     and not exists (select 1 from public.etapa_de_para d
                      where d.texto_normalizado = public.texto_normalizado(c.etapa))
   group by 1;

-- ---------------------------------------------------------------- vendedor_apelido
create table if not exists public.vendedor_apelido (
  apelido_normalizado text primary key,
  apelido text not null,
  profile_id uuid not null references public.profiles(id),
  criado_em timestamptz not null default now()
);
comment on table public.vendedor_apelido is
  'Nome antigo gravado nas visitas/perfis -> profile (0102). O nome exibido vem de vendedor_nome().';

alter table public.vendedor_apelido enable row level security;
drop policy if exists vendedor_apelido_ler on public.vendedor_apelido;
create policy vendedor_apelido_ler on public.vendedor_apelido for select to authenticated using (true);
drop policy if exists vendedor_apelido_gestor on public.vendedor_apelido;
create policy vendedor_apelido_gestor on public.vendedor_apelido for all to authenticated
  using (public.is_field_admin()) with check (public.is_field_admin());

-- Semente: todo nome de visita e todo full_name de perfil que difere do nome do
-- cadastro do Cockpit para o MESMO profile ("Whell Andrade" -> Wericles Andrade).
insert into public.vendedor_apelido (apelido_normalizado, apelido, profile_id)
select distinct on (public.texto_normalizado(a.apelido)) public.texto_normalizado(a.apelido), a.apelido, a.profile_id
  from (
    select v.visited_by_name as apelido, v.visited_by as profile_id
      from public.client_visits v where v.visited_by_name is not null and v.visited_by is not null
    union
    select regexp_replace(p.full_name, '\s*/\s*DESATIVADO\s*$', '', 'i'), p.id from public.profiles p
  ) a
  join public.equipe_cockpit e on e.profile_id = a.profile_id
 where public.texto_normalizado(a.apelido) is distinct from public.texto_normalizado(e.nome)
   and public.texto_normalizado(a.apelido) is not null
on conflict (apelido_normalizado) do nothing;

-- Nome de exibição de um vendedor: cadastro do Cockpit, senão o perfil sem o
-- sufixo "/ DESATIVADO".
create or replace function public.vendedor_nome(p_profile_id uuid)
returns text language sql stable parallel safe
set search_path = public, pg_temp as $$
  select coalesce(
    (select e.nome from public.equipe_cockpit e where e.profile_id = p_profile_id),
    (select regexp_replace(p.full_name, '\s*/\s*DESATIVADO\s*$', '', 'i') from public.profiles p where p.id = p_profile_id))
$$;

-- ---------------------------------------------------------------- origem do lead
alter table public.clients
  add column if not exists origem_lead text,
  add column if not exists origem_detalhe text,
  add column if not exists entrou_em timestamptz;

alter table public.clients drop constraint if exists clients_origem_lead_valida;
alter table public.clients add constraint clients_origem_lead_valida check (origem_lead is null or origem_lead in
  ('casa_dos_dados', 'google_maps_motor', 'indicacao', 'inbound_site', 'hubspot', 'cadastro_na_rua'));

comment on column public.clients.origem_lead is
  'De onde o lead veio (0102): casa_dos_dados | google_maps_motor | indicacao | inbound_site | hubspot | cadastro_na_rua. Nulo = não informado.';

-- A origem pela munição (leads_prospeccao.fonte), senão pelo jeito que o pino
-- nasceu: conta-alvo -> motor; GPS do app -> rua; veio do HubSpot -> hubspot.
create or replace function public.origem_lead_da_fonte(p_fonte text)
returns text language sql immutable parallel safe as $$
  select case
    when public.texto_normalizado(p_fonte) like '%casa dos dados%' then 'casa_dos_dados'
    when public.texto_normalizado(p_fonte) = 'rua' then 'cadastro_na_rua'
    when public.texto_normalizado(p_fonte) ~ '(google|outscraper|serper)' then 'google_maps_motor'
    when public.texto_normalizado(p_fonte) like '%indicac%' then 'indicacao'
    when public.texto_normalizado(p_fonte) ~ '(inbound|site|formulario)' then 'inbound_site'
    when public.texto_normalizado(p_fonte) like '%hubspot%' then 'hubspot'
  end
$$;

create or replace function public.clients_origem_lead()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  v_fonte text;
  v_entrou timestamptz;
begin
  if new.origem_lead is not null then
    return new;
  end if;
  if new.lead_prospeccao_id is not null then
    select lp.fonte, lp.created_at into v_fonte, v_entrou
      from public.leads_prospeccao lp where lp.id = new.lead_prospeccao_id;
    new.origem_lead := public.origem_lead_da_fonte(v_fonte);
    new.origem_detalhe := coalesce(new.origem_detalhe, v_fonte);
    new.entrou_em := coalesce(new.entrou_em, v_entrou);
  end if;
  if new.origem_lead is null then
    new.origem_lead := case
      when new.origem = 'conta_alvo' then 'google_maps_motor'
      when new.origem = 'manual' and new.geo_source = 'coords' then 'cadastro_na_rua'
      when new.id_hubspot is not null then 'hubspot'
    end;
  end if;
  if tg_op = 'INSERT' then
    new.entrou_em := coalesce(new.entrou_em, new.created_at, now());
  end if;
  return new;
end $$;

drop trigger if exists clients_origem_lead on public.clients;
create trigger clients_origem_lead before insert or update of lead_prospeccao_id, id_hubspot, origem_lead
  on public.clients for each row execute function public.clients_origem_lead();

-- Carga: sem tocar updated_at/updated_by (o dado não mudou, só ganhou rótulo).
alter table public.clients disable trigger update_clients_updated_at;
alter table public.clients disable trigger clients_set_updated_by;

update public.clients c
   set origem_lead = public.origem_lead_da_fonte(lp.fonte),
       origem_detalhe = lp.fonte,
       entrou_em = lp.created_at
  from public.leads_prospeccao lp
 where lp.id = c.lead_prospeccao_id and c.origem_lead is null;

update public.clients c
   set origem_lead = case
         when c.origem = 'conta_alvo' then 'google_maps_motor'
         when c.origem = 'manual' and c.geo_source = 'coords' then 'cadastro_na_rua'
         when c.id_hubspot is not null then 'hubspot'
       end
 where c.origem_lead is null;

update public.clients set entrou_em = created_at where entrou_em is null;

alter table public.clients enable trigger update_clients_updated_at;
alter table public.clients enable trigger clients_set_updated_by;

create index if not exists clients_origem_lead_idx on public.clients (origem_lead);

-- ---------------------------------------------------------------- check-in
alter table public.client_visits
  add column if not exists accuracy_m numeric,
  add column if not exists acao_id uuid;
create unique index if not exists client_visits_acao_id_uniq on public.client_visits (acao_id) where acao_id is not null;
comment on column public.client_visits.accuracy_m is 'Precisão do GPS no toque do check-in, em metros (0102).';
comment on column public.client_visits.acao_id is 'ID idempotente da fila offline do app (0102): a mesma ação gravada duas vezes vira uma.';

drop function if exists public.mark_client_as_visited(uuid, numeric, numeric);
create or replace function public.mark_client_as_visited(
  p_client_id uuid, p_user_lat numeric, p_user_lon numeric,
  p_accuracy_m numeric default null, p_acao_id uuid default null, p_feito_em timestamptz default null)
returns public.clients
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_client public.clients;
  v_distance_m numeric;
  v_caller uuid := auth.uid();
  v_max_distance_m numeric;
  v_etapa_anterior text;
  v_name text;
  v_email text;
  v_quando timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;

  -- Fila offline: a mesma ação já gravada devolve o lead sem gravar de novo.
  IF p_acao_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.client_visits WHERE acao_id = p_acao_id) THEN
    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
    RETURN v_client;
  END IF;

  IF p_user_lat IS NULL OR p_user_lon IS NULL THEN
    RAISE EXCEPTION 'Localização do usuário não informada' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_client.latitude IS NULL OR v_client.longitude IS NULL THEN
    RAISE EXCEPTION 'Lead sem coordenadas — impossível validar proximidade.' USING ERRCODE = 'P0001';
  END IF;

  -- Raio maior quando o pin e aproximado (geocoding de CEP sem numero exato).
  v_max_distance_m := CASE WHEN v_client.geo_approximate IS TRUE THEN 500 ELSE 200 END;

  -- Haversine em metros (raio da Terra = 6.371.000 m)
  v_distance_m := 2 * 6371000 * asin(sqrt(
    power(sin(radians((p_user_lat - v_client.latitude) / 2)), 2) +
    cos(radians(v_client.latitude)) * cos(radians(p_user_lat)) *
    power(sin(radians((p_user_lon - v_client.longitude) / 2)), 2)
  ));

  IF v_distance_m > v_max_distance_m THEN
    RAISE EXCEPTION 'Você está a % m do lead (limite: % m). Aproxime-se do local para marcar como visitado.',
      round(v_distance_m, 1), v_max_distance_m
      USING ERRCODE = 'P0001';
  END IF;

  -- Hora do toque (check-in que esperou sinal): nunca no futuro nem mais de 48 h atrás.
  v_quando := CASE WHEN p_feito_em IS NULL OR p_feito_em > now() OR p_feito_em < now() - interval '48 hours'
                   THEN now() ELSE p_feito_em END;

  v_etapa_anterior := v_client.etapa;

  SELECT full_name, email INTO v_name, v_email
    FROM public.profiles WHERE id = v_caller;

  BEGIN
    INSERT INTO public.client_visits (
      client_id, visited_at, visited_at_lat, visited_at_lon, distance_m,
      visited_by, visited_by_name, visited_by_email, etapa_anterior, accuracy_m, acao_id
    ) VALUES (
      p_client_id, v_quando, p_user_lat, p_user_lon, round(v_distance_m, 1),
      v_caller, coalesce(public.vendedor_nome(v_caller), v_name), v_email, v_etapa_anterior,
      round(p_accuracy_m, 1), p_acao_id
    );
  EXCEPTION WHEN unique_violation THEN
    -- A mesma ação chegou duas vezes ao mesmo tempo (fila + toque): a outra gravou.
    RETURN v_client;
  END;

  -- Visita NAO muda status (decisao de 20260619): a informacao "visitado"
  -- vive em visited_at/client_visits. Mudar o status aqui tirava o lead do
  -- recorte de sector_visibility e ele sumia do app.
  UPDATE public.clients
     SET visited_at     = greatest(coalesce(visited_at, v_quando), v_quando),
         visited_at_lat = p_user_lat,
         visited_at_lon = p_user_lon,
         visited_by     = v_caller,
         visit_count    = COALESCE(visit_count, 0) + 1,
         updated_by     = v_caller,
         updated_at     = now()
   WHERE id = p_client_id
   RETURNING * INTO v_client;

  RETURN v_client;
END;
$function$;

revoke all on function public.mark_client_as_visited(uuid, numeric, numeric, numeric, uuid, timestamptz) from public, anon;
grant execute on function public.mark_client_as_visited(uuid, numeric, numeric, numeric, uuid, timestamptz) to authenticated, service_role;
