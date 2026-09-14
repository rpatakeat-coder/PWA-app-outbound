// Etapas (pipeline stages) do funil HubSpot que os vendedores podem
// disparar a partir do app via webhook. Os ids são os deal stage ids
// do HubSpot — manter sincronizados com a config lá.
//
// Algumas etapas têm propriedades obrigatórias no HubSpot — listadas
// em subFields. Cada sub-field tem um kind ('select' ou 'currency')
// que determina o tipo de input no UI. Pra select, as opções vêm
// do banco (tabela stage_property_options) via useStagePropertyOptions
// — o array hardcoded em `options` é só fallback inicial.

// Campos comuns a todos os sub-fields. `optional`: nao bloqueia o submit
// (mas se vier preenchido vai no payload). Default: false (obrigatorio).
type SubFieldBase = {
  field: string;
  fieldLabel: string;
  optional?: boolean;
  /**
   * Campo CONDICIONAL: so' aparece (e so' e' exigido) quando outro campo desta
   * mesma etapa contem um dos valores listados.
   *
   * Existe por causa do `adquirente`: ele so' faz sentido quando o cliente
   * leva Maquininha POS, porque e' a maquininha que integra com a adquirente.
   * Medido no HubSpot em 14/09/2026: dos negocios do Field Sales, ZERO tem
   * `adquirente` preenchido sem "Maquininha POS" no `adicional` — e 107 tem a
   * maquininha SEM a adquirente, que sao justamente os que passaram pelo app,
   * onde o campo nem existia.
   *
   * Pedir sempre seria pior: obrigaria a responder "Sem adquirente" em toda
   * venda sem maquininha, e um campo que a pessoa aprende a despachar no
   * automatico deixa de ser resposta.
   */
  dependeDe?: { field: string; contemAlgum: string[] };
};

export type StageSubField =
  | (SubFieldBase & {
      kind: 'select';
      // Fallback enquanto a query do banco não termina ou se falhar.
      // Source of truth real é a tabela stage_property_options.
      options: string[];
      // Quando true, aceita varias opcoes ao mesmo tempo. Vai no payload
      // como array (ex.: "adicional": ["Fiscal SN", "Tablet"]) — HubSpot
      // multi-select property aceita array nativamente.
      multi?: boolean;
    })
  | (SubFieldBase & {
      kind: 'currency';
      placeholder?: string;
    })
  | (SubFieldBase & {
      kind: 'text';
      placeholder?: string;
    })
  | (SubFieldBase & {
      kind: 'textarea';
      placeholder?: string;
    })
  | (SubFieldBase & {
      kind: 'email';
      placeholder?: string;
    })
  | (SubFieldBase & {
      // CEP brasileiro: aplica mascara 00000-000 + valida 8 digitos
      kind: 'cep';
      placeholder?: string;
    })
  | (SubFieldBase & {
      // CNPJ: aplica mascara 00.000.000/0000-00 + valida 14 digitos
      kind: 'cnpj';
      placeholder?: string;
    })
  | (SubFieldBase & {
      // Data dd/mm/aaaa — internamente armazena como dd/mm/aaaa, envia
      // pro webhook em ISO yyyy-mm-dd (formato esperado pelo HubSpot).
      kind: 'date';
      placeholder?: string;
    })
  | (SubFieldBase & {
      // Boolean: 2 chips (Sim/Nao) — armazena 'true'/'false' como string
      // no state, mas o payload enviado eh boolean nativo (true/false).
      kind: 'boolean';
    });

export type Stage = {
  id: string;
  label: string;
  color: string;
  subFields?: StageSubField[];
  // Quando definido, a etapa so aparece como opcao se client.etapa
  // estiver nesta lista. Ex.: ENVIADO PARA ONBOARDING so libera quando
  // o lead esta em NEGOCIO FECHADO.
  gateEtapa?: string[];
  // Ordem canonica de progressao no funil, vinda do displayOrder do HubSpot.
  // Quando as etapas vem do get_stages, este campo define "1 etapa por vez".
  displayOrder?: number;
  // true quando a etapa e' de fechamento/saida (probability 0.0 ou 1.0 no
  // HubSpot). Etapas com probability 0.0 (perdido) ficam sempre disponiveis.
  isClosed?: boolean;
  // Probabilidade do HubSpot (0.0 = perdido, 1.0 = ganho). String como vem
  // no metadata; usada pra distinguir "perdido" (sempre visivel) de "ganho".
  probability?: string | null;
};

