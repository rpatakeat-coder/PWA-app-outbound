// Ficha de rua (mapa novo, entrega 5; prompt final corrigido §8.3): regras sem React.
//
// A ficha abre depois do check-in e pede SÓ o que falta. Dois campos são
// obrigatórios (Como foi e Próximo passo). Tudo que vai para o HubSpot sai pela
// porta única do Cockpit, POST cockpit-api/negocio-acao (contrato lido no
// bundle em 25/09/2026):
//   - nota da visita: op 'nota' com o bloco DESFECHO_VISITA v1 inteiro;
//   - próximo passo com data: op 'nota' + tipoAcao 'proximo-passo' (cria a
//     tarefa e grava nome_do_sistema/gargalo pela `qualificacao`);
//   - etapa: op 'mudar-etapa', com as regras do servidor espelhadas aqui
//     (não pula fase; Reciclagem/Perdido de qualquer etapa; Ganho proibido;
//     PROPS_OBRIGATORIAS_POR_ETAPA).

import { GARGALOS, montarBlocoDesfecho, proximoDiaUtil, type Desfecho, type Gargalo } from './desfechoVisita';

export { GARGALOS };
export type { Gargalo };

export const COMO_FOI: { id: Desfecho; rotulo: string }[] = [
  { id: 'falou_com_decisor', rotulo: 'Falei com quem decide' },
  { id: 'decisor_ausente', rotulo: 'Quem decide não estava' },
  { id: 'sem_interesse', rotulo: 'Não quis conversar' },
  { id: 'estabelecimento_fechado', rotulo: 'Estava fechado' },
];

export type Proximo = 'reuniao' | 'voltar7' | 'ligar_amanha' | 'sem_interesse';
export const PROXIMOS: { id: Proximo; rotulo: string }[] = [
  { id: 'reuniao', rotulo: 'Reunião' },
  { id: 'voltar7', rotulo: 'Voltar em 7 dias' },
  { id: 'ligar_amanha', rotulo: 'Ligar amanhã' },
  { id: 'sem_interesse', rotulo: 'Sem interesse' },
];
export const DIAS_REUNIAO = [
  { dias: 1, rotulo: 'Amanhã' },
  { dias: 3, rotulo: 'Em 3 dias' },
  { dias: 5, rotulo: 'Em 1 semana' },
] as const;

export const TIPOS = ['Restaurante', 'Bar', 'Café / Padaria', 'Lanchonete', 'Pizzaria', 'Delivery'] as const;
export const PAPEIS = ['Dono', 'Gerente'] as const;

// motivo_do_perdido (VALORES_PERMITIDOS do servidor). "Sem retorno" saiu da tela.
export const MOTIVOS_PERDIDO: { valor: string; rotulo: string }[] = [
  { valor: 'Preço', rotulo: 'Preço' },
  { valor: 'Funcionalidade', rotulo: 'Funcionalidade' },
  { valor: 'Reembolso', rotulo: 'Estorno' },
  { valor: 'Não quer mudar de sistema', rotulo: 'Não quer mudar de sistema' },
  { valor: 'Outros', rotulo: 'Outros' },
];

// ---- Etapas: espelho de lib/acoes-negocio/mudar-etapa-negocio.js ----------
export const ETAPA = {
  prospeccao: '1395880469', visita: '1396005401', decisor: '1395880470', demo: '1395880471',
  negociacao: '1395880472', pagamento: '1395880473', onboarding: '1396006163',
  reciclagem: '1398311191', ganho: '1396006162', perdido: '1396006164',
} as const;
export const ROTULO_ETAPA: Record<string, string> = {
  '1395880469': 'Prospecção', '1396005401': 'Visita', '1395880470': 'Conversa com decisor', '1395880471': 'Demo/Proposta',
  '1395880472': 'Negociação', '1395880473': 'Ag. Pagamento', '1396006163': 'Enviado Onboarding', '1398311191': 'Reciclagem',
  '1396006162': 'Ganho', '1396006164': 'Perdido', '1396007427': 'Backlog', '1413529973': 'Conta Alvo',
};
const ESCADA: string[] = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473', '1396006163', '1398311191', '1396006162'];
const ISENTAS = new Set<string>([ETAPA.reciclagem, ETAPA.perdido]);

export const PROPS_OBRIGATORIAS_POR_ETAPA: Record<string, string[]> = {
  '1395880469': ['origem_do_lead'],
  '1396005401': [],
  '1395880470': ['celular', 'gargalo_operacional', 'nome_do_sistema'],
  '1395880471': ['valor_de_mrr', 'plano_apresentado', 'data_da_reuniao'],
  '1395880472': ['plano_apresentado', 'valor_de_mrr'],
  '1396006163': [],
  '1396006164': ['motivo_do_perdido'],
  '1398311191': [],
};

