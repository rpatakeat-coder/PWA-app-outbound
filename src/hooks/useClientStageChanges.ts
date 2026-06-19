import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { ClientStageChange } from '../types/client';

// Mesma defesa do useClientNotes: antes da migration 20260620 rodar a tabela
// nao existe — tratamos como historico vazio em vez de quebrar o bottom sheet.
const isMissingTableError = (err: any) =>
  err?.code === '42P01' ||
  /relation .* does not exist/i.test(err?.message ?? '');

export function useClientStageChanges(clientId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { user, profile, isAuthenticated } = useAuth();

  const query = useQuery<ClientStageChange[]>({
    queryKey: ['client_stage_changes', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('client_stage_changes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return (data ?? []) as ClientStageChange[];
    },
    enabled: isAuthenticated && !!clientId,
  });

  const recordChange = useMutation({
    mutationFn: async (input: {
      fromStage: string | null;
      toStage: string;
      toStageId: string | null;
      subValues: Record<string, unknown> | null;
    }) => {
      if (!clientId) throw new Error('Sem cliente selecionado');
      if (!user?.id) throw new Error('Usuario nao autenticado');

      const { data, error } = await supabase
        .from('client_stage_changes')
        .insert({
          client_id: clientId,
          from_stage: input.fromStage,
          to_stage: input.toStage,
          to_stage_id: input.toStageId,
          sub_values: input.subValues,
          created_by: user.id,
          created_by_name: profile?.full_name ?? null,
          created_by_email: user.email ?? profile?.email ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ClientStageChange;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['client_stage_changes', clientId] }),
  });

  return {
    changes: query.data ?? [],
    isLoading: query.isLoading,
    recordChange,
  };
}
