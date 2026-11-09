-- 0259 · TERRITÓRIO v4: o resumo fica GUARDADO e o agendador recalcula (09/11/26)
--
-- Por quê: na segunda 09/11 às 15:47, o territorio_resumo (0258) estourou o statement timeout (8 s do papel
-- authenticated) ao abrir a aba no Cockpit do Julyan: a mesma conta que leva 0,8–1,5 s com o banco folgado disputou a
-- máquina Nano com a abertura do resto do Cockpit e com o time na rua. A conta é a mesma para todo gestor e muda
-- devagar (cargas semanais, visitas do dia), então ela passa a ser guardada (a regra "guardar em vez de rebaixar"):
--   · territorio_resumo_cache: o resumo de cada praça (todas, rj, sp, vv), com gerado_em; ninguém lê direto (RLS sem
--     política, sem grant): só as funções security definer abaixo;
--   · _territorio_resumo_calc: o MESMO corpo do territorio_resumo da 0258, sem a checagem de gestor (quem chama checa);
--   · territorio_resumo(p_praca, p_com_ids, p_carga): checa o gestor; os ids dos botões que gravam continuam calculados
--     NA HORA (p_com_ids = true); a leitura da tela usa o guardado de até 40 minutos e só calcula se não houver;
--     a carga do gestor é sempre a de agora (vem por fora do guardado);
--   · territorio_resumo_aquecer(): recalcula as 4 praças; o pg_cron chama aos 11, 31 e 51 de cada hora das 7h às 20h
--     de Brasília (minutos que nenhum outro job usa). São ~2 s de CPU a cada 20 minutos, em vez de 0,8–8 s a cada abertura.
-- A tela não muda: o JSON é o mesmo, com "lido_em" = a hora do cálculo.

create table if not exists public.territorio_resumo_cache (
  praca text primary key,
  conteudo jsonb not null,
  gerado_em timestamptz not null default now()
);
comment on table public.territorio_resumo_cache is
  'Território v4 (0259): o territorio_resumo de cada praça, recalculado pelo pg_cron a cada 20 min no horário de rua. Lido só por territorio_resumo (security definer).';
alter table public.territorio_resumo_cache enable row level security;
revoke all on public.territorio_resumo_cache from public, anon, authenticated;

create or replace function public._territorio_resumo_calc(p_praca text default null, p_com_ids boolean default false, p_carga integer default null)
 returns jsonb
 language plpgsql stable security definer set search_path = public, pg_temp as
$function$
declare
  v_pr text := public._territorio_filtro(p_praca);
  v_hoje date := public._territorio_hoje();
  v_sem date := public._territorio_semana(public._territorio_hoje());
  v_seg date := date_trunc('week', public._territorio_hoje())::date;
  v_carga integer;
  v jsonb;
