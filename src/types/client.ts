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
  geo_source: string | null;
  geo_approximate: boolean | null;
  id_hubspot: string | null;
  url_hubspot: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ClientFormData {
  nome: string;
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
