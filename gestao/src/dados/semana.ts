// Camada de dados do Resumo Semanal — "o que mudou e o que eu faco?".
//
// Compara a semana CIVIL corrente com a anterior. Civil, nunca rolante: o doc
// lista a janela rolante como erro do original — "esta semana" mostrando terca
// a terca da o numero certo com o rotulo errado.
//
// UMA HONESTIDADE SOBRE A COMPARACAO
// Na segunda-feira a semana corrente tem 1 dia e a anterior tem 5. Comparar as
// duas cruas diria "caiu 80%" toda segunda de manha, o que e' ruido, nao
// leitura. Por isso devolvemos `diasDecorridos` das duas janelas e a tela avisa
// quando a comparacao ainda esta' incompleta. Nao normalizamos o numero: numero
// inventado pra "corrigir" a janela e' pior que numero com ressalva.
//
// A PROSA DA IA (fase 8 do doc) NAO ESTA' AQUI. Os numeros abaixo sao o insumo
// dela — o doc e' explicito: "numero vem do banco, IA escreve texto, nunca o
// contrario". Enquanto nao houver gerador configurado, a tela mostra os numeros
// sem narrativa, que e' um estado honesto e nao um estado quebrado.
import { supabase } from '../supabase';
import { buscarTudo } from './paginar';
import { ETAPAS_FUNIL } from './cockpit';
import { carregarEquipe, ativos, type MembroEquipe } from './equipe';
import { calcularDelta, ehAvanco, type Delta } from './regras';
import { diaBRT, diasDaSemana, segundaDaSemana } from './datas';

const ETAPA_PROPOSTA = 'Demo/Proposta';
const ETAPA_PERDIDO = 'Perdido';

export interface LeadCitado {
  id: string;
  nome: string;
  quem: string | null;
  /** perfilId de quem fez. A atribuicao por linha usa ISTO, e nao o nome:
   *  comparar string de nome quebra com homonimo e com nome nulo. */
  quemId: string | null;
}

export interface MetricaSemanal {
  chave: string;
  rotulo: string;
  delta: Delta;
  /** Leads por tras do numero da semana corrente — o card e' clicavel. */
  leads: LeadCitado[];
}

export interface LinhaSemanal {
  perfilId: string;
  nome: string;
  visitas: Delta;
  avancos: Delta;
  ganhos: Delta;
  /** Soma simples pra ordenar quem caiu mais. */
  piora: number;
}

export interface DadosSemana {
  atualizadoEm: Date;
  janela: { inicio: string; fim: string };
  janelaAnterior: { inicio: string; fim: string };
  diasDecorridos: number;
  comparacaoCompleta: boolean;
  metricas: MetricaSemanal[];
  linhas: LinhaSemanal[];
  /** Atividade da semana que NAO aparece em nenhuma linha da tabela: gente
   *  desativada, marcada como nao-vendedor, ou sem perfil. Os cards contam a
   *  operacao inteira e a tabela so' os listados — sem este numero explicito,
   *  a soma das linhas nao bate com o card e a tela perde a credibilidade. */
  foraDaLista: { visitas: number; avancos: number; ganhos: number; quem: string[] };
}

export interface LeituraIA {
  texto: string | null;
  falha: string | null;
  geradoEm: string;
  janela: { inicio: string; fim: string };
  modelo: string | null;
}

/** Le' a leitura mais recente. Devolve `null` quando a tabela nao existe ainda
 *  (migration nao rodada) — a tela trata isso como "recurso nao ligado", que e'
 *  diferente de "falhou". */
export async function carregarLeituraIA(): Promise<LeituraIA | null> {
  const { data, error } = await supabase
    .from('resumos_ia')
    .select('texto, falha, gerado_em, janela_inicio, janela_fim, modelo')
    .eq('tipo', 'semanal')
    .order('gerado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    texto: (data as any).texto,
    falha: (data as any).falha,
    geradoEm: (data as any).gerado_em,
    janela: { inicio: (data as any).janela_inicio, fim: (data as any).janela_fim },
    modelo: (data as any).modelo,
  };
}

/** Dispara a geracao. Erro volta como valor, nao como excecao — o estado
 *  "nao configurado" e' comum e nao e' bug. */
