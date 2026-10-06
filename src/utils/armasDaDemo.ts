// AS ARMAS PARA A DEMO (06/10/26). Julyan: "o executivo tem que preencher as etapas ali,
// principalmente quando vai pra demo, ele sabe o que o cliente tá usando — precisamos de
// todas as armas, e eu como gestor preciso ter tudo isso".
//
// Ao avançar para Demo/Proposta ou Negociação, a folha Mudar etapa mostra o que se sabe do
// restaurante — sistema que usa, maior dor, quem decide e o melhor horário — já preenchido
// com o que o negócio (HubSpot) e as fichas de visita têm. Avisa o que falta, nunca trava
// ("obrigatório é avisar"). Grava pelas MESMAS rotas da ficha de visita: hubspot-sync
// `qualificar` (sistema, dor, horário) e `decisor` (vira contato do negócio).
// Regras puras, sem React: testadas em armasDaDemo.teste.ts.

import { ETAPA, GARGALOS, HORARIOS, type HorarioDecisor } from './fichaDeRua';

export const ETAPAS_COM_ARMAS: string[] = [ETAPA.demo, ETAPA.negociacao];

export type FichaArmas = {
  ocorrido_em: string | null; decisor_nome: string | null; decisor_papel: string | null;
  horario_dono: string | null; sistema: string | null; dor: string | null;
};

export type Armas = { sistema: string; dor: string; decisor: string; papel: string; horario: HorarioDecisor | '' };

const limpo = (v: unknown): string => {
  const t = v == null ? '' : String(v).trim();
  /* "VERIFICAR" e afins não são resposta: é o que o CRM tem quando ninguém perguntou */
  return /^(verificar|-|\.|n\/a|na)$/i.test(t) ? '' : t;
};

/** O que já se sabe: o negócio (HubSpot) vence; a ficha mais recente que tem o campo completa. */
export function armasConhecidas(negocio: Record<string, unknown>, fichas: FichaArmas[]): Armas {
  const ord = [...fichas].sort((a, b) => (b.ocorrido_em ?? '').localeCompare(a.ocorrido_em ?? ''));
  const daFicha = (k: keyof FichaArmas) => limpo(ord.find((f) => limpo(f[k]))?.[k]);
  const hsHorario = limpo(negocio.melhor_horario_do_decisor);
  const horarioNeg = HORARIOS.find((h) => h.hs === hsHorario)?.valor ?? '';
  const horarioFicha = HORARIOS.find((h) => h.valor === daFicha('horario_dono'))?.valor ?? '';
  const comDecisor = ord.find((f) => limpo(f.decisor_nome));
  const dorNeg = limpo(negocio.gargalo_operacional);
  const dorFicha = daFicha('dor');
  return {
    sistema: limpo(negocio.nome_do_sistema) || daFicha('sistema'),
    dor: (GARGALOS as readonly string[]).includes(dorNeg) ? dorNeg : ((GARGALOS as readonly string[]).includes(dorFicha) ? dorFicha : ''),
    decisor: comDecisor ? limpo(comDecisor.decisor_nome) : '',
    papel: comDecisor ? limpo(comDecisor.decisor_papel) : '',
    horario: (horarioNeg || horarioFicha) as Armas['horario'],
  };
}

const ROTULO: Record<keyof Omit<Armas, 'papel'>, string> = { sistema: 'sistema que usa', dor: 'maior dor', decisor: 'quem decide', horario: 'melhor horário' };

/** O que ainda falta, na ordem em que o gestor precisa. */
export function armasQueFaltam(a: Armas): string[] {
  return (['sistema', 'dor', 'decisor', 'horario'] as const).filter((k) => !a[k]).map((k) => ROTULO[k]);
}

/** Uma linha para o resumo quando está tudo conhecido. */
export function resumoDasArmas(a: Armas): string {
  const h = HORARIOS.find((x) => x.valor === a.horario)?.curto;
  return [a.sistema, a.dor, a.decisor ? `${a.decisor}${a.papel ? ` (${a.papel.toLowerCase()})` : ''}` : '', h ?? ''].filter(Boolean).join(' · ');
}

export type EnvioArmas = { corpo: Record<string, unknown>; rotulo: string };

/**
 * O que mandar ao HubSpot: só o que é novo para o NEGÓCIO (o que a ficha sabia e o CRM
 * não tem também vai — é assim que a arma chega ao gestor). Vazio nunca vai: o servidor
 * não apaga qualificação, e aqui também não se tenta.
 */
export function enviosDasArmas(p: { dealId: string; ownerId: string | null; negocio: Record<string, unknown>; armas: Armas; decisorNoNegocio?: boolean }): EnvioArmas[] {
  const { armas: a, negocio } = p;
  const envios: EnvioArmas[] = [];
  const propriedades: Record<string, string> = {};
  if (a.sistema && a.sistema !== limpo(negocio.nome_do_sistema)) propriedades.nome_do_sistema = a.sistema.slice(0, 120);
  if (a.dor && (GARGALOS as readonly string[]).includes(a.dor) && a.dor !== limpo(negocio.gargalo_operacional)) propriedades.gargalo_operacional = a.dor;
  const hs = HORARIOS.find((h) => h.valor === a.horario)?.hs;
  if (hs && hs !== limpo(negocio.melhor_horario_do_decisor)) propriedades.melhor_horario_do_decisor = hs;
  if (Object.keys(propriedades).length) {
    envios.push({ corpo: { type: 'qualificar', id_hubspot: p.dealId, propriedades }, rotulo: 'Sistema, dor e horário no negócio' });
  }
  if (a.decisor && !p.decisorNoNegocio) {
    envios.push({
      corpo: { type: 'decisor', id_hubspot: p.dealId, nome: a.decisor.slice(0, 80), ...(a.papel ? { papel: a.papel } : {}), ...(p.ownerId ? { owner_id: p.ownerId } : {}) },
      rotulo: 'Quem decide no negócio',
    });
  }
  return envios;
}
