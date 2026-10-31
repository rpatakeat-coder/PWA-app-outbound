-- 0231 · A Rampa (handoff "Acelerar Field Sales v2", telas 1a a 1d)
--
-- Os 60 dias de quem entra no time, nas 4 fases do playbook:
--   S1 · Imersão      (dias 1–7)   8 a 10 reuniões do Inside Sales assistidas + 3 simulações aprovadas
--   S2–3 · Demos      (dias 8–21)  15 a 20 demos + 1 demo aprovada pelo gestor
--   S4 · Base ativa   (dias 22–30) 12 a 15 visitas à base ativa + 3 casos reais documentados
--   D31–60 · Rua      3 → 4–5 → 6 visitas por dia; aprovada com 6 por dia por 2 semanas seguidas
-- e a decisão do dia 45 (avança, estende com plano ou encerra).
--
-- POR QUE TRÊS TABELAS E NÃO A `rampa_fases` SOZINHA DO HANDOFF. O handoff põe turma e padrinho em
-- cada linha de fase. Mas a pessoa entra na rampa ANTES de aprovar qualquer fase, e o quadro precisa
-- mostrar o dia 1, o padrinho e o dia 45 desde o primeiro dia — então a entrada na rampa tem linha
-- própria (`rampa_pessoas`). `rampa_fases` guarda só o que aconteceu com cada fase: aprovada (com
-- evidência e data) ou estendida (com nova data e motivo).
--
-- O QUE NÃO MUDA: `equipe_cockpit.ramp_stage` continua sendo a fonte do selo "D30 · D45 · D60" e da
-- meta das telas que já existem (regra nº 1 do handoff: o cockpit atual não muda). A fase da Rampa é
-- derivada das aprovações, aqui.
--
-- Nada aqui escreve no HubSpot.

