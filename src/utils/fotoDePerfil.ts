// A foto de perfil: escolher, encolher, subir, apagar.
//
// POR QUE ENCOLHER NO CLIENTE
// A foto sai da camera do celular com 3-4 MB e 4000px de lado. Ela e' desenhada
// num circulo de 32px no cabecalho e de 56px na folha do perfil. Subir o
// original seria gastar o 4G do vendedor na rua e depois BAIXAR esses megabytes
// em toda abertura do app — o navegador nao redimensiona no download.
//
// 512px de lado cobre o maior uso com folga (a folha do perfil, em tela 3x) e
// cabe em ~40-120 KB de JPEG.
//
// POR QUE A URL LEVA `?v=`
// O caminho no bucket e' FIXO (`<uid>/foto.jpg`) de proposito: trocar a foto
// substitui o arquivo em vez de acumular lixo no storage. Mas URL fixa e'
// exatamente o que o navegador guarda em cache — a pessoa trocaria a foto e
// continuaria vendo a antiga por horas. Guardar a versao DENTRO da string em
// `profiles.avatar_url` resolve em um lugar so': quem exibe nao precisa saber
// que existe cache.

/** Tipos que o bucket aceita (`allowed_mime_types` da migration
 *  0076_foto_do_perfil.sql). */
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** HEIC/HEIF é o padrão da câmera do iPhone, e NENHUM navegador decodifica:
 *  medido em 17/09/2026 — `createImageBitmap` devolve `InvalidStateError` e o
 *  `<img>` cai no `onerror`. Merece caso próprio porque "escolha JPG, PNG ou
 *  WEBP" não diz o que fazer quando o celular só produz HEIC. */
const TIPOS_HEIC = ['image/heic', 'image/heif', 'image/heic-sequence'];

export const LADO_MAXIMO = 512;
/** Teto do bucket, repetido aqui pra recusar ANTES de gastar upload. */
export const BYTES_MAXIMOS = 2 * 1024 * 1024;

export function tipoAceito(tipo: string | null | undefined): boolean {
  return TIPOS_ACEITOS.includes((tipo ?? '').toLowerCase() as (typeof TIPOS_ACEITOS)[number]);
}

/** Extensao do arquivo no bucket. Sempre jpg depois do encolhimento — o canvas
 *  exporta JPEG — mas a funcao existe pro caso de um caminho que suba o
 *  original (e pra o teste travar a regra). */
export function extensaoDe(tipo: string | null | undefined): string {
  const t = (tipo ?? '').toLowerCase();
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  return 'jpg';
}

/** `<uid>/foto.<ext>` — a PRIMEIRA pasta e' o dono, e e' isso que a policy do
 *  storage confere. Mudar este formato sem mudar a migration abre a foto de
 *  todo mundo para todo mundo. */
export function caminhoDaFoto(uid: string, ext: string): string {
  return `${uid}/foto.${ext}`;
}

/** Carimba a versao na URL publica, trocando a anterior se ja' houver. */
export function urlComVersao(url: string, versao: number): string {
  const limpa = url.split('?')[0];
  return `${limpa}?v=${versao}`;
}

/** Mede o destino mantendo a proporcao. Nunca AUMENTA: foto de 200px continua
 *  com 200px em vez de virar um borrao esticado de 512. */
export function medidaDestino(
  largura: number,
  altura: number,
  lado = LADO_MAXIMO,
): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= lado || maior === 0) return { largura, altura };
  const fator = lado / maior;
  return {
    largura: Math.max(1, Math.round(largura * fator)),
    altura: Math.max(1, Math.round(altura * fator)),
  };
}

/** Mensagem de recusa, ou null quando o arquivo serve. Texto de tela: quem le'
 *  esta' na rua e precisa saber o que fazer, nao o codigo do erro. */
