-- 0242 · Auditoria do servidor (02/11/26)
--
-- Uma passada no que roda sem tela: o banco, os robôs e as Edge Functions do Field Sales. Cada bloco
-- abaixo diz o defeito que achou, o número medido no banco em 02/11/26 e o que muda. Tudo é idempotente
-- (rodar duas vezes dá o mesmo banco). NÃO APLICADA: entra pelo fluxo de migrations de sempre.
--
--   S1. eventos_do_mapa aceita os 4 eventos que o app já manda e o banco recusava.
--   S2. apply_hubspot_activity só para o service_role; get_all_profiles sai (ninguém chama).
--   S3. generate_client_tasks: NADA a fazer (a 0138 já grava só o que muda; medido: 0 updates por rodada).
--   S4. as duas regras de acesso que o linter ainda acusa reavaliando auth.jwt() a cada linha.
--   S5. a prova da visita: foto sem coordenada deixa de provar sozinha a partir de 03/11/26, GPS só com
--       precisão de até 100 m, e o pino de cada visita fica congelado no momento do Cheguei.
--   S6. geo_source: a conta-alvo do Google vira 'google_place'; 'lead_prospeccao' vira 'leads_prospeccao'.
--   S7. os recém-abertos da Casa dos Dados expiram aos 90 dias de CNPJ, sem visita e sem negócio.
--   S8. (nada aqui) a redistribuição de quem saiu é pelo território, no Cockpit — ver o fim do arquivo.
--   E1. o push das 08:00 da segunda é um só: sai o cron do seg0800 (a missão vai dentro do manha0800).
--   E3. fila_do_dia grava o "sem próximo passo" do Cockpit e de quando é o snapshot que o montou.
--
-- Ordem de publicação: esta migração ANTES das Edges fila-tarefas, push-fila e conta-alvo-nearby (a
-- fila-tarefas grava as colunas novas de fila_do_dia; se for antes, cai no upsert de antes, sem elas).


-- ── S1 · os eventos do mapa que o banco recusava ─────────────────────────────────────────────────
-- src/utils/eventosDoMapa.ts manda 'se_ele_disser_aberto' (espinha do dia §5) e 'plano_proposto',
-- 'plano_confirmado', 'plano_ignorado' (a folha de abertura do dia) desde 29/10/26, e o check só tinha os
-- 5 da 0202: o insert falhava com 23514, o app engolia o erro (medição nunca trava a venda) e o KPI da
-- folha (confirmado × ignorado sobre proposto) nascia vazio. Os 5 de antes continuam.
alter table public.eventos_do_mapa drop constraint if exists eventos_do_mapa_tipo_check;
alter table public.eventos_do_mapa add constraint eventos_do_mapa_tipo_check
  check (tipo in ('primeiro_toque', 'fala_aberta', 'halo_sugerido', 'halo_aceito', 'referencia_tocada',
                  'se_ele_disser_aberto', 'plano_proposto', 'plano_confirmado', 'plano_ignorado'));


-- ── S2 · funções que o app podia chamar e não devia ──────────────────────────────────────────────
-- apply_hubspot_activity(jsonb) é SECURITY DEFINER e grava atividade do HubSpot em clients a partir de um
-- JSON qualquer. Quem chama é só a Edge hubspot-activity-sync, com a service role. O execute estava com
-- authenticated: qualquer sessão do app podia reescrever a última atividade de qualquer lead.
revoke execute on function public.apply_hubspot_activity(jsonb) from public, anon, authenticated;
grant execute on function public.apply_hubspot_activity(jsonb) to service_role;

-- get_all_profiles() é SECURITY DEFINER e devolve e-mail, nome e setor de todo mundo, para qualquer sessão.
-- Procurado em 02/11/26 nos dois repositórios (app e cockpit-unificado, fora das migrations), nas funções,
-- nas views e nos gatilhos do banco: ninguém chama. Sai.
drop function if exists public.get_all_profiles();


