-- VOLTAS DE UM EXECUTIVO (13/11/26) — para o aviso das 8h
--
-- O aviso da manhã só dizia contagem ("6 paradas hoje · 12 leads sem passo") e a entrada dele nem
-- recebia os passos do dia. Contagem não move ninguém; nome de restaurante move (19/10/26).
-- Esta leitura devolve as voltas de UMA pessoa: as de hoje e as vencidas mais recentes, pelo nome.
--
-- A regra é a MESMA da voltas_do_time (0262): a última ficha do negócio antes de hoje marcou o
-- próximo passo como visita; só negócio aberto, no nome da pessoa hoje. Mexer numa é mexer nas duas.
--
-- Só o robô chama (service role): a Edge push-fila. Não é para o navegador.

create or replace function public.voltas_de(p_pessoa uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select id_hubspot as dono from profiles where id = p_pessoa and id_hubspot is not null),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  ant as (
    select distinct on (f.deal_id)
           f.deal_id::text as deal,
           f.proximo_tipo,
           (f.ocorrido_em at time zone 'America/Sao_Paulo')::date as visitou,
           (f.proximo_em at time zone 'America/Sao_Paulo')::date as dia,
           f.horario_dono
      from fichas_de_rua f, hoje
     where f.deal_id is not null
       and f.ocorrido_em > now() - interval '90 days'
       and (f.ocorrido_em at time zone 'America/Sao_Paulo')::date < hoje.d
     order by f.deal_id, f.ocorrido_em desc
  ),
  hoje_feito as (
    select distinct f.deal_id::text as deal
      from fichas_de_rua f, hoje
     where f.deal_id is not null
       and (f.ocorrido_em at time zone 'America/Sao_Paulo')::date = hoje.d
  ),
  base as (
    select a.deal, a.visitou, a.dia, a.horario_dono,
           trim(coalesce(c.empresa, c.nome, 'sem nome')) as nome, c.bairro
      from ant a
      join clients c on c.id_hubspot = a.deal
      join eu on eu.dono = c.vendedor_id_hubspot
      cross join hoje
     where a.proximo_tipo = 'visita'
       and a.dia is not null
       and a.dia <= hoje.d
       and c.etapa in ('Prospecção', 'Visita', 'Conversa com decisor', 'Demo/Proposta', 'Negociação')
       and not exists (select 1 from hoje_feito hf where hf.deal = a.deal)
  )
  select jsonb_build_object(
    'hoje', (select d from hoje),
    'de_hoje', coalesce((select jsonb_agg(jsonb_build_object('deal', deal, 'nome', nome, 'bairro', bairro, 'visitou', visitou, 'dia', dia, 'horario_dono', horario_dono) order by nome)
                           from base, hoje where base.dia = hoje.d), '[]'::jsonb),
    'vencidas', coalesce((select jsonb_agg(x order by x.ordem)
                            from (select deal, nome, bairro, visitou, dia, horario_dono, row_number() over (order by dia desc, nome) as ordem
                                    from base, hoje where base.dia < hoje.d) x
                           where x.ordem <= 3), '[]'::jsonb),
    'n_vencidas', (select count(*) from base, hoje where base.dia < hoje.d)
  );
$$;

revoke all on function public.voltas_de(uuid) from public;
revoke all on function public.voltas_de(uuid) from anon;
revoke all on function public.voltas_de(uuid) from authenticated;
grant execute on function public.voltas_de(uuid) to service_role;
