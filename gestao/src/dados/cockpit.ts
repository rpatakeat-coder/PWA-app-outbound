// Camada de dados do Cockpit.
//
// O cockpit original (ver docs-replicacao/01-ARQUITETURA.md) nao tinha banco
// pro CRM: um cron do GitHub Actions gerava data/hubspot.json e COMMITAVA o
// arquivo no repositorio. Aqui nao replicamos isso — o app de campo ja'
// sincroniza HubSpot -> Supabase por Edge Function, entao lemos o banco ao
// vivo. Ganho: o numero na tela nao tem horas de atraso e nao existe pipeline
// de commit pra quebrar.
//
// Tudo aqui e' DERIVADO das tabelas de operacao que ja' existem. Nenhum numero
// e' chumbado; quando o dado nao existe, a funcao devolve null e a tela mostra
// estado vazio honesto — regra 6 de 02-FUNCIONALIDADES.md.
import { supabase } from '../supabase';
import { buscarTudo } from './paginar';
import { carregarEquipe, ativos, type MembroEquipe } from './equipe';

/** Etapas que contam como funil aberto. As demais (Perdido, Backlog, CASA DOS
 *  DADOS, Visita) sao estoque ou desfecho, nao negociacao em andamento. */
export const ETAPAS_FUNIL = [
  'Prospecção',
  'Conversa com decisor',
  'Demo/Proposta',
  'Negociação',
  'Ag. Pagamento',
] as const;

export interface RegraSla {
  etapa: string;
  dias: number;
}

export interface LeadAberto {
  id: string;
  nome: string;
  empresa: string | null;
  etapa: string;
  vendedorId: string | null;
  entrouNaEtapaEm: string | null;
  diasNaEtapa: number | null;
  /** Quanto passou do SLA, em %. 100 = no limite; 200 = o dobro do prazo. */
  slaRatio: number | null;
  travado: boolean;
}

export interface Executivo {
  /** UUID em profiles — chave das metas e do 1:1. */
  perfilId: string;
  ownerId: string;
  nome: string;
  email: string;
  abertos: number;
  travados: number;
  fechadosNoMes: number | null;
  meta: number | null;
}

export interface DadosCockpit {
  atualizadoEm: Date;
  slaPorEtapa: RegraSla[];
  leads: LeadAberto[];
  funil: { etapa: string; total: number; travados: number; sla: number | null }[];
  executivos: Executivo[];
  /** Leads do funil cujo dono nao esta na lista de executivos ativos —
   *  tipicamente carteira de quem foi desativado. Eles contam no KPI "em
   *  aberto" e nao aparecem em nenhuma linha da tabela; sem este numero
   *  explicito, somar a coluna nao bate com o card e ninguem vai atras deles. */
  semDonoAtivo: { total: number; leads: LeadAberto[] };
  kpis: {
    emAberto: number;
    travados: number;
    fechadosNoMes: number | null;

    /** % de leads que mudaram de etapa nos ultimos 7 dias. */
    taxaAvancoSemana: number | null;
    /** Soma das metas DIARIAS de visita do time. */
    metaVisitasDia: number | null;
  };
}

const DIA_MS = 86_400_000;

function diasEntre(de: string | null, ate = new Date()): number | null {
  if (!de) return null;
  const d = new Date(de).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((ate.getTime() - d) / DIA_MS);
}

