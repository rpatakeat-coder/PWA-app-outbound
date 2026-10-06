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

/** O que já se sabe: a ficha mais recente que tem o campo (ou a folha, que grava como ficha) vence;
 *  sem ficha, o negócio (HubSpot). É a MESMA regra do Cockpit do gestor (Raio X, 3.2). */
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
    sistema: daFicha('sistema') || limpo(negocio.nome_do_sistema),
    dor: (GARGALOS as readonly string[]).includes(dorFicha) ? dorFicha : ((GARGALOS as readonly string[]).includes(dorNeg) ? dorNeg : ''),
    /* sem ficha com decisor: o contato Dono/Gerente do negócio (mapa_negocio, 0173) */
    decisor: comDecisor ? limpo(comDecisor.decisor_nome) : limpo(negocio.decisor_nome),
    papel: comDecisor ? limpo(comDecisor.decisor_papel) : limpo(negocio.decisor_papel),
    horario: (horarioFicha || horarioNeg) as Armas['horario'],
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

/* ══ RAIO X › PRAÇA (06/10/26, pacote zip-raiox-praca) ══════════════════════════════════
   O que segue é a MESMA regra do Cockpit do gestor (cockpit-unificado, gv2-praca.js): o
   sistema normalizado, o argumento do Playbook por tipo de sistema e a linha "Na sua
   praça". Se mudar lá, muda aqui — os dois lados mostram o mesmo número. */

/** Os chips da folha "Antes da Demo" (a ficha da visita continua com os dela). */
export const SISTEMAS_ARMAS = ['Nenhum', 'Saipos', 'Goomer', 'Colibri', 'Anota Aí', 'Consumer', 'Outro'] as const;

const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SISTEMAS_RE: [string, RegExp][] = [
  ['Saipos', /sai ?pos/], ['Anota Aí', /anotai|anota ?ai|anota a( |$)/], ['Colibri', /colibri/], ['Goomer', /goomer/],
  ['Consumer', /consumer/], ['Frest', /(^| )f ?rest( |$)/], ['Yooga', /yooga/], ['xMenu', /x ?menu/],
  ['Cardápio Web', /cardapio ?web/], ['Linx', /(^| )linx( |$)/],
  ['BitiBar', /bit ?i? ?bar/], ['Tronsoft', /tronsof/], ['Queops', /q(u)?eops/], ['Totvs', /totvs|tovs/], ['Teknisa', /teknisa/],
  ['Cloudify', /cloudify/], ['Data Caixa', /data ?caixa/], ['PDV Legal', /pdv legal/],
];
const SEM_REGISTRO = /^(|verificar|a verificar|ver|nao sei|nao sabe|nao informado|nao informou|perguntar|sem informacao|desconhecido|n a|na|x+|\?+|-+|\.+|0|sem|fup|teste)$/;
const NENHUM = /(^| )(nenhum|nenhuma|nao usa|nao utiliza|nao tem|nao possui|sem sistema|caderno|planilha|manual|na mao|papel|anota no papel)( |$)/;

