// A ficha de rua também no banco (migration 0120, tabela fichas_de_rua).
//
// A nota DESFECHO_VISITA continua indo para o HubSpot; esta linha é o que o Cockpit
// lê para o funil de porta, o bairro e o horário que convertem e a qualidade do
// registro. Uma linha por ficha salva, com acao_id único: subir duas vezes pela fila
// grava uma. Falhar aqui nunca atrapalha a ficha — sem sinal, vai para a fila.

import { supabase } from '../integrations/supabase/client';
import { enfileirar, ehErroDeRede, novoAcaoId } from './filaOffline';
import { proximoPassoDaFicha, type Ficha } from './fichaDeRua';

export type LinhaFicha = {
  acao_id: string;
  owner_id: string | null;
  client_id: string | null;
  deal_id: string | null;
  ocorrido_em: string;
  declarada: boolean;
  como_foi: string;
  proximo: string | null;
  proximo_em: string | null;
  proximo_tipo: string | null;
  etapa_antes: string | null;
  etapa_depois: string | null;
  decisor_nome: string | null;
  decisor_papel: string | null;
  horario_dono: string | null;
  sistema: string | null;
  dor: string | null;
  tipo_lugar: string | null;
  motivo_perdido: string | null;
  com_foto: boolean;
  bairro: string | null;
  cidade: string | null;
};

const texto = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t ? t.slice(0, 200) : null;
};

/** Monta a linha. null quando a ficha não tem o "como foi" (não dá para salvar assim). */
export function linhaDaFicha(f: Ficha, c: {
  acaoId?: string; ownerId: string | null; clientId: string | null; dealId: string | null; ocorridoEm: string;
  declarada: boolean; etapaAntes: string | null; etapaDepois: string | null; comFoto: boolean;
  bairro?: string | null; cidade?: string | null; hoje: string;
}): LinhaFicha | null {
  if (!f.comoFoi) return null;
  const passo = proximoPassoDaFicha(f, c.hoje);
  return {
    acao_id: c.acaoId ?? novoAcaoId(),
    owner_id: c.ownerId,
    client_id: c.clientId,
    deal_id: c.dealId,
    ocorrido_em: c.ocorridoEm,
    declarada: c.declarada,
    como_foi: f.comoFoi,
    proximo: f.proximo,
    proximo_em: passo ? passo.data : null,
    proximo_tipo: passo ? passo.tipo : null,
    etapa_antes: c.etapaAntes,
    etapa_depois: c.etapaDepois,
    decisor_nome: texto(f.decisor),
    decisor_papel: f.papel ?? null,
    horario_dono: f.horario ?? null,
    sistema: texto(f.sistema),
    dor: f.dor ?? null,
    tipo_lugar: f.tipo ?? null,
    motivo_perdido: f.proximo === 'sem_interesse' ? (f.motivoPerdido ?? null) : null,
    com_foto: c.comFoto,
    bairro: texto(c.bairro),
    cidade: texto(c.cidade),
  };
}

/** Grava (idempotente pelo acao_id). Sem sinal: vai para a fila, tipo 'ficha'. */
export async function gravarFichaNoBanco(linha: LinhaFicha, rotulo: string): Promise<'ok' | 'fila' | 'falhou'> {
  const paraFila = async () => {
    await enfileirar({ acaoId: linha.acao_id, tipo: 'ficha', rotulo: `Ficha · ${rotulo}`, payload: linha as unknown as Record<string, unknown> });
    return 'fila' as const;
  };
  // Sem sinal o supabase-js tenta de novo calado e a promessa não volta: não esperar.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return paraFila();
  try {
    await Promise.race([
      subirFicha(linha),
      new Promise((_, nao) => setTimeout(() => nao(new Error('timeout')), 8000)),
    ]);
    return 'ok';
  } catch (err) {
    if (ehErroDeRede(err)) return paraFila();
    console.warn('[ficha no banco]', (err as Error)?.message ?? err);
    return 'falhou';
  }
}

/** O executor da fila também usa esta. */
export async function subirFicha(linha: LinhaFicha): Promise<void> {
  const { error } = await supabase.from('fichas_de_rua').upsert(linha, { onConflict: 'acao_id', ignoreDuplicates: true });
  if (error) throw error;
}
