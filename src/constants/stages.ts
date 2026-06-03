// Etapas (pipeline stages) do funil HubSpot que os vendedores podem
// disparar a partir do app via webhook. Os ids são os deal stage ids
// do HubSpot — manter sincronizados com a config lá.
//
// Algumas etapas têm propriedades obrigatórias no HubSpot. Quando o
// vendedor seleciona essas etapas no app, exibimos um seletor extra
// (subOption) e mandamos sub_field / sub_value no payload do webhook
// pra que o handler atualize a propriedade obrigatória junto com a
// mudança de stage.

export type StageSubOption = {
  // Nome interno da propriedade do HubSpot que vai ser atualizada
  field: string;
  // Label apresentado no UI
  fieldLabel: string;
  // Valores válidos (devem casar exatamente com as opções do dropdown
  // configurado no HubSpot — sem isso a property update falha lá)
  options: string[];
};

export type Stage = {
  id: string;
  label: string;
  color: string;
  subOption?: StageSubOption;
};

export const STAGES: Stage[] = [
  {
    id: '1319906944',
    label: 'PROSPECÇÃO (PAP)',
    color: '#3b82f6',
    subOption: {
      field: 'origem_do_lead',
      fieldLabel: 'Origem do lead',
      options: ['Rua', 'Indicação', 'Casa dos Dados', 'Instagram', 'Ads', 'GoogleMaps', 'Família', 'Eventos'],
    },
  },
  {
    id: '209405287',
    label: 'QUALIFICAÇÃO',
    color: '#8b5cf6',
    subOption: {
      field: 'gargalo_operacional',
      fieldLabel: 'Gargalo operacional',
      options: ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'],
    },
  },
  { id: '209405288', label: 'DEMO/PROPOSTA', color: '#f59e0b' },
  { id: '209405289', label: 'NEGOCIAÇÃO', color: '#f97316' },
  { id: '1090779811', label: 'AGUARDANDO PAGAMENTO', color: '#06b6d4' },
  { id: '209405292', label: 'NEGÓCIO FECHADO', color: '#22c55e' },
  { id: '1090779812', label: 'ENVIADO ONBOARDING', color: '#10b981' },
  { id: '209405293', label: 'NEGÓCIO PERDIDO', color: '#ef4444' },
];

// Mesma URL usada nos webhooks de cadastro manual e marcar como visitado.
// O type distingue o caso. Aqui: type=change_stage.
export const CHANGE_STAGE_WEBHOOK = 'https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d';
