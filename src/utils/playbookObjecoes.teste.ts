// Teste do "O dono disse…" (handoff das abas). Roda: npx tsx src/utils/playbookObjecoes.teste.ts
import { buscarObjecoes, frases, objecoesDoPlaybook, type Playbook } from './playbook';

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

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nobjeções: tudo certo');
