-- 0182 · Desenvolvimento do executivo: o mesmo número da Pessoas, lido pelo próprio executivo
-- (07/10/2026, entrega DESE.zip; Fase 0 em cockpit-unificado/docs/DESENVOLVIMENTO-FASE0.md)
--
-- 1. planejamento_do_time e gestor_v4_leituras aceitam o executivo SÓ para ele mesmo
--    (p_donos = [o id do HubSpot dele]). Assim a aba dele roda a MESMA montagem da Pessoas v4
--    (GV2.montar) e o número não tem conta paralela. visitas_com_prova já fazia isso.
-- 2. combinado_fiz_minha_parte: o executivo marca/desmarca "fiz a minha parte" num combinado
--    manual do PRÓPRIO 1:1. Só grava combinados[i].exec_fez_em; concluir continua do gestor.
-- 3. medias_do_time_v4: os totais do time para a comparação ("time 20 de 81", "média das 7
--    pessoas"). Só totais — nenhum nome, nenhum negócio. O executivo já vê os totais dos
--    colegas no ranking (autorizado em 03/10).

do $$
declare v_def text; v_novo text; f text;
begin
  foreach f in array array['public.planejamento_do_time(date, text[], date)', 'public.gestor_v4_leituras(text[])'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if position('0182 o próprio executivo' in v_def) > 0 then continue; end if;
    v_novo := replace(v_def,
      'if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then',
      'if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())' || chr(10) ||
      '          -- 0182 o próprio executivo: só a linha dele' || chr(10) ||
      '          or ((select public.meu_owner_hubspot()) is not null and p_donos <@ array[(select public.meu_owner_hubspot())]::text[])) then');
    if v_novo = v_def then raise exception '0182: guarda não encontrada em %', f; end if;
    execute v_novo;
  end loop;
end $$;

create or replace function public.combinado_fiz_minha_parte(p_id uuid, p_indice integer, p_feito boolean)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_row public.um_a_um; v_c jsonb; v_quando jsonb;
begin
  select * into v_row from public.um_a_um where id = p_id for update;
  if v_row.id is null then raise exception 'Combinado não encontrado.'; end if;
  if v_row.owner_id is distinct from (select public.meu_owner_hubspot()) then
    raise exception 'Só o dono do 1:1 marca a parte dele.' using errcode = '42501';
  end if;
  v_c := v_row.combinados -> p_indice;
  if v_c is null or jsonb_typeof(v_c) <> 'object' then raise exception 'Combinado não encontrado.'; end if;
  if coalesce(v_c ->> 'conferencia', '') = 'auto' then raise exception 'Este combinado o app confere sozinho.'; end if;
  v_quando := case when p_feito then to_jsonb(now()) else 'null'::jsonb end;
  update public.um_a_um set combinados = jsonb_set(combinados, array[p_indice::text, 'exec_fez_em'], v_quando, true)
   where id = p_id;
  return jsonb_build_object('ok', true, 'exec_fez_em', v_quando);
end; $$;
revoke all on function public.combinado_fiz_minha_parte(uuid, integer, boolean) from public, anon;
grant execute on function public.combinado_fiz_minha_parte(uuid, integer, boolean) to authenticated;

create or replace function public.medias_do_time_v4(p_donos text[])
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_ini7 date := v_hoje - 6;
  v_seg date := v_hoje - (extract(isodow from v_hoje)::int - 1);
  r jsonb;
begin
  if (select public.meu_owner_hubspot()) is null and not (select public.eh_gestor_cockpit()) then
    raise exception 'Só quem está no time lê isto.' using errcode = '42501';
  end if;
  /* totais de 3 pessoas ou mais: nunca a linha de um colega sozinho */
  if coalesce(array_length(p_donos, 1), 0) < 3 then return null; end if;
  with
  pes as (select distinct on (p.id_hubspot) p.id, p.id_hubspot dono from public.profiles p
           where p.id_hubspot = any(p_donos) order by p.id_hubspot, (p.full_name ilike '%DESATIVADO%'), p.id),
  reun as (select count(*) n from public.client_meetings m join pes on pes.id = m.created_by
            where m.status = 'agendada' and m.scheduled_at >= now() - interval '30 days' and m.scheduled_at < now() - interval '2 hours'),
  vis as (select distinct v.owner_id, v.client_id, v.dia from public._visitas_com_prova(v_ini7, v_hoje, null) v
           where v.provada and v.owner_id = any(p_donos)),
  fic as (select f.owner_id, f.client_id, (f.ocorrido_em at time zone 'America/Sao_Paulo')::date dia, f.decisor_nome
            from public.fichas_de_rua f where f.owner_id = any(p_donos) and f.ocorrido_em >= (v_ini7::timestamp at time zone 'America/Sao_Paulo') - interval '40 days'),
  portas as (select count(*) total, count(*) filter (where not exists (select 1 from fic where fic.owner_id = vis.owner_id and fic.client_id = vis.client_id and fic.dia = vis.dia)) sem_ficha from vis),
  dec as (select count(*) fichas, count(*) filter (where nullif(btrim(coalesce(decisor_nome, '')), '') is not null) com from fic where fic.dia >= v_mes),
  fila as (select count(*) n from public.fila_feitas ff join pes on pes.id = ff.user_id where ff.dia >= v_ini7 and ff.estado <> 'desfeita'),
  plano as (select count(distinct (i.owner_id, i.dia)) dias from public.itens_do_plano(v_seg, p_donos) i where i.dia <= v_hoje)
  select jsonb_build_object(
    'pessoas', (select count(*) from pes),
    'reunioes30', (select n from reun),
    'portas7', (select total from portas), 'portasSemFicha', (select sem_ficha from portas),
    'fichasMes', (select fichas from dec), 'decisorMes', (select com from dec),
    'fila7', (select n from fila),
    'diasComPlano', (select dias from plano),
    'diasUteisAteHoje', least(5, greatest(0, (v_hoje - v_seg) + 1))
  ) into r;
  return r;
end; $$;
revoke all on function public.medias_do_time_v4(text[]) from public, anon;
grant execute on function public.medias_do_time_v4(text[]) to authenticated;
