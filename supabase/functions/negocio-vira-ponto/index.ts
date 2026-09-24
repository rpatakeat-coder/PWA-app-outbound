// Supabase Edge Function: negocio-vira-ponto
//
// A REGRA: todo negócio ativo do pipeline Field Sales tem um ponto no mapa.
//
// Por quê (medido em 24/09/2026): dos 564 negócios ativos do Field Sales, 283
// não existiam em `clients` — o executivo não os via no mapa do app. O ponto só
// nascia por três caminhos (pin criado no app, webhook do RPA, conta-alvo); o
// negócio criado pelo Planejamento do Cockpit ou direto no HubSpot não passava
// por nenhum. Esta função fecha o buraco olhando o HubSpot, não quem criou.
//
// O que ela faz, a cada chamada:
//   1. lê do HubSpot os negócios do pipeline 916011864 nas etapas ativas
//      (Prospecção, Visita, Conversa com decisor, Demo/Proposta, Negociação,
//      Pagamento). SÓ LEITURA: nada é escrito no HubSpot.
//   2. para cada um sem linha em `clients` (id_hubspot), cria o ponto.
//
// O que ela NÃO faz, de propósito:
//   - não inventa localização. Coordenada vem, nesta ordem, do lead de
//     prospecção do Cockpit (leads_prospeccao), das propriedades do negócio, ou
//     do Google a partir de um endereço COM RUA. Resultado que o Google só
//     acerta no bairro/cidade (APPROXIMATE) não vira ponto: vai para a lista
//     `sem_localizacao`. Um pino no centro da cidade engana quem está na rua.
//   - não duplica pino. Se já existe ponto com o mesmo telefone ou o mesmo
//     lugar do Google, não cria: vai para `possivel_duplicado`, com o id do
//     ponto existente, para alguém decidir.
//   - não atualiza ponto existente (etapa/dono seguem com hubspot-sync).
//
// Autenticação: header x-cron-secret, conferido contra o cofre do banco pela
// função public.segredo_confere (migration 0087). O segredo nunca aparece em
// código, chat ou repositório. Quem chama é public.invocar_negocio_vira_ponto,
// pelo pg_cron.
//
// Corpo (opcional): { "dry_run": true, "limite_geocode": 60 }
//   dry_run  → não grava nada; devolve o que faria.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PIPELINE = '916011864';
const ETAPAS: Record<string, string> = {
  '1395880469': 'Prospecção',
  '1396005401': 'Visita',
  '1395880470': 'Conversa com decisor',
  '1395880471': 'Demo/Proposta',
  '1395880472': 'Negociação',
  '1395880473': 'Pagamento',
};
const PROPS = [
  'dealname', 'dealstage', 'hubspot_owner_id', 'latitude', 'longitude', 'logradouro',
  'rua__endereco', 'numero_do_local', 'bairro', 'cidade', 'estado_uf', 'cep', 'celular',
  'celular_limpo',
];
const PORTAL = '24373118';
// clients.origem só aceita manual|import|api (clients_origem_check). O ponto
// criado aqui é da integração: 'api'. O rastro fica na tag.
const ORIGEM = 'api';
const TAG = 'negocio_vira_ponto';
// Negócio de teste no HubSpot não vira pino: suja o mapa de quem está na rua.
const EH_TESTE = /(^|[\s\-_])(teste|test)([\s\-_]|$)|^zz[\s_]|escrit[oó]rio da takeat/i;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const limpo = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
const num = (v: unknown): number | null => {
  const s = limpo(v);
  if (!s) return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
};
const tel = (v: unknown): string | null => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-11) : null;
};
// "Oportunidade - MPS LANCHONETE" -> "MPS LANCHONETE". Só esse prefixo: cortar
// em qualquer " - " transformava "Dizzy - Vila Maria" em "Vila Maria" e
// "Quintal do Arlindo - Porções, Espetos…" em "Porções, Espetos…".
const empresaDo = (dealname: string | null): string | null => {
  if (!dealname) return null;
  return dealname.replace(/^\s*oportunidade\s*-\s*/i, '').trim() || null;
};
// Coordenada plausível para o Brasil; fora disso é lixo de digitação.
const noBrasil = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null && lat < 6 && lat > -34 && lng < -28 && lng > -74;

