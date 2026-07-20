// Supabase Edge Function: export-report
// Gera um CSV com TODA a atividade do periodo (uma linha por evento: lead
// criado, visita, reuniao, follow-up, mudanca de etapa, nota), cada linha com
// o VENDEDOR responsavel/executor — pro gestor analisar gargalos por vendedor.
// Sobe o CSV no bucket privado `exports` e devolve uma signed URL (7 dias).
//
// Auth: exige o JWT do usuario (Authorization: Bearer <token>). So gestores
// (mesma lista de can_view_metrics) podem exportar.
//
// Body JSON:
//   { "preset": "last_week" }                         -> semana anterior (seg-dom)
//   { "start": "2026-07-13T00:00:00Z", "end": "..." } -> intervalo explicito
//   (sem body / vazio -> semana anterior)
//
// Deploy:
//   supabase functions deploy export-report
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// (todos preenchidos automaticamente pela plataforma).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GESTOR_EMAILS = ['arthurgothe.takeat@gmail.com', 'outbound@takeat.app', 'brittes@takeat.app'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// Semana anterior no fuso de Brasilia (UTC-3): segunda 00:00 ate domingo 23:59.
function lastWeekRange(): { start: string; end: string; label: string } {
  const now = new Date();
  // "Agora" em horario de Brasilia.
  const br = new Date(now.getTime() - 3 * 3600 * 1000);
  const dow = br.getUTCDay(); // 0=dom..6=sab (sobre a data BR)
  // Dias desde a ultima segunda-feira (segunda=0).
  const sinceMonday = (dow + 6) % 7;
  // Segunda desta semana (BR), 00:00 BR = 03:00 UTC.
  const thisMondayBr = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - sinceMonday, 3, 0, 0));
  // Semana anterior: -7 dias.
  const startUtc = new Date(thisMondayBr.getTime() - 7 * 24 * 3600 * 1000);
  const endUtc = new Date(thisMondayBr.getTime() - 1000); // domingo 23:59:59 BR
  const fmt = (d: Date) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  return { start: startUtc.toISOString(), end: endUtc.toISOString(), label: `${fmt(startUtc)}_a_${fmt(endUtc)}` };
}

// Escapa um campo pra CSV (aspas + separador + quebras de linha).
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

