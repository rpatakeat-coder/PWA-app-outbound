import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Client, ClientFormData } from '../types/client';
import { bboxAround, roundCoordsForKey } from '../utils/area';
import { createVisitTask, sendHubspotEvent } from '../utils/hubspotSync';
import { FUNNEL_STAGE_IDS, STAGES, VISITA_STAGE_ID, VISITA_STAGE_LABEL } from '../constants/stages';

const mapRow = (row: any): Client => row as Client;

export type AreaFilter = { lat: number; lon: number; radiusKm: number };

export function useClients(opts: { areaFilter?: AreaFilter | null; enabled?: boolean } = {}) {
  const { areaFilter = null, enabled: callerEnabled = true } = opts;
  const queryClient = useQueryClient();
  const { isAuthenticated, user, profile } = useAuth();

  // Viewer (somente leitura) enxerga TODOS os status, de qualquer setor e de
  // qualquer vendedor — ignora o recorte de sector_visibility. A UI dele filtra
  // por multi-selecao de chips; o corte por setor nao faz sentido pra um perfil
  // de visao ampla (marketing/onboarding acompanhando o mapa inteiro).
  const isViewer = profile?.role === 'view';

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
    // Viewer ignora sector_visibility, entao nem busca as regras.
    enabled: isAuthenticated && !!profile && !isViewer,
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
        // ORDER BY estavel e OBRIGATORIO com paginacao por .range(): sem ele o
        // PostgREST/Postgres nao garante a mesma ordem entre as paginas, entao
        // linhas na fronteira (ex.: registro ~2815 de ~5k, 5 paginas) podem ser
        // PULADAS ou duplicadas — o lead "some" da lista de forma intermitente.
        let q = supabase
          .from('clients')
          .select('*')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        // Viewer nao filtra por status aqui (ve tudo); os demais respeitam o
        // recorte de sector_visibility.
        if (!isViewer && allowedStatuses && allowedStatuses.length > 0) {
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
    // Quando a queryKey muda (ex.: vendedor andou ~1km e o areaCacheKey
    // rotacionou), mantem a lista ANTERIOR na tela enquanto a nova area
    // carrega — sem isso o app inteiro vira "Carregando..." no meio do uso
    // (isLoading fica true por nao haver cache pra key nova).
    placeholderData: (prev: Client[] | undefined) => prev,
    // Viewer nao espera o sector_visibility (desabilitado pra ele); os demais
    // so disparam depois que as regras de visibilidade chegaram.
    enabled: callerEnabled && isAuthenticated && (isViewer || visibilityQuery.isFetched),
  });

  const addClient = useMutation({
    mutationFn: async (form: ClientFormData) => {
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
        // O criador eh o responsavel inicial do lead. Salva o id_hubspot
        // dele em vendedor_id_hubspot pra alimentar o filtro "meus leads"
        // e a opcao "somente meus leads" na rota. Se o perfil nao tiver
        // id_hubspot, fica NULL ("sem responsavel").
        vendedor_id_hubspot: profile?.id_hubspot ?? null,
        // Cadastros via pin no mapa/coords têm lat/lon preciso (o usuário aponta
        // o lugar). Via CEP, porém, o geocoding pode cair no centroide da rua
        // quando o OSM não tem o número — nesse caso o CEPStep manda
        // geo_approximate=true e a gente respeita (raio de check-in maior).
        geo_source: 'coords',
        geo_approximate: form.geo_approximate ?? false,
      };

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

      // Roda em background: a edge function hubspot-sync cria contato+deal no
      // HubSpot e ja grava clients.id_hubspot/url_hubspot server-side (deduped
      // por id do pin, entao um retry nao cria deal duplicado). Isso destrava o
      // botão "Mover para etapa" pro pin recém-criado sem fechar/abrir o app.
      //
      // A mutation principal retorna assim que o INSERT no Supabase termina —
      // o usuário vê o pin na hora. O enriquecimento chega em ~1-3s.
      //
      // Se o sendHubspotEvent LANCAR (erro ambiguo de rede num create_pin — que
      // NAO cai pro n8n justamente pra nao duplicar), a edge pode ter criado o
      // deal e gravado o id server-side mesmo assim. Por isso, em erro, a gente
      // re-consulta o Supabase algumas vezes: se o id apareceu, foi sucesso.
      (async () => {
        const applyIdFromResponse = async (body: unknown): Promise<boolean> => {
          // Aceita { id_hubspot } (edge/n8n), { deal_id }, { id }, ou "123" cru.
          const asObj = (typeof body === 'object' && body ? body : null) as Record<string, unknown> | null;
          const idHubspot =
            typeof body === 'string' ? body :
            (asObj?.id_hubspot ?? asObj?.deal_id ?? asObj?.id ?? null);
          if (!idHubspot) return false;
          const urlHubspot = (asObj?.url_hubspot ?? asObj?.url ?? null) as string | null;
          const updatePayload: Record<string, unknown> = { id_hubspot: String(idHubspot) };
          if (urlHubspot) updatePayload.url_hubspot = urlHubspot;
          const { error: updErr } = await supabase
            .from('clients')
            .update(updatePayload)
            .eq('id', client.id);
          if (updErr) {
            console.warn('[WEBHOOK] update id_hubspot falhou:', updErr.message);
            return false;
          }
          return true;
        };

        // Re-le clients.id_hubspot do banco (a edge grava server-side). Usado
        // como confirmacao quando a resposta HTTP se perdeu.
        const pollIdFromDb = async (): Promise<boolean> => {
          for (let attempt = 1; attempt <= 5; attempt++) {
            const { data: row } = await supabase
              .from('clients')
              .select('id_hubspot')
              .eq('id', client.id)
              .maybeSingle();
            if (row?.id_hubspot) return true;
            await new Promise((r) => setTimeout(r, 2000));
          }
          return false;
        };

        try {
          const body = await sendHubspotEvent({
            type: 'create_pin',
            // uuid do pin no app — a edge function usa pra gravar o
            // id_pin_app_outbound no deal, o id_hubspot em clients e dedupe.
            id: client.id,
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
            vendedor_id: profile?.id_hubspot ?? '',
            vendedor_nome: profile?.full_name ?? '',
          });

          const applied = await applyIdFromResponse(body);
          if (!applied) {
            // Resposta sem id (ex.: fallback n8n sem corpo) — confirma pelo banco.
            await pollIdFromDb();
          }
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        } catch (err) {
          // Erro ambiguo: a edge pode ter criado o deal e gravado o id. Confirma
          // pelo banco antes de dar por perdido (nao reenvia — evita duplicar).
          console.warn('[WEBHOOK] cadastro manual: erro no sync, confirmando pelo banco:', err);
          await pollIdFromDb();
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        }
      })();

      return client;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, ...form }: ClientFormData & { id: string }) => {
      // Snapshot do estado anterior pra decidir, depois do UPDATE, se algum
      // campo "monitorado" pelo consumidor externo mudou — sem isso o sync
      // de update dispararia mesmo em edicoes que so mexem em status/etapa,
      // gerando ruido no HubSpot. Le do BANCO (nao do cache): edicao de lead e'
      // rara e nao e' o gargalo de que o usuario reclama, e um snapshot
      // defasado do cache poderia concluir "nada mudou" por cima de uma edicao
      // feita em outro device, silenciando o sync e deixando HubSpot divergir.
      const { data: prevRow } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();
      const prev = prevRow ? mapRow(prevRow) : null;

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
          // bairro/geo_source/geo_approximate so vao no update quando vierem
          // definidos (fluxo "editar localizacao" preenche esses). Edicao de
          // texto os deixa undefined -> nao sobrescreve o valor atual no banco
          // (o form de edicao de texto nem popula bairro, entao gravar ?? null
          //  aqui zeraria o bairro existente — por isso condicional).
          ...(form.bairro !== undefined ? { bairro: form.bairro } : {}),
          ...(form.geo_source !== undefined ? { geo_source: form.geo_source } : {}),
          ...(form.geo_approximate !== undefined ? { geo_approximate: form.geo_approximate } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      const client = mapRow(data);

      // Webhook outbound type=update — mesmo formato do cadastro manual,
      // disparado so quando um dos campos replicados no HubSpot muda.
      if (prev) {
        const changed =
          prev.nome !== client.nome ||
          prev.empresa !== client.empresa ||
          prev.email !== client.email ||
          prev.telefone !== client.telefone ||
          prev.cep !== client.cep ||
          prev.bairro !== client.bairro ||
          prev.cidade !== client.cidade ||
          prev.estado !== client.estado ||
          prev.endereco !== client.endereco ||
          prev.numero !== client.numero ||
          prev.latitude !== client.latitude ||
          prev.longitude !== client.longitude ||
          prev.observacoes !== client.observacoes ||
          prev.id_hubspot !== client.id_hubspot;

        if (changed) {
          const dealname = client.empresa ?? client.nome;
          // Fire-and-forget: edge function hubspot-sync (fallback n8n).
          sendHubspotEvent({
              type: 'update',
              id: client.id,
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
              vendedor_id: profile?.id_hubspot ?? '',
              vendedor_nome: profile?.full_name ?? '',
          }).catch((err) => console.warn('[WEBHOOK] update falhou:', err));
        }
      }

      return client;
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
      let client = mapRow(data);

      // Conta Alvo: o lead foi materializado localmente pela Rota do dia
      // (origem='conta_alvo') e o deal no HubSpot so' nasce NA VISITA. Cria
      // agora (mesmo create_pin do cadastro), grava o id_hubspot e segue o
      // fluxo normal de visita (Task + mover pra "Visita"). AWAITADO: o id
      // precisa existir antes das chamadas abaixo. A edge dedupe por id do pin,
      // entao um retry nao duplica o deal.
      if (client.origem === 'conta_alvo' && !client.id_hubspot) {
        try {
          const body = await sendHubspotEvent({
            type: 'create_pin',
            id: client.id,
            bairro: client.bairro,
            celular: client.telefone,
            cep: client.cep,
            cidade: client.cidade,
            dealname: client.empresa ?? client.nome,
            email: client.email,
            estado_uf: client.estado,
            id_hubspot: null,
            latitude: client.latitude !== null ? String(client.latitude) : null,
            logradouro: client.endereco,
            longitude: client.longitude !== null ? String(client.longitude) : null,
            nome: client.nome,
            numero_do_local: client.numero,
            observacoes: client.observacoes,
            url: client.url_hubspot,
            vendedor_id: profile?.id_hubspot ?? '',
            vendedor_nome: profile?.full_name ?? '',
          });
          const asObj = (typeof body === 'object' && body ? body : null) as Record<string, unknown> | null;
          const raw0 = typeof body === 'string' ? body : (asObj?.id_hubspot ?? asObj?.deal_id ?? asObj?.id ?? null);
          let idHubspot = raw0 ? String(raw0) : null;
          let urlHubspot = (asObj?.url_hubspot ?? asObj?.url ?? null) as string | null;
          if (idHubspot) {
            await supabase
              .from('clients')
              .update({ id_hubspot: idHubspot, ...(urlHubspot ? { url_hubspot: urlHubspot } : {}) })
              .eq('id', client.id);
          } else {
            // Resposta sem id (a edge grava server-side) — confirma pelo banco.
            for (let attempt = 1; attempt <= 3 && !idHubspot; attempt++) {
              await new Promise((r) => setTimeout(r, 1500));
              const { data: row } = await supabase
                .from('clients').select('id_hubspot, url_hubspot').eq('id', client.id).maybeSingle();
              if (row?.id_hubspot) { idHubspot = row.id_hubspot; urlHubspot = (row.url_hubspot as string | null) ?? urlHubspot; }
            }
          }
          if (idHubspot) client = { ...client, id_hubspot: idHubspot, url_hubspot: urlHubspot ?? client.url_hubspot };
        } catch (err) {
          console.warn('[CONTA ALVO] criar deal no check-in falhou:', err);
        }
      }

      // CLIENTE/CHURN nao entram no FUNIL em nenhuma hipotese no check-in.
      // Visitar um cliente e' pos-venda (relacionamento/suporte), nao evento
      // de funil: nem etapa nem propriedade do deal dele podem ser tocadas —
      // dai o isLead travar o webhook e o change_stage abaixo. (A Task de
      // visita e' criada pra todos: e' atividade na timeline, nao funil.)
      // A visita fica registrada 100% do lado do app (client_visits +
      // visited_at + visit_count), que e' o que alimenta o mapa e as metricas.
      const isLead = client.status === 'lead';

      // Webhook outbound: notifica com type=visited pra que o consumidor
      // (n8n / HubSpot) saiba diferenciar criacao de visita. type=visited nao
      // tem rota na edge function — o helper manda direto pro n8n.
      // Manda todos os campos do cliente + metadata da visita (coords/quando/quem).
      const raw = (data ?? {}) as Record<string, unknown>;
      const dealname = client.empresa ?? client.nome;

      // Toda visita vira uma Task JA CONCLUIDA no deal — os dois botoes
      // ("Marcar como visitado" e "Re-marcar visita") caem aqui, entao cada
      // check-in gera a sua. Diferente do webhook/etapa abaixo, vale TAMBEM pra
      // CLIENTE/CHURN: aqui so' criamos uma atividade, o funil fica intocado.
      //
      // AWAITADO de proposito: o bottom sheet fecha logo apos o check-in e uma
      // Promise solta morria junto (mesma licao do agendamento). Erro NAO
      // quebra a visita — ela ja esta registrada no banco.
      if (client.id_hubspot) {
        try {
          await createVisitTask({
            id_hubspot: client.id_hubspot,
            lead_nome: client.empresa?.trim() || client.nome,
            visited_at: (raw.visited_at as string | undefined) ?? new Date().toISOString(),
            visita_numero: client.visit_count ?? null,
            vendedor_nome: profile?.full_name ?? null,
            owner_id: profile?.id_hubspot ?? null,
          });
        } catch (err) {
          console.warn('[HUBSPOT] criar Task de visita falhou:', err);
        }
      }

      if (isLead) {
        sendHubspotEvent({
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
          // Numero da visita (1 = primeira). Vem do contador que a RPC
          // incrementa; permite o HubSpot/relatorio ver revisitas.
          visita_numero: client.visit_count ?? null,
        }).catch((err) => console.warn('[WEBHOOK] marcar como visitado falhou:', err));
      }

      // Check-in move o lead pra etapa "Visita" automaticamente — mas SO se
      // ele ainda nao passou desse ponto do funil. Um lead em Negociacao que
      // recebe uma revisita nao pode regredir pra Visita.
      const etapaAtual = (client.etapa ?? '').trim().toUpperCase();
      const idxAtual = FUNNEL_STAGE_IDS.indexOf(
        STAGES.find(s => s.label.toUpperCase() === etapaAtual)?.id ?? '',
      );
      const idxVisita = FUNNEL_STAGE_IDS.indexOf(VISITA_STAGE_ID);
      // idxAtual === -1: etapa desconhecida/vazia (Backlog, Reciclagem, lead
      // sem etapa) — esses entram no funil pela Visita normalmente.
      //
      // isLead e' obrigatorio aqui pelo mesmo motivo do webhook acima: sem ele
      // o check-in num CLIENTE empurrava o deal de volta pra "Visita",
      // regredindo quem ja fechou (Tiny Cafe, Arena 262, Partei Steak & Beer e
      // Kitanda Gastrobar, entre 31/07 e 04/08 de 2026).
      const podeMover = isLead && idxAtual < idxVisita;

      if (podeMover && client.id_hubspot) {
        // Registra no historico local (mesma tabela do modal de etapa) e
        // dispara o change_stage. Fire-and-forget: o check-in ja sucedeu.
        (async () => {
          try {
            await supabase.from('client_stage_changes').insert({
              client_id: client.id,
              from_stage: client.etapa,
              to_stage: VISITA_STAGE_LABEL,
              to_stage_id: VISITA_STAGE_ID,
              // Marca que foi automatico (nao veio do modal do vendedor).
              sub_values: { origem: 'check_in_visita', visita_numero: client.visit_count ?? null },
              created_by: user?.id ?? null,
              created_by_name: profile?.full_name ?? null,
              created_by_email: user?.email ?? profile?.email ?? null,
            });
          } catch (err) {
            console.warn('[VISITA] historico de etapa falhou:', err);
          }

          try {
            await sendHubspotEvent({
              type: 'change_stage',
              id: client.id,
              id_hubspot: client.id_hubspot,
              stage_id: VISITA_STAGE_ID,
              stage_label: VISITA_STAGE_LABEL,
              sub_values: {},
              vendedor_id: profile?.id_hubspot ?? null,
              vendedor_nome: profile?.full_name ?? null,
            });
            // A etapa canonica volta do HubSpot via reconcileStageChange
            // (edge function) direto no banco; refetch pra UI acompanhar.
            queryClient.invalidateQueries({ queryKey: ['clients'] });
          } catch (err) {
            console.warn('[VISITA] change_stage automatico falhou:', err);
          }
        })();
      }

      return client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client_visits'] });
    },
  });

  return {
    clients: query.data ?? [],
    statuses: statusesQuery.data ?? [],
    // Viewer nao depende do visibilityQuery (fica desabilitado, logo "pending"
    // pra sempre); so o loading da query principal conta pra ele.
    isLoading: (query.isLoading && query.fetchStatus !== 'idle') || (!isViewer && visibilityQuery.isLoading),
    error: query.error,
    addClient,
    updateClient,
    deleteClient,
    markAsVisited,
  };
}
