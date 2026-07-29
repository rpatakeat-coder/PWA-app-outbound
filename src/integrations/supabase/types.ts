export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  sector: string | null;
  // gestor = acesso total (substituiu o antigo admin por e-mail hardcoded).
  role: 'user' | 'view' | 'gestor' | null;
  timezone: string | null;
  language: string | null;
  preferences: Record<string, any> | null;
  phone: string | null;
  avatar_url: string | null;
  id_hubspot: string | null;
  instancia_token: string | null;
  created_at: string | null;
  updated_at: string | null;
}
