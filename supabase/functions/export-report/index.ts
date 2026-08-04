// Supabase Edge Function: export-report
// Exporta TUDO do periodo num unico JSON estruturado (pra jogar numa IA
// analisar): leads (snapshot completo), tarefas, visitas, reunioes, follow-ups,
// mudancas de etapa (com motivos/sub_values), notas — cada registro com o
// vendedor. Sobe no bucket privado `exports` e devolve uma signed URL (7 dias).
//
// Auth: exige o JWT do usuario (Authorization: Bearer <token>). So gestores.
//
// Body JSON:
//   { "start": "...", "end": "..." }  -> intervalo explicito
//   {} / vazio                        -> semana anterior (seg-dom, horario BR)
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GESTOR_EMAILS = ['arthurgothe.takeat@gmail.com', 'outbound@takeat.app', 'brittes@takeat.app', 'guilherme.borborema.takeat@gmail.com'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Semana anterior no fuso de Brasilia (UTC-3): segunda 00:00 ate domingo 23:59.
function lastWeekRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const br = new Date(now.getTime() - 3 * 3600 * 1000);
  const dow = br.getUTCDay();
  const sinceMonday = (dow + 6) % 7;
  const thisMondayBr = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - sinceMonday, 3, 0, 0));
  const startUtc = new Date(thisMondayBr.getTime() - 7 * 24 * 3600 * 1000);
  const endUtc = new Date(thisMondayBr.getTime() - 1000);
  const fmt = (d: Date) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  return { start: startUtc.toISOString(), end: endUtc.toISOString(), label: `${fmt(startUtc)}_a_${fmt(endUtc)}` };
}

