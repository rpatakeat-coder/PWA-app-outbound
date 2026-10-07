-- 0181 · A rota que o gestor vê também conta cada restaurante uma vez (07/10/2026)
--
-- Par da 0180: rotas_da_semana (a rota de cada um na Rua e a faixa de dias da Pessoas) ainda
-- devolvia o mesmo restaurante duas vezes no dia (lead e negócio) — "Hoje 15" ao lado de "5 de 9".
-- Só o GV2 lê esta função, e só para mostrar; a grade do Planejamento não passa por aqui.
create or replace function public.rotas_da_semana(p_segunda date, p_donos text[])
returns table(owner_id text, dia date, vaga integer, item_id text, proposito text, hora text, client_id uuid, nome text, lat numeric, lng numeric, acao text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select x.owner_id, x.dia, x.vaga, x.item_id, x.proposito, x.hora, x.client_id, x.nome, x.lat, x.lng, x.acao from (
    select distinct on (i.owner_id, i.dia, coalesce(i.client_id::text, public.plano_nome_chave(i.nome), i.item_id)) i.*
      from public.itens_do_plano(p_segunda, case when (select public.eh_gestor_cockpit()) then p_donos else array[(select public.meu_owner_hubspot())] end) i
     order by i.owner_id, i.dia, coalesce(i.client_id::text, public.plano_nome_chave(i.nome), i.item_id), (left(i.item_id, 2) = 'n-'), i.vaga
  ) x
  order by x.owner_id, x.dia, x.vaga
$function$;
