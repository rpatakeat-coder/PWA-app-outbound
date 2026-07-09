import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { ClientNote } from '../types/client';

// Mesma URL dos demais webhooks outbound. type=create_note leva a nota do app
// pra timeline/engagements do lead no HubSpot (via n8n).
const WEBHOOK_URL = 'https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d';

// Postgres code 42P01 = relation does not exist. Antes da migration 20260617
// rodar, a tabela client_notes nao existe — tratamos como "sem notas" pra
// nao quebrar o bottom sheet em prod nesse intervalo.
const isMissingTableError = (err: any) =>
  err?.code === '42P01' ||
  /relation .* does not exist/i.test(err?.message ?? '');

export function useClientNotes(clientId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { user, profile, isAuthenticated } = useAuth();

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
        .insert({
          client_id: clientId,
          body: trimmed,
          created_by: user.id,
          // Snapshot do autor: nome/email do profile no momento da criacao.
          // Imutavel — se a pessoa trocar de nome depois, a nota antiga
          // mantem o nome de quando foi escrita.
          created_by_name: profile?.full_name ?? null,
          created_by_email: user.email ?? profile?.email ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      const note = data as ClientNote;

      // Sincroniza a nota com o HubSpot (timeline/engagements do lead). Roda em
      // background — o insert local ja sucedeu; se o webhook falhar, so loga.
      // Precisa do id_hubspot do cliente pra o n8n achar o deld la.
      (async () => {
        try {
          const { data: c } = await supabase
            .from('clients')
            .select('id_hubspot, nome, empresa')
            .eq('id', clientId)
            .single();
          if (!c?.id_hubspot) return; // sem id_hubspot, nao ha como casar no HubSpot
          fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'create_note',
              note_id: note.id,
              lead_id: clientId,
              id_hubspot: c.id_hubspot,
              lead_nome: c.nome,
              lead_empresa: c.empresa,
              body: note.body,
              autor_nome: note.created_by_name,
              autor_email: note.created_by_email,
              autor_uid: user.id,
              criado_em: note.created_at,
            }),
          }).catch((err) => console.warn('[WEBHOOK] create_note falhou:', err));
        } catch (err) {
          console.warn('[WEBHOOK] create_note lookup falhou:', err);
        }
      })();

      return note;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_notes', clientId] }),
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Nota vazia');
      const { data, error } = await supabase
        .from('client_notes')
        .update({ body: trimmed })
        .eq('id', id)
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
    updateNote,
    deleteNote,
  };
}
