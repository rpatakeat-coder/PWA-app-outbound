-- 0209 · "AGENDAR DEMO" SÓ PARA O DECISOR TRAVADO (Julyan, 16/10/2026)
--
-- "e só cobrar tbm os travados sem proximo passo na automação, nao os leads recentes".
--
-- generate_client_tasks (cron generate_client_tasks_30min) abre a tarefa "Agendar Demo" no app
-- para o lead em Conversa com decisor sem reunião futura em dois degraus: D2 com 2 dias úteis na
-- etapa e D5 com 5. A régua do Decisor no Cockpit é 4 dias úteis: o D2 cobrava o lead recente,
-- ainda dentro do prazo. Fica só o D5 (5 > 4 = travado). O auto-resolver acompanha (>= 5): os D2
-- pendentes de lead com 2 a 4 dias saem como resolvida_auto na rodada seguinte do cron.
-- Medido em 16/10: 5 "D2 Agendar Demo" pendentes; os 45 D5 pendentes não mudam.
--
-- Troca só os dois limiares, sobre a definição que está no ar (como a 0208). Idempotente.
do $migr$
declare
  d text;
  sev_antes constant text := $a$WHEN days_in_stage >= 5 THEN 'D5' WHEN days_in_stage >= 2 THEN 'D2' ELSE NULL END$a$;
  sev_depois constant text := $a$WHEN days_in_stage >= 5 THEN 'D5' /* 0209: sem D2, lead no prazo não é cobrado */ ELSE NULL END$a$;
  res_antes constant text := $b$greatest(c.created_at, v_activation)), now()) >= 2$b$;
  res_depois constant text := $b$greatest(c.created_at, v_activation)), now()) >= 5 /* 0209 */$b$;
begin
  d := pg_get_functiondef('public.generate_client_tasks()'::regprocedure);
  if position('0209:' in d) > 0 then
    raise notice '0209: já aplicada';
    return;
  end if;
  if (length(d) - length(replace(d, sev_antes, ''))) / length(sev_antes) <> 1 then
    raise exception '0209: o degrau D2 não está (ou está mais de uma vez) em generate_client_tasks';
  end if;
  if (length(d) - length(replace(d, res_antes, ''))) / length(res_antes) <> 1 then
    raise exception '0209: o limiar do auto-resolver (>= 2) não está (ou está mais de uma vez) em generate_client_tasks';
  end if;
  execute replace(replace(d, sev_antes, sev_depois), res_antes, res_depois);
end
$migr$;

-- Conferência (leitura), depois de aplicar e da rodada seguinte do cron:
--   select severity, status, count(*) from public.client_tasks
--    where task_type = 'agendar_demo' and status = 'pendente' group by 1, 2;
--   -> nenhuma linha D2 pendente.
