-- 0237 · Os experimentos do time (handoff "Acelerar Field Sales v2", tela 7a)
--
--   experimentos   hipótese, indicador (uma taxa que o funil já mede), dono, início, fim e o resultado
--                  que o gestor escreve no fim: vira regra no Playbook, descarta ou repete.
--
-- O QUE É MEDIDO SOZINHO. `medida` diz qual régua o cockpit usa para o resultado parcial:
--   horario_dono   conversa com o dono ÷ visitas, das 14h30 às 17h contra o resto do dia (fichas de rua)
--   recem_aberto   demos ÷ visitas, casa com CNPJ de até 30 dias na visita contra as outras
--   followup_48h   clientes ÷ demos, as demos do período contra as do mesmo tanto de dias antes dele
--   livre          sem régua: só o texto do gestor
-- Os 3 primeiros do ebook não são gravados aqui: o cockpit os mostra como sugestão e o gestor os planeja.
--
-- UM DE CADA VEZ POR INDICADOR: dois experimentos da mesma medida não podem ter datas que se cruzam (o
-- gatilho recusa). Sem btree_gist no banco, a regra é um gatilho e não um exclude.
-- Nada aqui escreve no HubSpot.

create table if not exists public.experimentos (
  id uuid primary key default gen_random_uuid(),
  medida text not null default 'livre' check (medida in ('horario_dono', 'recem_aberto', 'followup_48h', 'livre')),
  hipotese text not null check (length(btrim(hipotese)) >= 3),
  pergunta text,
  indicador text not null check (length(btrim(indicador)) >= 3),
  dono text,
  inicio date,
  fim date,
  resultado text,
  veredito text check (veredito in ('regra', 'descarta', 'repete')),
  concluido_em timestamptz,
  concluido_por text,
  criado_por text,
  criado_em timestamptz not null default now(),
  cancelado_em timestamptz,
  constraint experimentos_periodo check ((inicio is null and fim is null) or (inicio is not null and fim is not null and fim >= inicio and fim - inicio <= 90))
);
comment on table public.experimentos is
  'Os experimentos do time: hipótese, indicador, dono, período e o resultado escrito pelo gestor no fim.';

create or replace function public._experimentos_um_por_vez()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.cancelado_em is null and new.medida <> 'livre' and new.inicio is not null and exists (
    select 1 from public.experimentos x
     where x.id <> new.id and x.medida = new.medida and x.cancelado_em is null and x.inicio is not null
       and daterange(x.inicio, x.fim, '[]') && daterange(new.inicio, new.fim, '[]')) then
    raise exception 'já existe um experimento desse indicador nessas datas' using errcode = '23P01';
  end if;
  return new;
end;
$function$;
drop trigger if exists experimentos_um_por_vez on public.experimentos;
create trigger experimentos_um_por_vez before insert or update on public.experimentos
  for each row execute function public._experimentos_um_por_vez();
revoke all on function public._experimentos_um_por_vez() from public, anon, authenticated;

alter table public.experimentos enable row level security;
/* é do time: todos leem, só o gestor escreve */
drop policy if exists experimentos_select on public.experimentos;
create policy experimentos_select on public.experimentos for select using ((select auth.uid()) is not null);
drop policy if exists experimentos_insert on public.experimentos;
create policy experimentos_insert on public.experimentos for insert with check ((select public.eh_gestor_cockpit()));
drop policy if exists experimentos_update on public.experimentos;
create policy experimentos_update on public.experimentos for update
  using ((select public.eh_gestor_cockpit())) with check ((select public.eh_gestor_cockpit()));

revoke all on table public.experimentos from anon, public;
grant select, insert, update on table public.experimentos to authenticated;
-- RLS nao protege TRUNCATE: os default privileges do Supabase dao TRUNCATE a authenticated.
revoke truncate, references, trigger on table public.experimentos from authenticated;
grant all on table public.experimentos to service_role;

/* O QUADRO DOS EXPERIMENTOS (só o gestor): os não cancelados e, de cada um que já começou e tem régua,
   o parcial do início até hoje (ou até o fim). Visita = uma casa num dia (as fichas de rua do dono do
   experimento; sem dono, as do time). No followup_48h, as demos do período contra as do mesmo tanto de
   dias antes; cliente = contrato do mesmo negócio depois da demo, até hoje. */
