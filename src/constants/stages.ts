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
];

// Mesma URL usada nos webhooks de cadastro manual e marcar como visitado.
// O type distingue o caso. Aqui: type=change_stage.
export const CHANGE_STAGE_WEBHOOK = 'https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d';
