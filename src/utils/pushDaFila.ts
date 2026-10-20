// Os avisos da fila no aparelho (handoff "Tarefas do App", P6, 17/10/2026): web push pela Edge
// push-fila. Android recebe com botões; iPhone só com o app instalado na tela de início (iOS 16.4+)
// e sem botões. O envio e as regras (4 por dia, 08:30/12:30/17:30/18:05, nada depois das 19h)
// moram na Edge; aqui só se pede a permissão e se inscreve o aparelho.
import { supabase } from '../integrations/supabase/client';

export type EstadoDoPush = 'sem_suporte' | 'precisa_instalar' | 'negado' | 'desligado' | 'ligado';

const temSuporte = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ehIphone = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalado = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

const deB64u = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
};
const paraB64u = (b: ArrayBuffer | null) => {
  if (!b) return '';
  let s = ''; for (const x of new Uint8Array(b)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function chamar(op: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('push-fila', { body: { op, ...extra } });
  if (error) {
    let msg = 'Não consegui falar com o servidor dos avisos.';
    try { const j = await (error as { context?: Response }).context?.clone().json(); if (j?.erro) msg = String(j.erro); } catch { /* corpo não-JSON */ }
    throw new Error(msg);
  }
  return data as Record<string, unknown>;
}

export async function estadoDoPush(): Promise<EstadoDoPush> {
  if (ehIphone() && !instalado()) return 'precisa_instalar';
  if (!temSuporte()) return 'sem_suporte';
  if (Notification.permission === 'denied') return 'negado';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'ligado' : 'desligado';
}

/* ATIVOU UMA VEZ, FICA (Julyan, 20/10/26: "ativou uma vez tinha que já ficar"). O pedido voltava em
   dois casos: (1) o aparelho com a permissão dada perdia a inscrição (o iPhone troca o endpoint) — aí
   o app se reinscreve sozinho, sem toque e sem aviso de teste; (2) a pessoa abria em outro aparelho
   ou no navegador fora do ícone — quem já tem avisos ativos na conta não é mais cobrado. */
export async function estadoDosAvisos(): Promise<EstadoDoPush> {
  const e = await estadoDoPush();
  if (e === 'ligado' || e === 'sem_suporte') return e;
  if (e === 'desligado' && Notification.permission === 'granted') {
    try { if (await ligarPush({ teste: false }) === 'ligado') return 'ligado'; } catch { /* segue para a conta */ }
  }
  try {
    const { data } = await supabase.from('push_inscricoes').select('id').lt('falhas', 3).limit(1);
    if (data?.length) return 'ligado';
  } catch { /* sem leitura: fica o estado do aparelho */ }
  return e;
}

/** Pede a permissão (tem de ser num toque), inscreve o aparelho e manda um aviso de teste. */
export async function ligarPush({ teste = true }: { teste?: boolean } = {}): Promise<EstadoDoPush> {
  if (!temSuporte()) return ehIphone() && !instalado() ? 'precisa_instalar' : 'sem_suporte';
  // já permitido: não pede de novo (a reinscrição sozinha acontece fora de um toque)
  const permissao = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'desligado';
  // sem o service worker ativo o ready nunca resolve, e o botão ficava em "Ligando…" para sempre
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, nao) => setTimeout(() => nao(new Error('O app ainda está se atualizando no celular. Feche e abra o app e tente de novo.')), 8000))]);
  const { publica } = await chamar('chave') as { publica: string };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(publica) as BufferSource });
  await chamar('inscrever', {
    endpoint: sub.endpoint, p256dh: paraB64u(sub.getKey('p256dh')), auth: paraB64u(sub.getKey('auth')),
    plataforma: ehIphone() ? 'iphone' : /android/i.test(navigator.userAgent) ? 'android' : 'computador',
  });
  if (teste) await chamar('testar').catch(() => null); // o teste é conferência: falhar não desfaz a inscrição
  return 'ligado';
}

export async function desligarPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await chamar('desinscrever', { endpoint: sub.endpoint }).catch(() => null);
  await sub.unsubscribe().catch(() => false);
}

/* O QUE O AVISO PEDE AO APP: o service worker abre (ou foca) o app com ?fila=<acao>&deal=<id>.
   acao: 'fila' (abre Tarefas no topo), 'cartao' (abre o cartão), 'ligar' e 'whatsapp' (abrem o
   cartão pronto: o navegador só deixa discar depois de um toque na tela). */
export type PedidoDaFila = { acao: 'fila' | 'cartao' | 'ligar' | 'whatsapp'; deal: string | null; origem: string | null; n: number; rotulo?: string | null; discouEm?: number | null; canal?: 'ligacao' | 'whatsapp' | null };

export function lerPedidoDaUrl(href: string, n: number): PedidoDaFila | null {
  try {
    const u = new URL(href);
    const acao = u.searchParams.get('fila');
    if (!acao || !['fila', 'cartao', 'ligar', 'whatsapp'].includes(acao)) return null;
    return { acao: acao as PedidoDaFila['acao'], deal: u.searchParams.get('deal'), origem: u.searchParams.get('origem'), n };
  } catch { return null; }
}

/** Tira ?fila= da barra de endereço depois de usado (recarregar não repete o pedido). */
export function limparPedidoDaUrl() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('fila')) return;
    ['fila', 'deal', 'origem'].forEach((k) => u.searchParams.delete(k));
    window.history.replaceState(window.history.state, '', u.pathname + (u.search ? u.search : '') + u.hash);
  } catch { /* sem history */ }
}
