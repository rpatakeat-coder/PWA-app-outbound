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
//   - do ponto existente só acerta a ETAPA (02/11/26), quando diverge do HubSpot; o dono não muda aqui.
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
// nome comparável: sem acento, sem pontuação e sem as palavras que todo restaurante tem
const VAZIAS = new Set(['restaurante', 'bar', 'e', 'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'mcz', 'lanchonete', 'cafe', 'pizzaria', 'hamburgueria', 'the']);
const tokensDoNome = (n: string | null | undefined) => new Set(String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').split(/s+/).filter((t) => t.length > 1 && !VAZIAS.has(t)));
const nomesParecidos = (a: string | null | undefined, b: string | null | undefined) => {
  const A = tokensDoNome(a), B = tokensDoNome(b);
  if (!A.size || !B.size) return false;
  let comum = 0; A.forEach((t) => { if (B.has(t) || [...B].some((u) => u.length > 3 && t.length > 3 && (u.startsWith(t) || t.startsWith(u)))) comum++; });
  return comum / Math.min(A.size, B.size) >= 0.6;
};
const empresaDo = (dealname: string | null): string | null => {
  if (!dealname) return null;
  return dealname.replace(/^\s*oportunidade\s*-\s*/i, '').trim() || null;
};
// Coordenada plausível para o Brasil; fora disso é lixo de digitação.
const noBrasil = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null && lat < 6 && lat > -34 && lng < -28 && lng > -74;

async function hubspot(token: string, path: string, body?: unknown) {
  // 429 = limite POR SEGUNDO do HubSpot (29/09/2026: 3 voltas do robô morreram assim,
  // porque outros robôs chamavam no mesmo segundo). Espera e tenta de novo, até 3 vezes;
  // qualquer outro erro sobe na hora.
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(`https://api.hubapi.com${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (r.status === 429 && tentativa < 3) {
      await new Promise((ok) => setTimeout(ok, 1200 * (tentativa + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`HubSpot ${r.status}: ${j?.message ?? 'sem detalhe'}`);
    return j;
  }
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
  const pinosDoMapa: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await svc.from('clients').select('id, id_hubspot, etapa, status, is_archived, updated_at').in('id_hubspot', ids.slice(i, i + 200));
    if (error) return json(500, { error: `clients: ${error.message}` });
    for (const r of data ?? []) { noMapa.add(String(r.id_hubspot)); pinosDoMapa.push(r); }
  }

  /* A ETAPA DO PINO SEGUE O HUBSPOT EM ATÉ 15 MIN (auditoria 02/11/26). A mudança feita direto no HubSpot
     só chegava ao mapa quando o robô publicava o snapshot (até 2 h; nada no fim de semana). Esta rodada já
     lê todos os negócios ativos com a etapa: o pino que diverge recebe o rótulo (os mesmos do gatilho
     etapa_do_pino_pelo_snapshot). Mexido no app nos últimos 10 min não é tocado (o app pode estar à frente). */
  const ROTULO: Record<string, string> = { ...ETAPAS, '1395880473': 'Ag. Pagamento' };
  const etapaDoDeal = new Map(negocios.map((d) => [String(d.id), ROTULO[String(d.properties?.dealstage ?? '')] ?? null]));
  const dezMin = Date.now() - 10 * 60 * 1000;
  const porRotulo = new Map<string, string[]>();
  for (const c of pinosDoMapa) {
    const alvo = etapaDoDeal.get(String(c.id_hubspot));
    if (!alvo || c.status !== 'lead' || c.is_archived || c.etapa === alvo) continue;
    if (c.updated_at && Date.parse(c.updated_at) > dezMin) continue;
    porRotulo.set(alvo, [...(porRotulo.get(alvo) ?? []), String(c.id)]);
  }
  let etapasAtualizadas = 0;
  if (!dryRun) {
    for (const [rotulo, idsPino] of porRotulo) {
      for (let i = 0; i < idsPino.length; i += 200) {
        const { error } = await svc.from('clients').update({ etapa: rotulo }).in('id', idsPino.slice(i, i + 200));
        if (!error) etapasAtualizadas += Math.min(200, idsPino.length - i);
      }
    }
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

  // TELEFONES UMA VEZ POR RODADA (auditoria de velocidade, 28/09/2026). Era um ilike por
  // negócio que falta — 156 varreduras da tabela clients inteira a cada 15 min, 13,6 mil
  // por dia, sempre os mesmos 149 telefones. Agora lê os telefones uma vez (em páginas
  // por id) e compara os mesmos 10-11 dígitos normalizados, em memória.
  let porTelefone: Map<string, any> | null = null;
  const carregarTelefones = async () => {
    const m = new Map<string, any>();
    let ultimo = '';
    for (;;) {
      let q = svc.from('clients').select('id, nome, empresa, id_hubspot, telefone').not('telefone', 'is', null).order('id').limit(1000);
      if (ultimo) q = q.gt('id', ultimo);
      const { data, error } = await q;
      if (error) throw new Error(`clients (telefones): ${error.message}`);
      for (const c of data ?? []) {
        const t = tel(c.telefone);
        if (t && !m.has(t)) m.set(t, c);
      }
      if (!data || data.length < 1000) break;
      ultimo = String(data[data.length - 1].id);
    }
    return m;
  };

  const criados: any[] = [];
  const ligados: any[] = [];
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
      // O telefone é gravado com máscara variada; quem decide é a comparação dos
      // 10-11 dígitos normalizados (a mesma de antes, agora num mapa da rodada).
      if (!porTelefone) {
        try { porTelefone = await carregarTelefones(); }
        catch (e) { return json(500, { error: (e as Error).message }); }
      }
      dup = porTelefone.get(telNorm) ?? null;
    }
    if (!dup && lead?.place_id) {
      const { data } = await svc.from('clients').select('id, nome, empresa, id_hubspot').eq('conta_alvo_place_id', lead.place_id).limit(1);
      dup = data?.[0] ?? null;
      if (dup) dup.mesmoLugar = true;
    }
    /* O MESMO RESTAURANTE, PINO SEM NEGÓCIO (auditoria 02/11/26): o negócio com o nome do restaurante batia no
       pino de mesmo nome (ou do mesmo lugar do Google) que ainda não tinha negócio, e ficava fora do mapa
       esperando alguém decidir. Agora ele é LIGADO a esse pino. Telefone igual com nome diferente continua na
       lista: às vezes é outro restaurante da mesma pessoa, às vezes o mesmo com o negócio antigo no nome dela. */
    if (dup && !limpo(dup.id_hubspot) && (dup.mesmoLugar || nomesParecidos(empresa, dup.empresa ?? dup.nome))) {
      if (!dryRun) {
        const { error } = await svc.from('clients').update({
          id_hubspot: id, url_hubspot: `https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${id}`,
          etapa: ROTULO[String(p.dealstage ?? '')] ?? null, is_archived: false,
        }).eq('id', dup.id).is('id_hubspot', null);
        if (error) { erros.push({ ...resumo, erro: `ligar ao pino: ${error.message}` }); continue; }
      }
      ligados.push({ ...resumo, ponto: dup.id, nome_do_ponto: dup.empresa ?? dup.nome });
      continue;
    }
    if (dup) {
      possivelDuplicado.push({ ...resumo, ponto_existente: dup.id, nome_existente: dup.empresa ?? dup.nome, negocio_do_ponto: dup.id_hubspot });
      continue;
    }

    // Localização
    let geo: Geo | null = null;
    const latLead = num(lead?.lat), lngLead = num(lead?.lng);
    const latDeal = num(p.latitude), lngDeal = num(p.longitude);
    if (noBrasil(latLead, lngLead)) geo = { lat: latLead!, lng: lngLead!, aproximado: false, fonte: 'leads_prospeccao' }; // a grafia da municao_sincronizar_pino (0242 normaliza as antigas)
    // lat/lng do negócio no HubSpot é cópia de onde o pino estava (ou do centroide do webhook): aproximada,
    // a mesma regra da hubspot-lead-webhook-latlong (auditoria 02/11/26 — eram 8 'hubspot' exatos)
    else if (noBrasil(latDeal, lngDeal)) geo = { lat: latDeal!, lng: lngDeal!, aproximado: true, fonte: 'hubspot' };
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
    else {
      criados.push({ ...resumo, fonte_geo: geo.fonte, aproximado: geo.aproximado });
      // o pino que nasceu agora conta como duplicado para o próximo negócio da rodada
      if (telNorm && porTelefone) porTelefone.set(telNorm, { id: null, nome: empresa, id_hubspot: id, telefone });
    }
  }

  return json(200, {
    dry_run: dryRun,
    ativos_no_hubspot: negocios.length,
    ja_no_mapa: noMapa.size,
    etapas_divergentes: [...porRotulo.values()].reduce((a, l) => a + l.length, 0),
    etapas_atualizadas: etapasAtualizadas,
    faltavam: faltam.length,
    criados: criados.length,
    ligados_a_pino_existente: ligados.length,
    sem_localizacao: semLocalizacao.length,
    possivel_duplicado: possivelDuplicado.length,
    erros: erros.length,
    ignorados_teste: ignoradosTeste.length,
    geocodes_usados: geocodes,
    detalhe: { criados, ligados, sem_localizacao: semLocalizacao, possivel_duplicado: possivelDuplicado, erros, ignorados_teste: ignoradosTeste },
  });
});
