-- O COCKPIT ABRE QUENTE (16/11/26)
--
-- Medido com o banco calmo: a 1ª abertura do Cockpit levava 8,5 s, e 6,2 s eram a cockpit-dados
-- acordando (relê e desmonta o snapshot de 2,9 MB); quente, ela responde em ~2 s. Este robô bate no
-- ramo ?aquecer=1 da função a cada 4 minutos, de segunda a sexta, das 7h às 21h (10–23 UTC), com o
-- segredo 'push_fila' do vault. O ramo só carrega o snapshot na memória da função: não devolve dado.
-- Custo: uma leitura leve (a assinatura do snapshot) a cada 4 min; a leitura grande só quando a função
-- tinha dormido. A cockpit-dados passou a ser pino (stub que importa do GitHub) com verify_jwt
-- desligado: todo ramo que não é o de aquecer continua validando a sessão no código (401 sem ela).
--
-- O agendamento não é DDL e foi feito à parte:
--   select cron.schedule('cockpit-aquecer', '*/4 10-23 * * 1-5', 'select public.invocar_cockpit_aquecer()');

create or replace function public.invocar_cockpit_aquecer()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_segredo text; v_req bigint;
begin
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'push_fila' order by created_at desc limit 1;
  if v_segredo is null then raise exception 'segredo push_fila ausente no vault'; end if;
  select net.http_get(
    url := 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/cockpit-dados?forceFunctionRegion=us-west-2&aquecer=1',
    headers := jsonb_build_object('x-cron-secret', v_segredo),
    timeout_milliseconds := 30000
  ) into v_req;
  return v_req;
end;
$$;
revoke all on function public.invocar_cockpit_aquecer() from public, anon, authenticated;
