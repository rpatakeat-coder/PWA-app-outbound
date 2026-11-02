-- 0244 · PESSOAS v2 DO GESTOR: a semana de gestão do líder (design_handoff_gestor_v2, 02/11/26)
--
-- O Cockpit do gestor ganhou a Pessoas v2 (cockpit-unificado, branch feat/pessoas-v2). Quase tudo grava pelos
-- caminhos que já existem (um_a_um, habilidades_mes, gestor_idas_campo, rampa_fases, o recado do sino). Esta
-- migration traz SÓ o que não tinha onde morar, e o Cockpit funciona sem ela (avisar, não travar):
--
--   1. A MEDIÇÃO. aberturas_de_tela aceita as telas 'pessoas' (a aba) e 'pessoa' (a página de um executivo),
--      com a coluna nova `alvo` (o dono no HubSpot da pessoa aberta), e as origens 'placa', 'mapa' e 'link'.
--      registrar_abertura MANTÉM A ASSINATURA (p_tela, p_origem, p_acao default null): o Cockpit manda
--      p_tela = 'pessoa:{id}', e a função grava tela = 'pessoa' e alvo = id. Só o gestor grava 'pessoa:'.
--      Antes desta migration, a função antiga recusa a tela em silêncio e nada é gravado.
--      O selo "abriu esta semana" (_desenvolvimento_de) continua contando só meu_desempenho e desenvolvimento.
--   2. O RECONHECIMENTO INLINE. Não havia onde gravar o "Reconhecer" do gestor (o destaque da sexta é calculado,
--      as medalhas são gravadas pelo desenvolvimento_quadro). Tabela reconhecimentos_gestor, uma linha por
--      pessoa por semana, escrita só pela função reconhecer_destaque (gestor) e lida por
--      reconhecimentos_da_semana (o gestor vê todos; o executivo, os dele). O Cockpit também manda o recado
--      para o sino do app, que já aparece hoje; mostrar no Meu desempenho é a próxima mudança do app.
--   3. MARCAR IDA. marcar_ida_do_gestor(p_owner, p_dia, p_turno, p_bairro, p_praca): a ida entra na rotação
--      (gestor_idas_campo, onde a ida a campo já é registrada: dia_por_owner e status 'confirmada') e no PLANO
--      do executivo naquele dia, como "acompanhamento do gestor": a rota do dia (field_routes, criada como o
--      plano_para_rota cria) ganha a coluna `acompanhamento` (jsonb, posto_por = gestor). Não é parada de
--      cliente (field_route_stops exige client_id), por isso fica na rota do dia e não vira porta.
--      Mostrar o selo na Agenda do app é a próxima mudança do app.
--
-- Nada aqui lê ou escreve no HubSpot. NÃO APLICADA: entra pelo fluxo de migrations de sempre.

-- ── 1 · a medição ─────────────────────────────────────────────────────────────────────────────────
alter table public.aberturas_de_tela add column if not exists alvo text;
comment on column public.aberturas_de_tela.alvo is
  'Pessoas v2 (0244): na tela ''pessoa'', o dono no HubSpot da pessoa cuja página o gestor abriu. Nulo nas outras telas.';
alter table public.aberturas_de_tela drop constraint if exists aberturas_de_tela_tela_check;
alter table public.aberturas_de_tela add constraint aberturas_de_tela_tela_check
  check (tela in ('meu_desempenho', 'desenvolvimento', 'folha_manha', 'toast_pos_visita', 'fecho_dia', 'hoje_cockpit', 'pessoas', 'pessoa'));
alter table public.aberturas_de_tela drop constraint if exists aberturas_de_tela_origem_check;
alter table public.aberturas_de_tela add constraint aberturas_de_tela_origem_check
  check (origem in ('toast', 'pilula', 'push_seg', 'push_sex', 'menu', 'selo_menu', 'app', 'push_08', 'push_18', 'placa', 'mapa', 'link'));
create index if not exists aberturas_de_tela_alvo on public.aberturas_de_tela (alvo, quando desc) where alvo is not null;