/** O servidor aceita ir de `atual` para `destino`? (mesma regra do mudar-etapa). */
export function movimentoPermitido(atual: string | null, destino: string): { ok: boolean; motivo?: string } {
  if (destino === ETAPA.ganho) return { ok: false, motivo: 'Ganho só pelo ASAAS, quando o pagamento confirma.' };
  if (!ESCADA.includes(destino) && destino !== ETAPA.perdido) return { ok: false, motivo: 'Etapa fora do funil aberto.' };
  if (ISENTAS.has(destino) || (atual && ISENTAS.has(atual))) return { ok: true };
  const iAtual = atual ? ESCADA.indexOf(atual) : -1;
  const iNova = ESCADA.indexOf(destino);
  if (iNova > iAtual + 1) return { ok: false, motivo: 'O pipeline não permite pular fases.' };
  return { ok: true };
}

/** Degrau que dá para subir agora rumo a `alvo` (nunca pula fase). */
function degrauRumo(atual: string | null, alvo: string): string | null {
  if (movimentoPermitido(atual, alvo).ok) return alvo;
  const iAtual = atual ? ESCADA.indexOf(atual) : -1;
  const prox = ESCADA[iAtual + 1];
  return prox && movimentoPermitido(atual, prox).ok ? prox : null;
}

/**
 * Etapa sugerida (prompt corrigido): Sem interesse → Perdido; "Falei com quem
 * decide" + Reunião → Conversa com Decisor; 1ª visita → Visita; Ligar amanhã /
 * Voltar em 7 dias → mantém. Sempre o degrau que o servidor aceita.
 */
export function etapaSugerida(p: {
  atual: string | null; comoFoi: Desfecho | null; proximo: Proximo | null; primeiraVisita: boolean;
}): string | null {
  const { atual } = p;
  let alvo: string | null = null;
  if (p.proximo === 'sem_interesse') alvo = ETAPA.perdido;
  else if (p.comoFoi === 'falou_com_decisor' && p.proximo === 'reuniao') alvo = ETAPA.decisor;
  else if (p.primeiraVisita) alvo = ETAPA.visita;
  if (!alvo) return null;
  const iAtual = atual ? ESCADA.indexOf(atual) : -1;
  // já está nela ou além (exceto Perdido, que vale de qualquer etapa)
  if (alvo !== ETAPA.perdido && iAtual >= ESCADA.indexOf(alvo) && !ISENTAS.has(atual ?? '')) return null;
  if (alvo === atual) return null;
  const degrau = degrauRumo(atual, alvo);
  return degrau && degrau !== atual ? degrau : null;
}

/** Campos que a etapa destino exige e a ficha ainda não tem. */
export function faltandoParaEtapa(destino: string, tem: Record<string, string | null | undefined>): string[] {
  return (PROPS_OBRIGATORIAS_POR_ETAPA[destino] ?? []).filter((k) => !(tem[k] ?? '').toString().trim());
}

export const ROTULO_PROP: Record<string, string> = {
  celular: 'telefone', gargalo_operacional: 'maior dor', nome_do_sistema: 'sistema que usa hoje',
  motivo_do_perdido: 'motivo do perdido', origem_do_lead: 'origem do lead',
  valor_de_mrr: 'valor de MRR', plano_apresentado: 'plano apresentado', data_da_reuniao: 'data da reunião',
};