// ===== Etapas dinamicas do HubSpot (get_stages) =====
// Formato cru retornado pelo endpoint /crm/v3/pipelines/deals/{id}/stages,
// repassado pelo webhook do app com type=get_stages.
export type HubSpotStageRaw = {
  id: string;
  label: string;
  displayOrder: number;
  archived?: boolean;
  metadata?: {
    // Deals trazem probability ("0.0".."1.0"); "0.0" = perdido, "1.0" = ganho.
    probability?: string;
    isClosed?: string | boolean;
    [k: string]: unknown;
  };
};

// IDs das etapas que contam como "fechou/pagou" (o lead passou de lead pra
// cliente). O lead passa pelas DUAS, mas so' conta 1 vez (carimba won_at uma
// unica vez). IDs do pipeline novo (configurado no n8n em 2026-07).
export const WON_STAGE_IDS = ['1396006162', '1396006163'];

// ===== Funil que o APP controla =====
// Pipeline novo (2026-07). Backlog e Reciclagem sao etapas de ENTRADA/lateral,
// nao de destino: o vendedor nao move ninguem PARA elas pelo app. Lead em
// Backlog/Reciclagem (ou sem etapa) reentra pela 1a etapa do funil (Prospecção).
//
// FUNNEL_STAGE_IDS: sequencia de progressao (avancar 1 por vez). A ordem aqui
// e' a ordem canonica do funil comercial. Onboarding e' o fim do
// funil ganho.
export const FUNNEL_STAGE_IDS = [
  '1395880469', // Prospecção
  '1396005401', // Visita
  '1395880470', // Conversa com decisor (ex-Diagnóstico)
  '1395880471', // Demo/Proposta
  '1395880472', // Negociação
  '1395880473', // Pagamento
  '1396006162', // Ganho
  '1396006163', // Onboarding
];

// Saida sempre disponivel como destino no app (a qualquer momento do funil).
export const LOST_STAGE_ID = '1396006164'; // Perdido

// Ate qual etapa o vendedor pode PULAR livremente (avancar varias de uma vez).
// Regra de negocio (2026-08): destravar o funil ate Demo/Proposta — antes era
// "1 etapa por vez" ate o fim, o que deixava o avanco lento. Da Demo/Proposta
// EM DIANTE volta a ser 1 por vez, porque as etapas seguintes (Negociacao,
// Ag. Pagamento, Onboarding) tem campos obrigatorios (MRR, CNPJ, pagamento)
// que nao devem ser pulados. Mudar so este id reposiciona o teto do "pulo".
// (O GPS na VISITA e' outra coisa: continua exigido no check-in
// mark_client_as_visited — nao tem a ver com o avanco manual de etapa.)
export const FREE_ADVANCE_MAX_STAGE_ID = '1395880471'; // Demo/Proposta

// Visita. Marcar um lead como visitado (check-in com GPS) move ele pra ca
// automaticamente — desde que a etapa atual seja ANTERIOR a Visita no funil
// (nao regride quem ja esta em Negociacao, Fechado, etc.).
export const VISITA_STAGE_ID = '1396005401';
export const VISITA_STAGE_LABEL = 'Visita';

// Conversa com decisor (ex-Diagnóstico). Gate de features que so fazem
// sentido depois de falar com o decisor (ex.: botao "Agendar reuniao").
export const DECISOR_STAGE_ID = '1395880470';

// Todos os IDs que o app aceita como DESTINO de mudanca (funil + perdido).
// Qualquer etapa fora disso (laterais/origem) nao aparece como opcao no modal.
export const APP_STAGE_IDS = [...FUNNEL_STAGE_IDS, LOST_STAGE_ID];

