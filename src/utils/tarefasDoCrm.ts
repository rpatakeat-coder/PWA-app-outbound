// As tarefas que o Cockpit de gestão cria no HubSpot, lidas pelo app de campo.
//
// POR QUE EXISTE
// O app tem tarefas próprias (`client_tasks`, geradas por regra no banco). O
// Cockpit cria outra coisa, direto no CRM: a visita que o gestor posicionou no
// planejamento da semana, o follow up do funil. O vendedor nunca via nenhuma
// delas — em 14/09/2026 havia 78 pendentes só para um executivo.
//
// O MARCADOR
// O corpo da Task carrega uma linha estruturada, escrita pelo Cockpit:
//
//   COCKPIT:PLANO:v1:86100505:2026-09-14:17:00:visita:planejamento:65042434372
//   ───────┬────── ─┬ ───┬──── ────┬───── ──┬── ──┬─── ─────┬───── ─────┬─────
//      prefixo    ver owner       dia     hora  tipo     origem       deal
//
// O `deal` no fim é o que importa mais: é com ele que a tarefa encontra o lead
// dentro do app (`clients.id_hubspot`), e sem isso ela seria um texto solto que
// o vendedor não consegue abrir no mapa.
//
// CONTRATO DE OUTRO SISTEMA, LIDO COM DESCONFIANÇA
// Quem escreve o marcador é o outro Cockpit, que pode mudar sem avisar. Então:
//   - versão diferente de v1 é reportada, não reinterpretada em silêncio;
//   - marcador ausente não descarta a tarefa — ela ainda tem assunto e data, e
//     o vendedor ainda precisa vê-la. Só fica sem link para o lead.
// Descartar o que não entendemos esconderia trabalho de alguém.

export type TipoDeTarefa = 'visita' | 'follow_up' | 'outro';

export type MarcadorDoCockpit = {
  versao: string;
  ownerId: string;
  dia: string;
  hora: string;
  tipo: TipoDeTarefa;
  origem: string;
  dealId: string;
};

export type TarefaDoCrm = {
  id: string;
  assunto: string;
  /** O corpo já sem a linha do marcador — é ruído para quem lê. */
  corpo: string;
  venceEm: string | null;
  tipo: TipoDeTarefa;
  /** null quando não havia marcador legível. A tarefa continua valendo. */
  marcador: MarcadorDoCockpit | null;
  /** Versão do marcador que não sabemos ler. A tela avisa em vez de adivinhar. */
  versaoDesconhecida: string | null;
};

const PREFIXO = 'COCKPIT:PLANO:';

/** `visita` e `follow_up` são os dois que o Cockpit emite hoje. */
function normalizarTipo(bruto: string): TipoDeTarefa {
  const t = bruto.trim().toLowerCase();
  return t === 'visita' || t === 'follow_up' ? t : 'outro';
}

/**
 * Lê o marcador. Devolve `null` quando não há linha reconhecível, e
 * `versaoDesconhecida` quando há marcador mas de uma versão que não sabemos
 * interpretar — o pacote é explícito: versão desconhecida vira aviso, nunca
 * releitura otimista.
 */
export function lerMarcador(corpo: string): {
  marcador: MarcadorDoCockpit | null;
  versaoDesconhecida: string | null;
} {
  const linha = corpo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith(PREFIXO));
  if (!linha) return { marcador: null, versaoDesconhecida: null };

  // COCKPIT:PLANO:v1:owner:dia:hora:tipo:origem:deal
  const partes = linha.split(':');
  if (partes.length < 9) return { marcador: null, versaoDesconhecida: null };

  const [, , versao, ownerId, dia, ...resto] = partes;
  if (versao !== 'v1') return { marcador: null, versaoDesconhecida: versao };

  // A hora tem `:` dentro ("17:00"), então ela consome dois campos do split.
  const [hh, mm, tipo, origem, dealId] = resto;
  if (!dealId) return { marcador: null, versaoDesconhecida: null };

  return {
    marcador: {
      versao,
      ownerId,
      dia,
      hora: `${hh}:${mm}`,
      tipo: normalizarTipo(tipo),
      origem,
      dealId,
    },
    versaoDesconhecida: null,
  };
}

/** Tira a linha do marcador do corpo: é endereço de máquina, não recado. */
export function corpoLimpo(corpo: string): string {
  return corpo
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith(PREFIXO))
    .join('\n')
    .trim();
}

export function interpretarTarefa(bruta: {
  id: string;
  assunto: string;
  corpo: string;
  vence_em: string | null;
}): TarefaDoCrm {
  const { marcador, versaoDesconhecida } = lerMarcador(bruta.corpo ?? '');
  return {
    id: bruta.id,
    assunto: bruta.assunto ?? '',
    corpo: corpoLimpo(bruta.corpo ?? ''),
    venceEm: bruta.vence_em ?? null,
    // Sem marcador, o assunto ainda diz o tipo: o Cockpit escreve
    // "Visita - <cliente>" e "Follow-up - <coisa>".
    tipo:
      marcador?.tipo ??
      (/^visita\b/i.test(bruta.assunto ?? '')
        ? 'visita'
        : /^follow.?up\b/i.test(bruta.assunto ?? '')
          ? 'follow_up'
          : 'outro'),
    marcador,
    versaoDesconhecida,
  };
}

/** O nome do cliente que o Cockpit põe no assunto ("Visita - Bar do Zé"). */
export function clienteDoAssunto(assunto: string): string | null {
  const m = assunto.match(/^(?:visita|follow.?up|reuni[ãa]o)\s*[-–—]\s*(.+)$/i);
  return m ? m[1].trim() : null;
}
