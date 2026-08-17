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
  audioCaminho: string | null;
  audioBytes: number | null;
  transcricao: string | null;
  transcricaoErro: string | null;
  documentos: DocumentoDe1a1[];
}

export interface DocumentoDe1a1 {
  id: string;
  nome: string;
  caminho: string;
  tipo: string | null;
  bytes: number | null;
  enviadoPorNome: string | null;
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
      .select(
        'id, seller_id, realizado_em, pauta, combinado, created_by_name, ' +
          'audio_caminho, audio_bytes, transcricao, transcricao_erro',
      )
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

  // Documentos dos registros carregados, numa consulta so'. A tabela pode nao
  // existir ainda (migration nao rodada) — nesse caso cada registro fica com
  // lista vazia e o resto da tela nao muda.
  const docsPorRegistro = new Map<string, DocumentoDe1a1[]>();
  if (!umAUm.error) {
    const ids = ((umAUm.data ?? []) as any[]).map((r) => r.id);
    if (ids.length) {
      const { data: docs } = await supabase
        .from('um_a_um_documentos')
        .select('id, registro_id, nome, caminho, tipo, bytes, enviado_por_nome')
        .in('registro_id', ids)
        .order('created_at', { ascending: true });
      for (const d of (docs ?? []) as any[]) {
        const lista = docsPorRegistro.get(d.registro_id) ?? [];
        lista.push({
          id: d.id,
          nome: d.nome,
          caminho: d.caminho,
          tipo: d.tipo ?? null,
          bytes: d.bytes ?? null,
          enviadoPorNome: d.enviado_por_nome ?? null,
        });
        docsPorRegistro.set(d.registro_id, lista);
      }
    }
  }

  const registros: Registro1a1[] | null = umAUm.error
    ? null
    : ((umAUm.data ?? []) as any[]).map((r) => ({
        id: r.id,
        perfilId: r.seller_id,
        data: r.realizado_em,
        pauta: r.pauta,
        combinado: r.combinado,
        autorNome: r.created_by_name,
        audioCaminho: r.audio_caminho ?? null,
        audioBytes: r.audio_bytes ?? null,
        transcricao: r.transcricao ?? null,
        transcricaoErro: r.transcricao_erro ?? null,
        documentos: docsPorRegistro.get(r.id) ?? [],
      }));

  return { atualizadoEm: new Date(), pessoas, janelaDias: janela.length, registros };
}

/** Registra um 1:1. Devolve erro legivel em vez de lancar — a tela decide o que
 *  mostrar, inclusive o caso "a migration ainda nao rodou". */
export async function registrar1a1(entrada: {
  perfilId: string;
  pauta: string;
  combinado: string;
}): Promise<{ ok: boolean; erro?: string; id?: string }> {
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

  const { data, error } = await supabase
    .from('um_a_um')
    .insert({
      seller_id: entrada.perfilId,
      pauta: entrada.pauta.trim() || null,
      combinado: entrada.combinado.trim() || null,
      created_by: autorId,
      created_by_name: autorNome,
    })
    .select('id')
    .single();
  if (error) return { ok: false, erro: error.message };
  return { ok: true, id: (data as any)?.id };
}

const BUCKET = 'um-a-um';

/** Sobe o audio e amarra ao registro.
 *
 *  O caminho leva o id do vendedor E o do registro: agrupa por pessoa (util pra
 *  auditar ou limpar depois) e nunca colide. `upsert: true` deixa regravar o
 *  mesmo 1:1 sem duplicar arquivo no bucket. */
export async function anexarAudio1a1(
  registroId: string,
  perfilId: string,
  arquivo: Blob,
): Promise<{ ok: boolean; erro?: string }> {
  const tipo = arquivo.type || 'audio/webm';
  const ext = tipo.includes('mp4') || tipo.includes('m4a')
    ? 'm4a'
    : tipo.includes('mpeg') || tipo.includes('mp3')
      ? 'mp3'
      : tipo.includes('wav')
        ? 'wav'
        : 'webm';
  const caminho = `${perfilId}/${registroId}.${ext}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: tipo, upsert: true });
  if (erroUpload) return { ok: false, erro: erroUpload.message };

  const { error } = await supabase
    .from('um_a_um')
    .update({ audio_caminho: caminho, audio_tipo: tipo, audio_bytes: arquivo.size })
    .eq('id', registroId);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** URL assinada pra ouvir. Vida curta de proposito: e' a gravacao de uma
 *  conversa entre gestor e subordinado, nao um arquivo pra circular. */
export async function urlDoAudio(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}

/** Higieniza o nome pro caminho do bucket.
 *
 *  A chave do storage nao aceita acento, espaco nem barra com seguranca — e
 *  "Plano de A\u00e7\u00e3o 2026 (final).pdf" tem os tres. O nome ORIGINAL fica na
 *  coluna `nome`, que e' o que a pessoa ve' e o que ela baixa. */
function higienizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

/** Teto por arquivo. O Supabase corta em 50 MB por padrao; parar antes deixa a
 *  mensagem legivel em vez de um erro de infraestrutura no meio do upload. */
export const LIMITE_DOC_BYTES = 25 * 1024 * 1024;

export async function anexarDocumento1a1(
  registroId: string,
  perfilId: string,
  arquivo: File,
): Promise<{ ok: boolean; erro?: string }> {
  if (arquivo.size > LIMITE_DOC_BYTES) {
    return {
      ok: false,
      erro: `"${arquivo.name}" tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB e o limite e' 25 MB.`,
    };
  }

  const id = crypto.randomUUID();
  const caminho = `${perfilId}/${registroId}/docs/${id}-${higienizar(arquivo.name)}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false });
  if (erroUpload) return { ok: false, erro: erroUpload.message };

  const { data: sessao } = await supabase.auth.getUser();
  let autorNome: string | null = sessao?.user?.email ?? null;
  if (sessao?.user?.id) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', sessao.user.id)
      .maybeSingle();
    autorNome = (perfil as any)?.full_name?.trim() || autorNome;
  }

  const { error } = await supabase.from('um_a_um_documentos').insert({
    id,
    registro_id: registroId,
    caminho,
    nome: arquivo.name,
    tipo: arquivo.type || null,
    bytes: arquivo.size,
    enviado_por: sessao?.user?.id ?? null,
    enviado_por_nome: autorNome,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** URL assinada pra baixar. `download` faz o navegador salvar com o nome
 *  ORIGINAL em vez de abrir com o nome higienizado do bucket. */
export async function urlDoDocumento(caminho: string, nome: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(caminho, 3600, { download: nome });
  return data?.signedUrl ?? null;
}

/** Remove o vinculo. O arquivo permanece no bucket de proposito — mesma escolha
 *  do audio: some o registro, sumiria tambem a prova do que foi apresentado. */
export async function removerDocumento1a1(id: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase.from('um_a_um_documentos').delete().eq('id', id);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Dispara a transcricao. O audio NAO sobe de novo — quem baixa do bucket e' a
 *  edge function, com service role. */
export async function transcrever1a1(
  registroId: string,
): Promise<{ ok: boolean; texto?: string; erro?: string; configuravel?: boolean }> {
  const { data, error } = await supabase.functions.invoke('transcrever-1a1', {
    body: { registroId },
  });
  if (error) {
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