export function porQueNaoServe(arquivo: {
  type?: string;
  size?: number;
  name?: string;
}): string | null {
  // O `type` vem vazio em vários sistemas, então a extensão do nome também
  // conta — senão o HEIC cai no texto genérico, que não resolve o problema
  // de quem fotografou com iPhone.
  const ehHeic =
    TIPOS_HEIC.includes((arquivo.type ?? '').toLowerCase()) ||
    /\.hei[cf]$/i.test(arquivo.name ?? '');
  if (ehHeic) {
    return 'Fotos do iPhone vêm em HEIC, que o navegador não abre. No iPhone: Ajustes → Câmera → Formatos → "Mais compatível". Ou tire um print da foto e envie o print.';
  }
  if (!tipoAceito(arquivo.type)) return 'Escolha uma imagem JPG, PNG ou WEBP.';
  if ((arquivo.size ?? 0) > BYTES_MAXIMOS) return 'Essa imagem passa de 2 MB. Escolha uma menor.';
  return null;
}

// ---------------------------------------------------------------------------
// Daqui pra baixo depende do NAVEGADOR (input de arquivo, canvas).
//
// O app de campo roda em react-native-web e e' servido como PWA — nao ha' build
// nativo. Por isso o seletor e' um `<input type="file">` do DOM em vez de
// `expo-image-picker`: uma dependencia nativa a menos num projeto de 15, e o
// `capture` deixa o celular oferecer a camera do mesmo jeito.
// ---------------------------------------------------------------------------

/** Abre o seletor do sistema. Resolve com null se a pessoa desistir. */
export function escolherImagem(): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = TIPOS_ACEITOS.join(',');
    // `position: fixed` fora da tela em vez de `display:none`: o Safari do iOS
    // ignora o clique em input nao renderizado.
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    document.body.appendChild(input);

    let respondeu = false;
    const responder = (arquivo: File | null) => {
      if (respondeu) return;
      respondeu = true;
      input.remove();
      resolve(arquivo);
    };

    input.addEventListener('change', () => responder(input.files?.[0] ?? null));
    // Cancelar o seletor NAO dispara `change` em todo navegador; sem isto a
    // promise ficaria pendurada pra sempre e o botao preso em "Enviando...".
    input.addEventListener('cancel', () => responder(null));

    // O `focus` e' o detector de cancelamento de ultimo recurso, e ele tem uma
    // armadilha: em alguns navegadores o proprio `input.click()` ja' dispara
    // focus na janela, ANTES de o dialogo abrir. Resolvendo ali, a promise
    // voltava null e o `change` real que vinha depois era ignorado — a pessoa
    // escolhia a foto e nada acontecia, sem erro nenhum.
    //
    // A guarda: so' vale focus que venha DEPOIS de um blur de verdade (o
    // dialogo roubando o foco da janela), e ainda com folga pro `change`
    // chegar primeiro.
    let perdeuFoco = false;
    window.addEventListener('blur', () => { perdeuFoco = true; }, { once: true });
    window.addEventListener(
      'focus',
      () => {
        if (!perdeuFoco) return;
        setTimeout(() => responder(input.files?.[0] ?? null), 800);
      },
      { once: true },
    );

    input.click();
  });
}

/** Encolhe e recorta no centro, devolvendo JPEG quadrado.
 *
 *  Quadrado porque o destino e' sempre um circulo: recortar aqui evita que uma
 *  foto deitada apareca espremida em todo lugar que a desenha. */
export async function encolherQuadrado(arquivo: File, lado = LADO_MAXIMO): Promise<Blob> {
  const bitmap = await criarBitmap(arquivo);
  const origem = Math.min(bitmap.width, bitmap.height);
  const destino = Math.min(lado, origem);

  const canvas = document.createElement('canvas');
  canvas.width = destino;
  canvas.height = destino;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não consegui processar a imagem neste navegador.');

  ctx.drawImage(
    bitmap as CanvasImageSource,
    // Recorte centralizado na origem.
    (bitmap.width - origem) / 2,
    (bitmap.height - origem) / 2,
    origem,
    origem,
    0,
    0,
    destino,
    destino,
  );

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Não consegui converter a imagem.');
  return blob;
}

/** `createImageBitmap` respeita a orientacao EXIF; o `<img>` nao. Sem o
 *  fallback, navegador antigo ficaria sem foto — com ele, a foto pode sair
 *  deitada, que e' melhor que nenhuma. */
async function criarBitmap(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(arquivo, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      // cai no <img>
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não consegui abrir a imagem.'));
      img.src = url;
    });
  } finally {
    // Depois do onload o bitmap ja' esta' na memoria; segurar a URL vaza.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
