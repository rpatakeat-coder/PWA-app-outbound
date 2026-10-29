-- 0228 · O time na rua, para o gestor que está com o celular na mão
--
-- Julyan, 29/10: "no app do gestor, eu posso ter a visão geral do time... seria
-- só no app, quando eu estiver usando o app".
--
-- POR QUE NÃO É UM SEGUNDO COCKPIT. O Cockpit já tem a análise do time, e
-- `ranking_gestor` já devolve a lista inteira com placar. Repetir isso no
-- celular seria a poluição que ele pediu para evitar. O que NÃO existe em lugar
-- nenhum é o que o time fez NA RUA HOJE com a prova aberta:
--
--   · quantas visitas cada um provou, e COMO provou (GPS ou foto);
--   · quantas foram provadas por foto TIRADA FORA DO RAIO — que é a brecha da
--     auditoria de 29/10 e vira recusa em 01/11, daqui a três dias, sem que
--     ninguém tenha onde ver isso a não ser rodando SQL;
--   · quantas visitas ficaram SEM DESFECHO, que é o número do item 2.11 e o que
--     o "Saí · como ficou?" existe para derrubar;
--   · e a hora da última visita, que na rua responde "quem ainda não saiu".
--
-- É a versão de rua: um dia, uma linha por pessoa, só o que pede ação hoje.
--
-- SÓ GESTOR. A guarda é a mesma de `dossie_de_campo` — papel conferido no
-- servidor, não na tela.

create or replace function public.time_na_rua(p_dia date default null)
 returns table(
   owner_id text, pessoa uuid, nome text, avatar_url text,
   provadas integer, por_gps integer, por_foto integer, foto_fora integer,
   declaradas integer, sem_desfecho integer, ultima text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    raise exception 'time_na_rua é só do gestor' using errcode = '42501';
  end if;

  return query
  with v as (select * from public._visitas_com_prova(v_dia, v_dia, null))
  select
    p.id_hubspot,
    p.id,
    coalesce(nullif(e.nome, ''), p.full_name),
    p.avatar_url,
    count(*) filter (where v.provada)::int,
    count(*) filter (where v.motivo = 'gps')::int,
    count(*) filter (where v.provada and v.motivo like 'foto%')::int,
    -- A BRECHA, em número: foto que prova a visita tendo sido tirada fora do raio.
    count(*) filter (where v.provada and v.foto_distancia_m is not null and v.foto_distancia_m > v.limite_m)::int,
    count(*) filter (where v.declarada)::int,
    -- Visita provada hoje sem ficha do mesmo cliente no mesmo dia.
    count(*) filter (where v.provada and not exists (
      select 1 from public.fichas_de_rua f
       where f.client_id = v.client_id
         and (f.criado_em at time zone 'America/Sao_Paulo')::date = v.dia))::int,
    to_char(max(v.visited_at) at time zone 'America/Sao_Paulo', 'HH24:MI')
  from v
  join public.profiles p on p.id = v.visited_by
  join public.equipe_cockpit e on e.profile_id = v.visited_by and e.ativo
  group by p.id_hubspot, p.id, coalesce(nullif(e.nome, ''), p.full_name), p.avatar_url
  order by count(*) filter (where v.provada) desc, 3;
end $function$;

revoke all on function public.time_na_rua(date) from anon, public;
grant execute on function public.time_na_rua(date) to authenticated, service_role;
