import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Client, ClientFormData } from '../types/client';
import { bboxAround, roundCoordsForKey } from '../utils/area';

const mapRow = (row: any): Client => row as Client;

export type AreaFilter = { lat: number; lon: number; radiusKm: number };

export function useClients(opts: { areaFilter?: AreaFilter | null; enabled?: boolean } = {}) {
  const { areaFilter = null, enabled: callerEnabled = true } = opts;
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

  // Chave de cache: usa coords arredondadas pra não invalidar a cada
  // metro de jitter de GPS. A query em si usa lat/lon raw pra precisão.
  const areaCacheKey = areaFilter
    ? { ...roundCoordsForKey(areaFilter.lat, areaFilter.lon), r: areaFilter.radiusKm }
    : null;

  const query = useQuery<Client[]>({
    queryKey: ['clients', allowedStatuses, areaCacheKey],
    queryFn: async () => {
      // PostgREST capa em 1000 linhas por padrão. Pagina em blocos pra trazer
      // todos os clientes do setor sem precisar mexer no max-rows do servidor.
      const PAGE_SIZE = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('clients')
          .select('*')
          .range(from, from + PAGE_SIZE - 1);

        if (allowedStatuses && allowedStatuses.length > 0) {
          q = q.in('status', allowedStatuses);
        }

        // Filtro espacial via bounding box. Clientes sem lat/lon ficam de
        // fora porque .gte/.lte em NULL nunca casa — desejável: cliente
        // sem geo não tem como entrar no raio mesmo.
        if (areaFilter) {
          const bbox = bboxAround(areaFilter.lat, areaFilter.lon, areaFilter.radiusKm);
          q = q
            .gte('latitude', bbox.latMin)
            .lte('latitude', bbox.latMax)
            .gte('longitude', bbox.lonMin)
            .lte('longitude', bbox.lonMax);
        }

        const { data, error } = await q;
        if (error) throw error;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all.map(mapRow);
    },
    enabled: callerEnabled && isAuthenticated && visibilityQuery.isFetched,
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

      // Roda em background: espera o n8n responder com o id do deal criado
      // no HubSpot e dá UPDATE em clients.id_hubspot. Isso destrava o botão
      // "Mover para etapa" pro pin recém-criado sem precisar fechar/abrir o app.
      //
      // A mutation principal retorna assim que o INSERT no Supabase termina —
      // o usuário vê o pin na hora. A enriquecimento com id_hubspot/url_hubspot
      // chega em ~2-5s e o queryClient.invalidateQueries refresca a UI.
      (async () => {
        try {
          const res = await fetch('https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d', {
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
          });

          if (!res.ok) {
            console.warn('[WEBHOOK] cadastro manual respondeu', res.status);
            return;
          }

          // Tenta parsear JSON. Aceita formatos comuns que o n8n pode mandar:
          //   { id_hubspot: "123" }, { deal_id: "123" }, { id: "123" }, ou só "123".
          let body: unknown = null;
          try {
            body = await res.json();
          } catch {
            console.warn('[WEBHOOK] cadastro manual respondeu sem JSON');
            return;
          }
          const asObj = body as Record<string, unknown> | null;
          const idHubspot =
            typeof body === 'string' ? body :
            (asObj?.id_hubspot ?? asObj?.deal_id ?? asObj?.id ?? null);
          const urlHubspot = (asObj?.url_hubspot ?? asObj?.url ?? null) as string | null;

          if (!idHubspot) {
            console.warn('[WEBHOOK] cadastro manual sem id_hubspot na resposta:', body);
            return;
          }

          const updatePayload: Record<string, unknown> = { id_hubspot: String(idHubspot) };
          if (urlHubspot) updatePayload.url_hubspot = urlHubspot;

          const { error: updErr } = await supabase
            .from('clients')
            .update(updatePayload)
            .eq('id', client.id);
          if (updErr) {
            console.warn('[WEBHOOK] update id_hubspot falhou:', updErr.message);
            return;
          }

          // Refresca a lista pra UI pegar o id_hubspot novo — o botão
          // "Mover para etapa" passa a aparecer ativo nesse pin.
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        } catch (err) {
          console.warn('[WEBHOOK] cadastro manual falhou:', err);
        }
      })();

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
      const client = mapRow(data);

      // Webhook outbound: notifica a mesma URL do cadastro manual com type=visited
      // pra que o consumidor (n8n / HubSpot) saiba diferenciar criacao de visita.
      // Manda todos os campos do cliente + metadata da visita (coords/quando/quem).
      const raw = (data ?? {}) as Record<string, unknown>;
      const dealname = client.empresa ?? client.nome;
      fetch('https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'visited',
          id: client.id,
          bairro: client.bairro,
          celular: client.telefone,
          cep: client.cep,
          cidade: client.cidade,
          dealname,
          email: client.email,
          empresa: client.empresa,
          endereco_completo: [client.endereco, client.numero, client.bairro, client.cidade, client.estado, client.cep]
            .filter(Boolean)
            .join(', '),
          estado_uf: client.estado,
          id_hubspot: client.id_hubspot,
          latitude: client.latitude !== null ? String(client.latitude) : null,
          logradouro: client.endereco,
          longitude: client.longitude !== null ? String(client.longitude) : null,
          nome: client.nome,
          numero_do_local: client.numero,
          observacoes: client.observacoes,
          status: client.status,
          status_anterior: raw.status_anterior ?? null,
          url: client.url_hubspot,
          visited_at: raw.visited_at ?? new Date().toISOString(),
          visited_at_lat: raw.visited_at_lat ?? latitude,
          visited_at_lon: raw.visited_at_lon ?? longitude,
          visited_by: raw.visited_by ?? user?.id ?? null,
          visited_by_email: user?.email ?? null,
          visited_by_name: profile?.full_name ?? null,
          visited_by_sector: profile?.sector ?? null,
        }),
      }).catch((err) => console.warn('[WEBHOOK] marcar como visitado falhou:', err));

      return client;
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