create or replace function public.experimentos_quadro()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_ate date;
  v_dias int;
  v_par jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('erro', 'sem sessão');
  end if;
  if not coalesce((select public.eh_gestor_cockpit()), false) then
    return jsonb_build_object('erro', 'só o gestor');
  end if;

  for r in
    select x.* from public.experimentos x where x.cancelado_em is null order by x.inicio nulls last, x.criado_em
  loop
    v_par := null;
    if r.medida <> 'livre' and r.inicio is not null and r.inicio <= v_hoje then
      v_ate := least(r.fim, v_hoje);
      v_dias := v_ate - r.inicio + 1;
      if r.medida in ('horario_dono', 'recem_aberto') then
        with vis as (
          select f.client_id, (coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::date as dia,
                 min((coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::time) as hora,
                 bool_or(f.como_foi = 'falou_com_decisor') as dono,
                 bool_or(f.etapa_depois = '1395880471') as demo_ficha,
                 array_agg(distinct f.deal_id) filter (where f.deal_id is not null) as deals
            from public.fichas_de_rua f
           where (r.dono is null or f.owner_id = r.dono)
             and f.client_id is not null
             and coalesce(f.ocorrido_em, f.criado_em) >= (r.inicio::timestamp at time zone 'America/Sao_Paulo')
             and coalesce(f.ocorrido_em, f.criado_em) < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
           group by 1, 2
        ), v as (
          select vis.*,
                 vis.hora >= time '14:30' and vis.hora < time '17:00' as janela,
                 coalesce((select (l.data_abertura at time zone 'UTC')::date >= vis.dia - 30
                             from public.clients c join public.leads_prospeccao l on l.id = c.lead_prospeccao_id
                            where c.id = vis.client_id and l.data_abertura is not null), false) as recem,
                 vis.demo_ficha or exists (
                   select 1 from public.pontos_eventos pe
                    where pe.tipo = 'demo_realizada' and pe.negocio_id = any (vis.deals)
                      and coalesce(pe.ref_em, pe.criado_em) >= (vis.dia::timestamp at time zone 'America/Sao_Paulo')
                      and coalesce(pe.ref_em, pe.criado_em) < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo')) as demo
            from vis
        )
        select case when r.medida = 'horario_dono' then
                 jsonb_build_object('a', jsonb_build_object('n', count(*) filter (where janela), 'x', count(*) filter (where janela and dono)),
                                    'b', jsonb_build_object('n', count(*) filter (where not janela), 'x', count(*) filter (where not janela and dono)))
               else
                 jsonb_build_object('a', jsonb_build_object('n', count(*) filter (where recem), 'x', count(*) filter (where recem and demo)),
                                    'b', jsonb_build_object('n', count(*) filter (where not recem), 'x', count(*) filter (where not recem and demo)))
               end
          into v_par from v;
      else
        with d as (
          select pe.negocio_id, min(coalesce(pe.ref_em, pe.criado_em)) as em
            from public.pontos_eventos pe
           where pe.tipo = 'demo_realizada' and pe.negocio_id is not null
             and (r.dono is null or pe.owner_id = r.dono)
             and coalesce(pe.ref_em, pe.criado_em) >= ((r.inicio - v_dias)::timestamp at time zone 'America/Sao_Paulo')
             and coalesce(pe.ref_em, pe.criado_em) < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
           group by 1
        ), k as (
          select d.*, d.em >= (r.inicio::timestamp at time zone 'America/Sao_Paulo') as no_periodo,
                 exists (select 1 from public.pontos_eventos c where c.tipo = 'contrato' and c.negocio_id = d.negocio_id
                            and coalesce(c.ref_em, c.criado_em) >= d.em) as cliente
            from d
        )
        select jsonb_build_object('a', jsonb_build_object('n', count(*) filter (where no_periodo), 'x', count(*) filter (where no_periodo and cliente)),
                                  'b', jsonb_build_object('n', count(*) filter (where not no_periodo), 'x', count(*) filter (where not no_periodo and cliente)),
                                  'antesDe', r.inicio - v_dias)
          into v_par from k;
      end if;
      v_par := v_par || jsonb_build_object('ate', v_ate);
    end if;
    v_out := v_out || jsonb_build_object(
      'id', r.id, 'medida', r.medida, 'hipotese', r.hipotese, 'pergunta', r.pergunta, 'indicador', r.indicador,
      'dono', r.dono, 'inicio', r.inicio, 'fim', r.fim, 'resultado', r.resultado, 'veredito', r.veredito,
      'concluidoEm', r.concluido_em, 'criadoEm', r.criado_em, 'parcial', v_par);
  end loop;

  return jsonb_build_object('hoje', v_hoje, 'lidoEm', now(), 'lista', v_out);
end;
$function$;
revoke all on function public.experimentos_quadro() from public, anon;
grant execute on function public.experimentos_quadro() to authenticated;
