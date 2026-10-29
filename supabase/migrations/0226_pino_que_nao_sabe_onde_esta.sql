-- 0226 · O PINO QUE NÃO SABE ONDE ESTÁ (Julyan, 28/10/26: "revise esse bug no mapa").
--
-- O QUE ELE VIU. Um cartão "Quadra · JACAREPAGUA · 27 pinos" desenhado em cima do Estácio,
-- com todos os leads da lista a "2,3 km". Não era erro de rótulo: são 27 pinos na MESMA
-- coordenada — o centro do Rio (−22,9129, −43,2003) — com bairros que vão de Anil a Vargem
-- Pequena. A distância é igual porque o ponto é o mesmo.
--
-- O QUE EU MEDI NA BASE INTEIRA, em 28/10:
--
--     1.026 leads (9,3% de tudo que tem pino) empilhados em 104 coordenadas
--       777 deles em 69 coordenadas que são CENTRÓIDE DE CIDADE
--           (75 no centro de SP, 61 em Brasília, 50 no Rio, 25 no centro do BRASIL)
--       187 desses afirmavam ser coordenada EXATA
--       252 clientes Takeat entre os afetados
--
-- A RAIZ TEM NOME, E É UM PADRÃO DE COLUNA. `clients.geo_approximate` tinha
-- `default false`. Quem insere coordenada sem tocar no campo ganha "é exata" de graça —
-- e `municao_sincronizar_pino` (a ponte que transforma munição em pino) lista `geo_source`
-- no INSERT e nunca listou `geo_approximate`. Padrão que AFIRMA o que ninguém mediu é pior
-- que campo vazio: nulo quer dizer "não sei", `false` quer dizer "pode bater na porta".
--
-- A REGRA DE PRECISÃO SAIU DA MEDIÇÃO, não de palpite:
--
--     com place_id do Google  →  1.204 leads,   0 em centróide
--     sem place_id            →  2.334 leads, 179 em centróide
--
-- Place id é um estabelecimento que o Google conhece, com ponto próprio. Sem ele, a
-- coordenada veio de geocodificar um endereço — e quando o geocodificador não entende o
-- endereço, ele responde com o centro da cidade (ou do país) em vez de dizer que não sabe.
--
-- O QUE ESTA MIGRATION NÃO FAZ. Não move pino nenhum: coordenada errada continua onde está,
-- porque inventar lugar é exatamente o defeito. Ela só para de AFIRMAR que o lugar é exato.
-- Quem desenha é que decide o que fazer com "não sei" — ver resumoDaQuadra no app.
--
-- APLICADA EM 28/10/26 em três partes separadas, nesta ordem, com os nomes
-- `geo_approximate_sem_padrao`, `municao_pino_sabe_se_e_aproximado` e
-- `marcar_centroides_como_aproximados`. Este arquivo é as três juntas, que é como elas se
-- leem. Conferido depois de aplicar: 0 linhas ainda afirmando precisão num centróide (eram
-- 187), 777 honestas, padrão nulo, e 11.088 pinos antes e depois — nenhum pino moveu.

-- ── 1. o padrão para de mentir ────────────────────────────────────────────────────────────
alter table public.clients alter column geo_approximate drop default;

comment on column public.clients.geo_approximate is
  'true = o ponto e aproximado (centroide de rua, bairro ou cidade). false = ponto exato, medido. NULO = nao sei — e o padrao desde 28/10/26, porque o padrao antigo (false) afirmava precisao que ninguem tinha conferido.';

