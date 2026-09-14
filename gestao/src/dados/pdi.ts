// PDI — o plano de desenvolvimento, e o espelho entre as duas pessoas.
//
// O DESENHO, que é a parte delicada:
//   - o gestor ESCREVE o plano (cria o documento e os compromissos);
//   - o vendedor MARCA o que fez — e só ele;
//   - o gestor VALIDA ou DEVOLVE com motivo.
//
// O gestor não marca por ele. Se marcasse, o PDI viraria a lista do gestor
// SOBRE a pessoa, e "feito" deixaria de significar que a pessoa fez. Isso está
// garantido no banco: `pdi_marcar_feito` é SECURITY DEFINER e filtra por
// `seller_id = auth.uid()`, porque RLS não restringe coluna — sem a função, a
// policy de update deixaria o vendedor escrever `validado_em` em si mesmo.
//
// Devolver EXIGE motivo (constraint `pdi_devolucao_tem_motivo`). Devolver sem
// dizer por que é recusar sem dizer o que refazer.
import { supabase } from '../supabase';
import { estadoDoCompromisso, type EstadoDoCompromisso } from './regras';

export type { EstadoDoCompromisso };

const TABELA_AUSENTE = 'PGRST205';
const ehTabelaAusente = (e: { code?: string } | null) => e?.code === TABELA_AUSENTE;

export type CompromissoPdi = {
  id: string;
  texto: string;
  ordem: number;
  feitoEm: string | null;
  validadoEm: string | null;
  devolvidoEm: string | null;
  devolvidoMotivo: string | null;
  estado: EstadoDoCompromisso;
};

export type Pdi = {
  id: string;
  titulo: string;
  vigenteDe: string | null;
  vigenteAte: string | null;
  criadoEm: string;
  compromissos: CompromissoPdi[];
};

export type PdiIndisponivel = { indisponivel: true; motivo: string };

export async function carregarPdi(perfilId: string): Promise<Pdi | null | PdiIndisponivel> {
  const doc = await supabase
    .from('pdi_documentos')
    .select('id, titulo, vigente_de, vigente_ate, created_at')
    .eq('seller_id', perfilId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (doc.error) {
    if (ehTabelaAusente(doc.error)) {
      return {
        indisponivel: true,
        motivo: 'A tabela pdi_documentos ainda não foi criada. Rode a migration 20260914.',
      };
    }
    throw doc.error;
  }
  if (!doc.data) return null;

  const comp = await supabase
    .from('pdi_compromissos')
    .select('id, texto, ordem, feito_em, validado_em, devolvido_em, devolvido_motivo')
    .eq('pdi_id', doc.data.id)
    .order('ordem', { ascending: true });
  if (comp.error) throw comp.error;

  return {
    id: doc.data.id as string,
    titulo: doc.data.titulo as string,
    vigenteDe: (doc.data.vigente_de as string | null) ?? null,
    vigenteAte: (doc.data.vigente_ate as string | null) ?? null,
    criadoEm: doc.data.created_at as string,
    compromissos: (comp.data ?? []).map((c) => {
      const base = {
        feitoEm: (c.feito_em as string | null) ?? null,
        validadoEm: (c.validado_em as string | null) ?? null,
        devolvidoEm: (c.devolvido_em as string | null) ?? null,
      };
      return {
        id: c.id as string,
        texto: c.texto as string,
        ordem: (c.ordem as number) ?? 0,
        ...base,
        devolvidoMotivo: (c.devolvido_motivo as string | null) ?? null,
        estado: estadoDoCompromisso(base),
      };
    }),
  };
}

export async function criarPdi(entrada: {
  perfilId: string;
  titulo: string;
  compromissos: string[];
}): Promise<{ ok: boolean; erro?: string }> {
  const { data: sessao } = await supabase.auth.getUser();
  const doc = await supabase
    .from('pdi_documentos')
    .insert({
      seller_id: entrada.perfilId,
      titulo: entrada.titulo.trim(),
      created_by: sessao?.user?.id ?? null,
      created_by_name: (sessao?.user?.user_metadata?.full_name as string | undefined) ?? null,
    })
    .select('id')
    .single();
  if (doc.error) {
    return {
      ok: false,
      erro: ehTabelaAusente(doc.error)
        ? 'A tabela pdi_documentos ainda não foi criada. Rode a migration 20260914.'
        : doc.error.message,
    };
  }

  const linhas = entrada.compromissos
    .map((t) => t.trim())
    .filter(Boolean)
    .map((texto, i) => ({
      pdi_id: doc.data.id,
      seller_id: entrada.perfilId,
      texto,
      ordem: i,
    }));
  if (linhas.length === 0) return { ok: true };

  const { error } = await supabase.from('pdi_compromissos').insert(linhas);
  return error ? { ok: false, erro: error.message } : { ok: true };
}

/** O gestor confirma que o compromisso foi cumprido. Limpa uma devolução anterior. */
export async function validarCompromisso(id: string): Promise<{ ok: boolean; erro?: string }> {
  const { data: sessao } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('pdi_compromissos')
    .update({
      validado_em: new Date().toISOString(),
      validado_por: sessao?.user?.id ?? null,
      devolvido_em: null,
      devolvido_por: null,
      devolvido_motivo: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return error ? { ok: false, erro: error.message } : { ok: true };
}

/**
 * O gestor devolve. `motivo` é obrigatório — o banco recusa sem ele
 * (constraint `pdi_devolucao_tem_motivo`), e a checagem aqui é só para a
 * pessoa ver a mensagem antes da viagem.
 */
export async function devolverCompromisso(
  id: string,
  motivo: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!motivo.trim()) {
    return { ok: false, erro: 'Diga o que precisa ser refeito — devolver sem motivo não ajuda.' };
  }
  const { data: sessao } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('pdi_compromissos')
    .update({
      devolvido_em: new Date().toISOString(),
      devolvido_por: sessao?.user?.id ?? null,
      devolvido_motivo: motivo.trim(),
      validado_em: null,
      validado_por: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return error ? { ok: false, erro: error.message } : { ok: true };
}
