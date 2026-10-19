-- 0219 · O RECADO DO GESTOR VIRA PUSH (19/10/2026)
--
-- Julyan: o "Cobrar" do cockpit manda a mensagem para o app do executivo (sugestoes_planos, que
-- abre na tela inicial) "e isso tinha que ir pra notificação via push também". A cada linha nova,
-- este gatilho chama a op 'recado' da Edge push-fila com o segredo do cron (vault push_fila). A
-- chamada é assíncrona (pg_net): o insert do cockpit não espera o push, e falhar não desfaz nada.
create or replace function public.recado_vira_push()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_segredo text;
begin
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'push_fila' order by created_at desc limit 1;
  if v_segredo is null then return new; end if;
  perform net.http_post(
    url := 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/push-fila?forceFunctionRegion=us-west-2',
    body := jsonb_build_object('op', 'recado', 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    timeout_milliseconds := 30000
  );
  return new;
exception when others then
  return new; -- o recado já está gravado: o push é complemento
end $$;
revoke execute on function public.recado_vira_push() from public, anon, authenticated;

drop trigger if exists recado_vira_push on public.sugestoes_planos;
create trigger recado_vira_push after insert on public.sugestoes_planos
  for each row execute function public.recado_vira_push();
