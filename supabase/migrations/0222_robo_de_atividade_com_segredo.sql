-- 0222 · O ROBÔ DE ATIVIDADE DO HUBSPOT VOLTA A RODAR (20/10/26)
--
-- O job 9 (hubspot-activity-sync-diario, 05:00 BRT) mandava o header
-- "Authorization: Bearer SUA_SERVICE_ROLE_KEY" — o texto do exemplo, nunca trocado. A função
-- respondia 401 toda madrugada e o pg_cron/pg_net marcavam "succeeded/200" (só medem o
-- enfileiramento). Resultado: clients.hs_last_activity_at e hs_stage_entered_at nulos nos 10,8 mil
-- pinos, e o SLA da rota caindo em created_at/visited_at.
--
-- Agora segue o padrão dos outros robôs (clientes-sync, push-fila): segredo no vault, rotina
-- security definer que chama a função com x-cron-secret, e a função confere por segredo_confere.
-- O valor do segredo é sorteado aqui e nunca vai para o git.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hubspot_activity') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'hubspot_activity', 'cron do hubspot-activity-sync (0222)');
  end if;
end $$;

create or replace function public.invocar_hubspot_activity()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $function$
declare v_segredo text; v_req bigint;
begin
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'hubspot_activity'
   order by created_at desc limit 1;
  if v_segredo is null then raise exception 'segredo hubspot_activity ausente no vault'; end if;
  select net.http_post(
    url := 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/hubspot-activity-sync?forceFunctionRegion=us-west-2',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    timeout_milliseconds := 150000
  ) into v_req;
  return v_req;
end;
$function$;

revoke all on function public.invocar_hubspot_activity() from public, anon, authenticated;

-- o job 9 passa a chamar a rotina (mesmo horário: 08:00 UTC = 05:00 BRT)
select cron.alter_job(9, command := 'select public.invocar_hubspot_activity();')
where exists (select 1 from cron.job where jobid = 9 and jobname = 'hubspot-activity-sync-diario');
