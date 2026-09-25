#!/usr/bin/env node
// Traz as rotas de servidor do Cockpit (julyanrib/cockpit-unificado, api/*.js +
// lib/**) para a Edge Function supabase/functions/cockpit-api/.
//
// O CODIGO NAO E REESCRITO. Cada arquivo entra no pacote byte a byte, dentro de
// uma funcao-modulo no estilo CommonJS (module, exports, require, process) — e
// um "bundler" de 40 linhas, nada mais. E isso que garante que as quatro travas
// de negocio (hubspot-deal-guard, mudar-etapa-negocio), as mensagens e as regras
// sao AS DO COCKPIT, e nao uma releitura minha delas.
//
// O que muda e so o que esta embaixo do codigo, e vive em cockpit-api/index.ts:
//   - process.env vem dos segredos do APP (HUBSPOT_TOKEN, SUPABASE_*...);
//   - data/usuarios.json vem de equipe_cockpit + profiles (0091–0095);
//   - data/territorios.json e as outras configuracoes vem de cockpit_config (0092);
//   - req/res da Vercel sao imitados sobre o Request/Response do Deno.
//
// Rota nova do Cockpit = entrar em ROTAS aqui e rodar de novo:
//   node scripts/portar-cockpit-api.cjs          (le ../cockpit-unificado, origin/main)
// O gerador morre se aparecer dependencia que o pacote nao sabe servir.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const COCKPIT = path.resolve(raiz, '..', 'cockpit-unificado');
const REF = process.env.COCKPIT_REF || 'origin/main';
const DESTINO = path.join(raiz, 'supabase', 'functions', 'cockpit-api', 'cockpit.js');

// As rotas que o APP serve. Fora daqui, a camada da tela responde "ainda nao chegou".
const ROTAS = [
  'negocio-acao',
  'criar-negocio',
  'desfazer-negocio',
  'criar-nota-negocio',
  'criar-empresa-prospeccao',
  'restaurantes-proximos',
  'novidades-mercado',
];
// Os .json que o codigo pede e que o index.ts entrega vivos (equipe e configuracao).
const JSON_SERVIDOS = ['data/usuarios.json', 'data/territorios.json', 'data/redes-excluidas.json', 'data/maptiler-config.json'];

function morrer(msg) {
  console.error('PORTE REPROVADO — ' + msg);
  process.exit(1);
}
const git = (args) => execSync('git -C "' + COCKPIT + '" ' + args, { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const commit = git('rev-parse --short ' + REF).trim();
const ler = (p) => git('show ' + REF + ':' + p);

const fontes = new Map();
const jsons = new Set();
function resolver(de, spec) {
  const partes = path.posix.join(path.posix.dirname(de), spec).split('/');
  const saida = [];
  partes.forEach((p) => { if (p === '..') saida.pop(); else if (p && p !== '.') saida.push(p); });
  let p = saida.join('/');
  if (!/\.(js|json)$/.test(p)) p += '.js';
  return p;
}
function visitar(arquivo) {
  if (fontes.has(arquivo)) return;
  const src = ler(arquivo);
  fontes.set(arquivo, src);
  for (const m of src.matchAll(/require\(\s*(['"])([^'"]+)\1\s*\)/g)) {
    const spec = m[2];
    if (!spec.startsWith('.')) morrer(arquivo + ' pede o modulo externo "' + spec + '", que o pacote nao serve');
    const alvo = resolver(arquivo, spec);
    if (alvo.endsWith('.json')) {
      if (!JSON_SERVIDOS.includes(alvo)) morrer(arquivo + ' pede ' + alvo + ', que o index.ts nao entrega');
      jsons.add(alvo);
    } else visitar(alvo);
  }
  if (/require\(\s*[^'"\s]/.test(src)) morrer(arquivo + ' tem require dinamico');
}
ROTAS.forEach((r) => visitar('api/' + r + '.js'));

const corpo = [...fontes].map(([arquivo, src]) =>
  '  ' + JSON.stringify(arquivo) + ': function (module, exports, require, process) {\n' + src + '\n  },').join('\n');

const saida = `// GERADO por scripts/portar-cockpit-api.cjs a partir de cockpit-unificado@${commit}.
// NAO EDITAR: cada funcao abaixo e um arquivo do Cockpit, byte a byte. Para mudar
// uma regra, mude no Cockpit e gere de novo.
export const ORIGEM = ${JSON.stringify(commit)};
export const ROTAS = ${JSON.stringify(ROTAS)};
export const JSONS = ${JSON.stringify([...jsons].sort())};

const FONTES = {
${corpo}
};

function resolver(de, spec) {
  const partes = (de.split('/').slice(0, -1).concat(spec.split('/')));
  const saida = [];
  partes.forEach((p) => { if (p === '..') saida.pop(); else if (p && p !== '.') saida.push(p); });
  let p = saida.join('/');
  if (!/\\.(js|json)$/.test(p)) p += '.js';
  return p;
}

// ambiente = { process, json(caminho) }
export function carregador(ambiente) {
  const cache = Object.create(null);
  function requireDe(de) {
    return function (spec) {
      const p = resolver(de, spec);
      if (p.endsWith('.json')) return ambiente.json(p);
      if (cache[p]) return cache[p].exports;
      const fonte = FONTES[p];
      if (!fonte) throw new Error('arquivo do Cockpit nao portado: ' + p);
      const m = { exports: {} };
      cache[p] = m;
      fonte.call(m.exports, m, m.exports, requireDe(p), ambiente.process);
      return m.exports;
    };
  }
  return (arquivo) => requireDe('')('./' + arquivo);
}
`;
fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, saida);
console.log('OK — cockpit-unificado@' + commit + ' -> cockpit-api/cockpit.js (' + fontes.size + ' arquivos, ' +
  (Buffer.byteLength(saida) / 1024).toFixed(0) + ' KB; json: ' + [...jsons].join(', ') + ')');
