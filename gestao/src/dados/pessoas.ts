// Camada de dados de Pessoas — "quem precisa de mim no 1:1?".
//
// Tudo derivado de operacao real. Nenhum julgamento sobre a pessoa: a tela
// mostra o GARGALO dela (onde a carteira trava) e o que a evidencia sugere
// perguntar. Quem conclui e' o gestor na conversa.
//
// O SEMAFORO E' O DO DOC (10-PLANO-DE-IMPLEMENTACAO.md, fase 2):
//   < 15% travados .... ok
//   < 35% travados .... atencao
//   >= 35% travados ... critico
// Sao percentuais da carteira, nao numeros absolutos — senao quem tem carteira
// grande apareceria sempre em vermelho por ter mais leads no total.
//
// UMA COISA QUE ESTA TELA NAO FAZ: ranking. Ordenar gente por pontuacao num
// painel de gestao transforma coaching em cobranca publica, e o doc pede
// "gargalo OU boa pratica" — as duas direcoes. A ordem aqui e' por URGENCIA de
// conversa, e quem esta' bem aparece com o que esta' funcionando.
import { supabase } from '../supabase';
import { buscarTudo } from './paginar';
import { ETAPAS_FUNIL } from './cockpit';
import { carregarEquipe, ativos, type MembroEquipe } from './equipe';
import { ehAvanco } from './regras';
import { diaBRT, diasUteisAte } from './datas';

const DIA_MS = 86_400_000;
/** Janela de leitura de campo. 10 dias uteis = duas semanas de trabalho. */
const DIAS_UTEIS_DA_JANELA = 10;
/** Dias uteis seguidos sem NENHUMA visita que ja' justificam conversa sozinhos. */
const SILENCIO_URGENTE = 3;

export type Semaforo = 'ok' | 'atencao' | 'critico';

export interface ItemDeRoteiro {
  tema: string;
  /** O numero que sustenta o tema. Sem evidencia nao entra no roteiro. */
  evidencia: string;
  pergunta: string;
}

export interface Pessoa {
  perfilId: string;
  ownerId: string | null;
  nome: string;
  carteira: number;
  travados: number;
  /** Percentual da carteira acima do SLA. null com carteira vazia. */
  travadosPct: number | null;
  semaforo: Semaforo;
  /** Etapa onde a pessoa mais concentra travados. */
  gargalo: { etapa: string; travados: number; total: number } | null;
  visitasNaJanela: number;
  /** Meta de visitas na janela = meta/dia x dias uteis. null sem meta. */
  metaNaJanela: number | null;
  aderencia: number | null;
  /** Dias uteis desde a ultima visita registrada. null se nunca visitou. */
  diasSemVisitar: number | null;
  avancosNaJanela: number;
  fechadosNoMes: number;
  /** O que esta' indo bem — a "boa pratica" que o doc pede ao lado do gargalo. */
  destaque: string | null;
  roteiro: ItemDeRoteiro[];
  /** Ordem de conversa: quanto maior, mais cedo o 1:1. */
  urgencia: number;
}

export interface DadosPessoas {
  atualizadoEm: Date;
  pessoas: Pessoa[];
  janelaDias: number;
  /** null quando a tabela um_a_um ainda nao existe (migration nao rodada). */
  registros: Registro1a1[] | null;
}

export interface Registro1a1 {
  id: string;
  perfilId: string;
  data: string;
  pauta: string | null;
  combinado: string | null;
  autorNome: string | null;
}

