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
  /**
   * O negócio a que esta tarefa se refere, venha de onde vier.
   *
   * O marcador do Cockpit é uma das fontes; a outra é a ASSOCIAÇÃO da Task
   * com o deal, que é como o HubSpot liga as duas coisas quando alguém cria a
   * tarefa pela tela dele. Tarefa feita à mão não tem marcador nenhum, e sem
   * esta segunda fonte ela virava "Cliente não identificado" — com o negócio
   * ali do lado, associado, no próprio CRM.
   */
  dealId: string | null;
  /** Versão do marcador que não sabemos ler. A tela avisa em vez de adivinhar. */
  versaoDesconhecida: string | null;
};

const PREFIXO = 'COCKPIT:PLANO:';

// O corpo da Task nem sempre e' texto. Quando alguem cria ou edita a tarefa
// PELA TELA DO HUBSPOT, o editor salva HTML:
//
//   <div style="" dir="auto" data-top-level="true"><p style="margin:0;">Falar
//   com Marcelo - Gerente</p></div>
//
// O Cockpit escreve texto puro, entao isso nunca tinha aparecido — ate' o
// Guilherme criar uma tarefa a' mao em 16/09/2026 e o app mostrar a marcacao
// crua na ficha, no lugar do recado.
//
// Roda ANTES de ler o marcador: se a tarefa do Cockpit for editada no portal,
// o HubSpot embrulha o corpo inteiro em HTML e a linha COCKPIT:PLANO passa a
// morar dentro de um <p>. Sem normalizar primeiro, o marcador sumiria e a
// tarefa perderia o link com o lead.
const ENTIDADES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'",
};

export function textoDoCorpo(bruto: string): string {
  return bruto
    // Tags que SAO quebra de linha viram quebra de linha; o resto some. Sem
    // isto, "<p>a</p><p>b</p>" viraria "ab" — duas frases coladas.
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    // So' o que PARECE tag de verdade: um "a < b" solto no texto sobrevive.
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    // Entidades depois de tirar as tags — na ordem inversa, um "&lt;b&gt;"
    // escrito pela pessoa viraria tag e seria apagado.
    .replace(/&[a-zA-Z#0-9]+;/g, (e) => {
      const conhecida = ENTIDADES[e.toLowerCase()];
      if (conhecida !== undefined) return conhecida;
      const num = e.match(/^&#(x?)([0-9a-fA-F]+);$/);
      if (num) {
        const cod = parseInt(num[2], num[1] ? 16 : 10);
        return Number.isFinite(cod) ? String.fromCodePoint(cod) : e;
      }
      return e;
    })
    .split(/\r?\n/)
    .map((l) => l.trim())
    .join('\n')
    // O HTML do editor gera linha vazia a cada </p></div>; tres viram uma.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
  /** Deal associado à Task no HubSpot, quando a rota conseguiu trazer. */
  deal_id?: string | null;
}): TarefaDoCrm {
  const texto = textoDoCorpo(bruta.corpo ?? '');
  const { marcador, versaoDesconhecida } = lerMarcador(texto);
  return {
    id: bruta.id,
    assunto: (bruta.assunto ?? '').trim(),
    corpo: corpoLimpo(texto),
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
    // O marcador MANDA quando existe: ele diz de qual negócio a gestão estava
    // falando ao planejar. A associação é o plano B — e na prática são o mesmo
    // deal, porque o Cockpit associa a Task ao criar.
    dealId: marcador?.dealId ?? (bruta.deal_id ? String(bruta.deal_id) : null),
    versaoDesconhecida,
  };
}

/** O nome do cliente que o Cockpit põe no assunto ("Visita - Bar do Zé"). */
export function clienteDoAssunto(assunto: string): string | null {
  const m = assunto.match(/^(?:visita|follow.?up|reuni[ãa]o)\s*[-–—]\s*(.+)$/i);
  return m ? m[1].trim() : null;
}
