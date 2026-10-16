-- 0203 · A DATA DE ABERTURA DOS LEADS VISITADOS (15/10/26)
--
-- A meta "x/5 recém-abertos visitados na semana" do mapa do executivo só sabia a data de abertura
-- dos leads DELE: a RLS de leads_prospeccao devolve ao executivo só as linhas de que ele é o
-- responsável. Visita com prova a um recém-aberto de outro dono (pino de colega, lead reatribuído
-- depois da visita) não contava, e o número do app ficava menor que o do Cockpit do gestor, que lê
-- tudo. Auditoria do mapa, 15/10/26.
--
-- Esta função devolve SÓ a data de abertura (nada de nome, telefone, dono ou CNPJ) dos ids pedidos,
-- e só dos leads da Casa dos Dados. É o mínimo para a régua de recém-aberto (até 90 dias na data
-- da visita). Exige sessão: anon não executa.
--
-- Idempotente; desfazer = drop function public.abertura_dos_leads(uuid[]).

create or replace function public.abertura_dos_leads(p_ids uuid[])
returns table (id uuid, data_abertura date)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, (l.data_abertura at time zone 'UTC')::date
    from public.leads_prospeccao l
   where l.id = any (p_ids)
     and l.fonte ilike '%casa dos dados%'
     and l.data_abertura is not null
     and (select auth.uid()) is not null
   limit 1000;
$$;

revoke all on function public.abertura_dos_leads(uuid[]) from public, anon;
grant execute on function public.abertura_dos_leads(uuid[]) to authenticated;
