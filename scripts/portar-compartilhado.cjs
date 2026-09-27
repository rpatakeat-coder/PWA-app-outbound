#!/usr/bin/env node
// Traz do Cockpit (julyanrib/cockpit-unificado) os módulos que o APP usa em mais de
// uma Edge Function, para supabase/functions/_compartilhado/.
//
// O CÓDIGO NÃO É REESCRITO: só troca require -> import e module.exports -> export, e
// embute o data/temperatura.json (a configuração viva continua vindo de cockpit_config,
// passada por quem chama). É o que garante que o espelho ao vivo monte o card do funil
// com a MESMA conta do robô (lib/lead-do-funil.js).
//
//   node scripts/portar-compartilhado.cjs            (lê ../cockpit-unificado, origin/main)
//   COCKPIT_REF=<branch|commit> node scripts/portar-compartilhado.cjs
//
// Morre em vez de gravar se sobrar require que ele não sabe servir.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const COCKPIT = path.resolve(raiz, '..', 'cockpit-unificado');
const REF = process.env.COCKPIT_REF || 'origin/main';
const DESTINO = path.join(raiz, 'supabase', 'functions', '_compartilhado');

const ler = (arq) => execSync(`git show ${REF}:${arq}`, { cwd: COCKPIT, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).replace(/\r\n/g, '\n');
const commit = execSync(`git rev-parse ${REF}`, { cwd: COCKPIT, encoding: 'utf8' }).trim();
const cabecalho = (arq) => `// PORTADO de julyanrib/cockpit-unificado ${arq} @ ${commit.slice(0, 7)} por scripts/portar-compartilhado.cjs.\n// NÃO EDITAR AQUI: mude no Cockpit e rode o portador de novo.\n`;

function trocar(texto, de, para, arq) {
  if (texto.split(de).length !== 2) throw new Error(`${arq}: esperava achar exatamente uma vez: ${de.slice(0, 60)}`);
  return texto.replace(de, para);
}

let temp = ler('lib/temperatura.js');
const json = JSON.stringify(JSON.parse(ler('data/temperatura.json')), null, 2);
temp = trocar(temp, "const CONFIG_PADRAO = require('../data/temperatura.json');", `const CONFIG_PADRAO = ${json};`, 'temperatura.js');
temp = trocar(temp, 'module.exports = {', 'export {', 'temperatura.js');

let lead = ler('lib/lead-do-funil.js');
lead = trocar(lead, "const { temperaturaDoNegocio } = require('./temperatura.js');", "import { temperaturaDoNegocio } from './temperatura.js';", 'lead-do-funil.js');
lead = trocar(lead, 'module.exports = {', 'export {', 'lead-do-funil.js');

for (const [nome, t] of [['temperatura.js', temp], ['lead-do-funil.js', lead]]) {
  if (/\brequire\(|module\.exports/.test(t)) throw new Error(`${nome}: sobrou require/module.exports — o portador não sabe servir`);
}

fs.mkdirSync(DESTINO, { recursive: true });
fs.writeFileSync(path.join(DESTINO, 'temperatura.js'), cabecalho('lib/temperatura.js') + temp);
fs.writeFileSync(path.join(DESTINO, 'lead-do-funil.js'), cabecalho('lib/lead-do-funil.js') + lead);
console.log(`OK — cockpit-unificado@${commit.slice(0, 7)} -> supabase/functions/_compartilhado/ (temperatura.js, lead-do-funil.js)`);
