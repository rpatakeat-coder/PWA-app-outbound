-- 0174 · ROTAS DA SEMANA PARA O COCKPIT DO GESTOR (Rua › Rotas, 06/10/26)
--
-- itens_do_plano (o plano da semana com hora e coordenada, a mesma fonte do Planejamento e
-- do app) é security definer e só o service_role executa: liberar direto deixaria qualquer
-- usuário logado ler o plano de todo mundo. Esta porteira decide pela sessão:
--   · gestor (eh_gestor_cockpit) → os donos pedidos;
--   · qualquer outro → só o próprio plano (meu_owner_hubspot), seja o que for pedido.
create or replace function public.rotas_da_semana(p_segunda date, p_donos text[])
returns table(owner_id text, dia date, vaga integer, item_id text, proposito text, hora text, client_id uuid, nome text, lat numeric, lng numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select * from public.itens_do_plano(
    p_segunda,
    case when (select public.eh_gestor_cockpit()) then p_donos
         else array[(select public.meu_owner_hubspot())] end)
$$;

revoke all on function public.rotas_da_semana(date, text[]) from public, anon;
grant execute on function public.rotas_da_semana(date, text[]) to authenticated;
