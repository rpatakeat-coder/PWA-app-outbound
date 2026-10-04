// Regras puras do "Um app só" (04/10/2026) — sem tela, sem rede, testadas em umApp.teste.ts.

export type MomentoDoDia = 'manha' | 'rua' | 'noite';

/** manhã = antes do 1º check-in e antes das 11h; noite = a partir das 18h; o resto é rua (docs/11 §1). Hora de Brasília. */
export function momentoDoDia(visitasHoje: number, agora = new Date()): MomentoDoDia {
  const h = Number(new Date(agora.getTime() - 3 * 3600000).toISOString().slice(11, 13));
  if (h >= 18) return 'noite';
  if (h < 11 && visitasHoje === 0) return 'manha';
  return 'rua';
}

const DIA_MS = 86400000;
const isoBRT = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);

/** A segunda da "esta semana" do Planejamento: no sábado e no domingo já é a próxima (igual ao Cockpit). */
export function segundaDaSemana(agora = new Date(), deslocar = 0): string {
  const hoje = new Date(`${isoBRT(agora)}T12:00:00Z`);
  const dow = hoje.getUTCDay();
  const ate = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  return new Date(hoje.getTime() + (ate + deslocar * 7) * DIA_MS).toISOString().slice(0, 10);
}

/** "faltam 3 provadas" / "faltam 1 demo" / "batido" — o que falta para o piso da semana (10 provadas + 1 demo). */
export function textoDoPiso(p: { semana?: { piso_faltam_provadas: number; piso_faltam_demos: number } } | undefined | null): string | null {
  const s = p?.semana;
  if (!s) return null;
  const v = s.piso_faltam_provadas, d = s.piso_faltam_demos;
  if (v <= 0 && d <= 0) return 'Piso da semana batido';
  const partes = [v > 0 ? `${v} ${v === 1 ? 'provada' : 'provadas'}` : null, d > 0 ? `${d} demo` : null].filter(Boolean);
  return `Piso: faltam ${partes.join(' e ')}`;
}

/** de/para do plano para a lista do HubSpot (a mesma do Cockpit: prcPlanoApresentadoHubSpot). */
export function planoApresentadoHubSpot(tipoPlano: string, tier: string): string {
  const tipoAntigo = tipoPlano === 'completo' ? 'mesas' : tipoPlano;
  const planoAntigo = tier === 'intermediario' ? 'inovacao' : tier;
  const mapa: Record<string, string> = {
    basico: tipoAntigo === 'mesas' ? 'Básico (PDV + mesa + delivery)' : 'Básico (PDV + delivery)',
    inovacao: 'Inovação', profissional: 'Pro', enterprise: 'Enterprise',
  };
  return mapa[planoAntigo] ?? '';
}

/** As etapas abertas do quadro, na ordem do funil. Cores de etapa são DADO. */
export const ETAPAS_DO_FUNIL: Array<{ id: string; rotulo: string; cor: string }> = [
  { id: '1395880469', rotulo: 'Prospecção', cor: '#7A8494' },
  { id: '1396005401', rotulo: 'Visita', cor: '#E51A31' },
  { id: '1395880470', rotulo: 'Conversa com decisor', cor: '#B07C1F' },
  { id: '1395880471', rotulo: 'Demo/Proposta', cor: '#8E3B5C' },
  { id: '1395880472', rotulo: 'Negociação', cor: '#2B3440' },
  { id: '1395880473', rotulo: 'Ag. Pagamento', cor: '#1E9E7B' },
];
/** A próxima etapa pelo Avançar. Ag. Pagamento não tem: a entrada lá disparou a cobrança. */
export const proximaEtapa = (id: string) => {
  const i = ETAPAS_DO_FUNIL.findIndex((e) => e.id === id);
  return i >= 0 && i < ETAPAS_DO_FUNIL.length - 1 ? ETAPAS_DO_FUNIL[i + 1] : null;
};