type Row = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRole || !anonKey) {
    return json(500, { error: 'Supabase env vars ausentes' });
  }

  // 1) Valida o usuario pelo JWT e checa se e' gestor.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Sem token de autenticacao' });

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Token invalido' });
  const email = (userData.user.email ?? '').toLowerCase();
  if (!GESTOR_EMAILS.includes(email)) {
    return json(403, { error: 'Sem permissao para exportar (apenas gestor)' });
  }

  // 2) Resolve o periodo.
  let body: { preset?: string; start?: string; end?: string } = {};
  try { body = await req.json(); } catch { /* body vazio -> semana anterior */ }
  let start: string, end: string, label: string;
  if (body.start && body.end) {
    start = body.start; end = body.end;
    label = `${start.slice(0, 10)}_a_${end.slice(0, 10)}`;
  } else {
    ({ start, end, label } = lastWeekRange());
  }

  const db = createClient(supabaseUrl, serviceRole);

  // 3) Mapa vendedor: id_hubspot -> nome, e auth.uid -> nome (dois indices).
  const { data: profs } = await db.from('profiles').select('id, full_name, email, id_hubspot');
  const nameByHubspot = new Map<string, string>();
  const nameByUid = new Map<string, string>();
  for (const p of profs ?? []) {
    const nome = (p.full_name || p.email || '').trim();
    if (p.id_hubspot) nameByHubspot.set(p.id_hubspot, nome);
    if (p.id) nameByUid.set(p.id, nome);
  }

  // Helper: nome do cliente + responsavel a partir do registro de cliente.
  const clientName = (c: any) =>
    (c?.empresa?.trim() || c?.nome?.trim() || 'Sem nome');

  const rows: Row[] = [];

  // 4a) Leads criados no periodo.
  const { data: created } = await db
    .from('clients')
    .select('id, nome, empresa, status, etapa, cidade, estado, vendedor_id_hubspot, created_by, created_at')
    .gte('created_at', start).lte('created_at', end);
  for (const c of created ?? []) {
    rows.push({
      tipo: 'Lead criado',
      data: c.created_at,
      vendedor: nameByHubspot.get(c.vendedor_id_hubspot ?? '') || nameByUid.get(c.created_by ?? '') || '',
      cliente: clientName(c),
      etapa: c.etapa ?? '',
      status: c.status ?? '',
      cidade: c.cidade ?? '',
      estado: c.estado ?? '',
      detalhe: '',
    });
  }

  // 4b) Visitas (check-in) no periodo.
  const { data: visited } = await db
    .from('clients')
    .select('id, nome, empresa, status, etapa, cidade, estado, vendedor_id_hubspot, visited_by, visited_at')
    .gte('visited_at', start).lte('visited_at', end);
  for (const c of visited ?? []) {
    rows.push({
      tipo: 'Visita',
      data: c.visited_at,
      vendedor: nameByUid.get(c.visited_by ?? '') || nameByHubspot.get(c.vendedor_id_hubspot ?? '') || '',
      cliente: clientName(c),
      etapa: c.etapa ?? '',
      status: c.status ?? '',
      cidade: c.cidade ?? '',
      estado: c.estado ?? '',
      detalhe: '',
    });
  }

  // 4c) Reunioes e follow-ups (client_meetings) no periodo.
  const { data: meetings } = await db
    .from('client_meetings')
    .select('id, client_id, type, scheduled_at, observacoes, created_by, created_at, clients(nome, empresa, status, etapa, cidade, estado, vendedor_id_hubspot)')
    .gte('created_at', start).lte('created_at', end);
  for (const m of meetings ?? []) {
    const c: any = (m as any).clients ?? {};
    rows.push({
      tipo: m.type === 'follow_up' ? 'Follow-up' : 'Reunião',
      data: m.scheduled_at ?? m.created_at,
      vendedor: nameByUid.get(m.created_by ?? '') || nameByHubspot.get(c.vendedor_id_hubspot ?? '') || '',
      cliente: clientName(c),
      etapa: c.etapa ?? '',
      status: c.status ?? '',
      cidade: c.cidade ?? '',
      estado: c.estado ?? '',
      detalhe: m.observacoes ?? '',
    });
  }

  // 4d) Mudancas de etapa no periodo.
  const { data: stages } = await db
    .from('client_stage_changes')
    .select('id, client_id, from_stage, to_stage, created_by, created_by_name, created_at, clients(nome, empresa, status, cidade, estado, vendedor_id_hubspot)')
    .gte('created_at', start).lte('created_at', end);
  for (const s of stages ?? []) {
    const c: any = (s as any).clients ?? {};
    rows.push({
      tipo: 'Mudança de etapa',
      data: s.created_at,
      vendedor: s.created_by_name || nameByUid.get(s.created_by ?? '') || nameByHubspot.get(c.vendedor_id_hubspot ?? '') || '',
      cliente: clientName(c),
      etapa: s.to_stage ?? '',
      status: c.status ?? '',
      cidade: c.cidade ?? '',
      estado: c.estado ?? '',
      detalhe: `${s.from_stage ?? '—'} → ${s.to_stage ?? '—'}`,
    });
  }

  // 4e) Notas no periodo.
  const { data: notes } = await db
    .from('client_notes')
    .select('id, client_id, body, created_by, created_by_name, created_at, clients(nome, empresa, status, etapa, cidade, estado, vendedor_id_hubspot)')
    .gte('created_at', start).lte('created_at', end);
  for (const n of notes ?? []) {
    const c: any = (n as any).clients ?? {};
    rows.push({
      tipo: 'Nota',
      data: n.created_at,
      vendedor: n.created_by_name || nameByUid.get(n.created_by ?? '') || nameByHubspot.get(c.vendedor_id_hubspot ?? '') || '',
      cliente: clientName(c),
      etapa: c.etapa ?? '',
      status: c.status ?? '',
      cidade: c.cidade ?? '',
      estado: c.estado ?? '',
      detalhe: (n.body ?? '').slice(0, 500),
    });
  }

  // 5) Ordena por vendedor, depois por data — facilita analise de gargalo.
  rows.sort((a, b) => {
    const va = String(a.vendedor), vb = String(b.vendedor);
    if (va !== vb) return va.localeCompare(vb, 'pt-BR');
    return String(a.data).localeCompare(String(b.data));
  });

  // 6) Monta o CSV (UTF-8 BOM pro Excel/Sheets abrir acentos corretamente).
  const headers = ['tipo', 'data', 'vendedor', 'cliente', 'etapa', 'status', 'cidade', 'estado', 'detalhe'];
  const headerLabels = ['Tipo', 'Data/Hora', 'Vendedor', 'Cliente', 'Etapa', 'Status', 'Cidade', 'Estado', 'Detalhe'];
  const lines = [headerLabels.join(',')];
  for (const r of rows) {
    // Formata a data pra dd/mm/aaaa hh:mm (BR) pra leitura direta.
    const d = r.data ? new Date(String(r.data)) : null;
    const dataFmt = d && !isNaN(d.getTime())
      ? new Date(d.getTime() - 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16)
      : '';
    const cells = headers.map((h) => csvCell(h === 'data' ? dataFmt : r[h]));
    lines.push(cells.join(','));
  }
  const BOM = String.fromCharCode(0xFEFF); // UTF-8 BOM pro Excel/Sheets ler acentos
  const csv = BOM + lines.join(String.fromCharCode(13, 10));

  // 7) Sobe no Storage e gera signed URL (7 dias).
  const path = `relatorio_${label}_${Date.now()}.csv`;
  const { error: upErr } = await db.storage
    .from('exports')
    .upload(path, new Blob([csv], { type: 'text/csv;charset=utf-8' }), {
      contentType: 'text/csv;charset=utf-8',
      upsert: true,
    });
  if (upErr) return json(500, { error: 'Falha ao subir o CSV', detail: upErr.message });

  const { data: signed, error: signErr } = await db.storage
    .from('exports')
    .createSignedUrl(path, 7 * 24 * 3600);
  if (signErr || !signed) return json(500, { error: 'Falha ao gerar link', detail: signErr?.message });

  return json(200, {
    ok: true,
    url: signed.signedUrl,
    filename: path,
    rows: rows.length,
    period: { start, end, label },
  });
});
