-- 0276 (24/11/26): o pino segue o negócio VIVO quando o restaurante tem dois.
--
-- Achado na auditoria de clientes de 24/11, aplicado com o ok do Julyan. O cliente
-- que volta ganha um negócio novo, e o antigo fica em Churn ligado ao mesmo pino.
-- A clientes-sync grava os dois a cada rodada, e o pino_segue_situacao dispara nos
-- dois: quem é gravado por último decide. O Onboarding é lido antes do Sucesso,
-- então o Churn antigo vencia todo dia (Fratello pizzaria, Sunflower Brasilia), e
-- acertar o pino à mão desfazia às 06:00.
--
-- Regra nova: um negócio 'ex' não põe 'churn' se o mesmo pino tem outro negócio
-- 'ativo' ou 'em_risco'; o pino vai para (ou fica em) 'cliente'. O resto da função
-- é o da 0189, igual. create or replace mantém dono, security definer e o proacl
-- ({postgres=X/postgres,service_role=X/postgres}, copiado em arquivo.copias antes).

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
  -- 0276: o negócio vivo do mesmo restaurante vence o antigo em Churn
  if v_para = 'churn' and exists (
       select 1 from public.clientes_takeat o
        where o.client_id = new.client_id and o.deal_id <> new.deal_id
          and o.situacao in ('ativo', 'em_risco')) then
    v_para := 'cliente';
  end if;
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

revoke all on function public.pino_segue_situacao() from public, anon, authenticated;
