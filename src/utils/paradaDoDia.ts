// PLANEJAR PELO MAPA — as gravações (auditoria 28/09/2026). Cada toque no pino vira UMA
// destas chamadas, com o dia e a pessoa passados por argumento: a mutação do useFieldOps
// segue o dia que está na tela no momento em que roda, e um toque na fila podia gravar
// no dia seguinte se ele trocasse de dia no meio. O App as roda em fila, uma por vez,
// para a posição e a contagem não se atropelarem.
import { supabase } from '../integrations/supabase/client';
import { colunaDoDia, semanaDoDia, type FaixaDoPlano } from './planoNoMapa';

async function rotaDoDia(sellerId: string, dia: string, criar: boolean): Promise<string | null> {
  const { data, error } = await supabase.from('field_routes').select('id')
    .eq('seller_id', sellerId).eq('route_date', dia).limit(1);
  if (error) throw error;
  if (data && data[0]) return (data[0] as { id: string }).id;
  if (!criar) return null;
  // sem rota nesse dia: cria sem sobrescrever a que o Cockpit possa ter criado agora
  const { error: e2 } = await supabase.from('field_routes').upsert({
    seller_id: sellerId, route_date: dia, title: 'Rota do dia', status: 'planned',
    source: 'manual', priority_mode: 'manual', created_by: sellerId,
  }, { onConflict: 'seller_id,route_date', ignoreDuplicates: true });
  if (e2) throw e2;
  const { data: d3, error: e3 } = await supabase.from('field_routes').select('id')
    .eq('seller_id', sellerId).eq('route_date', dia).limit(1);
  if (e3) throw e3;
  if (!d3 || !d3[0]) throw new Error('Não consegui criar a rota desse dia.');
  return (d3[0] as { id: string }).id;
}

/** Põe o lead no fim da rota do dia. 'ja' = já estava (planejado ou feito). */
export async function porNoDia(sellerId: string, dia: string, clientId: string): Promise<'entrou' | 'ja'> {
  const rota = (await rotaDoDia(sellerId, dia, true))!;
  const { data: atuais, error } = await supabase.from('field_route_stops')
    .select('client_id, position, status').eq('route_id', rota);
  if (error) throw error;
  const linhas = (atuais ?? []) as Array<{ client_id: string; position: number | null; status: string }>;
  const minha = linhas.find((l) => l.client_id === clientId);
  if (minha && (minha.status === 'planned' || minha.status === 'done')) return 'ja';
  const posicao = linhas.reduce((m, l) => Math.max(m, l.position ?? 0), 0) + 1;
  if (minha) {
    // tirada ou pulada antes: a linha existe (rota + lead é único), volta a planejada
    const { error: e } = await supabase.from('field_route_stops')
      .update({ status: 'planned', position: posicao, planned_at: new Date().toISOString() })
      .eq('route_id', rota).eq('client_id', clientId);
    if (e) throw e;
  } else {
    const { error: e } = await supabase.from('field_route_stops').insert({
      route_id: rota, client_id: clientId, position: posicao, planned_at: new Date().toISOString(), status: 'planned',
    });
    if (e) throw e;
  }
  return 'entrou';
}

/** Tira o lead do dia. Parada já feita não se tira (a visita aconteceu). */
export async function tirarDoDia(sellerId: string, dia: string, clientId: string): Promise<number> {
  const rota = await rotaDoDia(sellerId, dia, false);
  if (!rota) return 0;
  const { data, error } = await supabase.from('field_route_stops')
    .update({ status: 'removed' }).eq('route_id', rota).eq('client_id', clientId)
    .in('status', ['planned', 'skipped']).select('id');
  if (error) throw error;
  return (data ?? []).length;
}

/** A coluna do dia no Planejamento do Cockpit (planos_semanais), já normalizada. */
export async function lerColunaDoPlano(ownerHubspot: string, dia: string): Promise<FaixaDoPlano[]> {
  const { segunda, indice } = semanaDoDia(dia);
  const { data, error } = await supabase.from('planos_semanais').select('grade')
    .eq('owner_id', ownerHubspot).eq('data_segunda', segunda).limit(1);
  if (error) throw error;
  return colunaDoDia(data && data[0] ? (data[0] as { grade: unknown }).grade : null, indice);
}
