-- 0273 · TERRITÓRIO v7 DO GESTOR · O CHÃO (design_handoff_territorio_v7, 17/11/26)
--
-- Por quê: a aba Território passa a ter o BAIRRO como unidade, e a primeira pergunta dela é "o que já temos lá":
-- clientes Takeat ativos, clientes em queda de uso, leads na base, ex-clientes e negócios abertos, por bairro.
-- Essa soma não existia pronta (o territorio_resumo só conhece os bairros com lead novo ou com visita).
--
-- O que entra:
--   · territorio_chao()           — UMA leitura: uma linha curta por bairro com algum dado (cerca de 900), guardada
--                                    em territorio_resumo_cache (chave 'chao') e aquecida pelo mesmo cron de 20 min.
--   · territorio_chao_lista(...)  — a lista por trás de um número, só no clique, 50 por vez.
--
-- As réguas:
--   · cliente ativo   = clientes_takeat com situacao 'ativo' ou 'em_risco' (a mesma base do "cliente que fica");
--   · em queda de uso = cliente ativo com em_queda;
--   · ex-cliente      = clientes_takeat com situacao 'ex'. NUNCA entra em "ativo": o dossiê de 17/11 somou os dois
--                       por engano (ES 545 em vez de 277) e esta função é a correção;
--   · lead na base    = pino de clients com status 'lead', não arquivado (ainda não é cliente);
--   · negócio aberto  = lead na base com negócio no HubSpot, pela etapa (Prospecção até Ag. Pagamento);
--   · o bairro        = _territorio_chave(bairro) dentro de _territorio_chave(cidade), a MESMA chave do resumo
--                       ('praca|municipio|bairro'): o Cockpit junta as duas leituras por ela;
--   · o ponto         = a mediana das coordenadas do bairro (um pino perdido longe não arrasta o ponto), SEM as
--                       coordenadas que são o centro da cidade: muito cliente Takeat foi geocodificado no centro do
--                       município, e a mediana punha Jardim Camburi e Enseada do Suá no mesmo lugar. Centro = a
--                       mesma coordenada em 3 bairros ou mais da mesma cidade. Sem ponto próprio, o bairro vai sem
--                       ponto (o Cockpit usa o do resumo, quando existe, ou deixa fora do mapa);
--   · as praças       = rj, sp e vv (as três que o time cobre);
--   · o nome          = a grafia mais bem escrita do bairro (e do município): com acento antes de sem, com minúsculas antes de
--                       tudo em caixa alta, e só então a mais frequente ("Enseada do Suá", não "ENSEADA DO SUA");
--   · sem bairro no cadastro fica fora dos pontos e é contado em 'fora', por praça, para a tela dizer quanto falta.
--
-- Visitas, dono, "anda lá", leads novos e conversão NÃO estão aqui: já vêm do territorio_resumo e das visitas com
-- prova, e o Cockpit junta. Nada aqui lê ou escreve no HubSpot. Tudo é security definer com checagem de gestor.

create or replace function public._territorio_chao_calc()
 returns jsonb language sql stable security definer set search_path = public, pg_temp as
