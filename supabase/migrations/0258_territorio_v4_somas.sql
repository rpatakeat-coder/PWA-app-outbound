-- 0258 · TERRITÓRIO v4 DO GESTOR: o banco devolve as somas (design_handoff_territorio_v4, 06/11/26)
--
-- Por quê: a aba Território do Cockpit fazia 23 leituras e baixava 759 KB comprimidos (4,8 MB crus) por abertura,
-- porque trazia leads_prospeccao e clients inteiros para contar no navegador. No mesmo dia o banco Nano ficou sem
-- CPU. A v4 muda a conta de lugar: o banco devolve os totais prontos, por praça, bairro, executivo e semana, e a
-- lista de leads só é lida quando o gestor abre uma (até 50 por vez).
--
-- A abertura lê UMA coisa: territorio_resumo(p_praca). Ela calcula a base de recém-abertos uma vez só e devolve o
-- funil, a tabela por executivo, o mapa por bairro (um ponto por bairro, em linhas curtas), o que vence, a carga do
-- gestor, a fila, contra quem e a carteira de quem saiu. (O handoff sugeria territorio_bairros à parte; ficou dentro
-- do resumo para não refazer a mesma conta numa segunda leitura.)
-- Sob demanda: territorio_lista (a gaveta, até 50) e territorio_resumo(p_praca, true, N) no clique dos botões
-- congelados do v3, que devolve os ids que eles gravam (Completar até N → sugerir_no_plano; Redistribuir / Deixar
-- sair → redistribuir_recem_abertos / deixar_sair_recem_abertos); territorio_equilibrar ("Passar N de X para Y e Z")
-- chama redistribuir_recem_abertos.
--
-- As réguas são as do Território v3 (0248 e GV2.t3Modelo), com as três mudanças do v4:
--   · recém-aberto = lead da Casa dos Dados com data_abertura; vence aos 90 dias (expirar_recem_abertos, 06:40);
--   · o time = quem está no território oficial (cockpit_config 'territorios', sem ativo = false, sem "teste", com
--     área vigente) e ativo na equipe_cockpit (não só acesso), pelo nome; a praça é a do 1º município da área;
--   · chegou = criado nos últimos 30 dias (Brasília); com dono = o dono é do time;
--   · sugerido (novo, cumulativo) = sugestão viva (vale_ate >= hoje) ou confirmada, ou já na rota ou adiante;
--   · na rota = status na_rota, ou esteve na grade (n-<lead> em planos_semanais das últimas 5 semanas), ou
--     visitado, ou com negócio — a mesma do v3;
--   · visitado = visita com prova (_visitas_com_prova, provada) no pino do lead (clients.lead_prospeccao_id), no dia
--     da chegada ou depois;
--   · negócio (novo) = visitado que passou da visita: o pino chegou à Conversa com decisor ou adiante (o Cheguei já
--     cria o negócio, então "tem deal" daria 100%; é a régua da conversão do v3). O deal sem visita sai do funil e vira
--     negocio_sem_visita. Assim o funil só desce;
--   · vence (14 dias) = pendente/atribuído, 76 a 90 dias de abertura, sem visita com prova e sem negócio;
--   · vence esta semana = o mesmo, com 83 a 90 dias (sai do mapa nos próximos 7 dias);
--   · fila = recém-aberto ativo (pendente, atribuído, na rota) dele, até 90 dias, sem visita com prova;
--   · 1ª visita = mediana (90 dias) de 1ª visita com prova − chegada, sem visita anterior à chegada.
-- Funil e por executivo saem da MESMA passada: a soma das linhas é o funil (o teste do Cockpit prova).
--
-- Tudo é security definer com checagem de gestor (eh_gestor_cockpit). No Supabase, recriar função devolve execute
-- ao anon: o fim do arquivo revoga de public e anon e dá a authenticated. Nada aqui lê ou escreve no HubSpot.

-- ── 0 · a praça de uma cidade (a mesma lista do GV2.PRACAS do Cockpit) ───────────────────────────────────────
create or replace function public._territorio_praca(p_cidade text)
 returns text language sql immutable set search_path = public, pg_temp as
