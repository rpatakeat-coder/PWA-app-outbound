// Emitir cobrança pelo app (handoff v4.1 §7.3). Regras puras, espelho das do
// servidor (cockpit-unificado lib/acoes-negocio/mudar-etapa-negocio.js): as
// mesmas listas, o mesmo dígito verificador, o mesmo mínimo de 50 caracteres.
// A tela nunca oferece o que o servidor recusa — o servidor continua sendo a
// última linha.

export const ETAPA_AG_PAGAMENTO = '1395880473';

export const PACOTES = ['Básico', 'Básico (delivery e balcão)', 'Inovação', 'Inovação (delivery e balcão)', 'Profissional', 'Profissional (delivery e balcão)', 'Enterprise', 'Enterprise (delivery e balcão)', 'Upsell', 'Produtos Personalizados', 'Básico (Delivery)', 'Básico (PDV Balcão)', 'Básico (Delivery + PDV Balcão)', 'Intermediário (Delivery + PDV Balcão + PDV Mesa)', 'Apenas Cardapio'];
export const PACOTES_MAIS_USADOS = ['Básico', 'Inovação', 'Profissional', 'Enterprise'];
export const ADICIONAIS = ['Sem adicionais', 'Fiscal SN', 'Maquininha POS', 'Cashback', 'Tablet', 'IA Conversacional (TEKA)', 'Totem de Autoatendimento', 'Robô de Whatsapp', 'Multilojas', 'Campanhas Personalizadas', 'Fiscal LP / LR', 'IA de Fechamento', 'TEF', 'Precificação Dinâmica', 'Display ou Comandas', 'Dark Kitchen', 'Conciliação Bancária', 'Rota Inteligente'];
export const ADICIONAIS_MAIS_USADOS = ['Sem adicionais', 'Fiscal SN', 'IA Conversacional (TEKA)', 'TEF', 'Totem de Autoatendimento', 'Maquininha POS'];
export const PERIODOS = ['Mensal', 'Trimestral', 'Semestral', 'Anual'] as const;
export const MESES: Record<string, number> = { Mensal: 1, Trimestral: 3, Semestral: 6, Anual: 12 };
export const PAGAMENTOS = ['À Vista', 'Crédito'] as const;
export const DESAFIOS = ['Problemas com Atendimento', 'Gestão Financeira', 'Problemas de Gestão', 'Problemas em Fidelizar o Cliente', 'Gerenciar várias lojas', 'Controle fiscal', 'Operação', 'Suporte do sistema'];
export const MINIMO_DESAFIO = 50;

export const soDigitos = (t: string) => (t ?? '').replace(/[^0-9]/g, '');