begin
  select tc.carga into v_carga from public.territorio_carga tc where tc.gestor = auth.uid();

  with base as materialized (select * from public._territorio_base() b where (v_pr is null and b.praca in (select t0.praca from public._territorio_time() t0)) or b.praca = v_pr),
  lugar as materialized (select * from public._territorio_lugar()),
  tm as materialized (select * from public._territorio_time() t where v_pr is null or t.praca = v_pr),
  f as (select * from base where criado between v_hoje - 29 and v_hoje),
  fx as (
    select f.*, (f.owner_id is not null) as dono,
           f.owner_id is not null and (f.sug_viva or f.status = 'na_rota' or f.na_grade or f.visitado or f.negocio) as sugerido,
           f.owner_id is not null and (f.status = 'na_rota' or f.na_grade or f.visitado or f.negocio) as rota,
           f.owner_id is not null and f.visitado as vis,
           f.owner_id is not null and f.visitado and f.avancou as neg,
           f.owner_id is not null and f.negocio and not f.visitado as neg_sv
      from f
  ),
  pv as (
    select owner_id, percentile_cont(0.5) within group (order by extract(epoch from primeira_visita - criado_em) / 86400.0) as med, count(*) as n
      from base where owner_id is not null and visitado and criado >= v_hoje - 89 and primeira_visita >= criado_em
     group by owner_id
  ),
  por as (
    select owner_id,
           count(*) filter (where vence_semana) as vence_semana,
           count(*) filter (where ativo and not visitado) as fila,
           count(*) filter (where sug_semana and not sug_conf and not negocio and sug_ate is not null) as sug_pend,
           count(*) filter (where sug_semana and (sug_conf or negocio)) as sug_conf
      from base where owner_id is not null group by owner_id
  ),
  ex as (
    select tm.owner_id, tm.nome, tm.praca, tm.ramp,
           count(fx.id) filter (where fx.dono) as chegou,
           count(fx.id) filter (where fx.sugerido) as sugerido,
           count(fx.id) filter (where fx.rota) as na_rota,
           count(fx.id) filter (where fx.vis) as visitado,
           count(fx.id) filter (where fx.neg) as negocio,
           count(fx.id) filter (where fx.neg_sv) as negocio_sem_visita
      from tm left join fx on fx.owner_id = tm.owner_id
     group by 1, 2, 3, 4
  ),
  gr as materialized (
    select distinct substr(s.k, 3) as lead, ps.owner_id, ps.data_segunda
      from public.planos_semanais ps
      cross join lateral jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) d
      cross join lateral jsonb_array_elements(case when jsonb_typeof(d.value) = 'array' then d.value else '[]'::jsonb end) e
      cross join lateral (select case when jsonb_typeof(e.value) = 'object' then e.value ->> 'id' else e.value #>> '{}' end as k) s
     where ps.data_segunda >= v_seg - 21 and s.k like 'n-%'
  ),
  wk as (
    select w.seg,
           (select count(*) from base b where b.criado between w.seg and w.seg + 6) as chegou,
           (select count(distinct s.lead_id) from public.territorio_sugestoes s join base b on b.id = s.lead_id
             where s.semana = w.seg and b.owner_id is not null) as sugerido,
           (select count(distinct b.id) from base b join gr on gr.lead = b.id::text and gr.owner_id = b.owner_raw and gr.data_segunda = w.seg
             where b.owner_id is not null) as na_rota,
           (select count(*) from base b where b.owner_id is not null and b.visitado
              and (b.primeira_visita at time zone 'America/Sao_Paulo')::date between w.seg and w.seg + 6) as visitado,
           (select count(*) from base b where b.owner_id is not null and b.visitado and b.avancou
              and (b.primeira_visita at time zone 'America/Sao_Paulo')::date between w.seg and w.seg + 6) as negocio
      from (select (v_seg - 7 * g)::date as seg from generate_series(3, 0, -1) g) w
  ),
  carga as (
    select criado as dia, count(*) as n, max(criado_em) as ultima, count(distinct kb) as bairros
      from base where criado = (select max(criado) from base) group by criado
  ),
  -- o destino de quem vence: dono do bairro; dono do município; quem tem dia lá; quem mais visitou lá; ninguém
  venc as materialized (
    select b.id, b.praca, b.km, b.kb, b.abertura, d.owner_id as para, d.nome as para_nome
      from base b
      left join lateral (
        select u.owner_id, u.nome from lugar u
         where u.nome is not null and u.praca = b.praca
           and ((u.tipo = 'dono' and u.km = b.km and u.kb = b.kb) or (u.tipo = 'municipio' and u.km = b.km)
                or (u.tipo = 'dia' and u.kb = b.kb) or (u.tipo = 'visita' and u.km = b.km and u.kb = b.kb))
         order by case u.tipo when 'dono' then 1 when 'municipio' then 2 when 'dia' then 3 else 4 end, u.n desc, u.owner_id
         limit 1) d on true
     where b.vence14 and b.praca is not null
  ),
  -- o mapa: um ponto por bairro com recém-aberto ativo (o centro dos leads dele), nunca os pinos
  bz as (
    select b.praca, b.km, b.kb,
           mode() within group (order by b.bairro) as bairro_cru, mode() within group (order by b.cidade) as cidade,
           mode() within group (order by b.estado) as uf,
           round(avg(b.lat) filter (where b.lat is not null and b.lat <> 0)::numeric, 5) as lat,
           round(avg(b.lng) filter (where b.lng is not null and b.lng <> 0)::numeric, 5) as lng,
           count(*) as ativos, count(*) filter (where not b.visitado) as sem_visita, count(*) filter (where b.vence14) as vencem
      from base b
     where b.status in ('pendente', 'atribuido') and b.idade <= 90 and b.praca is not null and b.kb <> ''
     group by 1, 2, 3
  ),
  bairros as (
    select bz.*, d.owner_id as dono_id, d.nome as dono_nome, d.rotulo,
           coalesce((select sum(u.n) from lugar u where u.tipo = 'visita' and u.km = bz.km and u.kb = bz.kb), 0) as prova
      from bz
      left join lateral (select u.owner_id, u.nome, u.rotulo from lugar u
                          where u.km = bz.km and ((u.tipo = 'dono' and u.kb = bz.kb) or u.tipo = 'municipio')
                          order by (u.tipo = 'municipio'), u.nome limit 1) d on true
  ),
  fichas as (
    select lower(trim(coalesce(fr.sistema, ''))) as sistema, count(*) as fichas,
           count(*) filter (where fr.como_foi = 'falou_com_decisor') as decisor
      from public.fichas_de_rua fr
      left join public._territorio_time() t2 on t2.owner_id = fr.owner_id
     where fr.ocorrido_em >= (v_hoje - 29)::timestamp at time zone 'America/Sao_Paulo'
       and (v_pr is null or coalesce(public._territorio_praca(fr.cidade), t2.praca) = v_pr)
     group by 1
  ),
  saiu as (
    select p.id_hubspot as owner, trim(regexp_replace(p.full_name, '\s*/\s*DESATIVADO\s*$', '', 'i')) as nome
      from public.profiles p where p.full_name ~* 'DESATIVADO' and p.id_hubspot is not null
  ),
  orfa as (
    select s.nome, s.owner,
           (select count(*) from public.leads_prospeccao lp where lp.responsavel_owner_id = s.owner
              and lp.status in ('pendente', 'atribuido', 'na_rota') and nullif(trim(coalesce(lp.hubspot_deal_id, '')), '') is null) as lp,
           (select count(*) from public.clients c where c.vendedor_id_hubspot = s.owner and c.status = 'lead'
              and nullif(trim(coalesce(c.id_hubspot, '')), '') is null) as pinos
      from saiu s
  ),
  livres as (
    select b.owner_id, b.id,
           row_number() over (partition by b.owner_id order by b.vence14 desc, case when b.vence14 then b.idade end desc nulls last, b.criado_em desc) as r
      from base b
     where p_com_ids and b.owner_id is not null and b.status = 'atribuido' and b.idade <= 90
       and not b.visitado and not b.na_grade and not b.negocio and not b.sug_viva
  )
  select jsonb_build_object(
    'lido_em', now(), 'hoje', v_hoje, 'semana_plano', v_sem, 'praca', coalesce(v_pr, 'todas'), 'carga_gestor', v_carga,
    'carga_de', (select jsonb_build_object('dia', dia, 'n', n, 'ultima', ultima, 'bairros', bairros) from carga limit 1),
    'funil_30d', (select jsonb_build_object(
        'chegou', count(*), 'com_dono', count(*) filter (where dono), 'sugerido', count(*) filter (where sugerido),
        'na_rota', count(*) filter (where rota), 'visitado', count(*) filter (where vis), 'negocio', count(*) filter (where neg),
        'negocio_sem_visita', count(*) filter (where neg_sv)) from fx),
    'semanas_4', (select coalesce(jsonb_agg(jsonb_build_object('semana', seg, 'chegou', chegou, 'sugerido', sugerido, 'na_rota', na_rota,
        'visitado', visitado, 'negocio', negocio) order by seg), '[]'::jsonb) from wk),
    'por_executivo', (select coalesce(jsonb_agg(jsonb_build_object(
        'owner_id', ex.owner_id, 'nome', ex.nome, 'praca', ex.praca, 'ramp', ex.ramp, 'chegou', ex.chegou, 'sugerido', ex.sugerido,
        'na_rota', ex.na_rota, 'visitado', ex.visitado, 'negocio', ex.negocio, 'negocio_sem_visita', ex.negocio_sem_visita,
        'primeira_visita_mediana_d', round(pv.med::numeric, 1), 'primeira_visita_n', coalesce(pv.n, 0),
        'vence_semana', coalesce(por.vence_semana, 0), 'fila', coalesce(por.fila, 0),
        'sug_pendentes', coalesce(por.sug_pend, 0), 'sug_confirmados', coalesce(por.sug_conf, 0))
        order by coalesce(por.vence_semana, 0) desc, ex.chegou desc, ex.nome), '[]'::jsonb)
        from ex left join pv on pv.owner_id = ex.owner_id left join por on por.owner_id = ex.owner_id),
    'primeira_visita_geral', (select jsonb_build_object('mediana_d', round((percentile_cont(0.5) within group (order by extract(epoch from primeira_visita - criado_em) / 86400.0))::numeric, 1), 'n', count(*))
        from base where owner_id is not null and visitado and criado >= v_hoje - 89 and primeira_visita >= criado_em),
    'resgate_14d', (select jsonb_build_object('vencem', count(*), 'redistribuiveis', count(*) filter (where para is not null),
        'sem_dono', count(*) filter (where para is null), 'saem_ate', max(abertura + 91)) from venc),
    'sugestoes', (select jsonb_build_object('semana', v_sem, 'vale_ate', v_sem + 4,
        'sugeridos', count(*) filter (where sug_semana and owner_id is not null),
        'confirmados', count(*) filter (where sug_semana and owner_id is not null and (sug_conf or negocio)),
        'pendentes', count(*) filter (where sug_semana and owner_id is not null and not sug_conf and not negocio and sug_ate is not null)) from base),
    'visitou_semana_passada', (select count(*) from base b where b.owner_id is not null and b.visitado
        and (b.primeira_visita at time zone 'America/Sao_Paulo')::date between v_seg - 7 and v_seg - 1),
    'saiu_sem_visita_semana', (select count(*) from base b where b.status = 'expirado' and b.expirado_em >= v_seg),
    -- o mapa vai em linhas curtas (posição fixa) para pesar pouco:
    -- [chave, bairro, município, uf, praça, lat, lng, ativos, sem visita, vencem 14 d, cobertura, dono id, dono, com prova 4 sem]
    'bairros', (select coalesce(jsonb_agg(jsonb_build_array(
        praca || '|' || km || '|' || kb, coalesce(rotulo, bairro_cru), cidade, upper(uf), praca, lat, lng,
        ativos, sem_visita, vencem, case when dono_id is null then 'sem_dono' when prova >= 4 then 'ok' else 'parcial' end,
        dono_id, dono_nome, prova) order by sem_visita desc, bairro_cru), '[]'::jsonb) from bairros),
    'contra_quem', (select coalesce(jsonb_agg(jsonb_build_array(sistema, fichas, decisor) order by fichas desc), '[]'::jsonb) from fichas),
    'carteira_quem_saiu', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'owner', owner, 'lp', lp, 'pinos', pinos) order by greatest(lp, pinos) desc), '[]'::jsonb)
        from orfa where lp + pinos > 0),
    'ids', case when p_com_ids then jsonb_build_object(
        'carga', (select coalesce(jsonb_object_agg(x.owner_id, x.ids), '{}'::jsonb)
                    from (select l.owner_id, jsonb_agg(l.id order by l.r) as ids
                            from livres l left join por on por.owner_id = l.owner_id
                           where l.r <= greatest(0, least(12, coalesce(p_carga, v_carga, 5)) - coalesce(por.sug_pend, 0))
                           group by 1) x),
        'redistribuir', (select coalesce(jsonb_agg(jsonb_build_object('para', g.para, 'nome', g.para_nome, 'ids', g.ids) order by g.n desc), '[]'::jsonb)
                    from (select para, para_nome, jsonb_agg(id) as ids, count(*) as n from venc where para is not null group by 1, 2) g),
        'sair', (select coalesce(jsonb_agg(id), '[]'::jsonb) from venc where para is null)) end
  ) into v;
  return v;
