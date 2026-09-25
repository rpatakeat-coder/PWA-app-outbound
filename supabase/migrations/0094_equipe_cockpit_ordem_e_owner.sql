-- 0094 — Ordem da equipe e o dono do HubSpot que o Cockpit não usa
--
-- Por quê: o teste de equivalência da cockpit-dados, rodado com a equipe
-- montada do banco exatamente como a função monta, mostrou duas diferenças
-- contra o Cockpit:
--   1. ORDEM: o Cockpit percorre a equipe na ordem do usuarios.json (gestores
--      primeiro, depois os executivos numa ordem fixa); o banco devolve em
--      ordem arbitrária.
--   2. LUIZ PAULO: no Cockpit ele é gestor SEM ownerId, então as vendas dele
--      não entram no placar do time. No APP ele tem id_hubspot 83893603 — com
--      ele, montar-dados o trataria como "gestor que vende" e o número do time
--      mudaria sem ninguém ter pedido.
--
-- ordem reproduz a do usuarios.json. ignorar_owner diz, explicitamente e por
-- pessoa, "no Cockpit esta pessoa não tem dono no HubSpot"; o dono continua
-- vindo de profiles.id_hubspot para todos os outros. Se o Luiz Paulo vende e
-- as vendas dele devem contar, basta desligar a marca.

alter table public.equipe_cockpit add column if not exists ordem integer;
alter table public.equipe_cockpit add column if not exists ignorar_owner boolean not null default false;

update public.equipe_cockpit e
set ordem = s.ordem, ignorar_owner = s.ignorar, atualizado_em = now()
from (values
  ('outbound@takeat.app', 1, false),
  ('luizpaulo@takeat.app', 2, true),
  ('bruno.takeat@gmail.com', 3, false),
  ('sandro.takeat@gmail.com', 4, false),
  ('kelly.takeat@gmail.com', 5, false),
  ('wandrade.takeat@gmail.com', 6, false),
  ('marco.takeat@gmail.com', 7, false),
  ('scaetano.takeat@gmail.com', 8, false),
  ('renatapessoa.takeat@gmail.com', 9, false),
  ('andregomes.takeat@gmail.com', 10, false),
  ('luizpimentel.takeat@gmail.com', 11, false)
) as s(email, ordem, ignorar)
join public.profiles p on lower(p.email) = s.email
where e.profile_id = p.id;
