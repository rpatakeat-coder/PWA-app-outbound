// "Feitas hoje" da aba Tarefas no servidor (0155, 04/10/2026). Antes era localStorage: cada
// aparelho tinha a sua lista, e o Desfazer só existia nos 5 s do toast.
//
// O ciclo de uma linha:
//   registrarFeita  — no toque em Salvar, estado 'pendente' (a escrita no HubSpot ainda não saiu);
//   apagarPendente  — Desfazer dentro dos 5 s: nada foi escrito, a linha some;
//   marcarGravada   — a escrita saiu (inclusive pela fila offline): guarda os ids que ela criou;
//   desfazerFeita   — depois dos 5 s, no mesmo dia: a Edge fila-tarefas confere cada id
//                     contra o negócio e o dono e desfaz no HubSpot.
// Tudo aqui é complemento: falhar não derruba o registro principal.
import { supabase } from '../integrations/supabase/client';

export type FeitaServidor = {
  id: string | null; acaoId: string; dealId: string; hora: string; negocio: string; resultado: string;
  volta: string | null; perdido?: string | null; estado: 'pendente' | 'gravada';
};

const emVoo = new Map<string, Promise<unknown>>();

export function registrarFeita(f: FeitaServidor & { dia: string; etapaAnterior?: string | null; tarefaId?: string | null }) {
  const p = (async () => {
    try {
      await supabase.from('fila_feitas').insert({
        dia: f.dia, deal_id: f.dealId, negocio: f.negocio, hora: f.hora, resultado: f.resultado,
        volta: f.volta, perdido: f.perdido ?? null, acao_id: f.acaoId,
        etapa_anterior: f.etapaAnterior ?? null, tarefa_id: f.tarefaId ?? null,
      });
    } catch { /* complemento */ }
  })();
  emVoo.set(f.acaoId, p);
  return p;
}

export async function apagarPendente(acaoId: string) {
  // o insert pode ainda estar no ar: apagar antes dele deixaria a linha órfã
  try { await emVoo.get(acaoId); await supabase.from('fila_feitas').delete().eq('acao_id', acaoId).eq('estado', 'pendente'); } catch { /* complemento */ }
}

export async function marcarGravada(acaoId: string | null | undefined, ids: {
  notaId?: string | null; proximoId?: string | null; proximoJaExistia?: boolean; concluiu?: boolean;
}) {
  if (!acaoId) return;
  try {
    await emVoo.get(acaoId);
    await supabase.from('fila_feitas').update({
      estado: 'gravada', nota_id: ids.notaId ?? null, proximo_id: ids.proximoId ?? null,
      proximo_ja_existia: !!ids.proximoJaExistia, concluiu_tarefa: !!ids.concluiu,
    }).eq('acao_id', acaoId);
  } catch { /* complemento */ }
}

export async function lerFeitas(dia: string): Promise<FeitaServidor[]> {
  const { data, error } = await supabase.from('fila_feitas')
    .select('id, acao_id, deal_id, hora, negocio, resultado, volta, perdido, estado')
    .eq('dia', dia).neq('estado', 'desfeita').order('criada_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, acaoId: r.acao_id, dealId: r.deal_id, hora: r.hora ?? '', negocio: r.negocio ?? '',
    resultado: r.resultado ?? '', volta: r.volta, perdido: r.perdido, estado: r.estado,
  }));
}

export async function desfazerFeita(id: string): Promise<{ feito: string[]; falhou: string[] }> {
  const { data, error } = await supabase.functions.invoke('fila-tarefas', { body: { op: 'desfazer', id } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let msg = 'Não consegui desfazer. Tente de novo.';
    try { const j = await ctx?.clone().json(); if (j?.erro) msg = String(j.erro); } catch { /* corpo não-JSON */ }
    throw new Error(msg);
  }
  return { feito: data?.feito ?? [], falhou: data?.falhou ?? [] };
}
