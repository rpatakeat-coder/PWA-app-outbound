-- 0093 — O nome da pessoa no Cockpit
--
-- Por quê: o recorte por papel do Cockpit entrega ao executivo só a rota e as
-- praças dele, e decide isso PELO NOME (territorios.json: x.rep === nome;
-- leads-referencia.json: responsaveis.includes(nome)). Os nomes do Cockpit e
-- de profiles.full_name divergem — "Sérgio Caetano" x "Sérgio", "Julyan
-- Ribeiro" x "Julyan", "Wericles Andrade" x "Whell Andrade". Com o nome do
-- APP, o Sérgio abriria o Cockpit sem a rota dele, em silêncio.
--
-- Achado ao reler filtrarParaPapel antes do deploy: o teste de equivalência
-- usava os nomes do usuarios.json dos dois lados e por isso não via.
--
-- nome é a chave que o Cockpit usa nos arquivos de território; quando nulo, a
-- função cai em profiles.full_name.

alter table public.equipe_cockpit add column if not exists nome text;

update public.equipe_cockpit e
set nome = s.nome, atualizado_em = now()
from (values
  ('outbound@takeat.app', 'Julyan Ribeiro'),
  ('luizpaulo@takeat.app', 'Luiz Paulo'),
  ('bruno.takeat@gmail.com', 'Bruno Martins'),
  ('sandro.takeat@gmail.com', 'Sandro Brito'),
  ('kelly.takeat@gmail.com', 'Kelly Travieso Di Domenico'),
  ('marco.takeat@gmail.com', 'Marco Filho'),
  ('scaetano.takeat@gmail.com', 'Sérgio Caetano'),
  ('renatapessoa.takeat@gmail.com', 'Renata Pessoa'),
  ('andregomes.takeat@gmail.com', 'André Gomes'),
  ('luizpimentel.takeat@gmail.com', 'Luiz Pimentel'),
  ('wandrade.takeat@gmail.com', 'Wericles Andrade')
) as s(email, nome)
join public.profiles p on lower(p.email) = s.email
where e.profile_id = p.id and e.nome is null;
