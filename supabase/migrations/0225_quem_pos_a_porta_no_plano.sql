-- 0225 · QUEM PÔS A PORTA NO PLANO (pacote "a espinha do dia", §2.3 e §2.11, 28/10/26).
--
-- O PROBLEMA, MEDIDO EM 28/10. O plano é UM só — o Planejamento do Cockpit (planos_semanais.grade)
-- e a rota do app (field_route_stops) são espelhados nos dois sentidos pelos gatilhos. Mas o que
-- se grava hoje é POR QUAL TELA o item entrou, não por QUAL PESSOA:
--
--     origem  (nulo)        6185 itens   posto à mão no Planejamento do Cockpit
--             app            471         mapa / Agenda do app
--             passo          326         próximo passo datado na ficha
--             app-agenda      44
--             territorio      30
--
-- E o executivo TAMBÉM planeja pelo Cockpit (decisão do Julyan, 06/10/26). Então "feito no
-- Cockpit", sozinho, não distingue o que ele mesmo montou do que o gestor montou por ele —
-- e são as duas frases que a folha de abrir do app precisa escrever ("Plano de hoje · feito no
-- Cockpit" contra "Plano do gestor · montado às HH:MM"), além do selo GESTOR por porta trocada.
-- Escrever a frase errada aqui é pior do que não escrever nenhuma: ele acorda achando que o
-- gestor mexeu no dia dele quando não mexeu.
--
-- O QUE ESTA MIGRATION FAZ, E SÓ ISSO:
--   1. uma coluna nova em field_route_stops, anulável e sem padrão — nada do que existe muda,
--      e toda linha de hoje fica com `null`, que quer dizer "não sei", e não "foi o executivo";
--   2. plano_para_rota passa a levar o `quem` do item da grade para essa coluna.
--
-- O QUE ELA NÃO FAZ. Não mexe em plano_poe_slot (o caminho do APP: ali quem põe é sempre o dono
-- da rota, e trocar a assinatura criaria uma segunda função com o mesmo nome). Não mexe em
-- rota_para_plano, nem em espelhar_parada_no_plano, nem em política nenhuma. Quem carimba o
-- `quem` na grade é o Cockpit, no mesmo lugar em que ele já grava o plano (pl6Gravar).
--
-- SÓ VALE PARA PORTA NOVA, de propósito. plano_para_rota já pula o slot que está em
-- plano_rota_sincronizado, então o `quem` é gravado na hora em que a porta ENTRA no plano — que
-- é exatamente a pergunta do desenho ("o que o gestor mudou"). Porta que já era do executivo não
-- vira do gestor porque ele salvou a semana.

alter table public.field_route_stops add column if not exists posto_por text;

comment on column public.field_route_stops.posto_por is
  'Quem pôs esta porta no plano: executivo | gestor. Nulo = não sabido (toda linha anterior a 28/10/26, e tudo que nasce fora do Planejamento do Cockpit).';

create or replace function public.plano_para_rota(p_owner text, p_segunda date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_seller uuid;
  v_grade jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date;
  v_slots jsonb;
  r record;
  t record;
  v_sid text;
  v_cli uuid;
  v_route uuid;
  v_hora text;
  v_quem text;
  v_quando timestamptz;
  v_ids text[];
  v_clis uuid[];
  v_n integer := 0;
begin
  select p.id into v_seller from public.profiles p where p.id_hubspot = p_owner limit 1;
  if v_seller is null then return 0; end if;
  select grade into v_grade from public.planos_semanais where owner_id = p_owner and data_segunda = p_segunda;

  for d in 0..4 loop
    v_dia := p_segunda + d;
    continue when v_dia < v_hoje;
    v_slots := case when jsonb_typeof(v_grade) = 'array' and jsonb_typeof(v_grade -> d) = 'array' then v_grade -> d else '[]'::jsonb end;
    v_ids := array[]::text[];
    v_clis := array[]::uuid[];

    for r in select e.value as slot, e.ordinality as ord from jsonb_array_elements(v_slots) with ordinality e loop
      v_sid := nullif(case jsonb_typeof(r.slot) when 'object' then r.slot ->> 'id' when 'string' then r.slot #>> '{}' end, '');
      continue when v_sid is null or v_sid like '\_\_%';
      v_ids := v_ids || v_sid;
      v_cli := public.plano_resolver_slot(v_sid, p_owner);
      if v_cli is not null then v_clis := v_clis || v_cli; end if;
      continue when exists (select 1 from public.plano_rota_sincronizado s
                            where s.owner_id = p_owner and s.dia = v_dia and s.slot_id = v_sid);
      continue when v_cli is null;

      insert into public.field_routes (seller_id, route_date, title, status, source, created_by)
      values (v_seller, v_dia, 'Plano do Cockpit', 'planned', 'manual', v_seller)
      on conflict (seller_id, route_date) do nothing;
      select id into v_route from public.field_routes where seller_id = v_seller and route_date = v_dia;

      v_hora := case when jsonb_typeof(r.slot) = 'object' then r.slot ->> 'hora' end;
      /* LISTA FECHADA, SANEADA AQUI E NÃO POR CHECK. O valor nasce num jsonb que o navegador
         escreve; um `check` faria a PONTE INTEIRA estourar por causa de uma palavra estranha
         num item, e com ela o plano do dia pararia de chegar no celular. Valor que eu não
         conheço vira nulo — que já quer dizer "não sei". */
      v_quem := case when jsonb_typeof(r.slot) = 'object' and (r.slot ->> 'quem') in ('executivo', 'gestor')
                     then r.slot ->> 'quem' end;
      v_quando := case when v_hora ~ '^\d{1,2}:\d{2}$'
                       then ((v_dia::text || ' ' || v_hora)::timestamp at time zone 'America/Sao_Paulo') end;

      insert into public.field_route_stops (route_id, client_id, position, planned_at, status, mandatory_reason, posto_por)
      values (v_route, v_cli, r.ord, v_quando, 'planned', 'plano_cockpit', v_quem)
      on conflict (route_id, client_id) do update
        set status = case when field_route_stops.status = 'removed' then 'planned' else field_route_stops.status end,
            planned_at = coalesce(excluded.planned_at, field_route_stops.planned_at),
            /* nunca APAGA o que já se sabia: sem valor novo, fica o que estava */
            posto_por = coalesce(excluded.posto_por, field_route_stops.posto_por),
            updated_at = now();

      insert into public.plano_rota_sincronizado (owner_id, dia, slot_id, client_id, route_id)
      values (p_owner, v_dia, v_sid, v_cli, v_route)
      on conflict (owner_id, dia, slot_id) do nothing;
      v_n := v_n + 1;
    end loop;

    for t in select * from public.plano_rota_sincronizado s
             where s.owner_id = p_owner and s.dia = v_dia and not (s.slot_id = any (v_ids)) loop
      if not (t.client_id = any (v_clis)) then
        update public.field_route_stops
        set status = 'removed', updated_at = now()
        where route_id = t.route_id and client_id = t.client_id and status = 'planned';
      end if;
      delete from public.plano_rota_sincronizado
      where owner_id = t.owner_id and dia = t.dia and slot_id = t.slot_id;
    end loop;
  end loop;
  return v_n;
end;
$function$;
