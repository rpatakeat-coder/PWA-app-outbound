-- 0135 · A etapa do pino acompanha o HubSpot a cada rodada do robô (28/09/2026)
--
-- Auditoria de hoje: 21 pinos de lead com etapa diferente da do funil (16 sem etapa
-- nenhuma e Perdido no HubSpot) — horas depois de uma correção em lote. O pino só era
-- atualizado quando alguém mexia NAQUELE negócio (espelho); negócio que muda de etapa
-- direto no HubSpot, ou que o robô reclassifica, ficava com a etapa velha no mapa.
--
-- Agora, a cada gravação do snapshot do funil (cockpit_snapshot, chave 'hubspot', a cada
-- rodada do robô), os pinos de LEAD daqueles negócios recebem a etapa do snapshot.
-- Não sobrescreve pino alterado nos últimos 10 minutos (o app pode ter acabado de mudar a
-- etapa, e o snapshot ser de antes). Nunca derruba a gravação do robô.

create or replace function public.etapa_do_pino_pelo_snapshot() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.chave is distinct from 'hubspot' then return new; end if;
  update public.clients c set etapa = r.rotulo
  from (
    select distinct on (l ->> 'id') l ->> 'id' as deal, e.key as st
    from jsonb_each(coalesce(new.conteudo -> 'funilLeads', '{}'::jsonb)) e, jsonb_array_elements(e.value) l
    where jsonb_typeof(e.value) = 'array'
  ) f
  join (values
    ('1395880469', 'Prospecção'), ('1396005401', 'Visita'), ('1395880470', 'Conversa com decisor'),
    ('1395880471', 'Demo/Proposta'), ('1395880472', 'Negociação'), ('1395880473', 'Ag. Pagamento'),
    ('1396006163', 'Enviado Onboarding'), ('1398311191', 'Reciclagem'), ('1396006162', 'Ganho'),
    ('1396006164', 'Perdido'), ('1396007427', 'Backlog')
  ) r(cod, rotulo) on r.cod = f.st
  where c.id_hubspot = f.deal and c.status = 'lead' and not c.is_archived
    and c.etapa is distinct from r.rotulo
    and (c.updated_at is null or c.updated_at < now() - interval '10 minutes');
  return new;
exception when others then
  raise warning 'etapa_do_pino_pelo_snapshot: %', sqlerrm;
  return new;
end; $$;

drop trigger if exists etapa_do_pino_pelo_snapshot on public.cockpit_snapshot;
create trigger etapa_do_pino_pelo_snapshot after insert or update of conteudo on public.cockpit_snapshot
  for each row when (new.chave = 'hubspot')
  execute function public.etapa_do_pino_pelo_snapshot();
