// O MOTIVO DE TIRAR DO PLANO, EM TODOS OS CAMINHOS (15/11/26).
//
// Medido em 14/11: 28 paradas de volta saíram do plano em novembro sem motivo nenhum. Só a Agenda
// perguntava (0220); o mapa, o cartão do lead, a tela de Rota, o planejamento em lote e o "Mudar no
// plano" tiravam calados, e o gestor não tinha como saber se a porta estava fechada, se faltou tempo
// ou se o executivo desistiu dela. Aqui fica a pergunta única, de um toque, e os motivos que o
// próprio app sabe sem perguntar (mudou de dia, negócio perdido, conta descartada, desfez).
//
// A coluna é texto livre (field_route_stops.motivo_remocao); 'cockpit' é escrito pelo banco (0265)
// quando a parada sai porque alguém a tirou no Planejamento do Cockpit.
// Este arquivo é PURO (o teste roda sem a tela); quem abre a pergunta é pedirMotivoDeTirar.ts.

/** O que o executivo responde. */
export type MotivoPerguntado = 'fechado' | 'sem_tempo' | 'outro_dia' | 'nao_vale';
/** O que o app grava sozinho, porque já sabe. */
export type MotivoSabido = 'perdido' | 'descartada' | 'desfeito';
export type MotivoDeTirar = MotivoPerguntado | MotivoSabido;

export const ROTULO_DO_MOTIVO: Record<MotivoDeTirar | 'cockpit', string> = {
  fechado: 'estava fechado',
  sem_tempo: 'sem tempo no dia',
  outro_dia: 'passou para outro dia',
  nao_vale: 'não vale a visita',
  perdido: 'negócio perdido',
  descartada: 'conta descartada',
  desfeito: 'desfez o que tinha posto',
  cockpit: 'tirada no Planejamento',
};

/** As respostas da pergunta. "Estava fechado" só existe para hoje: ninguém viu a porta de amanhã. */
export function opcoesDeMotivo(dia: string, hoje: string): { id: MotivoPerguntado; rotulo: string }[] {
  const eHoje = dia === hoje;
  return [
    ...(eHoje ? [{ id: 'fechado' as const, rotulo: 'Estava fechado' }] : []),
    { id: 'sem_tempo' as const, rotulo: eHoje ? 'Sem tempo hoje' : 'Sem tempo nesse dia' },
    { id: 'outro_dia' as const, rotulo: 'Vou em outro dia' },
    { id: 'nao_vale' as const, rotulo: 'Não vale a visita' },
  ];
}

/** O título da pergunta: uma porta pelo nome, várias pela contagem. */
export function tituloDaPergunta(nome: string | null, quantas: number): string {
  return quantas > 1 || !nome ? `Tirar ${quantas} paradas do plano?` : `Tirar ${nome} do plano?`;
}

export type PedidoDeMotivo = { nome: string | null; dia: string; hoje: string; quantas?: number };
export const TEXTO_DA_PERGUNTA = 'Sai da Agenda e do Planejamento do gestor, com o motivo.';
/** Os botões da pergunta: cada motivo devolve o seu; Cancelar devolve null (nada sai do plano). */
export function botoesDaPergunta(p: PedidoDeMotivo, responder: (m: MotivoPerguntado | null) => void): { text: string; style?: 'cancel'; onPress: () => void }[] {
  return [
    ...opcoesDeMotivo(p.dia, p.hoje).map((o) => ({ text: o.rotulo, onPress: () => responder(o.id) })),
    { text: 'Cancelar', style: 'cancel' as const, onPress: () => responder(null) },
  ];
}
