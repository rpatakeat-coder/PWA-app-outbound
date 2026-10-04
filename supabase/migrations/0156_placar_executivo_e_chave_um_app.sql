-- 0156 · Um app só, PR 1 (04/10/2026): o placar com uma conta só, e a chave por pessoa.
--
-- 1. placar_executivo() — UMA função para o placar do executivo (topo da Tarefas e a
--    folha que a pílula do Mapa abre). Antes o mesmo "como estou indo" vinha de seis
--    lugares com contas diferentes (Meu dia em números, Meu desempenho, Portões do dia,
--    anel do mês, régua da excelência, faixa da temporada). Definições:
--      visita provada  = _visitas_com_prova().provada (GPS perto do pino ou foto), AO VIVO;
--      sem prova       = as outras visitas do dia (declaradas ou longe do pino), à parte;
--      semana          = a janela da temporada (segunda 9h a segunda 9h, Brasília);
--      demo realizada  = pontos_eventos 'demo_realizada' (negócio entrou em Demo/Proposta);
--      contrato        = pontos_eventos 'contrato' (negócio ganho, vendas do robô);
--      pontos          = soma do livro da temporada (o mesmo número do ranking);
--      piso da semana  = 10 visitas provadas + 1 demo realizada;
--      mês             = vendasMes do snapshot no mês de competência (a fonte do variável
--                        no Cockpit) × a tabela cockpit_config.comissionamento (retroativa);
--      régua           = negócios abertos com próximo passo datado (funilLeads) e visitas
--                        da semana com o registro (ficha) no mesmo dia.
--    Sem dono no HubSpot: {sem_carteira: true} — a tela diz "não há carteira para medir",
--    nunca zero.
-- 2. feature_flags + meus_recursos() — cada fase do "um app só" liga por pessoa
--    (profile_id) ou para todos (profile_id nulo). Só o gestor grava.
--
-- Idempotente.

