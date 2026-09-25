// Aba Tarefas do mapa novo (prompt final, Parte B §B4): regra pura, testável.
//
// Fonte: as tarefas abertas do executivo no HubSpot (useTarefasDoCrm) — é por
// elas que o Cockpit movimenta o executivo: o planejamento da semana, o
// follow-up do funil, o próximo passo da ficha de rua, a cobrança de SLA. As
// `client_tasks` do app (generate_client_tasks) não viram tarefa no HubSpot
// (Opção A do docs/pwa-para-cockpit.md §5) e aparecem à parte, como
// "sugestão do app".

export type GrupoTarefa = 'atrasadas' | 'hoje' | 'amanha' | 'semana' | 'depois';

export const GRUPOS: Array<{ id: GrupoTarefa; rotulo: string; cor: string }> = [
  { id: 'atrasadas', rotulo: 'ATRASADAS · SLA ESTOURADO', cor: '#F87171' },
  { id: 'hoje', rotulo: 'VENCE HOJE', cor: '#FCA5A5' },
  { id: 'amanha', rotulo: 'AMANHÃ', cor: '#FDE68A' },
  { id: 'semana', rotulo: 'ESTA SEMANA', cor: '#C9CED6' },
  // Fora do prompt, de propósito: tarefa daqui a 10 dias sumiria da tela.
  { id: 'depois', rotulo: 'MAIS À FRENTE', cor: '#8B919C' },
];

/** Dia AAAA-MM-DD em Brasília (toISOString vira o dia às 21h). */
export function diaBRT(d: Date | string): string | null {
  const t = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Domingo da semana de `hoje` (a semana útil acaba no fim de semana). */
function fimDaSemana(hoje: string): string {
  const [a, m, d] = hoje.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return somarDias(hoje, dow === 0 ? 0 : 7 - dow);
}

export function grupoDaTarefa(venceEm: string | null, agora: Date): GrupoTarefa {
  const hoje = diaBRT(agora)!;
  const dia = venceEm ? diaBRT(venceEm) : null;
  // Sem data não é "depois": é trabalho sem prazo, e o prazo é hoje.
  if (!dia) return 'hoje';
  if (dia < hoje) return 'atrasadas';
  if (dia === hoje) return 'hoje';
  if (dia === somarDias(hoje, 1)) return 'amanha';
  if (dia <= fimDaSemana(hoje)) return 'semana';
  return 'depois';
}

export function diasDeAtraso(venceEm: string | null, agora: Date): number {
  const hoje = diaBRT(agora);
  const dia = venceEm ? diaBRT(venceEm) : null;
  if (!hoje || !dia || dia >= hoje) return 0;
  return Math.round((Date.parse(hoje) - Date.parse(dia)) / 86400000);
}

type TarefaMinima = { assunto: string; venceEm: string | null; tipo: 'visita' | 'follow_up' | 'outro'; origem: string | null };

/** "SLA" no assunto é a cobrança que o robô do Cockpit cria. */
export const ehCobranca = (t: { assunto: string; origem?: string | null }) =>
  /^\s*(sla|d\d+)\b/i.test(t.assunto) || /sla|cobranca/i.test(t.origem ?? '');

/** Chip do tipo + de onde veio, na língua da rua. */
export function chipsDaTarefa(t: TarefaMinima, agora: Date): { tipo: string; origem: string | null; alerta: boolean } {
  const cobranca = ehCobranca(t);
  const tipo = cobranca ? 'Cobrança'
    : t.tipo === 'visita' ? 'Visita'
    : /reuni|demo/i.test(t.assunto) ? 'Reunião'
    : /liga|telefon/i.test(t.assunto) ? 'Ligação'
    : t.tipo === 'follow_up' ? 'Follow-up' : 'Tarefa';
  const atraso = diasDeAtraso(t.venceEm, agora);
  let origem: string | null = null;
  if (cobranca && atraso > 0) origem = `SLA estourado há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`;
  else if (atraso > 0) origem = `venceu há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`;
  else if (t.origem) {
    const o = t.origem.toLowerCase();
    origem = o.includes('ficha') ? 'criada pela ficha de rua'
      : o.includes('planej') ? 'do Planejamento'
      : o.includes('funil') ? 'do funil'
      : o.includes('rota') ? 'da rota do dia'
      : null;
  }
  return { tipo, origem, alerta: atraso > 0 };
}

/** Ação rápida à direita: `Liguei` para cobrança, follow-up e ligação. */
export function acaoRapida(t: TarefaMinima): 'liguei' | null {
  if (t.tipo === 'visita' || /reuni|demo/i.test(t.assunto)) return null;
  return 'liguei';
}

export function agrupar<T extends { venceEm: string | null }>(itens: T[], agora: Date): Array<{ grupo: (typeof GRUPOS)[number]; itens: T[] }> {
  const ordem = (x: T) => (x.venceEm ? Date.parse(x.venceEm) : Number.POSITIVE_INFINITY);
  return GRUPOS
    .map((grupo) => ({
      grupo,
      itens: itens.filter((t) => grupoDaTarefa(t.venceEm, agora) === grupo.id).sort((a, b) => ordem(a) - ordem(b)),
    }))
    .filter((g) => g.itens.length > 0);
}

/** Selo do rodapé: atrasadas + vencem hoje (nunca conta o futuro). */
export function seloDasTarefas(itens: Array<{ venceEm: string | null }>, agora: Date): number {
  return itens.filter((t) => {
    const g = grupoDaTarefa(t.venceEm, agora);
    return g === 'atrasadas' || g === 'hoje';
  }).length;
}
