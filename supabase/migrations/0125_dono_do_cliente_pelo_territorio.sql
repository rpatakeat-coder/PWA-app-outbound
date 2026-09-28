-- 0125 · Dono da visita ao cliente pelo território (decisão do Julyan, 27/09)
--
-- A regra de território do Cockpit (lib/territorios.js) já distribuiu os 3.319 leads de
-- prospecção por bairro e cidade. Em vez de portar a regra, o cliente herda a decisão já
-- tomada: o executivo com mais leads de prospecção no MESMO bairro; sem bairro coincidente,
-- o com mais leads na MESMA cidade. Só executivo ativo do time (equipe_cockpit, não
-- so_acesso). Cidade sem nenhum lead do time = sem executivo de campo ali (null).
--
-- Medido antes (27/09): dos 876 clientes em queda, 159 casam pelo bairro, 46 pela cidade e
-- 671 estão onde o time de campo não atua — esses ficam para o CS, sem dono de visita.

create or replace function public.lugar_normalizado(p text)
returns text language sql immutable as $$
  select nullif(translate(lower(trim(p)), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '')
$$;

create index if not exists leads_prospeccao_lugar
  on public.leads_prospeccao (public.lugar_normalizado(cidade), public.lugar_normalizado(bairro))
  where responsavel_owner_id is not null;

create or replace function public.dono_do_territorio(p_cidade text, p_bairro text)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  with time as (
    select p.id_hubspot from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
     where e.ativo and not coalesce(e.so_acesso, false) and p.id_hubspot is not null
  ), l as (
    select l.responsavel_owner_id o, public.lugar_normalizado(l.bairro) b
      from public.leads_prospeccao l
     where l.responsavel_owner_id in (select id_hubspot from time)
       and public.lugar_normalizado(l.cidade) = public.lugar_normalizado(p_cidade)
  )
  select coalesce(
    (select o from l where b = public.lugar_normalizado(p_bairro) group by o order by count(*) desc, o limit 1),
    (select o from l group by o order by count(*) desc, o limit 1))
$$;

create or replace function public.cliente_ganha_dono()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Recalcula em toda gravação: redistribuir território (Whell → Sérgio, 25/09) muda o dono
  -- no dia seguinte, sem ninguém lembrar de mexer aqui.
  new.executivo_owner_id := public.dono_do_territorio(new.cidade, new.bairro);
  return new;
end;
$$;

drop trigger if exists cliente_ganha_dono on public.clientes_takeat;
create trigger cliente_ganha_dono
  before insert or update on public.clientes_takeat
  for each row execute function public.cliente_ganha_dono();
