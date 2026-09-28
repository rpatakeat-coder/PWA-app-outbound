// Supabase Edge Function: clientes-sync (migration 0122)
//
// Os clientes da Takeat sempre sincronizados: a lista inteira (ativos, em risco e
// ex-clientes), a última comanda, o faturamento dos últimos meses e quem está em
// queda — para o executivo visitar. Substitui a hubspot-usage-sync, que estava parada
// desde 05/08 (agendamento sem credencial, propriedade desativada, etapas fixas erradas).
//
// Fonte: TODOS os negócios dos pipelines Onboarding e Sucesso do HubSpot, que o sistema
// da Takeat atualiza toda madrugada. Sem lista fechada de etapas: etapa nova entra como
// 'desconhecida' e a rodada avisa (clientes_takeat_rodadas.etapas_sem_classificacao).
//
// Chamada pelo pg_cron via public.invocar_clientes_sync (header x-cron-secret conferido
// por public.segredo_confere). verify_jwt DESLIGADO: quem chama é o banco, o segredo é
// a trava. Só LÊ do HubSpot; nada muda no CRM.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const HS = 'https://api.hubapi.com';
const PIPELINES = [
  { id: '87106112', nome: 'Onboarding' },
  { id: '87367429', nome: 'Sucesso' },
];

// Classificação decidida pelo Julyan (27/09/26). Onboarding inteiro é ativo.
const ETAPAS: Record<string, { rotulo: string; situacao: 'ativo' | 'em_risco' | 'ex' }> = {
  // Onboarding
  '162277290': { rotulo: 'Cliente Recebido', situacao: 'ativo' },
  '205372320': { rotulo: 'Setup', situacao: 'ativo' },
  '196627310': { rotulo: 'Ativação', situacao: 'ativo' },
  '175135768': { rotulo: 'Acompanhamento', situacao: 'ativo' },
  '162224696': { rotulo: 'Processo Pausado', situacao: 'ativo' },
  '1395758353': { rotulo: 'Risco (Onboarding)', situacao: 'ativo' },
  // Sucesso
  '171389297': { rotulo: 'Saudável', situacao: 'ativo' },
  '162508352': { rotulo: 'Risco', situacao: 'ativo' },
  '162579091': { rotulo: 'Engajamento', situacao: 'ativo' },
  '162579092': { rotulo: 'Integração', situacao: 'ativo' },
  '162579097': { rotulo: 'Em cancelamento', situacao: 'em_risco' },
  '1308818229': { rotulo: 'Pré-Cancelamento', situacao: 'em_risco' },
  '171389298': { rotulo: 'Comanda parada', situacao: 'em_risco' },
  '1122729590': { rotulo: 'Churn', situacao: 'ex' },
  '1154518702': { rotulo: 'Cancelado', situacao: 'ex' },
};