$$ select case
     when k in ('rio de janeiro', 'niteroi', 'sao goncalo', 'nova iguacu', 'duque de caxias', 'sao joao de meriti', 'nilopolis',
                'mesquita', 'belford roxo', 'queimados', 'itaborai', 'marica') then 'rj'
     when k in ('vitoria', 'vila velha', 'serra', 'cariacica', 'viana', 'guarapari') then 'vv'
     when k in ('sao paulo', 'guarulhos', 'mogi das cruzes', 'suzano', 'biritiba mirim', 'salesopolis', 'osasco', 'santo andre',
                'sao bernardo do campo', 'sao caetano do sul', 'diadema', 'taboao da serra', 'barueri', 'poa', 'itaquaquecetuba',
                'ferraz de vasconcelos', 'aruja') then 'sp'
     when k in ('porto alegre', 'canoas', 'esteio', 'sapucaia do sul', 'alvorada', 'gravatai', 'cachoeirinha', 'viamao',
                'novo hamburgo', 'sao leopoldo') then 'poa'
   end
   from (select public._territorio_chave(p_cidade) k) s $$;

-- a praça pedida: null, '' ou 'todas' = todas; 'es' é a de Vitória/Vila Velha
create or replace function public._territorio_filtro(p_praca text)
 returns text language sql immutable set search_path = public, pg_temp as
$$ select case when lower(coalesce(p_praca, '')) in ('', 'todas') then null
               when lower(p_praca) = 'es' then 'vv' else lower(p_praca) end $$;

-- ── 1 · o time do território: dono, nome, praça, rampagem e as áreas vigentes ────────────────────────────────
create or replace function public._territorio_time()
 returns table (owner_id text, nome text, praca text, ramp text, areas jsonb)
 language sql stable security definer set search_path = public, pg_temp as
$$
  with t as (
    select x.value as t
      from public.cockpit_config c, jsonb_array_elements(coalesce(c.conteudo -> 'territorios', '[]'::jsonb)) x
     where c.chave = 'territorios'
  ), a as (
    select t ->> 'rep' as rep, jsonb_agg(ar.value) as areas
      from t, jsonb_array_elements(case when jsonb_typeof(t -> 'areas') = 'array' then t -> 'areas' else '[]'::jsonb end) ar
     where coalesce((t ->> 'ativo')::boolean, true)
       and coalesce(t ->> 'rep', '') !~* 'teste'
       and nullif(trim(coalesce(ar.value ->> 'municipio', '')), '') is not null
       and (ar.value ->> 'ate' is null or (ar.value ->> 'ate')::date > public._territorio_hoje())
     group by 1
  )
  select distinct on (p.id_hubspot) p.id_hubspot, coalesce(nullif(e.nome, ''), p.full_name),
         public._territorio_praca(a.areas -> 0 ->> 'municipio'), e.ramp_stage, a.areas
    from a
    join public.equipe_cockpit e on public._territorio_chave(e.nome) = public._territorio_chave(a.rep)
    join public.profiles p on p.id = e.profile_id
   where e.ativo and not coalesce(e.so_acesso, false) and p.id_hubspot is not null
   order by p.id_hubspot, e.nome
$$;

-- a cobertura oficial: (dono, município, bairro) — bairro null = o município inteiro
create or replace function public._territorio_cobre()
 returns table (owner_id text, nome text, km text, kb text, bairro text)
 language sql stable security definer set search_path = public, pg_temp as
$$
  select t.owner_id, t.nome, public._territorio_chave(a.value ->> 'municipio'), public._territorio_chave(b.b), b.b
    from public._territorio_time() t
    cross join lateral jsonb_array_elements(t.areas) a
    cross join lateral (
      select null::text as b where coalesce((a.value ->> 'todoOMunicipio')::boolean, false)
      union all
      select x from jsonb_array_elements_text(case when jsonb_typeof(a.value -> 'bairros') = 'array' then a.value -> 'bairros' else '[]'::jsonb end) x
       where not coalesce((a.value ->> 'todoOMunicipio')::boolean, false)
    ) b
$$;

