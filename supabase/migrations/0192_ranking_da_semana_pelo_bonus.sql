-- 0192 (09/10/26): o ranking da SEMANA do app (e a faixa do cockpit do executivo) passa a ser o
-- placar do bônus de R$ 250 — a mesma conta do cockpit do gestor (pontos_da_semana, 0191).
-- O formato do ranking_executivo não muda (podio, eu, destaques, meta_coletiva, campeao); só a
-- semana passa a vir da regra nova. O MÊS e a Temporada (pontos_eventos 20/50/200) ficam como estão.
-- O campeão da semana passa a ser o gravado em bonus_semanal (segunda 08:00); sem isto o app
-- mostraria na segunda o campeão da temporada antiga, por outra regra — dois vencedores.

create or replace function public._ranking_semana_bonus(p_owner text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_seg date := ((now() at time zone 'America/Sao_Paulo')::date - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1));
  v_rk jsonb; v_eu jsonb; v_viz jsonb; v_pos int; v_pts int; v_falta int; v_alvo int; v_txt text; v_prox text;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.pos), '[]'::jsonb) into v_rk from public.pontos_da_semana(v_seg) x;
  select e into v_eu from jsonb_array_elements(v_rk) e where e->>'owner_id' = p_owner;
  if v_eu is not null then
    v_pos := (v_eu->>'pos')::int; v_pts := (v_eu->>'pontos')::int;
    if v_pos > 1 then
      select e into v_viz from jsonb_array_elements(v_rk) e where (e->>'pos')::int = v_pos - 1;
      v_alvo := v_pos - 1;
      v_falta := greatest(1, (v_viz->>'pontos')::int - v_pts + 1);
      v_txt := 'Faltam ' || v_falta || ' pts para o ' || v_alvo || 'º';
      v_prox := case
        when v_falta <= 3 then '1 visita com prova te leva ao ' || v_alvo || 'º'
        when v_falta <= 25 then '1 reunião com desfecho ou ' || ceil(v_falta / 3.0)::int || ' visitas com prova te levam ao ' || v_alvo || 'º'
        when v_falta <= 100 then '1 venda ou ' || ceil(v_falta / 25.0)::int || ' reuniões com desfecho te levam ao ' || v_alvo || 'º'
        else ceil(v_falta / 100.0)::int || ' vendas te levam ao ' || v_alvo || 'º' end;
    else
      select e into v_viz from jsonb_array_elements(v_rk) e where (e->>'pos')::int = 2;
      v_txt := 'Você lidera' || case when v_viz is not null then ' · ' || greatest(0, v_pts - (v_viz->>'pontos')::int) || ' pts à frente do 2º' else '' end;
      v_prox := 'O 1º da semana leva R$ 250 · venda 100 · reunião 25 · visita 3';
    end if;
  end if;
  return jsonb_build_object(
    'periodo', 'semana', 'regra', 'bonus', 'premio', 250,
    'de', (v_seg::timestamp at time zone 'America/Sao_Paulo'), 'ate', ((v_seg + 5)::timestamp at time zone 'America/Sao_Paulo'),
    'podio', coalesce((select jsonb_agg(jsonb_build_object('pos', (e->>'pos')::int, 'nome', e->>'nome', 'avatar_url', e->>'avatar_url', 'pct', null,
        'pts', (e->>'pontos')::int, 'vendas', (e->>'vendas')::int, 'reunioes', (e->>'reunioes')::int, 'visitas', (e->>'visitas')::int) order by (e->>'pos')::int)
      from jsonb_array_elements(v_rk) e where (e->>'pos')::int <= 3), '[]'::jsonb),
    'eu', case when v_eu is null then null else jsonb_build_object(
      'pos', v_pos, 'total', jsonb_array_length(v_rk), 'movimento', null, 'pct', null, 'pts', v_pts, 'meta_pts', null,
      'faltam', v_txt, 'proximo', v_prox,
      'provadas', (v_eu->>'visitas')::int, 'declaradas', 0, 'demos', (v_eu->>'reunioes')::int, 'contratos', (v_eu->>'vendas')::int, 'mrr', 0,
      'vendas', (v_eu->>'vendas')::int, 'reunioes', (v_eu->>'reunioes')::int, 'visitas', (v_eu->>'visitas')::int,
      'nao_pontuaram', (v_eu->>'visitas_fora_do_teto')::int + (v_eu->>'visitas_lead_novo_sem_foto')::int) end,
    'destaques', jsonb_build_array(
      (select jsonb_build_object('titulo', 'Mais visitas com prova', 'nome', e->>'nome', 'valor', (e->>'visitas')::int) from jsonb_array_elements(v_rk) e where (e->>'visitas')::int > 0 order by (e->>'visitas')::int desc, e->>'nome' limit 1),
      (select jsonb_build_object('titulo', 'Mais reuniões com desfecho', 'nome', e->>'nome', 'valor', (e->>'reunioes')::int) from jsonb_array_elements(v_rk) e where (e->>'reunioes')::int > 0 order by (e->>'reunioes')::int desc, e->>'nome' limit 1),
      (select jsonb_build_object('titulo', 'Mais vendas', 'nome', e->>'nome', 'valor', (e->>'vendas')::int) from jsonb_array_elements(v_rk) e where (e->>'vendas')::int > 0 order by (e->>'vendas')::int desc, e->>'nome' limit 1)),
    'meta_coletiva', (select jsonb_build_object(
        'feitos', coalesce(sum(coalesce((rv.value->>'fechadosNoMes')::int, 0)), 0),
        'meta', coalesce(sum(coalesce(nullif(rv.value->>'metaMensal', '')::int, 0)), 0))
      from public.cockpit_snapshot s, jsonb_each(s.conteudo->'reps') rv where s.chave = 'hubspot'),
    'campeao', (select jsonb_build_object('semana', b.semana,
        'inicio', (b.semana::timestamp at time zone 'America/Sao_Paulo'), 'fim', ((b.semana + 5)::timestamp at time zone 'America/Sao_Paulo'),
        'fechada_em', b.gravado_em, 'nome', b.nome, 'pct', null, 'pts', b.pontos,
        'contratos', (select (l->>'vendas')::int from jsonb_array_elements(b.detalhe->'linhas') l where l->>'owner_id' = b.owner_id limit 1),
        'premio_texto', 'R$ 250',
        'minha_pos', (select (l->>'pos')::int from jsonb_array_elements(b.detalhe->'linhas') l where l->>'owner_id' = p_owner limit 1), 'meu_pct', null)
      from public.bonus_semanal b where b.semana = v_seg - 7)
  );
