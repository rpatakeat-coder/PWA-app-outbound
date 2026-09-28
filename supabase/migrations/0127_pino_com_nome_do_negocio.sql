-- 0127 · O pino do cliente leva o nome inteiro do negócio (27/09, "pode seguir com os três")
--
-- 626 pinos de cliente tinham só o pedaço depois do " - ": "Filial" em vez de "SALGADO
-- DOCINHO - Filial", "Perdizes" em vez de "Quebrada Burger - Perdizes". A causa é o
-- hubspot-lead-webhook, que tirava tudo antes do primeiro " - " (feito para "Oportunidade -
-- X"); ele foi corrigido junto com esta migration e passa a tirar só prefixo genérico.
--
-- Aqui, a cada gravação da clientes-sync, o pino cujo nome é exatamente o FINAL do nome do
-- negócio (" - <nome do pino>") recebe o nome inteiro. Pino com nome diferente disso não é
-- tocado (pode ter sido renomeado de propósito). `nome` (o contato) só muda se era o mesmo
-- pedaço cortado.

create or replace function public.pino_segue_situacao()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_para text; v_de text; v_emp text;
begin
  if new.client_id is null or new.situacao not in ('ativo', 'em_risco', 'ex') then return new; end if;
  v_para := case when new.situacao = 'ex' then 'churn' else 'cliente' end;
  select status, trim(coalesce(empresa, nome)) into v_de, v_emp from public.clients where id = new.client_id;
  if v_de in ('cliente', 'churn') and v_de <> v_para then
    update public.clients set status = v_para where id = new.client_id;
    insert into public.clientes_takeat_status_log (client_id, deal_id, de, para) values (new.client_id, new.deal_id, v_de, v_para);
  end if;
  -- Nome inteiro do negócio no lugar do pedaço cortado.
  if new.nome is not null and v_emp is not null and length(new.nome) > length(v_emp)
     and lower(right(trim(new.nome), length(v_emp) + 3)) = lower(' - ' || v_emp) then
    update public.clients
       set empresa = trim(new.nome),
           nome = case when trim(nome) = v_emp then trim(new.nome) else nome end
     where id = new.client_id;
  end if;
  return new;
end;
$$;
