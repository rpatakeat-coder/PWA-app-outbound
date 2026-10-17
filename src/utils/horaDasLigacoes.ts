// A hora das ligações (handoff "Tarefas do App", P1, 17/10/2026): duas janelas de 15 min, 12:30 e
// 17:30, no horário de Brasília (cockpit_config.janelas_ligacao, a mesma do push das 12:30/17:30).
// Fora da janela a faixa e o bloco somem; só em dia útil (feriado: quem chama passa a lista).
import { ehDiaUtil } from '../../supabase/functions/_compartilhado/filaDoDinheiro';

export const JANELAS_LIGACAO = ['12:30', '17:30'];
export const MINUTOS_DA_JANELA = 15;

export type JanelaAgora = { de: string; ate: string; faltamMin: number; decorrido: number };

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** A janela em que `agora` está, ou null. `agora` em ms; o relógio é o de Brasília (UTC-3). */
export function janelaAtual(agora: number, feriados: string[] = [], janelas = JANELAS_LIGACAO, minutos = MINUTOS_DA_JANELA): JanelaAgora | null {
  const brt = new Date(agora - 3 * 3600000);
  const dia = brt.toISOString().slice(0, 10);
  if (!ehDiaUtil(dia, feriados)) return null;
  const agoraMin = brt.getUTCHours() * 60 + brt.getUTCMinutes() + brt.getUTCSeconds() / 60;
  for (const j of janelas) {
    const [h, m] = j.split(':').map(Number);
    const ini = h * 60 + m;
    if (agoraMin >= ini && agoraMin < ini + minutos) {
      return { de: j, ate: hhmm(ini + minutos), faltamMin: Math.max(1, Math.ceil(ini + minutos - agoraMin)), decorrido: (agoraMin - ini) / minutos };
    }
  }
  return null;
}

/** As janelas do dia com o estado de cada uma (coluna da direita do computador). */
export function janelasDoDia(agora: number, janelas = JANELAS_LIGACAO, minutos = MINUTOS_DA_JANELA): Array<{ de: string; ate: string; estado: 'agora' | 'feita' | 'proxima'; faltamMin?: number }> {
  const brt = new Date(agora - 3 * 3600000);
  const agoraMin = brt.getUTCHours() * 60 + brt.getUTCMinutes();
  return janelas.map((j) => {
    const [h, m] = j.split(':').map(Number);
    const ini = h * 60 + m;
    const estado = agoraMin >= ini + minutos ? 'feita' : agoraMin >= ini ? 'agora' : 'proxima';
    return { de: j, ate: hhmm(ini + minutos), estado, ...(estado === 'agora' ? { faltamMin: Math.max(1, ini + minutos - agoraMin) } : {}) };
  });
}
