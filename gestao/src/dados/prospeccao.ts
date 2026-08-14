// Camada de dados da Prospeccao — "o que esta' entrando no topo do funil?".
//
// O MODELO AQUI E' DIFERENTE DO DOC
// O cockpit original tinha uma tabela de staging (`leads_prospeccao`) e uma
// FILA DE APROVACAO: o gestor aprovava em lote, e so' entao o lead virava
// Company/Deal no CRM.
//
// Neste app nao existe aprovacao. O fluxo e':
//   1. target_accounts .......... descoberta bruta (Google/Serper, por celula
//                                 de grade). Estoque, nao fila.
//   2. clients origem='conta_alvo' materializada pela Rota do dia — ja' nasce
//                                 visivel no mapa do vendedor.
//   3. conta_alvo_dismissed ..... o VENDEDOR descarta ("Nao interessa"), e o
//                                 lugar para de ser sugerido.
//
// Ou seja: a curadoria e' do vendedor, em campo, depois do fato — nao do gestor,
// antes. Nao inventei uma fila de aprovacao que ninguem usa; o que o gestor
// precisa ver e' o que ESTA' acontecendo com esse estoque, e principalmente o
// que esta' sendo descartado e por quem.
//
// A REGUA DE QUALIDADE, E UMA TENSAO QUE NAO VOU ESCONDER
// O doc e' explicito: "A nota NAO define fit comercial. O unico corte de
// potencial e' volume de avaliacoes." Este app faz o contrario — route_config
// tem `conta_alvo_nota_min` (4.5 por padrao) e filtra por nota.
//
// Nao mudei a regua: ela e' configuracao do gestor e mexer nisso pelo cockpit
// seria decidir no lugar dele. O que faco e' MEDIR o custo dela — quantas
// contas com volume de avaliacoes suficiente sao descartadas so' pela nota. O
// numero deixa a decisao informada em vez de invisivel.
import { supabase } from '../supabase';
import { buscarTudo } from './paginar';
import { ETAPAS_FUNIL } from './cockpit';
import { carregarEquipe, type Equipe } from './equipe';
import { diaBRT, diasDaSemana } from './datas';

/** Etapas que ainda sao "topo": o lead existe, mas ninguem conversou. Sair
 *  daqui e' o que conta como "virou lead de verdade". */
const ETAPAS_DE_TOPO = new Set(['Prospecção', 'Visita']);

export interface ContaAlvo {
  id: string;
  nome: string;
  bairro: string | null;
  cidade: string | null;
  rating: number | null;
  avaliacoes: number | null;
  etapa: string | null;
  visitas: number;
  dispensada: boolean;
  dispensadaPor: string | null;
  dispensadaEm: string | null;
  virouLead: boolean;
  ganha: boolean;
  vendedorId: string | null;
}

export interface Praca {
  nome: string;
  total: number;
  visitadas: number;
  viraramLead: number;
  dispensadas: number;
  ganhas: number;
}

export interface DadosProspeccao {
  atualizadoEm: Date;
  /** A regua configurada hoje, lida de route_config. */
  regua: { raioKm: number; notaMin: number; avaliacoesMin: number } | null;
  /** Contas descobertas que passam no corte de avaliacoes mas sao barradas SO'
   *  pela nota. E' o custo da regua atual, em contas. */
  barradasSoPelaNota: number;
  descobertas: number;
  materializadas: number;
  contas: ContaAlvo[];
  pracas: Praca[];
  dispensadas: ContaAlvo[];
  /** Quem descartou quanto — accountability do descarte. */
  porQuemDispensou: { nome: string; total: number }[];
  novasNaSemana: number;
  funil: { rotulo: string; total: number }[];
  equipe: Equipe;
}

