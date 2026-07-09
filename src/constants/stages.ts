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
// unica vez). Fornecidos pelo usuario a partir do pipeline 118032977.
export const WON_STAGE_IDS = ['209405292', '1090779812'];

// ===== Funil que o APP controla =====
// O pipeline do HubSpot tem MUITAS etapas (funil + laterais/origem como ADS,
// CASA DOS DADOS, PROSPECT, VISITADOS, RECICLAGEM etc.). Pelo app o vendedor
// SO pode mover o lead dentro do funil comercial abaixo — as laterais nao sao
// destino de mudanca de etapa (essas so' mudam pelo HubSpot).
//
// FUNNEL_STAGE_IDS: sequencia de progressao (avancar 1 por vez). A ordem aqui
// e' a ordem canonica do funil, independente do displayOrder do HubSpot (que
// mistura laterais no meio). Enviado Onboarding e' o fim do funil ganho.
export const FUNNEL_STAGE_IDS = [
  '1319906944', // PROSPECÇÃO (PAP)
  '209405287',  // QUALIFICAÇÃO
  '209405288',  // DEMO/PROPOSTA
  '209405289',  // NEGOCIAÇÃO
  '1090779811', // AGUARDANDO PAGAMENTO
  '209405292',  // NEGÓCIO FECHADO
  '1090779812', // ENVIADO ONBOARDING
];

// Saida sempre disponivel como destino no app (a qualquer momento do funil).
export const LOST_STAGE_ID = '209405293'; // NEGÓCIO PERDIDO

// Todos os IDs que o app aceita como DESTINO de mudanca (funil + perdido).
// Qualquer etapa fora disso (laterais/origem) nao aparece como opcao no modal.
export const APP_STAGE_IDS = [...FUNNEL_STAGE_IDS, LOST_STAGE_ID];

// Paleta ciclica pra colorir etapas novas do HubSpot que nao tem cor propria
// no mapa hardcoded. Mantem o visual consistente sem precisar cor por etapa.
export const STAGE_PALETTE = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#f97316', '#ef4444',
  '#0ea5e9', '#10b981', '#a855f7', '#14b8a6', '#eab308',
];

export const STAGES: Stage[] = [
  {
    id: '1319906944',
    label: 'PROSPECÇÃO (PAP)',
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
  {
    id: '209405287',
    label: 'QUALIFICAÇÃO',
    color: '#8b5cf6',
    subFields: [
      {
        field: 'gargalo_operacional',
        fieldLabel: 'Gargalo operacional',
        kind: 'select',
        options: ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'],
      },
    ],
  },
  { id: '209405288', label: 'DEMO/PROPOSTA', color: '#f59e0b' },
  {
    id: '209405289',
    label: 'NEGOCIAÇÃO',
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
    id: '209405293',
    label: 'NEGÓCIO PERDIDO',
    color: '#ef4444',
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
    id: '1090779811',
    label: 'AGUARDANDO PAGAMENTO',
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
        // TODO: virar 'select' quando voce me passar as opcoes fixas, ou deixar text livre
        field: 'qual_maior_desafio_',
        fieldLabel: 'Qual o maior desafio',
        kind: 'text',
        placeholder: 'Ex.: gestão de fluxo, controle de estoque...',
      },
      {
        field: 'informacoes_sobre_o_maior_desafio',
        fieldLabel: 'Informações sobre o maior desafio',
        kind: 'textarea',
        placeholder: 'Descreva o contexto, tentativas anteriores, etc.',
      },
    ],
  },
  // NEGÓCIO FECHADO (id real do HubSpot). Etapa de fechamento-ganho; sem
  // sub-campos proprios. Existe no fallback pra o funil ficar completo mesmo
  // sem o get_stages ter carregado.
  { id: '209405292', label: 'NEGÓCIO FECHADO', color: '#16a34a' },
  {
    // ENVIADO ONBOARDING — id real do HubSpot (era placeholder antes).
    id: '1090779812',
    label: 'ENVIADO ONBOARDING',
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