end;
$function$;

create or replace function public.territorio_resumo_aquecer()
 returns integer
 language plpgsql security definer set search_path = public, pg_temp as
$function$
declare v_pr text; v_n integer := 0;
begin
  foreach v_pr in array array['todas', 'rj', 'sp', 'vv'] loop
    insert into public.territorio_resumo_cache (praca, conteudo, gerado_em)
    values (v_pr, public._territorio_resumo_calc(case when v_pr = 'todas' then null else v_pr end, false, null), now())
    on conflict (praca) do update set conteudo = excluded.conteudo, gerado_em = excluded.gerado_em;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

create or replace function public.territorio_resumo(p_praca text default null, p_com_ids boolean default false, p_carga integer default null)
 returns jsonb
 language plpgsql security definer set search_path = public, pg_temp as
$function$
declare
  v_k text := coalesce(public._territorio_filtro(p_praca), 'todas');
  v jsonb;
  v_carga integer;
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor lê o território' using errcode = '42501'; end if;
  -- os botões que gravam: sempre a conta de agora
  if p_com_ids then return public._territorio_resumo_calc(p_praca, true, p_carga); end if;
  select c.conteudo into v from public.territorio_resumo_cache c where c.praca = v_k and c.gerado_em > now() - interval '40 minutes';
  if v is null then
    v := public._territorio_resumo_calc(p_praca, false, null);
    insert into public.territorio_resumo_cache (praca, conteudo, gerado_em) values (v_k, v, now())
    on conflict (praca) do update set conteudo = excluded.conteudo, gerado_em = excluded.gerado_em;
  end if;
  select tc.carga into v_carga from public.territorio_carga tc where tc.gestor = auth.uid();
  return v || jsonb_build_object('carga_gestor', v_carga);
end;
$function$;

revoke all on function public._territorio_resumo_calc(text, boolean, integer) from public, anon, authenticated;
revoke all on function public.territorio_resumo_aquecer() from public, anon, authenticated;
revoke all on function public.territorio_resumo(text, boolean, integer) from public, anon;
grant execute on function public.territorio_resumo(text, boolean, integer) to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'territorio-resumo-aquecer';
select cron.schedule('territorio-resumo-aquecer', '11,31,51 10-23 * * *', 'select public.territorio_resumo_aquecer()');
