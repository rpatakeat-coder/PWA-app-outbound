// Camada de dados da Daily — o placar da reuniao das 9h.
//
// Responde "quem prometeu, quem cumpriu, quem esta' vazio?" (02-FUNCIONALIDADES.md).
//
// ONDE ESTA' A PROMESSA
// O cockpit original guardava a Daily numa tabela `dailies`, onde o executivo
// digitava de manha quantas visitas prometia. Nao criei essa tabela — a
// promessa ja' existe neste app, num formato melhor: a ROTA DO DIA.
//
// Quando o vendedor monta e salva a rota (useFieldOps.saveRoute), nasce uma
// field_routes com status 'planned' e uma field_route_stops por lead. Isso nao
// e' "prometo 8 visitas": e' "prometo ESTES 8 lugares". Promessa especifica,
// feita por ato deliberado, e que ele ja' fazia antes desta tela existir.
//
// Entao:
//   prometido = paradas planejadas na rota daquele dia
//   realizado = check-ins (client_visits)
//   cumpriu   = realizado >= prometido
//
// Sem rota no dia, o piso e' a meta permanente de visitas (equipe.ts) — e a
// tela diz qual das duas esta' medindo, porque "nao cumpriu a rota que montou"
// e "ficou abaixo da meta padrao" sao conversas diferentes.
//
// O REALIZADO E' 100% DERIVADO — ninguem digita:
//   visitas ..... client_visits (check-in com GPS)
//   avancos ..... client_stage_changes que subiram no funil
//   propostas ... mudancas que chegaram em Demo/Proposta
//   fechamentos . clients.won_at (a data real de fechamento, vinda do HubSpot)
//
// FUSO: toda conta de "hoje" e "esta semana" e' em horario de Brasilia. O doc
// lista o erro oposto como um dos que mais custou no sistema original — datas em
// UTC faziam a janela virar depois das 21h e as visitas do dia sumirem.
import { supabase } from '../supabase';
import { buscarTudo } from './paginar';
import { ETAPAS_FUNIL } from './cockpit';
import { carregarEquipe, ativos, type MembroEquipe } from './equipe';
import { pontosDoDia, ehAvanco } from './regras';
import { diaBRT, ehDiaUtil, diasUteisAte } from './datas';

export { diaBRT, ehDiaUtil, diasUteisAte };

const ETAPA_PROPOSTA = 'Demo/Proposta';

/** Quantos dias uteis a sequencia olha pra tras. O doc pede teto de 60. */
const TETO_SEQUENCIA = 60;
/** Janela buscada no banco. 90 dias corridos cobrem os 60 uteis com folga. */
const DIAS_DE_HISTORICO = 90;

export interface DiaDoExecutivo {
  dia: string;
  visitas: number;
  avancos: number;
  propostas: number;
  fechamentos: number;
  pontos: number;
  /** Paradas planejadas na rota daquele dia. null = nao montou rota. */
  prometido: number | null;
  /** Contra o que estamos medindo: a rota que ELE montou, ou a meta padrao. */
  medidoPor: 'rota' | 'meta' | null;
  /** Rota montada a mao pesa mais que rota sugerida e aceita — as duas sao
   *  compromisso, mas so' a primeira e' plano dele. */
  rotaManual: boolean;
  /** Cumpriu o que valia pra aquele dia. null quando nao ha' nem rota nem meta. */
  cumpriu: boolean | null;
}

export interface ExecutivoDaily {
  perfilId: string;
  ownerId: string | null;
  nome: string;
  metaVisitas: number | null;
  hoje: DiaDoExecutivo;
  /** Os 5 ultimos dias uteis, do mais antigo pro mais novo (ordem de leitura). */
  semana: DiaDoExecutivo[];
  /** Dias uteis consecutivos CUMPRINDO o combinado, contando de ontem pra tras.
   *  null quando nao ha' nem rota nem meta pra comparar. */
  sequencia: number | null;
  /** O que ele fez hoje, por nome — a linha de execucao que o doc pede. */
  execucao: {
    visitas: string[];
    avancos: string[];
    propostas: string[];
    fechamentos: string[];
  };
}

export interface DadosDaily {
  atualizadoEm: Date;
  hoje: string;
  ehDiaUtil: boolean;
  executivos: ExecutivoDaily[];
  totais: { visitas: number; avancos: number; propostas: number; fechamentos: number; pontos: number };
  /** Marcados como 'sem_meta' pelo gestor — nao ha' "bateu" pra eles, e isso e'
   *  uma escolha dele, nao um cadastro faltando. A tela nao cobra nada. */
  semMeta: number;
  /** Meta diaria vinda de route_config, usada por quem nao tem meta propria. */
  metaGlobal: number;
  /** Quantos rodam com meta PROPRIA. Se for 0, o placar inteiro esta' medindo
   *  contra o mesmo numero global — util saber antes de cobrar alguem. */
  comMetaPropria: number;
  /** Quantos montaram rota hoje, ou seja: quantos estao sendo medidos contra a
   *  propria promessa em vez da meta padrao. */
  comRotaHoje: number;
}

