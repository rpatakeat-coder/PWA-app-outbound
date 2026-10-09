// OS DOIS NÚMEROS DO DIA, IGUAIS EM TUDO (08/10/2026). Julyan: "quero os mesmos números em tudo".
// Na auditoria do app do executivo, o mesmo dia do André aparecia em sete contas (4 de 13 no gestor,
// 5 de 11 no app, 0/5 no Planejamento, 5/6 na pílula, "Funil · 14" na Agenda...). Agora há duas:
//
//   PLANO   = paradas do plano com visita PROVADA ÷ paradas do plano (o mesmo restaurante conta uma
//             vez por dia; a parada sem lugar no mapa conta no y e aparece à parte);
//   VISITAS = toda visita com prova do dia, dentro ou fora do plano ÷ a meta do dia.
//
// A fonte é a MESMA do cockpit do gestor: planejamento_do_time (o executivo lê a própria linha).
// Visita sem prova não entra em nenhum dos dois.
import { supabase } from '../integrations/supabase/client';

export type DiaMedido = {
  dia: string;
  /** y do Plano: paradas do plano no dia (restaurante contado uma vez). */
  planejadas: number;
  /** x do Plano: paradas do plano com visita provada. */
  feitasDoPlano: number;
  /** Visitas: toda visita com prova do dia. */
  provadas: number;
  /** Visitas com prova em cliente fora do plano. */
  fora: number;
  /** Paradas do plano sem lugar no mapa (negócio sem endereço). */
  semLugar: number;
  /** Check-ins do dia, com e sem prova. */
  feitas: number;
  meta: number;
};

/** A segunda-feira da semana de `iso` (dia de Brasília, AAAA-MM-DD). */
export function segundaDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const w = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((w + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Converte a resposta de planejamento_do_time na semana medida da pessoa. Puro: testado sem banco. */
export function semanaMedida(resp: unknown): Map<string, DiaMedido> {
  const out = new Map<string, DiaMedido>();
  const pessoas = (resp as { pessoas?: Array<{ dias?: unknown[] }> } | null)?.pessoas;
  const dias = (pessoas && pessoas[0] && pessoas[0].dias) || [];
  for (const raw of dias as Array<Record<string, unknown>>) {
    const dia = String(raw.dia ?? '');
    if (!dia) continue;
    const n = (k: string) => Number(raw[k]) || 0;
    out.set(dia, { dia, planejadas: n('planejadas'), feitasDoPlano: n('feitasDoPlano'), provadas: n('provadas'),
      fora: n('fora'), semLugar: n('semLugar'), feitas: n('feitas'), meta: n('meta') || 6 });
  }
  return out;
}

/** A semana de `diaIso` para o dono (owner do HubSpot): os números que o gestor vê dele. */
export async function lerSemanaMedida(ownerHubspot: string, diaIso: string): Promise<Map<string, DiaMedido>> {
  const { data, error } = await supabase.rpc('planejamento_do_time', { p_segunda: segundaDe(diaIso), p_donos: [ownerHubspot], p_dia: diaIso });
  if (error) throw error;
  return semanaMedida(data);
}

/** "Plano 4 de 13" — o texto curto do Plano. */
export function textoPlano(d: Pick<DiaMedido, 'feitasDoPlano' | 'planejadas'>): string {
  return `${d.feitasDoPlano} de ${d.planejadas}`;
}

/** O que acompanha o Plano: "3 sem lugar no mapa · +1 fora do plano". */
export function notasDoDia(d: Pick<DiaMedido, 'semLugar' | 'fora'>): string[] {
  const out: string[] = [];
  if (d.semLugar > 0) out.push(`${d.semLugar} sem lugar no mapa`);
  if (d.fora > 0) out.push(`+${d.fora} fora do plano`);
  return out;
}

/** Depois das 18h o dia está fechando: o convite é montar amanhã, nunca ir para a rua. */
export function ehNoite(agora = new Date()): boolean {
  const h = Number(agora.toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }));
  return Number.isFinite(h) && h >= 18;
}