create table if not exists public.feature_flags (
  id bigint generated always as identity primary key,
  chave text not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  ligado boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
create unique index if not exists feature_flags_chave_pessoa on public.feature_flags (chave, coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.feature_flags enable row level security;
drop policy if exists feature_flags_le on public.feature_flags;
create policy feature_flags_le on public.feature_flags for select to authenticated
  using (profile_id is null or profile_id = (select auth.uid()) or (select public.is_field_admin()) or (select public.eh_gestor_cockpit()));
drop policy if exists feature_flags_gestor_grava on public.feature_flags;
create policy feature_flags_gestor_grava on public.feature_flags for all to authenticated
  using ((select public.is_field_admin()) or (select public.eh_gestor_cockpit()))
  with check ((select public.is_field_admin()) or (select public.eh_gestor_cockpit()));
revoke all on public.feature_flags from anon;

-- a regra: a linha da pessoa vence a linha de todos; sem linha nenhuma, desligado
create or replace function public.meus_recursos()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(x.chave, x.ligado), '{}'::jsonb)
  from (
    select distinct on (f.chave) f.chave, f.ligado
      from public.feature_flags f
     where f.profile_id = (select auth.uid()) or f.profile_id is null
     order by f.chave, (f.profile_id is null)
  ) x;
$$;
revoke all on function public.meus_recursos() from public, anon;
grant execute on function public.meus_recursos() to authenticated;

create or replace function public.placar_executivo()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM');
  v_meta_dia int; v_meta_padrao int;
  v_de timestamptz; v_ate timestamptz;
  v_prov_hoje int := 0; v_sem_prova_hoje int := 0; v_prov_sem int := 0;
  v_demos int := 0; v_contratos int := 0; v_pts int := 0; v_meta_pts int;
  v_snap jsonb; v_snap_em timestamptz; v_rep jsonb;
  v_fechados int := 0; v_meta_mes int;
  v_cfg jsonb; v_faixa jsonb; v_por_cliente numeric := 0; v_total numeric := 0; v_total_mais1 numeric := 0;
  v_deg_de int; v_deg_pc numeric; f jsonb;
  v_abertos int := 0; v_com_passo int := 0; v_vis int := 0; v_vis_reg int := 0;
  v_rk jsonb;
begin
  if v_uid is null then return jsonb_build_object('erro', 'sem sessão'); end if;
  select p.id_hubspot into v_owner from public.profiles p where p.id = v_uid;
  if v_owner is null or v_owner = '' then return jsonb_build_object('sem_carteira', true); end if;

  v_meta_dia := coalesce(public.meta_visitas(v_uid, v_hoje), 6);
  v_meta_padrao := coalesce(
    (select nullif(g.meta_visitas_dia, 0) from public.seller_visit_goals g where g.seller_id = v_uid),
    (select nullif(r.meta_visitas_dia, 0) from public.route_config r order by r.id limit 1), 6);
  v_meta_pts := coalesce((select nullif(g.meta_pts_semana, 0) from public.seller_visit_goals g where g.seller_id = v_uid), 1000);
  select j.de, j.ate into v_de, v_ate from public._janela('semana', 0) j;

  -- visitas: ao vivo
  select count(*) filter (where x.provada), count(*) filter (where not x.provada)
    into v_prov_hoje, v_sem_prova_hoje
    from public._visitas_com_prova(v_hoje, v_hoje, v_uid) x;
  select count(*) filter (where x.provada) into v_prov_sem
    from public._visitas_com_prova((v_de at time zone 'America/Sao_Paulo')::date, v_hoje, v_uid) x
   where x.visited_at >= v_de and x.visited_at < v_ate;

  -- demos, contratos e pontos: o livro da temporada
  select count(*) filter (where pe.tipo = 'demo_realizada'), count(*) filter (where pe.tipo = 'contrato'), coalesce(sum(pe.pts), 0)
    into v_demos, v_contratos, v_pts
    from public.pontos_eventos pe
   where pe.owner_id = v_owner and pe.ref_em >= v_de and pe.ref_em < v_ate;

  -- mês: vendas do robô no mês de competência + a tabela do variável
  select s.conteudo, s.atualizado_em into v_snap, v_snap_em from public.cockpit_snapshot s where s.chave = 'hubspot';
  v_rep := v_snap -> 'reps' -> v_owner;
  select count(*) into v_fechados
    from jsonb_array_elements(case jsonb_typeof(v_snap -> 'vendasMes') when 'array' then v_snap -> 'vendasMes' else '[]'::jsonb end) x
   where x ->> 'ownerId' = v_owner and coalesce(x ->> 'mesDeCompetencia', left(x ->> 'closedate', 7)) = v_mes;
  v_meta_mes := coalesce(nullif(v_rep ->> 'metaMensal', '')::int, 10);
  select c.conteudo into v_cfg from public.cockpit_config c where c.chave = 'comissionamento';
  if v_cfg is not null and jsonb_typeof(v_cfg -> 'faixas') = 'array' then
    for f in select * from jsonb_array_elements(v_cfg -> 'faixas') loop
      if v_fechados >= coalesce((f ->> 'de')::int, 0) and (f ->> 'ate' is null or v_fechados <= (f ->> 'ate')::int) then v_faixa := f; end if;
      if coalesce((f ->> 'de')::int, 0) > v_fechados and (v_deg_de is null or (f ->> 'de')::int < v_deg_de) then
        v_deg_de := (f ->> 'de')::int; v_deg_pc := coalesce((f ->> 'porCliente')::numeric, 0);
      end if;
    end loop;
    v_por_cliente := coalesce((v_faixa ->> 'porCliente')::numeric, 0);
    v_total := v_fechados * v_por_cliente;
    -- a próxima venda: o total com mais um cliente, na faixa em que ele cair
    select coalesce((v_fechados + 1) * (ff ->> 'porCliente')::numeric, v_total) into v_total_mais1
      from jsonb_array_elements(v_cfg -> 'faixas') ff
     where v_fechados + 1 >= coalesce((ff ->> 'de')::int, 0) and (ff ->> 'ate' is null or v_fechados + 1 <= (ff ->> 'ate')::int)
     limit 1;
  end if;

  -- régua: próximo passo datado (funil aberto do robô) e visita registrada no dia
  select count(*), count(*) filter (where nullif(d ->> 'proximaAtividade', '') is not null)
    into v_abertos, v_com_passo
    from jsonb_each(case jsonb_typeof(v_snap -> 'funilLeads') when 'object' then v_snap -> 'funilLeads' else '{}'::jsonb end) e,
         jsonb_array_elements(case jsonb_typeof(e.value) when 'array' then e.value else '[]'::jsonb end) d
   where e.key in ('1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473')
     and d ->> 'ownerId' = v_owner;
  select count(*), count(*) filter (where exists (
           select 1 from public.fichas_de_rua fr
            where fr.client_id = v.client_id and fr.criado_por = v_uid
              and (fr.criado_em at time zone 'America/Sao_Paulo')::date = (v.visited_at at time zone 'America/Sao_Paulo')::date))
    into v_vis, v_vis_reg
    from public.client_visits v
   where v.visited_by = v_uid and v.visited_at >= v_de and v.visited_at < v_ate;

  begin v_rk := public.ranking_executivo('semana'); exception when others then v_rk := null; end;

  return jsonb_build_object(
    'sem_carteira', false,
    'hoje', jsonb_build_object('provadas', v_prov_hoje, 'sem_prova', v_sem_prova_hoje, 'meta', v_meta_dia, 'dia', v_hoje),
    'semana', jsonb_build_object(
      'de', v_de, 'ate', v_ate, 'provadas', v_prov_sem, 'meta', v_meta_padrao * 5,
      'demos', v_demos, 'contratos', v_contratos, 'pts', v_pts, 'meta_pts', v_meta_pts,
      'piso_faltam_provadas', greatest(0, 10 - v_prov_sem), 'piso_faltam_demos', greatest(0, 1 - v_demos)),
    'mes', jsonb_build_object(
      'fechados', v_fechados, 'meta', v_meta_mes,
      'variavel', case when v_cfg is null then null else v_total end,
      'por_cliente', case when v_cfg is null then null else v_por_cliente end,
      'proxima_venda', case when v_cfg is null then null else v_total_mais1 - v_total end,
      'degrau', case when v_deg_de is null then null else jsonb_build_object(
        'clientes', v_deg_de, 'faltam', v_deg_de - v_fechados, 'por_cliente', v_deg_pc,
        'extra', v_deg_de * v_deg_pc - v_total) end),
    'regua', jsonb_build_object(
      'abertos', v_abertos, 'com_passo', v_com_passo,
      'visitas_semana', v_vis, 'visitas_registradas_no_dia', v_vis_reg),
    'temporada', case when v_rk is null or v_rk ? 'erro' then null else jsonb_build_object(
      'pos', v_rk -> 'eu' -> 'pos', 'pct', v_rk -> 'eu' -> 'pct', 'pts', v_rk -> 'eu' -> 'pts',
      'faltam', v_rk -> 'eu' -> 'faltam', 'proximo', v_rk -> 'eu' -> 'proximo', 'podio', v_rk -> 'podio') end,
    'hubspot_em', v_snap_em
  );
end $$;
revoke all on function public.placar_executivo() from public, anon;
grant execute on function public.placar_executivo() to authenticated;
