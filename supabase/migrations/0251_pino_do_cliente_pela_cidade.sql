-- 0251 (05/11/26) · O PINO DO CLIENTE TAKEAT ACHA O DO EXECUTIVO PELA CIDADE, NÃO SÓ PELA DISTÂNCIA
--
-- Vídeo do Marco (05/11): dentro do Escritório Bar & Botequim, o app dizia "você está a 9,2 km do
-- pino". O restaurante tinha DOIS pinos: o do negócio dele (check-in, certo) e o "cliente" que a
-- clientes-sync cria quando o negócio vira cliente — pelo endereço no Google, que caiu a 9 km.
-- A clientes-sync só reconhecia o pino existente a até 1 km (pino_existente_do_cliente, 0187).
-- Medido: 41 restaurantes assim; 34 juntados aqui.
--
-- 1. pino_do_executivo_na_cidade(nome, cidade): o pino com dono, mesmo nome e mesma cidade, cuja
--    posição foi marcada pelo executivo (check-in, mapa, endereço digitado, coordenada). Pino que veio
--    da prospecção (Casa dos Dados) NÃO conta aqui: o mesmo nome longe pode ser outra unidade da rede;
--    perto, a regra de 1 km da 0187 já liga. A clientes-sync chama esta antes de geocodificar.
-- 2. Junta os 34 pares (mesmo procedimento da 0189: pinos_juntados guarda removido → mantido e o
--    status de antes, para desfazer; a 0190 faz a rodada da madrugada respeitar a junção).
--    Ficaram de fora, para conferir à mão: Capitão Jack, Rios Gourmet, TETTO Rooftop, Churrascaria
--    Gaúcho Raiz, Caranguejo do Assis e Mandacaru (pino de prospecção a mais de 1 km: pode ser outra
--    unidade) e Kokai Gran Park (o pino do robô já é o "mantido" de uma junção da 0189).

create or replace function public.pino_do_executivo_na_cidade(p_nome text, p_cidade text)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  with k as (select public.plano_nome_chave(p_nome) as k, public.plano_nome_chave(p_cidade) as ck)
  select c.id
    from public.clients c, k
   where not coalesce(c.is_archived, false)
     and c.vendedor_id_hubspot is not null
     and not ('clientes_sync' = any(coalesce(c.tags, '{}')))
     and c.latitude is not null and c.longitude is not null
     and c.geo_source in ('coords', 'checkin', 'mapa', 'google_place', 'address')
     and k.k is not null and length(k.k) >= 4 and k.ck is not null
     and public.plano_nome_chave(coalesce(nullif(btrim(c.empresa), ''), c.nome)) = k.k
     and public.plano_nome_chave(c.cidade) = k.ck
   order by (c.status = 'ganho_fs') desc, (c.status = 'cliente') desc, coalesce(c.visit_count, 0) desc, c.created_at
   limit 1
$function$;
-- função nova no schema public nasce executável por anon (memória: drop de função renasce para anon)
revoke all on function public.pino_do_executivo_na_cidade(text, text) from public, anon, authenticated;
grant execute on function public.pino_do_executivo_na_cidade(text, text) to service_role;

do $mig$
declare
  par record;
  t text;
  v_lead uuid;
  movidas int;