// ---- Nome de pessoa ---------------------------------------------------------
// Uma palavra, primeiro nome comum (IBGE, Censo 2010), sem termo de comércio.
const PRIMEIROS_NOMES = new Set([
  'maria', 'jose', 'ana', 'joao', 'antonio', 'francisco', 'carlos', 'paulo', 'pedro', 'lucas', 'luiz', 'marcos',
  'luis', 'gabriel', 'rafael', 'daniel', 'marcelo', 'bruno', 'eduardo', 'felipe', 'raimundo', 'rodrigo', 'manoel',
  'mateus', 'andre', 'fernando', 'fabio', 'leonardo', 'gustavo', 'guilherme', 'leandro', 'tiago', 'anderson',
  'ricardo', 'marcio', 'jorge', 'sebastiao', 'alexandre', 'roberto', 'edson', 'diego', 'vitor', 'sergio', 'claudio',
  'julia', 'juliana', 'adriana', 'marcia', 'fernanda', 'patricia', 'aline', 'sandra', 'camila', 'amanda', 'bruna',
  'jessica', 'leticia', 'vanessa', 'mariana', 'gabriela', 'vera', 'vitoria', 'larissa', 'claudia', 'beatriz',
  'luana', 'rita', 'sonia', 'renata', 'eliane', 'josefa', 'simone', 'natalia', 'cristiane', 'carla', 'debora',
  'rosangela', 'jaqueline', 'rosa', 'daniela', 'aparecida', 'marlene', 'terezinha', 'raimunda', 'andreia', 'fabiana',
  'lucia', 'raquel', 'kelly', 'sandro', 'marco', 'renato', 'julio', 'cesar', 'priscila', 'tatiana', 'francisca',
]);
const COMERCIO = /(bar|restaurante|lanch|pizz|cafe|padaria|burg|grill|churrasc|bistro|cozinha|espeto|pastel|acai|sushi|food|delivery|boteco|cantina|emporio|mercad|ltda|eireli)/;
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function pareceNomeDePessoa(nome: string | null | undefined): boolean {
  const n = norm(nome ?? '');
  if (!n || /\s/.test(n) || COMERCIO.test(n)) return false;
  return PRIMEIROS_NOMES.has(n);
}

// ---- A ficha ---------------------------------------------------------------
export type Ficha = {
  comoFoi: Desfecho | null;
  proximo: Proximo | null;
  diasReuniao: number | null;
  motivoPerdido: string | null;
  nomeDoLugar: string;
  decisor: string;
  papel: (typeof PAPEIS)[number] | null;
  sistema: string;
  dor: Gargalo | null;
  telefone: string;
  tipo: (typeof TIPOS)[number] | null;
  moverEtapa: boolean;
};

export const FICHA_VAZIA: Ficha = {
  comoFoi: null, proximo: null, diasReuniao: null, motivoPerdido: null, nomeDoLugar: '', decisor: '', papel: null,
  sistema: '', dor: null, telefone: '', tipo: null, moverEtapa: true,
};

/** Botão Salvar: diz o que falta, ou "Salvar". */
export function rotuloSalvar(f: Ficha, faltaEtapa: string[] = []): { pode: boolean; texto: string } {
  const falta: string[] = [];
  if (!f.comoFoi) falta.push('como foi');
  if (!f.proximo) falta.push('o próximo passo');
  else if (f.proximo === 'reuniao' && !f.diasReuniao) falta.push('o dia da reunião');
  else if (f.proximo === 'sem_interesse' && !f.motivoPerdido) falta.push('o motivo');
  if (f.moverEtapa) for (const k of faltaEtapa) if (!falta.includes(ROTULO_PROP[k] ?? k)) falta.push(ROTULO_PROP[k] ?? k);
  if (!falta.length) return { pode: true, texto: 'Salvar' };
  return { pode: false, texto: `Falta ${falta.length > 1 ? `${falta.slice(0, -1).join(', ')} e ${falta[falta.length - 1]}` : falta[0]}` };
}

/** Tarefa do próximo passo (op 'nota' + 'proximo-passo'); null = sem tarefa. */
export function proximoPassoDaFicha(f: Ficha, hoje: string): { data: string; tipo: 'reuniao' | 'visita' | 'follow-up'; texto: string; canal: 'visita' | 'ligacao' } | null {
  if (f.proximo === 'reuniao' && f.diasReuniao) return { data: proximoDiaUtil(hoje, f.diasReuniao), tipo: 'reuniao', texto: 'Reunião combinada na visita', canal: 'visita' };
  if (f.proximo === 'voltar7') return { data: proximoDiaUtil(hoje, 5), tipo: 'visita', texto: 'Voltar para nova visita', canal: 'visita' };
  if (f.proximo === 'ligar_amanha') return { data: proximoDiaUtil(hoje, 1), tipo: 'follow-up', texto: 'Ligar', canal: 'ligacao' };
  return null;
}

/** Nota DESFECHO_VISITA v1 (contrato docs/pwa-para-cockpit.md §4). */
export function notaDaVisita(f: Ficha, p: { cliente: string; ocorridoEm: string; hoje: string }): string {
  const passo = proximoPassoDaFicha(f, p.hoje);
  return montarBlocoDesfecho({
    cliente: p.cliente,
    ocorridoEm: p.ocorridoEm,
    canal: 'visita',
    desfecho: f.comoFoi ?? 'outro',
    pessoa: f.decisor || null,
    papel: f.papel,
    // "sim" só quando falou com quem decide; nunca "nao" (vai vazio)
    decisorAlcancado: f.comoFoi === 'falou_com_decisor' ? 'sim' : 'desconhecido',
    dor: f.dor,
    observacao: [f.sistema ? `sistema: ${f.sistema}` : null, f.tipo ? `tipo: ${f.tipo}` : null,
      f.proximo === 'sem_interesse' && f.motivoPerdido ? `sem interesse: ${f.motivoPerdido}` : null].filter(Boolean).join(' · ') || null,
    proximoPasso: passo ? { canal: passo.canal, dia: passo.data, acao: passo.texto } : null,
  });
}