-- ── S3 · generate_client_tasks ───────────────────────────────────────────────────────────────────
-- Os 721 mil updates de client_tasks (1.058 linhas) são o contador ACUMULADO do Postgres (pg_stat nunca foi
-- zerado), quase todos de antes da 0138, que já trocou o "updated_at = now() em toda pendente a cada 30 min"
-- por ON CONFLICT ... WHERE (...) IS DISTINCT FROM (...). Medido em 02/11/26 rodando a função numa transação
-- desfeita: 0 updates e 0 inserts em client_tasks. O que ainda grava é legítimo: meta.days_in_stage muda uma
-- vez por dia em cada tarefa pendente. Nenhuma mudança aqui.


-- ── S4 · regras de acesso que reavaliam auth.jwt() a cada linha ──────────────────────────────────
-- O linter (auth_rls_initplan) segue acusando as duas: o (select …) envolvia a expressão inteira
-- (auth.jwt() ->> 'email'), e não a chamada, então o planejador não a transformava em um valor só por
-- consulta. Mesmo significado, a chamada agora isolada em (select auth.jwt()).
alter policy registros_rodada_escrita on public.registros_rodada
  using ((select public.eh_gestor_cockpit()) and lower(gestor_email) = lower((select auth.jwt()) ->> 'email'))
  with check ((select public.eh_gestor_cockpit()) and lower(gestor_email) = lower((select auth.jwt()) ->> 'email'));

alter policy leads_prospeccao_insert on public.leads_prospeccao
  with check (
    ((select public.eh_gestor_cockpit()) or responsavel_owner_id = (select public.meu_owner_hubspot()))
    and (criado_por is null
         or lower(criado_por) = lower((select auth.jwt()) ->> 'email')
         or (select public.eh_gestor_cockpit())));


-- ── S5 · a prova da visita ───────────────────────────────────────────────────────────────────────
-- (c) O PINO CONGELADO. A foto prova a visita pela distância até o pino, e a conta usava o pino de HOJE:
-- pino movido depois (Mover pino, corrigir na porta, geocode novo) mudava a prova de uma visita antiga, para
-- mais ou para menos. A visita passa a guardar o pino do momento do Cheguei. Quem grava é um gatilho BEFORE
-- INSERT em client_visits, e não a mark_client_as_visited, para valer em qualquer caminho de gravação. Na
-- mark_client_as_visited com "corrigir pino" o clients já foi atualizado antes do insert, então o pino
-- congelado é o corrigido — o mesmo contra o qual distance_m foi medido (e o GPS dessa visita não prova:
-- pino_corrigido_de_m segue tirando). As visitas de antes ficam com o pino nulo e seguem medidas contra o
-- pino atual, como sempre foram: nada do passado é reescrito.
alter table public.client_visits add column if not exists pino_lat numeric;
alter table public.client_visits add column if not exists pino_lng numeric;
alter table public.client_visits add column if not exists pino_aproximado boolean;
comment on column public.client_visits.pino_lat is 'Latitude do pino do lead no momento da visita (0242). Nulo nas visitas de antes de 03/11/26.';
comment on column public.client_visits.pino_lng is 'Longitude do pino do lead no momento da visita (0242).';
comment on column public.client_visits.pino_aproximado is 'clients.geo_approximate no momento da visita (0242): decide o raio de 200 ou 500 m.';

create or replace function public.congela_pino_da_visita()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.pino_lat is null and new.pino_lng is null then
    select c.latitude, c.longitude, c.geo_approximate
      into new.pino_lat, new.pino_lng, new.pino_aproximado
      from public.clients c where c.id = new.client_id;
  end if;
  return new;
end;
$function$;
revoke all on function public.congela_pino_da_visita() from public, anon, authenticated;

drop trigger if exists congela_pino_da_visita on public.client_visits;
create trigger congela_pino_da_visita before insert on public.client_visits
  for each row execute function public.congela_pino_da_visita();

