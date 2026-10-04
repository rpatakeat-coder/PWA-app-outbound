-- 0160 · Temporada no Meu desempenho: quem está logo acima e logo abaixo (handoff "Abas do app",
-- 04/10/2026, docs/12 §6.4). Mesma tabela e mesma ordem do ranking_executivo (_ranking_ordenado:
-- % da meta, desempate contratos, MRR); o executivo já vê os totais dos colegas no ranking
-- (autorizado em 03/10/26). Só leitura, só para quem está na equipe do Cockpit. Idempotente.
create or replace function public.vizinhos_no_ranking(p_periodo text default 'semana')
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_owner text; v_res jsonb;
begin
  select p.id_hubspot into v_owner from public.profiles p where p.id = (select auth.uid());
  if v_owner is null then return '[]'::jsonb; end if;
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())
          or exists (select 1 from public.equipe_cockpit e where e.profile_id = (select auth.uid()) and e.ativo)) then
    return '[]'::jsonb;
  end if;
  with rk as (select * from public._ranking_ordenado(p_periodo)),
       eu as (select pos from rk where owner_id = v_owner)
  select coalesce(jsonb_agg(jsonb_build_object('pos', rk.pos, 'nome', rk.nome, 'avatar_url', rk.avatar_url, 'pts', rk.pts,
           'pct', rk.pct, 'eu', rk.owner_id = v_owner) order by rk.pos), '[]'::jsonb)
    into v_res from rk, eu where rk.pos between eu.pos - 1 and eu.pos + 1;
  return v_res;
end $$;
revoke all on function public.vizinhos_no_ranking(text) from public, anon;
grant execute on function public.vizinhos_no_ranking(text) to authenticated;
