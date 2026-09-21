// Supabase Edge Function: documentacao-chat
//
// O chat da aba Documentação do cockpit. O gestor pergunta "por que o vendedor
// nao ve esse lead?" e recebe resposta ancorada NA DOCUMENTACAO e na
// CONFIGURACAO ATUAL do banco — nao no que o modelo acha que sabe.
//
// Deploy:
//   supabase functions deploy documentacao-chat
//
// Secret: reaproveita a OPENAI_API_KEY que `resumo-semanal` e `transcrever-1a1`
// ja' usam. Nao precisa configurar nada novo.
//
// ---------------------------------------------------------------------------
// TRES DECISOES QUE VALEM MAIS QUE O CODIGO
// ---------------------------------------------------------------------------
//
// 1. SO' GESTOR, CONFERIDO NO SERVIDOR. A aba ja' e' gestor-only no cockpit,
//    mas isso e' tela — qualquer pessoa logada poderia chamar a rota direto. O
//    portao e' o mesmo da `resumo-semanal`: le' o JWT, busca o perfil com a
//    service role e exige `role = 'gestor'`.
//
// 2. NENHUM DADO DE CLIENTE SAI DAQUI. O contexto que vai pro modelo e' a
//    documentacao (texto publico do repositorio) mais a CONFIGURACAO agregada:
//    quais status existem, que setor ve' o que, prazos por etapa, contagens.
//    Nome, telefone, endereco e e-mail de lead nunca entram — a pergunta e'
//    "como o sistema funciona", e pra isso a configuracao basta. Mandar a base
//    pra um provedor externo seria pagar um preco que a pergunta nao pede.
//
// 3. RESPONDER "NAO SEI" E' RESPOSTA VALIDA, e o prompt insiste nisso. Um chat
//    de documentacao que inventa e' pior que nenhum: a pessoa confia, age, e
//    descobre depois. O modelo e' instruido a dizer quando a documentacao nao
//    cobre, em vez de preencher a lacuna com o que ele imagina.
//
// FAIL-CLOSED: sem OPENAI_API_KEY a funcao se RECUSA e diz o porque, em vez de
// devolver um texto generico que passaria por resposta.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODELO = Deno.env.get('OPENAI_MODEL')?.trim() || 'gpt-4o';
const TIMEOUT_MS = 45_000;

/** Teto do que a tela pode mandar como contexto. A documentacao inteira tem
 *  ~20 mil caracteres; o dobro disso e' folga pra ela crescer e ainda barra
 *  alguem mandando um livro pela rota. */
const TETO_CONTEXTO = 60_000;
const TETO_PERGUNTA = 2_000;
/** Quantas trocas anteriores entram. Conversa de documentacao nao precisa de
 *  memoria longa, e cada turno reenviado custa. */
const TETO_HISTORICO = 8;

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

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

function montarSistema(documentacao: string, configuracao: string): string {
  return `Voce responde perguntas sobre o funcionamento do sistema Takeat Outbound
para o GESTOR comercial, dentro do proprio painel de gestao.

Voce recebe DUAS fontes, e so' elas:

=== DOCUMENTACAO (como o sistema funciona) ===
${documentacao}

=== CONFIGURACAO ATUAL DO BANCO (lida agora) ===
${configuracao}

REGRAS DA RESPOSTA

1. Responda SOMENTE com o que esta' nas duas fontes acima. Se a resposta nao
   estiver la', diga exatamente isso: que a documentacao nao cobre esse ponto, e
   sugira onde olhar (qual aba do cockpit, ou quem perguntar). NUNCA complete a
   lacuna com suposicao — quem le' vai agir achando que e' fato.

2. Quando a DOCUMENTACAO e a CONFIGURACAO discordarem, a CONFIGURACAO vence, e
   voce AVISA que discordam. Exemplo: se o texto diz que so' dois setores veem
   "lead" e a configuracao mostra tres, responda com os tres e diga que o texto
   esta' desatualizado. Essa divergencia e' informacao valiosa, nao detalhe.

3. Numero so' sai daqui se estiver na configuracao. Nao estime, nao arredonde
   "mais ou menos", nao diga "cerca de". Nao tem o numero? Diga que nao tem e
   diga em que aba do cockpit ele aparece.

4. Voce NAO tem acesso a dados de cliente — nem nome, nem telefone, nem
   endereco, nem a lista de leads. Perguntaram sobre um cliente especifico?
   Explique que este chat fala de FUNCIONAMENTO, e aponte a aba que mostra
   aquele dado.

5. Portugues do Brasil, direto, sem enrolar. Responda a pergunta na primeira
   frase e so' depois explique. Nada de markdown, asterisco ou cabecalho: texto
   corrido e paragrafo curto.

6. Quem le' e' gestor comercial, nao programador. Prefira "o app carrega so' a
   area visivel do mapa" a citar nome de funcao ou de arquivo. Cite o nome
   tecnico so' quando ele mesmo for a resposta (o nome de uma tabela que ele vai
   procurar, por exemplo).`;
}

