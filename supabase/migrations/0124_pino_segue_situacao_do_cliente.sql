-- 0124 · O pino do mapa segue a situação real do cliente (ok do Julyan, 27/09: "pode corrigir os pinos")
--
-- Medido na rodada 1 da clientes-sync: 447 pinos verdes (status 'cliente') são ex-cliente no
-- HubSpot, e 18 pinos 'churn' estão ativos. O mapa pinta pela coluna status.
--
-- Regra: toda vez que a clientes-sync grava um cliente (clientes_takeat), o pino ligado
-- (client_id) passa a 'cliente' se ele é ativo/em risco, e a 'churn' se é ex.
--   * só mexe em pino que JÁ é 'cliente' ou 'churn' — lead e ganho_fs não são tocados
--     (a trava guard_client_status_transition proíbe cliente/churn -> lead; aqui nunca vai);
--   * cada troca fica em clientes_takeat_status_log, com o valor anterior, para desfazer:
--       update clients c set status = l.de from clientes_takeat_status_log l
--        where l.client_id = c.id and l.em >= '<quando>';

create table if not exists public.clientes_takeat_status_log (
  id        bigserial primary key,
  client_id uuid not null,
  deal_id   text,
  de        text,
  para      text,
  em        timestamptz not null default now()
);
alter table public.clientes_takeat_status_log enable row level security;
drop policy if exists clientes_takeat_status_log_gestor_le on public.clientes_takeat_status_log;
create policy clientes_takeat_status_log_gestor_le on public.clientes_takeat_status_log for select to authenticated
  using (public.is_field_admin());

create or replace function public.pino_segue_situacao()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_para text; v_de text;
begin
  if new.client_id is null or new.situacao not in ('ativo', 'em_risco', 'ex') then return new; end if;
  v_para := case when new.situacao = 'ex' then 'churn' else 'cliente' end;
  select status into v_de from public.clients where id = new.client_id;
  if v_de in ('cliente', 'churn') and v_de <> v_para then
    update public.clients set status = v_para where id = new.client_id;
    insert into public.clientes_takeat_status_log (client_id, deal_id, de, para) values (new.client_id, new.deal_id, v_de, v_para);
  end if;
  return new;
end;
$$;

drop trigger if exists pino_segue_situacao on public.clientes_takeat;
create trigger pino_segue_situacao
  after insert or update of situacao, client_id on public.clientes_takeat
  for each row execute function public.pino_segue_situacao();