$$
  with tk as (
    select public._territorio_praca(t.cidade) as pk, public._territorio_chave(t.cidade) as km, public._territorio_chave(t.bairro) as kb,
           t.bairro, t.cidade, t.latitude as lat, t.longitude as lng,
           (t.situacao in ('ativo', 'em_risco'))::int as cli,
           (t.situacao in ('ativo', 'em_risco') and coalesce(t.em_queda, false))::int as queda,
           (t.situacao = 'ex')::int as ex, 0 as base, null::text as etapa
      from public.clientes_takeat t
     where t.situacao in ('ativo', 'em_risco', 'ex')
  ), cl (pk, km, kb, bairro, cidade, lat, lng, cli, queda, ex, base, etapa) as (
    select public._territorio_praca(c.cidade), public._territorio_chave(c.cidade), public._territorio_chave(c.bairro),
           c.bairro, c.cidade, c.latitude::double precision, c.longitude::double precision,
           0, 0, 0, 1, case when nullif(trim(coalesce(c.id_hubspot, '')), '') is not null then c.etapa end
      from public.clients c
     where c.status = 'lead' and not coalesce(c.is_archived, false)
  ), u as (
    select * from tk where pk in ('rj', 'sp', 'vv')
    union all
    select * from cl where pk in ('rj', 'sp', 'vv')
  ), centro as (
    select km, round(lat::numeric, 4) as la, round(lng::numeric, 4) as lo
      from u where lat is not null and lat <> 0 and kb <> ''
     group by 1, 2, 3 having count(distinct kb) >= 3
  ), p as (
    select u.pk, u.km, u.kb,
           percentile_cont(0.5) within group (order by u.lat) as lat,
           percentile_cont(0.5) within group (order by u.lng) as lng
      from u
     where u.lat is not null and u.lat <> 0 and u.kb <> ''
       and not exists (select 1 from centro c where c.km = u.km and c.la = round(u.lat::numeric, 4) and c.lo = round(u.lng::numeric, 4))
     group by 1, 2, 3
  ), nomes as (
    select distinct on (x.pk, x.km, x.kb) x.pk, x.km, x.kb, x.v as nome
      from (select pk, km, kb, trim(bairro) as v, count(*) as n from u where kb <> '' group by 1, 2, 3, 4) x
     order by x.pk, x.km, x.kb, (x.v ~ '[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]') desc, (x.v <> upper(x.v)) desc, x.n desc, x.v
  ), cidades as (
    select distinct on (x.pk, x.km) x.pk, x.km, x.v as cidade
      from (select pk, km, trim(cidade) as v, count(*) as n from u group by 1, 2, 3) x
     order by x.pk, x.km, (x.v ~ '[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]') desc, (x.v <> upper(x.v)) desc, x.n desc, x.v
  ), g as (
    select pk, km, kb,
           sum(cli) as cli, sum(queda) as queda, sum(base) as base, sum(ex) as ex,
           count(*) filter (where etapa in ('Prospecção', 'PROSPECÇÃO (PAP)')) as e0,
           count(*) filter (where etapa = 'Visita') as e1,
           count(*) filter (where etapa = 'Conversa com decisor') as e2,
           count(*) filter (where etapa = 'Demo/Proposta') as e3,
           count(*) filter (where etapa = 'Negociação') as e4,
           count(*) filter (where etapa = 'Ag. Pagamento') as e5
      from u
     where kb <> ''
     group by 1, 2, 3
  ), fora as (
    select pk, jsonb_build_object('cli', sum(cli) filter (where kb = ''), 'queda', sum(queda) filter (where kb = ''), 'base', sum(base) filter (where kb = ''), 'ex', sum(ex) filter (where kb = ''),
                                  'sem', count(*) filter (where kb = ''), 'total', count(*)) as j
      from u group by 1
  )
  select jsonb_build_object(
    'lido_em', now(),
    'hoje', public._territorio_hoje(),
    'fora', coalesce((select jsonb_object_agg(pk, j) from fora), '{}'::jsonb),
    'bairros', coalesce((select jsonb_agg(jsonb_build_array(
        g.pk || '|' || g.km || '|' || g.kb, nm.nome, cd.cidade, g.pk,
        round(p.lat::numeric, 5), round(p.lng::numeric, 5),
        cli, queda, base, ex, e0, e1, e2, e3, e4, e5) order by g.pk, cli desc, base desc, g.kb)
      from g
      join nomes nm on nm.pk = g.pk and nm.km = g.km and nm.kb = g.kb
      join cidades cd on cd.pk = g.pk and cd.km = g.km
      left join p on p.pk = g.pk and p.km = g.km and p.kb = g.kb), '[]'::jsonb))
$$;

create or replace function public.territorio_chao()
 returns jsonb language plpgsql security definer set search_path = public, pg_temp as
$$
declare v jsonb;
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor lê o território' using errcode = '42501'; end if;
  select c.conteudo into v from public.territorio_resumo_cache c where c.praca = 'chao' and c.gerado_em > now() - interval '40 minutes';
  if v is null then
    v := public._territorio_chao_calc();
    insert into public.territorio_resumo_cache (praca, conteudo, gerado_em) values ('chao', v, now())
    on conflict (praca) do update set conteudo = excluded.conteudo, gerado_em = excluded.gerado_em;
  end if;
  return v;
