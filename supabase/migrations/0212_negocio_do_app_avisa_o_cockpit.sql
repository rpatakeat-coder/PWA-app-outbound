-- 0212 · NEGÓCIO CRIADO PELO APP AVISA O COCKPIT (16/10/2026)
--
-- Julyan, 16/10: "quero q tudo entre em prospecção, tanto no app, quanto cockpit". O app passou a
-- criar o negócio em Prospecção quando o executivo põe no plano (ou registra na ficha) um pino sem
-- negócio, pelo create_pin de sempre, que grava o id em clients.id_hubspot. Mas a conta-alvo mora
-- também em leads_prospeccao, e o Cockpit lê leads_prospeccao.hubspot_deal_id para saber se ela já é
-- negócio. O create_pin nunca escreveu ali: medido hoje, 65 contas-alvo viraram negócio pelo app e
-- continuam "conta nova sem negócio" no Cockpit, que oferece criar um SEGUNDO negócio para elas.
--
-- O gatilho copia o id do negócio do pino para a conta-alvo dele, só quando ela ainda não tem um
-- (nunca sobrescreve: os 6 casos em que os dois lados divergem ficam como estão, para olhar à mão).
-- O update em leads_prospeccao dispara municao_lead_mudou em profundidade 2, que sai no primeiro if:
-- nada no pino muda. O preenchimento dos 65 roda no nível 1 e sincroniza o pino, que já tem
-- id_hubspot, então o update de municao_sincronizar_pino não casa nenhuma linha.
create or replace function public.pino_com_negocio_avisa_conta_alvo()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.id_hubspot is null or new.lead_prospeccao_id is null then return new; end if;
  update public.leads_prospeccao lp
     set hubspot_deal_id = new.id_hubspot
   where lp.id = new.lead_prospeccao_id
     and lp.hubspot_deal_id is null;
  return new;
end $$;

drop trigger if exists pino_com_negocio_avisa_conta_alvo on public.clients;
create trigger pino_com_negocio_avisa_conta_alvo
  after insert or update of id_hubspot, lead_prospeccao_id on public.clients
  for each row execute function public.pino_com_negocio_avisa_conta_alvo();

-- os que já viraram negócio pelo app antes do gatilho
update public.leads_prospeccao lp
   set hubspot_deal_id = c.id_hubspot
  from public.clients c
 where c.lead_prospeccao_id = lp.id
   and c.id_hubspot is not null
   and lp.hubspot_deal_id is null;
