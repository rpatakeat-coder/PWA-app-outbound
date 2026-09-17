// Teste das partes PURAS da foto de perfil.
//
// Rode com:  npx tsx src/utils/fotoDePerfil.teste.ts
//
// O encolhimento em si depende de canvas e fica para a validacao no navegador.
// O que esta' aqui e' o que erra em silencio: o caminho no bucket (que a policy
// do storage usa pra decidir quem escreve), a versao na URL (que e' o que faz a
// foto nova aparecer) e a recusa de arquivo.
import {
  tipoAceito,
  extensaoDe,
  caminhoDaFoto,
  urlComVersao,
  medidaDestino,
  porQueNaoServe,
  BYTES_MAXIMOS,
} from './fotoDePerfil';

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

console.log('--- tipos ---');
ok('jpeg serve', tipoAceito('image/jpeg'), true);
ok('png serve', tipoAceito('image/png'), true);
ok('webp serve', tipoAceito('image/webp'), true);
ok('maiuscula nao atrapalha', tipoAceito('IMAGE/JPEG'), true);
ok('heic NAO serve (o canvas nao abre)', tipoAceito('image/heic'), false);
ok('pdf nao serve', tipoAceito('application/pdf'), false);
ok('vazio nao serve', tipoAceito(''), false);
ok('null nao serve', tipoAceito(null), false);

console.log('\n--- extensao ---');
ok('png', extensaoDe('image/png'), 'png');
ok('webp', extensaoDe('image/webp'), 'webp');
ok('jpeg', extensaoDe('image/jpeg'), 'jpg');
ok('desconhecido cai em jpg', extensaoDe('image/tiff'), 'jpg');

console.log('\n--- caminho no bucket ---');
// A POLICY do storage le' a primeira pasta como dono. Se este formato mudar,
// a amarra da migration 0076_foto_do_perfil.sql deixa de valer.
ok(
  'a primeira pasta e o uid',
  caminhoDaFoto('8e0a1b2c-3d4e-5f60-7182-93a4b5c6d7e8', 'jpg'),
  '8e0a1b2c-3d4e-5f60-7182-93a4b5c6d7e8/foto.jpg',
);
ok(
  'nome fixo: trocar a foto SUBSTITUI, nao acumula',
  caminhoDaFoto('uid', 'jpg') === caminhoDaFoto('uid', 'jpg'),
  true,
);

console.log('\n--- versao na URL (o que fura o cache) ---');
const BASE = 'https://x.supabase.co/storage/v1/object/public/avatares/uid/foto.jpg';
ok('carimba', urlComVersao(BASE, 1700000000), `${BASE}?v=1700000000`);
ok(
  'TROCA a versao anterior em vez de empilhar',
  urlComVersao(`${BASE}?v=1`, 2),
  `${BASE}?v=2`,
);

console.log('\n--- medida (nunca aumenta) ---');
ok('quadrada grande encolhe', medidaDestino(4000, 4000, 512), { largura: 512, altura: 512 });
ok('deitada mantem proporcao', medidaDestino(4000, 3000, 512), { largura: 512, altura: 384 });
ok('em pe mantem proporcao', medidaDestino(3000, 4000, 512), { largura: 384, altura: 512 });
ok('pequena NAO e esticada', medidaDestino(200, 200, 512), { largura: 200, altura: 200 });
ok('no limite exato passa igual', medidaDestino(512, 512, 512), { largura: 512, altura: 512 });
ok('zero nao divide por zero', medidaDestino(0, 0, 512), { largura: 0, altura: 0 });

console.log('\n--- recusa com texto de gente ---');
ok('imagem boa passa', porQueNaoServe({ type: 'image/jpeg', size: 100_000 }), null);

// HEIC tem texto PROPRIO porque "escolha JPG, PNG ou WEBP" nao diz o que fazer
// pra quem fotografou com iPhone — e nenhum navegador decodifica HEIC (medido
// em 17/09/2026: createImageBitmap da InvalidStateError e o <img> tambem falha).
const HEIC = 'Fotos do iPhone vêm em HEIC, que o navegador não abre. No iPhone: Ajustes → Câmera → Formatos → "Mais compatível". Ou tire um print da foto e envie o print.';
ok('heic pelo type', porQueNaoServe({ type: 'image/heic', size: 500_000 }), HEIC);
ok('heif tambem', porQueNaoServe({ type: 'image/heif', size: 500_000 }), HEIC);
// O `type` vem VAZIO em varios sistemas; sem olhar a extensao o HEIC cairia no
// texto genérico.
ok('heic com type vazio, pela extensao', porQueNaoServe({ type: '', name: 'IMG_4231.HEIC', size: 500_000 }), HEIC);
ok('jpg nao e confundido com heic', porQueNaoServe({ type: 'image/jpeg', name: 'foto.jpg', size: 10 }), null);
ok(
  'tipo errado explica o que fazer',
  porQueNaoServe({ type: 'application/pdf', size: 10 }),
  'Escolha uma imagem JPG, PNG ou WEBP.',
);
ok(
  'grande demais diz o tamanho',
  porQueNaoServe({ type: 'image/jpeg', size: BYTES_MAXIMOS + 1 }),
  'Essa imagem passa de 2 MB. Escolha uma menor.',
);
ok('no limite exato passa', porQueNaoServe({ type: 'image/jpeg', size: BYTES_MAXIMOS }), null);
// A ordem importa: um PDF de 5 MB tem os dois problemas, e "escolha uma
// imagem" e' a instrucao util — reduzir o PDF nao resolveria nada.
ok(
  'tipo vem antes do tamanho',
  porQueNaoServe({ type: 'application/pdf', size: BYTES_MAXIMOS + 1 }),
  'Escolha uma imagem JPG, PNG ou WEBP.',
);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`);
if (falhas) throw new Error(`${falhas} teste(s) da foto de perfil falharam`);
