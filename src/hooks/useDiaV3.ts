// HOJE v3 (01/11/26): as leituras que o dia do executivo precisa e que o app ainda não tinha juntas.
//   · visitas_com_prova (0143), de ontem até hoje: a prova de cada parada (a pílula conta COM prova), o
//     "+3 pts" só na 1ª visita com prova ao restaurante na semana, os metros do GPS no toast e quem foi
//     visitado ontem;
//   · fecho_do_dia (0229) de hoje e do último dia útil: "Fechou o dia ontem" e a manhã seguinte;
//   · o plano dos próximos 5 dias úteis com o bairro de cada parada: a sugestão "Pôr em …" do
//     Planejamento v3 precisa da contagem e do bairro de cada dia.
// Fonte que falha devolve null (a tela diz "—"), nunca zero. O sinal ao vivo 'visita' relê ['dia_v3'].
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import type { VisitaV3 } from '../utils/diaV3';

export type DiaV3Base = {
  visitas: VisitaV3[] | null;
  fechouHoje: boolean | null;
  fechouOntem: boolean | null;
  /** null = o plano não foi lido (auditoria 02/11/26: o erro virava 0 e dia cheio era sugerido como livre) */
  cont: Record<string, number> | null;
  bairrosDoDia: Record<string, Array<string | null>>;
};

export function useDiaV3(ativo: boolean, uid: string | null, hoje: string, ontem: string, segunda: string, dias: string[]) {
  return useQuery<DiaV3Base>({
    queryKey: ['dia_v3', uid, hoje, dias.join(',')],
    enabled: ativo && !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const de = ontem < segunda ? ontem : segunda;
      const [vis, fechos, rotas] = await Promise.all([
        supabase.rpc('visitas_com_prova', { p_de: de, p_ate: hoje }),
        supabase.from('fecho_do_dia').select('dia').eq('pessoa', uid!).in('dia', [ontem, hoje]),
        supabase.from('field_routes').select('route_date, field_route_stops(status, clients(bairro))').eq('seller_id', uid!).in('route_date', dias),
      ]);
      const visitas = vis.error ? null : ((vis.data ?? []) as Array<Record<string, unknown>>).map((v) => ({
        client_id: v.client_id == null ? null : String(v.client_id), dia: String(v.dia), provada: !!v.provada,
        distancia_m: v.distancia_m == null ? null : Number(v.distancia_m), visited_at: String(v.visited_at),
      }));
      const dFecho = fechos.error ? null : new Set(((fechos.data ?? []) as Array<{ dia: string }>).map((f) => String(f.dia)));
      const cont: Record<string, number> = {};
      const bairrosDoDia: Record<string, Array<string | null>> = {};
      dias.forEach((d) => { cont[d] = 0; bairrosDoDia[d] = []; });
      type Linha = { route_date: string; field_route_stops: Array<{ status: string; clients: { bairro: string | null } | null }> | null };
      ((rotas.error ? [] : rotas.data ?? []) as unknown as Linha[]).forEach((r) => {
        const vivas = (r.field_route_stops ?? []).filter((s) => s.status === 'planned' || s.status === 'done');
        cont[r.route_date] = vivas.length;
        bairrosDoDia[r.route_date] = vivas.map((s) => s.clients?.bairro ?? null);
      });
      return { visitas, fechouHoje: dFecho ? dFecho.has(hoje) : null, fechouOntem: dFecho ? dFecho.has(ontem) : null, cont: rotas.error ? null : cont, bairrosDoDia };
    },
  });
}

/** O bairro e o lugar dos negócios sem passo do topo da fila (a sugestão de dia é por bairro). */
export function useBairrosDaFila(ativo: boolean, clientIds: string[]) {
  return useQuery<Record<string, { bairro: string | null; temLugar: boolean }>>({
    queryKey: ['dia_v3_bairros', clientIds.join(',')],
    enabled: ativo && clientIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, bairro, latitude, longitude').in('id', clientIds.slice(0, 200));
      if (error) throw error;
      const out: Record<string, { bairro: string | null; temLugar: boolean }> = {};
      ((data ?? []) as Array<{ id: string; bairro: string | null; latitude: number | null; longitude: number | null }>).forEach((c) => {
        out[c.id] = { bairro: c.bairro ?? null, temLugar: c.latitude != null && c.longitude != null };
      });
      return out;
    },
  });
}
