// O que o gestor DECIDIU — modo de agir e pauta do líder.
//
// O cockpit sabe dizer muito bem ONDE dói (funil travado, gargalo por etapa,
// quem está sem registro) e nada sobre o que o gestor decidiu a respeito. Na
// prática a decisão vive no caderno dele, e a semana seguinte começa sem
// memória da anterior.
//
// AS TABELAS PODEM NÃO EXISTIR AINDA. As migrations (20260914_*) são aplicadas
// pelo Guilherme, não por este código. Enquanto não forem, cada leitura aqui
// devolve `indisponivel` com o motivo, e a tela diz "não configurado" — nunca
// zero, nunca lista vazia fingindo que ninguém decidiu nada. É a lei zero
// aplicada ao próprio schema: ausência de TABELA também é ausência de dado.
import { supabase } from '../supabase';
import { diaBRT, segundaDaSemana } from './datas';
import type { ModoDeAgir } from './regras';

/** Código do PostgREST para "tabela não existe no schema cache". */
const TABELA_AUSENTE = 'PGRST205';

export type Indisponivel = { indisponivel: true; motivo: string };
export type ModoRegistrado = { modo: ModoDeAgir; sugeridoNaEpoca: ModoDeAgir | null };

const ehTabelaAusente = (erro: { code?: string } | null) => erro?.code === TABELA_AUSENTE;

const naoConfigurado = (tabela: string): Indisponivel => ({
  indisponivel: true,
  motivo: `A tabela ${tabela} ainda não foi criada no banco. Rode a migration 20260914.`,
});

// ===== modos de agir =====

export async function carregarModosDaSemana(
  segunda = segundaDaSemana(diaBRT(new Date())),
): Promise<Record<string, ModoRegistrado> | Indisponivel> {
  const { data, error } = await supabase
    .from('modos_de_agir')
    .select('seller_id, modo, modo_sugerido')
    .eq('data_segunda', segunda);
  if (error) {
    if (ehTabelaAusente(error)) return naoConfigurado('modos_de_agir');
    throw error;
  }
  const saida: Record<string, ModoRegistrado> = {};
  for (const l of data ?? []) {
    saida[l.seller_id as string] = {
      modo: l.modo as ModoDeAgir,
      sugeridoNaEpoca: (l.modo_sugerido as ModoDeAgir | null) ?? null,
    };
  }
  return saida;
}

/**
 * Grava a decisão E o que o sistema propunha no momento. As duas colunas
 * juntas são o motivo de a tabela existir: sem `modo_sugerido`, não há como
 * saber se o semáforo está calibrado — um que o gestor contraria toda semana
 * está errado, e a divergência só aparece se for registrada.
 */
export async function definirModoDeAgir(entrada: {
  perfilId: string;
  modo: ModoDeAgir;
  sugerido: ModoDeAgir | null;
  segunda?: string;
}): Promise<{ ok: boolean; erro?: string }> {
  const { data: sessao } = await supabase.auth.getUser();
  const { error } = await supabase.from('modos_de_agir').upsert(
    {
      data_segunda: entrada.segunda ?? segundaDaSemana(diaBRT(new Date())),
      seller_id: entrada.perfilId,
      modo: entrada.modo,
      modo_sugerido: entrada.sugerido,
      created_by: sessao?.user?.id ?? null,
      created_by_name: (sessao?.user?.user_metadata?.full_name as string | undefined) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'data_segunda,seller_id' },
  );
  if (error) {
    return {
      ok: false,
      erro: ehTabelaAusente(error) ? naoConfigurado('modos_de_agir').motivo : error.message,
    };
  }
  return { ok: true };
}

// ===== pauta do líder =====

export type ItemDaPauta = {
  id: string;
  chave: string;
  tipo: string;
  alvoPerfilId: string | null;
  titulo: string;
  detalhe: string | null;
  ritual: string | null;
  feito: boolean;
  criadoEm: string;
};

export async function carregarPauta(
  apenasAbertas = true,
): Promise<ItemDaPauta[] | Indisponivel> {
  let q = supabase
    .from('pauta_do_lider')
    .select('id, chave, tipo, alvo_seller_id, titulo, detalhe, ritual, feito, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (apenasAbertas) q = q.eq('feito', false);
  const { data, error } = await q;
  if (error) {
    if (ehTabelaAusente(error)) return naoConfigurado('pauta_do_lider');
    throw error;
  }
  return (data ?? []).map((l) => ({
    id: l.id as string,
    chave: l.chave as string,
    tipo: l.tipo as string,
    alvoPerfilId: (l.alvo_seller_id as string | null) ?? null,
    titulo: l.titulo as string,
    detalhe: (l.detalhe as string | null) ?? null,
    ritual: (l.ritual as string | null) ?? null,
    feito: l.feito as boolean,
    criadoEm: l.created_at as string,
  }));
}

/**
 * Liga/desliga um item da pauta. A `chave` é unique no banco, então "decidir a
 * mesma coisa duas vezes" é decidir uma: se o item já existe, este clique o
 * APAGA. É o que transforma o botão num interruptor em vez de empilhar
 * duplicata a cada toque.
 *
 * Devolve o estado em que o item ficou, para a tela não precisar reler.
 */
export async function alternarItemDaPauta(entrada: {
  chave: string;
  tipo: string;
  titulo: string;
  alvoPerfilId?: string | null;
  detalhe?: string | null;
  ritual?: string | null;
}): Promise<{ ok: boolean; ligado?: boolean; erro?: string }> {
  const existente = await supabase
    .from('pauta_do_lider')
    .select('id')
    .eq('chave', entrada.chave)
    .maybeSingle();
  if (existente.error) {
    return {
      ok: false,
      erro: ehTabelaAusente(existente.error)
        ? naoConfigurado('pauta_do_lider').motivo
        : existente.error.message,
    };
  }

  if (existente.data?.id) {
    const { error } = await supabase.from('pauta_do_lider').delete().eq('id', existente.data.id);
    return error ? { ok: false, erro: error.message } : { ok: true, ligado: false };
  }

  const { data: sessao } = await supabase.auth.getUser();
  const { error } = await supabase.from('pauta_do_lider').insert({
    chave: entrada.chave,
    tipo: entrada.tipo,
    alvo_seller_id: entrada.alvoPerfilId ?? null,
    titulo: entrada.titulo,
    detalhe: entrada.detalhe ?? null,
    ritual: entrada.ritual ?? null,
    created_by: sessao?.user?.id ?? null,
    created_by_name: (sessao?.user?.user_metadata?.full_name as string | undefined) ?? null,
  });
  return error ? { ok: false, erro: error.message } : { ok: true, ligado: true };
}
