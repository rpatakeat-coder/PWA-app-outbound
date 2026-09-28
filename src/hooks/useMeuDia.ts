// "Meu dia em números" (handoff v4.1 §6.12). Só o que é MEDIDO: check-ins de
// hoje (client_visits), a promessa da Daily das 9h (dailies), reuniões que o
// executivo marcou hoje e as que ele tem hoje (client_meetings) e a sequência
// de dias com visita. Nada de zero inventado: sem dado, a tela não mostra.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';

export type MeuDia = {
  /** Visitas FEITAS hoje — visitas_do_dia (0143), a mesma função do Cockpit. */
  visitasHoje: number;
  /** Das feitas, as PROVADAS (GPS até 200/500 m ou foto; não em série). null = não medido. */
  provadasHoje: number | null;
  /** false quando nem a função nem a leitura direta responderam: o número não é zero, é não medido. */
  medido: boolean;
  prometido: { visitas: number | null; avancos: number | null; propostas: number | null; validadaEm: string | null } | null;
  reunioesMarcadasHoje: number;
  reunioesParaHoje: number;
  sequenciaDias: number;
  /** A semana (meu_placar, 0142): null quando a leitura falhou — nunca zero inventado. */
  semana: {
    visitas: number;
    demos: number;
    provadas: number | null;
    ganhos: number | null;
    ganhosNomes: string[];
    ganhosMes: number | null;
    metaMes: number | null;
  } | null;
};

const DIA_MS = 86400000;
const diaBRT = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
// Meia-noite de Brasília de hoje, em UTC.
function inicioDoDiaBRT(agora = new Date()): Date {
  return new Date(`${diaBRT(agora)}T03:00:00.000Z`);
}

export function sequenciaDeDias(diasComVisita: Set<string>, agora = new Date()): number {
  // Conta de hoje para trás; se hoje ainda não teve visita, começa de ontem.
  let n = 0;
  let d = new Date(agora);
  if (!diasComVisita.has(diaBRT(d))) d = new Date(d.getTime() - DIA_MS);
  for (let i = 0; i < 60; i++) {
    const dia = diaBRT(d);
    const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
    if (diasComVisita.has(dia)) n++;
    else if (semana !== 0 && semana !== 6) break; // fim de semana sem rua não quebra
    d = new Date(d.getTime() - DIA_MS);
  }
  return n;
}

export function useMeuDia(ativo: boolean, profileId: string | null) {
  return useQuery<MeuDia>({
    queryKey: ['meu_dia', profileId],
    enabled: ativo && !!profileId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const hoje0 = inicioDoDiaBRT();
      const amanha0 = new Date(hoje0.getTime() + DIA_MS);
      const trinta = new Date(hoje0.getTime() - 30 * DIA_MS);
      const [visitas, daily, marcadas, paraHoje, placar] = await Promise.all([
        supabase.from('client_visits').select('visited_at').eq('visited_by', profileId!).gte('visited_at', trinta.toISOString()),
        supabase.from('dailies').select('prometido_visitas, prometido_avancos, prometido_propostas, created_at').eq('seller_id', profileId!).eq('data', diaBRT(new Date())).maybeSingle(),
        supabase.from('client_meetings').select('id', { count: 'exact', head: true }).eq('created_by', profileId!).gte('created_at', hoje0.toISOString()),
        supabase.from('client_meetings').select('id', { count: 'exact', head: true }).eq('created_by', profileId!).eq('status', 'agendada')
          .gte('scheduled_at', hoje0.toISOString()).lt('scheduled_at', amanha0.toISOString()),
        // visitas e demos da semana, e os ganhos do robô do HubSpot (o mesmo número do Cockpit)
        supabase.rpc('meu_placar'),
      ]);
      const pl = (placar.error ? null : placar.data) as Record<string, unknown> | null;
      const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? null : Number(v));
      const linhas = (visitas.data ?? []) as { visited_at: string }[];
      const dias = new Set(linhas.map((v) => diaBRT(new Date(v.visited_at))));
      const d = daily.data as { prometido_visitas: number | null; prometido_avancos: number | null; prometido_propostas: number | null; created_at: string | null } | null;
      // Uma verdade só (0143): o número do dia vem da função do banco; a leitura direta só
      // entra se a função falhar, e se as duas falharem o painel diz "não medido" (N3).
      const diretas = visitas.error ? null : linhas.filter((v) => new Date(v.visited_at) >= hoje0).length;
      return {
        visitasHoje: num(pl?.visitas_hoje) ?? diretas ?? 0,
        provadasHoje: num(pl?.provadas_hoje),
        medido: pl != null || diretas != null,
        prometido: d ? { visitas: d.prometido_visitas, avancos: d.prometido_avancos, propostas: d.prometido_propostas, validadaEm: d.created_at } : null,
        reunioesMarcadasHoje: marcadas.count ?? 0,
        reunioesParaHoje: paraHoje.count ?? 0,
        sequenciaDias: sequenciaDeDias(dias),
        semana: pl ? {
          visitas: num(pl.visitas_semana) ?? 0,
          provadas: num(pl.provadas_semana),
          demos: num(pl.demos_semana) ?? 0,
          ganhos: num(pl.ganhos_semana),
          ganhosNomes: Array.isArray(pl.ganhos_semana_nomes) ? (pl.ganhos_semana_nomes as unknown[]).map(String) : [],
          ganhosMes: num(pl.ganhos_mes),
          metaMes: num(pl.meta_mes),
        } : null,
      };
    },
  });
}
