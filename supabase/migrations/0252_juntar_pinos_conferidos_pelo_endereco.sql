-- 0252 (05/11/26) · OS CASOS QUE A 0251 DEIXOU PARA CONFERIR, CONFERIDOS PELO ENDEREÇO
--
-- Mesmo endereço dos dois lados = mesmo restaurante; o pino do robô (endereço no Nominatim/HubSpot)
-- estava longe e o da prospecção tem a coordenada do Google. Fica o da prospecção (com dono):
--   Capitão Jack      Estrada Intendente Magalhães 511 (robô a 23 km)
--   Caranguejo do Assis  nº 290, Praia de Itaparica (robô a 1,9 km)
--   Churrascaria Gaúcho Raiz  R. José Félix Cheim, Praia de Itaparica (robô a 3 km)
--   Mandacaru Gastrobar  Luciano das Neves 286 (robô a 1,2 km)
-- Ficam separados (endereços diferentes = unidades diferentes): Rios Gourmet (Freguesia × Méier) e
-- Tetto Rooftop (Rozendo Serapião 51 × Adalberto Simão Nader 605).
--
-- KOKAI GRAN PARK: o pino do robô (de42fa04) já era o "mantido" de uma junção da 0189. Junta no pino
-- do Marco e ACHATA a cadeia: quem apontava para de42fa04 passa a apontar para o pino que fica, porque
-- a 0190 só resolve um nível de pinos_juntados.

do $mig$
declare
  par record;
  t text;
  v_lead uuid;
  movidas int;
begin
  for par in select * from (values
('16380c08-f100-43c7-b9ff-befa983d5633'::uuid,'c176f32d-4494-4f65-b7a1-a16650b24a70'::uuid,'Capitão Jack'),
('d5678905-e197-47f5-8322-199f6ddcafd0'::uuid,'eb011486-1153-4d90-a233-6d9451994934'::uuid,'Caranguejo do Assis'),
('47d3c122-42bb-4096-a74b-86e27242dbbc'::uuid,'33072962-abbd-4815-a9cb-27a7017dfdb1'::uuid,'Churrascaria Gaúcho Raiz'),
('a1b3cbc4-6278-4e96-bd89-bf67ecd83deb'::uuid,'46c2562a-9147-4cf8-b6d8-9ae02be6c595'::uuid,'Mandacaru Gastrobar'),
('de42fa04-7c43-4126-a772-e063b9e048f7'::uuid,'85d7e995-56d2-4c54-9193-c57240ad2075'::uuid,'KOKAI - GRAN PARK')
    ) as x(removido, mantido, nome)
  loop
    if exists (select 1 from public.pinos_juntados where removido = par.removido)
       or not exists (select 1 from public.clients where id = par.removido and not coalesce(is_archived, false)) then
      raise notice '0252: % já resolvido', par.nome; continue;
    end if;
    if not exists (select 1 from public.clients where id = par.mantido and not coalesce(is_archived, false)) then
      raise exception '0252: o pino que fica de % não está ativo; revisar à mão', par.nome;
    end if;
    insert into public.pinos_juntados (removido, mantido, status_mantido_antes, motivo)
    select par.removido, par.mantido, c.status, '0252: mesmo endereço; o pino do robô de ' || par.nome || ' estava longe'
      from public.clients c where c.id = par.mantido;
    -- achata a cadeia (Kokai): junções antigas que apontavam para o pino que sai
    update public.pinos_juntados set mantido = par.mantido where mantido = par.removido;
    foreach t in array array['client_visits', 'client_meetings', 'client_notes', 'client_stage_changes',
      'client_status_history', 'contatos_de_campo', 'fichas_de_rua', 'fotos_visita',
      'plano_rota_sincronizado', 'target_accounts'] loop
      execute format('update public.%I set client_id = $1 where client_id = $2', t) using par.mantido, par.removido;
    end loop;
    update public.field_route_stops s set client_id = par.mantido
     where s.client_id = par.removido
       and not exists (select 1 from public.field_route_stops o where o.route_id = s.route_id and o.client_id = par.mantido);
    update public.client_tasks k set client_id = par.mantido
     where k.client_id = par.removido
       and not (k.status = 'pendente' and exists (select 1 from public.client_tasks o
                 where o.client_id = par.mantido and o.task_type = k.task_type and o.status = 'pendente'));
    update public.sinais_ao_vivo set client_id = par.mantido where client_id::text = par.removido::text;
    update public.clientes_takeat set client_id = par.mantido where client_id = par.removido;
    select lead_prospeccao_id into v_lead from public.clients where id = par.removido;
    update public.clients set is_archived = true, lead_prospeccao_id = null where id = par.removido;
    if v_lead is not null then
      update public.clients set lead_prospeccao_id = v_lead where id = par.mantido and lead_prospeccao_id is null;
    end if;
    select count(*) into movidas from public.client_visits where client_id = par.mantido;
    update public.clients set visit_count = greatest(coalesce(visit_count, 0), movidas) where id = par.mantido;
  end loop;
  update public.clients c set status = 'cliente'
    from public.pinos_juntados j
   where j.mantido = c.id and j.motivo like '0252:%' and c.status = 'lead'
     and exists (select 1 from public.clientes_takeat t where t.client_id = c.id and t.situacao in ('ativo', 'em_risco'));
end
$mig$;
