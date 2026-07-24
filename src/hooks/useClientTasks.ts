import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { ClientTask } from '../types/client';

// Mesma defesa do useClientStageChanges: antes da migration 20260708 rodar a
// tabela/funcao nao existe — tratamos como "sem tarefas" em vez de quebrar.
const isMissingTableError = (err: any) =>
  err?.code === '42P01' ||
  err?.code === 'PGRST202' || // rpc nao encontrada (PostgREST)
  /relation .* does not exist|could not find the function/i.test(err?.message ?? '');

// Motor de regras roda no banco. O app dispara a geracao (idempotente) e le
// as tarefas resultantes. Fonte da verdade eh a tabela client_tasks — nada de
// regra no client. Isso mantem tudo consistente entre dispositivos e permite
// futuramente um cron gerar as mesmas tarefas sem o app aberto.
export function useClientTasks() {
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();

  // Dispara a geracao (rpc) uma vez quando o usuario autentica. Idempotente:
  // se ja existir tarefa pendente pro lead, so recalcula severidade. Se a
  // funcao ainda nao existe (migration nao rodou), ignora silenciosamente.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase.rpc('generate_client_tasks');
      if (cancelled) return;
      if (error && !isMissingTableError(error)) {
        console.warn('[TASKS] generate_client_tasks falhou:', error.message);
      }
      queryClient.invalidateQueries({ queryKey: ['client_tasks'] });
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, queryClient]);

  // Carrega todas as tarefas pendentes. A RLS ja libera SELECT pra todo
  // autenticado; o recorte "minhas" (por vendedor) e feito na tela.
  const query = useQuery<ClientTask[]>({
    queryKey: ['client_tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_tasks')
        .select('*')
        .eq('status', 'pendente')
        .order('severity', { ascending: false }) // D5 antes de D2
        .order('created_at', { ascending: true });
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return (data ?? []) as ClientTask[];
    },
    enabled: isAuthenticated,
  });

  const tasks = query.data ?? [];

  const resolveTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'concluida' | 'dispensada' }) => {
      const { error } = await supabase
        .from('client_tasks')
        .update({
          status,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id ?? null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_tasks'] }),
  });

  return {
    tasks,
    pendingCount: tasks.length,
    isLoading: query.isLoading,
    error: query.error,
    resolveTask,
  };
}