type Turno = { papel: 'usuario' | 'assistente'; texto: string };

async function chamarModelo(
  apiKey: string,
  sistema: string,
  historico: Turno[],
  pergunta: string,
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        // Baixa de proposito: documentacao pede resposta reproduzivel, nao
        // criativa. A mesma pergunta duas vezes tem que dar a mesma resposta.
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: 'system', content: sistema },
          ...historico.map((t) => ({
            role: t.papel === 'usuario' ? 'user' : 'assistant',
            content: t.texto,
          })),
          { role: 'user', content: pergunta },
        ],
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => '');
      return { ok: false, erro: `OpenAI respondeu ${res.status}: ${corpo.slice(0, 300)}` };
    }
    const body = await res.json();
    const texto = body?.choices?.[0]?.message?.content?.trim();
    if (!texto) return { ok: false, erro: 'OpenAI devolveu resposta vazia' };
    return { ok: true, texto };
  } catch (err) {
    const e = err as Error;
    return {
      ok: false,
      erro: e?.name === 'AbortError' ? 'A resposta demorou demais (45s)' : String(e?.message ?? e),
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
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
  const { data: userData, error: erroUser } = await svc.auth.getUser(credencial);
  if (erroUser || !userData?.user) return json(401, { error: 'Credencial inválida' });

  const { data: perfil } = await svc
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  // A aba ja' e' gestor-only, mas a ROTA nao sabe disso. Sem esta linha,
  // qualquer pessoa logada no app de campo chamaria o chat direto.
  if (perfil?.role !== 'gestor') {
    return json(403, { error: 'Este chat é do painel de gestão' });
  }

  const corpo = await req.json().catch(() => null);
  const pergunta = String(corpo?.pergunta ?? '').trim();
  const documentacao = String(corpo?.documentacao ?? '').trim();
  const configuracao = String(corpo?.configuracao ?? '').trim();

  if (!pergunta) return json(400, { error: 'Faltou a pergunta' });
  if (pergunta.length > TETO_PERGUNTA) {
    return json(400, { error: `Pergunta longa demais (máximo ${TETO_PERGUNTA} caracteres)` });
  }
  if (!documentacao) return json(400, { error: 'Faltou o texto da documentação' });
  if (documentacao.length + configuracao.length > TETO_CONTEXTO) {
    return json(400, { error: 'Contexto grande demais' });
  }

  const historico: Turno[] = Array.isArray(corpo?.historico)
    ? corpo.historico
        .filter(
          (t: unknown): t is Turno =>
            !!t &&
            typeof (t as Turno).texto === 'string' &&
            ((t as Turno).papel === 'usuario' || (t as Turno).papel === 'assistente'),
        )
        .slice(-TETO_HISTORICO)
        .map((t: Turno) => ({ papel: t.papel, texto: t.texto.slice(0, TETO_PERGUNTA) }))
    : [];

  const r = await chamarModelo(
    apiKey,
    montarSistema(documentacao, configuracao || '(configuração não lida)'),
    historico,
    pergunta,
  );

  if (!r.ok) return json(502, { error: r.erro, modelo: MODELO });
  return json(200, { texto: r.texto, modelo: MODELO, respondido_em: new Date().toISOString() });
});
