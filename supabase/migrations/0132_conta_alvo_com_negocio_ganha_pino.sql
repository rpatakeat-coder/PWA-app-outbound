-- 0132 · Conta-alvo que virou negócio antes de ter pino ganha o pino (28/09/2026)
--
-- municao_sincronizar_pino desistia de criar o pino quando a conta já tinha
-- hubspot_deal_id. A intenção era não duplicar o pino do negócio — mas quando o negócio
-- NÃO tem pino nenhum, o resultado era a conta sumir do mapa para sempre. Medido: 23
-- contas-alvo com negócio no funil e sem pino ("tem endereço mas não vai no mapa").
-- Agora ela só desiste se já existe pino com aquele negócio; senão cria o pino já
-- ligado ao negócio (id_hubspot).

create or replace function public.municao_sincronizar_pino(p_lead uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  l public.leads_prospeccao;
  v_pin uuid;
  v_dono uuid;
begin
  select * into l from public.leads_prospeccao where id = p_lead;
  if not found then return null; end if;

  select id into v_pin from public.clients where lead_prospeccao_id = l.id;
  if v_pin is null and l.hubspot_deal_id is not null then
    select id into v_pin from public.clients
    where id_hubspot = l.hubspot_deal_id and lead_prospeccao_id is null;
  end if;
  if v_pin is null and nullif(l.place_id, '') is not null then
    select id into v_pin from public.clients
    where conta_alvo_place_id = l.place_id and lead_prospeccao_id is null;
  end if;
  if v_pin is null and l.lat is not null and l.lng is not null and nullif(trim(l.nome), '') is not null then
    select id into v_pin from public.clients
    where lead_prospeccao_id is null and not is_archived
      and lower(trim(nome)) = lower(trim(l.nome))
      and round(latitude, 4) = round(l.lat::numeric, 4)
      and round(longitude, 4) = round(l.lng::numeric, 4)
    limit 1;
  end if;

  if v_pin is null then
    if not public.municao_quer_pino(l.status) or l.responsavel_owner_id is null
       or l.lat is null or l.lng is null or nullif(trim(l.nome), '') is null
       or (l.hubspot_deal_id is not null
           and exists (select 1 from public.clients c where c.id_hubspot = l.hubspot_deal_id)) then
      return null;
    end if;
    select p.id into v_dono
    from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
    where e.ativo and not e.so_acesso and p.id_hubspot = l.responsavel_owner_id
    limit 1;
    if v_dono is null then return null; end if;
    insert into public.clients (
      nome, empresa, endereco, bairro, cidade, estado, telefone,
      latitude, longitude, status, origem, tags, vendedor_id_hubspot,
      conta_alvo_place_id, conta_alvo_rating, conta_alvo_reviews,
      geo_source, lead_prospeccao_id, created_by, id_hubspot)
    values (
      trim(l.nome), trim(l.nome), l.endereco, l.bairro, l.cidade, l.estado, l.telefone,
      l.lat, l.lng, 'lead', 'import', array['municao_cockpit'], l.responsavel_owner_id,
      coalesce(nullif(l.place_id, ''), 'municao:' || l.id::text), l.nota, l.avaliacoes,
      'leads_prospeccao', l.id, v_dono, nullif(l.hubspot_deal_id, ''))
    returning id into v_pin;
    return v_pin;
  end if;

  update public.clients c set
    lead_prospeccao_id = l.id,
    vendedor_id_hubspot = case when c.id_hubspot is null and l.responsavel_owner_id is not null
                               then l.responsavel_owner_id else c.vendedor_id_hubspot end,
    id_hubspot = coalesce(c.id_hubspot, l.hubspot_deal_id),
    conta_alvo_dismissed = case when l.status = 'sem_fit' and l.motor_inativo is null and c.id_hubspot is null then true
                                else c.conta_alvo_dismissed end
  where c.id = v_pin
    and (c.lead_prospeccao_id is distinct from l.id
      or (c.id_hubspot is null and l.responsavel_owner_id is not null and c.vendedor_id_hubspot is distinct from l.responsavel_owner_id)
      or (c.id_hubspot is null and l.hubspot_deal_id is not null)
      or (l.status = 'sem_fit' and l.motor_inativo is null and c.id_hubspot is null and not coalesce(c.conta_alvo_dismissed, false)));
  return v_pin;
end;
$function$;
