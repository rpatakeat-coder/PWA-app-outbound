// Camada de dados da Agenda — "a semana do time esta' planejada?".
//
// UMA ADAPTACAO GRANDE EM RELACAO AO DOC
// O cockpit original montava a agenda a partir de meetings, tasks e notes do
// HubSpot, e desenhava uma grade de horas (seg-sex x 8h-19h). Isso fazia sentido
// la': o time era de inside sales e o compromisso ERA o calendario.
//
// Aqui o time e' de RUA. O artefato de planejamento deste app nao e' um horario
// no calendario — e' a ROTA DO DIA (field_routes + field_route_stops): a lista
// ordenada de leads que o vendedor vai visitar. Um vendedor com a semana
// planejada e' um vendedor com rota montada em cada dia util, nao um vendedor
// com a agenda cheia de blocos de hora.
//
// Entao a pergunta do doc continua a mesma e a resposta muda de fonte:
//   rota do dia ....... field_routes/field_route_stops  (o plano de campo)
//   reuniao marcada ... client_meetings                 (demo/proposta com hora)
//
// A grade de horas nao foi replicada de proposito: a maior parte das visitas
// nao tem hora marcada, entao uma grade horaria ficaria 90% vazia e leria como
// "ninguem planejou nada" — o oposto da verdade. O que substitui e' a MATRIZ DO
// TIME, que o doc ja' pedia pro gestor (heatmap de celulas).
//
// SEMANA CIVIL, nunca rolante (ver datas.ts).
import { supabase } from '../supabase';
import { buscarTudo } from './paginar';
import { carregarEquipe, ativos, type MembroEquipe } from './equipe';
import { diaBRT, diasDaSemana } from './datas';

/** Status de rota que contam como PLANO. 'cancelled' nao conta — se contasse,
 *  cancelar a rota deixaria o dia parecendo planejado. */
const ROTA_VALE = new Set(['draft', 'planned', 'in_progress', 'completed']);

/** Paradas que contam. 'removed' saiu do plano; contar inflaria o numero. */
const PARADA_VALE = new Set(['planned', 'done', 'skipped']);

export interface Reuniao {
  id: string;
  quando: string;
  dia: string;
  leadNome: string;
  perfilId: string | null;
  status: string;
  /** Marcada no MESMO dia em que acontece. Nao e' erro, mas e' o oposto de
   *  planejamento — o doc pede que isso apareca. */
  emCimaDaHora: boolean;
}

export interface DiaDaAgenda {
  dia: string;
  /** null = nenhuma rota criada pra esse dia. */
  rota: { status: string; paradas: number; feitas: number } | null;
  reunioes: number;
  ehHoje: boolean;
  ehPassado: boolean;
}

export interface LinhaAgenda {
  perfilId: string;
  nome: string;
  dias: DiaDaAgenda[];
  totalParadas: number;
  totalReunioes: number;
  /** Dias uteis de hoje pra frente sem plano nenhum. So' olha do presente em
   *  diante: cobrar plano de terca-feira passada nao muda nada. */
  buracosDaqui: number;
}

export interface DadosAgenda {
  atualizadoEm: Date;
  hoje: string;
  semana: string[];
  linhas: LinhaAgenda[];
  reunioes: Reuniao[];
  /** Nomes de quem esta' sem rota hoje — o unico numero acionavel agora. */
  semRotaHoje: string[];
  totais: { paradas: number; reunioes: number; rotas: number };
}

