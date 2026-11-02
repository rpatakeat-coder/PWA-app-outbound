// Os dados da fila do dinheiro (auditoria 02/11/26): o tipo do que o servidor devolve, a busca,
// o cache no aparelho e o envio offline da aba ("aba-tarefas"). Saíram de FilaTarefasScreen para
// a tela poder carregar sob demanda (React.lazy): o App, a Agenda, a Lista do computador e o
// Limpar funil leem a fila na abertura, e o executor da fila offline tem de estar registrado
// mesmo que a aba Hoje nunca abra.
import { supabase } from '../integrations/supabase/client';
import { gravarContato, type Contato } from './contatoDeCampo';
import { enfileirar, registrarExecutor } from './filaOffline';
import { negocioAcao } from './negocioAcao';
import { marcarGravada } from './filaFeitas';
import type { ItemProximo as ItemProximoServidor } from '../../supabase/functions/_compartilhado/filaDoDinheiro';

// ---- o que o servidor devolve ---------------------------------------------------------
export type CardDaFila = {
  dealId: string; clientId: string | null; grupo: 'agora' | 'proteger' | 'destravar' | 'reativar';
  motivo: string; porque: string; verbo: 'Ligar' | 'Visitar' | 'WhatsApp' | 'Registrar';
  pessoa: string | null; papel: string | null; negocio: string; etapaId: string; temperatura: number | null;
  mrr: number | null; ultimoContato: string | null; ultimoContatoTexto: string; contatos: number;
  prazo: string | null; prazoTexto: string; venceu: boolean; agendaHoje: string | null; temTelefone: boolean;
  telefone: string | null; tarefaId: string | null; presencial: boolean; lat: number | null; lng: number | null;
  assunto?: string | null; diasNaEtapa?: number | null; horaPrazo?: string | null;
  titulo: string;
  /** Por que o título usa o negócio (A2): "contato no CRM: 'Julyan' · igual ao dono da conta". */
  tituloPorque?: string | null;
};
/** A próxima tarefa de cada negócio sem nada hoje (montarProximos): os outros dias da fileira. */
export type ItemProximo = ItemProximoServidor & { titulo: string; telefone: string | null };
export type RespostaFila = {
  itens: CardDaFila[]; grupos: Array<{ id: CardDaFila['grupo']; rotulo: string }>; mrrEmJogo: number;
  hoje: string; feriados: string[]; semMedicao?: string; proximos?: ItemProximo[];
};

const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

/* SEM INTERESSE E ADIAR PELA FILA (auditoria 14/10/26). Os dois esperam 5 s de Desfazer antes
   de escrever. Antes: (a) fechar o app dentro da janela perdia a escrita (o Perdido nunca ia e a
   linha de fila_feitas ficava 'pendente' para sempre); (b) sem sinal, o Perdido entrava na fila
   como 'negocio' e, ao subir, ninguém marcava a linha como gravada — o Desfazer tardio dizia
   "ainda está subindo" para sempre. Agora o envio é um só (enviarDaAba), é o executor do tipo
   'aba-tarefas' da fila offline e marca a linha gravada depois que o Perdido sobe; e quem está
   na janela vai para a fila no pagehide, como o concluirComDesfazer. Registrado no carregamento
   do módulo (o App.tsx importa este módulo de forma estática): sobe mesmo se a aba não abrir. */
export type PedidoDaAba =
  | { op: 'perdido'; corpo: Record<string, unknown>; feitaAcaoId: string; contato: Contato }
  | { op: 'adiar'; tarefaId: string | null; amanha: string; corpo: Record<string, unknown> | null };

export async function enviarDaAba(p: PedidoDaAba): Promise<void> {
  if (p.op === 'perdido') {
    await negocioAcao(p.corpo);
    void gravarContato(p.contato);
    await marcarGravada(p.feitaAcaoId, {});
    return;
  }
  if (p.tarefaId) {
    const { data, error } = await supabase.functions.invoke('hubspot-sync', { body: { type: 'update_task', engagement_id: p.tarefaId, due_at: `${p.amanha}T12:00:00-03:00` } });
    if (error) throw error;
    // a hubspot-sync também recusa com 200 e { error } (o mesmo cuidado do concluirTarefa)
    const d = data as { error?: string; detail?: string } | null;
    if (d?.error) throw new Error(String(d.detail ?? d.error));
  } else if (p.corpo) {
    await negocioAcao(p.corpo);
  }
}

registrarExecutor('aba-tarefas', (item) => enviarDaAba(item.payload as unknown as PedidoDaAba));

export const naJanela = new Map<string, { timer: ReturnType<typeof setTimeout>; rotulo: string; pedido: PedidoDaAba }>();
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const [acaoId, j] of naJanela) {
      clearTimeout(j.timer);
      naJanela.delete(acaoId);
      void enfileirar({ acaoId, tipo: 'aba-tarefas', rotulo: j.rotulo, payload: j.pedido as unknown as Record<string, unknown> });
    }
  });
}

// A ÚLTIMA FILA FICA NO APARELHO (auditoria de velocidade, 05/10/26): a Edge leva ~2 s, e ao
// abrir o app o selo e a aba esperavam esse tempo em branco — sem sinal, para sempre. Agora a
// última resposta mostra na hora e a busca nova corre por trás (initialDataUpdatedAt 0 a marca
// como velha: o React Query busca sempre ao abrir, mesmo que a guardada tenha 10 s — a tarefa
// pode ter sido concluída no HubSpot). Só vale para a mesma pessoa e o mesmo dia: a fila
// depende do dia, e outro login no mesmo aparelho não vê a carteira de quem saiu.
const CHAVE_FILA = 'takeat-fila-tarefas';
function donoDaSessao(): string | null {
  try {
    const k = Object.keys(window.localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    return k ? JSON.parse(window.localStorage.getItem(k) ?? 'null')?.user?.id ?? null : null;
  } catch { return null; }
}
function filaGuardada(): RespostaFila | undefined {
  try {
    const g = JSON.parse(window.localStorage.getItem(CHAVE_FILA) ?? 'null');
    if (!g?.data || !g.uid || g.uid !== donoDaSessao() || g.data.hoje !== hojeBRT()) return undefined;
    return g.data as RespostaFila;
  } catch { return undefined; }
}

/** A busca da fila. Exportada: o App lê o mesmo cache para o cabeçalho e o selo da aba. */
export async function buscarFila(): Promise<RespostaFila> {
  const { data, error } = await supabase.functions.invoke('fila-tarefas', { body: {} });
  if (error) throw error;
  const uid = donoDaSessao();
  if (uid) { try { window.localStorage.setItem(CHAVE_FILA, JSON.stringify({ uid, em: Date.now(), data })); } catch { /* sem armazenamento: só não guarda */ } }
  return data as RespostaFila;
}
/** As opções da fila, as mesmas nos três lugares que a leem (App, Tarefas, Lista do computador). */
export function opcoesDaFila() {
  return { queryKey: ['fila_tarefas'], queryFn: buscarFila, staleTime: 60_000, initialData: filaGuardada(), initialDataUpdatedAt: 0 };
}
