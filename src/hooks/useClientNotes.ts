import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { ClientNote } from '../types/client';

// Postgres code 42P01 = relation does not exist. Antes da migration 20260617
// rodar, a tabela client_notes nao existe — tratamos como "sem notas" pra
// nao quebrar o bottom sheet em prod nesse intervalo.
const isMissingTableError = (err: any) =>
  err?.code === '42P01' ||
  /relation .* does not exist/i.test(err?.message ?? '');

export function useClientNotes(clientId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  const notesQuery = useQuery<ClientNote[]>({
    queryKey: ['client_notes', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('client_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return (data ?? []) as ClientNote[];
    },
    enabled: isAuthenticated && !!clientId,
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      if (!clientId) throw new Error('Sem cliente selecionado');
      if (!user?.id) throw new Error('Usuario nao autenticado');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Nota vazia');

      const { data, error } = await supabase
        .from('client_notes')
        .insert({ client_id: clientId, body: trimmed, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as ClientNote;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_notes', clientId] }),
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from('client_notes').delete().eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_notes', clientId] }),
  });

  return {
    notes: notesQuery.data ?? [],
    isLoading: notesQuery.isLoading,
    addNote,
    deleteNote,
  };
}