end;
$$;
revoke all on function public._ranking_semana_bonus(text) from public, anon, authenticated;

do $mig$
declare d text;
begin
  select pg_get_functiondef('public.ranking_executivo(text)'::regprocedure) into d;
  if position('  if not v_pode then return jsonb_build_object(''erro'', ''Sem acesso ao ranking.''); end if;' in d) = 0 then
    raise exception '0192: ranking_executivo mudou; revisar à mão';
  end if;
  if position('_ranking_semana_bonus' in d) = 0 then
    d := replace(d, '  if not v_pode then return jsonb_build_object(''erro'', ''Sem acesso ao ranking.''); end if;',
      '  if not v_pode then return jsonb_build_object(''erro'', ''Sem acesso ao ranking.''); end if;' || E'\n'
      || '  -- 0192: a semana é o placar do bônus (pontos_da_semana); o mês segue a temporada' || E'\n'
      || '  if coalesce(p_periodo, ''semana'') = ''semana'' then return public._ranking_semana_bonus(v_owner); end if;');
    execute d;
  end if;
end
$mig$;

-- quem está logo acima e logo abaixo (Meu desempenho do app): na semana, o mesmo placar do bônus
create or replace function public.vizinhos_no_ranking(p_periodo text default 'semana')
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_owner text; v_res jsonb; v_seg date;
begin
  select p.id_hubspot into v_owner from public.profiles p where p.id = (select auth.uid());
  if v_owner is null then return '[]'::jsonb; end if;
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())
          or exists (select 1 from public.equipe_cockpit e where e.profile_id = (select auth.uid()) and e.ativo)) then
    return '[]'::jsonb;
  end if;
  if coalesce(p_periodo, 'semana') = 'semana' then
    v_seg := ((now() at time zone 'America/Sao_Paulo')::date - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1));
    with rk as (select * from public.pontos_da_semana(v_seg)), eu as (select pos from rk where owner_id = v_owner)
    select coalesce(jsonb_agg(jsonb_build_object('pos', rk.pos, 'nome', rk.nome, 'avatar_url', rk.avatar_url, 'pts', rk.pontos,
             'pct', null, 'eu', rk.owner_id = v_owner) order by rk.pos), '[]'::jsonb)
      into v_res from rk, eu where rk.pos between eu.pos - 1 and eu.pos + 1;
    return v_res;
  end if;
  with rk as (select * from public._ranking_ordenado(p_periodo)),
       eu as (select pos from rk where owner_id = v_owner)
  select coalesce(jsonb_agg(jsonb_build_object('pos', rk.pos, 'nome', rk.nome, 'avatar_url', rk.avatar_url, 'pts', rk.pts,
           'pct', rk.pct, 'eu', rk.owner_id = v_owner) order by rk.pos), '[]'::jsonb)
    into v_res from rk, eu where rk.pos between eu.pos - 1 and eu.pos + 1;
  return v_res;
end $function$;

-- o Meu desempenho do app recebe a regra e a conta do placar junto da posição
do $mig$
declare d text;
begin
  select pg_get_functiondef('public.meu_desempenho()'::regprocedure) into d;
  if position('''faltam'', v_rk -> ''eu'' -> ''faltam'', ''proximo'', v_rk -> ''eu'' -> ''proximo'', ''podio'', v_rk -> ''podio'') end,' in d) = 0 then
    raise exception '0192: meu_desempenho mudou; revisar à mão';
  end if;
  d := replace(d, '''faltam'', v_rk -> ''eu'' -> ''faltam'', ''proximo'', v_rk -> ''eu'' -> ''proximo'', ''podio'', v_rk -> ''podio'') end,',
    '''faltam'', v_rk -> ''eu'' -> ''faltam'', ''proximo'', v_rk -> ''eu'' -> ''proximo'', ''podio'', v_rk -> ''podio'',' || E'\n'
    || '      ''regra'', v_rk -> ''regra'', ''premio'', v_rk -> ''premio'', ''vendas'', v_rk -> ''eu'' -> ''vendas'', ''reunioes'', v_rk -> ''eu'' -> ''reunioes'',' || E'\n'
    || '      ''visitas'', v_rk -> ''eu'' -> ''visitas'', ''nao_pontuaram'', v_rk -> ''eu'' -> ''nao_pontuaram'') end,');
  execute d;
end
$mig$;
