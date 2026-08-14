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

// ---- Cockpit de gestao (front separado, mesmo dominio) ----
//
// Sao dois front-ends com bundlers diferentes de proposito: o app de campo e'
// react-native-web (o codigo de tela e' React Native) e sai pelo Metro; o
// cockpit e' React DOM denso, de mesa, e sai pelo Vite — que e' o bundler que
// o design system da Takeat espera (a dependencia @vanilla-extract/vite-plugin
// nao deixa duvida). Medido: o mesmo componente do kit custa 394 KB no Vite
// contra 2.512 KB quando forcado pelo Metro.
//
// O build do cockpit vai pra dist/gestao/ e passa a ser servido no mesmo
// dominio, sob /gestao — e' isso que faz a sessao do Supabase ser
// compartilhada entre os dois sem nenhuma linha de sincronia.
const gestao = path.join(root, 'gestao');
if (fs.existsSync(gestao)) {
  console.log('\n> vite build (cockpit de gestao)');
  if (!fs.existsSync(path.join(gestao, 'node_modules'))) {
    execSync('npm install --legacy-peer-deps', { cwd: gestao, stdio: 'inherit' });
  }
  execSync('npm run build', { cwd: gestao, stdio: 'inherit' });

  const destino = path.join(distDir, 'gestao');
  fs.cpSync(path.join(gestao, 'dist'), destino, { recursive: true });
  console.log('> cockpit copiado pra dist/gestao/');
}

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
