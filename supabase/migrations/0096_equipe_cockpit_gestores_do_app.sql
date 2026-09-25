-- 0096 — Os outros gestores do APP entram no Cockpit
--
-- Por quê: em 25/09/2026 /gestao passa a abrir o Cockpit (decisão do Julyan:
-- "tudo uma ferramenta só"). Gestor do APP fora de equipe_cockpit recebe 403 da
-- cockpit-dados, e no 403 a tela faz signOut local — perderia o login do mapa.
-- Victor Brittes e a conta de teste do RPA já viam o time inteiro na gestão
-- antiga; entram com o mesmo nível, como o Arthur e o Guilherme (0095):
-- gestor com so_acesso, fora de listas, contagens e placar.
--
-- Depois disto, todo profiles.role = 'gestor' tem linha ativa em equipe_cockpit.

insert into public.equipe_cockpit (profile_id, papel, ativo, ignorar_owner, so_acesso, nome, nota)
select p.id, 'manager', true, true, true, coalesce(p.full_name, p.email),
       'gestor do APP: acesso ao Cockpit sem fazer parte do time (0096)'
from public.profiles p
where lower(p.email) in ('brittes.takeat@gmail.com', 'teste.gestor@rpa.com')
on conflict (profile_id) do update
  set papel = 'manager', ativo = true, ignorar_owner = true, so_acesso = true, atualizado_em = now();
