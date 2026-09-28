import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://mxyjvijclhlxrlafqcrz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWp2aWpjbGhseHJsYWZxY3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDA1MTQsImV4cCI6MjA4MzgxNjUxNH0.DeEJrynoil34MXrZMGBtouyHBX0ldsgK__H97NYBFyM';

// EDGE FUNCTION AO LADO DO BANCO (auditoria de velocidade, 28/09/2026). O banco está em
// us-west-2 (Oregon) e a função rodava em sa-east-1 (São Paulo, perto do usuário): cada
// leitura que ela faz ao banco cruzava o continente (~200 ms), e ela faz várias por
// chamada — cockpit-dados p50 2,2 s. Com forceFunctionRegion ela roda em Oregon: o
// usuário paga UMA travessia, as leituras ficam locais. Parâmetro de URL, não cabeçalho,
// para não precisar de CORS novo nas funções.
const REGIAO_DAS_FUNCOES = 'us-west-2';
export function naRegiaoDoBanco(url: string): string {
  if (!url.includes('/functions/v1/') || url.includes('forceFunctionRegion=')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'forceFunctionRegion=' + REGIAO_DAS_FUNCOES;
}
const fetchNaRegiao: typeof fetch = (entrada, init) => {
  if (typeof entrada === 'string') return fetch(naRegiaoDoBanco(entrada), init);
  if (entrada instanceof URL) return fetch(naRegiaoDoBanco(entrada.toString()), init);
  return fetch(entrada, init);
};

/** O usuário da sessão local, no formato do auth.getUser(), sem ir ao servidor de login.
 *  Para leitura (a RLS no banco é quem confere o token): getUser() custava uma ida e
 *  volta a Oregon antes de cada consulta de recado, comunicado e PDI (auditoria 28/09). */
export async function usuarioDaSessao() {
  const { data } = await supabase.auth.getSession();
  return { data: { user: data.session?.user ?? null } };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: fetchNaRegiao },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