-- ── 2 · a base: um recém-aberto por linha, com as marcas do funil (uma passada; todas as leituras usam esta) ─
create or replace function public._territorio_base()
 returns table (
   id uuid, nome text, bairro text, cidade text, estado text, km text, kb text, lat double precision, lng double precision,
   owner_raw text, owner_id text, praca text, status text, criado date, criado_em timestamptz, abertura date, idade integer,
   expirado_em date, visitado boolean, primeira_visita timestamptz, negocio boolean, avancou boolean, na_grade boolean,
   sug_viva boolean, sug_ate date, sug_semana boolean, sug_conf boolean, ativo boolean, vence14 boolean, vence_semana boolean)
 language sql stable security definer set search_path = public, pg_temp as
$$
  with h as (
    select public._territorio_hoje() as hoje, public._territorio_semana(public._territorio_hoje()) as sem
  ), tm as (select * from public._territorio_time()),
  l as (
    select lp.*, (lp.created_at at time zone 'America/Sao_Paulo')::date as criado_d,
           (lp.data_abertura at time zone 'UTC')::date as abertura_d
      from public.leads_prospeccao lp, h
     where lp.fonte ilike '%casa dos dados%' and lp.data_abertura is not null
       and (lp.created_at >= (h.hoje - 120)::timestamp at time zone 'America/Sao_Paulo'
            or lp.status in ('pendente', 'atribuido', 'na_rota')
            or lp.expirado_em >= (h.hoje - 14)::timestamp at time zone 'America/Sao_Paulo')
  ), pino as (
    select c.lead_prospeccao_id as lead, c.id as client_id, nullif(trim(coalesce(c.id_hubspot, '')), '') as deal, c.etapa
      from public.clients c join l on l.id = c.lead_prospeccao_id
  ), vis as (
    select p.lead, min(v.visited_at) filter (where v.dia >= l.criado_d) as primeira
      from public._visitas_com_prova((select hoje - 100 from h), (select hoje from h), null) v
      join pino p on p.client_id = v.client_id
      join l on l.id = p.lead
     where v.provada
     group by p.lead
  ), grade as materialized (
    -- uma passada nas grades das 5 semanas e UMA linha por lead (junção, nunca "exists" por lead: reabrir o
    -- JSON das grades para cada um dos ~3 mil leads levava 15 s no Nano)
    select substr(s.k, 3)::uuid as lead, array_agg(distinct ps.owner_id || '|' || ps.data_segunda::text) as chaves
      from public.planos_semanais ps
      cross join h
      cross join lateral jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) d
      cross join lateral jsonb_array_elements(case when jsonb_typeof(d.value) = 'array' then d.value else '[]'::jsonb end) e
      cross join lateral (select case when jsonb_typeof(e.value) = 'object' then e.value ->> 'id' else e.value #>> '{}' end as k) s
     where ps.data_segunda >= h.sem - 35
       and s.k ~ '^n-[0-9a-fA-F-]{36}$'
     group by 1
  ), sug as (
    select s.lead_id,
           bool_or(s.vale_ate >= h.hoje or s.confirmada_em is not null) as viva,
           max(s.vale_ate) filter (where s.vale_ate >= h.hoje and s.confirmada_em is null) as ate,
           bool_or(s.semana = h.sem) as semana,
           bool_or(s.semana = h.sem and s.confirmada_em is not null) as conf
      from public.territorio_sugestoes s, h
     where s.semana >= h.sem - 35
     group by s.lead_id
  )
  select l.id, l.nome, l.bairro, l.cidade, l.estado,
         public._territorio_chave(l.cidade), public._territorio_chave(l.bairro), l.lat, l.lng,
         l.responsavel_owner_id, tm.owner_id, coalesce(tm.praca, public._territorio_praca(l.cidade)),
         l.status, l.criado_d, l.created_at, l.abertura_d, (h.hoje - l.abertura_d),
         (l.expirado_em at time zone 'America/Sao_Paulo')::date,
         vis.primeira is not null, vis.primeira,
         (nullif(trim(coalesce(l.hubspot_deal_id, '')), '') is not null or pino.deal is not null),
         coalesce(pino.etapa in ('Conversa com decisor', 'Demo/Proposta', 'Negociação', 'Ag. Pagamento', 'Enviado Onboarding', 'Ganho'), false),
         g.lead is not null,
         coalesce(sug.viva, false), sug.ate, coalesce(sug.semana, false),
         coalesce(sug.conf, false) or coalesce((l.responsavel_owner_id || '|' || h.sem::text) = any(g.chaves), false),
         l.status in ('pendente', 'atribuido', 'na_rota') and (h.hoje - l.abertura_d) <= 90,
         l.status in ('pendente', 'atribuido') and (h.hoje - l.abertura_d) between 76 and 90
           and vis.primeira is null and nullif(trim(coalesce(l.hubspot_deal_id, '')), '') is null and pino.deal is null,
         l.status in ('pendente', 'atribuido') and (h.hoje - l.abertura_d) <= 90
           and (h.hoje - l.abertura_d) >= 83
           and vis.primeira is null and nullif(trim(coalesce(l.hubspot_deal_id, '')), '') is null and pino.deal is null
    from l cross join h
    left join tm on tm.owner_id = l.responsavel_owner_id
    left join pino on pino.lead = l.id
    left join vis on vis.lead = l.id
    left join sug on sug.lead_id = l.id
    left join grade g on g.lead = l.id