create or replace function public.registrar_abertura(p_tela text, p_origem text, p_acao text default null)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.aberturas_de_tela (pessoa, tela, origem, acao, alvo)
  select (select auth.uid()),
         case when p_tela like 'pessoa:%' then 'pessoa' else p_tela end,
         p_origem, p_acao,
         case when p_tela like 'pessoa:%' then split_part(p_tela, ':', 2) end
   where (select auth.uid()) is not null
     and (p_tela in ('meu_desempenho', 'desenvolvimento', 'folha_manha', 'toast_pos_visita', 'fecho_dia', 'hoje_cockpit', 'pessoas')
          or (p_tela ~ '^pessoa:[0-9A-Za-z_-]{1,40}$' and (select public.eh_gestor_cockpit())))
     and p_origem in ('toast', 'pilula', 'push_seg', 'push_sex', 'menu', 'selo_menu', 'app', 'push_08', 'push_18', 'placa', 'mapa', 'link')
     and (p_acao is null or p_acao in ('vista', 'ir_para_rua', 'depois', 'fechada_sem_acao', 'passo_marcado', 'marcou_passo', 'ignorou',
       'aberto', 'fechado', 'fechado_com_pendencia'));
$function$;
revoke all on function public.registrar_abertura(text, text, text) from public, anon;
grant execute on function public.registrar_abertura(text, text, text) to authenticated;

-- ── 2 · o reconhecimento inline ───────────────────────────────────────────────────────────────────
create table if not exists public.reconhecimentos_gestor (
  id bigint generated always as identity primary key,
  owner_id text not null,
  segunda date not null,
  combinado smallint check (combinado is null or combinado between 1 and 7),
  motivo text check (motivo is null or char_length(motivo) <= 240),
  por text,
  em timestamptz not null default now(),
  unique (owner_id, segunda)
);
comment on table public.reconhecimentos_gestor is
  'Pessoas v2 (0244): o "Reconhecer" do gestor, um por pessoa por semana (a semana do destaque da sexta). Grava só reconhecer_destaque().';
alter table public.reconhecimentos_gestor enable row level security;
drop policy if exists reconhecimentos_gestor_le on public.reconhecimentos_gestor;
create policy reconhecimentos_gestor_le on public.reconhecimentos_gestor for select to authenticated
  using ((select public.eh_gestor_cockpit()) or owner_id = (select public.meu_owner_hubspot()));
revoke all on table public.reconhecimentos_gestor from anon, public;
grant select on table public.reconhecimentos_gestor to authenticated;
revoke truncate, references, trigger on table public.reconhecimentos_gestor from authenticated;
grant all on table public.reconhecimentos_gestor to service_role;

