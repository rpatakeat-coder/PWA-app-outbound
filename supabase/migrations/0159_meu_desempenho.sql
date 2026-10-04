-- 0159 · Meu desempenho numa tela só (handoff "Abas do app", 04/10/2026 — docs/12 §6).
--
-- meu_desempenho(): o placar do executivo com as definições do Cockpit e da temporada. É o
-- corpo do placar_executivo() da 0156 (removido na 0157 junto com o "um app só"), sem a chave
-- de recursos, mais a semana dia a dia e o histórico:
--   visita provada  = _visitas_com_prova().provada (GPS perto do pino ou foto), AO VIVO;
--   semana          = a janela da temporada (segunda 9h a segunda 9h, Brasília);
--   demo realizada  = pontos_eventos 'demo_realizada' (o negócio entrou em Demo/Proposta);
--   contrato        = pontos_eventos 'contrato' (negócio ganho);
--   piso            = 10 visitas provadas + 1 demo realizada;
--   mês / variável  = vendasMes do snapshot no mês de competência × cockpit_config.comissionamento;
--   dias            = a semana por dia, com as MESMAS fontes do bloco semana (a soma bate);
--   historico       = 4 semanas anteriores e 5 meses, pelo livro da temporada.
-- Só leitura. Idempotente.

create or replace function public.meu_desempenho()
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
  v_rk jsonb; v_dias jsonb; v_semanas jsonb; v_meses jsonb;
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

  -- a semana dia a dia (a MESMA janela e as mesmas fontes do bloco semana: a soma bate)
  select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia,
      'provadas', (select count(*) filter (where x.provada) from public._visitas_com_prova(d.dia, d.dia, v_uid) x where x.visited_at >= v_de and x.visited_at < v_ate),
      'demos', (select count(*) from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo = 'demo_realizada'
                  and pe.ref_em >= greatest(v_de, d.dia::timestamp at time zone 'America/Sao_Paulo') and pe.ref_em < least(v_ate, (d.dia + 1)::timestamp at time zone 'America/Sao_Paulo')),
      'contratos', (select count(*) from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo = 'contrato'
                  and pe.ref_em >= greatest(v_de, d.dia::timestamp at time zone 'America/Sao_Paulo') and pe.ref_em < least(v_ate, (d.dia + 1)::timestamp at time zone 'America/Sao_Paulo'))
    ) order by d.dia), '[]'::jsonb)
    into v_dias
    from (select g::date as dia from generate_series((v_de at time zone 'America/Sao_Paulo')::date, v_hoje, interval '1 day') g) d;

  -- histórico pelo livro da temporada: as 4 semanas anteriores e os 5 últimos meses
  select coalesce(jsonb_agg(jsonb_build_object('de', w.de, 'provadas', w.p, 'demos', w.d, 'contratos', w.c) order by w.de), '[]'::jsonb) into v_semanas
    from (select j.de,
            (select count(*) from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo = 'visita_provada' and pe.ref_em >= j.de and pe.ref_em < j.ate) p,
            (select count(*) from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo = 'demo_realizada' and pe.ref_em >= j.de and pe.ref_em < j.ate) d,
            (select count(*) from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo = 'contrato' and pe.ref_em >= j.de and pe.ref_em < j.ate) c
          from generate_series(1, 4) k, lateral public._janela('semana', k) j) w;
  select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m.de at time zone 'America/Sao_Paulo', 'YYYY-MM'), 'provadas', m.p, 'demos', m.d, 'contratos', m.c) order by m.de), '[]'::jsonb) into v_meses
    from (select j.de,
            (select count(*) from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo = 'visita_provada' and pe.ref_em >= j.de and pe.ref_em < j.ate) p,
            (select count(*) from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo = 'demo_realizada' and pe.ref_em >= j.de and pe.ref_em < j.ate) d,
            (select count(*) from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo = 'contrato' and pe.ref_em >= j.de and pe.ref_em < j.ate) c
          from generate_series(0, 4) k, lateral public._janela('mes', k) j) m;

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
      'pos', v_rk -> 'eu' -> 'pos', 'total', v_rk -> 'eu' -> 'total', 'pct', v_rk -> 'eu' -> 'pct', 'pts', v_rk -> 'eu' -> 'pts',
      'faltam', v_rk -> 'eu' -> 'faltam', 'proximo', v_rk -> 'eu' -> 'proximo', 'podio', v_rk -> 'podio') end,
    'dias', v_dias,
    'historico', jsonb_build_object('semanas', v_semanas, 'meses', v_meses),
    'hubspot_em', v_snap_em
  );
end $$;
revoke all on function public.meu_desempenho() from public, anon;
grant execute on function public.meu_desempenho() to authenticated;