export async function gerarLeituraIA(
  dados: DadosSemana,
): Promise<{ ok: boolean; texto?: string; erro?: string; configuravel?: boolean }> {
  const { data, error } = await supabase.functions.invoke('resumo-semanal', {
    body: {
      janela: dados.janela,
      janelaAnterior: dados.janelaAnterior,
      diasDecorridos: dados.diasDecorridos,
      comparacaoCompleta: dados.comparacaoCompleta,
      // Vao junto ate' 6 nomes de lead por metrica. Sem eles a IA so' consegue
      // escrever "avaliar a qualidade das propostas"; com eles ela consegue
      // "cobrar a proposta do Fulano". A acao vira executavel em vez de
      // conselho generico — foi exatamente o que falhou na primeira geracao.
      metricas: dados.metricas.map((m) => ({
        rotulo: m.rotulo,
        delta: m.delta,
        exemplos: m.leads.slice(0, 6).map((l) => l.nome),
        totalDeExemplos: m.leads.length,
      })),
      linhas: dados.linhas.map((l) => ({
        nome: l.nome,
        visitas: l.visitas,
        avancos: l.avancos,
        ganhos: l.ganhos,
      })),
    },
  });

  if (error) {
    // O corpo do erro tem a mensagem util (ex.: chave nao configurada); o
    // objeto de erro do supabase-js so' diz "non-2xx status code".
    let detalhe = error.message;
    let configuravel = false;
    try {
      const corpo = await (error as any).context?.json?.();
      if (corpo?.error) detalhe = corpo.error;
      if (corpo?.configuravel) configuravel = true;
    } catch {
      /* mantem a mensagem generica */
    }
    return { ok: false, erro: detalhe, configuravel };
  }
  if ((data as any)?.error) return { ok: false, erro: (data as any).error };
  return { ok: true, texto: (data as any)?.texto };
}

