// Cliente Supabase do cockpit.
//
// Aponta pro MESMO projeto do app de campo, e de proposito: o cockpit nao tem
// banco proprio: ele le' as tabelas de operacao (clients, client_visits,
// client_stage_changes, stage_sla...) e escreve so' o que e' de gestao.
//
// A sessao e' compartilhada com o PWA sem nenhum codigo de sincronia: o
// supabase-js guarda o token no localStorage, que e' por ORIGEM. Como os dois
// front-ends vivem no mesmo dominio (/ e /gestao), quem entrou num ja' chega
// autenticado no outro. E' por isso que a decisao de "mesmo dominio, caminhos
// diferentes" nao foi so' estetica.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !ANON) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. ' +
      'Defina no gestao/.env.local (dev) e nas Environment Variables da Vercel.',
  );
}

export const supabase = createClient(SUPABASE_URL, ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Mesma chave de storage que o app de campo usa por padrao — e' o que
    // permite os dois lerem a mesma sessao.
    // Mesma convencao de chave do supabase-js: sb-<ref-do-projeto>-auth-token.
    // Derivada do subdominio pra bater com a que o app de campo grava.
    storageKey: `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`,
    detectSessionInUrl: false,
  },
});
