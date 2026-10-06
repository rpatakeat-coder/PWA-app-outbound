// FEITO NO DIA (Julyan 06/10/26): "quero que mostre tudo que foi feito no dia… o resumo pra eles
// não esquecerem… pra quando ficou o próximo passo". A Agenda junta, por ordem de hora:
//   · cada check-in (client_visits) — do plano ou fora dele — com a prova de GPS;
//   · o registro daquela visita (fichas_de_rua): como foi, a etapa e o próximo passo com data;
//   · o que foi registrado na aba Tarefas (fila_feitas): a ligação, o resultado e a volta.
// Check-in sem registro aparece em âmbar ("falta registrar"): é o lembrete.

import { ROTULO_ETAPA } from './fichaDeRua';

/** a etapa vem gravada como o id do HubSpot: o resumo mostra o nome */
const etapaNome = (x: string | null) => (x ? ROTULO_ETAPA[x] ?? x : '—');

export type VisitaDoDia = { id: string; client_id: string; visited_at: string; distance_m: number | null; declarada: boolean | null };
export type FichaDoDia = {
  client_id: string | null; ocorrido_em: string; como_foi: string; proximo: string | null; proximo_em: string | null;
  proximo_tipo: string | null; etapa_antes: string | null; etapa_depois: string | null; decisor_nome: string | null; motivo_perdido: string | null;
};
export type RegistroDoDia = { id: string; deal_id: string | null; negocio: string | null; hora: string | null; resultado: string | null; volta: string | null; perdido: string | null; criada_em: string };

export type ItemFeito = {
  chave: string;
  quando: string;
  hora: string;
  tipo: 'visita' | 'tarefa';
  clientId: string | null;
  nome: string;
  /** "Visita · GPS a 40 m · fora do plano" */
  linha1: string;
  /** "Falou com o decisor · Visita → Conversa com decisor" */
  linha2: string | null;
  /** "Próximo passo: Reunião qui 08/10" */
  proximo: string | null;
  faltaRegistro: boolean;
};

const COMO_FOI: Record<string, string> = {
  falou_com_decisor: 'Falou com o decisor',
  decisor_ausente: 'Decisor ausente',
  sem_interesse: 'Sem interesse',
  estabelecimento_fechado: 'Estava fechado',
};
const PROXIMO: Record<string, string> = {
  reuniao: 'Reunião',
  voltar7: 'Voltar em 7 dias',
  ligar_amanha: 'Ligar amanhã',
  voltar_horario: 'Voltar no horário do dono',
  voltar_amanha: 'Voltar amanhã',
};
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const horaBRT = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
export function diaCurto(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return `${SEMANA[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function textoDoProximo(f: FichaDoDia): string | null {
  if (f.proximo === 'sem_interesse' || f.como_foi === 'sem_interesse') return f.motivo_perdido ? `Encerrado: ${f.motivo_perdido}` : 'Encerrado (sem interesse)';
  const o = f.proximo ? PROXIMO[f.proximo] ?? f.proximo : null;
  if (!o && !f.proximo_em) return null;
  return [o, f.proximo_em ? diaCurto(f.proximo_em) : null].filter(Boolean).join(' ');
}

export function montarFeitoNoDia(p: {
  visitas: VisitaDoDia[]; fichas: FichaDoDia[]; registros: RegistroDoDia[];
  nomeDe: (clientId: string) => string | null; noPlano: Set<string>;
}): ItemFeito[] {
  const itens: ItemFeito[] = [];
  const fichasLivres = [...p.fichas];
  for (const v of p.visitas) {
    // o registro desta visita: o do mesmo lead mais perto da hora do check-in
    let melhor = -1;
    for (let i = 0; i < fichasLivres.length; i++) {
      if (fichasLivres[i].client_id !== v.client_id) continue;
      if (melhor < 0 || Math.abs(Date.parse(fichasLivres[i].ocorrido_em) - Date.parse(v.visited_at)) < Math.abs(Date.parse(fichasLivres[melhor].ocorrido_em) - Date.parse(v.visited_at))) melhor = i;
    }
    const f = melhor >= 0 ? fichasLivres.splice(melhor, 1)[0] : null;
    const prova = v.declarada || v.distance_m == null ? 'sem GPS' : `GPS a ${Math.round(Number(v.distance_m))} m`;
    const etapa = f && f.etapa_depois && f.etapa_depois !== f.etapa_antes ? `${etapaNome(f.etapa_antes)} → ${etapaNome(f.etapa_depois)}` : null;
    itens.push({
      chave: `v-${v.id}`, quando: v.visited_at, hora: horaBRT(v.visited_at), tipo: 'visita', clientId: v.client_id,
      nome: p.nomeDe(v.client_id) ?? 'Lead',
      linha1: ['Visita', prova, p.noPlano.has(v.client_id) ? null : 'fora do plano'].filter(Boolean).join(' · '),
      linha2: f ? [COMO_FOI[f.como_foi] ?? f.como_foi, f.decisor_nome ? `com ${f.decisor_nome}` : null, etapa].filter(Boolean).join(' · ') : null,
      proximo: f ? textoDoProximo(f) : null,
      faltaRegistro: !f,
    });
  }
  // registro sem check-in no dia (ex.: a ficha de uma visita de ontem feita hoje): entra sozinho
  for (const f of fichasLivres) {
    itens.push({
      chave: `f-${f.client_id}-${f.ocorrido_em}`, quando: f.ocorrido_em, hora: horaBRT(f.ocorrido_em), tipo: 'visita', clientId: f.client_id,
      nome: (f.client_id && p.nomeDe(f.client_id)) || 'Lead', linha1: 'Registro de visita',
      linha2: COMO_FOI[f.como_foi] ?? f.como_foi, proximo: textoDoProximo(f), faltaRegistro: false,
    });
  }
  for (const r of p.registros) {
    const volta = r.perdido ? `Encerrado: ${r.perdido}` : r.volta ? `Voltar ${diaCurto(r.volta)}` : null;
    itens.push({
      chave: `t-${r.id}`, quando: r.criada_em, hora: r.hora || horaBRT(r.criada_em), tipo: 'tarefa', clientId: null,
      nome: r.negocio || 'Negócio', linha1: 'Registrado na Tarefas', linha2: r.resultado, proximo: volta, faltaRegistro: false,
    });
  }
  return itens.sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
}