// ---------------------------------------------------------------------------
// Temperatura do lead por etapa — bandeirinha (emoji) nos pins do mapa pra
// leitura rapida de quem esta quente/morno/frio. Comparacao por label
// NORMALIZADO (caixa alta) porque clients.etapa guarda o LABEL e ja circulou
// com variacoes de caixa e labels legados (Diagnóstico, NEGÓCIO PERDIDO).
// ---------------------------------------------------------------------------
// color: cor do PIN no mapa. A temperatura passou a ser comunicada pela cor
// do proprio pin (mais legivel de longe que a bandeirinha de emoji, que era
// pequena demais em zoom baixo). O emoji saiu de vez em 14/08/2026: a legenda
// passou a usar um ponto na MESMA cor do pin, que ensina o mapa em vez de
// inventar um segundo vocabulario. O que sobrou aqui e' cor e rotulo.
// Restante do comentario original:
// sheet do lead ainda usam.
export type StageTemperature = { label: string; color: string };

// Escala termica: vermelho (quente) -> ambar (morno) -> azul (frio), com
// verde pra ganho e cinza-escuro pra perdido. Tons saturados o suficiente
// pra distinguir sobre o mapa cinza do Google.
export const TEMP_COLORS = {
  hot:  '#C8131B', // vermelho
  warm: '#FFB32F', // ambar
  cold: '#0ea5e9', // azul
  won:  '#16a34a', // verde
  lost: '#475569', // cinza-ardosia
} as const;

const TEMP_COLD = new Set(['PROSPECÇÃO', 'VISITA', 'BACKLOG', 'RECICLAGEM']);
const TEMP_WARM = new Set(['CONVERSA COM DECISOR', 'DIAGNÓSTICO', 'DEMO/PROPOSTA']);
const TEMP_HOT = new Set(['NEGOCIAÇÃO', 'AG. PAGAMENTO']);
const TEMP_WON = new Set(['NEGÓCIO FECHADO', 'ENVIADO ONBOARDING']);
const TEMP_LOST = new Set(['PERDIDO', 'NEGÓCIO PERDIDO']);

export function stageTemperature(etapa: string | null | undefined): StageTemperature | null {
  const key = (etapa ?? '').trim().toUpperCase();
  if (!key) return null;
  if (TEMP_HOT.has(key)) return { label: 'Quente', color: TEMP_COLORS.hot };
  if (TEMP_WARM.has(key)) return { label: 'Morno', color: TEMP_COLORS.warm };
  if (TEMP_COLD.has(key)) return { label: 'Frio', color: TEMP_COLORS.cold };
  if (TEMP_WON.has(key)) return { label: 'Fechado', color: TEMP_COLORS.won };
  if (TEMP_LOST.has(key)) return { label: 'Perdido', color: TEMP_COLORS.lost };
  return null; // etapa desconhecida: pin cai na cor do status
}

// Paleta ciclica pra colorir etapas novas do HubSpot que nao tem cor propria
// no mapa hardcoded. Mantem o visual consistente sem precisar cor por etapa.
export const STAGE_PALETTE = [
  '#3b82f6', '#8b5cf6', '#FFB32F', '#f97316', '#E03A41',
  '#0ea5e9', '#10b981', '#a855f7', '#14b8a6', '#eab308',
];

