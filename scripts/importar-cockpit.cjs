#!/usr/bin/env node
// Traz o Cockpit Field Sales (julyanrib/cockpit-unificado) para dentro do APP,
// servido em /gestao/cockpit/ com o mesmo login do mapa.
//
// A TELA NAO E REESCRITA. O que sai daqui e o public/index.html que o Cockpit
// publica hoje (o de origin/main, ja sem comentario e aprovado pelos guards do
// build dele), com duas trocas mecanicas e mais nada:
//
//   1. a configuracao do Supabase no DATA publico passa a ser a do APP. Com a
//      URL do APP, o supabase-js usa a chave de sessao sb-mxyjvijclhlxrlafqcrz-
//      auth-token, que e a mesma do mapa: quem entrou no mapa ja esta logado aqui;
//   2. uma camada no topo do <head> manda cada fetch('/api/<rota>') para a Edge
//      Function do APP que faz o mesmo papel. Rota que ainda nao foi trazida
//      responde 503 com o motivo em `erro` (o campo que a tela ja le) e NAO sai
//      do navegador: escrever no CRM por um caminho sem as quatro travas e pior
//      que nao escrever.
//
// Quando uma rota for portada, ela entra em ROTAS e o arquivo e gerado de novo.
// Quando o Cockpit mudar a tela, e so rodar de novo:
//
//   node scripts/importar-cockpit.cjs            (le ../cockpit-unificado, origin/main)
//
// O gerador morre em vez de gravar se qualquer troca nao casar exatamente uma
// vez: um HTML meio trocado apontaria para os dois bancos ao mesmo tempo.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const COCKPIT = path.resolve(raiz, '..', 'cockpit-unificado');
const REF = process.env.COCKPIT_REF || 'origin/main';
const DESTINO = path.join(raiz, 'gestao', 'public', 'cockpit');
const BANCO_DO_COCKPIT = 'xitmahwxncpdzopmdook';

// /api/<rota> do Cockpit -> Edge Function do APP. So entra aqui o que ja foi
// portado E conferido contra o original.
const ROTAS = {
  dados: 'cockpit-dados',
};

function morrer(msg) {
  console.error('IMPORTACAO REPROVADA — ' + msg);
  process.exit(1);
}

// A URL e a chave anon do APP saem do mesmo arquivo que o app de campo usa: uma
// fonte so. A chave anon e publica por natureza (ja esta no bundle do mapa).
const cliente = fs.readFileSync(path.join(raiz, 'src', 'integrations', 'supabase', 'client.ts'), 'utf8');
const url = (cliente.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
const anon = (cliente.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
if (!url || !anon) morrer('nao achei SUPABASE_URL/SUPABASE_ANON_KEY em src/integrations/supabase/client.ts');

const git = (args, opts) => execSync('git -C "' + COCKPIT + '" ' + args, Object.assign({ maxBuffer: 64 * 1024 * 1024 }, opts));
const commit = git('rev-parse --short ' + REF).toString().trim();
let html = git('show ' + REF + ':public/index.html').toString('utf8');

// ---- troca 1: o banco ----
const reBloco = /"supabase":\{"url":"[^"]*","anonKey":"[^"]*"\}/g;
const blocos = html.match(reBloco) || [];
if (blocos.length !== 1) morrer('esperava 1 bloco de configuracao do Supabase, achei ' + blocos.length);
html = html.replace(reBloco, JSON.stringify({ supabase: { url, anonKey: anon } }).slice(1, -1));
if (html.includes(BANCO_DO_COCKPIT)) morrer('o HTML ainda cita o banco do Cockpit depois da troca');

// ---- troca 2: as rotas ----
const camada = `<script>
/* Gerado por scripts/importar-cockpit.cjs a partir de cockpit-unificado@${commit}.
   As rotas /api/* do Cockpit viram Edge Functions do APP. */
(function () {
  var FN = ${JSON.stringify(url + '/functions/v1/')};
  var ROTAS = ${JSON.stringify(ROTAS)};
  var original = window.fetch.bind(window);
  window.fetch = function (entrada, init) {
    var alvo = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
    if (alvo.indexOf(location.origin) === 0) alvo = alvo.slice(location.origin.length);
    var m = /^\\/api\\/([a-z0-9-]+)(\\?.*)?$/.exec(alvo);
    if (!m) return original(entrada, init);
    var fn = ROTAS[m[1]];
    if (!fn) {
      return Promise.resolve(new Response(JSON.stringify({
        erro: 'Esta ação ainda não chegou ao APP (' + m[1] + '). Por enquanto, faça pelo Cockpit.'
      }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
    }
    if (typeof entrada !== 'string') {
      init = Object.assign({ method: entrada.method, headers: entrada.headers }, init || {});
    }
    return original(FN + fn + (m[2] || ''), init);
  };
})();
</script>`;
// Logo DEPOIS do charset: o navegador so procura o charset nos primeiros 1024
// bytes, e a camada antes dele o empurraria para fora. Continua antes de
// qualquer script da pagina, que e o que importa para o fetch ja estar trocado.
const CHARSET = '<meta charset="UTF-8">';
const charsets = html.split(CHARSET).length - 1;
if (charsets !== 1) morrer('esperava 1 ' + CHARSET + ', achei ' + charsets);
if (html.indexOf('<script') < html.indexOf(CHARSET)) morrer('ha script antes do charset; a camada chegaria tarde');
html = html.replace(CHARSET, CHARSET + '\n' + camada);

// ---- troca 3: imagem com caminho absoluto ----
// No Cockpit a pagina e a raiz do site; aqui ela mora em /gestao/cockpit/, e
// "assets/x.png" relativo quebraria em /gestao/cockpit sem a barra final.
const relativas = html.split('src="assets/').length - 1;
if (!relativas) morrer('nenhuma imagem em assets/ — o formato da pagina mudou, conferir antes de gerar');
html = html.split('src="assets/').join('src="/gestao/cockpit/assets/');
if (/["'(]assets\//.test(html)) morrer('sobrou referencia relativa a assets/ fora de src="..."');

// ---- grava: a pagina e os arquivos que ela referencia por caminho relativo ----
fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(path.join(DESTINO, 'assets'), { recursive: true });
fs.writeFileSync(path.join(DESTINO, 'index.html'), html);
const assets = git('ls-tree --name-only ' + REF + ' public/assets/').toString().split('\n').filter(Boolean);
assets.forEach((a) => {
  fs.writeFileSync(path.join(DESTINO, 'assets', path.basename(a)), git('show ' + REF + ':' + a));
});

console.log('OK — cockpit-unificado@' + commit + ' -> gestao/public/cockpit/ (' +
  (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB, ' + assets.length + ' assets, rotas: ' +
  Object.keys(ROTAS).join(', ') + ')');