function cpfOk(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (let corte = 9; corte <= 10; corte++) {
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * (corte + 1 - i);
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}
function cnpjOk(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const corte of [12, 13]) {
    const p = pesos.slice(13 - corte);
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * p[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}

/** O que aparece embaixo do campo: ok (verde) ou o problema (vermelho). */
export function conferirDocumento(texto: string): { ok: boolean; texto: string } | null {
  const d = soDigitos(texto);
  if (!d) return null;
  if (d.length === 11) return cpfOk(d) ? { ok: true, texto: 'CPF confere ✓' } : { ok: false, texto: 'CPF inválido · confira o número' };
  if (d.length === 14) return cnpjOk(d) ? { ok: true, texto: 'CNPJ confere ✓' } : { ok: false, texto: 'CNPJ inválido · confira o número' };
  return { ok: false, texto: `${d.length} dígitos · CPF tem 11, CNPJ tem 14` };
}

export type Cobranca = {
  dealname: string; cnpj_cpf: string; email: string; celular: string; cep: string; numero: string;
  pacote_contratado: string; adicional: string[]; periodo_contratado: string; tipo_de_pagamento: string;
  mrr: string; amount: string; amountEditado: boolean;
  qual_maior_desafio_: string; informacoes_sobre_o_maior_desafio: string; deseja_criar_perfil_no_asaas_: boolean;
};

export const COBRANCA_VAZIA: Cobranca = {
  dealname: '', cnpj_cpf: '', email: '', celular: '', cep: '', numero: '',
  pacote_contratado: '', adicional: [], periodo_contratado: 'Mensal', tipo_de_pagamento: '',
  mrr: '', amount: '', amountEditado: false,
  qual_maior_desafio_: '', informacoes_sobre_o_maior_desafio: '', deseja_criar_perfil_no_asaas_: true,
};

/** Valor do período = MRR × meses, a não ser que a pessoa tenha editado. */
export function valorDoPeriodo(mrr: string, periodo: string): string {
  const n = Number(String(mrr).replace(',', '.'));
  const m = MESES[periodo];
  if (!isFinite(n) || n <= 0 || !m) return '';
  return String(Number((n * m).toFixed(2)));
}

/** Adicional: "Sem adicionais" é exclusivo. */
export function alternarAdicional(atual: string[], item: string): string[] {
  if (item === 'Sem adicionais') return atual.includes(item) ? [] : [item];
  const sem = atual.filter((a) => a !== 'Sem adicionais');
  return sem.includes(item) ? sem.filter((a) => a !== item) : [...sem, item];
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const numeroOk = (t: string) => { const n = Number(String(t).replace(',', '.')); return isFinite(n) && n > 0; };

/** O que falta em cada passo (vazio = pode seguir). */
export function faltaNoPasso(c: Cobranca, passo: 1 | 2 | 3): string[] {
  const f: string[] = [];
  if (passo === 1) {
    if (!c.dealname.trim()) f.push('nome do negócio');
    if (!conferirDocumento(c.cnpj_cpf)?.ok) f.push('CNPJ ou CPF válido');
    if (!emailOk(c.email)) f.push('e-mail válido');
    if (soDigitos(c.celular).length < 10) f.push('celular');
    if (soDigitos(c.cep).length !== 8) f.push('CEP com 8 dígitos');
    if (!c.numero.trim()) f.push('número');
  }
  if (passo === 2) {
    if (!c.pacote_contratado) f.push('pacote');
    if (!c.adicional.length) f.push('adicional (ou Sem adicionais)');
    if (!c.periodo_contratado) f.push('período');
    if (!c.tipo_de_pagamento) f.push('tipo de pagamento');
    if (!numeroOk(c.mrr)) f.push('MRR');
    if (!numeroOk(c.amount)) f.push('valor do período');
    if (!c.qual_maior_desafio_) f.push('maior desafio');
    if (c.informacoes_sobre_o_maior_desafio.trim().length < MINIMO_DESAFIO) f.push(`detalhe do desafio (mín. ${MINIMO_DESAFIO})`);
  }
  if (passo === 3 && !c.deseja_criar_perfil_no_asaas_) f.push('criar perfil no Asaas');
  return f;
}

/** As 15 propriedades que o servidor exige para Ag. Pagamento, no formato dele. */
export function propriedadesDaCobranca(c: Cobranca): Record<string, string> {
  return {
    dealname: c.dealname.trim(),
    email: c.email.trim(),
    cnpj_cpf: soDigitos(c.cnpj_cpf),
    celular: c.celular.trim(),
    cep: soDigitos(c.cep),
    numero: c.numero.trim(),
    pacote_contratado: c.pacote_contratado,
    adicional: c.adicional.join(';'),
    tipo_de_pagamento: c.tipo_de_pagamento,
    periodo_contratado: c.periodo_contratado,
    amount: String(Number(String(c.amount).replace(',', '.'))),
    mrr: String(Number(String(c.mrr).replace(',', '.'))),
    deseja_criar_perfil_no_asaas_: c.deseja_criar_perfil_no_asaas_ ? 'true' : 'false',
    qual_maior_desafio_: c.qual_maior_desafio_,
    informacoes_sobre_o_maior_desafio: c.informacoes_sobre_o_maior_desafio.trim(),
  };
}
