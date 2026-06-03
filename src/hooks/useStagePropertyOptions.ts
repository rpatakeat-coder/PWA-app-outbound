import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

export type StageOptionRow = {
  property_name: string;
  property_label: string;
  value: string;
  sort_order: number;
};

export type GroupedStageOptions = Record<
  string,
  { label: string; options: string[] }
>;

const QUERY_KEY = ['stage_property_options'] as const;

export function useStagePropertyOptions() {
  const queryClient = useQueryClient();

  const query = useQuery<GroupedStageOptions>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_property_options')
        .select('property_name, property_label, value, sort_order')
        .order('property_name')
        .order('sort_order');
      if (error) throw error;

      const grouped: GroupedStageOptions = {};
      for (const row of (data ?? []) as StageOptionRow[]) {
        if (!grouped[row.property_name]) {
          grouped[row.property_name] = {
            label: row.property_label,
            options: [],
          };
        }
        grouped[row.property_name].options.push(row.value);
      }
      return grouped;
    },
    // 5 min staleTime — admin atualiza via curl raramente, sem ficar
    // batendo no banco a cada abertura do modal.
    staleTime: 5 * 60_000,
  });

  // Realtime: quando alguém roda a RPC sync, invalida o cache pra todo
  // mundo pegar a config nova sem precisar fechar/abrir o app.
  useEffect(() => {
    const channel = supabase
      .channel('stage_property_options_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_property_options' },
        () => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
