// O selo que diz o que está em jogo (handoff "Tarefas do App", P2, 17/10/2026): o mesmo texto no
// menu de baixo, no menu lateral do PC e no sino. "N quentes esfriando" se houver quente (Conversa
// com decisor, Demo/Proposta ou Negociação com tarefa vencida ou vencendo hoje); senão "N
// vencidos"; fila zerada ou sem vencido e sem quente: sem selo.
import { ETAPAS_QUENTES, quenteEsfriando, secaoDoItem } from '../../supabase/functions/_compartilhado/filaDoDinheiro';

type ItemDoSelo = { negocio: string; etapaId: string; venceu: boolean; prazo: string | null; horaPrazo?: string | null };
export type SeloDaFila = { n: number; quente: boolean; curto: string; longo: string; texto: string };

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 86400000);

function quando(i: ItemDoSelo, hoje: string): string {
  if (i.prazo === hoje) return `vence hoje${i.horaPrazo ? ` às ${i.horaPrazo}` : ''}`;
  if (!i.prazo) return 'venceu';
  const n = diasEntre(i.prazo, hoje);
  return n === 1 ? 'venceu ontem' : `venceu há ${n} dias`;
}

export function seloDaFila(itens: ItemDoSelo[] | null | undefined, hoje: string): SeloDaFila | null {
  if (!itens?.length) return null;
  const quentes = itens.filter((i) => quenteEsfriando(i, hoje));
  const lista = quentes.length ? quentes : itens.filter((i) => i.venceu);
  if (!lista.length) return null;
  const n = lista.length;
  const quente = quentes.length > 0;
  const curto = quente ? `${n} ${n === 1 ? 'quente' : 'quentes'}` : `${n} ${n === 1 ? 'vencido' : 'vencidos'}`;
  const longo = quente ? `${n} ${n === 1 ? 'quente esfriando' : 'quentes esfriando'}` : curto;
  const nomes = lista.slice(0, 3).map((i) => `${i.negocio} ${quando(i, hoje)}.`);
  const texto = nomes.join(' ') + (n > 3 ? ` E mais ${n - 3}.` : '');
  return { n, quente, curto, longo, texto };
}

/**
 * O QUE FAZER HOJE, UM NÚMERO SÓ (auditoria 02/11/26). Havia quatro contadores para a mesma pergunta:
 * o selo da aba (paradas + reuniões + tarefas do CRM de hoje), a pílula "N atrasados", o sino e o
 * cabeçalho ("N tarefas hoje" = a fila inteira). O selo da aba, o cabeçalho e o painel de avisos agora
 * contam o que a tela Hoje abre. Desde a aba Hoje enxuta (04/11/26): atrasados (até 3 dias, ou quente)
 * + ligar hoje; os sem próximo passo têm o chip deles. null = a fila ainda não chegou ou falhou.
 */
export function contagemDoHoje(itens: Array<ItemDoGrupo> | null | undefined, hoje?: string): number | null {
  if (!Array.isArray(itens)) return null;
  const g = gruposDoHoje(itens, hoje ?? diaDeHoje());
  return g.atrasados.length + g.ligar.length;
}

/* OS GRUPOS DA ABA HOJE (handoff "Hoje e Eu enxutas", 04/11/26). O número do topo, o chip Hoje da
   fileira e o selo da aba são o MESMO: atrasados + ligar hoje. Os "sem próximo passo" têm o seu chip
   e o seu número (a regra única, semProximoPassoDaFila); os atrasados antigos ficam no recolhido.
   - atrasados: passo vencido há até 3 dias, ou negócio quente de qualquer data;
   - antigos: vencido há mais de 3 dias e não quente (recolhido "Antigos", fora da conta);
   - ligar: o que vence hoje, com o Cheguei sem Como foi no topo (no servidor ele conta atrasado). */
export const ATRASO_ANTIGO = 3;
type ItemDoGrupo = { venceu: boolean; motivo: string; grupo: string; etapaId: string; dealId?: string; prazo?: string | null };
const diaDeHoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
export function ehAtrasoAntigo(i: { prazo?: string | null; etapaId: string }, hoje: string): boolean {
  return !!i.prazo && diasEntre(i.prazo, hoje) > ATRASO_ANTIGO && !(ETAPAS_QUENTES as string[]).includes(i.etapaId);
}
export function gruposDoHoje<T extends ItemDoGrupo>(itens: T[], hoje: string): { atrasados: T[]; antigos: T[]; ligar: T[]; semPasso: T[] } {
  const atrasadosTodos = itens.filter((i) => secaoDoItem(i) === 'atrasados' && i.motivo !== 'visita_sem_registro');
  return {
    atrasados: atrasadosTodos.filter((i) => !ehAtrasoAntigo(i, hoje)),
    antigos: atrasadosTodos.filter((i) => ehAtrasoAntigo(i, hoje)),
    ligar: [...itens.filter((i) => i.motivo === 'visita_sem_registro'), ...itens.filter((i) => secaoDoItem(i) === 'hoje')],
    semPasso: itens.filter((i) => secaoDoItem(i) === 'sem_passo' && i.motivo !== 'visita_sem_registro'),
  };
}
