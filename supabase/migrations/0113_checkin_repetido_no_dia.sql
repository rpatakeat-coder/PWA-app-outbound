-- 0113 · Check-in repetido no mesmo dia não vira segunda visita
-- (handoff App de Campo v4.1 §6.4, 26/09/2026).
--
-- Até aqui cada toque em "Cheguei" gravava uma linha nova em client_visits e
-- somava visit_count — "Registrar de novo" no mesmo lead e no mesmo dia
-- contava duas visitas no placar, no calor e na Daily. O app já não faz o
-- segundo check-in (abre o registro direto); esta trava é a garantia do lado
-- do servidor: mesmo vendedor + mesmo lead + mesmo dia em Brasília = a mesma
-- visita. A função devolve o lead sem gravar nada.
--
-- Como aplica: lê a definição viva de mark_client_as_visited (0109) e insere
-- o bloco antes de "v_etapa_anterior := v_client.etapa;". Idempotente: se o
-- marcador 0113 já está na função, não faz nada. CREATE OR REPLACE mantém os
-- grants da 0109.
do $mig$
declare
  d text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mark_client_as_visited';
  if d is null then
    raise exception '0113: mark_client_as_visited não existe';
  end if;
  if position('0113' in d) > 0 then
    return;
  end if;
  if position('v_etapa_anterior := v_client.etapa;' in d) = 0 then
    raise exception '0113: âncora não encontrada na função';
  end if;
  d := replace(d, 'v_etapa_anterior := v_client.etapa;',
'-- 0113: mesmo vendedor, mesmo lead, mesmo dia (Brasília) = a mesma visita.
  IF EXISTS (
    SELECT 1 FROM public.client_visits
     WHERE client_id = p_client_id
       AND visited_by = v_caller
       AND (visited_at AT TIME ZONE ''America/Sao_Paulo'')::date = (v_quando AT TIME ZONE ''America/Sao_Paulo'')::date
  ) THEN
    RETURN v_client;
  END IF;

  v_etapa_anterior := v_client.etapa;');
  execute d;
end
$mig$;
