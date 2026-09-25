-- 0095 — Gestor que entra no Cockpit sem fazer parte do time
--
-- Por quê: Arthur e Guilherme (gestores do RPA) já são gestores na RLS
-- (is_field_admin), mas não estavam em equipe_cockpit, e a cockpit-dados
-- responde 403 a quem não está lá — e no 403 a tela do Cockpit faz
-- signOut local, o que no APP derruba também o login do mapa.
--
-- Decisão do Julyan (25/09/2026): os dois continuam com acesso; vendas contam
-- só do time e dele. Colocá-los como gestores comuns mudaria a tela:
--   - os dois têm id_hubspot: virariam "gestor que vende" e as vendas deles
--     entrariam no placar do time;
--   - DATA.usuarios é o denominador do "visto por X/N" dos comunicados: um
--     aviso lido pelo time inteiro passaria a mostrar 10/12.
--
-- so_acesso = entra como gestor (vê tudo o que o gestor vê), mas fica FORA da
-- equipe que a montagem usa: nenhuma lista, contagem ou placar muda. A
-- cockpit-dados dá ownerId nulo a quem tem a marca.

alter table public.equipe_cockpit add column if not exists so_acesso boolean not null default false;

insert into public.equipe_cockpit (profile_id, papel, ativo, ignorar_owner, so_acesso, nome, nota)
select p.id, 'manager', true, true, true, p.full_name,
       'gestor RPA: acesso ao Cockpit sem fazer parte do time (0095)'
from public.profiles p
where lower(p.email) in ('arthurgothe.takeat@gmail.com', 'guilherme.borborema.takeat@gmail.com')
on conflict (profile_id) do update
  set papel = 'manager', ativo = true, ignorar_owner = true, so_acesso = true, atualizado_em = now();
