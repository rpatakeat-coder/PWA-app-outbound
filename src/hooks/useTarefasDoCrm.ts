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
 * TODAS as tarefas em aberto da pessoa, sem recorte de data.
 *
 * Até 14/09/2026 pedia uma janela (7 dias atrás, 14 à frente) e o vendedor via
 * 35 de 78 — as vencidas mais antigas, que são as mais urgentes, ficavam de
 * fora sem ninguém saber. Quem decide o que mostrar é a tela, que agrupa por
 * dia e recolhe o passado; a busca traz tudo.
 */
export function useTarefasDoCrm(enabled: boolean) {
  const { profile } = useAuth();
  const ownerId = (profile as { id_hubspot?: string | null } | null)?.id_hubspot ?? null;

  const query = useQuery<ResultadoTarefasDoCrm>({
    queryKey: ['tarefas_crm', ownerId],
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

      // Sem `de`/`ate`: a rota entende a ausência como "tudo em aberto".
      const { data, error } = await supabase.functions.invoke('hubspot-sync', {
        body: { type: 'list_tasks', owner_id: ownerId },
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

      // Os negócios que NÃO estão em `clients` — nasceram no CRM e nunca
      // viraram pin. Sem isto o vendedor via seis follow ups idênticos
      // ("Identificar o nome e o horário do decisor") sem saber de qual
      // cliente era nenhum: o assunto do follow up é a AÇÃO, não o cliente, e
      // o corpo só tem o marcador.
      const faltando = dealIds.filter((id) => !porDeal.has(id));
      const nomesDoCrm: Record<string, string> = {};
      if (faltando.length > 0) {
        try {
          const { data: resp } = await supabase.functions.invoke('hubspot-sync', {
            body: { type: 'deal_names', ids: faltando },
          });
          Object.assign(nomesDoCrm, (resp?.nomes ?? {}) as Record<string, string>);
        } catch {
          // Falhar aqui só custa o nome; a tarefa continua na tela com a data
          // e a ação, que é o mínimo para a pessoa se guiar.
        }
      }

      return {
        total: (data?.total as number) ?? tarefas.length,
        semMedicao: null,
        tarefas: tarefas.map((t) => {
          const achado = t.marcador ? porDeal.get(t.marcador.dealId) : undefined;
          const doCrm = t.marcador ? nomesDoCrm[t.marcador.dealId] : undefined;
          return {
            ...t,
            clientId: achado?.id ?? null,
            // Ordem: o nome do app, depois o do CRM, depois o que dá pra tirar
            // do assunto (vale para visita, que vem "Visita - <cliente>").
            nomeDoCliente: achado?.nome ?? doCrm ?? clienteDoAssunto(t.assunto),
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
