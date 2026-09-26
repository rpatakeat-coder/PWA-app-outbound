// Negócios do executivo no HubSpot que casam com a busca do mapa (handoff
// v4.1 §6.10: "inclui negócios que ainda não estão no mapa").
//
// O mapa só conhece o que tem pino em `clients`. Negócio criado no CRM sem
// endereço não aparecia em busca nenhuma, e o executivo abria o HubSpot para
// achar. Aqui cada negócio volta junto com o pino que já tem, quando tem:
// com coordenada, a folha abre o cartão; sem, oferece Posicionar.
//
// Espera 450 ms depois da última tecla: sem isso, cada letra seria uma ida ao
// HubSpot, que tem cota por segundo.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { CLIENT_LIST_COLUMNS } from './useClients';
import type { Client } from '../types/client';

export type NegocioAchado = { id: string; nome: string; etapa: string | null; cliente: Client | null };

export function useBuscaNegocios(termo: string, ownerId: string | null, ativo: boolean) {
  const [estavel, setEstavel] = useState(termo.trim());
  useEffect(() => {
    const id = setTimeout(() => setEstavel(termo.trim()), 450);
    return () => clearTimeout(id);
  }, [termo]);

  return useQuery<NegocioAchado[]>({
    queryKey: ['busca-negocios', ownerId, estavel],
    enabled: ativo && !!ownerId && estavel.length >= 3,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('hubspot-sync', {
        body: { type: 'search_deals', owner_id: ownerId, q: estavel },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.detail ?? data.error);
      const negocios = (data?.negocios ?? []) as { id: string; nome: string; etapa: string | null }[];
      if (!negocios.length) return [];

      // Uma consulta para todos: qual deles já tem pino no app.
      const { data: linhas } = await supabase
        .from('clients')
        .select(CLIENT_LIST_COLUMNS)
        .in('id_hubspot', negocios.map((n) => n.id));
      const porDeal = new Map<string, Client>();
      for (const c of (linhas ?? []) as unknown as Client[]) {
        if (c.id_hubspot) porDeal.set(String(c.id_hubspot), c);
      }
      return negocios.map((n) => ({ ...n, cliente: porDeal.get(n.id) ?? null }));
    },
  });
}