export const STAGES: Stage[] = [
  // Backlog e Reciclagem: etapas de ENTRADA/lateral do pipeline novo — nunca
  // sao destino no app (fora de FUNNEL_STAGE_IDS/APP_STAGE_IDS). Ficam aqui pro
  // fallback ter label/cor quando o lead atual estiver numa delas. Reciclagem
  // nao tem propriedade obrigatoria.
  { id: '1396007427', label: 'Backlog', color: '#94a3b8' },
  { id: '1398311191', label: 'Reciclagem', color: '#a855f7' },
  {
    id: '1395880469',
    label: 'Prospecção',
    color: '#3b82f6',
    subFields: [
      {
        field: 'origem_do_lead',
        fieldLabel: 'Origem do lead',
        kind: 'select',
        options: ['Rua', 'Indicação', 'Casa dos Dados', 'Instagram', 'Ads', 'GoogleMaps', 'Família', 'Eventos'],
      },
    ],
  },
  // Visita: etapa nova (a antiga QUALIFICAÇÃO virou Visita + Diagnóstico).
  // Sem propriedades obrigatorias — o gargalo_operacional foi pro Diagnóstico.
  { id: '1396005401', label: 'Visita', color: '#14b8a6' },
  {
    id: '1395880470',
    // Renomeada no HubSpot em 2026-07 (era "Diagnóstico"; mesmo id).
    label: 'Conversa com decisor',
    color: 'var(--violet-text)',
    subFields: [
      {
        field: 'gargalo_operacional',
        fieldLabel: 'Gargalo operacional',
        kind: 'select',
        options: ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'],
      },
    ],
  },
  { id: '1395880471', label: 'Demo/Proposta', color: '#FFB32F' },
  {
    id: '1395880472',
    label: 'Negociação',
    color: '#f97316',
    subFields: [
      {
        field: 'plano_apresentado',
        fieldLabel: 'Plano apresentado',
        kind: 'select',
        options: ['Básico (PDV + delivery)', 'Básico (PDV + mesa + delivery)', 'Inovação', 'Pro', 'Enterprise'],
      },
      {
        field: 'mrr',
        fieldLabel: 'MRR (R$)',
        kind: 'currency',
        placeholder: 'Ex.: 350,00',
      },
    ],
  },
  {
    id: '1396006164',
    label: 'Perdido',
    color: 'var(--brand-text)',
    subFields: [
      {
        field: 'motivo_do_perdido',
        fieldLabel: 'Motivo - Perda (Comercial)',
        kind: 'select',
        options: ['Preço', 'Funcionalidade', 'Sem retorno', 'Reembolso', 'Não quer mudar de sistema', 'Outros'],
      },
    ],
  },
  {
    id: '1395880473',
    label: 'Pagamento',
    color: '#0ea5e9',
    subFields: [
      {
        // Aceita CNPJ (14 digitos) ou CPF (11 digitos) — mesma property no HubSpot
        field: 'cnpj_cpf',
        fieldLabel: 'CNPJ / CPF',
        kind: 'cnpj',
        placeholder: 'CNPJ ou CPF (so digitos)',
      },
      {
        field: 'email',
        fieldLabel: 'E-mail',
        kind: 'email',
        placeholder: 'contato@restaurante.com.br',
      },
      {
        field: 'cep',
        fieldLabel: 'CEP',
        kind: 'cep',
        placeholder: '00000-000',
      },
      {
        field: 'numero',
        fieldLabel: 'Número do endereço',
        kind: 'text',
        placeholder: 'Ex.: 123',
      },
      {
        field: 'pacote_contratado',
        fieldLabel: 'Pacote contratado',
        kind: 'select',
        options: [],
      },
      {
        field: 'adicional',
        fieldLabel: 'Adicional',
        kind: 'select',
        options: [],
        multi: true,
      },
      {
        // Condicional: ver `dependeDe` em SubFieldBase. As opcoes vem do
        // banco como as outras; se `stage_property_options` ainda nao tiver
        // `adquirente`, este fallback segura — sao os 8 valores que o HubSpot
        // declara hoje.
        field: 'adquirente',
        fieldLabel: 'Adquirente da maquininha',
        kind: 'select',
        options: [
          'Sem adquirente',
          'Stone',
          'Getnet',
          'Rede',
          'Cielo',
          'Picpay',
          'Pagbank',
          'Maquinona Ifood',
        ],
        dependeDe: { field: 'adicional', contemAlgum: ['Maquininha POS'] },
      },
      {
        field: 'tipo_de_pagamento',
        fieldLabel: 'Tipo de pagamento',
        kind: 'select',
        options: [],
      },
      {
        field: 'periodo_contratado',
        fieldLabel: 'Período contratado (Assinatura)',
        kind: 'select',
        options: [],
      },
      {
        // Property "amount" no HubSpot (campo padrao de valor de deal)
        field: 'amount',
        fieldLabel: 'Valor (R$)',
        kind: 'currency',
        placeholder: 'Ex.: 1.500,00',
      },
      {
        field: 'mrr',
        fieldLabel: 'MRR (R$)',
        kind: 'currency',
        placeholder: 'Ex.: 350,00',
      },
      {
        field: 'deseja_criar_perfil_no_asaas_',
        fieldLabel: 'Deseja criar perfil no Asaas',
        kind: 'boolean',
      },
      {
        // ENUMERACAO no HubSpot, com 8 valores fixos — nao texto livre.
        //
        // Ficou `kind: 'text'` com um TODO ("virar select quando me passarem as
        // opcoes") desde que a etapa foi escrita, e as opcoes JA' estavam em
        // `stage_property_options` o tempo todo. O efeito: o app mandava texto
        // digitado pra um campo que so' aceita os 8 valores, e o HubSpot
        // recusava a passagem INTEIRA pra Ag. Pagamento — nao so' este campo.
        //
        // Em 14/09/2026 isso travou uma vendedora, e a mensagem do app ainda
        // dizia "(sem conexao?)", entao ela ficou conferindo o sinal do
        // celular. As opcoes vem do banco, como as outras quatro desta etapa.
        field: 'qual_maior_desafio_',
        fieldLabel: 'Qual o maior desafio',
        kind: 'select',
        options: [],
      },
      {
        field: 'informacoes_sobre_o_maior_desafio',
        fieldLabel: 'Informações sobre o maior desafio',
        kind: 'textarea',
        placeholder: 'Descreva o contexto, tentativas anteriores, etc.',
      },
    ],
  },
  // Negócio Fechado. Etapa de fechamento-ganho; sem sub-campos proprios.
  // Existe no fallback pra o funil ficar completo mesmo sem o get_stages
  // ter carregado.
  { id: '1396006162', label: 'Ganho', color: '#16a34a' },
  {
    id: '1396006163',
    label: 'Onboarding',
    color: '#10b981',
    subFields: [
      {
        field: 'estrutura_do_cliente',
        fieldLabel: 'Estrutura do cliente',
        kind: 'select',
        options: [],
      },
      {
        field: 'quando_vai_comecar_a_usar',
        fieldLabel: 'Quando vai começar a usar',
        kind: 'date',
        placeholder: 'dd/mm/aaaa',
      },
      {
        field: 'perfil_do_cliente',
        fieldLabel: 'Perfil do cliente',
        kind: 'select',
        options: [],
      },
      {
        field: 'instagram',
        fieldLabel: 'Instagram',
        kind: 'text',
        placeholder: '@perfilrestaurante',
      },
      {
        field: 'criar_grupo_automaticamente_',
        fieldLabel: 'Criar grupo automaticamente',
        kind: 'boolean',
      },
      {
        field: 'quantidade_de_mesas_e_sequencia',
        fieldLabel: 'Qtd. e sequência das mesas',
        kind: 'text',
        placeholder: 'Ex.: 1-20',
        optional: true,
      },
      {
        field: 'regime_fiscal',
        fieldLabel: 'Regime fiscal',
        kind: 'select',
        options: [],
        optional: true,
      },
      {
        field: 'quantidade_e_sequencia_das_comandas',
        fieldLabel: 'Qtd. e sequência das comandas',
        kind: 'text',
        placeholder: 'Ex.: 1-100',
        optional: true,
      },
      {
        field: 'cliente_vai_montar_ou_clonar_cardapio_',
        fieldLabel: 'Cliente vai montar ou clonar cardápio?',
        kind: 'select',
        options: [],
      },
      {
        field: 'senha_do_certificado_digital',
        fieldLabel: 'Senha do certificado digital',
        kind: 'text',
        placeholder: 'Senha do .pfx',
        optional: true,
      },
      {
        field: 'numero_csc',
        fieldLabel: 'Número CSC',
        kind: 'text',
        optional: true,
      },
      {
        field: 'multilojas_',
        fieldLabel: 'Multilojas?',
        kind: 'boolean',
      },
      {
        field: 'stonecode',
        fieldLabel: 'Stonecode (maquininha Stone)',
        kind: 'text',
        optional: true,
      },
      {
        field: 'observacoes',
        fieldLabel: 'Observações',
        kind: 'textarea',
        placeholder: 'Detalhes do onboarding...',
        optional: true,
      },
    ],
  },
];

