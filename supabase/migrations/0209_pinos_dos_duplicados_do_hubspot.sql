-- 0209 · OS PINOS DOS 73 DUPLICADOS DO HUBSPOT (16/10/2026) — DADO, já executado em produção
--
-- O Julyan aprovou ("quero nada duplicado"): em 67 restaurantes com mais de um negócio vivo no funil
-- do Field Sales, ficou o mais avançado (no empate, o mais recente) e 73 foram para Perdido no HubSpot
-- com motivo "Outros" e a observação "Duplicado — fica o negócio X". Ficaram de fora os negócios
-- "Teste" do RPA, os contratos ganhos em dobro (Kokai, Só Santo Butequim, Casa Renata) e Two Guys.
--
-- Este arquivo registra o que foi feito nos pinos do app (clients) depois disso:
--   A) 15 pinos ativos apontavam para o negócio que saiu e o que ficou não tinha pino ATIVO: o pino
--      passa a apontar para o que ficou (mantém o histórico de visitas). Em 4 casos (ACHMR, Magnifico,
--      Duda Lanches, Sushi Delícia) o que ficou tinha um pino ARQUIVADO de 14/10: esse arquivado
--      perde o id_hubspot (continua arquivado, registrado em pinos_juntados).
--   B) 8 pares com pino nos dois: o do negócio que saiu é arquivado e visitas, fotos, fichas,
--      contatos, reuniões e notas passam para o que fica (pinos_juntados registra para desfazer).
--   C) 5 pares restantes de pino perdido ao lado do atual (Boteco do França, Cachambeer, JHCV Jd. da
--      Penha, Parador Z1, Quintal do Stuart): juntados do mesmo jeito.
-- Conferido depois: 0 pares de pinos ativos do mesmo restaurante (nome + até ~400 m).
-- A etapa do pino é reescrita pela sincronização com o HubSpot (por id_hubspot).
-- Idempotente o suficiente para reexecutar: o bloco A exige que o negócio não tenha pino ativo e o
-- bloco B/C só age em pino ainda ativo.

