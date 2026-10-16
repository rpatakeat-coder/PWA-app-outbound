-- 0210 · A DISPUTA DA SEMANA PARA O EXECUTIVO (Hoje v4, 16/10/2026)
--
-- A Hoje do executivo (prancha hj.zip, "Disputa da semana") mostra a corrida do bônus de R$ 250 com o
-- time inteiro e os últimos pontos do dia. O executivo só via os dois vizinhos (vizinhos_no_ranking) e
-- o placar detalhado é do gestor. Esta função devolve SÓ TOTAIS (autorizado: o executivo vê os totais
-- dos colegas, 03/10/26) e os eventos do dia SEM nome de cliente:
--   linhas  = pontos_da_semana(segunda desta semana, Brasília) — a MESMA conta do bônus, nada novo;
--   eventos = pontos_eventos de hoje do time, com os pontos do bônus (venda 100, demo 25, visita 3; a
--             visita a restaurante já visitado na semana pelo mesmo executivo vale 0, como no placar).
-- Só responde a quem é do time ativo (equipe_cockpit) ou gestor.
create or replace function public.disputa_da_semana()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_seg date := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_eu text;
  v_linhas jsonb;
  v_eventos jsonb;
begin
  if v_uid is null then return jsonb_build_object('erro', 'sem sessão'); end if;
  select p.id_hubspot into v_eu from profiles p where p.id = v_uid;
  if not exists (select 1 from equipe_cockpit e where e.profile_id = v_uid and e.ativo) then
    return jsonb_build_object('erro', 'fora do time');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('owner_id', x.owner_id, 'nome', x.nome, 'avatar_url', x.avatar_url, 'pts', x.pontos,
           'vendas', x.vendas, 'demos', x.reunioes, 'visitas', x.visitas, 'pos', x.pos, 'eu', x.owner_id = v_eu) order by x.pos), '[]'::jsonb)
    into v_linhas from public.pontos_da_semana(v_seg) x;

  with ev as (
    select pe.owner_id, pe.tipo, pe.ref_em, cv.client_id,
           row_number() over (partition by pe.owner_id, coalesce(cv.client_id::text, pe.origem_id) order by pe.ref_em) as n_no_rest
      from pontos_eventos pe
      left join client_visits cv on pe.tipo = 'visita_provada' and cv.id::text = pe.origem_id
     where pe.tipo in ('contrato', 'demo_realizada', 'visita_provada')
       and (pe.ref_em at time zone 'America/Sao_Paulo')::date between v_seg and v_hoje
       and pe.owner_id in (select (y->>'owner_id') from jsonb_array_elements(v_linhas) y)
  )
  select coalesce(jsonb_agg(jsonb_build_object('em', ev.ref_em, 'owner_id', ev.owner_id,
           'nome', (select y->>'nome' from jsonb_array_elements(v_linhas) y where y->>'owner_id' = ev.owner_id),
           'tipo', ev.tipo,
           'pts', case ev.tipo when 'contrato' then 100 when 'demo_realizada' then 25 else case when ev.n_no_rest = 1 then 3 else 0 end end)
           order by ev.ref_em desc), '[]'::jsonb)
    into v_eventos
    from (select * from ev where (ev.ref_em at time zone 'America/Sao_Paulo')::date = v_hoje order by ev.ref_em desc limit 12) ev;

  return jsonb_build_object('de', v_seg, 'hoje', v_hoje, 'linhas', v_linhas, 'eventos', v_eventos);
end $$;
revoke all on function public.disputa_da_semana() from public, anon;
grant execute on function public.disputa_da_semana() to authenticated;
