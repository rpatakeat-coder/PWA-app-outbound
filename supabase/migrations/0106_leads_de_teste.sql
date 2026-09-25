-- 0106 — Lead de teste fora do mapa da rua (prompt final, correção C5)
--
-- Na captura de produção (25/09, 16:33) "Teste teste", "Café RPA", "Teste rpa
-- guilh…", "RPA demo" e "Tpa teste" estavam empilhados na posição do usuário.
--
-- is_teste é calculado por regra e pode ser forçado à mão (is_teste_manual,
-- para o Cockpit marcar/desmarcar). A regra olha o NOME DO LUGAR (empresa), não
-- o do contato: "Torii mix" e "FERRO XIS BRASA" têm "Teste" só no contato e são
-- estabelecimentos reais — não podem sumir. Também marca o que as contas de QA
-- criaram (teste@rpa.com, teste.gestor@rpa.com) e o prefixo "TESTE " do QA.
--
-- O app esconde is_teste de todo mundo; só admin vê, em Filtros → "Mostrar testes".

alter table public.clients
  add column if not exists is_teste boolean not null default false,
  add column if not exists is_teste_manual boolean;
comment on column public.clients.is_teste is 'Lead de teste (0106): fora do mapa, listas e contagens do app. Regra + is_teste_manual.';
comment on column public.clients.is_teste_manual is 'Força is_teste (true/false). Nulo = vale a regra.';

create or replace function public.lead_parece_teste(p_empresa text, p_nome text, p_criador uuid)
returns boolean language sql stable
set search_path = public, pg_temp as $$
  select
    public.texto_normalizado(coalesce(nullif(trim(p_empresa), ''), p_nome)) ~ '(^|[^a-z])(teste|testes|rpa|rpa demo|tpa teste|zz teste)([^a-z]|$)'
    or public.texto_normalizado(p_nome) ~ '^(zz )?teste '
    and public.texto_normalizado(p_nome) ~ '(tarefas|ciclo|follow)'
    or exists (select 1 from public.profiles p where p.id = p_criador and p.email in ('teste@rpa.com', 'teste.gestor@rpa.com'))
$$;

create or replace function public.clients_marca_teste()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  new.is_teste := coalesce(new.is_teste_manual, public.lead_parece_teste(new.empresa, new.nome, new.created_by));
  return new;
end $$;

drop trigger if exists clients_marca_teste on public.clients;
create trigger clients_marca_teste before insert or update of nome, empresa, is_teste_manual, created_by
  on public.clients for each row execute function public.clients_marca_teste();

alter table public.clients disable trigger update_clients_updated_at;
alter table public.clients disable trigger clients_set_updated_by;
update public.clients c set is_teste = true
 where not c.is_teste and public.lead_parece_teste(c.empresa, c.nome, c.created_by);
alter table public.clients enable trigger update_clients_updated_at;
alter table public.clients enable trigger clients_set_updated_by;
