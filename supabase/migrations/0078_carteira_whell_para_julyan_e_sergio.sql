-- Transferencia da carteira do Whell Andrade (hs 89842507):
--   * o que esta' em PAGAMENTO  -> Julyan  (hs 339921752)
--   * todo o resto              -> Sergio  (hs 97978276)
--
-- Medido em 24/09/2026, antes de escrever este arquivo:
--
--   carteira do Whell em `clients` .................. 121 linhas
--     todas com status = 'lead'
--     etapas: CASA DOS DADOS 62 | (nulo) 26 | Backlog 15 |
--             Visita 13 | Prospeccao 4 | Perdido 1
--     com etapa = 'Pagamento' ....................... 0
--
-- Ou seja: pelo `etapa` do app, NINGUEM do Whell esta' em Pagamento, e a
-- carteira inteira iria pro Sergio. No HubSpot a historia e' outra: o Whell
-- tem 3 deals em Pagamento (1395880473) —
--
--   65027278640  Kado Sushi Bar Moema   -> NAO existe em `clients`
--   65076622482  Kado Express           -> NAO existe em `clients`
--   65098844685  Kado Sushi Bar         -> existe, e' "Fabiola Gariglia",
--                                          com etapa NULA no app
--
-- Por isso o criterio abaixo e' OU: o rotulo do app quando ele existe, e os
-- ids do CRM quando o app esta' defasado. Efeito medido hoje: 1 linha pro
-- Julyan, 120 pro Sergio. Os outros dois Kado o SQL nao alcanca — eles nao
-- estao no app, e so' mudam de dono no proprio HubSpot.
--
-- ORDEM IMPORTA: o Pagamento sai primeiro. Invertido, o "resto" levaria tudo
-- e nao sobraria nada pro Julyan.
--
-- SO' `status = 'lead'`, que e' o mesmo recorte que a tela "Desativar acesso"
-- do cockpit usa pra transferir carteira (gestao/src/dados/acessos.ts).
--
-- ISTO NAO MUDA O DONO NO HUBSPOT. `clients.vendedor_id_hubspot` e' espelho
-- do `hubspot_owner_id`; o deal continua do Whell no CRM, com as tarefas e o
-- forecast dele. Ver o aviso no fim do arquivo.

do $$
declare
  v_whell   text := '89842507';
  v_julyan  text := '339921752';
  v_sergio  text := '97978276';
  -- Deals do Whell em Pagamento no HubSpot, lidos em 24/09/2026.
  v_pagamento_hs text[] := array['65027278640', '65076622482', '65098844685'];
  v_para_julyan int;
  v_para_sergio int;
begin
  -- 1. Pagamento -> Julyan
  with movidos as (
    update public.clients
       set vendedor_id_hubspot = v_julyan,
           updated_at          = now()
     where vendedor_id_hubspot = v_whell
       and status = 'lead'
       and (etapa = 'Pagamento' or id_hubspot = any(v_pagamento_hs))
    returning id
  )
  select count(*) into v_para_julyan from movidos;

  -- 2. o que sobrou -> Sergio
  with movidos as (
    update public.clients
       set vendedor_id_hubspot = v_sergio,
           updated_at          = now()
     where vendedor_id_hubspot = v_whell
       and status = 'lead'
    returning id
  )
  select count(*) into v_para_sergio from movidos;

  raise notice 'Pagamento -> Julyan: % linha(s)', v_para_julyan;
  raise notice 'resto -> Sergio: % linha(s)', v_para_sergio;
  raise notice 'esperado em 24/09/2026: 1 e 120';
end $$;

-- Idempotente por construcao: o filtro e' `vendedor_id_hubspot = 89842507`.
-- Rodar de novo encontra zero linhas e nao desfaz nada.

-- ===== Conferencia (rode depois) =====
-- select coalesce(vendedor_id_hubspot, '(sem dono)') as dono_hs,
--        count(*) as leads
--   from public.clients
--  where status = 'lead'
--    and vendedor_id_hubspot in ('89842507', '339921752', '97978276')
--  group by 1 order by 2 desc;
