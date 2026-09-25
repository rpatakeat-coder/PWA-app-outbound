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
  'sp', 'rj', 'mg', 'pr', 'rs', 'sc', 'ba', 'go', 'df', 'es', 'unidade', 'filial', 'loja',
  'boteco', 'quiosque', 'na', 'no', 'em', 'oficial',
]);
// Abreviações de logradouro/bairro: "Jd São Jorge" e "Jardim São Jorge" são o mesmo lugar.
const ABREVIACOES: Record<string, string> = {
  jd: 'jardim', jdm: 'jardim', vl: 'vila', pq: 'parque', sta: 'santa', sto: 'santo', cj: 'conjunto', res: 'residencial',
};

function norm(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').map((t) => ABREVIACOES[t] ?? t).join(' ');
}
function tokens(s: unknown): string[] {
  return [...new Set(norm(s).split(' ').filter((t) => t.length > 1 && !GENERICAS.has(t)))];
}

// A regra é conservadora de propósito (dry_run de 25/09 mostrou os três jeitos de
// errar: "Gula Gula" casou com "Santa Gula Doces", "Top Gourmet" da Cidade de Deus
// com "Top Life Gourmet Fitness" na Praça Seca, "Bar do Zé" só pela palavra "Zé"):
//   - NOME nos dois sentidos: 60% das palavras do lead estão no título E 50% das do
//     título estão no lead (o título com palavras a mais é outro lugar);
//   - LUGAR: se o lead tem bairro, o endereço tem que ter o bairro; sem bairro, a
//     cidade no endereço E todas as palavras do lead no título (mínimo duas) —
//     "Didico Quintal do Sabor" não é "Restaurante Quintal do Sabor" só porque o
//     título inteiro cabe no nome do lead.
function confere(lead: any, lugar: any): { ok: boolean; motivo: string } {
  const doLead = tokens(lead.nome);
  const doTitulo = tokens(lugar.title);
  if (!doLead.length) return { ok: false, motivo: 'nome do lead só tem palavra genérica' };
  const titulo = new Set(doTitulo);
  const noLead = new Set(doLead);
  const achadas = doLead.filter((t) => titulo.has(t)).length;
  const doTituloNoLead = doTitulo.filter((t) => noLead.has(t)).length;
  if (!achadas || achadas / doLead.length < 0.6) return { ok: false, motivo: 'nome não bate: ' + lugar.title };
  if (!doTitulo.length || doTituloNoLead / doTitulo.length < 0.5) return { ok: false, motivo: 'título tem outro nome: ' + lugar.title };
  // NOME DE UMA PALAVRA SÓ ("na brasa", "Bar do Zé") não decide sozinho: a rodada
  // real de 25/09 gravou "na brasa" em "Irmãos na Brasa", e o dry_run minutos
  // antes tinha casado o mesmo lead com "Boteco na Brasa". Aí o título não pode ter
  // nenhuma palavra a mais que o lead.
  if (doLead.length === 1 && doTituloNoLead !== doTitulo.length) {
    return { ok: false, motivo: 'nome de uma palavra só e título com outras: ' + lugar.title };
  }
  const end = norm(lugar.address);
  const cidade = norm(lead.cidade);
  const bairro = norm(lead.bairro);
  if (bairro) {
    if (!end.includes(bairro)) return { ok: false, motivo: 'bairro não bate: ' + lugar.address };
  } else {
    if (!cidade || !end.includes(cidade)) return { ok: false, motivo: 'cidade não bate: ' + lugar.address };
    const nomeInteiro = achadas === doLead.length && doLead.length >= 2;
    if (!nomeInteiro) return { ok: false, motivo: 'sem bairro e nome não bate inteiro: ' + lugar.title };
  }
  if (lugar.latitude == null || lugar.longitude == null) return { ok: false, motivo: 'resultado sem coordenada' };
  return { ok: true, motivo: 'nome ' + achadas + '/' + doLead.length + ', título ' + doTituloNoLead + '/' + doTitulo.length + ', lugar bate' };
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
