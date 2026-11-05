// Celular no formato que o HubSpot aceita: só DDD + número (05/11/26).
// Uma regra só para a folha de mudar etapa e para a emissão de cobrança.

/**
 * Celular: só DDD + número, sem +55 (Julyan, 05/11/26: "não pode contar o +55, é só o DDD e
 * número"). Quem cola do WhatsApp com +55 ou digita o zero da frente não é recusado: a folha tira
 * sozinha. Fica 10 (fixo) ou 11 (celular) dígitos, igual ao Cockpit.
 */
export const CELULAR_DICA = 'DDD + número, sem +55';
export function normalizarCelular(valor: string): { valor: string; erro: null } | { valor: null; erro: string } {
  let d = String(valor ?? '').replace(/[^0-9]/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 || d.length === 11) return { valor: d, erro: null };
  return { valor: null, erro: `Só o DDD e o número, sem +55: 10 ou 11 dígitos (ex.: 21987654321). Vieram ${d.length}.` };
}
