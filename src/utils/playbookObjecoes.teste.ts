// Teste do "O dono disse…" (handoff das abas). Roda: npx tsx src/utils/playbookObjecoes.teste.ts
import { buscarObjecoes, frases, objecoesDaCasa, objecoesDoPlaybook, type Playbook } from './playbook';

let falhas = 0;
const ok = (c: unknown, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

// HTML com a MESMA forma da página oficial (texto de exemplo).
const html = [
  '<h2>As objeções de mesa</h2><blockquote><strong>Regra.</strong> Texto geral.</blockquote>',
  '<h3 id="objecoes-caro">&quot;É caro / Não tenho o valor agora.&quot;</h3>',
  '<ul><li><strong>O Erro do Vendedor:</strong> Dar desconto.</li><li><strong>O diagnóstico:</strong> Trata como custo.</li><li><strong>A Resposta Direta:</strong></li></ul>',
  '<blockquote><em>&quot;Seu [Nome], caro é perder margem. Caro é a fila no sábado. O sistema se paga no fim de semana. Vamos ativar agora? Faço o cadastro aqui.&quot;</em></blockquote>',
  '<ul><li><strong>No follow-up, depois da visita:</strong> <em>&quot;Passo terça às 15h.&quot;</em></li></ul>',
  '<h3 id="objecoes-internet">&quot;E se a internet cair?&quot;</h3>',
  '<ul><li><strong>O diagnóstico:</strong> Medo de parar.</li><li><strong>A Resposta Direta:</strong></li></ul>',
  '<blockquote><em>&quot;A operação segue no 4G. Recomendo fibra dedicada.&quot;</em></blockquote>',
  '<h3 id="fechamento">Fechamento por contraste</h3><blockquote>Não é objeção.</blockquote>',
].join('\n');
const pb: Playbook = { categorias: ['Converter e fechar'], paginas: [{ id: 'objecoes', titulo: 'Objeções', categoria: 'Converter e fechar', html }] };
const l = objecoesDoPlaybook(pb);
ok(l.length === 2, 'só as seções entre aspas viram objeção');
ok(l[0].pergunta === 'É caro / Não tenho o valor agora.' && l[0].curta === 'É caro', 'pergunta e rótulo curto');
ok(l[0].fala === 'Seu [Nome], caro é perder margem. Caro é a fila no sábado.', 'fala pronta = 2 primeiras frases');
ok(l[0].seInsistir.length === 3 && l[0].seInsistir[0] === 'O sistema se paga no fim de semana.', 'se insistir = as frases seguintes');
ok(l[0].diagnostico === 'Trata como custo.' && l[0].followUp === 'Passo terça às 15h.', 'diagnóstico e follow-up');
ok(l[0].ancora === 'objecoes-caro' && l[0].paginaId === 'objecoes', 'âncora para a página completa');
ok(l[1].followUp === null && l[1].seInsistir.length === 0, 'campos que faltam ficam vazios');
ok(buscarObjecoes(l, 'internet')[0]?.ancora === 'objecoes-internet', 'busca pela palavra do dono');
ok(buscarObjecoes(l, 'tá caro')[0]?.ancora === 'objecoes-caro', 'busca ignora palavra curta e acento');
ok(buscarObjecoes(l, 'xyzabc').length === 0, 'sem resultado devolve vazio');
ok(frases('Um. Dois? Três!').length === 3, 'frases');
ok(objecoesDoPlaybook({ categorias: [], paginas: [] }).length === 0, 'sem a página não quebra');

// a fala curta aprovada (bullets "Fala pronta" e "Se ele insistir" na página) vence a derivada
const comAprovada = html.replace('<ul><li><strong>No follow-up',
  '<ul><li><strong>Fala pronta:</strong> <em>&quot;Caro é perder margem. Se paga no fim de semana.&quot;</em></li>'
  + '<li><strong>Se ele insistir:</strong> <em>&quot;Fazemos a conta agora. Se pagar, ativamos.&quot;</em></li></ul>\n<ul><li><strong>No follow-up');
const l2 = objecoesDoPlaybook({ categorias: [], paginas: [{ id: 'objecoes', titulo: 'Objeções', categoria: 'x', html: comAprovada }] });
ok(l2[0].fala === 'Caro é perder margem. Se paga no fim de semana.', 'fala aprovada vence a derivada');
ok(l2[0].seInsistir.join(' | ') === 'Fazemos a conta agora. | Se pagar, ativamos.', 'se insistir aprovado, em frases');
ok(l2[0].followUp === 'Passo terça às 15h.', 'follow-up continua lido');
ok(l2[1].fala === 'A operação segue no 4G. Recomendo fibra dedicada.', 'objeção sem fala aprovada continua derivada');

// SE ELE DISSER · PARA ESTA CASA (espinha do dia 2.4). A casa escolhe, não o executivo.
const comSistema = [
  '<h3 id="objecoes-caro">&quot;É caro / Não tenho o valor agora.&quot;</h3>',
  '<ul><li><strong>A Resposta Direta:</strong></li></ul>',
  '<blockquote><em>&quot;Caro é perder margem no sábado. O sistema se paga.&quot;</em></blockquote>',
  '<h3 id="objecoes-ja-tenho">&quot;Já tenho sistema, não quero trocar.&quot;</h3>',
  '<ul><li><strong>A Resposta Direta:</strong></li></ul>',
  '<blockquote><em>&quot;Não precisa trocar tudo hoje. Veja só a diferença.&quot;</em></blockquote>',
  '<h3 id="objecoes-internet">&quot;E se a internet cair?&quot;</h3>',
  '<ul><li><strong>A Resposta Direta:</strong></li></ul>',
  '<blockquote><em>&quot;A operação segue no 4G.&quot;</em></blockquote>',
].join('\n');
const lc = objecoesDoPlaybook({ categorias: [], paginas: [{ id: 'objecoes', titulo: 'Objeções', categoria: 'x', html: comSistema }] });
ok(lc.length === 3, 'três objeções para escolher');

ok(objecoesDaCasa(lc, {}).length === 0, 'sem ficha, o bloco some');
ok(objecoesDaCasa(lc, { sistema: 'Nenhum', dor: '' }).length === 0, '"Nenhum" não é objeção: casa sem sistema não diz "já tenho sistema"');
ok(objecoesDaCasa(lc, { sistema: 'caderno' }).length === 0, 'caderno e papel também não são sistema');

const soDor = objecoesDaCasa(lc, { dor: 'internet cai no pico' });
ok(soDor.length >= 1 && soDor[0].objecao.id === 'objecoes-internet', 'a dor manda: internet puxa a objeção da internet');
ok(soDor[0].motivo === 'internet cai no pico', 'o motivo curto é a própria dor');

const dois = objecoesDaCasa(lc, { sistema: 'Saipos', dor: 'internet cai no pico' });
ok(dois.length === 2, 'no máximo duas linhas de 44 px');
ok(dois[0].objecao.id === 'objecoes-internet', 'a dor vem antes do sistema: foi o dono que falou');
ok(dois[1].objecao.id === 'objecoes-ja-tenho' && dois[1].motivo === 'usa Saipos', 'o sistema traz "já tenho sistema", com o motivo dizendo qual');
ok(new Set(dois.map((d) => d.objecao.id)).size === 2, 'nunca a mesma objeção duas vezes');

const soSistema = objecoesDaCasa(lc, { sistema: 'Colibri' });
ok(soSistema.length === 2 && soSistema[0].objecao.id === 'objecoes-ja-tenho', 'só o sistema: ele completa as duas vagas sozinho');
ok(objecoesDaCasa(lc, { sistema: 'Colibri' }, 1).length === 1, 'o máximo é respeitado');
ok(objecoesDaCasa([], { dor: 'fila no caixa' }).length === 0, 'playbook sem objeções não inventa linha');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nobjeções: tudo certo');