-- ── 2. a torneira: a munição vira pino sabendo o que sabe ────────────────────────────────
create or replace function public.municao_sincronizar_pino(p_lead uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  l public.leads_prospeccao;
  v_pin uuid;
  v_dono uuid;
begin
  select * into l from public.leads_prospeccao where id = p_lead;
  if not found then return null; end if;

  select id into v_pin from public.clients where lead_prospeccao_id = l.id;
  if v_pin is null and l.hubspot_deal_id is not null then
    select id into v_pin from public.clients
    where id_hubspot = l.hubspot_deal_id and lead_prospeccao_id is null;
  end if;
  if v_pin is null and nullif(l.place_id, '') is not null then
    select id into v_pin from public.clients
    where conta_alvo_place_id = l.place_id and lead_prospeccao_id is null;
  end if;
  if v_pin is null and l.lat is not null and l.lng is not null and nullif(trim(l.nome), '') is not null then
    select id into v_pin from public.clients
    where lead_prospeccao_id is null and not is_archived
      and lower(trim(nome)) = lower(trim(l.nome))
      and round(latitude, 4) = round(l.lat::numeric, 4)
      and round(longitude, 4) = round(l.lng::numeric, 4)
    limit 1;
  end if;
  -- 14/10/26: o pino que já existe pelo nome do RESTAURANTE (regra da 0187); antes só casava o
  -- nome do contato com a coordenada até ~11 m e a importação duplicava 48 pinos.
  if v_pin is null and l.lat is not null and l.lng is not null and nullif(trim(l.nome), '') is not null then
    v_pin := public.pino_existente_do_cliente(l.nome, l.lat::numeric, l.lng::numeric);
    if v_pin is not null and exists (select 1 from public.clients c
         where c.id = v_pin and c.lead_prospeccao_id is not null and c.lead_prospeccao_id <> l.id) then
      return null;  -- o restaurante já tem pino ligado a outro lead: não cria outro
    end if;
  end if;

  if v_pin is null then
    if not public.municao_quer_pino(l.status) or l.responsavel_owner_id is null
       or l.lat is null or l.lng is null or nullif(trim(l.nome), '') is null
       or (l.hubspot_deal_id is not null
           and exists (select 1 from public.clients c where c.id_hubspot = l.hubspot_deal_id)) then
      return null;
    end if;
    select p.id into v_dono
    from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
    where e.ativo and not e.so_acesso and p.id_hubspot = l.responsavel_owner_id
    limit 1;
    if v_dono is null then return null; end if;
    insert into public.clients (
      nome, empresa, endereco, bairro, cidade, estado, telefone,
      latitude, longitude, status, origem, tags, vendedor_id_hubspot,
      conta_alvo_place_id, conta_alvo_rating, conta_alvo_reviews,
      geo_source, geo_approximate, lead_prospeccao_id, created_by, id_hubspot)
    values (
      trim(l.nome), trim(l.nome), l.endereco, l.bairro, l.cidade, l.estado, l.telefone,
      l.lat, l.lng, 'lead', 'import', array['municao_cockpit'], l.responsavel_owner_id,
      coalesce(nullif(l.place_id, ''), 'municao:' || l.id::text), l.nota, l.avaliacoes,
      /* SEM PLACE ID, O PONTO É APROXIMADO. Medido em 28/10: dos 1.204 pinos de munição COM
         place id do Google, zero caíram em centróide de cidade; dos 2.334 sem place id, 179
         caíram. Place id é estabelecimento que o Google conhece, com ponto próprio; sem ele a
         coordenada é geocodificação de endereço, que responde "centro da cidade" quando não
         entende em vez de dizer que não sabe. */
      'leads_prospeccao', nullif(l.place_id, '') is null, l.id, v_dono, nullif(l.hubspot_deal_id, ''))
    returning id into v_pin;
    return v_pin;
  end if;

  update public.clients c set
    lead_prospeccao_id = l.id,
    vendedor_id_hubspot = case when c.id_hubspot is null and l.responsavel_owner_id is not null
                               then l.responsavel_owner_id else c.vendedor_id_hubspot end,
    id_hubspot = coalesce(c.id_hubspot, l.hubspot_deal_id),
    conta_alvo_dismissed = case when l.status = 'sem_fit' and l.motor_inativo is null and c.id_hubspot is null then true
                                else c.conta_alvo_dismissed end
  where c.id = v_pin
    and (c.lead_prospeccao_id is distinct from l.id
      or (c.id_hubspot is null and l.responsavel_owner_id is not null and c.vendedor_id_hubspot is distinct from l.responsavel_owner_id)
      or (c.id_hubspot is null and l.hubspot_deal_id is not null)
      or (l.status = 'sem_fit' and l.motor_inativo is null and c.id_hubspot is null and not coalesce(c.conta_alvo_dismissed, false)));
  return v_pin;
end;
$function$;

-- ── 3. os 187 que afirmavam ser exatos ───────────────────────────────────────────────────
/* O QUE CONTA COMO CENTRÓIDE, e por que não é só "muita gente no mesmo ponto": cinco
   restaurantes podem dividir a coordenada de um shopping de verdade. O que denuncia o
   centróide é a DISPERSÃO — o mesmo ponto servindo três bairros ou duas cidades diferentes.
   Medido: 69 coordenadas assim (777 leads), contra 44 coordenadas de um ou dois bairros
   (311 leads) que eu NÃO toco, porque ali a pilha pode ser real.

   Para desfazer: o mesmo WHERE, trocando `true` por `false`. Todas as 187 linhas tinham
   `false` antes — nenhuma era nula. */
with pilha as (
  select round(latitude::numeric, 5) lat, round(longitude::numeric, 5) lng,
         count(distinct nullif(trim(bairro), '')) bairros,
         count(distinct nullif(trim(cidade), '')) cidades
  from public.clients
  where not is_archived and latitude is not null and longitude is not null
  group by 1, 2
  having count(*) >= 5),
centroide as (select lat, lng from pilha where bairros >= 3 or cidades >= 2)
update public.clients c
set geo_approximate = true
from centroide k
where not c.is_archived
  and round(c.latitude::numeric, 5) = k.lat
  and round(c.longitude::numeric, 5) = k.lng
  and c.geo_approximate is not true;