$$;

-- quem está em cada bairro: o dono oficial (do bairro ou do município inteiro), quem marcou dia lá na semana do
-- plano e quem visitou lá com prova em 4 semanas (qualquer executivo; o pino de munição pelo bairro do lead)
create or replace function public._territorio_lugar()
 returns table (praca text, km text, kb text, tipo text, owner_id text, nome text, rotulo text, n bigint)
 language sql stable security definer set search_path = public, pg_temp as
$$
  with h as (select public._territorio_hoje() as hoje, public._territorio_semana(public._territorio_hoje()) as sem),
  tm as (select * from public._territorio_time())
  select tm.praca, c.km, c.kb, case when c.kb is null then 'municipio' else 'dono' end, c.owner_id, c.nome, c.bairro, 0::bigint
    from public._territorio_cobre() c join tm on tm.owner_id = c.owner_id
  union all
  select tm.praca, null::text, public._territorio_chave(regexp_replace(r.value #>> '{}', '^b:', '')), 'dia', ps.owner_id, tm.nome, null::text, count(*)
    from public.planos_semanais ps
    cross join h
    join tm on tm.owner_id = ps.owner_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(ps.regioes) = 'array' then ps.regioes else '[]'::jsonb end) with ordinality r(value, i)
   where ps.data_segunda = h.sem and r.i <= 5 and jsonb_typeof(r.value) = 'string' and (r.value #>> '{}') like 'b:%'
   group by 1, 2, 3, 4, 5, 6, 7
  union all
  select public._territorio_praca(x.cidade), public._territorio_chave(x.cidade), public._territorio_chave(x.bairro), 'visita', x.owner_id, tm.nome, null::text, count(*)
    from (select vv.owner_id, coalesce(lp.cidade, c.cidade) as cidade, coalesce(lp.bairro, c.bairro) as bairro
            from public._visitas_com_prova((select hoje - 27 from h), (select hoje from h), null) vv
            join public.clients c on c.id = vv.client_id
            left join public.leads_prospeccao lp on lp.id = c.lead_prospeccao_id
           where vv.provada) x
    left join tm on tm.owner_id = x.owner_id
   group by 1, 2, 3, 4, 5, 6, 7
$$;

-- ── 3 · territorio_resumo: UMA leitura, UMA passada. A frase, o funil, a tabela, o mapa por bairro, Onde agir,
--    o que vence, a carga (e a do gestor), a fila, contra quem e a carteira de quem saiu.
--    p_com_ids = true (só no clique dos botões congelados): devolve também os ids que eles gravam
--      · ids.carga: N por executivo (p_carga) descontando as vivas dele; os que vencem primeiro, depois os mais
--        novos; nunca o visitado, o na rota/na grade, o com negócio ou o já sugerido (a regra do t3Escolher);
--      · ids.redistribuir [{para, ids}] e ids.sair [ids]: o resgate (a regra do t3Resgate).
--    Os números da tela e os ids saem da MESMA conta: o botão grava exatamente o que diz.
create or replace function public.territorio_resumo(p_praca text default null, p_com_ids boolean default false, p_carga integer default null)
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
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor lê o território' using errcode = '42501'; end if;
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

-- ── 4 · territorio_lista: a lista de um executivo ou de um bairro, sob demanda, até 50 por vez ──────────────
-- p_bairro é a chave que o mapa do resumo devolve (praça|município|bairro). Os que vencem primeiro.
create or replace function public.territorio_lista(p_owner text default null, p_bairro text default null, p_offset integer default 0)
 returns jsonb
 language plpgsql stable security definer set search_path = public, pg_temp as
$function$
declare
  v jsonb;
  v_pr text := split_part(coalesce(p_bairro, ''), '|', 1);
  v_km text := split_part(coalesce(p_bairro, ''), '|', 2);
  v_kb text := split_part(coalesce(p_bairro, ''), '|', 3);
  v_off integer := greatest(0, coalesce(p_offset, 0));
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor lê o território' using errcode = '42501'; end if;
  if coalesce(p_owner, '') = '' and v_kb = '' then raise exception 'diga o executivo ou o bairro' using errcode = '22023'; end if;
  with b as (
    select x.* from public._territorio_base() x
     where x.ativo and not x.visitado
       and (coalesce(p_owner, '') = '' or x.owner_id = p_owner)
       and (v_kb = '' or (x.praca = v_pr and x.km = v_km and x.kb = v_kb and x.status in ('pendente', 'atribuido')))
  ), o as (
    select b.*, row_number() over (order by b.idade desc, b.criado_em desc, b.id) as r from b
  )
  select jsonb_build_object('total', (select count(*) from b), 'offset', v_off, 'por_vez', 50,
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'nome', o.nome, 'bairro', initcap(lower(o.bairro)), 'cidade', initcap(lower(o.cidade)), 'status', o.status,
        'dono', o.owner_raw, 'chegou_ha_d', public._territorio_hoje() - o.criado, 'vence_em_d', greatest(0, 90 - o.idade),
        'sugerido_ate', o.sug_ate, 'negocio', o.negocio) order by o.r)
      from o where o.r > v_off and o.r <= v_off + 50), '[]'::jsonb))
    into v;
  return v;
