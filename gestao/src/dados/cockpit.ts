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
  kpis: {
    emAberto: number;
    travados: number;
    fechadosNoMes: number | null;
    metaDoTime: number | null;
    /** % de leads que mudaram de etapa nos ultimos 7 dias. */
    taxaAvancoSemana: number | null;
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

  const [sla, clientes, mudancas, pessoas, metas] = await Promise.all([
    supabase.from('stage_sla').select('stage_label, sla_days').eq('is_active', true),
    supabase
      .from('clients')
      .select('id, nome, empresa, etapa, vendedor_id_hubspot, won_at')
      .not('etapa', 'is', null),
    // Ultima entrada de etapa por lead: define ha' quanto tempo ele esta' parado.
    supabase
      .from('client_stage_changes')
      .select('client_id, to_stage, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, email, id_hubspot, role'),
    supabase.from('seller_visit_goals').select('*'),
  ]);

  const erro = sla.error || clientes.error || mudancas.error || pessoas.error;
  if (erro) throw erro;

  const slaPorEtapa: RegraSla[] = (sla.data ?? []).map((r: any) => ({
    etapa: r.stage_label,
    dias: r.sla_days,
  }));
  const diasDoSla = new Map(slaPorEtapa.map((r) => [r.etapa, r.dias]));

  // Primeira ocorrencia por client_id = a mais recente, ja' que veio ordenado
  // por created_at desc. Evita um GROUP BY que o PostgREST nao expoe.
  const entradaNaEtapa = new Map<string, string>();
  for (const m of (mudancas.data ?? []) as any[]) {
    if (!entradaNaEtapa.has(m.client_id)) entradaNaEtapa.set(m.client_id, m.created_at);
  }

  const leads: LeadAberto[] = ((clientes.data ?? []) as any[])
    .filter((c) => (ETAPAS_FUNIL as readonly string[]).includes(c.etapa))
    .map((c) => {
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

  // "Fechados no mes" NAO e' calculavel hoje, e isso e' um achado, nao um
  // esquecimento: `won_at` esta' vazio em 100% das linhas, a tabela
  // client_status_history nao tem nenhum registro, e nenhuma mudanca de etapa
  // do mes aponta pra uma etapa de ganho. Sem sinal, devolvemos null — a tela
  // mostra travessao e explica. Zero seria pior que travessao: leria como "o
  // time nao vendeu nada" em vez de "ainda nao medimos isso".
  const temSinalDeGanho = ((clientes.data ?? []) as any[]).some((c) => c.won_at);
  const fechados = temSinalDeGanho
    ? ((clientes.data ?? []) as any[]).filter(
        (c) => c.won_at && new Date(c.won_at) >= inicioDoMes,
      )
    : null;

  const metaPorVendedor = new Map<string, number>();
  for (const m of (metas.data ?? []) as any[]) {
    const chave = m.seller_id ?? m.vendedor_id_hubspot ?? m.owner_id;
    const valor = m.goal ?? m.meta ?? m.daily_goal;
    if (chave && typeof valor === 'number') metaPorVendedor.set(String(chave), valor);
  }

  const executivos: Executivo[] = ((pessoas.data ?? []) as any[])
    // Desativados saem: o nome traz o marcador e eles nao trabalham mais,
    // entao apareceriam com carteira parada e travados que ninguem vai atacar.
    .filter((p) => p.role === 'user' && p.id_hubspot && !/desativad/i.test(p.full_name ?? ''))
    .map((p) => {
      const meus = leads.filter((l) => l.vendedorId === p.id_hubspot);
      return {
        ownerId: p.id_hubspot,
        nome: p.full_name || p.email,
        email: p.email,
        abertos: meus.length,
        travados: meus.filter((l) => l.travado).length,
        fechadosNoMes: fechados
          ? fechados.filter((c) => c.vendedor_id_hubspot === p.id_hubspot).length
          : null,
        meta: metaPorVendedor.get(p.id_hubspot) ?? null,
      };
    })
    .sort((a, b) => b.travados - a.travados || b.abertos - a.abertos);

  // Taxa de avanco: leads do funil que mudaram de etapa nos ultimos 7 dias.
  const avancaram = new Set(
    ((mudancas.data ?? []) as any[])
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
    kpis: {
      emAberto: leads.length,
      travados: leads.filter((l) => l.travado).length,
      fechadosNoMes: fechados ? fechados.length : null,
      // null quando ninguem tem meta: a tela mostra estado vazio em vez de
      // exibir "0" e dar a impressao de que a meta e' zero.
      metaDoTime: metasConhecidas.length
        ? metasConhecidas.reduce((s, e) => s + (e.meta ?? 0), 0)
        : null,
      taxaAvancoSemana: leads.length ? Math.round((avancosNoFunil / leads.length) * 100) : null,
    },
  };
}