export async function carregarProspeccao(): Promise<DadosProspeccao> {
  const semana = diasDaSemana(diaBRT(new Date()));

  const [equipe, config, alvos, clientes] = await Promise.all([
    carregarEquipe(),
    supabase
      .from('route_config')
      .select('conta_alvo_raio_m, conta_alvo_nota_min, conta_alvo_reviews_min')
      .eq('id', 1)
      .maybeSingle(),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('target_accounts')
        .select('id, rating, reviews_count, client_id, created_at')
        .range(de, ate),
    ),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('clients')
        .select(
          'id, nome, empresa, bairro, cidade, etapa, visit_count, won_at, vendedor_id_hubspot, ' +
            'conta_alvo_rating, conta_alvo_reviews, conta_alvo_dismissed, ' +
            'conta_alvo_dismissed_by_name, conta_alvo_dismissed_at',
        )
        .eq('origem', 'conta_alvo')
        .range(de, ate),
    ),
  ]);

  const cfg = config.data as any;
  const regua = cfg
    ? {
        raioKm: (cfg.conta_alvo_raio_m ?? 0) / 1000,
        notaMin: cfg.conta_alvo_nota_min,
        avaliacoesMin: cfg.conta_alvo_reviews_min,
      }
    : null;

  // O custo da regua de nota: contas com volume suficiente que caem so' porque
  // a nota nao alcanca. Sem nota tambem e' barrado pelo filtro do app.
  const barradasSoPelaNota = regua
    ? alvos.filter(
        (a) =>
          (a.reviews_count ?? 0) >= regua.avaliacoesMin &&
          (a.rating == null || a.rating < regua.notaMin),
      ).length
    : 0;

  const contas: ContaAlvo[] = clientes.map((c) => {
    const etapa = c.etapa ?? null;
    return {
      id: c.id,
      nome: (c.empresa || '').trim() || c.nome || 'sem nome',
      bairro: c.bairro,
      cidade: c.cidade,
      rating: c.conta_alvo_rating,
      avaliacoes: c.conta_alvo_reviews,
      etapa,
      visitas: c.visit_count ?? 0,
      dispensada: c.conta_alvo_dismissed === true,
      dispensadaPor: c.conta_alvo_dismissed_by_name ?? null,
      dispensadaEm: c.conta_alvo_dismissed_at ?? null,
      // "Virou lead" = saiu do topo. Estar em Prospeccao/Visita significa que o
      // lugar existe no mapa, nao que alguem conversou com o dono.
      virouLead:
        !!etapa &&
        (ETAPAS_FUNIL as readonly string[]).includes(etapa) &&
        !ETAPAS_DE_TOPO.has(etapa),
      ganha: !!c.won_at,
      vendedorId: c.vendedor_id_hubspot,
    };
  });

  const vivas = contas.filter((c) => !c.dispensada);
  const dispensadas = contas.filter((c) => c.dispensada);

  // Praca = cidade, caindo pro bairro quando a cidade nao veio preenchida.
  const porPraca = new Map<string, Praca>();
  for (const c of contas) {
    const nome = (c.cidade || '').trim() || (c.bairro || '').trim() || 'sem praça';
    const p = porPraca.get(nome) ?? {
      nome,
      total: 0,
      visitadas: 0,
      viraramLead: 0,
      dispensadas: 0,
      ganhas: 0,
    };
    p.total++;
    if (c.visitas > 0) p.visitadas++;
    if (c.virouLead) p.viraramLead++;
    if (c.dispensada) p.dispensadas++;
    if (c.ganha) p.ganhas++;
    porPraca.set(nome, p);
  }

  const contagemDispensa = new Map<string, number>();
  for (const c of dispensadas) {
    const nome = c.dispensadaPor?.trim() || 'sem registro de quem';
    contagemDispensa.set(nome, (contagemDispensa.get(nome) ?? 0) + 1);
  }

  const novasNaSemana = alvos.filter(
    (a) => a.created_at && semana.includes(diaBRT(a.created_at)),
  ).length;

  return {
    atualizadoEm: new Date(),
    regua,
    barradasSoPelaNota,
    descobertas: alvos.length,
    materializadas: contas.length,
    contas,
    pracas: [...porPraca.values()].sort((a, b) => b.total - a.total),
    dispensadas,
    porQuemDispensou: [...contagemDispensa.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total),
    novasNaSemana,
    // Funil de atacado: cada degrau e' um subconjunto do anterior.
    funil: [
      { rotulo: 'Descobertas', total: alvos.length },
      { rotulo: 'No mapa', total: contas.length },
      { rotulo: 'Não dispensadas', total: vivas.length },
      { rotulo: 'Visitadas', total: vivas.filter((c) => c.visitas > 0).length },
      { rotulo: 'Viraram lead', total: vivas.filter((c) => c.virouLead).length },
      { rotulo: 'Ganhas', total: vivas.filter((c) => c.ganha).length },
    ],
    equipe,
  };
}
