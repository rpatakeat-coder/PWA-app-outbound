-- 0189 (09/10/26): junta os 13 pinos que a clientes-sync duplicou (grupo A da lista de
-- Downloads/duplicados-de-pino-09-10.csv), aprovado pelo Julyan.
--
-- Para cada par (removido = pino do robô, mantido = o pino que já existia):
--   · tudo que aponta para o removido passa para o mantido (visita, parada, plano, sinais...);
--   · a lista de clientes da Takeat passa a apontar para o mantido (o gatilho
--     pino_segue_situacao muda churn -> cliente e registra no clientes_takeat_status_log);
--   · o removido é ARQUIVADO (is_archived), não apagado;
--   · pinos_juntados guarda o par e o status de antes, para desfazer.
-- E pino_segue_situacao passa a mudar lead -> cliente quando o lead é ligado a um cliente
-- ativo (antes só mexia em cliente/churn): os 3 leads do grupo A e os próximos do robô.

create table if not exists public.pinos_juntados (
  removido uuid not null,
  mantido uuid not null,
  status_mantido_antes text,
  juntado_em timestamptz not null default now(),
  motivo text,
  primary key (removido)
);
alter table public.pinos_juntados enable row level security;
revoke all on public.pinos_juntados from anon, authenticated;

create or replace function public.pino_segue_situacao()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_para text; v_de text; v_emp text;
begin
  if new.client_id is null or new.situacao not in ('ativo', 'em_risco', 'ex') then return new; end if;
  v_para := case when new.situacao = 'ex' then 'churn' else 'cliente' end;
  select status, trim(coalesce(empresa, nome)) into v_de, v_emp from public.clients where id = new.client_id;
  -- 0189: lead ligado a um cliente ATIVO da Takeat vira cliente (o restaurante já é cliente)
  if (v_de in ('cliente', 'churn') and v_de <> v_para) or (v_de = 'lead' and v_para = 'cliente') then
    update public.clients set status = v_para where id = new.client_id;
    insert into public.clientes_takeat_status_log (client_id, deal_id, de, para) values (new.client_id, new.deal_id, v_de, v_para);
  end if;
  if new.nome is not null and v_emp is not null and length(new.nome) > length(v_emp)
     and lower(right(trim(new.nome), length(v_emp) + 3)) = lower(' - ' || v_emp) then
    update public.clients
       set empresa = trim(new.nome),
           nome = case when trim(nome) = v_emp then trim(new.nome) else nome end
     where id = new.client_id;
  end if;
  return new;
end;
$function$;

do $mig$
declare
  par record;
  t text;
begin
  for par in
    select * from (values
      ('5bfc8264-ebc4-4eb0-bc7b-aea9aa440be9'::uuid, '97c87f43-8ce6-4b2e-bf41-a7d89b432ca8'::uuid, 'Arena Vila Beats'),
      ('058c5157-dcd2-45a2-88e6-86575b0cb4ca', '38348d34-cae9-4fd0-a2a4-1270e40c07bd', 'Bar e Petiscaria Mesma Turma'),
      ('b78c5b29-2359-4935-971e-0f36c5ed32b9', '835c194f-4da1-4c35-873b-3b2e3adbbd12', 'Bola 7 Botequim'),
      ('293c3502-efff-45fd-8f89-870c713c6e83', 'ae8eabb2-9ec5-4213-8fac-13bdf131936c', 'Doce Encanto Confeitaria Gourmet'),
      ('10ee7349-34cb-4384-927f-827f07fa0a0a', '9f340497-cedd-426c-b10c-eaf1e78533fd', 'Fogueira Restaurante'),
      ('9b881afa-5b40-4597-8444-c6572a845afb', '264bf71d-eefa-436a-adb1-c430f0386864', 'Guté Padaria e Confeitaria'),
      ('c43d594b-9d87-476f-bc3e-96a17755be66', 'de42fa04-7c43-4126-a772-e063b9e048f7', 'Kokai Gran Park'),
      ('8e7df8ee-40e0-416a-a2da-45d989725e2a', 'dafb9e3e-9415-42d0-bbc6-40be3f37a9dd', 'Lá Dá Torta II'),
      ('3efad848-d5d7-480a-a9cc-66f42a64227e', '21705902-ccd0-4a54-88f1-33ff5a589b3d', 'Rancho Beliskão'),
      ('c3a9c814-3851-4557-8ce3-505a9d144493', '65ce8c16-1767-4920-ae4b-1e9756e17a37', 'Shuk Esfihas'),
      ('47e8162d-5fcb-4170-9b6e-bfc3a0630555', 'a8cfa4f7-5c18-43ec-b6a2-70f619b5fbf8', 'Sr máximo Hambúrgueria - Timóteo'),
      ('8a67c98f-044b-4071-8c7d-fa41bc8adf25', '3438b3ac-4942-43cb-9de3-0936984ca24a', 'TRADICIONAL CAFE')
    ) as x(removido, mantido, nome)
  loop
    -- já juntado (rodar de novo não faz nada)
    if exists (select 1 from public.pinos_juntados where removido = par.removido) then continue; end if;
    if not exists (select 1 from public.clients where id = par.removido)
       or not exists (select 1 from public.clients where id = par.mantido and not coalesce(is_archived, false)) then
      raise exception '0189: par % não está como esperado', par.nome;
    end if;
    insert into public.pinos_juntados (removido, mantido, status_mantido_antes, motivo)
    select par.removido, par.mantido, c.status, 'clientes-sync duplicou o pino de ' || par.nome
      from public.clients c where c.id = par.mantido;

    -- a parada da mesma rota não pode existir duas vezes (field_route_stops_route_client_idx)
    if exists (select 1 from public.field_route_stops a join public.field_route_stops b
                 on a.route_id = b.route_id and a.client_id = par.removido and b.client_id = par.mantido) then
      raise exception '0189: % tem parada nos dois pinos na mesma rota; revisar à mão', par.nome;
    end if;

    foreach t in array array['client_visits', 'client_meetings', 'client_notes', 'client_tasks', 'client_stage_changes',
      'client_status_history', 'contatos_de_campo', 'fichas_de_rua', 'field_route_stops', 'fotos_visita',
      'geocode_repair_attempts', 'plano_rota_sincronizado', 'target_accounts', 'stage_change_failures'] loop
      execute format('update public.%I set client_id = $1 where client_id = $2', t) using par.mantido, par.removido;
    end loop;
    update public.sinais_ao_vivo set client_id = par.mantido where client_id::text = par.removido::text;
    update public.clientes_takeat set client_id = par.mantido where client_id = par.removido;
    update public.clients set is_archived = true where id = par.removido;
  end loop;

  -- os leads do grupo A que o gatilho não pegou (já ligados antes da regra nova): cliente
  update public.clients c set status = 'cliente'
    from public.pinos_juntados j
   where j.mantido = c.id and c.status = 'lead'
     and exists (select 1 from public.clientes_takeat t where t.client_id = c.id and t.situacao in ('ativo', 'em_risco'));
end
$mig$;
