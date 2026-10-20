// O QUE A TAREFA PEDE, NUM TEXTO SÓ (20/10/26, "quero esse app sem confusão"): a Agenda dizia
// "WhatsApp: lead do evento" e a Tarefas "Primeiro contato: lead do evento" para a MESMA tarefa.
// As duas telas usam esta função. O assunto do HubSpot é "Tipo - texto"; quando o texto só repete
// o tipo ou o nome do restaurante ("Visita - Visita JULYAN HOUSE"), fica o tipo.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Tipo · texto", ou só o tipo quando o texto não acrescenta nada. */
export function assuntoLimpo(assunto: string | null, negocio: string): string | null {
  if (!assunto) return null;
  // o separador tem espaço dos dois lados: o hífen de "Follow-up" não separa
  const m = assunto.match(/^\s*(.+?)\s+[-–·]\s+(.+)$/);
  if (!m) return assunto.trim();
  const tipo = m[1].trim();
  let resto = m[2].trim();
  // "Demo - Demo · Cantina": o tipo repetido no começo do texto sai
  const rep = new RegExp(`^${escapar(tipo)}\\s*[·\\-–]\\s*`, 'i');
  if (rep.test(resto)) resto = resto.replace(rep, '').trim();
  const r = semAcento(resto), n = semAcento(negocio), tp = semAcento(tipo);
  // "Visita JULYAN HOUSE": o tipo seguido do nome do restaurante
  const semTipo = r.startsWith(`${tp} `) ? r.slice(tp.length + 1).trim() : r;
  if (r === tp || r === n || semTipo === n || (r.length >= 4 && n.startsWith(r)) || (semTipo.length >= 4 && n.startsWith(semTipo))) return tipo;
  return `${tipo} · ${resto}`;
}

/** O texto da caixa "o que fazer" / "o que foi combinado" e da linha da Agenda: "Tipo: texto". */
export function oQueFazer(assunto: string | null | undefined, negocio: string, reserva: string): string {
  const a = assuntoLimpo(assunto ?? null, negocio);
  return a ? a.replace(' · ', ': ') : reserva;
}
