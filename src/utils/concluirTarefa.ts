// Concluir uma tarefa do HubSpot pelo app (aba Tarefas e Liguei), com Desfazer.
//
// O Desfazer não reabre nada no HubSpot: a gravação SÓ sai depois dos 5 s do
// toast. Desfeito dentro da janela, nada foi escrito — nem no HubSpot, nem na
// contagem do Cockpit (tarefa COMPLETED conta como toque e, se for visita,
// como visita feita: concluir e reabrir em seguida deixaria rastro nos dois).
//
// Sem sinal, a conclusão entra na fila offline (tipo 'tarefa') e sobe quando o
// sinal volta. Se a pessoa fechar o app dentro da janela, a conclusão vai para
// a fila na hora — não se perde.
import { supabase } from '../integrations/supabase/client';
import { Toast } from '../components/Toast';
import { ehErroDeRede, enfileirar, novoAcaoId } from './filaOffline';
import { negocioAcao, RecusaDoServidor } from './negocioAcao';

export type PedidoConclusao = {
  taskId: string;
  /** Liguei: registra a ligação como nota no negócio, junto com a conclusão. */
  nota?: { dealId: string; texto: string } | null;
};

export const JANELA_DESFAZER_MS = 5000;

/** O envio de verdade. É também o executor da fila offline. */
export async function enviarConclusao(p: PedidoConclusao): Promise<void> {
  const { data, error } = await supabase.functions.invoke('hubspot-sync', {
    body: { type: 'update_task', engagement_id: p.taskId, concluir: true },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === 'number') throw new RecusaDoServidor(error.message, ctx.status);
    throw error;
  }
  if ((data as { error?: string } | null)?.error) {
    throw new RecusaDoServidor(String((data as { detail?: string; error: string }).detail ?? (data as { error: string }).error), 502);
  }
  if (p.nota?.dealId) {
    // A nota é complemento: a tarefa já foi concluída. Negócio que não é da
    // pessoa (403) fica sem a nota, sem desfazer a conclusão.
    try {
      await negocioAcao({ op: 'nota', dealId: p.nota.dealId, texto: p.nota.texto });
    } catch (e) {
      if (ehErroDeRede(e)) throw e;
    }
  }
}

type Pendente = { pedido: PedidoConclusao; rotulo: string; timer: ReturnType<typeof setTimeout> };
const pendentes = new Map<string, Pendente>();

async function mandarParaFila(pedido: PedidoConclusao, rotulo: string) {
  await enfileirar({ acaoId: `tarefa-${pedido.taskId}-${novoAcaoId()}`, tipo: 'tarefa', rotulo, payload: pedido as unknown as Record<string, unknown> });
}

async function efetivar(pedido: PedidoConclusao, rotulo: string, aoVoltar: () => void, aoGravar: () => void) {
  try {
    await enviarConclusao(pedido);
    aoGravar();
  } catch (e) {
    if (ehErroDeRede(e) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      await mandarParaFila(pedido, rotulo);
      Toast.mostrar('Sem sinal · conclusão salva no celular, na fila', 'fila');
      return;
    }
    aoVoltar();
    Toast.mostrar(`Não consegui concluir no HubSpot: ${(e as Error).message}`, 'erro');
  }
}

/**
 * Marca como feita já na tela e mostra o toast com Desfazer. A escrita sai
 * no fim da janela. `aoVoltar` devolve a tarefa à lista (desfeito ou recusado).
 */
export function concluirComDesfazer(opts: {
  pedido: PedidoConclusao;
  rotulo: string;
  textoToast: string;
  aoVoltar: () => void;
  aoGravar: () => void;
}) {
  const { pedido, rotulo, textoToast, aoVoltar, aoGravar } = opts;
  if (pendentes.has(pedido.taskId)) return;
  const timer = setTimeout(() => {
    pendentes.delete(pedido.taskId);
    void efetivar(pedido, rotulo, aoVoltar, aoGravar);
  }, JANELA_DESFAZER_MS);
  pendentes.set(pedido.taskId, { pedido, rotulo, timer });
  Toast.mostrar(textoToast, 'ok', {
    rotulo: 'Desfazer',
    onPress: () => {
      const p = pendentes.get(pedido.taskId);
      if (!p) return; // a janela já fechou: foi gravado
      clearTimeout(p.timer);
      pendentes.delete(pedido.taskId);
      aoVoltar();
    },
  });
}

// Fechou o app dentro da janela: a conclusão vai para a fila (IndexedDB) na
// hora, e sobe na próxima abertura.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const [id, p] of pendentes) {
      clearTimeout(p.timer);
      pendentes.delete(id);
      void mandarParaFila(p.pedido, p.rotulo);
    }
  });
}