begin
  for par in select * from (values
('9d9ff1fb-a5e2-4d90-8e90-33e3178df475'::uuid,'0bb75291-cb85-4586-b154-bdc76847c332'::uuid,'Bar da Leia'),
('b8b4927f-db04-4fb8-b52c-ec73ed904035'::uuid,'15d751b4-09a7-4e40-aa21-78ee290c81f5'::uuid,'Boca a Boca Salgados'),
('383e8489-9873-48f1-a37d-dc231ded6ece'::uuid,'441c6f2e-26d6-4f4a-826b-45bd76136e79'::uuid,'BOM PAPO NA BRASA'),
('918e9cfc-0509-4393-97a9-631ce0c1e79e'::uuid,'01e074bf-5843-4eeb-a199-4e38463f3d5f'::uuid,'CABANA DA ORLA'),
('027fc86c-e070-4bba-a9ef-45d5fcaecbd3'::uuid,'d820bcfb-26e4-481a-9aab-2b6312a567c7'::uuid,'Cachorro do Bonfa - Cidade Baixa'),
('57b65421-8da8-4848-824e-0b9a272ee905'::uuid,'f559e8f7-0523-435e-b0c9-0092f2a31aad'::uuid,'Cachorro do Bonfa - Harmonia'),
('563cdeda-2e0c-4cc3-a6fb-18c9f9dd5e48'::uuid,'0d75e73d-8551-4397-b54b-04a7e7b96b74'::uuid,'Cachorro do Bonfa - Redenção'),
('aba1043a-3965-4284-9590-93d101f1d7d1'::uuid,'0b13704e-73a7-4084-b636-3660412f18d7'::uuid,'Cachorro do Bonfa Gravataí'),
('735e4e2e-7218-4b92-a8bf-efb76749db49'::uuid,'4947d056-f175-4a40-82b3-663015f2d1aa'::uuid,'Clericot Café'),
('0751fdf2-c488-4c34-8907-410f713f30fe'::uuid,'aa8541fa-3754-4eb5-8a86-48b7759b9361'::uuid,'Combina'),
('d37b4da0-42a6-46cb-98b4-23d77644830d'::uuid,'6660de92-5838-4b92-8667-07c730e83b75'::uuid,'Confeitaria Vanessa Pinheiro'),
('3e7ba923-2af9-4d6a-85c0-33aeb41dcb76'::uuid,'cd106b70-9cf2-4dc3-83fe-0a8fb925aaec'::uuid,'Confeitaria Vista Alegre'),
('d752cbc9-5c59-48de-ba17-188bd2b9a994'::uuid,'72925d85-14b9-4d1f-910a-2e9008a76aa9'::uuid,'DIVINO REFÚGIO CAFÉ & LIVROS'),
('884495a1-05d1-466c-ab10-601f8e2a170d'::uuid,'18e433b0-197e-4e92-98b5-cabd75351f78'::uuid,'Escritório Bar & Botequim'),
('1862be87-2aa8-41e5-a676-fff63bade6d6'::uuid,'0499fa44-ce2f-4b4f-94a0-e42563a321f6'::uuid,'Estação baião de dois'),
('d05aa2f2-546f-41bf-8401-f63d2f9af355'::uuid,'d0dd2902-3b31-40de-b048-c9b1fa95209d'::uuid,'GODINEZ'),
('9afc06c5-4774-4e28-8ca0-f07bc6213c90'::uuid,'51019e37-8c0c-4fcd-85a8-14379df9a162'::uuid,'IMPERIO NORDESTINO'),
('6c9c8702-cf1b-4b71-856c-f4b447eed9a9'::uuid,'8b032382-a150-4d94-9d0f-8afd6f64037c'::uuid,'Kingbier Fábrica'),
('ce304ca7-1774-4605-b54d-32a45df4bbb8'::uuid,'433a4ac0-c766-47c4-802f-2c7937052743'::uuid,'Mada Restaurante e lanches'),
('8ae3c543-97c9-4043-9e7b-864e5f60b328'::uuid,'f4026514-ab33-474b-aa28-cadab926f697'::uuid,'Maikai poke'),
('a8887447-a239-46df-b5da-14014b3435c0'::uuid,'b64900db-60ce-4500-a363-9ed2311e4685'::uuid,'Marciano'),
('a17cbe9c-e557-447e-975a-b6aae6ec2e4d'::uuid,'fdd99510-6bdb-4fe2-99bb-8711b2956f8d'::uuid,'Mirandas Grill'),
('4b22e289-0dde-4140-82dd-768931dcb229'::uuid,'5ceb99d6-6b6d-4cf2-9cd3-eb58ac3a9ed1'::uuid,'O Quintal Parrilla Bar'),
('fa6ca2c4-fdc7-4e66-bcaa-2ee4b2556116'::uuid,'b6cd6c63-988f-414d-a074-bc420bc828b5'::uuid,'Pensão da Dona Terezinha'),
('42c1dc95-15a1-4055-9d7c-e2a6942b5527'::uuid,'9e3c7011-e608-42c3-83eb-9205edf7d71f'::uuid,'Pitoresco Gastrobar'),
('b2645b2a-56e3-42d5-9921-273199eb0ad1'::uuid,'94407789-7c7c-4d73-b2c4-af214f54b681'::uuid,'Rascal Lounge'),
('caa47cf0-1f02-4ffa-83b0-0e068d1aabfa'::uuid,'15377ddb-6419-4a6d-b740-2e14b0b0cc38'::uuid,'Ritual Gastro Bar'),
('7ccbf617-a995-414b-bd41-2c3548da9b38'::uuid,'98706ec4-caa2-4af3-8707-33c154badd0e'::uuid,'SA Express Vitória'),
('4ffee6ba-304f-4e66-ac97-3035160eb434'::uuid,'68766755-19a4-4943-8949-0d68091bdc39'::uuid,'Salseiro brasa e lenha'),
('fab62f40-5fc1-4352-b3a0-d9bd47c47b50'::uuid,'b634d501-febe-4e48-840f-07a934cbc988'::uuid,'Sushi da Vila Galvão'),
('39c048e6-afda-4267-81ae-f7385fb2aca3'::uuid,'3da7458e-d5a6-48c1-9677-4f1fe7d37974'::uuid,'The Coffee Break'),
('010bc815-0939-450b-87f4-d6bf51f00e72'::uuid,'2f293c92-522c-4f35-b0a7-f9b20c9f72b0'::uuid,'Tominaga Sushi Bar'),
('2c7de8e9-c873-41de-b7df-8f1062d3517b'::uuid,'455b2a8b-db8f-4d05-a7f2-0ac6e16a1393'::uuid,'TSUGI'),
('b326ad26-d7a0-4d2d-b37d-f053e413242d'::uuid,'dc4cb03d-9020-46e1-8e9f-70184d07e137'::uuid,'TWO GUYS')
    ) as x(removido, mantido, nome)
  loop
    -- já juntado ou já arquivado: rodar de novo não faz nada
    if exists (select 1 from public.pinos_juntados where removido = par.removido)
       or not exists (select 1 from public.clients where id = par.removido and not coalesce(is_archived, false)) then
      raise notice '0251: % já resolvido', par.nome; continue;
    end if;
    if not exists (select 1 from public.clients where id = par.mantido and not coalesce(is_archived, false)) then
      raise exception '0251: o pino que fica de % não está ativo; revisar à mão', par.nome;
    end if;

    insert into public.pinos_juntados (removido, mantido, status_mantido_antes, motivo)
    select par.removido, par.mantido, c.status, '0251: clientes-sync pôs o pino de ' || par.nome || ' pelo endereço, longe do pino do executivo'
      from public.clients c where c.id = par.mantido;

    -- sem índice único: vai tudo para o pino que fica
    foreach t in array array['client_visits', 'client_meetings', 'client_notes', 'client_stage_changes',
      'client_status_history', 'contatos_de_campo', 'fichas_de_rua', 'fotos_visita',
      'plano_rota_sincronizado', 'target_accounts'] loop
      execute format('update public.%I set client_id = $1 where client_id = $2', t) using par.mantido, par.removido;
    end loop;
    -- com índice único: a parada da mesma rota e a tarefa pendente do mesmo tipo que já existem no
    -- pino que fica não se duplicam; essas ficam no arquivado (sem apagar nada)
    update public.field_route_stops s set client_id = par.mantido
     where s.client_id = par.removido
       and not exists (select 1 from public.field_route_stops o where o.route_id = s.route_id and o.client_id = par.mantido);
    update public.client_tasks k set client_id = par.mantido
     where k.client_id = par.removido
       and not (k.status = 'pendente' and exists (select 1 from public.client_tasks o
                 where o.client_id = par.mantido and o.task_type = k.task_type and o.status = 'pendente'));
    update public.sinais_ao_vivo set client_id = par.mantido where client_id::text = par.removido::text;
    update public.clientes_takeat set client_id = par.mantido where client_id = par.removido;

    select lead_prospeccao_id into v_lead from public.clients where id = par.removido;
    update public.clients set is_archived = true, lead_prospeccao_id = null where id = par.removido;
    if v_lead is not null then
      update public.clients set lead_prospeccao_id = v_lead where id = par.mantido and lead_prospeccao_id is null;
    end if;
    -- a visita que estava no pino errado passa a contar no certo
    select count(*) into movidas from public.client_visits where client_id = par.mantido;
    update public.clients set visit_count = greatest(coalesce(visit_count, 0), movidas) where id = par.mantido;
  end loop;

  -- o pino do executivo que era lead e é de um cliente ATIVO da Takeat vira cliente (igual à 0189)
  update public.clients c set status = 'cliente'
    from public.pinos_juntados j
   where j.mantido = c.id and j.motivo like '0251:%' and c.status = 'lead'
     and exists (select 1 from public.clientes_takeat t where t.client_id = c.id and t.situacao in ('ativo', 'em_risco'));
end
$mig$;
