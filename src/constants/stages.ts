// Etapas (pipeline stages) do funil HubSpot que os vendedores podem
// disparar a partir do app via webhook. Os ids são os deal stage ids
// do HubSpot — manter sincronizados com a config lá.
//
// Algumas etapas têm propriedades obrigatórias no HubSpot — listadas
// em subFields. Cada sub-field tem um kind ('select' ou 'currency')
// que determina o tipo de input no UI. Pra select, as opções vêm
// do banco (tabela stage_property_options) via useStagePropertyOptions
// — o array hardcoded em `options` é só fallback inicial.

export type StageSubField =
  | {
      field: string;
      fieldLabel: string;
      kind: 'select';
      // Fallback enquanto a query do banco não termina ou se falhar.
      // Source of truth real é a tabela stage_property_options.
      options: string[];
    }
  | {
      field: string;
      fieldLabel: string;
      kind: 'currency';
      placeholder?: string;
    }
  | {
      field: string;
      fieldLabel: string;
      kind: 'text';
      placeholder?: string;
    }
  | {
      field: string;
      fieldLabel: string;
      kind: 'textarea';
      placeholder?: string;
    }
  | {
      field: string;
      fieldLabel: string;
      kind: 'email';
      placeholder?: string;
    }
  | {
      // CEP brasileiro: aplica mascara 00000-000 + valida 8 digitos
      field: string;
      fieldLabel: string;
      kind: 'cep';
      placeholder?: string;
    }
  | {
      // CNPJ: aplica mascara 00.000.000/0000-00 + valida 14 digitos
      field: string;
      fieldLabel: string;
      kind: 'cnpj';
      placeholder?: string;
    };

export type Stage = {
  id: string;
  label: string;
  color: string;
  subFields?: StageSubField[];
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
        kind: 'select',
        options: ['Sim', 'Não'],
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
];

// Mesma URL usada nos webhooks de cadastro manual e marcar como visitado.
// O type distingue o caso. Aqui: type=change_stage.
export const CHANGE_STAGE_WEBHOOK = 'https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d';