end;
$function$;


-- ── 5 · territorio_equilibrar: passa N da fila mais longa para quem tem folga ────────────────────────────────
-- Os que vencem primeiro de p_de (livres: atribuído, sem visita, sem negócio, sem sugestão viva); cada um vai para
-- quem recebe e roda mais perto dele (o centro dos recém-abertos ativos de quem recebe), em partes iguais. A troca é
-- a de hoje: redistribuir_recem_abertos (troca o dono e cria a sugestão 'resgate').
create or replace function public.territorio_equilibrar(p_de text, p_para text[], p_n integer)
 returns jsonb
 language plpgsql security definer set search_path = public, pg_temp as
$function$
declare
  v_cap integer;
  v_out jsonb := '{}'::jsonb;
  r record;
  v_ids uuid[];
  v_n integer;
  v_para text;
  v_lote jsonb;
  v_res jsonb;
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor equilibra' using errcode = '42501'; end if;
  if coalesce(array_length(p_para, 1), 0) = 0 or p_n is null or p_n < 1 or p_n > 200 then raise exception 'diga para quem e quantos (1 a 200)' using errcode = '22023'; end if;
  if p_de = any(p_para) then raise exception 'quem passa não recebe' using errcode = '22023'; end if;
  v_cap := ceil(p_n::numeric / array_length(p_para, 1));
  for r in
    with b as (select * from public._territorio_base()),
    esc as (
      select b.id, b.lat, b.lng, b.idade from b
       where b.owner_id = p_de and b.status = 'atribuido' and b.idade <= 90 and not b.visitado and not b.negocio and not b.sug_viva
       order by b.idade desc, b.criado_em limit p_n
    ), cen as (
      select p.para, avg(b.lat) filter (where b.lat <> 0) lat, avg(b.lng) filter (where b.lng <> 0) lng
        from unnest(p_para) p(para) left join b on b.owner_id = p.para and b.ativo group by 1
    ), par as (
      select e.id, c.para,
             row_number() over (partition by e.id order by coalesce((e.lat - c.lat) ^ 2 + (e.lng - c.lng) ^ 2, 1e9), c.para) as pref
        from esc e cross join cen c
    )
    select par.id, array_agg(par.para order by par.pref) as ordem, max(e.idade) as idade
      from par join esc e on e.id = par.id group by par.id order by max(e.idade) desc, par.id
  loop
    -- o mais perto que ainda tem vaga
    select x into v_para from unnest(r.ordem) x where coalesce(jsonb_array_length(v_out -> x), 0) < v_cap limit 1;
    if v_para is null then continue; end if;
    v_lote := coalesce((v_out -> v_para), '[]'::jsonb) || to_jsonb(r.id::text);
    v_out := jsonb_set(v_out, array[v_para], v_lote, true);
  end loop;
  -- grava pela função de hoje: troca o dono e cria a sugestão 'resgate' no plano de quem recebe
  v_res := '{}'::jsonb;
  for v_para in select jsonb_object_keys(v_out) loop
    select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_out -> v_para) x;
    v_n := public.redistribuir_recem_abertos(v_ids, v_para);
    v_res := v_res || jsonb_build_object(v_para, v_n);
  end loop;
  return v_res;
