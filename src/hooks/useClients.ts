import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Client, ClientFormData } from '../types/client';

const mapRow = (row: any): Client => row as Client;

export function useClients() {
  const queryClient = useQueryClient();
  const { isAuthenticated, user, profile } = useAuth();

  // Load visibility rules for user's sector
  const visibilityQuery = useQuery<string[]>({
    queryKey: ['visibility', profile?.sector],
    queryFn: async () => {
      const sector = profile?.sector || 'Geral';
      const { data } = await supabase
        .from('sector_visibility')
        .select('status_slug')
        .eq('sector', sector);
      return (data || []).map((r: any) => r.status_slug);
    },
    enabled: isAuthenticated && !!profile,
  });

  // Load dynamic statuses
  const statusesQuery = useQuery({
    queryKey: ['client_statuses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_statuses')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      return data || [];
    },
    enabled: isAuthenticated,
  });

  const allowedStatuses = visibilityQuery.data;

  const query = useQuery<Client[]>({
    queryKey: ['clients', allowedStatuses],
    queryFn: async () => {
      let q = supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply sector visibility filter
      if (allowedStatuses && allowedStatuses.length > 0) {
        q = q.in('status', allowedStatuses);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    enabled: isAuthenticated && visibilityQuery.isFetched,
  });

  const addClient = useMutation({
    mutationFn: async (form: ClientFormData) => {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          nome: form.nome,
          endereco: form.endereco ?? null,
          cep: form.cep ?? null,
          cidade: form.cidade ?? null,
          estado: form.estado ?? null,
          telefone: form.telefone ?? null,
          email: form.email ?? null,
          status: form.status,
          latitude: form.latitude,
          longitude: form.longitude,
          observacoes: form.observacoes ?? null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      const client = mapRow(data);

      fetch('https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'pin.created',
          created_at: new Date().toISOString(),
          client,
          created_by: user
            ? {
                id: user.id,
                email: user.email ?? null,
                full_name: profile?.full_name ?? null,
                sector: profile?.sector ?? null,
              }
            : null,
        }),
      }).catch((err) => console.warn('[WEBHOOK] pin.created falhou:', err));

      return client;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, ...form }: ClientFormData & { id: string }) => {
      const { data, error } = await supabase
        .from('clients')
        .update({
          nome: form.nome,
          endereco: form.endereco ?? null,
          cep: form.cep ?? null,
          cidade: form.cidade ?? null,
          estado: form.estado ?? null,
          telefone: form.telefone ?? null,
          email: form.email ?? null,
          status: form.status,
          latitude: form.latitude,
          longitude: form.longitude,
          observacoes: form.observacoes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return mapRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  return {
    clients: query.data ?? [],
    statuses: statusesQuery.data ?? [],
    isLoading: (query.isLoading && query.fetchStatus !== 'idle') || visibilityQuery.isLoading,
    error: query.error,
    addClient,
    updateClient,
    deleteClient,
  };
}
