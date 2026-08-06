import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';

// Chama a edge conta-alvo-nearby: acha 1 restaurante bem avaliado (>=4,5 e
// >100 avaliacoes) a <=2km do vendedor, que ainda NAO e' cliente, e materializa
// como lead (origem='conta_alvo'; sem deal — o deal sai so' no check-in).
// Devolve o Client pronto pra entrar na rota, ou null (sem candidato/erro).
export async function fetchContaAlvo(params: {
  lat: number;
  lon: number;
  vendedor_id_hubspot: string | null;
  // auth uid do vendedor logado — clients.created_by e' NOT NULL e a edge
  // (service role) nao tem usuario, entao vem daqui.
  created_by: string | null;
}): Promise<Client | null> {
  try {
    const { data, error } = await supabase.functions.invoke('conta-alvo-nearby', {
      body: {
        lat: params.lat,
        lon: params.lon,
        vendedor_id_hubspot: params.vendedor_id_hubspot,
        created_by: params.created_by,
      },
    });
    if (error) {
      console.warn('[CONTA ALVO] edge falhou:', error.message);
      return null;
    }
    return (data?.client ?? null) as Client | null;
  } catch (err: any) {
    console.warn('[CONTA ALVO] invoke falhou:', err?.message ?? err);
    return null;
  }
}