end;
$function$;

-- ── 6 · a medição: as ações novas da v4 ────────────────────────────────────────────────────────────────────
alter table public.aberturas_de_tela drop constraint if exists aberturas_de_tela_acao_check;
alter table public.aberturas_de_tela add constraint aberturas_de_tela_acao_check
  check (acao is null or acao in ('vista', 'ir_para_rua', 'depois', 'fechada_sem_acao', 'passo_marcado', 'marcou_passo', 'ignorou',
    'aberto', 'fechado', 'fechado_com_pendencia', 'definiu_carga', 'pos_no_plano', 'redistribuiu', 'deixou_sair', 'deu_dono',
    'abriu_lista_exec', 'abriu_lista_bairro', 'abriu_previa', 'equilibrou'));

create or replace function public.registrar_abertura(p_tela text, p_origem text, p_acao text default null)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.aberturas_de_tela (pessoa, tela, origem, acao, alvo)
  select (select auth.uid()),
         case when p_tela like 'pessoa:%' then 'pessoa' else p_tela end,
         p_origem, p_acao,
         case when p_tela like 'pessoa:%' then split_part(p_tela, ':', 2) end
   where (select auth.uid()) is not null
     and (p_tela in ('meu_desempenho', 'desenvolvimento', 'folha_manha', 'toast_pos_visita', 'fecho_dia', 'hoje_cockpit', 'pessoas')
          or (p_tela ~ '^pessoa:[0-9A-Za-z_-]{1,40}$' and (select public.eh_gestor_cockpit()))
          or (p_tela = 'territorio' and (select public.eh_gestor_cockpit())))
     and p_origem in ('toast', 'pilula', 'push_seg', 'push_sex', 'menu', 'selo_menu', 'app', 'push_08', 'push_18', 'placa', 'mapa', 'link')
     and (p_acao is null or p_acao in ('vista', 'ir_para_rua', 'depois', 'fechada_sem_acao', 'passo_marcado', 'marcou_passo', 'ignorou',
       'aberto', 'fechado', 'fechado_com_pendencia', 'definiu_carga', 'pos_no_plano', 'redistribuiu', 'deixou_sair', 'deu_dono',
       'abriu_lista_exec', 'abriu_lista_bairro', 'abriu_previa', 'equilibrou'));
$function$;

-- ── 7 · quem pode chamar ───────────────────────────────────────────────────────────────────────────────────
revoke all on function public._territorio_praca(text) from public, anon;
revoke all on function public._territorio_filtro(text) from public, anon;
revoke all on function public._territorio_time() from public, anon, authenticated;
revoke all on function public._territorio_cobre() from public, anon, authenticated;
revoke all on function public._territorio_base() from public, anon, authenticated;
revoke all on function public._territorio_lugar() from public, anon, authenticated;
revoke all on function public.territorio_resumo(text, boolean, integer) from public, anon;
revoke all on function public.territorio_lista(text, text, integer) from public, anon;
revoke all on function public.territorio_equilibrar(text, text[], integer) from public, anon;
revoke all on function public.registrar_abertura(text, text, text) from public, anon;
grant execute on function public._territorio_praca(text) to authenticated;
grant execute on function public._territorio_filtro(text) to authenticated;
grant execute on function public.territorio_resumo(text, boolean, integer) to authenticated;
grant execute on function public.territorio_lista(text, text, integer) to authenticated;
grant execute on function public.territorio_equilibrar(text, text[], integer) to authenticated;
grant execute on function public.registrar_abertura(text, text, text) to authenticated;