export async function carregarSemana(): Promise<DadosSemana> {
  const hoje = diaBRT(new Date());
  const estaSemana = diasDaSemana(hoje);

  // A semana anterior = a civil que contem o dia anterior a' segunda desta.
  const domingoPassado = new Date(`${segundaDaSemana(hoje)}T12:00:00Z`);
  domingoPassado.setUTCDate(domingoPassado.getUTCDate() - 1);
  const semanaPassada = diasDaSemana(domingoPassado.toISOString().slice(0, 10));

  const inicio = semanaPassada[0];
  const fimBusca = new Date(`${estaSemana[4]}T12:00:00Z`);
  fimBusca.setUTCDate(fimBusca.getUTCDate() + 1);

  const [equipe, mudancas, visitas, clientes] = await Promise.all([
    carregarEquipe(),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('client_stage_changes')
        .select('client_id, created_by, created_at, from_stage, to_stage')
        .gte('created_at', `${inicio}T00:00:00Z`)
        .range(de, ate),
    ),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('client_visits')
        .select('client_id, visited_by, visited_at')
        .gte('visited_at', `${inicio}T00:00:00Z`)
        .range(de, ate),
    ),
    buscarTudo<any>((de, ate) =>
      supabase
        .from('clients')
        .select('id, nome, empresa, won_at, vendedor_id_hubspot')
        .range(de, ate),
    ),
  ]);

  const ordemFunil = new Map((ETAPAS_FUNIL as readonly string[]).map((e, i) => [e, i] as const));
  const nomeDoCliente = new Map<string, string>(
    clientes.map((c) => [c.id, (c.empresa || '').trim() || c.nome || 'sem nome']),
  );
  const nomePorPerfil = new Map(ativos(equipe).map((p) => [p.perfilId, p.nome]));
  const nomePorOwner = new Map(
    ativos(equipe)
      .filter((p) => p.ownerId)
      .map((p) => [p.ownerId!, p.nome]),
  );
  const perfilPorOwner = new Map(
    ativos(equipe)
      .filter((p) => p.ownerId)
      .map((p) => [p.ownerId!, p.perfilId]),
  );
  const listados = new Set(ativos(equipe).map((p) => p.perfilId));

  const naSemana = (dias: string[], iso: string) => dias.includes(diaBRT(iso));

  // --- coleta por janela ---------------------------------------------------
  type Balde = { visitas: LeadCitado[]; avancos: LeadCitado[]; propostas: LeadCitado[]; perdidos: LeadCitado[]; ganhos: LeadCitado[] };
  const vazio = (): Balde => ({ visitas: [], avancos: [], propostas: [], perdidos: [], ganhos: [] });
  const atual = vazio();
  const anterior = vazio();

  // Por pessoa, so' da janela corrente e da anterior, pras linhas do time.
  const porPessoa = new Map<string, { atual: Balde; anterior: Balde }>();
  const dePessoa = (id: string) => {
    let b = porPessoa.get(id);
    if (!b) porPessoa.set(id, (b = { atual: vazio(), anterior: vazio() }));
    return b;
  };

  for (const v of visitas) {
    const item: LeadCitado = {
      id: v.client_id,
      nome: nomeDoCliente.get(v.client_id) ?? 'lead removido',
      quem: v.visited_by ? nomePorPerfil.get(v.visited_by) ?? null : null,
      quemId: v.visited_by ?? null,
    };
    const alvo = naSemana(estaSemana, v.visited_at)
      ? 'atual'
      : naSemana(semanaPassada, v.visited_at)
        ? 'anterior'
        : null;
    if (!alvo) continue;
    (alvo === 'atual' ? atual : anterior).visitas.push(item);
    if (v.visited_by) dePessoa(v.visited_by)[alvo].visitas.push(item);
  }

  for (const m of mudancas) {
    const alvo = naSemana(estaSemana, m.created_at)
      ? 'atual'
      : naSemana(semanaPassada, m.created_at)
        ? 'anterior'
        : null;
    if (!alvo) continue;
    const item: LeadCitado = {
      id: m.client_id,
      nome: nomeDoCliente.get(m.client_id) ?? 'lead removido',
      quem: m.created_by ? nomePorPerfil.get(m.created_by) ?? null : null,
      quemId: m.created_by ?? null,
    };
    const balde = alvo === 'atual' ? atual : anterior;

    if (m.to_stage === ETAPA_PERDIDO) {
      balde.perdidos.push(item);
    } else if (m.to_stage === ETAPA_PROPOSTA) {
      balde.propostas.push(item);
      if (m.created_by) dePessoa(m.created_by)[alvo].propostas.push(item);
    } else if (ehAvanco(m.from_stage, m.to_stage, ordemFunil)) {
      balde.avancos.push(item);
      if (m.created_by) dePessoa(m.created_by)[alvo].avancos.push(item);
    }
  }

  for (const c of clientes) {
    if (!c.won_at) continue;
    const alvo = naSemana(estaSemana, c.won_at)
      ? 'atual'
      : naSemana(semanaPassada, c.won_at)
        ? 'anterior'
        : null;
    if (!alvo) continue;
    const item: LeadCitado = {
      id: c.id,
      nome: (c.empresa || '').trim() || c.nome || 'sem nome',
      quem: c.vendedor_id_hubspot ? nomePorOwner.get(c.vendedor_id_hubspot) ?? null : null,
      quemId: c.vendedor_id_hubspot ? perfilPorOwner.get(c.vendedor_id_hubspot) ?? null : null,
    };
    (alvo === 'atual' ? atual : anterior).ganhos.push(item);
  }

  const diasDecorridos = estaSemana.filter((d) => d <= hoje).length;

  const metricas: MetricaSemanal[] = [
    { chave: 'ganhos', rotulo: 'Fechamentos', inverter: false },
    { chave: 'propostas', rotulo: 'Propostas', inverter: false },
    { chave: 'avancos', rotulo: 'Avanços de etapa', inverter: false },
    { chave: 'visitas', rotulo: 'Visitas', inverter: false },
    // Unica metrica em que MENOS e' melhor. Sem o `inverter`, uma semana com o
    // dobro de perdas apareceria em verde.
    { chave: 'perdidos', rotulo: 'Perdidos', inverter: true },
  ].map((m) => {
    const a = atual[m.chave as keyof Balde];
    const b = anterior[m.chave as keyof Balde];
    return {
      chave: m.chave,
      rotulo: m.rotulo,
      delta: calcularDelta(a.length, b.length, m.inverter),
      leads: a,
    };
  });

  const linhas: LinhaSemanal[] = ativos(equipe)
    .map((p: MembroEquipe) => {
      const b = porPessoa.get(p.perfilId) ?? { atual: vazio(), anterior: vazio() };
      const ganhosAtual = atual.ganhos.filter((g) => g.quemId === p.perfilId).length;
      const ganhosAnterior = anterior.ganhos.filter((g) => g.quemId === p.perfilId).length;
      const visitas = calcularDelta(b.atual.visitas.length, b.anterior.visitas.length);
      const avancos = calcularDelta(b.atual.avancos.length, b.anterior.avancos.length);
      const ganhos = calcularDelta(ganhosAtual, ganhosAnterior);
      return {
        perfilId: p.perfilId,
        nome: p.nome,
        visitas,
        avancos,
        ganhos,
        piora: [visitas, avancos, ganhos].filter((d) => d.tom === 'ruim').length,
      };
    })
    .sort((a, b) => b.piora - a.piora || a.visitas.diferenca - b.visitas.diferenca);

  // O que sobra entre o card e a tabela. Nao e' erro de conta: e' atividade de
  // quem esta' fora do recorte de "ativos" (desativado, nao-vendedor, ou sem
  // perfil ligado). Mostrar o resto explicitamente e' melhor que esconder — e
  // muito melhor que deixar o gestor somar a coluna e achar que a tela mente.
  const foraDoRecorte = (itens: LeadCitado[]) =>
    itens.filter((i) => !i.quemId || !listados.has(i.quemId));

  const orfaos = [
    ...foraDoRecorte(atual.visitas),
    ...foraDoRecorte(atual.avancos),
    ...foraDoRecorte(atual.ganhos),
  ];
  const foraDaLista = {
    visitas: foraDoRecorte(atual.visitas).length,
    avancos: foraDoRecorte(atual.avancos).length,
    ganhos: foraDoRecorte(atual.ganhos).length,
    quem: [...new Set(orfaos.map((i) => i.quem).filter((n): n is string => !!n))],
  };

  return {
    atualizadoEm: new Date(),
    janela: { inicio: estaSemana[0], fim: estaSemana[4] },
    janelaAnterior: { inicio: semanaPassada[0], fim: semanaPassada[4] },
    diasDecorridos,
    comparacaoCompleta: diasDecorridos >= 5,
    metricas,
    linhas,
    foraDaLista,
  };
}
