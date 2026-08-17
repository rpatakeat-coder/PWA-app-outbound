// Supabase Edge Function: transcrever-1a1
//
// Pega o audio de um registro de 1:1 no bucket privado, manda pra transcricao
// da OpenAI e grava o texto de volta na linha.
//
// FAIL-CLOSED, igual a' resumo-semanal: sem OPENAI_API_KEY a funcao se recusa a
// operar e diz isso. Nunca devolve texto generico nem deixa a linha com
// transcricao vazia parecendo "a conversa nao teve conteudo".
//
// O AUDIO NAO PASSA PELO NAVEGADOR DE NOVO
// O arquivo ja' esta' no storage; quem baixa aqui e' o service role. Se o
// cliente reenviasse os bytes, uma conversa de 40 minutos subiria duas vezes na
// rede do gestor — e o arquivo ja' e' privado justamente pra nao circular.
//
// Deploy:
//   supabase functions deploy transcrever-1a1
// Depende de: migration 20260814_um_a_um_audio.sql e do secret OPENAI_API_KEY
// (o mesmo que a resumo-semanal ja' usa).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions';
const BUCKET = 'um-a-um';

// Modelo por secret, mesma razao da resumo-semanal: trocar sem redeployar.
const MODELO = Deno.env.get('OPENAI_MODELO_AUDIO')?.trim() || 'whisper-1';

// Teto da API de transcricao da OpenAI. Checamos ANTES de subir 25 MB pra
// receber um 413 — assim o gestor recebe uma instrucao util em vez de um erro
// de infraestrutura.
const LIMITE_BYTES = 25 * 1024 * 1024;

// Transcrever 40 minutos leva bem mais que uma chamada de texto.
const TIMEOUT_MS = 240_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json(503, {
      error: 'OPENAI_API_KEY não configurada. Rode: supabase secrets set OPENAI_API_KEY=sk-…',
      configuravel: true,
    });
  }

  const credencial = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!credencial) return json(401, { error: 'Sem credencial' });

  const svc = serviceClient();
  const ehServiceRole = credencial === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!ehServiceRole) {
    const { data: userData, error: erroUser } = await svc.auth.getUser(credencial);
    if (erroUser || !userData?.user) return json(401, { error: 'Credencial inválida' });
    const { data: perfil } = await svc
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    // Gravação de 1:1 é conversa entre gestor e subordinado: só gestor lê.
    if (perfil?.role !== 'gestor') return json(403, { error: 'Só gestor transcreve 1:1' });
  }

  const corpo = await req.json().catch(() => null);
  const registroId = corpo?.registroId;
  if (!registroId) return json(400, { error: 'Corpo inválido: esperava { registroId }' });

  const { data: registro, error: erroLer } = await svc
    .from('um_a_um')
    .select('id, audio_caminho, audio_tipo, audio_bytes')
    .eq('id', registroId)
    .maybeSingle();

  if (erroLer) return json(500, { error: `Não consegui ler o registro: ${erroLer.message}` });
  if (!registro) return json(404, { error: 'Registro de 1:1 não encontrado' });
  if (!registro.audio_caminho) return json(400, { error: 'Este 1:1 não tem áudio anexado' });

  if (registro.audio_bytes && registro.audio_bytes > LIMITE_BYTES) {
    const mb = (registro.audio_bytes / 1024 / 1024).toFixed(1);
    const erro =
      `O áudio tem ${mb} MB e o limite da transcrição é 25 MB. ` +
      `Grave pelo próprio cockpit (ele já comprime) ou converta o arquivo para ` +
      `um formato mais leve antes de subir.`;
    await svc.from('um_a_um').update({ transcricao_erro: erro }).eq('id', registroId);
    return json(413, { error: erro });
  }

  // --- baixa do bucket privado ---------------------------------------------
  const { data: arquivo, error: erroBaixar } = await svc.storage
    .from(BUCKET)
    .download(registro.audio_caminho);

  if (erroBaixar || !arquivo) {
    const erro = `Não consegui baixar o áudio: ${erroBaixar?.message ?? 'arquivo ausente'}`;
    await svc.from('um_a_um').update({ transcricao_erro: erro }).eq('id', registroId);
    return json(500, { error: erro });
  }

  // --- transcreve -----------------------------------------------------------
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // O nome do arquivo importa: a API decide o parser pela extensao, e um
    // 'blob' sem extensao e' recusado.
    const tipo = registro.audio_tipo || 'audio/webm';
    const ext = tipo.includes('mp4') || tipo.includes('m4a')
      ? 'm4a'
      : tipo.includes('mpeg') || tipo.includes('mp3')
        ? 'mp3'
        : tipo.includes('wav')
          ? 'wav'
          : 'webm';

    const form = new FormData();
    form.append('file', arquivo, `1a1.${ext}`);
    form.append('model', MODELO);
    // Dizer o idioma melhora a precisao e evita que nome proprio brasileiro
    // seja interpretado como outra lingua.
    form.append('language', 'pt');
    form.append('response_format', 'json');

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: ctrl.signal,
    });

    const resposta = await res.json().catch(() => null);

    if (!res.ok) {
      const erro = `A OpenAI recusou (${res.status}): ${resposta?.error?.message ?? 'sem detalhe'}`;
      await svc.from('um_a_um').update({ transcricao_erro: erro }).eq('id', registroId);
      return json(502, { error: erro, modelo: MODELO });
    }

    const texto = (resposta?.text ?? '').trim();
    if (!texto) {
      // Audio mudo ou ruido puro. Isso e' informacao, nao erro de sistema — e a
      // tela precisa dizer QUAL dos dois foi.
      const erro = 'A transcrição voltou vazia: o áudio pode estar mudo ou sem fala audível.';
      await svc.from('um_a_um').update({ transcricao_erro: erro }).eq('id', registroId);
      return json(422, { error: erro });
    }

    const { error: erroGravar } = await svc
      .from('um_a_um')
      .update({ transcricao: texto, transcricao_erro: null, transcrito_em: new Date().toISOString() })
      .eq('id', registroId);

    if (erroGravar) {
      return json(500, { error: `Transcrevi mas não consegui gravar: ${erroGravar.message}`, texto });
    }

    return json(200, { texto, modelo: MODELO });
  } catch (err) {
    const e = err instanceof Error ? err.message : String(err);
    const erro = e.includes('abort')
      ? `Tempo esgotado (${TIMEOUT_MS / 1000}s). Áudio muito longo para uma tentativa só.`
      : e;
    await svc.from('um_a_um').update({ transcricao_erro: erro }).eq('id', registroId);
    return json(500, { error: erro });
  } finally {
    clearTimeout(timer);
  }
});