create or replace function public.reconhecer_destaque(p_owner text, p_segunda date, p_combinado integer default null, p_motivo text default null, p_por text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id bigint;
begin
  if not (select public.eh_gestor_cockpit()) then
    raise exception 'só o gestor reconhece' using errcode = '42501';
  end if;
  if p_owner is null or p_segunda is null or extract(isodow from p_segunda) <> 1 then
    raise exception 'a pessoa e a segunda da semana são obrigatórias' using errcode = '22023';
  end if;
  insert into public.reconhecimentos_gestor (owner_id, segunda, combinado, motivo, por)
  values (p_owner, p_segunda, p_combinado, left(p_motivo, 240), left(p_por, 120))
  on conflict (owner_id, segunda) do update
    set combinado = coalesce(excluded.combinado, reconhecimentos_gestor.combinado),
        motivo = coalesce(excluded.motivo, reconhecimentos_gestor.motivo),
        por = coalesce(excluded.por, reconhecimentos_gestor.por),
        em = now()
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;
revoke all on function public.reconhecer_destaque(text, date, integer, text, text) from public, anon;
grant execute on function public.reconhecer_destaque(text, date, integer, text, text) to authenticated;

create or replace function public.reconhecimentos_da_semana(p_segunda date)
 returns table (owner_id text, segunda date, combinado smallint, motivo text, em timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select r.owner_id, r.segunda, r.combinado, r.motivo, r.em
    from public.reconhecimentos_gestor r
   where r.segunda = p_segunda
     and ((select public.eh_gestor_cockpit()) or r.owner_id = (select public.meu_owner_hubspot()));
$function$;
revoke all on function public.reconhecimentos_da_semana(date) from public, anon;
grant execute on function public.reconhecimentos_da_semana(date) to authenticated;

-- ── 3 · marcar ida: a rotação e o "acompanhamento do gestor" no plano do dia ─────────────────────────
alter table public.field_routes add column if not exists acompanhamento jsonb;
comment on column public.field_routes.acompanhamento is
  'Pessoas v2 (0244): o gestor vai a campo com o executivo neste dia. {tipo, posto_por: gestor, gestor, turno, bairro, ida, em}. Nulo = sem acompanhamento.';

create or replace function public.marcar_ida_do_gestor(p_owner text, p_dia date, p_turno text default 'manha', p_bairro text default null, p_praca text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seller uuid;
  v_gestor text := (select public.meu_owner_hubspot());
  v_seg date;
  v_praca text := coalesce(nullif(trim(p_praca), ''), '—');
  v_ida uuid;
  v_route uuid;
begin
  if not (select public.eh_gestor_cockpit()) then
    raise exception 'só o gestor marca ida' using errcode = '42501';
  end if;
  if p_dia is null or p_dia < v_hoje then
    raise exception 'a ida é hoje ou depois' using errcode = '22023';
  end if;
  if coalesce(p_turno, 'manha') not in ('manha', 'tarde', 'dia') then
    raise exception 'turno: manha, tarde ou dia' using errcode = '22023';
  end if;
  select p.id into v_seller from public.profiles p where p.id_hubspot = p_owner limit 1;
  if v_seller is null then
    raise exception 'executivo sem perfil no app' using errcode = '22023';
  end if;
  v_seg := p_dia - (extract(isodow from p_dia)::int - 1);

  /* a rotação: a ida da semana e da praça ganha a pessoa e o dia dela; sem ida, nasce uma */
  select i.id into v_ida from public.gestor_idas_campo i where i.inicio = v_seg and i.praca = v_praca and i.status <> 'feita' limit 1;
  if v_ida is null then
    insert into public.gestor_idas_campo (gestor_owner_id, praca, inicio, owner_ids, dia_por_owner, status)
    values (coalesce(v_gestor, ''), v_praca, v_seg, array[p_owner], jsonb_build_object(p_owner, p_dia), 'confirmada')
    returning id into v_ida;
  else
    update public.gestor_idas_campo
       set owner_ids = case when p_owner = any (owner_ids) then owner_ids else owner_ids || p_owner end,
           dia_por_owner = coalesce(dia_por_owner, '{}'::jsonb) || jsonb_build_object(p_owner, p_dia),
           status = 'confirmada', atualizado_em = now()
     where id = v_ida;
  end if;

  /* o plano do dia: a rota (a mesma que o plano_para_rota cria) ganha o acompanhamento */
  insert into public.field_routes (seller_id, route_date, title, status, source, created_by)
  values (v_seller, p_dia, 'Plano do Cockpit', 'planned', 'manual', v_seller)
  on conflict (seller_id, route_date) do nothing;
  update public.field_routes
     set acompanhamento = jsonb_build_object('tipo', 'acompanhamento do gestor', 'posto_por', 'gestor', 'gestor', v_gestor,
           'turno', coalesce(p_turno, 'manha'), 'bairro', nullif(trim(p_bairro), ''), 'ida', v_ida, 'em', now())
   where seller_id = v_seller and route_date = p_dia
  returning id into v_route;

  return jsonb_build_object('ok', true, 'ida', v_ida, 'rota', v_route, 'dia', p_dia);
end;
$function$;
revoke all on function public.marcar_ida_do_gestor(text, date, text, text, text) from public, anon;
grant execute on function public.marcar_ida_do_gestor(text, date, text, text, text) to authenticated;
