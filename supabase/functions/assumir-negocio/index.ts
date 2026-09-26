// Supabase Edge Function: assumir-negocio
//
// "É meu" do mapa novo (prompt final §7.9; decisão do Julyan em 26/09/2026:
// "se o lead estiver na rota dele, ele pode colocar direto no funil pelo mapa,
// clicando em é meu").
//
// Troca o DONO do negócio no HubSpot para quem tocou, e só isso — com três
// travas, todas conferidas aqui no servidor (nunca no que o navegador manda):
//   1. sessão válida e perfil com id_hubspot (sem dono no CRM não há o que
//      atribuir);
//   2. o negócio está SEM DONO ou com dono FORA DO TIME (equipe_cockpit
//      ativa) — negócio de colega não se toma;
//   3. o lead está na ROTA DE HOJE de quem pede (field_routes do dia, em
//      Brasília).
// Negócio em Backlog com origem_do_lead preenchida sobe para Prospecção (entra
// no funil); sem origem, fica em Backlog e a resposta diz o porquê — a regra
// do Cockpit exige origem para Prospecção.
//
// Lead sem negócio não passa por aqui: o app cria o negócio pelo create_pin da
// hubspot-sync, que já nasce em Prospecção com o executivo como dono.
//
// Deploy: verify_jwt LIGADO. Secrets: HUBSPOT_TOKEN (o mesmo da hubspot-sync);
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY vêm da plataforma.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const HS = 'https://api.hubapi.com';
const BACKLOG = '1396007427';
const PROSPECCAO = '1395880469';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const hojeBRT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

async function hs(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(HS + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, dados };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { erro: 'Método não permitido' });

  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return json(503, { erro: 'HUBSPOT_TOKEN não configurado' });
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // 1) quem pede
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quem } = await svc.auth.getUser(jwt);
  const uid = quem?.user?.id;
  if (!uid) return json(401, { erro: 'Sessão inválida. Entre de novo.' });
  const { data: perfil } = await svc.from('profiles').select('id, id_hubspot, full_name').eq('id', uid).maybeSingle();
  const meuOwner = perfil?.id_hubspot ? String(perfil.id_hubspot) : null;
  if (!meuOwner) return json(403, { erro: 'Seu usuário não tem dono no HubSpot. Peça para a gestão corrigir em Acessos.' });

  let corpo: { clientId?: string };
  try { corpo = await req.json(); } catch { return json(400, { erro: 'JSON inválido' }); }
  const clientId = String(corpo.clientId ?? '').trim();
  if (!clientId) return json(400, { erro: 'Falta o clientId.' });

  const { data: lead } = await svc.from('clients').select('id, id_hubspot, vendedor_id_hubspot, empresa, nome').eq('id', clientId).maybeSingle();
  if (!lead) return json(404, { erro: 'Lead não encontrado.' });
  if (!lead.id_hubspot) return json(409, { erro: 'Este lead ainda não tem negócio no HubSpot.', semNegocio: true });

  // 3) na rota de hoje de quem pede
  const { data: rotas } = await svc.from('field_routes').select('id').eq('seller_id', uid).eq('route_date', hojeBRT());
  const idsRota = (rotas ?? []).map((r: { id: string }) => r.id);
  let naRota = false;
  if (idsRota.length) {
    const { data: paradas } = await svc.from('field_route_stops').select('id').in('route_id', idsRota).eq('client_id', clientId).neq('status', 'removed').limit(1);
    naRota = !!paradas?.length;
  }
  if (!naRota) return json(403, { erro: 'Só dá para assumir um lead que está na sua rota de hoje. Ponha na rota e tente de novo.' });

  // 2) sem dono ou dono fora do time — pelo HubSpot, não pelo espelho local
  const deal = await hs(token, 'GET', `/crm/v3/objects/deals/${encodeURIComponent(lead.id_hubspot)}?properties=hubspot_owner_id,dealstage,origem_do_lead,pipeline`);
  if (!deal.ok) return json(502, { erro: 'Não consegui ler o negócio no HubSpot.', detalhe: deal.dados?.message });
  const props = deal.dados?.properties ?? {};
  // Só o funil do Field Sales: negócio de outro pipeline (onboarding, CS) não se assume pelo mapa.
  if (String(props.pipeline ?? '') !== '916011864') return json(409, { erro: 'Este negócio não está no funil do Field Sales.' });
  const donoAtual = props.hubspot_owner_id ? String(props.hubspot_owner_id) : null;
  if (donoAtual === meuOwner) return json(200, { ok: true, jaEraSeu: true });
  if (donoAtual) {
    const { data: time } = await svc.from('equipe_cockpit').select('profile_id').eq('ativo', true);
    const ids = (time ?? []).map((l: { profile_id: string }) => l.profile_id).filter(Boolean);
    const { data: perfis } = ids.length ? await svc.from('profiles').select('id_hubspot').in('id', ids) : { data: [] };
    const doTime = new Set((perfis ?? []).map((p: { id_hubspot: string | null }) => String(p.id_hubspot ?? '')).filter(Boolean));
    if (doTime.has(donoAtual)) return json(409, { erro: 'Este negócio já é de um colega do time. Fale com a gestão para trocar.' });
  }

  // Troca o dono; Backlog com origem entra no funil (Prospecção).
  const entraNoFunil = String(props.dealstage ?? '') === BACKLOG && !!String(props.origem_do_lead ?? '').trim();
  const patch: Record<string, string> = { hubspot_owner_id: meuOwner };
  if (entraNoFunil) patch.dealstage = PROSPECCAO;
  const r = await hs(token, 'PATCH', `/crm/v3/objects/deals/${encodeURIComponent(lead.id_hubspot)}`, { properties: patch });
  if (!r.ok) return json(502, { erro: 'O HubSpot recusou a troca de dono.', detalhe: r.dados?.message });

  await svc.from('clients').update({
    vendedor_id_hubspot: meuOwner,
    ...(entraNoFunil ? { etapa: 'Prospecção' } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', clientId);

  return json(200, {
    ok: true,
    dono: meuOwner,
    donoAnterior: donoAtual,
    etapa: entraNoFunil ? 'Prospecção' : null,
    aviso: String(props.dealstage ?? '') === BACKLOG && !entraNoFunil
      ? 'O negócio está em Backlog sem origem do lead: continua em Backlog até alguém preencher a origem.'
      : null,
  });
});
