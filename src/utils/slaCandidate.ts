import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';

// Chama a RPC sla_estourado_candidates: leads do vendedor com SLA estourado
// (regra do MD — diasParado > SLA da etapa), do mais urgente pro menos.
// Devolve o 1o que ainda nao esta na rota (excludeIds), ou null se nenhum.
export async function fetchSlaCandidate(
  vendedor: string | null,
  excludeIds: Set<string>,
): Promise<Client | null> {
  try {
    const { data, error } = await supabase.rpc('sla_estourado_candidates', {
      p_vendedor: vendedor,
      p_limit: 8,
    });
    if (error) {
      console.warn('[SLA] rpc falhou:', error.message);
      return null;
    }
    const list = (data ?? []) as Client[];
    return list.find((c) => !excludeIds.has(c.id)) ?? null;
  } catch (err: any) {
    console.warn('[SLA] invoke falhou:', err?.message ?? err);
    return null;
  }
}
