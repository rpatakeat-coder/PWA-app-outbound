// Supabase Edge Function: localizar-municao
//
// Dá coordenada ao lead de prospecção que nasceu sem ela — a conta "de rua" que o
// executivo cadastrou pelo Cockpit só com bairro e cidade. Sem coordenada não há
// pin, e sem pin a visita planejada não chega à rota do mapa (25/09/2026: 7 das
// 28 visitas planejadas do dia estavam nesse caso).
//
// Como: uma busca no Google Maps pelo Serper (/maps, o mesmo endpoint e o mesmo
// formato de lib/serper-places.js do Cockpit) com "nome bairro cidade". Só aceita
// o resultado quando O NOME e O LUGAR batem (regras em `confere`); na dúvida não
// grava — pin no lugar errado manda o executivo para a porta errada. Aceito, grava
// lat/lng (e o endereço, se faltava) no lead, e os gatilhos de 0098/0099 fazem o
// resto: o pin nasce (munição) ou o negocio-vira-ponto cria o pin do negócio com
// essa coordenada, e o reconciliador leva a visita para a rota.
//
// Quem chama: o cron `localizar-municao-hora` (0100), via invocar_localizar_municao,
// com o header x-cron-secret conferido contra o cofre (segredo_confere). Nada aqui
// fala com o HubSpot.
//
// POST { dry_run?: boolean, limite?: number }  -> relatório por lead.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SERPER_URL = 'https://google.serper.dev/maps';
// Palavras que não identificam o estabelecimento: comparar por elas casaria
// "Restaurante do Zé" com qualquer restaurante.
const GENERICAS = new Set([
  'restaurante', 'bar', 'lanchonete', 'pizzaria', 'padaria', 'cafe', 'cafeteria', 'bistro', 'lanches',
  'gastrobar', 'espetos', 'espeto', 'churrascaria', 'hamburgueria', 'burger', 'delivery', 'comercio',
  'alimentos', 'ltda', 'me', 'eireli', 'epp', 'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'the',
  'sp', 'rj', 'mg', 'pr', 'rs', 'sc', 'ba', 'go', 'df', 'unidade', 'filial', 'loja',
]);

function norm(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(s: unknown): string[] {
  return norm(s).split(' ').filter((t) => t.length > 1 && !GENERICAS.has(t));
}

// O nome bate quando as palavras que identificam o lead aparecem no título do lugar
// (pelo menos uma, e pelo menos 60% delas). O lugar bate quando o endereço do
// resultado cita a cidade do lead (ou o bairro, para cidade escrita de outro jeito).
function confere(lead: any, lugar: any): { ok: boolean; motivo: string } {
  const doLead = tokens(lead.nome);
  const doTitulo = new Set(tokens(lugar.title));
  if (!doLead.length) return { ok: false, motivo: 'nome do lead só tem palavra genérica' };
  const achadas = doLead.filter((t) => doTitulo.has(t)).length;
  if (!achadas || achadas / doLead.length < 0.6) return { ok: false, motivo: 'nome não bate: ' + lugar.title };
  const end = norm(lugar.address);
  const cidade = norm(lead.cidade);
  const bairro = norm(lead.bairro);
  const lugarBate = (cidade && end.includes(cidade)) || (bairro && bairro.length > 3 && end.includes(bairro));
  if (!lugarBate) return { ok: false, motivo: 'lugar não bate: ' + lugar.address };
  if (lugar.latitude == null || lugar.longitude == null) return { ok: false, motivo: 'resultado sem coordenada' };
  return { ok: true, motivo: 'nome ' + achadas + '/' + doLead.length + ' e lugar batem' };
}

const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { erro: 'Método não permitido' });
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const segredo = req.headers.get('x-cron-secret') ?? '';
  const { data: ok } = await svc.rpc('segredo_confere', { p_nome: 'localizar_municao', p_valor: segredo });
  if (ok !== true) return json(401, { erro: 'x-cron-secret inválido' });
  const chave = Deno.env.get('SERPER_API_KEY');
  if (!chave) return json(503, { erro: 'Servidor sem SERPER_API_KEY' });

  const corpo = await req.json().catch(() => ({}));
  const dryRun = corpo?.dry_run === true;
  const limite = Math.max(1, Math.min(50, Number(corpo?.limite) || 20));

  const { data: leads, error } = await svc.rpc('municao_para_localizar', { p_limite: limite });
  if (error) return json(500, { erro: 'municao_para_localizar: ' + error.message });

  const relatorio: any[] = [];
  for (const lead of leads ?? []) {
    const consulta = [lead.nome, lead.bairro, lead.cidade].filter(Boolean).join(' ');
    let lugares: any[] = [];
    try {
      const r = await fetch(SERPER_URL, {
        method: 'POST',
        headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: consulta, gl: 'br', hl: 'pt-br' }),
      });
      if (!r.ok) throw new Error('Serper ' + r.status);
      const d = await r.json();
      lugares = Array.isArray(d.places) ? d.places : [];
    } catch (e) {
      relatorio.push({ id: lead.id, nome: lead.nome, resultado: 'erro', motivo: String((e as Error).message) });
      continue;  // não marca tentativa: erro de rede tenta de novo na próxima rodada
    }
    let escolhido: any = null;
    let motivo = lugares.length ? '' : 'nenhum resultado';
    for (const l of lugares.slice(0, 5)) {
      const c = confere(lead, l);
      if (c.ok) { escolhido = l; motivo = c.motivo; break; }
      if (!motivo) motivo = c.motivo;
    }
    const origem = escolhido
      ? 'serper:' + String(escolhido.placeId ?? escolhido.cid ?? '').slice(0, 120)
      : 'sem_match: ' + motivo.slice(0, 160);
    relatorio.push({
      id: lead.id, nome: lead.nome, consulta, resultado: escolhido ? 'localizado' : 'sem_match', motivo,
      lugar: escolhido ? { titulo: escolhido.title, endereco: escolhido.address, lat: escolhido.latitude, lng: escolhido.longitude } : null,
    });
    if (dryRun) continue;
    const upd: Record<string, unknown> = { localizacao_tentada_em: new Date().toISOString(), localizacao_origem: origem };
    if (escolhido) {
      upd.lat = Number(escolhido.latitude);
      upd.lng = Number(escolhido.longitude);
      if (!lead.endereco && escolhido.address) upd.endereco = String(escolhido.address).slice(0, 300);
    }
    const { error: e2 } = await svc.from('leads_prospeccao').update(upd).eq('id', lead.id).is('lat', null);
    if (e2) relatorio[relatorio.length - 1].erro_gravar = e2.message;
  }
  return json(200, {
    dry_run: dryRun, tentados: relatorio.length,
    localizados: relatorio.filter((x) => x.resultado === 'localizado').length, relatorio,
  });
});
