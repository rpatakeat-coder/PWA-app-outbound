// O registro em 3 toques da fila do dinheiro (docs/10 §1.5). Puro, com teste em
// src/utils/filaDoDinheiro.teste.ts. A gravação é a mesma de sempre (concluirTarefa:
// 5 s de Desfazer, fila sem sinal); aqui só o que vai escrito e quando volta.
import { oQuePulou, proximoDiaUtil } from '../../supabase/functions/_compartilhado/filaDoDinheiro';

export type ComoFoiFila = 'decisor' | 'nao_atendeu' | 'pediu_retorno' | 'sem_interesse';

export const COMO_FOI_FILA: Array<{ id: ComoFoiFila; rotulo: string }> = [
  { id: 'decisor', rotulo: 'Falei com quem decide' },
  { id: 'nao_atendeu', rotulo: 'Não atendeu' },
  { id: 'pediu_retorno', rotulo: 'Pediu retorno' },
  { id: 'sem_interesse', rotulo: 'Sem interesse' },
];

/** Chips de data: dias ÚTEIS (feriados nacionais), `null` = Outro dia (calendário). */
export const DIAS_FILA: Array<{ dias: number | null; rotulo: string }> = [
  { dias: 1, rotulo: 'Amanhã' }, { dias: 2, rotulo: 'Em 2 dias' }, { dias: 3, rotulo: 'Em 3 dias' },
  { dias: 5, rotulo: 'Em 1 semana' }, { dias: null, rotulo: 'Outro dia' },
];

/** O próximo passo que já vem marcado (docs/10 §1.5, toque 2). */
export function diasSugeridos(c: ComoFoiFila): number | null {
  if (c === 'decisor') return 2;
  if (c === 'nao_atendeu') return 1;
  if (c === 'pediu_retorno') return 3;
  return null;
}

export const MOTIVOS_SEM_INTERESSE = ['Preço', 'Funcionalidade', 'Não quer mudar de sistema', 'Outros'] as const;

const DIA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const SEM_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();

export function dataDoChip(hoje: string, dias: number, feriados: string[]): string {
  return proximoDiaUtil(hoje, dias, feriados);
}
/** "Volta em 27/10 (terça)" + "pula o fim de semana". */
export function fraseDaVolta(hoje: string, dia: string, feriados: string[]): { frase: string; pulo: string } {
  return { frase: `Volta em ${ddmm(dia)} (${DIA_SEMANA[dow(dia)]})`, pulo: oQuePulou(hoje, dia, feriados) };
}
/** "ter 27/10" — a barra de Desfazer e Feitas hoje. */
export const diaCurto = (d: string) => `${SEM_CURTO[dow(d)]} ${ddmm(d)}`;

const ROTULO: Record<ComoFoiFila, string> = Object.fromEntries(COMO_FOI_FILA.map((c) => [c.id, c.rotulo])) as Record<ComoFoiFila, string>;
export const rotuloComoFoi = (c: ComoFoiFila) => ROTULO[c];

/** A nota no negócio. Mesmo formato da Agenda: canal · como foi · próximo · (tarefa). */
export function notaDaFila(o: { canal: 'ligacao' | 'whatsapp'; comoFoi: ComoFoiFila; volta: string | null; assunto?: string | null; motivo?: string | null; detalhe?: string | null }): string {
  const partes = [`${o.canal === 'whatsapp' ? 'WhatsApp' : 'Ligação'} · ${ROTULO[o.comoFoi]}`];
  if (o.comoFoi === 'sem_interesse' && o.motivo) partes.push(`motivo: ${o.motivo}${o.detalhe ? ` (${o.detalhe.trim()})` : ''}`);
  if (o.volta) partes.push(`Próximo: ligar em ${ddmm(o.volta)}`);
  if (o.assunto) partes.push(`(tarefa: ${o.assunto})`);
  partes.push('· pela fila de Tarefas');
  return partes.join(' · ');
}

/** O corpo do próximo passo na porta única (o mesmo da Agenda: op nota / proximo-passo). */
export function pedidoDaVolta(o: { dealId: string; volta: string; pessoa: string | null; canal: 'ligacao' | 'whatsapp' }) {
  return {
    op: 'nota', tipoAcao: 'proximo-passo', dealId: o.dealId, data: o.volta, tipo: 'follow-up',
    texto: `${o.canal === 'whatsapp' ? 'WhatsApp' : 'Ligar'}${o.pessoa ? ` ${o.pessoa}` : ''}`,
  } as const;
}

/** O que o botão Salvar diz enquanto falta algo — nunca fica cinza calado. */
export function textoDoSalvar(o: { comoFoi: ComoFoiFila | null; volta: string | null; outroDia: boolean; motivo: string | null; detalhe: string }): { pode: boolean; texto: string } {
  if (!o.comoFoi) return { pode: false, texto: 'Marque como foi' };
  if (o.comoFoi === 'sem_interesse') {
    if (!o.motivo) return { pode: false, texto: 'Escolha o motivo' };
    if (o.motivo === 'Outros' && !o.detalhe.trim()) return { pode: false, texto: 'Escreva o que pesou' };
    return { pode: true, texto: 'Salvar' };
  }
  if (!o.volta) return { pode: false, texto: o.outroDia ? 'Escolha o dia' : 'Escolha o próximo passo' };
  return { pode: true, texto: 'Salvar' };
}
