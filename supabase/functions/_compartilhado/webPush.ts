// Web push sem biblioteca (17/10/2026): assinatura VAPID (ES256, RFC 8292) e cifra aes128gcm
// (RFC 8291), só com WebCrypto — roda igual no Deno da Edge e no Node do teste
// (src/utils/webPush.teste.ts decifra o que isto cifra, como o celular faria).

const te = new TextEncoder();

export const b64u = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ''; for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const deB64u = (s: string): Uint8Array => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
};
export const juntar = (...partes: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
};
export const hmac = async (chave: Uint8Array, dado: Uint8Array): Promise<Uint8Array> => {
  const k = await crypto.subtle.importKey('raw', chave as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dado as BufferSource));
};

/** O JWT do VAPID: ES256 sobre { aud: origem do endpoint, exp: 12 h, sub: contato }. */
export async function jwtVapid(aud: string, privada: CryptoKey, contato: string, agoraMs = Date.now()): Promise<string> {
  const cab = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(agoraMs / 1000) + 12 * 3600, sub: contato })));
  // o WebCrypto devolve a assinatura ECDSA já no formato do JWS (r||s, 64 bytes)
  const ass = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privada, te.encode(`${cab}.${corpo}`));
  return `${cab}.${corpo}.${b64u(ass)}`;
}

/** Cifra a mensagem para o aparelho (p256dh e auth da inscrição), num registro só de 4096. */
export async function cifrarWebPush(texto: string, p256dh: string, auth: string,
  fixo?: { sal: Uint8Array; efemero: CryptoKeyPair }): Promise<Uint8Array> {
  // `fixo` só existe para o teste reproduzir o vetor do Apêndice A da RFC 8291
  const uaPub = deB64u(p256dh);
  const segredoAuth = deB64u(auth);
  const efemero = fixo?.efemero ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', efemero.publicKey));
  const uaChave = await crypto.subtle.importKey('raw', uaPub as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaChave }, efemero.privateKey, 256));
  const prkChave = await hmac(segredoAuth, ecdh);
  const ikm = await hmac(prkChave, juntar(te.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const sal = fixo?.sal ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(sal, ikm);
  const cek = (await hmac(prk, juntar(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, juntar(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const claro = juntar(te.encode(texto), new Uint8Array([2])); // 0x02 = último registro, sem enchimento
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, k, claro as BufferSource));
  return juntar(sal, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, cifrado);
}
