-- 0139 · Sem login, função que grava ou devolve dado do time não executa (28/09/2026)
--
-- Auditoria (advisor de segurança): 41 funções SECURITY DEFINER eram executáveis pelo
-- papel anon via /rest/v1/rpc — sem login nenhum. Entre elas, as que GRAVAM
-- (generate_client_tasks, apply_hubspot_activity, stamp_won_at) e as que devolvem dado
-- do time (métricas do gestor, lista de perfis, candidatos de SLA). Aprovado pelo Julyan
-- no chat ("bora fazer tudo").
--
-- Quem as chama continua chamando: o app logado (authenticated) e os robôs e edge
-- functions (service_role). Ficam de fora, de propósito:
--   - as auxiliares das regras de acesso (is_field_admin, is_view_only_user,
--     can_view_metrics, eh_gestor_cockpit, meu_owner_hubspot): sem login não revelam
--     nada e são avaliadas dentro das próprias políticas;
--   - as funções de gatilho (tg_*, *_ponte, rota_para_plano…): só rodam por gatilho;
--   - sync_stage_property_options: não achei quem a chama, e cortar um robô externo em
--     silêncio é pior que deixá-la como está.
do $$
declare f text;
begin
  foreach f in array array[
    'public.apply_hubspot_activity(jsonb)',
    'public.generate_client_tasks()',
    'public.gestor_metric_leads(text, timestamp with time zone, timestamp with time zone, uuid, text, text)',
    'public.gestor_metrics(timestamp with time zone, timestamp with time zone)',
    'public.gestor_metrics_guard()',
    'public.gestor_task_metrics(timestamp with time zone, timestamp with time zone)',
    'public.gestor_tasks_list(text, text, timestamp with time zone, timestamp with time zone)',
    'public.get_all_profiles()',
    'public.my_metric_leads(text, timestamp with time zone, timestamp with time zone, text)',
    'public.my_metrics(timestamp with time zone, timestamp with time zone)',
    'public.sla_estourado_candidates(text, integer)',
    'public.stamp_won_at(uuid)',
    'public.dono_do_territorio(text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
