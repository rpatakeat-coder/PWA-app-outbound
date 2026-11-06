-- 0256 · Os cards do espelho para o Planejamento do Cockpit (06/11/26)
--
-- O Cockpit carrega a carteira do executivo uma vez, ao abrir. O negócio que ele cria no app
-- depois disso já está em espelho_negocios (com o card montado), mas não na carteira da sessão:
-- no Planejamento o cartão virava só "pino do app", sem ficha e sem o resto (caso do Jean, 06/11:
-- 15 negócios da segunda criados no mesmo dia). espelho_negocios tem RLS sem política, então o
-- navegador não lê; esta função devolve SÓ os ids pedidos (até 200), só do próprio dono — ou de
-- qualquer dono para o gestor.

create or replace function public.cards_do_espelho(p_ids text[])
returns table (deal_id text, dealstage text, owner_id text, card jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.deal_id::text, e.dealstage::text, e.owner_id::text, e.card
  from espelho_negocios e
  where e.deal_id::text = any ((coalesce(p_ids, '{}'::text[]))[1:200])
    and e.card is not null
    and (
      public.is_field_admin()
      or e.owner_id::text = (select p.id_hubspot::text from profiles p where p.id = auth.uid())
    );
$$;

revoke all on function public.cards_do_espelho(text[]) from public;
revoke all on function public.cards_do_espelho(text[]) from anon;
grant execute on function public.cards_do_espelho(text[]) to authenticated;
