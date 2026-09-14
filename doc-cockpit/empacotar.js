// docs-replicacao/empacotar.js
//
// Monta a pasta que vai para o outro projeto: a documentação + os arquivos que carregam
// as regras. Copia, não move — o repositório original fica intacto.
//
//   node docs-replicacao/empacotar.js              docs + arquivos recomendados
//   node docs-replicacao/empacotar.js --completo   + template, robô e suítes
//   node docs-replicacao/empacotar.js --destino /caminho/qualquer
//
// data/usuarios.json contém e-mails reais do time. Ele entra no pacote porque é o
// contrato do papel, mas o script AVISA ao copiá-lo — anonimizar é decisão de quem envia,
// e um aviso na hora certa é melhor que uma regra que remove o arquivo e deixa o outro
// lado sem entender como o papel funciona.

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const args = process.argv.slice(2);
const completo = args.includes('--completo');
const iDestino = args.indexOf('--destino');
const carimbo = new Date().toISOString().slice(0, 10);
const destino = iDestino >= 0 && args[iDestino + 1]
  ? path.resolve(args[iDestino + 1])
  : path.join(raiz, '..', 'cockpit-replicacao-' + carimbo);

/* PASTAS vão inteiras; ARQUIVOS vão um a um. A lista é branca de propósito: o que não
   está aqui não viaja, e é assim que nenhuma foto do CRM (data/hubspot.json e companhia,
   todas gitignored) sai junto por descuido. */
const PASTAS = [
  'docs-replicacao',
  'supabase/migrations',
  'docs'
];

const ARQUIVOS = [
  'README.md',
  'supabase/README.md',
  'supabase/POLITICAS.txt',
  'vercel.json',

  'scripts/montar-dados.js',
  'scripts/build.js',
  'scripts/vercel-deve-buildar.js',

  'lib/temperatura.js',
  'lib/realizado.js',
  'lib/territorios.js',
  'lib/publicar-snapshot.js',
  'lib/hubspot-deal-guard.js',
  'lib/acoes-negocio/mudar-etapa-negocio.js',
  'lib/acoes-negocio/criar-nota-negocio.js',

  'api/dados.js',
  'api/negocio-acao.js',
  'api/criar-negocio.js',
  'api/fila-pwa.js',
  'api/hubspot-webhook.js',

  'data/temperatura.json',
  'data/cadencias.json',
  'data/metas.json',
  'data/usuarios.json',
  'data/supabase-config.json',

  'public/assets/logo-takeat.png',

  // os 14 protótipos de design + o runtime deles
  'cockpit-gestor-hi-fi.html', 'hoje-executivo-hi-fi.html', 'daily-e-ritmo-gestor.html',
  'semana-gestor.html', 'pessoas-gestor.html', 'prospeccao-gestor.html',
  'avisos-gestor.html', 'minha-daily-executivo.html', 'meu-funil-executivo.html',
  'rota-e-agenda-executivo.html', 'prospeccao-executivo.html', 'avisos-executivo.html',
  'desenvolvimento-executivo.html', 'drawers-nivel-3.html', 'support.js'
];

const ARQUIVOS_COMPLETO = [
  'template/cockpit.template.html',
  'scripts/fetch-hubspot.js',
  'scripts/check-scripts.js',
  'scripts/generate-weekly-summary.js',
  'scripts/fetch-weekly-comparison.js',
  'scripts/preview-local.js',
  'scripts/servir-preview.js'
];

const PASTAS_COMPLETO = ['.github/workflows', 'api', 'lib', 'data'];

/* AVISA, não remove: ver o cabeçalho. */
const SENSIVEIS = ['data/usuarios.json', 'data/supabase-config.json'];

let copiados = 0;
let bytes = 0;
const avisos = [];

function copiarArquivo(rel) {
  const de = path.join(raiz, rel);
  if (!fs.existsSync(de)) return false;
  const para = path.join(destino, rel);
  fs.mkdirSync(path.dirname(para), { recursive: true });
  fs.copyFileSync(de, para);
  copiados++;
  bytes += fs.statSync(de).size;
  if (SENSIVEIS.indexOf(rel) >= 0) avisos.push(rel);
  return true;
}

function copiarPasta(rel) {
  const de = path.join(raiz, rel);
  if (!fs.existsSync(de)) return;
  fs.readdirSync(de, { withFileTypes: true }).forEach(function (item) {
    const filho = rel + '/' + item.name;
    if (item.isDirectory()) copiarPasta(filho);
    else copiarArquivo(filho);
  });
}

if (fs.existsSync(destino)) {
  console.error('O destino já existe: ' + destino);
  console.error('Apague-o ou passe --destino <outro caminho>. Não sobrescrevo pacote pronto.');
  process.exit(1);
}
fs.mkdirSync(destino, { recursive: true });

PASTAS.forEach(copiarPasta);
ARQUIVOS.forEach(function (f) { if (!copiarArquivo(f)) console.warn('  (ausente, pulado) ' + f); });

if (completo) {
  PASTAS_COMPLETO.forEach(copiarPasta);
  ARQUIVOS_COMPLETO.forEach(function (f) { if (!copiarArquivo(f)) console.warn('  (ausente, pulado) ' + f); });
}

/* O LEIA-ME DO PACOTE, escrito aqui para o outro lado não precisar deste repositório
   para saber o que recebeu. */
fs.writeFileSync(path.join(destino, 'COMECE-AQUI.md'),
  '# Pacote de replicação — Cockpit Field Sales\n\n' +
  'Gerado em ' + carimbo + (completo ? ' (completo)' : ' (essencial)') + '.\n\n' +
  '1. Abra `docs-replicacao/PROMPT-PARA-O-OUTRO-CLAUDE.md` e cole o bloco de prompt\n' +
  '   na primeira mensagem do Claude Code deste projeto.\n' +
  '2. A documentação está em `docs-replicacao/`, numerada na ordem de leitura.\n' +
  '3. Os demais arquivos são referência: as regras vivem em `lib/`, `scripts/montar-dados.js`\n' +
  '   e `lib/acoes-negocio/`; o schema em `supabase/migrations/`; o design nos `*.html` da raiz.\n\n' +
  '**`support.js` é o runtime dos protótipos de design — não replicar.**\n' +
  (avisos.length
    ? '\n## Atenção\n\nEstes arquivos contêm dados do time real — anonimize antes de compartilhar fora:\n\n' +
      avisos.map(function (a) { return '- `' + a + '`'; }).join('\n') + '\n'
    : '')
);

console.log('');
console.log('Pacote pronto: ' + destino);
console.log(copiados + ' arquivo(s), ' + (bytes / 1024 / 1024).toFixed(1) + ' MB' + (completo ? '' : ' — use --completo para incluir template, robô e suítes'));
if (avisos.length) {
  console.log('');
  console.log('AVISO — dados do time real no pacote (anonimize se for para fora):');
  avisos.forEach(function (a) { console.log('  · ' + a); });
}
