// Teste do web push sem biblioteca (supabase/functions/_compartilhado/webPush.ts).
// Roda: npx tsx src/utils/webPush.teste.ts
//
// Um erro na cifra não dá erro em lugar nenhum: o serviço de push aceita (201) e o celular
// descarta a mensagem em silêncio. Por isso o teste faz o papel do CELULAR e decifra o que
// a Edge cifra, passo a passo pela RFC 8291 — e confere a assinatura do VAPID com a chave pública.
import { b64u, cifrarWebPush, deB64u, hmac, juntar, jwtVapid } from '../../supabase/functions/_compartilhado/webPush';

let falhas = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };
const te = new TextEncoder(), td = new TextDecoder();

async function decifrarComoOCelular(corpo: Uint8Array, ua: CryptoKeyPair, segredoAuth: Uint8Array): Promise<string> {
  const sal = corpo.slice(0, 16);
  const rs = (corpo[16] << 24) | (corpo[17] << 16) | (corpo[18] << 8) | corpo[19];
  const idlen = corpo[20];
  const asPub = corpo.slice(21, 21 + idlen);
  const cifrado = corpo.slice(21 + idlen);
  if (rs !== 4096) throw new Error('rs ' + rs);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const asChave = await crypto.subtle.importKey('raw', asPub as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asChave }, ua.privateKey, 256));
  const prkChave = await hmac(segredoAuth, ecdh);
  const ikm = await hmac(prkChave, juntar(te.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(sal, ikm);
  const cek = (await hmac(prk, juntar(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, juntar(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['decrypt']);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, k, cifrado as BufferSource));
  if (claro[claro.length - 1] !== 2) throw new Error('delimitador do último registro ausente');
  return td.decode(claro.slice(0, -1));
}

(async () => {
  // o "celular": par ECDH P-256 e o segredo de 16 bytes da inscrição
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const segredo = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = b64u(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = b64u(segredo);

  const msg = JSON.stringify({ titulo: 'Point Piratininga está esfriando', texto: 'Venceu seg 13/10, há 3 dias. Ação: cobrar.' });
  const corpo = await cifrarWebPush(msg, p256dh, auth);
  ok(corpo.length > 86 && corpo.length < 4096, 'o corpo cifrado cabe num registro (' + corpo.length + ' bytes)');
  ok((await decifrarComoOCelular(corpo, ua, segredo)) === msg, 'o celular decifra exatamente a mensagem, com acentos');
  const outro = await cifrarWebPush(msg, p256dh, auth);
  ok(b64u(outro) !== b64u(corpo), 'duas cifras da mesma mensagem saem diferentes (sal e chave efêmera novos)');
  const segredoErrado = crypto.getRandomValues(new Uint8Array(16));
  let recusou = false;
  try { await decifrarComoOCelular(corpo, ua, segredoErrado); } catch { recusou = true; }
  ok(recusou, 'com o segredo errado o celular não decifra (a cifra depende do auth da inscrição)');
  ok(deB64u(b64u(segredo)).every((x, i) => x === segredo[i]), 'base64url vai e volta');

  // O VETOR OFICIAL (RFC 8291, Apêndice A): mesmas chaves e mesmo sal, a saída tem de ser a publicada.
  // Isto pega o erro simétrico — cifra e decifra escritas pela mesma pessoa erram juntas.
  {
    const jwkDe = (pub: string, d: string): JsonWebKey => { const r = deB64u(pub); return { kty: 'EC', crv: 'P-256', x: b64u(r.slice(1, 33)), y: b64u(r.slice(33, 65)), d, ext: true }; };
    const asPubTxt = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
    const efemero = {
      privateKey: await crypto.subtle.importKey('jwk', jwkDe(asPubTxt, 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
      publicKey: await crypto.subtle.importKey('raw', deB64u(asPubTxt) as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    } as CryptoKeyPair;
    const rfc = await cifrarWebPush('When I grow up, I want to be a watermelon',
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg',
      { sal: deB64u('DGv6ra1nlYgDCS1FRnbzlw'), efemero });
    ok(b64u(rfc) === 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
      'a cifra bate byte a byte com o vetor do Apêndice A da RFC 8291');
  }

  // VAPID: a assinatura confere com a chave pública que vai no cabeçalho
  const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const jwt = await jwtVapid('https://fcm.googleapis.com', vapid.privateKey, 'https://pwa-app-outbound.vercel.app', Date.UTC(2026, 9, 17, 12));
  const [cab, payload, ass] = jwt.split('.');
  const conf = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.publicKey, deB64u(ass) as BufferSource, te.encode(cab + '.' + payload));
  ok(conf, 'a assinatura ES256 do VAPID confere com a chave pública');
  ok(deB64u(ass).length === 64, 'a assinatura está no formato do JWS (r||s, 64 bytes)');
  const p = JSON.parse(td.decode(deB64u(payload)));
  ok(p.aud === 'https://fcm.googleapis.com' && p.exp === Date.UTC(2026, 9, 17, 12) / 1000 + 12 * 3600 && /^https:/.test(p.sub), 'o JWT leva aud, exp de 12 h e o contato');

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nweb push: TODOS PASSARAM');
  if (falhas) process.exit(1);
})();
