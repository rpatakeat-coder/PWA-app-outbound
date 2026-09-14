// As tarefas do vendedor que vivem no HubSpot, trazidas pro app.
//
// O Cockpit de gestão põe visita no planejamento da semana e follow up do
// funil como Task no CRM. O vendedor nunca as via: a aba Tarefas do app lê
// `client_tasks`, que é outra coisa (regra gerada no banco). Em 14/09/2026
// havia 78 pendentes só para um executivo.
//
// SEM `id_hubspot` NÃO HÁ COMO SABER, e isso não é o mesmo que zero. A tarefa
// é achada por `hubspot_owner_id`; quem está sem esse id no perfil não tem
// como ser consultado. Dizer "nenhuma tarefa" ali seria afirmar que não há
// trabalho esperando — foi exatamente o defeito que a onda 1 corrigiu no
// cockpit, por outro caminho.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import { interpretarTarefa, clienteDoAssunto, type TarefaDoCrm } from '../utils/tarefasDoCrm';

export type TarefaDoCrmNaTela = TarefaDoCrm & {
  /** Cliente no app, quando o marcador (ou o assunto) permitiu achar. */
  clientId: string | null;
  nomeDoCliente: string | null;
};

export type ResultadoTarefasDoCrm = {
  tarefas: TarefaDoCrmNaTela[];
  /** Quantas o HubSpot disse existir — pode ser maior que a página trazida. */
  total: number;
  /** Motivo pelo qual não dá para medir. Null = medimos. */
  semMedicao: string | null;
};

const VAZIO = (semMedicao: string | null = null): ResultadoTarefasDoCrm => ({
  tarefas: [],
  total: 0,
  semMedicao,
});

/**
 * @param diasAFrente quantos dias adiante olhar. O passado entra inteiro do dia
 *   de hoje para trás em 7 dias: tarefa vencida ontem é a mais urgente que
 *   existe, e escondê-la seria esconder atraso.
 */
export function useTarefasDoCrm(enabled: boolean, diasAFrente = 14) {
  const { profile } = useAuth();
  const ownerId = (profile as { id_hubspot?: string | null } | null)?.id_hubspot ?? null;

  const query = useQuery<ResultadoTarefasDoCrm>({
    queryKey: ['tarefas_crm', ownerId, diasAFrente],
    enabled: enabled && !!profile,
    staleTime: 3 * 60_000,
    queryFn: async () => {
      if (!ownerId) {
        // A mensagem muda com o papel: mandar o gestor "pedir para a gestão
        // corrigir" é mandá-lo falar consigo mesmo, e quem lê uma instrução
        // que não se aplica passa a ignorar as que se aplicam.
        const ehGestor = (profile as { role?: string } | null)?.role === 'gestor';
        return VAZIO(
          ehGestor
            ? 'Sua conta não tem carteira no HubSpot, então não há tarefas suas aqui. A visão do time fica no cockpit de gestão.'
            : 'Seu usuário está sem ID do HubSpot, então não dá para buscar as tarefas do CRM. Peça para a gestão corrigir em Acessos.',
        );
      }

      const agora = new Date();
      const de = new Date(agora);
      de.setDate(de.getDate() - 7);
      const ate = new Date(agora);
      ate.setDate(ate.getDate() + diasAFrente);

      const { data, error } = await supabase.functions.invoke('hubspot-sync', {
        body: {
          type: 'list_tasks',
          owner_id: ownerId,
          de: de.toISOString(),
          ate: ate.toISOString(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.detail ?? data.error);

      const brutas = (data?.tarefas ?? []) as Array<{
        id: string;
        assunto: string;
        corpo: string;
        vence_em: string | null;
      }>;
      const tarefas = brutas.map(interpretarTarefa);

      // Liga cada tarefa ao lead no app pelo id do negócio. Uma consulta só
      // para todas — uma por tarefa seriam 78 idas ao banco.
      const dealIds = [...new Set(tarefas.map((t) => t.marcador?.dealId).filter(Boolean))] as string[];
      const porDeal = new Map<string, { id: string; nome: string }>();
      if (dealIds.length > 0) {
        const { data: linhas } = await supabase
          .from('clients')
          .select('id, nome, empresa, id_hubspot')
          .in('id_hubspot', dealIds);
        for (const l of linhas ?? []) {
          porDeal.set(String(l.id_hubspot), {
            id: l.id as string,
            nome: ((l.empresa as string | null)?.trim() || (l.nome as string)) ?? '',
          });
        }
      }

      return {
        total: (data?.total as number) ?? tarefas.length,
        semMedicao: null,
        tarefas: tarefas.map((t) => {
          const achado = t.marcador ? porDeal.get(t.marcador.dealId) : undefined;
          return {
            ...t,
            clientId: achado?.id ?? null,
            // Sem o lead no app, o nome do assunto ainda serve pra pessoa saber
            // de quem se trata — só não dá pra abrir no mapa.
            nomeDoCliente: achado?.nome ?? clienteDoAssunto(t.assunto),
          };
        }),
      };
    },
  });

  return {
    ...(query.data ?? VAZIO()),
    carregando: query.isLoading,
    erro: query.error ? ((query.error as Error).message ?? 'falhou') : null,
    recarregar: query.refetch,
  };
}
