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

/** Pede a permissão (tem de ser num toque), inscreve o aparelho e manda um aviso de teste. */
export async function ligarPush(): Promise<EstadoDoPush> {
  if (!temSuporte()) return ehIphone() && !instalado() ? 'precisa_instalar' : 'sem_suporte';
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'desligado';
  const reg = await navigator.serviceWorker.ready;
  const { publica } = await chamar('chave') as { publica: string };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(publica) as BufferSource });
  await chamar('inscrever', {
    endpoint: sub.endpoint, p256dh: paraB64u(sub.getKey('p256dh')), auth: paraB64u(sub.getKey('auth')),
    plataforma: ehIphone() ? 'iphone' : /android/i.test(navigator.userAgent) ? 'android' : 'computador',
  });
  await chamar('testar').catch(() => null); // o teste é conferência: falhar não desfaz a inscrição
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
export type PedidoDaFila = { acao: 'fila' | 'cartao' | 'ligar' | 'whatsapp'; deal: string | null; origem: string | null; n: number };

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
