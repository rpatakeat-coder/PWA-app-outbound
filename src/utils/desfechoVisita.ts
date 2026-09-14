// O desfecho da visita — o que o vendedor viu na rua, em formato que o Cockpit
// consegue ler.
//
// POR QUE EXISTE
// O check-in registrava que a visita ACONTECEU (Task concluida no HubSpot) e
// nada sobre o que aconteceu NELA. Medido em 14/09/2026 no pipeline Field
// Sales: dos 154 negocios na etapa Visita, 134 sem `nome_do_sistema` (87%) e
// 124 sem `gargalo_operacional` (81%). Sao as duas perguntas que definem o
// pitch em foodservice — sem elas o gestor nao sabe com o que a casa trabalha
// nem qual dor atacar, e a cadencia cai na regua generica da etapa.
//
// O FORMATO NAO E' DECORATIVO
// `DESFECHO_VISITA v1` e' contrato de parser (doc-cockpit/08-regras-de-negocio.md).
// Primeira linha exata, uma chave por linha, snake_case sem acento. As regras
// que parecem detalhe sao as que ja' custaram caro do outro lado:
//
//  - CHAVE VAZIA E' MELHOR QUE CHAVE AUSENTE. Ausente o parser nao sabe se a
//    pergunta nao foi feita ou se a resposta nao coube; vazia ele sabe que foi
//    perguntada e nao respondida.
//  - `decisor_alcancado` SO' aceita `sim` como verdadeiro. "Nao sei" vai VAZIO,
//    nunca `nao` — mandar `nao` transforma "nao tenho registro" em "nao
//    alcancou", que e' uma afirmacao diferente sobre o trabalho da pessoa, e e'
//    lida na frente do time dela.
//  - VALOR NAO PODE TER QUEBRA DE LINHA. O parser le' linha a linha; uma
//    observacao de dois paragrafos viraria uma chave fantasma no meio do bloco.

/** Gargalos do HubSpot. Enumeracao — valor fora da lista volta erro cru da API. */
export const GARGALOS = [
  'Fila',
  'Falta de Garçom',
  'Falta de Gestão',
  'Sem fidelização',
  'Demora na divisão de contas',
  'Estoque',
] as const;
export type Gargalo = (typeof GARGALOS)[number];

/** Canais de toque. Valem pro `canal` do desfecho e pro do proximo passo. */
export const CANAIS = ['visita', 'ligacao', 'whatsapp', 'email'] as const;
export type Canal = (typeof CANAIS)[number];

/**
 * Como a visita terminou.
 *
 * O pacote de replicacao cita UM valor (`decisor_ausente`) e nao publica a
 * lista. Como o Cockpit esta' vindo pra dentro deste repositorio, a lista nasce
 * aqui — mas se o Cockpit antigo ainda estiver lendo estas notas durante a
 * migracao, ele precisa da mesma lista, senao classifica tudo como
 * desconhecido.
 */
export const DESFECHOS = [
  { valor: 'falou_com_decisor', rotulo: 'Falei com o decisor' },
  { valor: 'decisor_ausente', rotulo: 'Decisor não estava' },
  { valor: 'pediu_retorno', rotulo: 'Pediu para voltar depois' },
  { valor: 'sem_interesse', rotulo: 'Sem interesse' },
  { valor: 'estabelecimento_fechado', rotulo: 'Estabelecimento fechado' },
  { valor: 'outro', rotulo: 'Outro' },
] as const;
export type Desfecho = (typeof DESFECHOS)[number]['valor'];

/** Tres estados de verdade, e o do meio existe de proposito. */
export type DecisorAlcancado = 'sim' | 'nao' | 'desconhecido';

/**
 * De quais desfechos da' pra AFIRMAR se o decisor foi alcancado.
 *
 * Existe pra tirar uma pergunta do formulario: na calcada, cada toque a menos
 * conta. Mas so' mapeia o que o proprio desfecho ja' diz sem interpretacao —
 * "falei com o decisor" e' sim; "decisor nao estava" e "estabelecimento
 * fechado" sao nao, porque em ambos o vendedor ESTEVE la' e nao o alcancou.
 *
 * Todo o resto fica `desconhecido`, e vai vazio pro bloco. "Sem interesse" nao
 * diz quem recusou; "pediu para voltar depois" nao diz com quem ele falou.
 * Chutar `nao` ali seria inventar um fato sobre o trabalho da pessoa.
 */
export function decisorDoDesfecho(d: Desfecho): DecisorAlcancado {
  if (d === 'falou_com_decisor') return 'sim';
  if (d === 'decisor_ausente' || d === 'estabelecimento_fechado') return 'nao';
  return 'desconhecido';
}

export type ProximoPasso = {
  canal: Canal;
  /** Dia de Brasilia, 'AAAA-MM-DD'. */
  dia: string;
  acao: string;
};

export type EntradaDesfecho = {
  cliente: string;
  /** ISO do momento da visita (o check-in). */
  ocorridoEm: string;
  canal: Canal;
  desfecho: Desfecho;
  pessoa?: string | null;
  papel?: string | null;
  decisorAlcancado: DecisorAlcancado;
  dor?: string | null;
  objecao?: string | null;
  interesse?: string | null;
  observacao?: string | null;
  proximoPasso?: ProximoPasso | null;
  cadencia?: string | null;
};

