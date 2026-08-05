// Status do cliente — fonte da verdade é a tabela `client_statuses` no Supabase.
// Mantido como `string` para que adicionar/renomear/remover status seja feito
// somente pela interface web, sem alteração de código.
export type ClientStatus = string;

export interface ClientStatusRow {
  id: string;
  slug: string;
  label: string;
  color: string;
  sort_order: number | null;
  is_active: boolean;
  is_default_for_new_leads: boolean | null;
}

export interface Client {
  id: string;
  nome: string;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cep: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  email: string | null;
  empresa: string | null;
  status: ClientStatus;
  latitude: number | null;
  longitude: number | null;
  observacoes: string | null;
  etapa: string | null;
  atualizacao_diaria: boolean | null;
  geo_source: string | null;
  geo_approximate: boolean | null;
  id_hubspot: string | null;
  url_hubspot: string | null;
  vendedor_id_hubspot: string | null;
  visited_at: string | null;
  // Quantas vezes o lead ja foi visitado (contador mantido pela RPC
  // mark_client_as_visited; o historico completo vive em client_visits).
  visit_count: number;
  won_at: string | null;
  // Uso do produto, puxado do HubSpot toda segunda pela edge hubspot-usage-sync
  // (deals nas etapas de Acompanhamento/Saudável do Onboarding e do Sucesso).
  // 'YYYY-MM-DD' — sao colunas date no banco, sem hora e sem fuso.
  hs_ultima_comanda_em: string | null;
  hs_cancelamento_solicitado_em: string | null;
  // Quando o sync passou por este cliente. NULL = fora do recorte do sync (ou
  // ele ainda nao rodou); distingue "sem comanda" de "sem dado".
  hs_uso_sincronizado_em: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Uma visita (check-in com GPS). O mesmo lead pode ter varias.
export interface ClientVisit {
  id: string;
  client_id: string;
  visited_at: string;
  visited_at_lat: number | null;
  visited_at_lon: number | null;
  distance_m: number | null;
  visited_by: string | null;
  visited_by_name: string | null;
  visited_by_email: string | null;
  etapa_anterior: string | null;
  created_at: string;
}

// Tipo do agendamento: reunião ou follow up. Mesmo fluxo/tabela, muda só o
// rótulo e o título gerado no Google Agenda (organização).
export type MeetingType = 'reuniao' | 'follow_up';

export interface ClientMeeting {
  id: string;
  client_id: string;
  scheduled_at: string;
  duration_minutes: number;
  observacoes: string | null;
  status: string;
  type: MeetingType;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // ID do engagement no HubSpot criado ao agendar: Observação (note) pro follow
  // up — em linhas antigas pode ser uma Task, da regra anterior. Usado pra
  // atualizar/cancelar o mesmo engagement em vez de duplicar.
  hs_engagement_id: string | null;
  // ID do evento no Google Calendar (demos). O app cria/reagenda/cancela o
  // evento; o Meeting no HubSpot acompanha via sync HubSpot<->Google.
  google_event_id: string | null;
}

export interface ClientMeetingFormData {
  client_id: string;
  scheduled_at: string;
  duration_minutes: number;
  observacoes?: string | null;
  type: MeetingType;
}

export interface ClientFormData {
  nome: string;
  empresa?: string;
  endereco?: string;
  numero?: string | null;
  bairro?: string | null;
  cep?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  email?: string;
  status: ClientStatus;
  latitude: number | null;
  longitude: number | null;
  observacoes?: string;
  // Quando true, o pin veio de geocoding impreciso (centroide da rua). O
  // check-in usa um raio maior nesses casos. Default false (pin do mapa/coords
  // é sempre preciso; só o CEP sem número exato marca true).
  geo_approximate?: boolean;
  // Origem da coordenada ('coords' pin no mapa, 'cep', 'google', etc.). Só
  // enviado quando a edição mexe na localização; edições de texto omitem.
  geo_source?: string;
}

export interface FieldRoute {
  id: string;
  seller_id: string;
  route_date: string;
  title: string;
  status: 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
  source: 'manual' | 'suggested';
  priority_mode: string;
  base_lat: number | null;
  base_lon: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldRouteStop {
  id: string;
  route_id: string;
  client_id: string;
  position: number;
  planned_at: string | null;
  status: 'planned' | 'done' | 'skipped' | 'removed';
  notes: string | null;
  distance_meters: number | null;
  estimated_drive_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface FieldRouteStopWithClient extends FieldRouteStop {
  client: Client | null;
}

export interface ClientNote {
  id: string;
  client_id: string;
  body: string;
  created_by: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

// Tarefa gerada automaticamente pelo motor de regras (generate_client_tasks
// no Supabase). O app so le e conclui/dispensa; a criacao vem do banco.
export type ClientTaskStatus = 'pendente' | 'concluida' | 'dispensada' | 'resolvida_auto';

export interface ClientTask {
  id: string;
  client_id: string;
  task_type: string;
  severity: string | null;
  title: string;
  status: ClientTaskStatus;
  vendedor_id_hubspot: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface ClientStageChange {
  id: string;
  client_id: string;
  from_stage: string | null;
  to_stage: string;
  to_stage_id: string | null;
  sub_values: Record<string, unknown> | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  created_at: string;
}
