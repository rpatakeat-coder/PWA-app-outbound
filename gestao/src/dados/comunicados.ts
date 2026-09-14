// Comunicados — o recado do gestor, com confirmação de leitura.
//
// O que distingue isto da `pauta_do_lider` (o caderno do gestor, só dele) é a
// segunda tabela: aqui existe confirmação. Um recado sem confirmação é um
// recado que o gestor ACHA que deu — e a diferença entre "avisei" e "eles
// souberam" é onde nasce metade dos desencontros de operação.
//
// A REGRA QUE O BANCO GUARDA: quem confirma é o próprio leitor, e só por si
// mesmo (`with check (leitor_id = auth.uid())`). Nem o gestor marca por outro.
// "Fulano leu" precisa vir do Fulano, senão o número de leitura vira enfeite.
import { supabase } from '../supabase';

const TABELA_AUSENTE = 'PGRST205';
const ehTabelaAusente = (erro: { code?: string } | null) => erro?.code === TABELA_AUSENTE;

export type Indisponivel = { indisponivel: true; motivo: string };

export type Comunicado = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  publicadoEm: string | null;
  criadoPor: string | null;
  criadoEm: string;
  /** Quem confirmou a leitura. Nomes, para a tela não ter de cruzar de novo. */
  leram: string[];
  /** Quantas pessoas de campo ativas existiam quando a tela leu. */
  alcance: number;
};

export type DadosComunicados = {
  atualizadoEm: Date;
  itens: Comunicado[];
  indisponivel: string | null;
};

export async function carregarComunicados(): Promise<DadosComunicados> {
  const { data, error } = await supabase
    .from('comunicados')
    .select('id, tipo, titulo, mensagem, publicado_em, created_by_name, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    if (ehTabelaAusente(error)) {
      return {
        atualizadoEm: new Date(),
        itens: [],
        indisponivel:
          'A tabela comunicados ainda não foi criada no banco. Rode a migration 20260914.',
      };
    }
    throw error;
  }

  const ids = (data ?? []).map((c) => c.id as string);

  // Quem leu o quê. Uma consulta só para todos os comunicados — a tela mostra
  // a lista inteira, e uma consulta por item multiplicaria idas ao banco.
  const leituras = ids.length
    ? await supabase
        .from('comunicados_lidos')
        .select('comunicado_id, leitor_id')
        .in('comunicado_id', ids)
    : { data: [], error: null };
  if (leituras.error) throw leituras.error;

  // Nome de quem leu, e quantas pessoas de campo existem. `full_name` com o
  // sufixo '/ DESATIVADO' sai da conta de alcance: cobrar leitura de quem não
  // trabalha mais aqui produziria um número que nunca fecha.
  const perfis = await supabase.from('profiles').select('id, full_name, role');
  if (perfis.error) throw perfis.error;
  const nomePorId = new Map<string, string>();
  let alcance = 0;
  for (const p of perfis.data ?? []) {
    const nome = (p.full_name as string | null) ?? '';
    nomePorId.set(p.id as string, nome);
    if (!/\/\s*DESATIVADO/i.test(nome) && nome.trim()) alcance++;
  }

  const leramPorComunicado = new Map<string, string[]>();
  for (const l of leituras.data ?? []) {
    const chave = l.comunicado_id as string;
    const atual = leramPorComunicado.get(chave) ?? [];
    atual.push(nomePorId.get(l.leitor_id as string) ?? 'alguém');
    leramPorComunicado.set(chave, atual);
  }

  return {
    atualizadoEm: new Date(),
    indisponivel: null,
    itens: (data ?? []).map((c) => ({
      id: c.id as string,
      tipo: (c.tipo as string) ?? 'aviso',
      titulo: c.titulo as string,
      mensagem: c.mensagem as string,
      publicadoEm: (c.publicado_em as string | null) ?? null,
      criadoPor: (c.created_by_name as string | null) ?? null,
      criadoEm: c.created_at as string,
      leram: leramPorComunicado.get(c.id as string) ?? [],
      alcance,
    })),
  };
}

export async function criarComunicado(entrada: {
  titulo: string;
  mensagem: string;
  tipo?: string;
  publicarAgora: boolean;
}): Promise<{ ok: boolean; erro?: string }> {
  const { data: sessao } = await supabase.auth.getUser();
  const { error } = await supabase.from('comunicados').insert({
    tipo: entrada.tipo ?? 'aviso',
    titulo: entrada.titulo.trim(),
    mensagem: entrada.mensagem.trim(),
    // Rascunho nasce sem data: só o gestor enxerga até publicar.
    publicado_em: entrada.publicarAgora ? new Date().toISOString() : null,
    created_by: sessao?.user?.id ?? null,
    created_by_name: (sessao?.user?.user_metadata?.full_name as string | undefined) ?? null,
  });
  if (error) {
    return {
      ok: false,
      erro: ehTabelaAusente(error)
        ? 'A tabela comunicados ainda não foi criada no banco. Rode a migration 20260914.'
        : error.message,
    };
  }
  return { ok: true };
}

export async function publicarComunicado(id: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase
    .from('comunicados')
    .update({ publicado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { ok: false, erro: error.message } : { ok: true };
}

export async function apagarComunicado(id: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase.from('comunicados').delete().eq('id', id);
  return error ? { ok: false, erro: error.message } : { ok: true };
}
