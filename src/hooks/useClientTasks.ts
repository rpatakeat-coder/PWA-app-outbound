import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { ClientTask } from '../types/client';

// Mesma defesa do useClientStageChanges: antes da migration
// 0026_client_tasks.sql rodar a
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

  // A GERAÇÃO É DO BANCO (auditoria de velocidade, 28/09/2026): o app chamava
  // generate_client_tasks a cada abertura, e ela reescreve toda tarefa pendente (716 mil
  // updates para 684 linhas). O cron 7 já roda a cada 30 min; aqui o app só lê.

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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['client_tasks'] }); },
  });

  return {
    tasks,
    pendingCount: tasks.length,
    isLoading: query.isLoading,
    error: query.error,
    resolveTask,
  };
}