// Paginacao: PostgREST capa em 1000 linhas. Traz tudo em blocos.
async function fetchAll(db: any, table: string, columns: string, filter: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    let q = db.from(table).select(columns).range(from, from + PAGE - 1).order('created_at', { ascending: true });
    q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRole || !anonKey) return json(500, { error: 'Supabase env vars ausentes' });

  // 1) Auth: valida JWT e checa gestor.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Sem token de autenticacao' });
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Token invalido' });
  const email = (userData.user.email ?? '').toLowerCase();
  if (!GESTOR_EMAILS.includes(email)) return json(403, { error: 'Sem permissao para exportar (apenas gestor)' });

  // 2) Periodo.
  let body: { start?: string; end?: string } = {};
  try { body = await req.json(); } catch { /* vazio -> semana anterior */ }
  let start: string, end: string, label: string;
  if (body.start && body.end) {
    start = body.start; end = body.end;
    label = `${start.slice(0, 10)}_a_${end.slice(0, 10)}`;
  } else {
    ({ start, end, label } = lastWeekRange());
  }

  const db = createClient(supabaseUrl, serviceRole);

  // Marcador de etapa: se algo falhar, o catch loga/devolve ONDE parou.
  let step = 'inicio';

  try {
    // 3) Vendedores (referencia de nome por id_hubspot e por auth.uid).
    step = 'profiles';
    const { data: profs } = await db.from('profiles').select('id, full_name, email, id_hubspot, sector, role');
    const nameByHubspot = new Map<string, string>();
    const nameByUid = new Map<string, string>();
    for (const p of profs ?? []) {
      const nome = (p.full_name || p.email || '').trim();
      if (p.id_hubspot) nameByHubspot.set(p.id_hubspot, nome);
      if (p.id) nameByUid.set(p.id, nome);
    }
    const vendedorByHid = (hid: string | null) => (hid ? (nameByHubspot.get(hid) ?? null) : null);
    const vendedorByUid = (uid: string | null) => (uid ? (nameByUid.get(uid) ?? null) : null);

    const inPeriod = (q: any, col: string) => q.gte(col, start).lte(col, end);

    // 4) Atividades do periodo (cada uma com o vendedor executor + responsavel).
    //    Em paralelo: sequencial estourava 14s+ em periodos longos (30d).
    const [meetings, stageChanges, notes, tasks, createdLeads, visitedLeads] = await Promise.all([
      fetchAll(
        db, 'client_meetings',
        'id, client_id, type, scheduled_at, observacoes, status, duration_minutes, created_by, created_at',
        (q) => inPeriod(q, 'created_at'),
      ),
      fetchAll(
        db, 'client_stage_changes',
        'id, client_id, from_stage, to_stage, to_stage_id, sub_values, created_by, created_by_name, created_at',
        (q) => inPeriod(q, 'created_at'),
      ),
      fetchAll(
        db, 'client_notes',
        'id, client_id, body, created_by, created_by_name, created_by_email, created_at',
        (q) => inPeriod(q, 'created_at'),
      ),
      fetchAll(
        db, 'client_tasks',
        'id, client_id, task_type, severity, title, status, vendedor_id_hubspot, meta, created_at, updated_at, resolved_at, resolved_by',
        // Tarefas: inclui as criadas OU resolvidas no periodo (pra ver o que fechou).
        (q) => q.or(`and(created_at.gte.${start},created_at.lte.${end}),and(resolved_at.gte.${start},resolved_at.lte.${end})`),
      ),
      fetchAll(db, 'clients', 'id', (q) => inPeriod(q, 'created_at')),
      fetchAll(db, 'clients', 'id', (q) => inPeriod(q, 'visited_at')),
    ]);

    // Visitas do periodo: agora vem do historico (client_visits), uma linha
    // por check-in. Antes eram derivadas de clients.visited_at, que so guarda
    // a ULTIMA visita — revisita do mesmo lead sumia do relatorio.
    // A tabela pode nao existir ainda (migration 20260727): degrada pra [].
    let visitRows: any[] = [];
    try {
      visitRows = await fetchAll(
        db, 'client_visits',
        'id, client_id, visited_at, visited_at_lat, visited_at_lon, distance_m, visited_by, visited_by_name, visited_by_email, etapa_anterior',
        (q) => inPeriod(q, 'visited_at'),
      );
    } catch (e) {
      console.warn('client_visits indisponivel, caindo pro fallback:', (e as Error).message);
    }
    step = 'atividades-ok';

    // 5) Conjunto de leads relevantes = criados/visitados no periodo + os
    //    referenciados por qualquer atividade do periodo. Assim a IA tem o
    //    snapshot completo do lead de cada evento.
    const leadIds = new Set<string>();
    for (const r of createdLeads) leadIds.add(r.id);
    for (const r of visitedLeads) leadIds.add(r.id);
    for (const m of meetings) if (m.client_id) leadIds.add(m.client_id);
    for (const s of stageChanges) if (s.client_id) leadIds.add(s.client_id);
    for (const n of notes) if (n.client_id) leadIds.add(n.client_id);
    for (const t of tasks) if (t.client_id) leadIds.add(t.client_id);
    for (const v of visitRows) if (v.client_id) leadIds.add(v.client_id);

    // 6) Snapshot completo dos leads relevantes (em lotes de ids).
    //    Lotes de 100: o filtro .in() vira query string na URL (~37 bytes por
    //    uuid); lotes grandes chegam perto do limite de URI do proxy.
    step = 'snapshot-leads';
    const idList = [...leadIds];
    const leads: any[] = [];
    const LEAD_COLS = 'id, nome, empresa, email, telefone, endereco, numero, bairro, cep, cidade, estado, latitude, longitude, status, etapa, origem, observacoes, id_hubspot, url_hubspot, vendedor_id_hubspot, created_by, visited_by, visited_at, visit_count, won_at, geo_source, geo_approximate, created_at, updated_at';
    const CHUNK = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < idList.length; i += CHUNK) chunks.push(idList.slice(i, i + CHUNK));
    // visit_count so existe depois da migration 20260727. Se a coluna nao
    // estiver la, o PostgREST rejeita o select inteiro (42703) — nesse caso
    // repete o lote sem ela em vez de derrubar a exportacao toda.
    const LEAD_COLS_LEGACY = LEAD_COLS.replace(', visit_count', '');
    const snapshots = await Promise.all(chunks.map(async (chunk, ci) => {
      const { data, error } = await db.from('clients').select(LEAD_COLS).in('id', chunk);
      if (!error) return data ?? [];
      if (error.code === '42703' || /visit_count/.test(error.message ?? '')) {
        const retry = await db.from('clients').select(LEAD_COLS_LEGACY).in('id', chunk);
        if (retry.error) throw new Error(`clients-snapshot[lote ${ci}]: ${retry.error.message}`);
        return retry.data ?? [];
      }
      throw new Error(`clients-snapshot[lote ${ci}]: ${error.message}`);
    }));
    for (const batch of snapshots) for (const c of batch) leads.push(c);
    // Enriquecer lead com nome do vendedor responsavel.
    for (const c of leads) {
      c.vendedor_nome = vendedorByHid(c.vendedor_id_hubspot);
      c.criado_por_nome = vendedorByUid(c.created_by);
      c.visitado_por_nome = vendedorByUid(c.visited_by);
    }

    // Mapa rapido id->lead pra anexar nome do cliente em cada atividade.
    const leadById = new Map<string, any>(leads.map((c) => [c.id, c]));
    const clientName = (id: string | null) => {
      const c = id ? leadById.get(id) : null;
      return c ? (c.empresa?.trim() || c.nome?.trim() || 'Sem nome') : null;
    };
    const clientHid = (id: string | null) => (id ? (leadById.get(id)?.vendedor_id_hubspot ?? null) : null);

    // 7) Monta os arrays de atividade enriquecidos.
    step = 'montagem';
    const reunioes = meetings.filter((m) => m.type !== 'follow_up').map((m) => ({
      ...m, cliente: clientName(m.client_id),
      vendedor: vendedorByUid(m.created_by) ?? vendedorByHid(clientHid(m.client_id)),
    }));
    const followups = meetings.filter((m) => m.type === 'follow_up').map((m) => ({
      ...m, cliente: clientName(m.client_id),
      vendedor: vendedorByUid(m.created_by) ?? vendedorByHid(clientHid(m.client_id)),
    }));
    const mudancasEtapa = stageChanges.map((s) => ({
      ...s, cliente: clientName(s.client_id),
      vendedor: s.created_by_name ?? vendedorByUid(s.created_by) ?? vendedorByHid(clientHid(s.client_id)),
    }));
    const notasOut = notes.map((n) => ({
      ...n, cliente: clientName(n.client_id),
      vendedor: n.created_by_name ?? vendedorByUid(n.created_by) ?? vendedorByHid(clientHid(n.client_id)),
    }));
    const tarefasOut = tasks.map((t) => ({
      ...t, cliente: clientName(t.client_id),
      vendedor: vendedorByHid(t.vendedor_id_hubspot),
      resolvido_por_nome: vendedorByUid(t.resolved_by),
    }));
    // Visitas: uma linha por check-in do historico (client_visits). Um mesmo
    // lead visitado 3x no periodo aparece 3 vezes, com visita_numero 1..3.
    // Fallback: se client_visits ainda nao existe, deriva de clients.visited_at
    // (comportamento antigo — 1 visita por lead).
    const visitSeq = new Map<string, number>();
    const visitasHistorico = [...visitRows]
      .sort((a, b) => String(a.visited_at).localeCompare(String(b.visited_at)))
      .map((v) => {
        const c = leadById.get(v.client_id);
        const n = (visitSeq.get(v.client_id) ?? 0) + 1;
        visitSeq.set(v.client_id, n);
        return {
          id: v.id,
          client_id: v.client_id,
          cliente: clientName(v.client_id),
          visited_at: v.visited_at,
          // Sequencia DENTRO do periodo exportado. O total historico do lead
          // esta em leads[].visit_count.
          visita_numero_no_periodo: n,
          vendedor: v.visited_by_name ?? vendedorByUid(v.visited_by) ?? vendedorByHid(clientHid(v.client_id)),
          distancia_m: v.distance_m,
          etapa_anterior: v.etapa_anterior,
          latitude: v.visited_at_lat, longitude: v.visited_at_lon,
          cidade: c?.cidade ?? null, estado: c?.estado ?? null,
          etapa: c?.etapa ?? null, status: c?.status ?? null,
        };
      });

    const visitasFallback = leads
      .filter((c) => c.visited_at && c.visited_at >= start && c.visited_at <= end)
      .map((c) => ({
        client_id: c.id, cliente: c.empresa?.trim() || c.nome?.trim() || 'Sem nome',
        visited_at: c.visited_at, vendedor: vendedorByUid(c.visited_by) ?? vendedorByHid(c.vendedor_id_hubspot),
        cidade: c.cidade, estado: c.estado, etapa: c.etapa, status: c.status,
      }));

    const visitas = visitRows.length > 0 ? visitasHistorico : visitasFallback;

    // Ranking de leads mais visitados no periodo — o gestor ve rapido quem
    // esta consumindo varias idas sem avancar de etapa.
    const revisitas = [...visitSeq.entries()]
      .filter(([, n]) => n > 1)
      .map(([cid, n]) => ({
        client_id: cid,
        cliente: clientName(cid),
        visitas_no_periodo: n,
        visitas_total: leadById.get(cid)?.visit_count ?? null,
        etapa: leadById.get(cid)?.etapa ?? null,
        vendedor: vendedorByHid(clientHid(cid)),
      }))
      .sort((a, b) => b.visitas_no_periodo - a.visitas_no_periodo);

    // 8) Objeto final.
    const payload = {
      meta: {
        gerado_em: new Date().toISOString(),
        periodo: { start, end, label },
        gerado_por: email,
        contagens: {
          leads: leads.length,
          tarefas: tarefasOut.length,
          visitas: visitas.length,
          // Leads distintos visitados — difere de `visitas` quando ha revisita.
          leads_visitados: visitRows.length > 0 ? visitSeq.size : visitasFallback.length,
          leads_revisitados: revisitas.length,
          reunioes: reunioes.length,
          follow_ups: followups.length,
          mudancas_etapa: mudancasEtapa.length,
          notas: notasOut.length,
          vendedores: (profs ?? []).length,
        },
      },
      vendedores: (profs ?? []).map((p) => ({
        id_hubspot: p.id_hubspot, nome: p.full_name, email: p.email, setor: p.sector, role: p.role,
      })),
      leads,
      tarefas: tarefasOut,
      visitas,
      revisitas,
      reunioes,
      follow_ups: followups,
      mudancas_etapa: mudancasEtapa,
      notas: notasOut,
    };

    // 9) Sobe o JSON e gera signed URL (7 dias).
    step = 'upload';
    const jsonStr = JSON.stringify(payload, null, 2);
    const path = `export_tudo_${label}_${Date.now()}.json`;
    const { error: upErr } = await db.storage
      .from('exports')
      .upload(path, new Blob([jsonStr], { type: 'application/json' }), {
        contentType: 'application/json; charset=utf-8', upsert: true,
      });
    if (upErr) return json(500, { error: 'Falha ao subir o arquivo', detail: upErr.message });

    step = 'signed-url';
    const { data: signed, error: signErr } = await db.storage.from('exports').createSignedUrl(path, 7 * 24 * 3600);
    if (signErr || !signed) return json(500, { error: 'Falha ao gerar link', detail: signErr?.message });

    return json(200, {
      ok: true,
      url: signed.signedUrl,
      filename: path,
      rows: payload.meta.contagens,
      period: { start, end, label },
    });
  } catch (err) {
    const e = err as Error;
    // Loga no dashboard (Functions > Logs) com a etapa em que quebrou.
    console.error(`export-report FALHOU na etapa "${step}" (periodo ${label}):`, e.message, e.stack);
    return json(500, { error: 'Falha ao montar a exportacao', detail: `[etapa: ${step}] ${e.message}` });
  }
});
