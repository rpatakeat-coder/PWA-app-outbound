// Supabase Edge Function: resumo-semanal
//
// Transforma os numeros da semana em PROSA. So' isso.
//
// A REGRA QUE ORGANIZA TUDO AQUI (06-IA-E-AUTOMACOES.md):
//   "Numero vem do banco. IA escreve texto. Nunca o contrario."
// O prompt manda explicitamente nao inventar dado, e a resposta e' texto puro —
// nao ha' um so' numero nesta funcao que venha do modelo.
//
// POR QUE OS NUMEROS CHEGAM DO CLIENTE E NAO SAO RECALCULADOS AQUI
// Foi decisao consciente, e vale explicar porque parece errado a' primeira
// vista. Recalcular no servidor significaria manter DUAS implementacoes da
// mesma conta de semana (uma em gestao/src/dados/semana.ts, outra em Deno) —
// e a divergencia entre copias da mesma regra e' o bug que mais apareceu neste
// projeto. Pior: o texto passaria a descrever numeros que a tela nao mostra, e
// o gestor leria uma leitura que nao bate com o painel na frente dele.
//
// Recebendo do cliente, o texto descreve EXATAMENTE o que esta' na tela. O
// risco e' um gestor autenticado mandar numeros falsos pra si mesmo — o que
// nao e' ameaca que justifique a duplicacao. Os numeros recebidos ficam
// gravados em `resumos_ia.numeros` pra auditoria.
//
// FAIL-CLOSED (principio 6 do doc): sem ANTHROPIC_API_KEY a funcao se RECUSA a
// operar e diz isso. Ela nunca degrada pra texto generico — texto plausivel sem
// IA e' exatamente o tipo de mentira silenciosa que o doc manda evitar.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy resumo-semanal
//
// Depende da migration 20260814_resumos_ia.sql.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Identificador do modelo.
//
// LEIA ANTES DE TROCAR. O doc registra um incidente em que alguem colocou uma
// string de modelo invalida: as chamadas passaram a falhar em silencio, o
// resumo reciclou o texto da semana anterior e ninguem percebeu por 4 dias.
// Ironia util: a string daquele incidente era "claude-sonnet-5", que HOJE e'
// valida — o que mostra que a licao nao e' "evite esse nome", e' "confira o
// identificador contra a documentacao vigente e falhe alto quando ele quebrar".
// Por isso um 4xx aqui NAO tem retry e vira linha de falha visivel na tela.
const MODELO = 'claude-sonnet-5';
const MAX_TOKENS = 1200;
const TIMEOUT_MS = 45_000;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cliente da Claude com o padrao de robustez do doc.
 *
 *  429 (rate limit), 529 (overloaded) e 5xx merecem retry — sao transitorios.
 *  4xx falha DIRETO: modelo invalido ou chave errada nao melhoram repetindo, e
 *  insistir so' atrasa a hora em que o erro aparece pra quem pode consertar. */
async function chamarClaude(
  apiKey: string,
  prompt: string,
  tentativa = 1,
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if ((res.status === 429 || res.status === 529 || res.status >= 500) && tentativa <= 4) {
      clearTimeout(timer);
      await sleep(1500 * tentativa);
      return chamarClaude(apiKey, prompt, tentativa + 1);
    }

    const corpo = await res.json().catch(() => null);

    if (!res.ok) {
      const detalhe = corpo?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, erro: `API da Anthropic recusou (${res.status}): ${detalhe}` };
    }

    // Resposta sem bloco de texto tambem e' falha — o doc pede retry aqui,
    // porque acontece e degradar pra string vazia produziria um card em branco
    // que parece "a semana foi tranquila".
    const texto = (corpo?.content ?? [])
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    if (!texto) {
      if (tentativa <= 2) {
        clearTimeout(timer);
        await sleep(1000);
        return chamarClaude(apiKey, prompt, tentativa + 1);
      }
      return { ok: false, erro: 'A resposta voltou sem bloco de texto.' };
    }

    return { ok: true, texto };
  } catch (err) {
    const e = err instanceof Error ? err.message : String(err);
    return { ok: false, erro: e.includes('abort') ? `Tempo esgotado (${TIMEOUT_MS / 1000}s).` : e };
  } finally {
    clearTimeout(timer);
  }
}

