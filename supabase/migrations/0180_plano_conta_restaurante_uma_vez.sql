-- 0180 · O plano conta cada restaurante uma vez por dia (07/10/2026)
--
-- Medido na semana de 05/10: 12 restaurantes estavam DUAS vezes no mesmo dia do plano — o lead de
-- prospecção (n-…) virou negócio (c-…) e a grade guardou os dois, ou dois negócios do mesmo lugar.
-- Só o André tinha 6 em 07/10: o plano real era 9 (o que o app mostra) e o gestor contava 15.
--
-- planejamento_do_time passa a contar por restaurante (o cliente do mapa, ou o nome quando não há
-- lugar), preferindo o negócio ao lead. A lista crua (planoIds) não muda: ela diz se um negócio
-- está no plano, e o id do negócio tem de continuar lá.

do $$
declare v_def text; v_novo text;
begin
  v_def := pg_get_functiondef('public.planejamento_do_time(date, text[], date)'::regprocedure);
  if position('itens_u' in v_def) > 0 then return; end if;
  v_novo := replace(v_def,
    E'  ), itens_feitos as (\n    select i.*, exists (select 1 from vis where vis.owner_id = i.owner_id and vis.dia = i.dia and vis.client_id = i.client_id) as feita\n      from itens i\n',
    E'  ), itens_u as (\n    select distinct on (i.owner_id, i.dia, coalesce(i.client_id::text, public.plano_nome_chave(i.nome), i.item_id)) i.*\n      from itens i\n     order by i.owner_id, i.dia, coalesce(i.client_id::text, public.plano_nome_chave(i.nome), i.item_id), (left(i.item_id, 2) = ''n-''), i.vaga\n  ), itens_feitos as (\n    select i.*, exists (select 1 from vis where vis.owner_id = i.owner_id and vis.dia = i.dia and vis.client_id = i.client_id) as feita\n      from itens_u i\n');
  v_novo := replace(v_novo,
    '(select count(*) from itens i where i.owner_id = pe.dono and i.dia = d.dia) as planejadas,',
    '(select count(*) from itens_u i where i.owner_id = pe.dono and i.dia = d.dia) as planejadas,');
  v_novo := replace(v_novo,
    '(select count(*) from itens i where i.owner_id = pe.dono and i.dia = d.dia and i.client_id is null) as sem_lugar,',
    '(select count(*) from itens_u i where i.owner_id = pe.dono and i.dia = d.dia and i.client_id is null) as sem_lugar,');
  if (select count(*) from regexp_matches(v_novo, 'itens_u', 'g')) <> 4 then
    raise exception '0180: âncoras do planejamento_do_time não bateram';
  end if;
  execute v_novo;
end $$;

create or replace function public.meu_plano_sem_lugar(p_dia date)
returns table(item_id text, nome text, etapa text)
language sql stable security definer set search_path to 'public' as $function$
  select x.item_id, x.nome, x.etapa from (
    select distinct on (coalesce(public.plano_nome_chave(i.nome), i.item_id)) i.item_id, i.nome, en.dealstage as etapa, i.vaga
      from public.itens_do_plano(
             p_dia - (extract(isodow from p_dia)::int - 1),
             array(select p.id_hubspot from public.profiles p where p.id = (select auth.uid()) and p.id_hubspot is not null)) i
      left join public.espelho_negocios en on left(i.item_id, 2) in ('c-', 'r-') and en.deal_id = substr(i.item_id, 3)
     where i.dia = p_dia and i.client_id is null
     order by coalesce(public.plano_nome_chave(i.nome), i.item_id), (left(i.item_id, 2) = 'n-'), i.vaga
  ) x order by x.vaga
$function$;
revoke all on function public.meu_plano_sem_lugar(date) from public, anon;
grant execute on function public.meu_plano_sem_lugar(date) to authenticated;