export async function carregarPessoas(): Promise<DadosPessoas> {
  const hoje = diaBRT(new Date());
  const janela = diasUteisAte(hoje, DIAS_UTEIS_DA_JANELA);
  const inicioDaJanela = janela[janela.length - 1];
  const desde = new Date(Date.now() - 30 * DIA_MS).toISOString();

  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const [equipe, sla, clientes, ganhosDoMes, mudancas, visitas, umAUm] = await Promise.all([
    carregarEquipe(),
    supabase.from('stage_sla').select('stage_label, sla_days').eq('is_active', true),
    // Funil filtrado no BANCO. Antes vinha todo cliente com etapa e o filtro
    // acontecia no navegador.
    buscarTudo<any>((de, ate) =>
      supabase
        .from('clients')
        .select('id, etapa, vendedor_id_hubspot, won_at')
        .in('etapa', ETAPAS_FUNIL as unknown as string[])
        .range(de, ate),
    ),
    // Fechamentos do mes numa consulta propria: quem fechou saiu do funil e
    // nao chega mais pela consulta acima.
    supabase
      .from('clients')
      .select('vendedor_id_hubspot, won_at')
      .gte('won_at', inicioDoMes.toISOString()),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('client_stage_changes')
        .select('client_id, created_by, created_at, from_stage, to_stage')
        .order('created_at', { ascending: false })
        .range(de, ate),
    ),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('client_visits')
        .select('visited_by, visited_at')
        .gte('visited_at', desde)
        .range(de, ate),
    ),
    // Opcional: a tela funciona sem a migration do 1:1 rodada. Erro aqui nao
    // derruba nada — vira `registros: null` e a secao explica.
    supabase
      .from('um_a_um')
      .select('id, seller_id, realizado_em, pauta, combinado, created_by_name')
      .order('realizado_em', { ascending: false })
      .limit(200),
  ]);

  const diasDoSla = new Map(
    ((sla.data ?? []) as any[]).map((r) => [r.stage_label, r.sla_days as number]),
  );
  const ordemFunil = new Map((ETAPAS_FUNIL as readonly string[]).map((e, i) => [e, i] as const));

  // Ultima entrada de etapa por lead (mudancas ja' vem desc).
  const entrouEm = new Map<string, string>();
  for (const m of mudancas) if (!entrouEm.has(m.client_id)) entrouEm.set(m.client_id, m.created_at);

  const agora = Date.now();
  type Lead = { etapa: string; dono: string | null; travado: boolean };
  const leads: Lead[] = clientes.map((c) => {
      const entrou = entrouEm.get(c.id);
      const prazo = diasDoSla.get(c.etapa);
      const dias = entrou ? Math.floor((agora - new Date(entrou).getTime()) / DIA_MS) : null;
      return {
        etapa: c.etapa,
        dono: c.vendedor_id_hubspot,
        travado: dias != null && !!prazo && dias > prazo,
      };
  });

  // Visitas por pessoa: contagem na janela e a data da ultima.
  const visitasPorPessoa = new Map<string, string[]>();
  for (const v of visitas) {
    if (!v.visited_by) continue;
    const lista = visitasPorPessoa.get(v.visited_by) ?? [];
    lista.push(diaBRT(v.visited_at));
    visitasPorPessoa.set(v.visited_by, lista);
  }

  const avancosPorPessoa = new Map<string, number>();
  for (const m of mudancas) {
    if (!m.created_by) continue;
    if (!janela.includes(diaBRT(m.created_at))) continue;
    if (!ehAvanco(m.from_stage, m.to_stage, ordemFunil)) continue;
    avancosPorPessoa.set(m.created_by, (avancosPorPessoa.get(m.created_by) ?? 0) + 1);
  }

  const fechadosPorOwner = new Map<string, number>();
  for (const c of (ganhosDoMes.data ?? []) as any[]) {
    if (!c.won_at || !c.vendedor_id_hubspot) continue;
    fechadosPorOwner.set(
      c.vendedor_id_hubspot,
      (fechadosPorOwner.get(c.vendedor_id_hubspot) ?? 0) + 1,
    );
  }

  const pessoas: Pessoa[] = ativos(equipe).map((p: MembroEquipe) => {
    const meus = p.ownerId ? leads.filter((l) => l.dono === p.ownerId) : [];
    const travados = meus.filter((l) => l.travado).length;
    const travadosPct = meus.length ? Math.round((travados / meus.length) * 100) : null;

    const semaforo: Semaforo =
      travadosPct == null ? 'ok' : travadosPct >= 35 ? 'critico' : travadosPct >= 15 ? 'atencao' : 'ok';

    // Gargalo: a etapa que mais concentra travados dessa pessoa.
    let gargalo: Pessoa['gargalo'] = null;
    for (const etapa of ETAPAS_FUNIL) {
      const naEtapa = meus.filter((l) => l.etapa === etapa);
      const tr = naEtapa.filter((l) => l.travado).length;
      if (tr > (gargalo?.travados ?? 0)) gargalo = { etapa, travados: tr, total: naEtapa.length };
    }

    const diasVisitados = visitasPorPessoa.get(p.perfilId) ?? [];
    const visitasNaJanela = diasVisitados.filter((d) => d >= inicioDaJanela).length;
    const metaNaJanela = p.metaVisitasDia != null ? p.metaVisitasDia * janela.length : null;
    const aderencia =
      metaNaJanela && metaNaJanela > 0 ? Math.round((visitasNaJanela / metaNaJanela) * 100) : null;

    const ultimaVisita = diasVisitados.length ? diasVisitados.slice().sort().pop()! : null;
    const diasSemVisitar = ultimaVisita
      ? diasUteisAte(hoje, 60).findIndex((d) => d <= ultimaVisita)
      : null;

    const avancos = avancosPorPessoa.get(p.perfilId) ?? 0;
    const fechados = p.ownerId ? fechadosPorOwner.get(p.ownerId) ?? 0 : 0;

    // --- roteiro: so' entra item com evidencia numerica ---------------------
    const roteiro: ItemDeRoteiro[] = [];
    if (gargalo && gargalo.travados > 0) {
      roteiro.push({
        tema: `Gargalo em ${gargalo.etapa}`,
        evidencia: `${gargalo.travados} de ${gargalo.total} leads dessa etapa passaram do prazo`,
        pergunta: `O que está faltando para esses ${gargalo.travados} saírem de ${gargalo.etapa}?`,
      });
    }
    if (aderencia != null && aderencia < 70) {
      roteiro.push({
        tema: 'Ritmo de campo abaixo da meta',
        evidencia: `${visitasNaJanela} visitas de ${metaNaJanela} possíveis nos últimos ${janela.length} dias úteis (${aderencia}%)`,
        pergunta: 'O que tem tomado o tempo que era de rua?',
      });
    }
    if (diasSemVisitar != null && diasSemVisitar >= SILENCIO_URGENTE) {
      roteiro.push({
        tema: 'Silêncio em campo',
        evidencia: `Nenhuma visita registrada há ${diasSemVisitar} dias úteis`,
        pergunta: 'Está sem registrar ou está sem sair? As duas coisas se resolvem diferente.',
      });
    } else if (diasSemVisitar == null) {
      roteiro.push({
        tema: 'Nenhuma visita registrada',
        evidencia: 'Sem nenhum check-in nos últimos 30 dias',
        pergunta: 'O app está sendo usado em campo? Antes de cobrar resultado, confirme a ferramenta.',
      });
    }
    if (meus.length > 0 && avancos === 0) {
      roteiro.push({
        tema: 'Carteira parada',
        evidencia: `${meus.length} leads em aberto e nenhum avanço de etapa em ${janela.length} dias úteis`,
        pergunta: 'Qual desses leads ainda é real? Talvez a carteira precise de limpeza, não de esforço.',
      });
    }

    // --- destaque: a boa pratica, quando existe -----------------------------
    let destaque: string | null = null;
    if (fechados > 0) destaque = `${fechados} ${fechados === 1 ? 'fechamento' : 'fechamentos'} no mês`;
    else if (aderencia != null && aderencia >= 100)
      destaque = `${aderencia}% da meta de visitas na janela`;
    else if (avancos >= 3) destaque = `${avancos} avanços de etapa em ${janela.length} dias úteis`;
    else if (travadosPct != null && travadosPct < 15 && meus.length >= 5)
      destaque = `carteira limpa — só ${travadosPct}% acima do SLA`;

    const urgencia =
      (semaforo === 'critico' ? 100 : semaforo === 'atencao' ? 50 : 0) +
      (diasSemVisitar != null && diasSemVisitar >= SILENCIO_URGENTE ? 60 : 0) +
      (diasSemVisitar == null ? 80 : 0) +
      (aderencia != null && aderencia < 70 ? 30 : 0) +
      roteiro.length * 5;

    return {
      perfilId: p.perfilId,
      ownerId: p.ownerId,
      nome: p.nome,
      carteira: meus.length,
      travados,
      travadosPct,
      semaforo,
      gargalo,
      visitasNaJanela,
      metaNaJanela,
      aderencia,
      diasSemVisitar,
      avancosNaJanela: avancos,
      fechadosNoMes: fechados,
      destaque,
      roteiro,
      urgencia,
    };
  });

  pessoas.sort((a, b) => b.urgencia - a.urgencia || a.nome.localeCompare(b.nome));

  const registros: Registro1a1[] | null = umAUm.error
    ? null
    : ((umAUm.data ?? []) as any[]).map((r) => ({
        id: r.id,
        perfilId: r.seller_id,
        data: r.realizado_em,
        pauta: r.pauta,
        combinado: r.combinado,
        autorNome: r.created_by_name,
      }));

  return { atualizadoEm: new Date(), pessoas, janelaDias: janela.length, registros };
}

/** Registra um 1:1. Devolve erro legivel em vez de lancar — a tela decide o que
 *  mostrar, inclusive o caso "a migration ainda nao rodou". */
export async function registrar1a1(entrada: {
  perfilId: string;
  pauta: string;
  combinado: string;
}): Promise<{ ok: boolean; erro?: string }> {
  const { data: sessao } = await supabase.auth.getUser();
  const autorId = sessao?.user?.id ?? null;

  // O nome vem de `profiles`, nao de user_metadata: e' onde este app guarda o
  // nome de verdade. Lendo do metadata, o historico de 1:1 apareceria assinado
  // por e-mail — e o snapshot do autor existe justamente pra continuar legivel
  // daqui a um ano.
  let autorNome: string | null = sessao?.user?.email ?? null;
  if (autorId) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', autorId)
      .maybeSingle();
    autorNome = (perfil as any)?.full_name?.trim() || autorNome;
  }

  const { error } = await supabase.from('um_a_um').insert({
    seller_id: entrada.perfilId,
    pauta: entrada.pauta.trim() || null,
    combinado: entrada.combinado.trim() || null,
    created_by: autorId,
    created_by_name: autorNome,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}
