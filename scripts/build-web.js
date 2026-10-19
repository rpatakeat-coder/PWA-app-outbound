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

// ---- /gestao: o Cockpit Field Sales (mesmo dominio, mesma sessao do Supabase) ----
//
// Desde 19/10/2026 nao ha mais painel antigo (Julyan: "eu nao quero nada do
// antigo"). O build do Vite em gestao/ servia so tres telas que o Cockpit nao
// tinha — Acessos, Desativar acesso e Documentacao — em /gestao/painel-antigo.html.
// Acessos e Desativar acesso viraram a aba Acessos do Cockpit (#884); Documentacao
// saiu. Agora /gestao e' so' o HTML do Cockpit (gestao/public/cockpit/, gerado por
// scripts/importar-cockpit.cjs) e os arquivos dele, copiados sem bundler.
const publicoGestao = path.join(root, 'gestao', 'public');
if (fs.existsSync(publicoGestao)) {
  const destino = path.join(distDir, 'gestao');
  fs.cpSync(publicoGestao, destino, { recursive: true });
  const entradaCockpit = path.join(destino, 'cockpit', 'index.html');
  if (!fs.existsSync(entradaCockpit)) {
    console.error('ERRO: dist/gestao/cockpit/index.html nao existe — /gestao ficaria sem o Cockpit.');
    process.exit(1);
  }
  // O MESMO MAPA NO COCKPIT (28/09/2026, Julyan: "pq não colocar o mesmo mapa nessa
  // aba?"). O Planejamento do time desenha o mapa do time com o Google Maps do app — a
  // mesma chave e o mesmo Map ID (estilo claro/escuro publicado nele). A chave já vai
  // no bundle do app (é pública, restrita por domínio); aqui ela só é repassada ao HTML
  // do Cockpit, gerada no build a partir das variáveis da Vercel e nunca gravada no git.
  // Sem chave, o arquivo sai vazio e o Cockpit cai no mapa do OpenStreetMap.
  const chaveMapa = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const mapIdMapa = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || '';
  fs.writeFileSync(path.join(destino, 'mapa-config.js'),
    'window.TAKEAT_MAPA = ' + JSON.stringify({ chave: chaveMapa, mapId: mapIdMapa }) + ';\n');
  console.log('> /gestao/mapa-config.js ' + (chaveMapa ? 'com a chave do app' : 'SEM chave (o Cockpit usa o OpenStreetMap)'));

  fs.copyFileSync(entradaCockpit, path.join(destino, 'index.html'));
  // As imagens do Cockpit sao relativas (assets/...). Servido em /gestao/, ele as pede
  // em /gestao/assets/, que caia no rewrite e devolvia o HTML de 4 MB no lugar do logo.
  fs.cpSync(path.join(destino, 'cockpit', 'assets'), path.join(destino, 'assets'), { recursive: true });
  console.log('> /gestao e o Cockpit (sem painel antigo)');
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

// P#2 (02/10/26): a lista do código desta versão vai para o sw.js, que o baixa na
// instalação (validando que não é HTML). Só JS e CSS de _expo/static: fonte e imagem
// continuam sob demanda.
const precodigo = files
  .map((f) => f.split(path.sep).join('/'))
  .filter((f) => f.startsWith('_expo/static/') && /\.(js|css)$/.test(f))
  .map((f) => '/' + f);
if (!sw.includes('/* __PRECODIGO__ */')) {
  console.error('ERRO: placeholder __PRECODIGO__ ausente em dist/sw.js.');
  process.exit(1);
}
fs.writeFileSync(swPath, sw
  .replace('__BUILD_VERSION__', version)
  .replace('/* __PRECODIGO__ */', precodigo.map((u) => JSON.stringify(u)).join(', ')));
console.log('> service worker pré-carrega ' + precodigo.length + ' arquivos de código');

console.log(`> service worker carimbado: ${version} (${files.length} arquivos)`);
console.log('> build pronto em dist/');
