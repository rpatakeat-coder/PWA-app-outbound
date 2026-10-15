// Foto da visita (handoff App de Campo v4.1, decisão 16). Comprime no celular
// (≤ 1600 px no maior lado, JPEG ~300 KB), sobe para o bucket privado
// fotos-visita e registra em fotos_visita (0114), que o Cockpit lê para a
// galeria por executivo. Só web (PWA): câmera pelo <input capture>.
import { supabase } from '../integrations/supabase/client';

const LADO_MAX = 1600;
const ALVO_BYTES = 320 * 1024;

/** Abre a câmera (ou a galeria) e devolve o arquivo escolhido. */
export function escolherFoto(): Promise<File | null> {
  return new Promise((resolve) => {
    // Cancelar a câmera tem de devolver null: sem isso a promessa nunca se
    // resolve, e o check-in com foto obrigatória fica travado no Cheguei.
    // 'cancel' existe no Chrome 113+ e no Safari 16.4+; a volta do foco à
    // página é a reserva para os mais antigos.
    let feito = false;
    const fim = (f: File | null) => {
      if (feito) return;
      feito = true;
      window.removeEventListener('focus', aoVoltar);
      resolve(f);
    };
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = () => fim(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => fim(null));
    const aoVoltar = () => setTimeout(() => { if (!input.files?.length) fim(null); }, 1500);
    window.addEventListener('focus', aoVoltar);
    input.click();
  });
}

function carregar(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('não deu para ler a foto')); };
    img.src = url;
  });
}

/** Reduz para ≤ 1600 px e baixa a qualidade até ~300 KB. */
export async function comprimir(file: File): Promise<Blob> {
  const img = await carregar(file);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * escala);
  const h = Math.round(img.naturalHeight * escala);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  let q = 0.82;
  let blob: Blob | null = null;
  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q));
    if (!blob || blob.size <= ALVO_BYTES) break;
    q -= 0.12;
  }
  if (!blob) throw new Error('não deu para comprimir a foto');
  return blob;
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Quando a foto foi TIRADA (ISO), se for plausível: no passado (5 min de folga de relógio) e
 *  há no máximo 7 dias. Fora disso, null e vale o default do banco (now()). */
function horaDaFoto(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const agora = Date.now();
  if (t > agora + 5 * 60000 || t < agora - 7 * 86400000) return null;
  return new Date(t).toISOString();
}

/** Sobe a foto e registra a linha. Devolve o caminho no bucket.
 *  `tiradaEm`: a hora do toque no Cheguei. A foto que sobe pela fila offline chega horas depois,
 *  e a regra da prova (0151: foto até visited_at + 2 h) a recusava pela hora do upload: o
 *  criado_em passa a ser a hora em que ela foi tirada. O caminho no bucket continua com a hora
 *  do upload (único; uma nova tentativa não colide com um upload que já foi). */
export async function enviarFoto(p: {
  blob: Blob; ownerId: string | null; dealId: string | null; clientId: string; lat: number | null; lng: number | null;
  tiradaEm?: string | null;
}): Promise<string> {
  const criadoEm = horaDaFoto(p.tiradaEm);
  const agora = new Date(Date.now() - 3 * 3600000); // Brasília
  const dia = agora.toISOString().slice(0, 10);
  const hora = `${doisDigitos(agora.getUTCHours())}${doisDigitos(agora.getUTCMinutes())}${doisDigitos(agora.getUTCSeconds())}`;
  const caminho = `${p.ownerId ?? 'sem-dono'}/${dia}/${p.dealId ?? p.clientId}-${hora}.jpg`;
  const up = await supabase.storage.from('fotos-visita').upload(caminho, p.blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from('fotos_visita').insert({
    caminho, client_id: p.clientId, deal_id: p.dealId, owner_id: p.ownerId, lat: p.lat, lng: p.lng,
    ...(criadoEm ? { criado_em: criadoEm } : {}),
  });
  if (error) throw error;
  return caminho;
}
