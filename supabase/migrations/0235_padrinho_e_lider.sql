-- 0235 · Padrinho e próximo líder de praça (handoff "Acelerar Field Sales v2", telas 5a e 5b)
--
-- Nenhuma tabela nova. Os 4 critérios do Playbook saem do que já existe:
--   1 · 3 meses no ritmo           visitas com prova ÷ dias úteis, 6 por dia, nos 3 meses fechados
--   2 · demo vira cliente acima    clientes (contrato − estorno do negócio) ÷ demos nos 3 meses fechados,
--       da média do time           contra a mesma conta do time (o cockpit soma o time, sem a rampa)
--   3 · nenhuma ocorrência de      ocorrências do combinado 5 (registro verdadeiro) ou de registro falso
--       registro                   (0232), desde a entrada
--   4 · uma turma bem formada      afilhado da Rampa (0231) com a rua aprovada até o dia 60 (ou até a
--                                  data estendida no dia 45)
-- Os afilhados vêm de rampa_pessoas.padrinho, inclusive os que já saíram da rampa, no mesmo formato do
-- rampa_quadro() — o cockpit lê fase e prazo com as mesmas funções da aba Rampa.
-- "Indicar padrinho" grava em rampa_pessoas.padrinho (a política de 0231 já deixa só o gestor).
-- Só o gestor recebe o quadro. Nada aqui escreve no HubSpot.

create or replace function public.lider_quadro()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_de date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '3 months')::date;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_meses jsonb;
  v_conv jsonb;
begin
  if auth.uid() is null or not coalesce((select public.eh_gestor_cockpit()), false) then
    return jsonb_build_object('erro', 'só o gestor');
  end if;
  for r in
    select e.profile_id as pessoa, p.id_hubspot as owner_id, coalesce(e.nome, p.full_name) as nome, e.criado_em,
           coalesce(e.ramp_stage, '') = 'preparacao'
             or exists (select 1 from public.rampa_pessoas rp where rp.pessoa = e.profile_id and rp.encerrada_em is null) as em_rampa
      from public.equipe_cockpit e
      join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false)
     order by coalesce(e.nome, p.full_name)
  loop
    /* visitas com prova por mês: os 3 fechados e o corrente (a mesma porta no mesmo dia conta uma vez) */
    with v as (
      select distinct x.client_id, x.dia from public._visitas_com_prova(v_de, v_hoje, r.pessoa) x where x.provada
    ), m as (
      select date_trunc('month', v.dia)::date as mes, count(*) as n from v group by 1
    )
    select coalesce(jsonb_agg(jsonb_build_object('mes', g::date, 'provadas', coalesce(m.n, 0)) order by g), '[]'::jsonb)
      into v_meses
      from generate_series(v_de, v_mes, interval '1 month') g left join m on m.mes = g::date;

    /* demos e clientes nos 3 meses fechados */
    select jsonb_build_object(
             'demos', count(*) filter (where pe.tipo = 'demo_realizada'),
             'clientes', greatest(count(*) filter (where pe.tipo = 'contrato') - count(*) filter (where pe.tipo = 'estorno' and pe.negocio_id is not null), 0))
      into v_conv
      from public.pontos_eventos pe
     where pe.owner_id = r.owner_id and pe.tipo in ('demo_realizada', 'contrato', 'estorno')
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date >= v_de
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date < v_mes;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'pessoa', r.pessoa, 'ownerId', r.owner_id, 'nome', r.nome, 'emRampa', r.em_rampa, 'desde', (r.criado_em at time zone 'America/Sao_Paulo')::date,
      'meses', v_meses, 'conv', v_conv,
      'registro', (select jsonb_build_object('n', count(*), 'ultima', max(o.dia))
                     from public.ocorrencias o where o.pessoa = r.pessoa and (o.combinado = 5 or o.registro_falso)),
      'afilhados', coalesce((select jsonb_agg(jsonb_build_object(
                     'pessoa', rp.pessoa, 'nome', coalesce(ea.nome, pa.full_name), 'inicio', rp.inicio, 'turma', rp.turma, 'encerradaEm', rp.encerrada_em,
                     'fases', coalesce((select jsonb_object_agg(f.fase, jsonb_build_object('aprovadaEm', f.aprovada_em, 'estendidaAte', f.estendida_ate))
                                          from public.rampa_fases f where f.pessoa = rp.pessoa), '{}'::jsonb),
                     'decisao', (select jsonb_build_object('decisao', d.decisao, 'novaData', d.nova_data) from public.rampa_decisao_d45 d where d.pessoa = rp.pessoa))
                     order by rp.turma desc)
                   from public.rampa_pessoas rp
                   join public.profiles pa on pa.id = rp.pessoa
                   left join public.equipe_cockpit ea on ea.profile_id = rp.pessoa
                  where rp.padrinho = r.pessoa), '[]'::jsonb)
    ));
  end loop;
  return jsonb_build_object('hoje', v_hoje, 'mes', v_mes, 'de', v_de, 'pessoas', v_out, 'lidoEm', now());
end;
$function$;
revoke all on function public.lider_quadro() from anon, public;
grant execute on function public.lider_quadro() to authenticated;
