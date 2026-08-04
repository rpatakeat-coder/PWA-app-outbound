// Supabase Edge Function: export-agenda
// Exporta a AGENDA (rotas planejadas + reunioes/follow-ups) num unico JSON,
// no mesmo espirito do botao "Exportar TUDO" do gestor (export-report), mas:
//   - O CONTEUDO e' montado no APP (dados ja carregados na tela da agenda,
//     respeitando o filtro de vendedor). Aqui a gente so' valida, carimba o
//     autor/horario, sobe no bucket privado `exports` e devolve uma signed URL.
//   - Acesso: QUALQUER usuario autenticado (a agenda e' do proprio vendedor;
//     gestor exporta a agenda que estiver vendo). export-report continua
//     restrito a gestores — este endpoint nao expoe dados de outros: quem
//     chama so' envia o que ja' esta' na propria tela.
//
// Auth: exige o JWT do usuario (Authorization: Bearer <token>).
//
// Body JSON:
//   { "payload": { ...agenda montada no app... }, "label"?: "..." }
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Nome de arquivo seguro (so' [a-z0-9_-], minusculo). Evita path traversal e
// caracteres que o Storage rejeita.
const slug = (s: string) =>
  (s || 'agenda').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'agenda';

// Teto de tamanho: a agenda e' pequena (dezenas de itens). 5 MB e' folga larga
// e barra abuso de subir payload gigante pro bucket.
const MAX_BYTES = 5 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRole || !anonKey) return json(500, { error: 'Supabase env vars ausentes' });

  // 1) Auth: valida o JWT. Qualquer usuario autenticado pode exportar a
  //    propria agenda (o conteudo vem da tela dele).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Sem token de autenticacao' });
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Token invalido' });
  const user = userData.user;
  const email = (user.email ?? '').toLowerCase();

  // 2) Body.
  let body: { payload?: unknown; label?: string } = {};
  try { body = await req.json(); } catch { return json(400, { error: 'Body JSON invalido' }); }
  const payload = body.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json(400, { error: 'Campo "payload" (objeto) obrigatorio' });
  }

  // 3) Carimba autor/horario no meta (fonte da verdade = servidor, nao o app).
  const meta = (payload as Record<string, unknown>).meta;
  const metaObj = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta as Record<string, unknown> : {};
  const finalPayload = {
    ...(payload as Record<string, unknown>),
    meta: {
      ...metaObj,
      tipo: 'agenda',
      gerado_por: email,
      gerado_por_uid: user.id,
      gerado_em: new Date().toISOString(),
    },
  };

  const jsonStr = JSON.stringify(finalPayload, null, 2);
  const bytes = new TextEncoder().encode(jsonStr);
  if (bytes.length > MAX_BYTES) return json(413, { error: 'Agenda grande demais para exportar' });

  // 4) Sobe no bucket privado `exports` e gera signed URL (7 dias) — mesmo
  //    bucket/UX do export-report do gestor.
  const db = createClient(supabaseUrl, serviceRole);
  const label = slug(body.label ?? 'agenda');
  const path = `agenda_${label}_${user.id}_${Date.now()}.json`;

  const { error: upErr } = await db.storage
    .from('exports')
    .upload(path, new Blob([bytes], { type: 'application/json' }), {
      contentType: 'application/json; charset=utf-8', upsert: true,
    });
  if (upErr) return json(500, { error: 'Falha ao subir o arquivo', detail: upErr.message });

  const { data: signed, error: signErr } = await db.storage.from('exports').createSignedUrl(path, 7 * 24 * 3600);
  if (signErr || !signed) return json(500, { error: 'Falha ao gerar link', detail: signErr?.message });

  return json(200, {
    ok: true,
    url: signed.signedUrl,
    filename: path,
    counts: (metaObj.contagens ?? null),
  });
});