export async function carregarAgenda(): Promise<DadosAgenda> {
  const hoje = diaBRT(new Date());
  const semana = diasDaSemana(hoje);
  const primeiro = semana[0];
  const ultimo = semana[semana.length - 1];

  // A janela de reunioes vai ate o fim do domingo pra nao perder o que foi
  // marcado na sexta a noite; o filtro por dia depois recorta certo.
  const fimDaJanela = new Date(`${ultimo}T23:59:59Z`);
  fimDaJanela.setUTCDate(fimDaJanela.getUTCDate() + 2);

  const [equipe, rotas, reunioesBrutas, clientes] = await Promise.all([
    carregarEquipe(),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('field_routes')
        .select('id, seller_id, route_date, status')
        .gte('route_date', primeiro)
        .lte('route_date', ultimo)
        .range(de, ate),
    ),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('client_meetings')
        .select('id, client_id, scheduled_at, status, created_by, created_at')
        .gte('scheduled_at', `${primeiro}T00:00:00Z`)
        .lte('scheduled_at', fimDaJanela.toISOString())
        .range(de, ate),
    ),
    buscarTudo<any>((de, ate) => supabase.from('clients').select('id, nome, empresa').range(de, ate)),
  ]);

  const rotasValidas = rotas.filter((r) => ROTA_VALE.has(r.status));

  // Paradas das rotas da semana. Busca separada porque o PostgREST nao faz
  // agregacao: contamos no cliente, o que e' barato pra uma semana de time.
  const idsDeRota = rotasValidas.map((r) => r.id);
  const paradas: any[] = [];
  const LOTE = 200;
  for (let i = 0; i < idsDeRota.length; i += LOTE) {
    const fatia = idsDeRota.slice(i, i + LOTE);
    if (!fatia.length) break;
    const lote = await buscarTudo<any>((de, ate) =>
      supabase
        .from('field_route_stops')
        .select('route_id, status')
        .in('route_id', fatia)
        .range(de, ate),
    );
    paradas.push(...lote);
  }

  const porRota = new Map<string, { paradas: number; feitas: number }>();
  for (const p of paradas) {
    if (!PARADA_VALE.has(p.status)) continue;
    const atual = porRota.get(p.route_id) ?? { paradas: 0, feitas: 0 };
    atual.paradas++;
    if (p.status === 'done') atual.feitas++;
    porRota.set(p.route_id, atual);
  }

  const nomeDoCliente = new Map<string, string>(
    clientes.map((c) => [c.id, (c.empresa || '').trim() || c.nome || 'sem nome']),
  );

  const reunioes: Reuniao[] = reunioesBrutas
    .map((m) => {
      const dia = diaBRT(m.scheduled_at);
      return {
        id: m.id,
        quando: m.scheduled_at,
        dia,
        leadNome: nomeDoCliente.get(m.client_id) ?? 'lead removido',
        perfilId: m.created_by ?? null,
        status: m.status ?? 'agendada',
        emCimaDaHora: m.created_at ? diaBRT(m.created_at) === dia : false,
      };
    })
    .filter((r) => semana.includes(r.dia))
    .sort((a, b) => a.quando.localeCompare(b.quando));

  // Indexacao por (pessoa, dia).
  const chave = (pessoa: string, dia: string) => `${pessoa}|${dia}`;
  const rotaPor = new Map<string, any>();
  for (const r of rotasValidas) rotaPor.set(chave(r.seller_id, r.route_date), r);

  const reunioesPor = new Map<string, number>();
  for (const r of reunioes) {
    if (!r.perfilId) continue;
    const k = chave(r.perfilId, r.dia);
    reunioesPor.set(k, (reunioesPor.get(k) ?? 0) + 1);
  }

  const linhas: LinhaAgenda[] = ativos(equipe)
    .map((p: MembroEquipe) => {
      const dias: DiaDaAgenda[] = semana.map((dia) => {
        const r = rotaPor.get(chave(p.perfilId, dia));
        const contagem = r ? porRota.get(r.id) ?? { paradas: 0, feitas: 0 } : null;
        return {
          dia,
          // Rota sem nenhuma parada valida e' rota vazia, e vazia nao e' plano.
          rota: r && contagem && contagem.paradas > 0 ? { status: r.status, ...contagem } : null,
          reunioes: reunioesPor.get(chave(p.perfilId, dia)) ?? 0,
          ehHoje: dia === hoje,
          ehPassado: dia < hoje,
        };
      });
      return {
        perfilId: p.perfilId,
        nome: p.nome,
        dias,
        totalParadas: dias.reduce((s, d) => s + (d.rota?.paradas ?? 0), 0),
        totalReunioes: dias.reduce((s, d) => s + d.reunioes, 0),
        buracosDaqui: dias.filter((d) => !d.ehPassado && !d.rota && d.reunioes === 0).length,
      };
    })
    // Quem tem mais buraco daqui pra frente primeiro: e' onde o gestor age.
    .sort((a, b) => b.buracosDaqui - a.buracosDaqui || a.totalParadas - b.totalParadas);

  const semRotaHoje = linhas
    .filter((l) => {
      const d = l.dias.find((x) => x.ehHoje);
      return d && !d.rota && d.reunioes === 0;
    })
    .map((l) => l.nome);

  return {
    atualizadoEm: new Date(),
    hoje,
    semana,
    linhas,
    reunioes,
    semRotaHoje,
    totais: {
      paradas: linhas.reduce((s, l) => s + l.totalParadas, 0),
      reunioes: reunioes.length,
      rotas: linhas.reduce((s, l) => s + l.dias.filter((d) => d.rota).length, 0),
    },
  };
}
