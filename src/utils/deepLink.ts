// Deep link do mapa (Cockpit v5, contrato Mapa ⇄ Cockpit, 28/09/2026).
//
// O Cockpit oferece "Abrir no mapa" em todo negócio. O link é o do contrato:
//   /mapa?pino=<negocio_id>&cartao=aberto
//   /mapa?rua=<texto>
//   /mapa?lente=meu-dia            (e as outras lentes pelo nome do handoff)
// `pino` aceita o id do negócio no HubSpot (só dígitos) ou o id do pino (uuid).
// Depois de lido, o link sai da barra de endereço: recarregar não reabre o cartão.
import type { Lente } from './lentes';

export type DeepLinkMapa = {
  pino?: { dealId?: string; clientId?: string };
  cartaoAberto: boolean;
  rua?: string;
  lente?: Lente;
};

const LENTES: Record<string, Lente> = {
  'meu-dia': 'dia', dia: 'dia',
  carteira: 'carteira',
  'contas-alvo': 'alvo', alvo: 'alvo',
  reconquista: 'rec', rec: 'rec',
  'em-queda': 'queda', queda: 'queda',
  'sem-dono': 'semdono', semdono: 'semdono',
  calor: 'calor',
};
// + as do link antigo do Cockpit (pwaLinkDeAcao: ?acao=ligar&dealId=...), que o app
// ignorava: agora o dealId abre o cartão do negócio, onde Ligar/WhatsApp/Ir estão.
const CHAVES = ['pino', 'cartao', 'rua', 'lente', 'dia', 'pessoa', 'semana',
  'acao', 'dealId', 'telefone', 'lat', 'lng', 'cliente', 'quando', 'ownerId', 'origem'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lerDeepLink(search: string): DeepLinkMapa | null {
  const q = new URLSearchParams(search || '');
  const pinoBruto = (q.get('pino') || q.get('dealId') || '').trim();
  const rua = (q.get('rua') || '').trim().slice(0, 120);
  const lenteBruta = (q.get('lente') || '').trim().toLowerCase();
  const out: DeepLinkMapa = { cartaoAberto: false };
  if (/^\d{1,20}$/.test(pinoBruto)) out.pino = { dealId: pinoBruto };
  else if (UUID.test(pinoBruto)) out.pino = { clientId: pinoBruto.toLowerCase() };
  if (out.pino) out.cartaoAberto = (q.get('cartao') || 'aberto') !== 'fechado';
  if (rua) out.rua = rua;
  if (LENTES[lenteBruta]) out.lente = LENTES[lenteBruta];
  return out.pino || out.rua || out.lente ? out : null;
}

// A barra de endereço sem as chaves do deep link (as outras, como ?mapa=, ficam).
export function semDeepLink(pathname: string, search: string, hash: string): string {
  const q = new URLSearchParams(search || '');
  CHAVES.forEach((k) => q.delete(k));
  const resto = q.toString();
  const caminho = pathname === '/mapa' ? '/' : pathname;
  return caminho + (resto ? '?' + resto : '') + (hash || '');
}