async function hubspot(token: string, path: string, body?: unknown) {
  const r = await fetch(`https://api.hubapi.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`HubSpot ${r.status}: ${j?.message ?? 'sem detalhe'}`);
  return j;
}

async function negociosAtivos(token: string) {
  const out: any[] = [];
  let after: string | undefined;
  for (let pagina = 0; pagina < 50; pagina++) {
    const j = await hubspot(token, '/crm/v3/objects/deals/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE },
          { propertyName: 'dealstage', operator: 'IN', values: Object.keys(ETAPAS) },
        ],
      }],
      properties: PROPS,
      sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
      limit: 100,
      ...(after ? { after } : {}),
    });
    out.push(...(j?.results ?? []));
    after = j?.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

type Geo = { lat: number; lng: number; aproximado: boolean; fonte: string };

async function geocodeGoogle(end: { rua: string; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null; cep: string | null }, key: string): Promise<Geo | null> {
  const linha = [end.numero, end.rua].filter(Boolean).join(' ');
  const address = [linha, end.bairro, end.cidade, end.estado, end.cep, 'Brasil'].filter(Boolean).join(', ');
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=br&language=pt-BR&key=${key}`);
  const j = await r.json().catch(() => null);
  const hit = j?.status === 'OK' ? j.results?.[0] : null;
  const loc = hit?.geometry?.location;
  const tipo = String(hit?.geometry?.location_type ?? '');
  if (!loc || tipo === 'APPROXIMATE') return null; // bairro/cidade: não serve para pino
  return { lat: loc.lat, lng: loc.lng, aproximado: tipo !== 'ROOFTOP' && tipo !== 'RANGE_INTERPOLATED', fonte: 'google' };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const segredo = req.headers.get('x-cron-secret') ?? '';
  const { data: ok } = await svc.rpc('segredo_confere', { p_nome: 'negocio_vira_ponto', p_valor: segredo });
  if (ok !== true) return json(403, { error: 'segredo' });

  const corpo = await req.json().catch(() => ({}));
  const dryRun = corpo?.dry_run === true;
  const limiteGeocode = Math.min(Math.max(Number(corpo?.limite_geocode ?? 60), 0), 200);

  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return json(503, { error: 'HUBSPOT_TOKEN ausente' });
  const googleKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY') ?? '';

  const negocios = await negociosAtivos(token);
  const ids = negocios.map((d) => String(d.id));

  // Quem já está no mapa
  const noMapa = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await svc.from('clients').select('id_hubspot').in('id_hubspot', ids.slice(i, i + 200));
    if (error) return json(500, { error: `clients: ${error.message}` });
    for (const r of data ?? []) noMapa.add(String(r.id_hubspot));
  }
  const faltam = negocios.filter((d) => !noMapa.has(String(d.id)));

  // Leads de prospecção do Cockpit ligados a esses negócios
  const leadPorDeal = new Map<string, any>();
  const idsFaltam = faltam.map((d) => String(d.id));
  for (let i = 0; i < idsFaltam.length; i += 200) {
    const { data } = await svc
      .from('leads_prospeccao')
      .select('hubspot_deal_id, nome, endereco, bairro, cidade, estado, telefone, telefone_normalizado, lat, lng, place_id')
      .in('hubspot_deal_id', idsFaltam.slice(i, i + 200));
    for (const l of data ?? []) leadPorDeal.set(String(l.hubspot_deal_id), l);
  }

  // Donos -> perfil (created_by)
  const { data: perfis } = await svc.from('profiles').select('id, id_hubspot').not('id_hubspot', 'is', null);
  const perfilDoOwner = new Map((perfis ?? []).map((p: any) => [String(p.id_hubspot), p.id as string]));
  const autorPadrao = Deno.env.get('HUBSPOT_WEBHOOK_USER_ID') ?? null;

  const { data: st } = await svc.from('client_statuses').select('slug').eq('is_default_for_new_leads', true).eq('is_active', true).maybeSingle();
  const statusPadrao = st?.slug ?? 'lead';

  const criados: any[] = [];
  const semLocalizacao: any[] = [];
  const possivelDuplicado: any[] = [];
  const erros: any[] = [];
  const ignoradosTeste: any[] = [];
  let geocodes = 0;

  for (const d of faltam) {
    const p = d.properties ?? {};
    const id = String(d.id);
    const lead = leadPorDeal.get(id) ?? null;
    const nomeNegocio = limpo(p.dealname);
    const empresa = empresaDo(nomeNegocio) ?? limpo(lead?.nome);
    const rua = limpo(p.logradouro) ?? limpo(p.rua__endereco) ?? limpo(lead?.endereco);
    const telefone = limpo(p.celular) ?? limpo(p.celular_limpo) ?? limpo(lead?.telefone);
    const telNorm = tel(telefone) ?? tel(lead?.telefone_normalizado);
    const end = {
      rua, numero: limpo(p.numero_do_local), bairro: limpo(p.bairro) ?? limpo(lead?.bairro),
      cidade: limpo(p.cidade) ?? limpo(lead?.cidade), estado: limpo(p.estado_uf) ?? limpo(lead?.estado),
      cep: limpo(p.cep),
    };
    const resumo = { id_hubspot: id, nome: empresa, etapa: ETAPAS[p.dealstage] ?? null, dono: limpo(p.hubspot_owner_id) };

    // Teste, ou negócio sem nome nenhum: um pino "sem nome" não serve na rua.
    if (EH_TESTE.test(nomeNegocio ?? '') || !empresa) {
      ignoradosTeste.push(resumo);
      continue;
    }

    // Duplicado: mesmo telefone ou mesmo lugar do Google já no mapa
    let dup: any = null;
    if (telNorm) {
      // O ilike pelos últimos 4 dígitos só estreita a busca (o telefone é gravado
      // com máscara variada); quem decide é a comparação dos 10-11 dígitos.
      const { data: cand } = await svc.from('clients').select('id, nome, id_hubspot, telefone').ilike('telefone', `%${telNorm.slice(-4)}%`).limit(200);
      dup = (cand ?? []).find((c: any) => tel(c.telefone) === telNorm) ?? null;
    }
    if (!dup && lead?.place_id) {
      const { data } = await svc.from('clients').select('id, nome, id_hubspot').eq('conta_alvo_place_id', lead.place_id).limit(1);
      dup = data?.[0] ?? null;
    }
    if (dup) {
      possivelDuplicado.push({ ...resumo, ponto_existente: dup.id, nome_existente: dup.nome, negocio_do_ponto: dup.id_hubspot });
      continue;
    }

    // Localização
    let geo: Geo | null = null;
    const latLead = num(lead?.lat), lngLead = num(lead?.lng);
    const latDeal = num(p.latitude), lngDeal = num(p.longitude);
    if (noBrasil(latLead, lngLead)) geo = { lat: latLead!, lng: lngLead!, aproximado: false, fonte: 'lead_prospeccao' };
    else if (noBrasil(latDeal, lngDeal)) geo = { lat: latDeal!, lng: lngDeal!, aproximado: false, fonte: 'hubspot' };
    else if (rua && end.cidade && googleKey && geocodes < limiteGeocode) {
      geocodes++;
      try { geo = await geocodeGoogle({ ...end, rua }, googleKey); } catch { geo = null; }
    }
    if (!geo) {
      semLocalizacao.push({ ...resumo, tem_rua: !!rua, cidade: end.cidade, adiado_por_limite: !!(rua && end.cidade && geocodes >= limiteGeocode) });
      continue;
    }

    const linha = {
      nome: empresa,
      empresa,
      telefone,
      endereco: rua,
      numero: end.numero,
      bairro: end.bairro,
      cidade: end.cidade,
      estado: end.estado,
      cep: end.cep,
      latitude: geo.lat,
      longitude: geo.lng,
      geo_source: geo.fonte,
      geo_approximate: geo.aproximado,
      conta_alvo_place_id: lead?.place_id ?? null,
      id_hubspot: id,
      url_hubspot: `https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${id}`,
      status: statusPadrao,
      etapa: ETAPAS[p.dealstage] ?? null,
      vendedor_id_hubspot: limpo(p.hubspot_owner_id),
      origem: ORIGEM,
      tags: [TAG],
      created_by: perfilDoOwner.get(String(p.hubspot_owner_id)) ?? autorPadrao,
    };
    if (!linha.created_by) { erros.push({ ...resumo, erro: 'sem autor (dono sem perfil e HUBSPOT_WEBHOOK_USER_ID ausente)' }); continue; }

    if (dryRun) { criados.push({ ...resumo, fonte_geo: geo.fonte, aproximado: geo.aproximado }); continue; }
    const { error } = await svc.from('clients').insert(linha);
    if (error) erros.push({ ...resumo, erro: error.message });
    else criados.push({ ...resumo, fonte_geo: geo.fonte, aproximado: geo.aproximado });
  }

  return json(200, {
    dry_run: dryRun,
    ativos_no_hubspot: negocios.length,
    ja_no_mapa: noMapa.size,
    faltavam: faltam.length,
    criados: criados.length,
    sem_localizacao: semLocalizacao.length,
    possivel_duplicado: possivelDuplicado.length,
    erros: erros.length,
    ignorados_teste: ignoradosTeste.length,
    geocodes_usados: geocodes,
    detalhe: { criados, sem_localizacao: semLocalizacao, possivel_duplicado: possivelDuplicado, erros, ignorados_teste: ignoradosTeste },
  });
});