create table if not exists public.rampa_pessoas (
  pessoa uuid primary key references auth.users(id),
  inicio date not null,
  turma date not null,
  padrinho uuid references auth.users(id),
  encerrada_em timestamptz,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.rampa_pessoas is
  'Quem está na rampa de 60 dias: o dia 1, a turma (a data de início da turma) e o padrinho. Uma linha por pessoa.';

create table if not exists public.rampa_fases (
  pessoa uuid not null references public.rampa_pessoas(pessoa) on delete cascade,
  fase text not null check (fase in ('s1', 's23', 's4', 'rua')),
  aprovada_em date,
  aprovada_por text,
  evidencia text,
  realizado jsonb not null default '{}'::jsonb,
  motivo text,
  estendida_ate date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (pessoa, fase),
  /* aprovar exige evidência (handoff, aceite da Rampa) */
  constraint rampa_fases_aprovar_com_evidencia check (aprovada_em is null or length(btrim(coalesce(evidencia, ''))) > 0),
  /* estender exige motivo escrito */
  constraint rampa_fases_estender_com_motivo check (estendida_ate is null or length(btrim(coalesce(motivo, ''))) > 0)
);
comment on table public.rampa_fases is
  'O que aconteceu com cada fase da rampa: aprovada (data, quem, evidência, o realizado do momento) ou estendida (nova data e motivo).';

create table if not exists public.rampa_decisao_d45 (
  pessoa uuid primary key references public.rampa_pessoas(pessoa) on delete cascade,
  decisao text not null check (decisao in ('avanca', 'estende', 'encerra')),
  motivo text,
  plano text,
  nova_data date,
  decidida_em timestamptz not null default now(),
  decidida_por text,
  constraint rampa_d45_estende_com_plano check (decisao <> 'estende' or (nova_data is not null and length(btrim(coalesce(plano, ''))) > 0)),
  constraint rampa_d45_encerra_com_motivo check (decisao <> 'encerra' or length(btrim(coalesce(motivo, ''))) > 0)
);
comment on table public.rampa_decisao_d45 is
  'A decisão do dia 45: avança, estende com plano e nova data, ou encerra com motivo.';

alter table public.rampa_pessoas enable row level security;
alter table public.rampa_fases enable row level security;
alter table public.rampa_decisao_d45 enable row level security;

/* Quem está na rampa lê a própria linha (o cartão "Minha rampa" do app); o gestor lê e escreve tudo.
   Ninguém aprova a própria fase: escrever é só do gestor, conferido no servidor. */
drop policy if exists rampa_pessoas_select on public.rampa_pessoas;
create policy rampa_pessoas_select on public.rampa_pessoas for select
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists rampa_pessoas_insert on public.rampa_pessoas;
create policy rampa_pessoas_insert on public.rampa_pessoas for insert
  with check ((select public.eh_gestor_cockpit()));
drop policy if exists rampa_pessoas_update on public.rampa_pessoas;
create policy rampa_pessoas_update on public.rampa_pessoas for update
  using ((select public.eh_gestor_cockpit())) with check ((select public.eh_gestor_cockpit()));

drop policy if exists rampa_fases_select on public.rampa_fases;
create policy rampa_fases_select on public.rampa_fases for select
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists rampa_fases_insert on public.rampa_fases;
create policy rampa_fases_insert on public.rampa_fases for insert
  with check ((select public.eh_gestor_cockpit()));
drop policy if exists rampa_fases_update on public.rampa_fases;
create policy rampa_fases_update on public.rampa_fases for update
  using ((select public.eh_gestor_cockpit())) with check ((select public.eh_gestor_cockpit()));
/* DELETE existe para desfazer uma aprovação feita por engano */
drop policy if exists rampa_fases_delete on public.rampa_fases;
create policy rampa_fases_delete on public.rampa_fases for delete
  using ((select public.eh_gestor_cockpit()));

drop policy if exists rampa_d45_select on public.rampa_decisao_d45;
create policy rampa_d45_select on public.rampa_decisao_d45 for select
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists rampa_d45_insert on public.rampa_decisao_d45;
create policy rampa_d45_insert on public.rampa_decisao_d45 for insert
  with check ((select public.eh_gestor_cockpit()));
drop policy if exists rampa_d45_update on public.rampa_decisao_d45;
create policy rampa_d45_update on public.rampa_decisao_d45 for update
  using ((select public.eh_gestor_cockpit())) with check ((select public.eh_gestor_cockpit()));

revoke all on table public.rampa_pessoas, public.rampa_fases, public.rampa_decisao_d45 from anon, public;
grant select, insert, update on table public.rampa_pessoas to authenticated;
grant select, insert, update, delete on table public.rampa_fases to authenticated;
grant select, insert, update on table public.rampa_decisao_d45 to authenticated;
-- RLS nao protege TRUNCATE: os default privileges do Supabase dao TRUNCATE a authenticated.
revoke truncate, references, trigger on table public.rampa_pessoas, public.rampa_fases, public.rampa_decisao_d45 from authenticated;
grant all on table public.rampa_pessoas, public.rampa_fases, public.rampa_decisao_d45 to service_role;

/* O QUADRO DA RAMPA (o telefone do padrinho vai só para a própria pessoa e o gestor, para o "Chamar" do app): um número só para o cockpit (aba Rampa) e o app (cartão Minha rampa).
   O que tem fonte é medido aqui; o que não tem (reuniões do Inside Sales assistidas, simulações,
   demo aprovada, casos documentados) é contado pelo gestor na aprovação e fica em
   rampa_fases.realizado.
     demos           demo_realizada (pontos_eventos) desde o dia 1
     visitas_base    visitas provadas a cliente da base (cliente ou ganho_fs) desde o dia 1
     prospeccao      visitas a lead ANTES da S4 aprovada (provadas ou não: é alerta, e alerta não
                     bloqueia o check-in) e os dias em que aconteceram
     semanas         visitas provadas nas 3 últimas semanas (seg–sex), para o 6 por dia da rua
   O executivo só recebe a própria linha. */
create or replace function public.rampa_quadro()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_gestor boolean := coalesce((select public.eh_gestor_cockpit()), false);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seg date := v_hoje - ((extract(isodow from v_hoje)::int) - 1);
  v_out jsonb := '[]'::jsonb;
  r record;
  v_s4 date;
  v_demos int;
  v_clientes int;
  v_base int;
  v_prosp int;
  v_prosp_dias jsonb;
  v_semanas jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('erro', 'sem sessão');
  end if;
  for r in
    select rp.*, p.id_hubspot, coalesce(e.nome, p.full_name) as nome,
           pp.id_hubspot as padrinho_owner, coalesce(ep.nome, pp.full_name) as padrinho_nome, pp.phone as padrinho_fone
      from public.rampa_pessoas rp
      join public.profiles p on p.id = rp.pessoa
      left join public.equipe_cockpit e on e.profile_id = rp.pessoa
      left join public.profiles pp on pp.id = rp.padrinho
      left join public.equipe_cockpit ep on ep.profile_id = rp.padrinho
     where rp.encerrada_em is null
       and coalesce(e.ativo, true)
       and (v_gestor or rp.pessoa = auth.uid())
     order by rp.turma desc, coalesce(e.nome, p.full_name)
  loop
    v_s4 := null;
    select f.aprovada_em into v_s4 from public.rampa_fases f
     where f.pessoa = r.pessoa and f.fase = 's4' and f.aprovada_em is not null;

    select count(*) into v_demos from public.pontos_eventos pe
     where pe.owner_id = r.id_hubspot and pe.tipo = 'demo_realizada'
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date >= r.inicio;

    /* clientes desde o dia 1: contrato menos o estorno do mesmo negócio (o estorno de visita não tem negócio) */
    select count(*) filter (where pe.tipo = 'contrato') - count(*) filter (where pe.tipo = 'estorno' and pe.negocio_id is not null)
      into v_clientes from public.pontos_eventos pe
     where pe.owner_id = r.id_hubspot and pe.tipo in ('contrato', 'estorno')
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date >= r.inicio;

    with v as (
      select vp.dia, vp.provada, c.status
        from public._visitas_com_prova(r.inicio, v_hoje, r.pessoa) vp
        left join public.clients c on c.id = vp.client_id
    )
    select
      count(*) filter (where v.provada and v.status in ('cliente', 'ganho_fs')),
      count(*) filter (where v.status = 'lead' and v.dia < coalesce(v_s4, v_hoje + 1)),
      coalesce(jsonb_agg(distinct v.dia) filter (where v.status = 'lead' and v.dia < coalesce(v_s4, v_hoje + 1)), '[]'::jsonb),
      (select coalesce(jsonb_agg(jsonb_build_object(
                'segunda', s.seg,
                'provadas', (select count(*) from v v2 where v2.provada and v2.dia between s.seg and s.seg + 4),
                'uteis', (select count(*) from generate_series(greatest(s.seg, r.inicio), least(s.seg + 4, v_hoje), interval '1 day') d
                           where extract(isodow from d) < 6))
              order by s.seg), '[]'::jsonb)
         from (select (v_seg - 7 * k)::date as seg from generate_series(0, 2) k) s
        where s.seg + 4 >= r.inicio)
      into v_base, v_prosp, v_prosp_dias, v_semanas
      from v;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'pessoa', r.pessoa, 'ownerId', r.id_hubspot, 'nome', r.nome,
      'inicio', r.inicio, 'turma', r.turma,
      'padrinho', r.padrinho, 'padrinhoOwnerId', r.padrinho_owner, 'padrinhoNome', r.padrinho_nome, 'padrinhoTelefone', r.padrinho_fone,
      'dia', (v_hoje - r.inicio) + 1,
      'fases', coalesce((select jsonb_object_agg(f.fase, jsonb_build_object(
                  'aprovadaEm', f.aprovada_em, 'aprovadaPor', f.aprovada_por, 'evidencia', f.evidencia,
                  'realizado', f.realizado, 'motivo', f.motivo, 'estendidaAte', f.estendida_ate))
                from public.rampa_fases f where f.pessoa = r.pessoa), '{}'::jsonb),
      'decisao', (select jsonb_build_object('decisao', d.decisao, 'motivo', d.motivo, 'plano', d.plano,
                  'novaData', d.nova_data, 'decididaEm', d.decidida_em, 'decididaPor', d.decidida_por)
                from public.rampa_decisao_d45 d where d.pessoa = r.pessoa),
      'medido', jsonb_build_object('demos', v_demos, 'clientes', greatest(v_clientes, 0), 'visitasBase', v_base,
                  'prospeccao', v_prosp, 'prospeccaoDias', v_prosp_dias, 'semanas', v_semanas)
    ));
  end loop;
  return jsonb_build_object('hoje', v_hoje, 'gestor', v_gestor, 'pessoas', v_out, 'lidoEm', now());
end;
$function$;

revoke all on function public.rampa_quadro() from anon, public;
grant execute on function public.rampa_quadro() to authenticated;
