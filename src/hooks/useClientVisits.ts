import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { ClientVisit } from '../types/client';

// Mesma defesa do useClientNotes/useClientStageChanges: antes da migration
// 20260727 rodar a tabela nao existe — trata como historico vazio em vez de
// quebrar o bottom sheet do lead.
const isMissingTableError = (err: any) =>
  err?.code === '42P01' ||
  /relation .* does not exist/i.test(err?.message ?? '');

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
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return (data ?? []) as ClientVisit[];
    },
    enabled: isAuthenticated && !!clientId,
  });

  return {
    visits: query.data ?? [],
    isLoading: query.isLoading,
  };
}
