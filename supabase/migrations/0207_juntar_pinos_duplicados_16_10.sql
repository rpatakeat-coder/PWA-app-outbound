-- 0207 · JUNTAR OS PINOS DUPLICADOS QUE SOBRARAM (auditoria 16/10/2026) — DADO, não esquema
--
-- Mesmo procedimento de 14/10 (pinos_juntados guarda removido → mantido para desfazer):
--   · 6 contas-alvo criadas pela importação de 25/09 em cima de um restaurante que JÁ estava no
--     mapa — 4 já são CLIENTES Takeat (Glória Bistrô, Mr. White, Fogo Forte, Tero Brasa e Vinho) e
--     2 já são negócio no HubSpot (Casa de Massas Pogili, Via Bito). A importação de hoje já não
--     duplica (municao_sincronizar_pino usa pino_existente_do_cliente desde 14/10); estas são de antes.
--     O lead de prospecção passa para o pino que fica (é o que o gatilho faz hoje).
--   · Bola 7 Botequim: o pino do negócio em Reciclagem (65622485542, criado no mesmo dia da venda)
--     ao lado do pino da venda (65631444623).
-- Nenhum dos removidos tem visita, parada de plano, reunião ou ficha (medido em 16/10).
-- O negócio duplicado do HubSpot NÃO é tocado aqui (mesclar é no HubSpot).
-- Idempotente: só age no par ainda ativo; se o pino removido ganhou histórico, para.
do $migr$
declare
  par record;
  v_lead uuid;
begin
  for par in select * from (values
      ('5f09835d-e9b4-4afb-a035-85ce5d8d2a5c'::uuid, '3a82e802-c54b-4c59-9f44-90aebb0fa493'::uuid, 'conta-alvo de 25/09 sobre cliente (Glória Bistrô)'),
      ('6c6fcf63-7c74-4451-a350-d62e74222b0f'::uuid, '0d5ebef5-14e2-4066-9a95-8a6cbc960c7b'::uuid, 'conta-alvo de 25/09 sobre cliente (Mr. White)'),
      ('bb861ac7-c357-4185-83a3-07b65e1a7eb8'::uuid, '631f331e-6193-4f7a-8980-0d445a798466'::uuid, 'conta-alvo de 25/09 sobre cliente (Fogo Forte)'),
      ('f24bf8d3-60b5-49be-a63e-000eb2a0ffad'::uuid, 'f5f14025-ffd4-4474-a6d4-3e3e2b7d5b83'::uuid, 'conta-alvo de 25/09 sobre cliente (Tero Brasa e Vinho)'),
      ('27003dad-71e4-4950-83b8-4a3765671762'::uuid, '7451327c-e302-4475-b69c-5cb2052fce1a'::uuid, 'conta-alvo de 25/09 sobre negócio (Casa de Massas Pogili)'),
      ('a7f99875-c84f-4c23-9636-08f37e882d0b'::uuid, 'd1f702c5-9b80-489b-9f27-b350b17604d6'::uuid, 'conta-alvo de 25/09 sobre negócio (Via Bito)'),
      ('eb5d09eb-c022-47c2-97a3-f5f09f06d99c'::uuid, '835c194f-4da1-4c35-873b-3b2e3adbbd12'::uuid, 'Reciclagem ao lado da venda (Bola 7 Botequim)')
    ) as t(removido, mantido, motivo)
  loop
    if not exists (select 1 from public.clients where id = par.removido and not coalesce(is_archived, false)) then
      raise notice '0207: % já arquivado', par.removido; continue;
    end if;
    if exists (select 1 from public.client_visits where client_id = par.removido)
       or exists (select 1 from public.field_route_stops where client_id = par.removido)
       or exists (select 1 from public.client_meetings where client_id = par.removido)
       or exists (select 1 from public.fichas_de_rua where client_id = par.removido) then
      raise exception '0207: o pino % ganhou histórico depois de 16/10; conferir antes de juntar', par.removido;
    end if;
    select lead_prospeccao_id into v_lead from public.clients where id = par.removido;
    insert into public.pinos_juntados (removido, mantido, status_mantido_antes, juntado_em, motivo)
      select par.removido, par.mantido, c.status, now(), par.motivo from public.clients c where c.id = par.mantido;
    update public.clients set is_archived = true, lead_prospeccao_id = null where id = par.removido;
    if v_lead is not null then
      update public.clients set lead_prospeccao_id = v_lead where id = par.mantido and lead_prospeccao_id is null;
    end if;
  end loop;
end
$migr$;
