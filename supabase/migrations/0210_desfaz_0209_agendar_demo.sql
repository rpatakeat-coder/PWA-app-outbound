-- 0210 · DESFAZ A 0209 (Julyan, 16/10/2026)
--
-- A 0209 (agendar_demo_so_travado) tirou o degrau D2 do generate_client_tasks por um pedido que
-- eu entendi errado: o Julyan queria a mensagem de WhatsApp das 18h cobrando só os quentes sem
-- próximo passo, não mexer nesta regra. "desfaz tudo q fez". Volta o D2 (2 dias úteis em
-- Conversa com decisor) e o auto-resolver com >= 2, exatamente como antes da 0209.
-- Os 5 D2 que a 0209 fechou como resolvida_auto voltam como pendentes na rodada seguinte do cron
-- (a regra só pula o que foi concluído ou dispensado).
--
-- Troca de volta só os dois trechos que a 0209 escreveu, sobre a definição no ar. Idempotente.
do $migr$
declare
  d text;
  sev_0209 constant text := $a$WHEN days_in_stage >= 5 THEN 'D5' /* 0209: sem D2, lead no prazo não é cobrado */ ELSE NULL END$a$;
  sev_antes constant text := $a$WHEN days_in_stage >= 5 THEN 'D5' WHEN days_in_stage >= 2 THEN 'D2' ELSE NULL END$a$;
  res_0209 constant text := $b$greatest(c.created_at, v_activation)), now()) >= 5 /* 0209 */$b$;
  res_antes constant text := $b$greatest(c.created_at, v_activation)), now()) >= 2$b$;
begin
  d := pg_get_functiondef('public.generate_client_tasks()'::regprocedure);
  if position('0209' in d) = 0 then
    raise notice '0210: a 0209 não está no ar (nada a desfazer)';
    return;
  end if;
  if (length(d) - length(replace(d, sev_0209, ''))) / length(sev_0209) <> 1
     or (length(d) - length(replace(d, res_0209, ''))) / length(res_0209) <> 1 then
    raise exception '0210: os trechos da 0209 não estão como ela os escreveu em generate_client_tasks';
  end if;
  execute replace(replace(d, sev_0209, sev_antes), res_0209, res_antes);
end
$migr$;

-- Conferência (leitura), depois da rodada seguinte do cron:
--   select severity, status, count(*) from public.client_tasks
--    where task_type = 'agendar_demo' and status = 'pendente' group by 1, 2;
