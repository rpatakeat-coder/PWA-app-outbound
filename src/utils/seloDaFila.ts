// O selo que diz o que está em jogo (handoff "Tarefas do App", P2, 17/10/2026): o mesmo texto no
// menu de baixo, no menu lateral do PC e no sino. "N quentes esfriando" se houver quente (Conversa
// com decisor, Demo/Proposta ou Negociação com tarefa vencida ou vencendo hoje); senão "N
// vencidos"; fila zerada ou sem vencido e sem quente: sem selo.
import { quenteEsfriando } from '../../supabase/functions/_compartilhado/filaDoDinheiro';

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