/** O concorrente, 'Nenhum', 'Outro' — ou null quando NÃO está registrado ("VERIFICAR", vazio, "não sei"). */
export function normalizarSistema(v: unknown): string | null {
  const t = semAcento(v).replace(/[^a-z0-9? ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (SEM_REGISTRO.test(t) || /nao sei|nao sab|nao soube|nao disse|nao identific|nao informad|verificar|sem resposta|relembrar|passar la|ir la|perguntar/.test(t)) return null;
  let melhor: string | null = null;
  let pos = Infinity;
  for (const [nome, re] of SISTEMAS_RE) { const m = t.match(re); if (m && (m.index ?? 0) < pos) { pos = m.index ?? 0; melhor = nome; } }
  if (melhor) return melhor;
  if (NENHUM.test(t)) return 'Nenhum';
  return 'Outro';
}

/** O argumento do Playbook ("Já tenho sistema", seção por tipo de sistema). */
export type Argumento = { contra: string; objecao: string; texto: string };
const ARG_TIPOS: { sistemas: string[]; objecao: string; texto: string }[] = [
  { sistemas: ['Saipos', 'Colibri', 'Consumer', 'Yooga', 'Frest', 'Linx', 'BitiBar', 'Tronsoft', 'Queops', 'Totvs', 'Teknisa', 'Cloudify', 'Data Caixa', 'PDV Legal', 'Outro'], objecao: 'Já tenho sistema',
    texto: 'Ele emite nota e fecha caixa bem. Ele te diz qual é a margem do seu prato mais vendido, ou só quanto entrou? A porta é CMV e ficha técnica: o que ele nunca teve, não o que ele já tem.' },
  { sistemas: ['Anota Aí'], objecao: 'Meu delivery já está resolvido',
    texto: 'Ele cuida bem do delivery. E quem está sentado no salão agora, quem atende? A porta é Garçom Digital e o salão. Não disputa o delivery dele.' },
  { sistemas: ['Goomer', 'xMenu', 'Cardápio Web'], objecao: 'Já tenho cardápio digital',
    texto: 'O senhor sabe o nome e o telefone de quem comeu aqui na terça passada? A porta é CRM, cashback e recompra.' },
  { sistemas: ['Nenhum'], objecao: 'Não preciso de sistema',
    texto: 'O caderno funciona enquanto o senhor está aqui. E no sábado à noite, quando o salão lota e o senhor precisa sair? Nunca chame de amador.' },
];
export function argumentoDoSistema(sistemaCru: unknown): Argumento | null {
  const s = normalizarSistema(sistemaCru);
  if (!s) return null;
  const tipo = ARG_TIPOS.find((t) => t.sistemas.includes(s)) ?? ARG_TIPOS[0];
  const nome = s === 'Outro' ? String(sistemaCru ?? '').trim() || 'Outro' : s;
  return { contra: s === 'Nenhum' ? 'o caderno' : `a ${nome}`, objecao: tipo.objecao, texto: tipo.texto };
}

/** O que a função armas_da_praca (0172) devolve: o agregado da praça, sem nome de ninguém. */
export type DadosDaPraca = { praca: string | null; dores: { dor: string; n: number }[]; fechados: { s: string | null; g: boolean; m: string | null }[] };

/** "Na sua praça: Fila é a dor nº 1 (14 negócios). Contra a Saipos, o time ganhou 4 e perdeu 5, a maioria por …". */
export function linhaDaPraca(d: DadosDaPraca | null, sistemaCru: unknown): string | null {
  if (!d || !d.praca) return null;
  const partes: string[] = [];
  const top = d.dores[0];
  if (top) partes.push(`${top.dor} é a dor nº 1 (${top.n} ${top.n === 1 ? 'negócio' : 'negócios'} em ${d.praca}).`);
  const s = normalizarSistema(sistemaCru);
  if (s && s !== 'Outro') {
    const contra = d.fechados.filter((f) => normalizarSistema(f.s) === s);
    const g = contra.filter((f) => f.g).length;
    const p = contra.length - g;
    if (p || g) {
      const motivos: Record<string, number> = {};
      contra.filter((f) => !f.g && f.m && f.m !== 'Outros').forEach((f) => { motivos[f.m as string] = (motivos[f.m as string] ?? 0) + 1; });
      const m = Object.keys(motivos).sort((a, b) => motivos[b] - motivos[a])[0];
      partes.push(`${s === 'Nenhum' ? 'Com quem não tem sistema' : `Contra a ${s}`}, o time ganhou ${g} e perdeu ${p}${m ? `, a maioria por "${m.toLowerCase()}"` : ''}.`);
    }
  }
  return partes.length ? partes.join(' ') : null;
}

/** As fichas e os avanços pela folha (gv2_falta_etapa.armas) entram na mesma lista, por data. */
export function fichasDaFolha(linhas: { criado_em: string; armas: Record<string, unknown> | null }[]): FichaArmas[] {
  return linhas.filter((l) => l.armas).map((l) => {
    const a = l.armas as Record<string, unknown>;
    const v = (k: string) => (a[k] == null ? null : String(a[k]));
    return { ocorrido_em: l.criado_em, sistema: v('sistema'), dor: v('dor'), decisor_nome: v('decisor'), decisor_papel: v('papel'), horario_dono: v('horario') };
  });
}

/** A linha de gv2_falta_etapa: um avanço para Demo/Negociação pela folha, com o que faltou. */
export function registroDoAvanco(p: { dealId: string; execId: string; etapa: string; armas: Armas }) {
  const faltou = (['sistema', 'dor', 'decisor', 'horario'] as const).filter((k) => !p.armas[k]);
  return {
    negocio_id: p.dealId, exec_id: p.execId, etapa: p.etapa, faltou,
    armas: { sistema: p.armas.sistema || null, dor: p.armas.dor || null, decisor: p.armas.decisor || null, papel: p.armas.papel || null, horario: p.armas.horario || null },
  };
}

/** "decisor, horário" — para o toast do "Avançar sem preencher". */
export function rotuloDasFaltas(a: Armas): string {
  const R: Record<string, string> = { sistema: 'sistema', dor: 'dor', decisor: 'decisor', horario: 'horário' };
  return (['sistema', 'dor', 'decisor', 'horario'] as const).filter((k) => !a[k]).map((k) => R[k]).join(', ');
}

/** O chip da folha para um sistema como veio ("Caderno" → Nenhum, "SAIPOS" → Saipos). O valor
 *  cru continua o mesmo até o executivo tocar num chip: o HubSpot não é reescrito à toa. */
export function chipDoSistema(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = normalizarSistema(s);
  return n && n !== 'Outro' && (SISTEMAS_ARMAS as readonly string[]).includes(n) ? n : 'Outro';
}

/** O nome que a tela mostra: o normalizado quando é conhecido, senão o que foi escrito. */
export function nomeDoSistema(v: unknown): string {
  const s = String(v ?? '').trim();
  const n = normalizarSistema(s);
  return n && n !== 'Outro' ? n : s;
}