do $m$
declare r record; v_lead uuid;
begin
  -- A
  for r in select * from (values
    ('8792adf2-d4ad-4710-9941-fa7d3d5bf541'::uuid,'60992468526','Backlog','lead'),
    ('00d5bc27-e3b5-49ed-b7f2-99ba2c7cbef2'::uuid,'60012449308','Backlog','lead'),
    ('f4623f99-a584-4ead-9fb9-9e6b5a48e919'::uuid,'59185262650',null,'cliente'),
    ('4c65c9ad-835a-4139-ac68-1e7c8cf4813d'::uuid,'60013763079','Backlog','lead'),
    ('0b4f4a7f-7bfe-4c12-952a-40a16c923575'::uuid,'63319093055','Visita','lead'),
    ('0664a5c8-fcb6-4e9d-86c1-82a9025d3260'::uuid,'63543901369',null,'lead'),
    ('bb1ec1f4-acce-4b26-a977-2906af3610e0'::uuid,'63544565936',null,'lead'),
    ('799e4ac3-ef89-4550-a9eb-1d6ba34e138a'::uuid,'64845496354','Reciclagem','lead'),
    ('875cc70b-2195-4c5e-83c2-c675e47252c9'::uuid,'64854548784','Reciclagem','lead'),
    ('86463cdf-9c98-4b10-924b-a794d62a40a2'::uuid,'65118187008','Conversa com decisor','lead'),
    ('d3bcee73-6256-4cad-900b-18396f465198'::uuid,'65093349932','Reciclagem','lead'),
    ('94407789-7c7c-4d73-b2c4-af214f54b681'::uuid,'65898194083',null,'cliente'),
    ('cdf72f21-b393-408d-a156-20b6406a09fd'::uuid,'63839438766',null,'cliente'),
    ('dea4bea7-272b-4e1d-819a-ae08fa7fd105'::uuid,'63546256489',null,'lead'),
    ('9ec365bb-56e1-49ee-b970-1b39f32e2da8'::uuid,'64846930243','Conversa com decisor','lead')
  ) t(pino, deal, etapa, status) loop
    if exists (select 1 from clients where id_hubspot = r.deal and not coalesce(is_archived,false)) then continue; end if;
    update clients set id_hubspot = null where id_hubspot = r.deal and coalesce(is_archived,false);
    update clients set id_hubspot = r.deal, etapa = r.etapa, status = r.status where id = r.pino;
  end loop;
  -- B e C
  for r in select * from (values
    ('a73355f8-da1c-4ce5-8399-3d31a39f9bd5'::uuid,'86463cdf-9c98-4b10-924b-a794d62a40a2'::uuid,'duplicado no HubSpot (16/10/26): Sushi Delícia'),
    ('38729e1d-45cc-424d-b74f-6a2c7fbb3b3c'::uuid,'6b64d969-cd5a-4a9a-85e8-d4ead7329369'::uuid,'duplicado no HubSpot (16/10/26): Point do Gordão'),
    ('aa2adba7-512c-44b3-bf25-877f34023ece'::uuid,'51019e37-8c0c-4fcd-85a8-14379df9a162'::uuid,'duplicado no HubSpot (16/10/26): Império Nordestino'),
    ('eb5d09eb-c022-47c2-97a3-f5f09f06d99c'::uuid,'835c194f-4da1-4c35-873b-3b2e3adbbd12'::uuid,'duplicado no HubSpot (16/10/26): Bola 7 Botequim'),
    ('d88ebabe-42e0-4765-9de3-4952e9db479d'::uuid,'b5973f62-32db-454a-a026-292435ac0324'::uuid,'duplicado no HubSpot (16/10/26): Divino Café'),
    ('324a91b9-5d04-45ef-9792-f52a986397df'::uuid,'59dbad01-6ca7-4a91-9786-2eee8d27f51e'::uuid,'duplicado no HubSpot (16/10/26): Rústico Arte Ferro e Fogo'),
    ('92a7e477-a372-4edf-a368-55969f2276f7'::uuid,'873ec223-f461-471d-9ced-875301ca6eac'::uuid,'duplicado no HubSpot (16/10/26): Padaria Maria Cereja'),
    ('270623b8-7cba-4279-8b88-7f3eda1adbe7'::uuid,'2adfb77e-bf5a-470b-bce0-23cce2b5ea90'::uuid,'duplicado no HubSpot (16/10/26): Porto do Sabor'),
    ('7c7b1bac-f1fc-42a8-8d95-bfac85d1ae93'::uuid,'d6028ba7-16b4-4166-bebc-2947229ffda8'::uuid,'duplicado (16/10/26): Boteco do França (os dois perdidos)'),
    ('4278730f-7abe-4b7d-875c-d8eea7c948e2'::uuid,'472b6286-882a-4f7a-b01e-207619bee4dd'::uuid,'duplicado (16/10/26): Cachambeer (perdido ao lado do aberto)'),
    ('f2df9671-3cfa-491b-9ce6-d08ba7a9f1f2'::uuid,'88bdfc2c-b0e1-47ec-8b66-8687e4412abc'::uuid,'duplicado (16/10/26): JHCV Jd. da Penha (conta-alvo sobre o negócio)'),
    ('8c88f8c5-9258-4828-95c6-9b22d10a2680'::uuid,'a8c6d093-3e30-4994-96f5-ed7edb2bbb60'::uuid,'duplicado (16/10/26): Parador Z1 (perdido ao lado do cliente)'),
    ('8a9b748e-e68b-4559-a1c5-ac4b525a4352'::uuid,'7bc44988-7bb2-4325-ba9d-62b3b49858c6'::uuid,'duplicado (16/10/26): Quintal do Stuart (perdido ao lado do aberto)')
  ) t(removido, mantido, motivo) loop
    if not exists (select 1 from clients where id = r.removido and not coalesce(is_archived,false)) then continue; end if;
    insert into pinos_juntados (removido, mantido, status_mantido_antes, juntado_em, motivo)
      select r.removido, r.mantido, c.status, now(), r.motivo from clients c where c.id = r.mantido;
    select lead_prospeccao_id into v_lead from clients where id = r.removido;
    update client_visits set client_id = r.mantido where client_id = r.removido;
    update fotos_visita set client_id = r.mantido where client_id = r.removido;
    update fichas_de_rua set client_id = r.mantido where client_id = r.removido;
    update contatos_de_campo set client_id = r.mantido where client_id = r.removido;
    update client_meetings set client_id = r.mantido where client_id = r.removido;
    update client_notes set client_id = r.mantido where client_id = r.removido;
    update clients set is_archived = true, lead_prospeccao_id = null where id = r.removido;
    if v_lead is not null then update clients set lead_prospeccao_id = v_lead where id = r.mantido and lead_prospeccao_id is null; end if;
  end loop;
end $m$;
