-- 0098 — A munição do Cockpit vira pin no mapa, e o pin conversa de volta
--
-- Por quê (Julyan, 25/09/2026): "o cockpit é o nosso cérebro, e o mapa é a nossa
-- perna ... tudo de lead que tem de munição, lead deles, etc, tem q ir pro mapa".
-- Medido antes: 2.777 leads de prospecção atribuídos (2.700 com coordenada) e só
-- ~87 deles existiam como pin. A munição vivia só no Cockpit.
--
-- Como, sem uma linha de tela nova no mapa: o mapa já tem o pin de munição — a
-- CONTA ALVO (clients.conta_alvo_place_id preenchido: roxo, selo, "Não interessa",
-- e o negócio no HubSpot nasce NO CHECK-IN, useClients.ts:494-544). Cada lead
-- atribuído vira uma Conta Alvo ligada a ele por clients.lead_prospeccao_id.
--
-- As três pontas, todas no banco e NENHUMA falando com o HubSpot (quem escreve lá
-- continua sendo só gente: o check-in no mapa e as ações da gestão):
--   1. lead atribuído com coordenada -> pin (dono = responsavel_owner_id);
--   2. o Cockpit muda o lead (dono, sem_fit, virou negócio) -> o pin acompanha;
--   3. o pin muda (virou negócio no check-in, "Não interessa") -> o lead acompanha.
--
-- Lead que JÁ É negócio (hubspot_deal_id) não ganha pin novo aqui: o pin de
-- negócio é do reconciliador negocio-vira-ponto (0087). Aqui ele só é LIGADO ao
-- pin que tiver aquele id_hubspot — dois criadores para o mesmo negócio dariam
-- dois pins.
--
-- Sem place_id do Google (a Casa dos Dados não tem), o marcador de Conta Alvo é
-- 'municao:<id do lead>': o mapa usa a coluna só como marcador e para não
-- duplicar (conta-alvo-nearby compara com ids do Google, que nunca têm esse prefixo).

alter table public.clients add column if not exists lead_prospeccao_id uuid
  references public.leads_prospeccao(id) on delete set null;
create unique index if not exists clients_lead_prospeccao_uidx
  on public.clients (lead_prospeccao_id) where lead_prospeccao_id is not null;

-- Status do lead que põem a munição no mapa.
create or replace function public.municao_quer_pino(p_status text)
returns boolean language sql immutable as $$
  select coalesce(p_status, '') in ('atribuido', 'na_rota')
$$;

create or replace function public.municao_sincronizar_pino(p_lead uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l public.leads_prospeccao;
  v_pin uuid;
  v_dono uuid;
begin
  select * into l from public.leads_prospeccao where id = p_lead;
  if not found then return null; end if;

  -- 1. o pin deste lead: o já ligado; senão um existente que seja a MESMA conta
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

  -- 2. sem pin: cria, se for munição de alguém com coordenada e ainda não negócio
  if v_pin is null then
    if not public.municao_quer_pino(l.status) or l.responsavel_owner_id is null
       or l.lat is null or l.lng is null or nullif(trim(l.nome), '') is null
       or l.hubspot_deal_id is not null then
      return null;
    end if;
    -- O DONO É QUEM CRIA (clients.created_by é obrigatório), e só quem está ativo
    -- na equipe: lead de quem saiu (313 do Whell, 80 do Ricardo em 25/09) espera a
    -- redistribuição e vira pin sozinho quando for reatribuído (o gatilho vê a troca).
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

  -- 3. com pin: liga e acompanha o que o Cockpit decidiu (só o que mudou)
  update public.clients c set
    lead_prospeccao_id = l.id,
    vendedor_id_hubspot = case when c.id_hubspot is null and l.responsavel_owner_id is not null
                               then l.responsavel_owner_id else c.vendedor_id_hubspot end,
    id_hubspot = coalesce(c.id_hubspot, l.hubspot_deal_id),
    conta_alvo_dismissed = case when l.status = 'sem_fit' and c.id_hubspot is null then true
                                else c.conta_alvo_dismissed end
  where c.id = v_pin
    and (c.lead_prospeccao_id is distinct from l.id
      or (c.id_hubspot is null and l.responsavel_owner_id is not null and c.vendedor_id_hubspot is distinct from l.responsavel_owner_id)
      or (c.id_hubspot is null and l.hubspot_deal_id is not null)
      or (l.status = 'sem_fit' and c.id_hubspot is null and not coalesce(c.conta_alvo_dismissed, false)));
  return v_pin;
end;
$function$;

-- Ponta 2: o lead mudou no Cockpit.
create or replace function public.municao_lead_mudou()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if pg_trigger_depth() > 1 then return new; end if;  -- veio do pin: não devolve
  perform public.municao_sincronizar_pino(new.id);
  return new;
end;
$function$;

drop trigger if exists municao_lead_mudou on public.leads_prospeccao;
create trigger municao_lead_mudou
  after insert or update of status, responsavel_owner_id, hubspot_deal_id, lat, lng, nome
  on public.leads_prospeccao
  for each row execute function public.municao_lead_mudou();

-- Ponta 3: o pin mudou no mapa.
create or replace function public.municao_pino_mudou()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.lead_prospeccao_id is null or pg_trigger_depth() > 1 then return new; end if;
  -- virou negócio (check-in de Conta Alvo -> hubspot-sync grava id_hubspot)
  if new.id_hubspot is not null and old.id_hubspot is distinct from new.id_hubspot then
    update public.leads_prospeccao
    set hubspot_deal_id = new.id_hubspot,
        status = case when status in ('atribuido', 'na_rota', 'pendente') then 'criado_hubspot' else status end,
        updated_at = now()
    where id = new.lead_prospeccao_id and hubspot_deal_id is distinct from new.id_hubspot;
  end if;
  -- "Não interessa (descartar)" no cartão da Conta Alvo
  if coalesce(new.conta_alvo_dismissed, false) and not coalesce(old.conta_alvo_dismissed, false)
     and new.id_hubspot is null then
    update public.leads_prospeccao
    set status = 'sem_fit', updated_at = now()
    where id = new.lead_prospeccao_id and status is distinct from 'sem_fit';
  end if;
  return new;
end;
$function$;

drop trigger if exists municao_pino_mudou on public.clients;
create trigger municao_pino_mudou
  after update of id_hubspot, conta_alvo_dismissed on public.clients
  for each row execute function public.municao_pino_mudou();

revoke all on function public.municao_sincronizar_pino(uuid) from public, anon, authenticated;
revoke all on function public.municao_lead_mudou() from public, anon, authenticated;
revoke all on function public.municao_pino_mudou() from public, anon, authenticated;

-- Carga: a munição que já existe.
select count(public.municao_sincronizar_pino(id)) from public.leads_prospeccao;