-- _visitas_com_prova: a função de produção (pg_get_functiondef em 02/11/26) com QUATRO trocas, o resto igual:
--   1. o pino da conta é o congelado da visita quando existe (pino_lat/pino_lng), senão o atual; o raio
--      (200/500 m) segue o pino_aproximado congelado, senão o geo_approximate atual;
--   2. (a) foto SEM coordenada só prova sozinha até 02/11/26. De 03/11/26 em diante ela não prova: precisa da
--      validação do gestor (visitas_validadas). Medido: 25 visitas provadas assim desde julho, nenhuma desde
--      29/10 — nenhuma delas muda. Foto COM coordenada e pino sem coordenada (não dá para medir) segue como era;
--   3. (b) o GPS só prova com accuracy_m nulo ou até 100 m. Medido: nenhuma visita gravada com precisão pior
--      que 100 m (o máximo é 100,0), então nenhuma visita do passado muda;
--   4. o motivo diz os dois casos novos: 'foto sem coordenada (precisa da validação do gestor)' e
--      'GPS impreciso (± N m), sem foto'. Os textos que o Cockpit compara ('validada pelo gestor') não mudam.
-- Mesma assinatura e mesmo retorno: os 23 chamadores (meu_placar, placar_detalhe, ranking…) não mudam.
create or replace function public._visitas_com_prova(p_de date, p_ate date, p_pessoa uuid default null::uuid)
returns table(visit_id uuid, client_id uuid, visited_by uuid, owner_id text, visited_at timestamp with time zone, dia date, declarada boolean, distancia_m numeric, limite_m integer, pino_movido_m numeric, serie boolean, foto_id uuid, foto_caminho text, provada boolean, motivo text, foto_distancia_m numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  with v as (
    select cv.*,
      (cv.visited_at at time zone 'America/Sao_Paulo')::date as dia_brt,
      lag(cv.client_id)      over w as ant_client,
      lag(cv.visited_at)     over w as ant_em,
      lag(cv.visited_at_lat) over w as ant_lat,
      lag(cv.visited_at_lon) over w as ant_lon
    from public.client_visits cv
    where cv.visited_at >= (p_de::timestamp at time zone 'America/Sao_Paulo') - interval '10 minutes'
      and cv.visited_at <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (p_pessoa is null or cv.visited_by = p_pessoa)
    window w as (partition by cv.visited_by order by cv.visited_at)
  ), vp as (
    -- (0242) o pino da visita: o congelado no Cheguei quando existe, senão o de hoje
    select v.*,
      case when v.pino_lat is not null and v.pino_lng is not null then v.pino_lat else cl.latitude end as p_lat,
      case when v.pino_lat is not null and v.pino_lng is not null then v.pino_lng else cl.longitude end as p_lng,
      case when v.pino_lat is not null and v.pino_lng is not null then v.pino_aproximado else cl.geo_approximate end as p_aprox
    from v
    left join public.clients cl on cl.id = v.client_id
  ), c as (
    select v.*,
      case when v.p_aprox is true then 500 else 200 end as limite,
      (v.ant_client is not null and v.ant_client <> v.client_id
        and v.visited_at - v.ant_em < interval '3 minutes'
        and v.visited_at_lat is not null and v.ant_lat is not null
        and 2 * 6371000 * asin(sqrt(
              power(sin(radians((v.visited_at_lat - v.ant_lat) / 2)), 2) +
              cos(radians(v.ant_lat)) * cos(radians(v.visited_at_lat)) *
              power(sin(radians((v.visited_at_lon - v.ant_lon) / 2)), 2))) < 50) as em_serie,
      f.id as f_id, f.caminho as f_caminho, f.lat as f_lat,
      case when f.lat is not null and f.lng is not null and v.p_lat is not null and v.p_lng is not null
           then 2 * 6371000 * asin(sqrt(
                  power(sin(radians((f.lat - v.p_lat) / 2)), 2) +
                  cos(radians(v.p_lat)) * cos(radians(f.lat)) *
                  power(sin(radians((f.lng - v.p_lng) / 2)), 2)))
      end as foto_dist,
      p.id_hubspot as dono,
      vv.visit_id as vv_id
    from vp v
    left join public.visitas_validadas vv on vv.visit_id = v.id
    left join public.profiles p on p.id = v.visited_by
    left join lateral (
      select fv.id, fv.caminho, fv.lat, fv.lng from public.fotos_visita fv
       where fv.client_id = v.client_id and fv.criado_por = v.visited_by
         and fv.criado_em >= v.visited_at - interval '30 minutes'
         and fv.criado_em <= v.visited_at + interval '2 hours'
       order by abs(extract(epoch from fv.criado_em - v.visited_at)) limit 1
    ) f on true
    where v.dia_brt between p_de and p_ate
  ), j as (
    select c.*,
      (c.f_id is not null and (
         c.dia_brt < date '2026-10-29'
         -- (0242 a) foto sem coordenada só prova sozinha até 02/11; foto com coordenada e pino sem, como era
         or (c.foto_dist is null and (c.dia_brt < date '2026-11-03' or c.f_lat is not null))
         or c.foto_dist <= c.limite)) as foto_vale,
      (not coalesce(c.declarada, false) and c.pino_corrigido_de_m is null and c.distance_m is not null
         and c.distance_m <= c.limite and not c.em_serie
         -- (0242 b) GPS com precisão pior que 100 m não prova
         and (c.accuracy_m is null or c.accuracy_m <= 100)) as gps_vale
    from c
  )
  select j.id, j.client_id, j.visited_by, j.dono, j.visited_at, j.dia_brt,
    coalesce(j.declarada, false), j.distance_m, j.limite, j.pino_corrigido_de_m, j.em_serie,
    j.f_id, j.f_caminho,
    (j.foto_vale or j.vv_id is not null or j.gps_vale) as provada,
    case
      when j.foto_vale and j.foto_dist is not null then 'foto a ' || round(j.foto_dist) || ' m do pino'
      when j.foto_vale then 'foto sem coordenada'
      when j.gps_vale then 'gps'
      when j.vv_id is not null then 'validada pelo gestor'
      when j.f_id is not null and j.foto_dist is null then 'foto sem coordenada (precisa da validação do gestor)'
      when j.f_id is not null and j.foto_dist is not null
        then 'foto a ' || round(j.foto_dist) || ' m do pino (limite ' || j.limite || ' m)'
      when j.em_serie then 'em serie (outro lead no mesmo ponto, < 3 min)'
      when j.pino_corrigido_de_m is not null then 'pino movido na hora (' || round(j.pino_corrigido_de_m) || ' m), sem foto'
      when not coalesce(j.declarada, false) and j.distance_m is not null and j.distance_m <= j.limite
           and j.accuracy_m > 100
        then 'GPS impreciso (± ' || round(j.accuracy_m) || ' m), sem foto'
      when coalesce(j.declarada, false) and j.distance_m is not null
        then 'declarada a ' || round(j.distance_m) || ' m do pino'
             || case when j.accuracy_m is not null then ' (GPS de ' || round(j.accuracy_m) || ' m)' else '' end
      when coalesce(j.declarada, false) then 'declarada sem GPS, sem foto'
      when j.distance_m is not null and j.distance_m > j.limite then 'a ' || round(j.distance_m) || ' m do pino (limite ' || j.limite || ' m), sem foto'
      else 'sem prova'
    end as motivo,
    j.foto_dist
  from j
  order by j.visited_at;
$function$;
-- o mesmo acesso de antes (postgres e service_role; o app chega pelas funções que a embrulham)
revoke all on function public._visitas_com_prova(date, date, uuid) from public, anon, authenticated;
grant execute on function public._visitas_com_prova(date, date, uuid) to service_role;


-- ── S6 · de onde veio o pino (geo_source) ────────────────────────────────────────────────────────
-- Duas grafias para a mesma origem: 'leads_prospeccao' (municao_sincronizar_pino, 3.690 pinos) e
-- 'lead_prospeccao' (negocio-vira-ponto, 79 pinos). A Edge passa a gravar a primeira; aqui as antigas.
-- Nenhuma função do banco compara com nenhuma das duas, então é só a grafia.
update public.clients set geo_source = 'leads_prospeccao' where geo_source = 'lead_prospeccao';

-- A conta-alvo do Google (Edge conta-alvo-nearby) gravava 'coords', que no banco quer dizer "pino apontado
-- ou confirmado por gente": clients_protege_posicao_confirmada não deixa movê-lo, o Cheguei recusa
-- "corrigir pino" nele, e lead_criado_na_hora conta a visita como lead criado na rua (bônus da semana). A
-- Edge passa a gravar 'google_place' (e origem_lead 'google_maps_motor').
-- QUAIS ANTIGAS DÁ PARA TROCAR COM SEGURANÇA: só as que a própria Edge materializou — target_accounts.
-- client_id aponta para o pino (a Edge liga o cache ao pino que criou) — ainda com 'coords', sem lead de
-- prospecção e sem visita nenhuma. Medido: 9 pinos ligados a target_accounts; 8 sem visita e sem lead. As
-- outras 139 contas com place_id do Google e 'coords' nasceram pelo formulário do app (o executivo pode ter
-- ajustado o pino na mão) e ficam como estão. Sem visita, trocar o rótulo não muda prova nem bônus passado.
-- As 8 também levam origem_lead 'google_maps_motor' no lugar do 'cadastro_na_rua' que o gatilho deu.
update public.clients c
   set geo_source = 'google_place',
       origem_lead = case when c.origem_lead = 'cadastro_na_rua' then 'google_maps_motor' else c.origem_lead end
 where c.geo_source = 'coords'
   and c.lead_prospeccao_id is null
   and exists (select 1 from public.target_accounts t where t.client_id = c.id)
   and not exists (select 1 from public.client_visits v where v.client_id = c.id);


-- ── S7 · os recém-abertos expiram aos 90 dias ────────────────────────────────────────────────────
-- A busca da Casa dos Dados traz CNPJ de 0 a 90 dias (decisão de 15/10/26: "têm que estar no mapa porque
-- não têm sistema"), e o app já esconde do mapa o lead com mais de 90 dias de abertura (pinoP2,
-- DIAS_RECEM_ABERTO). No banco nada vencia: o lead seguia 'atribuido' para sempre, contando na carteira e
-- no "para repartir" do Cockpit. Agora uma vez por dia:
--   · lead da Casa dos Dados com data_abertura há mais de 90 dias, 'atribuido' OU 'pendente' (com ou sem
--     dono), sem negócio (hubspot_deal_id do lead e id_hubspot do pino vazios) e sem visita no pino
--     → status 'expirado', com expirado_em e o status de antes guardados (nada é apagado; o dono fica);
--   · o pino dele (clients.lead_prospeccao_id) sai do mapa: is_archived = true (o filtro do mapa do app,
--     inclusive na carga incremental, que trata arquivado como removido) e a etiqueta 'expirado_90d'.
--   'na_rota' fica de fora: está no plano de um dia e quem decide é a pessoa.
-- MEDIDO em 02/11/26 (com a regra acima): 528 'atribuido' + 1.791 'pendente' = 2.319 leads expirariam na
-- 1ª rodada, e 1.734 pinos sairiam do mapa (528 + 1.206). Fora: 26 'na_rota' que também passaram dos 90.
-- A Casa dos Dados entrega o CNPJ, em mediana, 69 a 116 dias depois da abertura (por status): boa parte já
-- chegou "vencida" e o app já não a mostrava.
alter table public.leads_prospeccao add column if not exists expirado_em timestamptz;
alter table public.leads_prospeccao add column if not exists status_antes_de_expirar text;

create or replace function public.expirar_recem_abertos(p_seco boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids uuid[];
  v_por_status jsonb;
  v_leads integer := 0;
  v_pinos integer := 0;
begin
  select coalesce(array_agg(lp.id), '{}')
    into v_ids
    from public.leads_prospeccao lp
   where lp.status in ('atribuido', 'pendente')
     and lp.fonte ilike '%casa dos dados%'
     and lp.data_abertura is not null
     and lp.data_abertura < now() - interval '90 days'
     and nullif(trim(coalesce(lp.hubspot_deal_id, '')), '') is null
     and not exists (
       select 1 from public.clients c
        where c.lead_prospeccao_id = lp.id
          and (nullif(trim(coalesce(c.id_hubspot, '')), '') is not null
               or exists (select 1 from public.client_visits v where v.client_id = c.id)));

  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_por_status
    from (select status, count(*) n from public.leads_prospeccao where id = any(v_ids) group by status) s;

  if p_seco then
    select count(*) into v_pinos from public.clients c
     where c.lead_prospeccao_id = any(v_ids) and not coalesce(c.is_archived, false);
    return jsonb_build_object('seco', true, 'leads', coalesce(array_length(v_ids, 1), 0), 'por_status', v_por_status, 'pinos', v_pinos);
  end if;

  update public.leads_prospeccao
     set status_antes_de_expirar = status, status = 'expirado', expirado_em = now(), updated_at = now()
   where id = any(v_ids);
  get diagnostics v_leads = row_count;

  update public.clients c
     set is_archived = true,
         tags = case when 'expirado_90d' = any(coalesce(c.tags, '{}')) then c.tags else array_append(coalesce(c.tags, '{}'), 'expirado_90d') end,
         updated_at = now()
   where c.lead_prospeccao_id = any(v_ids)
     and not coalesce(c.is_archived, false)
     and nullif(trim(coalesce(c.id_hubspot, '')), '') is null
     -- o update de status acima dispara municao_sincronizar_pino, que pode LIGAR ao lead um pino que ainda
     -- não estava ligado (mesmo place_id); esse pino não passou pela conferência de visita lá de cima
     -- (medido na transação de teste: 1 pino assim), então a visita é conferida de novo aqui
     and not exists (select 1 from public.client_visits v where v.client_id = c.id);
  get diagnostics v_pinos = row_count;

  return jsonb_build_object('seco', false, 'leads', v_leads, 'por_status', v_por_status, 'pinos', v_pinos, 'em', now());
end;
$function$;
revoke all on function public.expirar_recem_abertos(boolean) from public, anon, authenticated;
grant execute on function public.expirar_recem_abertos(boolean) to service_role;

-- todo dia às 06:40 de Brasília (09:40 UTC), antes da folha da manhã e do push das 08:00
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'expirar-recem-abertos-diario';
  perform cron.schedule('expirar-recem-abertos-diario', '40 9 * * *', $c$select public.expirar_recem_abertos(false)$c$);
end $$;


-- ── E1 · a segunda das 08:00 é um push só ────────────────────────────────────────────────────────
-- O seg0800 (cron 24, 0240) e o manha0800 (cron 26, 0241) disparavam no mesmo minuto (11:00 UTC de
-- segunda): dois avisos juntos no celular. A missão da semana agora vai dentro do push da manhã de segunda
-- (push-fila, rodarDia), e o seg0800 fora do ensaio não manda nada. O cron dele sai.
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'push-desenvolvimento-seg';
end $$;


-- ── E3 · o "sem próximo passo" gravado com a regra do Cockpit ────────────────────────────────────
-- fila_do_dia.sem_passo é a SEÇÃO "sem passo" da fila (o que nunca teve passo). O número que o Cockpit, a
-- folha da manhã e o push das 8h mostram é outro: a seção + os vencidos sem passo futuro, Ag. Pagamento
-- (1395880473) fora — semProximoPassoDaFila (_compartilhado/hojeV3.ts). Quem lia a tabela comparava
-- números diferentes com o mesmo nome. A Edge fila-tarefas (a única que grava fila_do_dia; o push-fila só
-- lê) passa a gravar o da regra e o atualizado_em do snapshot do Cockpit que montou a fila.
alter table public.fila_do_dia add column if not exists sem_proximo_passo integer;
alter table public.fila_do_dia add column if not exists snapshot_em timestamptz;
comment on column public.fila_do_dia.sem_proximo_passo is 'Sem próximo passo pela regra do Cockpit (seção sem_passo + vencidos sem passo futuro, Ag. Pagamento fora), gravado pela fila-tarefas (0242).';
comment on column public.fila_do_dia.snapshot_em is 'atualizado_em do cockpit_snapshot usado para montar a fila (0242).';


-- ── S8 · quem sai do time (nada é feito aqui) ────────────────────────────────────────────────────
-- Ao desativar alguém em equipe_cockpit, os leads 'atribuido' dele em leads_prospeccao e os pinos ficavam
-- no nome de quem saiu (413 medidos em 02/11/26). A tela Acessos do Cockpit já repassa leads_prospeccao e
-- clients, mas tudo para UMA pessoa escolhida na mão. A regra decidida é o TERRITÓRIO (a mesma
-- rotearTerritorio dos leads novos), e o território vive em lib/territorios.js do cockpit-unificado, não
-- no banco: a redistribuição é a ação 'redistribuir_de_quem_saiu' de api/importar-leads.js, rodada pelo
-- script scripts/redistribuir-leads-de-quem-saiu.js (--seco / --aplicar) e por um robô diário. O pino segue
-- o lead sozinho (municao_lead_mudou → municao_sincronizar_pino troca clients.vendedor_id_hubspot).
