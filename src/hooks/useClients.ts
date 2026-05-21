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
        .select('*');

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
      const isVisited = form.status === 'lead_visitado';
      const insertPayload: Record<string, unknown> = {
        nome: form.nome,
        empresa: form.empresa ?? null,
        endereco: form.endereco ?? null,
        numero: form.numero ?? null,
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
        // Cadastros via app têm origem manual e geolocalização escolhida no mapa.
        geo_source: 'coords',
        geo_approximate: !form.numero,
      };
      // Cadastro manual já marcado como visitado registra normalmente, sem
      // checagem de proximidade (isso só vale pra transição via mark_client_as_visited).
      if (isVisited) {
        insertPayload.visited_at = new Date().toISOString();
        insertPayload.visited_at_lat = form.latitude;
        insertPayload.visited_at_lon = form.longitude;
        insertPayload.visited_by = user?.id ?? null;
      }

      const { data, error } = await supabase
        .from('clients')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      const client = mapRow(data);

      // Webhook outbound no MESMO formato dos leads do HubSpot, pra padronizar
      // com o fluxo já existente de integração externa.
      // dealname = nome da empresa (fallback pro nome do contato se não tiver empresa).
      const dealname = client.empresa ?? client.nome;
      fetch('https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bairro: client.bairro,
          celular: client.telefone,
          cep: client.cep,
          cidade: client.cidade,
          dealname,
          email: client.email,
          estado_uf: client.estado,
          id_hubspot: client.id_hubspot,
          latitude: client.latitude !== null ? String(client.latitude) : null,
          logradouro: client.endereco,
          longitude: client.longitude !== null ? String(client.longitude) : null,
          nome: client.nome,
          numero_do_local: client.numero,
          observacoes: client.observacoes,
          url: client.url_hubspot,
        }),
      }).catch((err) => console.warn('[WEBHOOK] cadastro manual falhou:', err));

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
          empresa: form.empresa ?? null,
          endereco: form.endereco ?? null,
          numero: form.numero ?? null,
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

  const markAsVisited = useMutation({
    mutationFn: async ({
      clientId,
      latitude,
      longitude,
    }: { clientId: string; latitude: number; longitude: number }) => {
      const { data, error } = await supabase.rpc('mark_client_as_visited', {
        p_client_id: clientId,
        p_user_lat: latitude,
        p_user_lon: longitude,
      });
      if (error) throw error;
      return mapRow(data);
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
    markAsVisited,
  };
}
