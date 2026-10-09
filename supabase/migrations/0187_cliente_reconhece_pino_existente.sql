-- 0187 (09/10/26): o cliente da Takeat reconhece o pino que já existe.
--
-- A clientes-sync só reconhecia um pino pelo id_hubspot do negócio de Onboarding/Sucesso.
-- O pino que o executivo criou ao vender está ligado ao negócio de Field Sales (outro id),
-- então o robô criava um segundo pino do mesmo restaurante, com o endereço do Google.
-- Caso medido: Bar e Petiscaria Mesma Turma — pino do robô (07/10) a 424 m do lugar; o
-- Marco fez check-in nele em 09/10 e a visita ficou "sem prova".
--
-- 1. pino_existente_do_cliente: o pino mais provável do mesmo restaurante (nome igual sem
--    acento/pontuação a até 1 km — o Google erra por centenas de metros —, ou um nome
--    contido no outro, com 6+ letras, a até 300 m). Só a service role chama.
-- 2. gravar_clientes_takeat: a ligação feita pela Edge (client_id) não se perde na rodada
--    seguinte, e os dados de uso (última comanda, situação) chegam ao pino ligado.

create or replace function public.pino_existente_do_cliente(p_nome text, p_lat numeric, p_lng numeric)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with k as (select public.plano_nome_chave(p_nome) as k)
  select c.id
    from public.clients c, k
   where not coalesce(c.is_archived, false)
     and c.latitude is not null and c.longitude is not null
     and k.k is not null and length(k.k) >= 5
     and abs(c.latitude - p_lat) < 0.012 and abs(c.longitude - p_lng) < 0.012
     and (
       (public.plano_nome_chave(coalesce(nullif(btrim(c.empresa), ''), c.nome)) = k.k
         and 2 * 6371000 * asin(sqrt(power(sin(radians((c.latitude - p_lat) / 2)), 2)
             + cos(radians(p_lat)) * cos(radians(c.latitude)) * power(sin(radians((c.longitude - p_lng) / 2)), 2))) <= 1000)
       or (length(k.k) >= 6
         and length(public.plano_nome_chave(coalesce(nullif(btrim(c.empresa), ''), c.nome))) >= 6
         and (strpos(public.plano_nome_chave(coalesce(nullif(btrim(c.empresa), ''), c.nome)), k.k) > 0
              or strpos(k.k, public.plano_nome_chave(coalesce(nullif(btrim(c.empresa), ''), c.nome))) > 0)
         and 2 * 6371000 * asin(sqrt(power(sin(radians((c.latitude - p_lat) / 2)), 2)
             + cos(radians(p_lat)) * cos(radians(c.latitude)) * power(sin(radians((c.longitude - p_lng) / 2)), 2))) <= 300)
     )
   order by (c.status in ('cliente', 'ganho_fs')) desc,
            ('clientes_sync' = any(coalesce(c.tags, '{}'))) asc,
            2 * 6371000 * asin(sqrt(power(sin(radians((c.latitude - p_lat) / 2)), 2)
              + cos(radians(p_lat)) * cos(radians(c.latitude)) * power(sin(radians((c.longitude - p_lng) / 2)), 2)))
   limit 1
$$;
revoke all on function public.pino_existente_do_cliente(text, numeric, numeric) from public, anon, authenticated;

do $mig$
declare d text;
begin
  select pg_get_functiondef('public.gravar_clientes_takeat(jsonb)'::regprocedure) into d;
  if position('em_queda = excluded.em_queda, motivo_queda = excluded.motivo_queda, client_id = excluded.client_id,' in d) = 0
     or position('    where c.id_hubspot = q.deal_id' in d) = 0 then
    raise exception '0187: gravar_clientes_takeat mudou; revisar à mão';
  end if;
  d := replace(d, 'client_id = excluded.client_id,', 'client_id = coalesce(excluded.client_id, t.client_id),');
  d := replace(d, '    where c.id_hubspot = q.deal_id',
    '    where (c.id_hubspot = q.deal_id or c.id = (select t2.client_id from public.clientes_takeat t2 where t2.deal_id = q.deal_id))');
  execute d;
end
$mig$;