function montarPrompt(n: any): string {
  const linha = (m: any) =>
    `- ${m.rotulo}: ${m.delta.atual} nesta semana, ${m.delta.anterior} na anterior ` +
    `(${m.delta.diferenca >= 0 ? '+' : ''}${m.delta.diferenca})`;

  const pessoas = (n.linhas ?? [])
    .map(
      (l: any) =>
        `- ${l.nome}: ${l.visitas.atual} visitas (era ${l.visitas.anterior}), ` +
        `${l.avancos.atual} avancos (era ${l.avancos.anterior}), ` +
        `${l.ganhos.atual} fechamentos (era ${l.ganhos.anterior})`,
    )
    .join('\n');

  return `Voce e' o analista comercial de uma equipe de vendas de RUA (visita presencial a
restaurantes). Escreva a leitura da semana para o GESTOR do time.

JANELA: ${n.janela.inicio} a ${n.janela.fim}
SEMANA ANTERIOR: ${n.janelaAnterior.inicio} a ${n.janelaAnterior.fim}
${n.comparacaoCompleta ? '' : `ATENCAO: a semana corrente tem apenas ${n.diasDecorridos} de 5 dias uteis decorridos. A anterior tem 5 completos. NAO conclua que houve queda so' porque os numeros estao menores — diga explicitamente que a comparacao ainda esta' incompleta.`}

NUMEROS DO TIME:
${(n.metricas ?? []).map(linha).join('\n')}

POR PESSOA:
${pessoas || '(sem executivos ativos)'}

REGRAS DE ESCRITA — siga todas:
1. Baseie-se SO' nos numeros acima. NAO invente nenhum dado que nao foi dado.
   Se algo nao da' pra afirmar com esses numeros, diga que nao da'.
2. Nao repita a lista de numeros. O gestor ja' os ve' na tela. Escreva o que
   eles SIGNIFICAM juntos.
3. Portugues do Brasil, direto, sem jargao corporativo e sem entusiasmo
   artificial. Nada de "excelente performance" ou "vamos juntos".
4. Formato exato:
   - Um paragrafo de 3 a 5 frases com a leitura geral.
   - Depois, a linha "COMO AGIR:" e 3 acoes numeradas, cada uma comecando por
     um verbo e citando a pessoa ou a metrica que a justifica.
5. Se houver alguem caindo em mais de uma frente, cite pelo nome — o gestor
   precisa saber com quem falar. Elogie por nome tambem quando o numero mandar.
6. Nao use markdown, asteriscos nem cabecalhos. Texto corrido.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  // Fail-closed. Sem chave a funcao para aqui e diz o porque — nunca inventa
  // um texto generico pra "nao quebrar a tela".
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json(503, {
      error: 'ANTHROPIC_API_KEY não configurada. Rode: supabase secrets set ANTHROPIC_API_KEY=…',
      configuravel: true,
    });
  }

  const credencial = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!credencial) return json(401, { error: 'Sem credencial' });

  const svc = serviceClient();
  const { data: userData, error: erroUser } = await svc.auth.getUser(credencial);
  if (erroUser || !userData?.user) return json(401, { error: 'Credencial inválida' });

  const { data: perfil } = await svc
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (perfil?.role !== 'gestor') return json(403, { error: 'Só gestor gera a leitura da semana' });

  const numeros = await req.json().catch(() => null);
  if (!numeros?.janela?.inicio || !Array.isArray(numeros?.metricas)) {
    return json(400, { error: 'Corpo inválido: esperava { janela, janelaAnterior, metricas, linhas }' });
  }

  const r = await chamarClaude(apiKey, montarPrompt(numeros));

  // Sucesso e falha viram linha na MESMA tabela. E' o que impede o sistema de
  // seguir exibindo texto velho como se fosse novo.
  const registro = {
    tipo: 'semanal',
    janela_inicio: numeros.janela.inicio,
    janela_fim: numeros.janela.fim,
    texto: r.ok ? r.texto : null,
    numeros,
    modelo: MODELO,
    falha: r.ok ? null : r.erro,
    gerado_por: userData.user.id,
  };

  const { error: erroGravar } = await svc.from('resumos_ia').insert(registro);
  if (erroGravar) {
    return json(500, {
      error: `Gerei o texto mas não consegui gravar: ${erroGravar.message}`,
      texto: r.ok ? r.texto : null,
    });
  }

  if (!r.ok) return json(502, { error: r.erro, modelo: MODELO });
  return json(200, { texto: r.texto, modelo: MODELO, gerado_em: new Date().toISOString() });
});