/** "Ficha N de 5": nome real, decisor, telefone, tipo de lugar, bairro. */
export function completude(dados: { nomeReal: boolean; decisor: boolean; telefone: boolean; tipo: boolean; bairro: boolean }): number {
  return [dados.nomeReal, dados.decisor, dados.telefone, dados.tipo, dados.bairro].filter(Boolean).length;
}

// ---- Campos das etapas (mesmos rótulos, picklists e validação do Cockpit) ----
export const PICKLIST: Record<string, string[]> = {
  origem_do_lead: ['Rua', 'Indicação', 'Casa dos Dados', 'Instagram', 'Ads', 'GoogleMaps', 'Familia', 'Eventos'],
  gargalo_operacional: ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'],
  plano_apresentado: ['Básico (PDV + delivery)', 'Básico (PDV + mesa + delivery)', 'Inovação', 'Pro', 'Enterprise'],
  motivo_do_perdido: MOTIVOS_PERDIDO.map((m) => m.valor),
};
export type TipoCampo = 'selecao' | 'texto' | 'tel' | 'numero' | 'data';
export const TIPO_CAMPO: Record<string, TipoCampo> = {
  origem_do_lead: 'selecao', gargalo_operacional: 'selecao', plano_apresentado: 'selecao', motivo_do_perdido: 'selecao',
  celular: 'tel', nome_do_sistema: 'texto', valor_de_mrr: 'numero', data_da_reuniao: 'data', observacao__desqualificado: 'texto',
};
// No Cockpit, "Outros" e "Funcionalidade" não explicam sozinhos: pedem o texto.
export const MOTIVOS_QUE_EXIGEM_TEXTO = ['Outros', 'Funcionalidade'];

/** Etapas da folha "Mudar etapa", na ordem do prompt (Reciclagem e Perdido no fim). */
export const ETAPAS_DA_FOLHA: string[] = [
  ETAPA.prospeccao, ETAPA.visita, ETAPA.decisor, ETAPA.demo, ETAPA.negociacao, ETAPA.pagamento, ETAPA.onboarding,
  ETAPA.reciclagem, ETAPA.perdido,
];

/**
 * Valida o que a pessoa digitou e monta `propriedades` no formato que o
 * servidor grava: número > 0 como texto; data como meia-noite UTC em ms
 * (igual ao Cockpit); picklist só com valor da lista.
 */
export function montarPropriedades(destino: string, digitado: Record<string, string>, jaTem: Record<string, unknown>):
  { propriedades: Record<string, string>; erros: Record<string, string> } {
  const propriedades: Record<string, string> = {};
  const erros: Record<string, string> = {};
  const exigidos = [...(PROPS_OBRIGATORIAS_POR_ETAPA[destino] ?? [])];
  if (destino === ETAPA.perdido && MOTIVOS_QUE_EXIGEM_TEXTO.includes(digitado.motivo_do_perdido ?? '')) exigidos.push('observacao__desqualificado');
  for (const k of exigidos) {
    const v = (digitado[k] ?? '').trim();
    const temNoNegocio = jaTem[k] != null && String(jaTem[k]).trim() !== '';
    if (!v) { if (!temNoNegocio) erros[k] = k === 'observacao__desqualificado' ? 'Este motivo não explica sozinho — escreva o que pesou.' : 'Preencha para mudar a etapa.'; continue; }
    const tipo = TIPO_CAMPO[k] ?? 'texto';
    if (tipo === 'selecao' && !(PICKLIST[k] ?? []).includes(v)) { erros[k] = 'Escolha uma das opções.'; continue; }
    if (tipo === 'numero') {
      const n = Number(v.replace(',', '.'));
      if (!isFinite(n) || n <= 0) { erros[k] = 'Valor inválido.'; continue; }
      propriedades[k] = String(n); continue;
    }
    if (tipo === 'data') {
      const d = new Date(`${v}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime())) { erros[k] = 'Data inválida.'; continue; }
      propriedades[k] = String(d.getTime()); continue;
    }
    propriedades[k] = v;
  }
  return { propriedades, erros };
}
