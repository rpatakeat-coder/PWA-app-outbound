import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { ClientVisit } from '../types/client';

export function useClientVisits(clientId: string | null | undefined) {
  const { isAuthenticated } = useAuth();

  const query = useQuery<ClientVisit[]>({
    queryKey: ['client_visits', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('client_visits')
        .select('*')
        .eq('client_id', clientId)
        .order('visited_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientVisit[];
    },
    enabled: isAuthenticated && !!clientId,
  });

  return {
    visits: query.data ?? [],
    isLoading: query.isLoading,
  };
}