/**
 * Deixa o valor seguro pra uma linha do bloco. Quebra de linha e o proprio
 * separador `:` no inicio quebrariam o parser; tabulacao vira espaco porque
 * alguns campos chegam colados de teclado de celular.
 */
const umaLinha = (v: string | null | undefined): string =>
  (v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

/**
 * `sim` e' a UNICA forma de dizer verdadeiro. `nao` so' sai quando o vendedor
 * respondeu explicitamente que nao alcancou; "nao sei" sai vazio.
 */
const decisorParaTexto = (d: DecisorAlcancado): string =>
  d === 'sim' ? 'sim' : d === 'nao' ? 'nao' : '';

/** `<canal> | <AAAA-MM-DD> | <acao>` — o formato que o parser espera. */
const proximoPassoParaTexto = (p: ProximoPasso | null | undefined): string =>
  p && p.acao.trim() ? `${p.canal} | ${p.dia} | ${umaLinha(p.acao)}` : '';

export const PRIMEIRA_LINHA = 'DESFECHO_VISITA v1';

/**
 * Monta o bloco. TODAS as chaves saem sempre, mesmo vazias — ver o comentario
 * do topo. A ordem e' a do doc, pra facilitar leitura humana na timeline.
 */
export function montarBlocoDesfecho(e: EntradaDesfecho): string {
  const linhas: Array<[string, string]> = [
    ['cliente', umaLinha(e.cliente)],
    ['ocorrido_em', e.ocorridoEm],
    ['canal', e.canal],
    ['desfecho', e.desfecho],
    ['pessoa', umaLinha(e.pessoa)],
    ['papel', umaLinha(e.papel)],
    ['decisor_alcancado', decisorParaTexto(e.decisorAlcancado)],
    ['dor', umaLinha(e.dor)],
    ['objecao', umaLinha(e.objecao)],
    ['interesse', umaLinha(e.interesse)],
    ['observacao', umaLinha(e.observacao)],
    ['proximo_passo', proximoPassoParaTexto(e.proximoPasso)],
    ['cadencia', umaLinha(e.cadencia)],
    ['origem', 'pwa'],
  ];
  return [PRIMEIRA_LINHA, ...linhas.map(([k, v]) => `${k}: ${v}`)].join('\n');
}

/**
 * Vencimento de uma tarefa datada SEM hora: 12:00 UTC = 09:00 BRT.
 *
 * A convencao e' do Cockpit e precisa ser a mesma dos dois lados. Ate' 28/08 o
 * vencimento era comparado por INSTANTE la', e toda tarefa datada pra hoje
 * sumia da tela as 09h01 — o dia util inteiro. Corrigiram pra comparacao por
 * dia, mas hora diferente sem aviso faz o comportamento voltar.
 *
 * O dia entra como 'AAAA-MM-DD' e e' lido por partes de proposito:
 * `new Date('2026-09-15')` seria meia-noite UTC, que no Brasil ainda e' dia 14.
 */
export function vencimentoDoDia(dia: string): string {
  const [ano, mes, d] = dia.split('-').map(Number);
  if (!ano || !mes || !d) throw new Error(`dia invalido: ${dia}`);
  return new Date(Date.UTC(ano, mes - 1, d, 12, 0, 0)).toISOString();
}

/**
 * Segunda a sexta. Le' o dia como meio-dia UTC pelo mesmo motivo de
 * `vencimentoDoDia`: 'AAAA-MM-DD' puro seria meia-noite UTC, que no Brasil
 * ainda e' o dia anterior — e um sabado viraria sexta na conta.
 */
export const ehDiaUtil = (dia: string): boolean => {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return d >= 1 && d <= 5;
};

/**
 * `dias` dias uteis a frente de `de`, pulando fim de semana — e nunca caindo
 * NUM fim de semana.
 *
 * A rua nao acontece no sabado: datar a proxima visita pra sabado e' prometer
 * um toque que nao vai existir, e a tarefa vence sozinha no HubSpot. E' defeito
 * medido do lado do Cockpit (doc-cockpit/08-regras-de-negocio.md).
 */
export function proximoDiaUtil(de: string, dias: number): string {
  const cursor = new Date(`${de}T12:00:00Z`);
  let andados = 0;
  // Teto de seguranca: um feriado longo nao existe aqui (so' fim de semana),
  // entao `dias * 2 + 7` sempre cobre.
  for (let i = 0; i < dias * 2 + 7; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (ehDiaUtil(cursor.toISOString().slice(0, 10))) andados++;
    if (andados >= dias) break;
  }
  return cursor.toISOString().slice(0, 10);
}

/** Titulo da tarefa do proximo passo, por canal. */
const VERBO: Record<Canal, string> = {
  visita: 'Revisitar',
  ligacao: 'Ligar para',
  whatsapp: 'Mandar WhatsApp para',
  email: 'Mandar e-mail para',
};

export const tituloDoProximoPasso = (canal: Canal, cliente: string): string =>
  `${VERBO[canal]} ${umaLinha(cliente)}`;