export async function carregarCockpit(): Promise<DadosCockpit> {
  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const seteDiasAtras = new Date(Date.now() - 7 * DIA_MS).toISOString();

  // clients e client_stage_changes vao PAGINADAS (buscarTudo). Sao as duas
  // tabelas que crescem sem teto, e o corte silencioso do PostgREST em 1.000
  // linhas nao daria erro nenhum: os leads mais antigos simplesmente perderiam
  // a data de entrada na etapa e sumiriam da conta de travados. Numero errado
  // pra menos, com cara de certo.
  const [sla, clientes, mudancas, equipe, ganhosDoMes, temGanho] = await Promise.all([
    supabase.from('stage_sla').select('stage_label, sla_days').eq('is_active', true),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('clients')
        .select('id, nome, empresa, etapa, vendedor_id_hubspot, won_at')
        // Filtro no BANCO, nao no navegador. Antes vinha todo mundo que tinha
        // etapa (~5.6 mil linhas) e o `.filter` abaixo jogava ~4.7 mil fora —
        // seis idas e voltas de rede pra usar um sexto do que chegou.
        .in('etapa', ETAPAS_FUNIL as unknown as string[])
        .range(de, ate),
    ),
    // Ultima entrada de etapa por lead: define ha' quanto tempo ele esta' parado.
    buscarTudo<any>((de, ate) =>
      supabase
        .from('client_stage_changes')
        .select('client_id, to_stage, created_at')
        .order('created_at', { ascending: false })
        .range(de, ate),
    ),
    carregarEquipe(),
    // Fechamentos do mes vem numa consulta PROPRIA, e nao da lista acima.
    // Quem fechou esta' em Ganho/Onboarding — fora de ETAPAS_FUNIL —, entao
    // desde que o filtro de etapa passou pro banco esses clientes nao chegam
    // mais aqui pela outra consulta. Sao poucas linhas: so' o mes corrente.
    supabase
      .from('clients')
      .select('id, vendedor_id_hubspot, won_at')
      .gte('won_at', inicioDoMes.toISOString()),
    // Existe QUALQUER fechamento datado na base? Uma linha basta. Serve pra
    // distinguir "o time nao vendeu este mes" (zero) de "ninguem carimbou
    // ganho ainda" (travessao) — a guarda que existe desde que o KPI nasceu.
    supabase.from('clients').select('id').not('won_at', 'is', null).limit(1),
  ]);

  if (sla.error) throw sla.error;

  const slaPorEtapa: RegraSla[] = (sla.data ?? []).map((r: any) => ({
    etapa: r.stage_label,
    dias: r.sla_days,
  }));
  const diasDoSla = new Map(slaPorEtapa.map((r) => [r.etapa, r.dias]));

  // Primeira ocorrencia por client_id = a mais recente, ja' que veio ordenado
  // por created_at desc. Evita um GROUP BY que o PostgREST nao expoe.
  const entradaNaEtapa = new Map<string, string>();
  for (const m of mudancas as any[]) {
    if (!entradaNaEtapa.has(m.client_id)) entradaNaEtapa.set(m.client_id, m.created_at);
  }

  const leads: LeadAberto[] = (clientes as any[]).map((c) => {
      const entrou = entradaNaEtapa.get(c.id) ?? null;
      const dias = diasEntre(entrou);
      const prazo = diasDoSla.get(c.etapa) ?? null;
      const ratio = dias != null && prazo ? Math.round((dias / prazo) * 100) : null;
      return {
        id: c.id,
        nome: c.nome,
        empresa: c.empresa,
        etapa: c.etapa,
        vendedorId: c.vendedor_id_hubspot,
        entrouNaEtapaEm: entrou,
        diasNaEtapa: dias,
        slaRatio: ratio,
        travado: ratio != null && ratio > 100,
      };
  });

  const funil = ETAPAS_FUNIL.map((etapa) => {
    const doEtapa = leads.filter((l) => l.etapa === etapa);
    return {
      etapa,
      total: doEtapa.length,
      travados: doEtapa.filter((l) => l.travado).length,
      sla: diasDoSla.get(etapa) ?? null,
    };
  });

  // "Fechados no mes" vem de `won_at` — a data REAL do fechamento.
  //
  // Historico: quando esta tela nasceu, won_at estava vazio em 100% das linhas
  // e este KPI devolvia null. Nao era esquecimento — o funil do app termina na
  // pratica em Negociacao e o fechamento acontece direto no HubSpot, entao a
  // RPC de carimbo nunca era chamada. Corrigido em 14/08/2026 por dois lados:
  // a hubspot-sync passou a ler `closedate` do deal e carimbar na hora, e um
  // backfill (scripts/backfill-won-at.sql) preencheu 438 fechamentos antigos.
  //
  // A guarda continua aqui de proposito. Se um dia a fonte secar de novo, a
  // tela volta a mostrar travessao em vez de zero — zero leria como "o time nao
  // vendeu nada", que e' uma afirmacao, quando a verdade seria "parei de medir".
  const temSinalDeGanho = ((temGanho.data ?? []) as any[]).length > 0;
  const fechados = temSinalDeGanho ? ((ganhosDoMes.data ?? []) as any[]) : null;

  // A meta e' de VISITAS POR DIA, nao de fechamento por mes (que era o que o
  // cockpit original media). Sao perguntas diferentes e a tela rotula a que
  // temos, em vez de fingir que responde a outra.
  //
  // Quem resolve a meta efetiva e' equipe.ts — inclusive o fallback pra meta
  // global de route_config, que esta camada ignorava e por isso mostrava o time
  // inteiro como "sem meta".
  const executivos: Executivo[] = ativos(equipe)
    .filter((p: MembroEquipe) => p.ownerId)
    .map((p: MembroEquipe) => {
      const meus = leads.filter((l) => l.vendedorId === p.ownerId);
      return {
        perfilId: p.perfilId,
        ownerId: p.ownerId!,
        nome: p.nome,
        email: p.email,
        abertos: meus.length,
        travados: meus.filter((l) => l.travado).length,
        fechadosNoMes: fechados
          ? fechados.filter((c) => c.vendedor_id_hubspot === p.ownerId).length
          : null,
        meta: p.metaVisitasDia,
      };
    })
    .sort((a, b) => b.travados - a.travados || b.abertos - a.abertos);

  const donosAtivos = new Set(executivos.map((e) => e.ownerId));
  const orfaos = leads.filter((l) => !l.vendedorId || !donosAtivos.has(l.vendedorId));

  // Taxa de avanco: leads do funil que mudaram de etapa nos ultimos 7 dias.
  const avancaram = new Set(
    (mudancas as any[])
      .filter((m) => m.created_at >= seteDiasAtras)
      .map((m) => m.client_id),
  );
  const noFunil = new Set(leads.map((l) => l.id));
  const avancosNoFunil = [...avancaram].filter((id) => noFunil.has(id)).length;

  const metasConhecidas = executivos.filter((e) => e.meta != null);

  return {
    atualizadoEm: new Date(),
    slaPorEtapa,
    leads,
    funil,
    executivos,
    semDonoAtivo: { total: orfaos.length, leads: orfaos },
    kpis: {
      emAberto: leads.length,
      travados: leads.filter((l) => l.travado).length,
      fechadosNoMes: fechados ? fechados.length : null,
      // Soma das metas de quem TEM meta. Quem o gestor marcou como 'sem_meta'
      // nao entra — somar zero por ele baixaria o alvo do time e faria a
      // aderencia parecer melhor do que e'.
      //
      // null so' quando ninguem tem meta alguma, o que hoje nao acontece: sem
      // meta propria, vale a global de route_config (ver equipe.ts).
      metaVisitasDia: metasConhecidas.length
        ? metasConhecidas.reduce((s, e) => s + (e.meta ?? 0), 0)
        : null,
      taxaAvancoSemana: leads.length ? Math.round((avancosNoFunil / leads.length) * 100) : null,
    },
  };
}
