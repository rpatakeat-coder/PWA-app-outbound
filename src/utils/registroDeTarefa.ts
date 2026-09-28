// O registro de uma tarefa que não é visita (28/09/2026, Julyan: "como eles dão
// registro das tarefas da agenda e da aba tarefas? eles ligam, e etc").
//
// Até aqui o "Liguei" só concluía a tarefa com "Ligação · tarefa encerrada": não dizia
// se atendeu, com quem falou nem o que vem agora — o gestor lia uma nota vazia e o
// próximo contato não existia. O registro tem três partes, e as três vão para o
// HubSpot (e dali para o Cockpit):
//   1. COMO FOI  → a nota da ligação no negócio (junto com a conclusão da tarefa);
//   2. O QUE VEM → uma tarefa nova de próximo passo: visita (entra no Planejamento e
//      na Agenda, 0133) ou ligar de novo (entra na Agenda e nas Tarefas);
//   3. uma linha livre, opcional.
// "Não atendeu" já sugere ligar no próximo dia útil: ligação que não aconteceu não
// pode sumir da lista sem deixar o próximo contato marcado.

export type ComoFoi = 'decisor' | 'falou' | 'nao_atendeu' | 'sem_interesse';
export type Proximo = { tipo: 'visita' | 'ligar' | 'nada'; dias: number };

export const COMO_FOI: Array<{ id: ComoFoi; rotulo: string }> = [
  { id: 'decisor', rotulo: 'Falei com quem decide' },
  { id: 'falou', rotulo: 'Falei, mas não era quem decide' },
  { id: 'nao_atendeu', rotulo: 'Não atendeu' },
  { id: 'sem_interesse', rotulo: 'Sem interesse' },
];

export const PROXIMOS: Array<{ id: string; rotulo: string; proximo: Proximo }> = [
  { id: 'visita1', rotulo: 'Visita amanhã', proximo: { tipo: 'visita', dias: 1 } },
  { id: 'visita3', rotulo: 'Visita em 3 dias', proximo: { tipo: 'visita', dias: 3 } },
  { id: 'ligar1', rotulo: 'Ligar amanhã', proximo: { tipo: 'ligar', dias: 1 } },
  { id: 'ligar3', rotulo: 'Ligar em 3 dias', proximo: { tipo: 'ligar', dias: 3 } },
  { id: 'ligar7', rotulo: 'Ligar em 7 dias', proximo: { tipo: 'ligar', dias: 7 } },
  { id: 'nada', rotulo: 'Nada agora', proximo: { tipo: 'nada', dias: 0 } },
];

/** O próximo passo que já vem marcado para cada resultado. */
export function proximoSugerido(r: ComoFoi): string {
  if (r === 'nao_atendeu') return 'ligar1';
  if (r === 'falou') return 'ligar3';
  if (r === 'decisor') return 'visita3';
  return 'nada';
}

/** `dias` dias ÚTEIS depois de `hoje` (AAAA-MM-DD, Brasília). Sábado e domingo pulam. */
export function diaUtilDepois(hoje: string, dias: number): string {
  const [a, m, d] = hoje.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  let n = 0;
  while (n < Math.max(1, dias)) {
    t.setUTCDate(t.getUTCDate() + 1);
    const dow = t.getUTCDay();
    if (dow !== 0 && dow !== 6) n += 1;
  }
  return t.toISOString().slice(0, 10);
}

const ROTULO = Object.fromEntries(COMO_FOI.map((c) => [c.id, c.rotulo])) as Record<ComoFoi, string>;

export function notaDoRegistro(o: { comoFoi: ComoFoi; assunto: string; nota?: string | null; proximo: Proximo; data?: string | null }): string {
  const partes = [`Ligação · ${ROTULO[o.comoFoi]}`];
  const livre = (o.nota ?? '').trim();
  if (livre) partes.push(livre);
  if (o.proximo.tipo !== 'nada' && o.data) {
    const [, mm, dd] = o.data.split('-');
    partes.push(`Próximo: ${o.proximo.tipo === 'visita' ? 'visita' : 'ligar'} em ${dd}/${mm}`);
  }
  partes.push(`(tarefa: ${o.assunto})`);
  return partes.join(' · ');
}

/** O corpo do próximo passo para a porta única (negocioAcao), ou null. */
export function pedidoDoProximo(o: { dealId: string | null; proximo: Proximo; data: string; nome: string | null; nota?: string | null }):
  { op: 'nota'; tipoAcao: 'proximo-passo'; dealId: string; tipo: 'visita' | 'follow-up'; data: string; texto: string } | null {
  if (!o.dealId || o.proximo.tipo === 'nada') return null;
  const quem = o.nome ? ` ${o.nome}` : '';
  const livre = (o.nota ?? '').trim();
  return {
    op: 'nota', tipoAcao: 'proximo-passo', dealId: o.dealId, data: o.data,
    tipo: o.proximo.tipo === 'visita' ? 'visita' : 'follow-up',
    texto: (o.proximo.tipo === 'visita' ? `Visita${quem}` : `Ligar${quem}`) + (livre ? ` — ${livre}` : ''),
  };
}