// Mesma URL usada nos webhooks de cadastro manual e marcar como visitado.
// O type distingue o caso. Aqui: type=change_stage; tambem get_stages.
export const CHANGE_STAGE_WEBHOOK = 'https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d';

// ===== Mapas derivados por ID (fonte: STAGES hardcoded acima) =====
// Quando as etapas passam a vir do get_stages, o HubSpot devolve so id/label/
// ordem — NAO os campos obrigatorios (gargalo, mrr, etc.). Esses continuam no
// app, indexados pelo ID do stage. Etapa nova sem entrada aqui aparece sem
// sub-campos. Cor idem: se o HubSpot trouxer etapa sem cor conhecida, o
// consumidor usa STAGE_PALETTE ciclica.
export const STAGE_FIELDS_BY_ID: Record<string, StageSubField[]> = Object.fromEntries(
  STAGES.filter((s) => s.subFields && s.subFields.length > 0).map((s) => [s.id, s.subFields!]),
);

export const STAGE_COLOR_BY_ID: Record<string, string> = Object.fromEntries(
  STAGES.map((s) => [s.id, s.color]),
);

// Combina uma etapa crua do HubSpot (get_stages) com os campos/cor do app,
// produzindo um Stage completo pronto pro modal. cycleIndex escolhe uma cor
// da paleta quando a etapa nao tem cor conhecida por ID.
export function hubspotStageToStage(raw: HubSpotStageRaw, cycleIndex: number): Stage {
  const probability = raw.metadata?.probability ?? null;
  // isClosed: probability 0.0 (perdido) ou 1.0 (ganho) — ambos "fecham" o deal.
  const prob = probability != null ? Number(probability) : null;
  const isClosed =
    raw.metadata?.isClosed === true ||
    raw.metadata?.isClosed === 'true' ||
    prob === 0 ||
    prob === 1;
  return {
    id: raw.id,
    label: raw.label,
    color: STAGE_COLOR_BY_ID[raw.id] ?? STAGE_PALETTE[cycleIndex % STAGE_PALETTE.length],
    subFields: STAGE_FIELDS_BY_ID[raw.id],
    displayOrder: raw.displayOrder,
    isClosed,
    probability,
  };
}

/**
 * Quais campos da etapa realmente se aplicam, dados os valores escolhidos até
 * agora. Campo condicional que não se aplica fica de FORA da lista — então não
 * aparece na tela e não entra na checagem de "tudo preenchido".
 *
 * Essa segunda parte é a que importa: exigir preenchimento de um campo
 * invisível travaria o botão sem dizer por quê, que é a mesma família de
 * defeito que travou uma vendedora em 14/09/2026 (o app mandava um valor que o
 * HubSpot recusava, e a mensagem falava em conexão).
 *
 * `valores` aceita string ou array porque multi-select guarda array — o
 * `adicional`, de que o `adquirente` depende, é multi.
 */
export function camposQueSeAplicam(
  subFields: readonly StageSubField[],
  valores: Record<string, string | string[] | undefined>,
): StageSubField[] {
  return subFields.filter((sf) => {
    if (!sf.dependeDe) return true;
    const bruto = valores[sf.dependeDe.field];
    const escolhidos = Array.isArray(bruto) ? bruto : bruto ? [bruto] : [];
    return sf.dependeDe.contemAlgum.some((v) => escolhidos.includes(v));
  });
}