const ordemFunil = new Map((ETAPAS_FUNIL as readonly string[]).map((e, i) => [e, i] as const));

export async function carregarDaily(): Promise<DadosDaily> {
  const hoje = diaBRT(new Date());
  const desde = new Date(Date.now() - DIAS_DE_HISTORICO * 86_400_000).toISOString();

  const [equipe, visitas, mudancas, clientes, rotas] = await Promise.all([
    carregarEquipe(),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('client_visits')
        .select('client_id, visited_by, visited_at')
        .gte('visited_at', desde)
        .range(de, ate),
    ),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('client_stage_changes')
        .select('client_id, created_by, created_at, from_stage, to_stage')
        .gte('created_at', desde)
        .range(de, ate),
    ),
    buscarTudo<any>((de, ate) =>
      supabase.from('clients').select('id, nome, empresa, won_at, vendedor_id_hubspot').range(de, ate),
    ),
    // As paradas vem ANINHADAS na rota, num round trip so' — mesmo padrao do
    // useRouteHistory no app de campo. Sao ~1 linha por vendedor por dia no
    // nivel de cima, entao a paginacao trabalha sobre um conjunto pequeno.
    buscarTudo<any>((de, ate) =>
      supabase
        .from('field_routes')
        .select('seller_id, route_date, status, source, field_route_stops(status)')
        .gte('route_date', diasUteisAte(diaBRT(new Date()), TETO_SEQUENCIA).slice(-1)[0])
        .range(de, ate),
    ),
  ]);

  const nomeDoCliente = new Map<string, string>(
    clientes.map((c) => [c.id, (c.empresa || '').trim() || c.nome || 'sem nome']),
  );


  // --- indexacao por (pessoa, dia) ----------------------------------------
  // As visitas e mudancas sao chaveadas pelo id do USUARIO (auth.users), e os
  // fechamentos pelo owner do HubSpot. Sao dois espacos de id diferentes, e por
  // isso a ponte por profiles.id_hubspot precisa ser explicita.
  type Balde = { visitas: string[]; avancos: string[]; propostas: string[]; fechamentos: string[] };
  const vazio = (): Balde => ({ visitas: [], avancos: [], propostas: [], fechamentos: [] });
  const porPessoaDia = new Map<string, Balde>();
  const chave = (pessoa: string, dia: string) => `${pessoa}|${dia}`;
  const balde = (pessoa: string, dia: string): Balde => {
    const k = chave(pessoa, dia);
    let b = porPessoaDia.get(k);
    if (!b) porPessoaDia.set(k, (b = vazio()));
    return b;
  };

  for (const v of visitas) {
    if (!v.visited_by) continue;
    balde(v.visited_by, diaBRT(v.visited_at)).visitas.push(
      nomeDoCliente.get(v.client_id) ?? 'lead removido',
    );
  }

  for (const m of mudancas) {
    if (!m.created_by) continue;
    const b = balde(m.created_by, diaBRT(m.created_at));
    const nome = nomeDoCliente.get(m.client_id) ?? 'lead removido';
    // Proposta e avanco sao contados SEPARADO pra nao pontuar duas vezes a
    // mesma mudanca: chegar em Demo/Proposta conta so' como proposta (40),
    // nao como proposta + avanco (65).
    if (m.to_stage === ETAPA_PROPOSTA) b.propostas.push(nome);
    else if (ehAvanco(m.from_stage, m.to_stage, ordemFunil)) b.avancos.push(nome);
  }

  // Fechamentos: won_at e' por OWNER do HubSpot, entao indexamos separado e
  // cruzamos na hora de montar cada executivo.
  const fechamentosPorOwnerDia = new Map<string, string[]>();
  for (const c of clientes) {
    if (!c.won_at || !c.vendedor_id_hubspot) continue;
    const k = chave(c.vendedor_id_hubspot, diaBRT(c.won_at));
    const lista = fechamentosPorOwnerDia.get(k) ?? [];
    lista.push((c.empresa || '').trim() || c.nome || 'sem nome');
    fechamentosPorOwnerDia.set(k, lista);
  }

  // --- a promessa: paradas planejadas por (pessoa, dia) --------------------
  // 'cancelled' nao conta: cancelar a rota nao pode deixar o dia parecendo
  // prometido. 'removed' tambem sai — parada removida saiu do plano.
  const promessaPor = new Map<string, { paradas: number; manual: boolean }>();
  for (const r of rotas) {
    if (r.status === 'cancelled') continue;
    const paradas = (r.field_route_stops ?? []).filter(
      (p: any) => p.status !== 'removed',
    ).length;
    if (paradas === 0) continue; // rota vazia nao e' promessa
    promessaPor.set(`${r.seller_id}|${r.route_date}`, {
      paradas,
      manual: r.source === 'manual',
    });
  }

  const cincoDias = diasUteisAte(hoje, 5).reverse(); // do mais antigo pro mais novo
  const diasDaSequencia = diasUteisAte(hoje, TETO_SEQUENCIA);

  // Quem entra no placar.
  //
  // `seller_classification` e' a curadoria oficial, mas ela esta' vazia hoje —
  // e "sem linha" significa 'ativo'. Sozinha, ela colocaria gestores que nao
  // vendem no topo da lista, marcados como "sem registro hoje": exatamente o
  // ruido que a reuniao das 9h nao pode ter.
  //
  // Entao pedimos um sinal de que a pessoa e' de campo: ter carteira no HubSpot
  // OU ter registrado alguma coisa na janela. O segundo criterio existe pra que
  // um vendedor sem owner id (cadastro incompleto) nao suma do placar
  // justamente por estar trabalhando.
  //
  // Quando o gestor curar a classificacao, marcar alguem como 'nao_vendedor'
  // passa a bastar — e este filtro vira redundante, nao errado.
  const teveAtividade = new Set<string>();
  for (const v of visitas) if (v.visited_by) teveAtividade.add(v.visited_by);
  for (const m of mudancas) if (m.created_by) teveAtividade.add(m.created_by);

  const executivos: ExecutivoDaily[] = ativos(equipe)
    .filter((p: MembroEquipe) => p.ownerId || teveAtividade.has(p.perfilId))
    .map((p: MembroEquipe) => {
      const meta = p.metaVisitasDia;

      const doDia = (dia: string): DiaDoExecutivo => {
        const b = porPessoaDia.get(chave(p.perfilId, dia)) ?? vazio();
        const fech = p.ownerId
          ? fechamentosPorOwnerDia.get(chave(p.ownerId, dia)) ?? []
          : [];
        const bruto = {
          visitas: b.visitas.length,
          avancos: b.avancos.length,
          propostas: b.propostas.length,
          fechamentos: fech.length,
        };
        // A promessa do dia vence a meta permanente. Se ele montou rota, e' a
        // rota dele que vale — cobrar contra a meta padrao quando ele planejou
        // outra coisa seria medir a pessoa por um numero que ela nao escolheu.
        const promessa = promessaPor.get(chave(p.perfilId, dia));
        const alvo = promessa?.paradas ?? meta;
        const medidoPor: 'rota' | 'meta' | null = promessa ? 'rota' : meta != null ? 'meta' : null;

        return {
          dia,
          ...bruto,
          pontos: pontosDoDia(bruto),
          prometido: promessa?.paradas ?? null,
          medidoPor,
          rotaManual: promessa?.manual ?? false,
          cumpriu: alvo == null ? null : bruto.visitas >= alvo,
        };
      };

      // A sequencia conta de ONTEM pra tras: o dia de hoje ainda esta'
      // acontecendo, e zera-lo as 9h da manha faria o placar mentir todo dia.
      let sequencia: number | null = null;
      if (meta != null || promessaPor.has(chave(p.perfilId, hoje))) {
        sequencia = 0;
        for (const dia of diasDaSequencia.slice(1)) {
          const d = doDia(dia);
          // Dia sem rota E sem meta nao quebra a sequencia nem conta: nao ha'
          // com o que comparar, e zerar por falta de dado puniria a pessoa por
          // uma lacuna de cadastro.
          if (d.cumpriu === null) continue;
          if (d.cumpriu) sequencia++;
          else break;
        }
      }

      const b = porPessoaDia.get(chave(p.perfilId, hoje)) ?? vazio();
      return {
        perfilId: p.perfilId,
        ownerId: p.ownerId,
        nome: p.nome,
        metaVisitas: meta,
        hoje: doDia(hoje),
        semana: cincoDias.map(doDia),
        sequencia,
        execucao: {
          visitas: b.visitas,
          avancos: b.avancos,
          propostas: b.propostas,
          fechamentos: p.ownerId
            ? fechamentosPorOwnerDia.get(chave(p.ownerId, hoje)) ?? []
            : [],
        },
      };
    })
    // Excecoes primeiro, como o doc pede: quem nao fez nada hoje encabeca a
    // reuniao. Depois, por pontos.
    .sort((a, b) => a.hoje.pontos - b.hoje.pontos || b.hoje.visitas - a.hoje.visitas);

  const totais = executivos.reduce(
    (s, e) => ({
      visitas: s.visitas + e.hoje.visitas,
      avancos: s.avancos + e.hoje.avancos,
      propostas: s.propostas + e.hoje.propostas,
      fechamentos: s.fechamentos + e.hoje.fechamentos,
      pontos: s.pontos + e.hoje.pontos,
    }),
    { visitas: 0, avancos: 0, propostas: 0, fechamentos: 0, pontos: 0 },
  );

  return {
    atualizadoEm: new Date(),
    hoje,
    ehDiaUtil: ehDiaUtil(hoje),
    executivos,
    totais,
    semMeta: executivos.filter((e) => e.metaVisitas == null).length,
    comRotaHoje: executivos.filter((e) => e.hoje.prometido != null).length,
    metaGlobal: equipe.metaGlobal,
    comMetaPropria: ativos(equipe).filter((m) => !m.metaEhGlobal && m.metaVisitasDia != null)
      .length,
  };
}