const PROPS = [
  'dealname', 'dealstage', 'pipeline', 'hubspot_owner_id', 'hs_lastmodifieddate',
  'data_ultima_comanda', 'data_ultima_comanda_takeat', 'data_ultima_comanda_integracoes',
  'numero_de_comandas_ate_o_momento_number',
  'faturamento_0_mes', 'faturamento_a', 'faturamento_b', 'faturamento_c', 'variacao_faturamento',
  'data_solicitacao_cancelamento', 'data_ultimo_caixa_fechado', 'data_ultima_cobranca_recebida',
  'cnpj_cpf', 'celular', 'logradouro', 'numero', 'bairro', 'cidade', 'estado', 'cep', 'latitude', 'longitude',
];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const txt = (v: unknown) => { const s = v == null ? '' : String(v).trim(); return s ? s : null; };
const num = (v: unknown) => { const s = txt(v); if (s == null) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const int = (v: unknown) => { const n = num(v); return n == null ? null : Math.trunc(n); };
// Data do HubSpot: 'AAAA-MM-DD' ou epoch em ms. Devolve 'AAAA-MM-DD' (o dia que o HubSpot mostra).
function dia(v: unknown): string | null {
  const s = txt(v); if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ms = /^-?\d+$/.test(s) ? Number(s) : Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}
function coord(v: unknown, lim: number): number | null {
  const n = num(v); return n != null && n !== 0 && Math.abs(n) <= lim ? n : null;
}

async function buscar(token: string, body: unknown) {
  for (let t = 0; t < 5; t++) {
    const r = await fetch(`${HS}/crm/v3/objects/deals/search`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) return await r.json();
    if (r.status === 429 || r.status >= 500) { await sleep(Math.min(2000 * 2 ** t, 30000)); continue; }
    throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error('HubSpot: limite de tentativas');
}

// ── CLIENTE SEM PINO GANHA PINO (27/09/26, Julyan: "pode seguir") ────────────────
// 246 clientes ativos não estavam no mapa: não dá para visitar o que não se vê. Cada
// rodada cria até PINOS_POR_RODADA pinos: coordenada do HubSpot se houver; senão o
// endereço no Google Geocoding (~R$ 0,03 cada, uma vez só). Sem endereço que o Google
// ache, fica sem pino e tenta de novo na rodada seguinte. O pino nasce 'cliente',
// ligado ao negócio (id_hubspot), dono = executivo do território (0125), criado pelo
// mesmo usuário RPA do webhook do HubSpot.
const PINOS_POR_RODADA = 80;
const USUARIO_RPA = 'be747e54-0ceb-45ee-bf1a-4398cdc9e6a0';

async function localizar(chave: string, c: Record<string, unknown>) {
  const endereco = [[c.numero, c.logradouro].filter(Boolean).join(' '), c.bairro, c.cidade, c.estado, c.cep, 'Brasil']
    .map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join(', ');
  if (!c.logradouro && !c.cep) return null;
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(endereco)}&region=br&language=pt-BR&key=${chave}`);
  const d = await r.json().catch(() => null);
  const hit = d?.status === 'OK' ? d.results?.[0] : null;
  const loc = hit?.geometry?.location;
  if (!loc || typeof loc.lat !== 'number') return null;
  const tipo = String(hit.geometry?.location_type ?? '');
  return { lat: loc.lat as number, lng: loc.lng as number, aproximado: !(tipo === 'ROOFTOP' || tipo === 'RANGE_INTERPOLATED') };
}

async function criarPinosQueFaltam(svc: ReturnType<typeof createClient>) {
  const chave = Deno.env.get('GOOGLE_GEOCODING_API_KEY') ?? '';
  const { data: faltam } = await svc.from('clientes_takeat')
    .select('deal_id, nome, cnpj, celular, logradouro, numero, bairro, cidade, estado, cep, latitude, longitude, executivo_owner_id')
    .is('client_id', null).in('situacao', ['ativo', 'em_risco']).limit(PINOS_POR_RODADA);
  let criados = 0, semEndereco = 0;
  for (const c of faltam ?? []) {
    // Já existe pino deste negócio (arquivado ou criado agora por outro caminho)? Não duplica.
    const { data: ja } = await svc.from('clients').select('id').eq('id_hubspot', c.deal_id).limit(1);
    if (ja && ja.length) continue;
    let geo = c.latitude != null && c.longitude != null ? { lat: c.latitude, lng: c.longitude, aproximado: true } : null;
    if (!geo && chave) geo = await localizar(chave, c);
    if (!geo) { semEndereco++; continue; }
    const nome = String(c.nome ?? '').trim() || 'Cliente Takeat';
    const { error } = await svc.from('clients').insert({
      nome, empresa: nome, status: 'cliente', origem: 'api', tags: ['clientes_sync'],
      id_hubspot: c.deal_id, telefone: c.celular, endereco: c.logradouro, numero: c.numero, bairro: c.bairro,
      cidade: c.cidade, estado: c.estado, cep: c.cep, latitude: geo.lat, longitude: geo.lng,
      geo_source: c.latitude != null ? 'hubspot' : 'google', geo_approximate: geo.aproximado,
      vendedor_id_hubspot: c.executivo_owner_id, created_by: USUARIO_RPA, updated_by: USUARIO_RPA,
    });
    if (error) { console.warn('[clientes-sync] pino', c.deal_id, error.message); continue; }
    criados++;
  }
  return { criados, semEndereco };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: ok } = await svc.rpc('segredo_confere', { p_nome: 'clientes_sync', p_valor: req.headers.get('x-cron-secret') ?? '' });
  if (ok !== true) return json(403, { error: 'segredo' });
  const token = Deno.env.get('HUBSPOT_TOKEN_USAGE') ?? Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return json(503, { error: 'sem HUBSPOT_TOKEN' });

  const inicio = Date.now();
  const linhas: Record<string, unknown>[] = [];
  const semClassificacao: Record<string, number> = {};
  let erro: string | null = null;
  try {
    for (const p of PIPELINES) {
      let after: string | undefined;
      for (let pagina = 0; pagina < 100; pagina++) {
        const res = await buscar(token, {
          filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: p.id }] }],
          properties: PROPS,
          sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
          limit: 100,
          ...(after ? { after } : {}),
        });
        for (const d of res.results ?? []) {
          const q = d.properties ?? {};
          const etapaId = String(q.dealstage ?? '');
          const cls = ETAPAS[etapaId];
          if (!cls) semClassificacao[etapaId] = (semClassificacao[etapaId] ?? 0) + 1;
          linhas.push({
            deal_id: String(d.id), nome: txt(q.dealname), pipeline: p.nome, etapa_id: etapaId,
            etapa: cls?.rotulo ?? etapaId, situacao: cls?.situacao ?? 'desconhecida',
            dono_cs_owner_id: txt(q.hubspot_owner_id),
            ultima_comanda: dia(q.data_ultima_comanda), ultima_comanda_takeat: dia(q.data_ultima_comanda_takeat),
            ultima_comanda_integracoes: dia(q.data_ultima_comanda_integracoes),
            comandas_total: int(q.numero_de_comandas_ate_o_momento_number),
            faturamento_mes0: num(q.faturamento_0_mes), faturamento_mes1: num(q.faturamento_a),
            faturamento_mes2: num(q.faturamento_b), faturamento_mes3: num(q.faturamento_c),
            variacao_bimestre: num(q.variacao_faturamento),
            cancelamento_pedido: dia(q.data_solicitacao_cancelamento), ultimo_caixa: dia(q.data_ultimo_caixa_fechado),
            ultima_cobranca: dia(q.data_ultima_cobranca_recebida),
            cnpj: txt(q.cnpj_cpf), celular: txt(q.celular), logradouro: txt(q.logradouro), numero: txt(q.numero),
            bairro: txt(q.bairro), cidade: txt(q.cidade), estado: txt(q.estado), cep: txt(q.cep),
            latitude: coord(q.latitude, 90), longitude: coord(q.longitude, 180),
            hs_modificado_em: txt(q.hs_lastmodifieddate),
          });
        }
        after = res.paging?.next?.after;
        if (!after) break;
        await sleep(350); // divide o limite da Search API com os outros fluxos do portal
      }
    }
  } catch (e) {
    erro = String((e as Error).message ?? e);
  }

  // Uma rodada que falhou no meio NÃO grava pela metade: a lista fica a de ontem, e a
  // rodada registra o erro. Melhor dado de ontem inteiro que dado de hoje pela metade.
  let pinos = 0;
  if (!erro) {
    const unicos = [...new Map(linhas.map((l) => [l.deal_id, l])).values()];
    for (let i = 0; i < unicos.length; i += 500) {
      const { data, error } = await svc.rpc('gravar_clientes_takeat', { p_rows: unicos.slice(i, i + 500) });
      if (error) { erro = `gravação do lote ${i / 500 + 1}: ${error.message}`; break; }
      pinos += Number(data ?? 0);
    }
  }
  // Pinos novos entram no mapa já nesta rodada; o vínculo client_id se acerta na próxima
  // gravação (a subconsulta por id_hubspot em gravar_clientes_takeat).
  let pinosNovos: { criados: number; semEndereco: number } | null = null;
  if (!erro) {
    try { pinosNovos = await criarPinosQueFaltam(svc); } catch (e) { console.warn('[clientes-sync] pinos novos', (e as Error).message); }
  }
  const porSituacao = linhas.reduce((a: Record<string, number>, l) => { const s = String(l.situacao); a[s] = (a[s] ?? 0) + 1; return a; }, {});
  const resumo = {
    negocios: linhas.length, pinos, por_situacao: { ...porSituacao, ...(pinosNovos ? { pinos_criados: pinosNovos.criados, sem_endereco: pinosNovos.semEndereco } : {}) },
    etapas_sem_classificacao: Object.keys(semClassificacao).length ? semClassificacao : null,
    erro, duracao_ms: Date.now() - inicio,
  };
  await svc.from('clientes_takeat_rodadas').insert(resumo);
  return json(erro ? 500 : 200, resumo);
});
