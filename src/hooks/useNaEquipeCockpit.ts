import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';

// A pessoa logada está na equipe do Cockpit (equipe_cockpit, ativo)?
//
// É isso que decide se o mapa mostra o botão "Gestão" (25/09/2026: o Cockpit é
// a gestão do PWA, para o executivo e para o gestor). Quem não está na equipe
// não ganha o botão: a gestão responderia 403, e no 403 a tela do Cockpit faz
// signOut local — derrubaria o login do mapa no mesmo aparelho.
//
// RLS: equipe_cockpit_select deixa cada um ler a PRÓPRIA linha. Erro de rede
// devolve false — sem o botão, e não com um botão que talvez derrube a sessão.
export function useNaEquipeCockpit(): boolean {
  const { user } = useAuth();
  const query = useQuery<boolean>({
    queryKey: ['equipe_cockpit_eu', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from('equipe_cockpit')
        .select('ativo')
        .eq('profile_id', user.id)
        .maybeSingle();
      if (error) return false;
      return !!(data as { ativo?: boolean } | null)?.ativo;
    },
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000,
  });
  return query.data ?? false;
}
