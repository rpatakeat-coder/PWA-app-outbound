// Teste do roteamento de erro do sendHubspotEvent.
//
// Rode com:  npx tsx src/utils/hubspotSync.teste.ts
//
// O que este teste protege: quando a EDGE roda e o HubSpot recusa, o motivo
// real ("Property values were not valid", a lista do que faltou) tem que
// chegar na tela de quem esta' na rua — e o n8n NAO pode ser chamado, porque
// ele fala com o mesmo HubSpot, vai recusar igual, e no caminho o motivo se
// perde.
//
// Em 23/09/2026 uma vendedora tentou mover um negocio de Negociacao e leu
// "O HubSpot recusou: Webhook respondeu 500" — que e' o status do n8n, nao o
// motivo do HubSpot. A protecao escrita em 14/09/2026 existia, mas o `throw`
// dela estava DENTRO do proprio `try`, entao o `catch` logo abaixo o engolia
// e caia pro n8n assim mesmo.
import { supabase } from '../integrations/supabase/client';
import { ehFalhaDeTransporte, FalhaDeTransporte, sendHubspotEvent } from './hubspotSync';

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

// Erro no formato que o supabase-js entrega: FunctionsHttpError, com a
// Response crua em `context`. E' de la' que sai `{ error, detail }`.
const erroDaEdge = (status: number, corpo: unknown) => ({
  message: `Edge Function returned a non-2xx status code`,
  context: { status, json: async () => corpo },
});

let chamouN8n = 0;
const fetchFalso = (status: number) => {
  globalThis.fetch = (async () => {
    chamouN8n++;
    return { ok: status >= 200 && status < 300, status, json: async () => ({}) } as Response;
  }) as typeof fetch;
};

// `supabase.functions` e' um getter que devolve um FunctionsClient novo a cada
// acesso: atribuir `.invoke` nele grava num objeto descartavel e o cliente real
// continua valendo. Quem tem que ser trocado e' o PROTOTIPO.
const protoDasFunctions = Object.getPrototypeOf(supabase.functions) as { invoke: unknown };
const comEdge = (resposta: { data?: unknown; error?: unknown }) => {
  protoDasFunctions.invoke = async () => resposta;
};

const pegarErro = async (payload: Record<string, unknown>) => {
  try {
    await sendHubspotEvent(payload);
    return '(nao lancou)';
  } catch (e) {
    return (e as Error).message;
  }
};

const PAYLOAD = { type: 'change_stage', id_hubspot: '65183754892', stage_id: '1395880473' };

(async () => {
  console.log('--- a edge RODOU e o HubSpot recusou (502) ---');
  chamouN8n = 0;
  fetchFalso(500);
  comEdge({
    error: erroDaEdge(502, {
      error: 'HubSpot recusou a mudanca de etapa',
      detail: 'Property values were not valid: valor_mensal',
    }),
  });
  ok(
    'o motivo do HubSpot chega inteiro',
    await pegarErro(PAYLOAD),
    'HubSpot recusou a mudanca de etapa: Property values were not valid: valor_mensal',
  );
  ok('e o n8n nao foi chamado', chamouN8n, 0);

  console.log('\n--- erro sem corpo legivel (a edge caiu de verdade) ---');
  chamouN8n = 0;
  fetchFalso(500);
  comEdge({ error: { message: 'boom', context: { status: 500, json: async () => { throw new Error('x'); } } } });
  ok(
    'cai no texto generico, com o tipo',
    await pegarErro(PAYLOAD),
    'hubspot-sync falhou (change_stage): boom',
  );
  ok('e o n8n continua fora', chamouN8n, 0);

  console.log('\n--- a edge NAO existe (404) ou esta sem token (503) ---');
  for (const status of [404, 503]) {
    chamouN8n = 0;
    fetchFalso(200);
    comEdge({ error: erroDaEdge(status, { error: 'x' }) });
    ok(`${status}: cai pro n8n, que e' o fallback legitimo`, await pegarErro(PAYLOAD), '(nao lancou)');
    ok(`${status}: e o n8n foi chamado uma vez`, chamouN8n, 1);
  }

  console.log('\n--- a chamada nao saiu do aparelho (erro SEM status) ---');
  chamouN8n = 0;
  fetchFalso(200);
  comEdge({ error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } });
  ok('idempotente tenta o n8n, que e outro host', await pegarErro(PAYLOAD), '(nao lancou)');
  ok('n8n chamado', chamouN8n, 1);

  chamouN8n = 0;
  fetchFalso(500);
  comEdge({ error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } });
  ok(
    'e se o n8n tambem cair, o erro diz TRANSPORTE',
    await pegarErro(PAYLOAD),
    'n8n respondeu 500',
  );

  chamouN8n = 0;
  fetchFalso(200);
  comEdge({ error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } });
  ok(
    'nao idempotente nunca reexecuta',
    await pegarErro({ type: 'create_pin', nome: 'ZZ TESTE' }),
    'Failed to send a request to the Edge Function',
  );
  ok('e o n8n nao foi chamado', chamouN8n, 0);

  console.log('\n--- excecao do invoke (rede/timeout) ---');
  chamouN8n = 0;
  fetchFalso(200);
  protoDasFunctions.invoke = async () => {
    throw new Error('Failed to fetch');
  };
  ok('tipo idempotente ainda tenta o n8n', await pegarErro(PAYLOAD), '(nao lancou)');
  ok('n8n chamado', chamouN8n, 1);

  chamouN8n = 0;
  ok(
    'tipo NAO idempotente nunca reexecuta',
    await pegarErro({ type: 'create_pin', nome: 'ZZ TESTE' }),
    'Failed to fetch',
  );
  ok('e o n8n nao foi chamado', chamouN8n, 0);

  // A tela do ChangeStageModal escolhe a frase por aqui: recusa do HubSpot
  // pede "corrija o que falta"; transporte pede "confira a conexao". Trocar as
  // duas manda a pessoa procurar campo errado num formulario que estava certo.
  console.log('\n--- o que a tela chama de "falta conexao" ---');
  ok('5xx do n8n e transporte, nao recusa', ehFalhaDeTransporte(new FalhaDeTransporte('n8n respondeu 500')), true);
  ok('invoke que nem saiu do aparelho', ehFalhaDeTransporte(new Error('Failed to send a request to the Edge Function')), true);
  ok('fetch morto', ehFalhaDeTransporte(new Error('Failed to fetch')), true);
  ok('erro sem mensagem', ehFalhaDeTransporte(new Error('')), true);
  ok(
    'recusa do HubSpot NAO e transporte',
    ehFalhaDeTransporte(new Error('HubSpot recusou a mudanca de etapa: Property values were not valid')),
    false,
  );

  console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
