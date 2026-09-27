-- 0119 · A prospecção do Cockpit só sugere conta ATIVA (27/09/2026)
--
-- Pedido do Julyan: "CNPJ BAIXADO, LEAD Q SUMIU DO GOOGLE, QUERO SO OS ATIVOS".
-- Quem sabe se a conta está viva é o motor (0110–0112), que grava clients.motor_status
-- no pino ligado ao lead (clients.lead_prospeccao_id). Aqui o banco leva isso ao lead:
--
--   motor diz cnpj_baixado | sumiu_google | fechado_temporario
--     -> lead pendente/atribuído (sem negócio) vira 'sem_fit', com o motivo em
--        motor_inativo e o status anterior em status_antes_do_motor;
--   motor volta a dizer ok -> o lead volta ao status anterior.
--   nao_achado NÃO conta: não achar no Google não prova que fechou.
--
-- POR QUE 'sem_fit' E NÃO UM STATUS NOVO: as ~20 leituras de leads_prospeccao na tela do
-- Cockpit já tratam sem_fit como "saiu da fila" (sugestão, estoque da praça, mapa do
-- plano, pendentes). Um status novo cairia como pendente em várias delas.
--
-- O QUE NÃO SE MEXE:
--   * updated_at: a tela conta sem_fit com updated_at nos últimos 28 dias como CONSUMO da
--     praça. Limpeza de base não é trabalho do executivo.
--   * lead na_rota: quem está na rota de hoje não some no meio do dia; sai quando a rota
--     o devolve (na_rota -> atribuído), pelo gatilho BEFORE abaixo.
--   * o pino: continua como está (o mapa já esconde conta-alvo inativa sem negócio).
--     Por isso municao_sincronizar_pino passa a NÃO dispensar o pino de um sem_fit que
--     veio do motor — senão a conta nunca voltaria quando o motor a achasse aberta.
--   * reativação manual: se alguém tira o lead de sem_fit na tela, a decisão é dela; o
--     motivo do motor é apagado e o banco não insiste.

alter table public.leads_prospeccao add column if not exists motor_inativo text;
alter table public.leads_prospeccao add column if not exists status_antes_do_motor text;

create or replace function public.motor_inativo_de(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('cnpj_baixado', 'sumiu_google', 'fechado_temporario')
$$;

-- O motor falou sobre o pino de um lead: leva ao lead.
create or replace function public.aplicar_motor_no_lead(p_lead uuid, p_motor text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if public.motor_inativo_de(p_motor) then
    update public.leads_prospeccao
       set status_antes_do_motor = status, status = 'sem_fit', motor_inativo = p_motor
     where id = p_lead and status in ('pendente', 'atribuido') and hubspot_deal_id is null;
  elsif p_motor = 'ok' then
    update public.leads_prospeccao
       set status = coalesce(status_antes_do_motor, 'atribuido'), motor_inativo = null, status_antes_do_motor = null
     where id = p_lead and status = 'sem_fit' and motor_inativo is not null;
  end if;
end;
$$;
revoke all on function public.aplicar_motor_no_lead(uuid, text) from public, anon, authenticated;

create or replace function public.motor_do_pino_mudou()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.lead_prospeccao_id is not null and new.motor_status is distinct from old.motor_status then
    perform public.aplicar_motor_no_lead(new.lead_prospeccao_id, new.motor_status);
  end if;
  return new;
end;
$$;
drop trigger if exists motor_do_pino_mudou on public.clients;
create trigger motor_do_pino_mudou
  after update of motor_status on public.clients
  for each row execute function public.motor_do_pino_mudou();

-- O lead volta da rota para a fila: se a conta está inativa, sai. E se alguém tira da
-- sem_fit na mão, o motivo do motor some (a decisão manual vale).
create or replace function public.lead_respeita_motor()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_motor text;
begin
  if old.status = 'sem_fit' and old.motor_inativo is not null and new.status is distinct from 'sem_fit' then
    new.motor_inativo := null;
    new.status_antes_do_motor := null;
    return new;
  end if;
  if old.status = 'na_rota' and new.status in ('pendente', 'atribuido') and new.hubspot_deal_id is null then
    select c.motor_status into v_motor from public.clients c where c.lead_prospeccao_id = new.id limit 1;
    if public.motor_inativo_de(v_motor) then
      new.status_antes_do_motor := new.status;
      new.status := 'sem_fit';
      new.motor_inativo := v_motor;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists lead_respeita_motor on public.leads_prospeccao;
create trigger lead_respeita_motor
  before update of status on public.leads_prospeccao
  for each row execute function public.lead_respeita_motor();

-- municao_sincronizar_pino: igual à 0098, exceto que sem_fit vindo do motor não
-- dispensa o pino (as duas ocorrências de l.status = 'sem_fit').
create or replace function public.municao_sincronizar_pino(p_lead uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
       or l.hubspot_deal_id is not null then
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
      geo_source, lead_prospeccao_id, created_by)
    values (
      trim(l.nome), trim(l.nome), l.endereco, l.bairro, l.cidade, l.estado, l.telefone,
      l.lat, l.lng, 'lead', 'import', array['municao_cockpit'], l.responsavel_owner_id,
      coalesce(nullif(l.place_id, ''), 'municao:' || l.id::text), l.nota, l.avaliacoes,
      'leads_prospeccao', l.id, v_dono)
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
$$;

-- Carga: o que o motor já disse até hoje.
select public.aplicar_motor_no_lead(c.lead_prospeccao_id, c.motor_status)
  from public.clients c
 where c.lead_prospeccao_id is not null and public.motor_inativo_de(c.motor_status);