end;
$$;

-- o mesmo cron de 20 minutos passa a aquecer também o chão (uma linha a mais no laço; nenhuma agenda nova)
create or replace function public.territorio_resumo_aquecer()
 returns integer language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_pr text; v_n integer := 0;
begin
  foreach v_pr in array array['todas', 'rj', 'sp', 'vv'] loop
    insert into public.territorio_resumo_cache (praca, conteudo, gerado_em)
    values (v_pr, public._territorio_resumo_calc(case when v_pr = 'todas' then null else v_pr end, false, null), now())
    on conflict (praca) do update set conteudo = excluded.conteudo, gerado_em = excluded.gerado_em;
    v_n := v_n + 1;
  end loop;
  insert into public.territorio_resumo_cache (praca, conteudo, gerado_em) values ('chao', public._territorio_chao_calc(), now())
  on conflict (praca) do update set conteudo = excluded.conteudo, gerado_em = excluded.gerado_em;
  return v_n + 1;
end;
$$;

-- a lista por trás do número de um bairro: só no clique, 50 por vez
--   p_tipo: 'cli' (clientes ativos) · 'queda' (em queda de uso) · 'ex' (ex-clientes) · 'base' (leads na base) · 'abertos' (negócios abertos)
create or replace function public.territorio_chao_lista(p_k text, p_tipo text, p_offset integer default 0)
 returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as
$$
declare
  v_km text := split_part(p_k, '|', 2);
  v_kb text := split_part(p_k, '|', 3);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v jsonb;
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor lê o território' using errcode = '42501'; end if;
  if v_kb = '' then return jsonb_build_object('total', 0, 'itens', '[]'::jsonb); end if;
  if p_tipo in ('cli', 'queda', 'ex') then
    with q as (
      select t.nome, t.situacao, coalesce(t.em_queda, false) as em_queda, t.motivo_queda, t.ultima_comanda, t.plano
        from public.clientes_takeat t
       where public._territorio_chave(t.cidade) = v_km and public._territorio_chave(t.bairro) = v_kb
         and case p_tipo when 'ex' then t.situacao = 'ex'
                         when 'queda' then t.situacao in ('ativo', 'em_risco') and coalesce(t.em_queda, false)
                         else t.situacao in ('ativo', 'em_risco') end
    )
    select jsonb_build_object('total', (select count(*) from q),
      'itens', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'queda', x.em_queda, 'motivo', x.motivo_queda,
                 'ultima', x.ultima_comanda, 'plano', x.plano))
               from (select * from q order by em_queda desc, nome offset v_off limit 50) x), '[]'::jsonb))
      into v;
  else
    with q as (
      select coalesce(nullif(trim(c.empresa), ''), c.nome) as nome, c.etapa, nullif(trim(coalesce(c.id_hubspot, '')), '') as deal, c.vendedor_id_hubspot as dono
        from public.clients c
       where c.status = 'lead' and not coalesce(c.is_archived, false)
         and public._territorio_chave(c.cidade) = v_km and public._territorio_chave(c.bairro) = v_kb
         and (p_tipo <> 'abertos' or (nullif(trim(coalesce(c.id_hubspot, '')), '') is not null
              and c.etapa in ('Prospecção', 'PROSPECÇÃO (PAP)', 'Visita', 'Conversa com decisor', 'Demo/Proposta', 'Negociação', 'Ag. Pagamento')))
    )
    select jsonb_build_object('total', (select count(*) from q),
      'itens', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'etapa', x.etapa, 'deal', x.deal, 'dono', x.dono))
               from (select * from q order by (deal is null), nome offset v_off limit 50) x), '[]'::jsonb))
      into v;
  end if;
  return v;
end;
$$;

-- recriar função no schema public devolve execute ao anon: revoga de public e anon, dá a quem está logado
revoke all on function public._territorio_chao_calc() from public, anon, authenticated;
revoke all on function public.territorio_chao() from public, anon;
revoke all on function public.territorio_chao_lista(text, text, integer) from public, anon;
revoke all on function public.territorio_resumo_aquecer() from public, anon, authenticated;
grant execute on function public.territorio_chao() to authenticated;
grant execute on function public.territorio_chao_lista(text, text, integer) to authenticated;
