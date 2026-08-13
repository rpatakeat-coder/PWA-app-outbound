#!/usr/bin/env node
// Build de producao do PWA.
//
// Faz o export do Expo e, em seguida, carimba a versao no service worker.
// O carimbo e' obrigatorio: o browser so considera que ha versao nova se os
// BYTES do sw.js mudarem. Sem ele, o sw.js seria identico entre deploys e
// nenhum vendedor receberia atualizacao — o app ficaria congelado na versao
// que ele instalou no primeiro acesso.
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

console.log('> expo export --platform web');
execSync('npx expo export --platform web --output-dir dist --clear', {
  cwd: root,
  stdio: 'inherit',
});

/** Lista recursiva de arquivos, com caminho relativo a `dir`. */
function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

// Versao = hash do conteudo do build (nomes dos arquivos, que ja carregam o
// hash do Metro). Derivar do conteudo em vez de usar timestamp evita anunciar
// "versao nova" em rebuild que nao mudou nada — o que faria todos os clientes
// recarregarem a toa.
const files = walk(distDir)
  .filter((f) => f !== 'sw.js')
  .sort();

const version = crypto.createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);

const swPath = path.join(distDir, 'sw.js');
if (!fs.existsSync(swPath)) {
  console.error(
    'ERRO: dist/sw.js nao encontrado. Confira se public/sw.js existe — o Expo ' +
      'copia o conteudo de public/ pra raiz do dist.',
  );
  process.exit(1);
}

const sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes('__BUILD_VERSION__')) {
  console.error('ERRO: placeholder __BUILD_VERSION__ ausente em dist/sw.js.');
  process.exit(1);
}

fs.writeFileSync(swPath, sw.replace('__BUILD_VERSION__', version));

console.log(`> service worker carimbado: ${version} (${files.length} arquivos)`);
console.log('> build pronto em dist/');
