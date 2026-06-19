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
};

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
  {
    // Stage HubSpot id pendente — substituir pelo id real quando configurar
    // no pipeline. Usa placeholder enquanto isso pra nao quebrar o tipo.
    id: 'enviado_para_onboarding',
    label: 'ENVIADO PARA ONBOARDING',
    color: '#10b981',
    // So aparece como opcao quando o lead esta em NEGOCIO FECHADO.
    gateEtapa: ['NEGÓCIO FECHADO'],
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
// O type distingue o caso. Aqui: type=change_stage.
export const CHANGE_STAGE_WEBHOOK = 'https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d';
