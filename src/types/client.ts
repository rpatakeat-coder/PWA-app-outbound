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
  created_at: string | null;
  updated_at: string | null;
}

export interface ClientMeeting {
  id: string;
  client_id: string;
  scheduled_at: string;
  duration_minutes: number;
  observacoes: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientMeetingFormData {
  client_id: string;
  scheduled_at: string;
  duration_minutes: number;
  observacoes?: string | null;
}

export interface ClientFormData {
  nome: string;
  empresa?: string;
  endereco?: string;
  numero?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  email?: string;
  status: ClientStatus;
  latitude: number | null;
  longitude: number | null;
  observacoes?: string;
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
