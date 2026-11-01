// Teste do Desenvolvimento v2 (handoff de 01/11/26): as frases e os estados de cada bloco, e a PARIDADE
// com o Cockpit. A fixture (desenvolvimentoV2.fixture.json) e a saída esperada (desenvolvimentoV2.esperado.json)
// são as mesmas de scripts/fixtures/desenvolvimento-v2/ no cockpit-unificado, onde DV2 formata os mesmos
// quadros: se um lado mudar uma frase ou uma conta e o outro não, uma das duas suítes cai.
//
// Rode com:  npx tsx src/utils/desenvolvimentoV2.teste.ts
// Para regravar a esperada depois de uma mudança combinada nos dois lados: GERAR=1 npx tsx ...
// (e copie o arquivo para o cockpit-unificado).
import * as fs from 'fs';
import * as path from 'path';
import {
  montarDesenvolvimento, menorAcao, pushSegunda, pushSexta, toastDaConquista, sequenciaUtil, recordeUtil, totalDe,
  type Quadro, type Capitulo, type Faixa,
} from '../../supabase/functions/_compartilhado/desenvolvimentoV2';
import { feriadosNacionais } from '../../supabase/functions/_compartilhado/filaDoDinheiro';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

type Fixture = { capitulos: Capitulo[]; faixas: Faixa[]; estados: Record<string, Record<string, unknown>>; sequenciaComFeriado: { casos: Array<{ nome: string; dias: string[]; hoje: string; atual: number; recorde: number }> } };
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'desenvolvimentoV2.fixture.json'), 'utf8')) as Fixture;
/* "$base" herda o estado indicado (só o primeiro nível) e "$faixas" vira a tabela do variável — a
   MESMA resolução da suíte do Cockpit */
function resolver(nome: string): Quadro {
  const e = F.estados[nome];
  const base = e.$base ? resolver(String(e.$base)) : {};
  const q = Object.assign({}, base, e) as Record<string, unknown>;
  delete q.$base;
  const v = q.variavel as Record<string, unknown> | null;
  if (v && v.faixas === '$faixas') q.variavel = Object.assign({}, v, { faixas: F.faixas });
  return q as unknown as Quadro;
}
const saida: Record<string, unknown> = {};
for (const nome of Object.keys(F.estados)) {
  const q = resolver(nome);
  const vm = montarDesenvolvimento(q, F.capitulos);
  saida[nome] = { vm, pushSegunda: pushSegunda(q), pushSexta: pushSexta(q), toasts: vm.novas.map(toastDaConquista) };
}
const V = (n: string) => (saida[n] as { vm: ReturnType<typeof montarDesenvolvimento> }).vm;

// ── as regras, uma a uma ──
ok(V('quarta').semana.proximo === 'Faltam 19 pts para passar Gama. Uma demo (25) já passa.', 'o próximo a passar vem com a menor ação que resolve');
ok(V('quarta').semana.podio.map((p) => p.lugar).join(' ') === '2º 1º 3º' && V('quarta').semana.podio[2].nome === 'você', 'pódio em 2º · 1º · 3º, a pessoa como "você"');
ok(Object.keys(saida).every((n) => V(n).semana.podio.length <= 3), 'ninguém aparece abaixo do 3º: o pódio tem no máximo 3');
ok(menorAcao(3) === 'Uma visita com prova já passa.' && menorAcao(6) === 'Duas visitas com prova passam.' && menorAcao(57) === 'Três demos passam.' && menorAcao(50) === 'Duas demos passam.', 'a menor ação: visita 3, demo 25');
ok(V('lider').semana.proximo === 'Você lidera com 56 pts de vantagem sobre Gama.' && V('lider').semana.posTom === 'ok', 'quem lidera vê a vantagem, em verde');
ok(V('segunda').semana.podio.length === 0 && /todo mundo com 0/.test(V('segunda').semana.proximo), 'segunda 8h: o pódio some e a semana começa do zero');
ok(V('novato').semana.podio.length === 0 && V('novato').semana.proximo === 'Na rampa, a sua disputa é com você: 61 pts nesta semana, 43 na passada.', 'novato não compete em degrau: você contra você');
ok(V('novato').missao.titulo === 'Fazer 4 visitas com prova por dia útil' && V('novato').missao.contagem === '2 de 3', 'novato: a missão da fase da rampa');
ok(V('novato').carreira.degraus[0].crit.length === 4 && V('novato').carreira.degraus[0].barra!.t === 'dia 12 de 60 · formatura em 29/12', 'novato: a trilha da rampa com as 4 fases e a formatura');
ok(V('quarta').variavel.titulo === 'A 6ª venda muda a faixa: +R$ 550.', 'a escada: a 6ª venda vale +R$ 550 (6 × 300 − 5 × 250, retroativo)');
ok(V('segunda').variavel.titulo === 'A 7ª venda vale +R$ 300.' && V('segunda').variavel.sub === 'Faltam 2 vendas para a faixa de +R$ 400 por venda.', 'a escada no caso normal');
ok(totalDe(F.faixas, 5) === 1250 && totalDe(F.faixas, 6) === 1800, 'o total do variável é o retroativo do comissionamento');
ok(V('quarta').variavel.rodape === 'R$ 1.250 em novembro até aqui · comissionamento.json', 'o rodapé do variável diz a fonte');
ok(V('missao').missao.cumprida && V('missao').missao.kicker === 'MISSÃO CUMPRIDA' && V('missao').colecao.itens[0].ganha, 'missão cumprida fecha sozinha pela prova');
ok(V('missao').colecao.itens.some((m) => m.id === 'missao:naHora' && m.nova && m.d === 'novo · hoje'), 'a medalha nova fica destacada: "novo · hoje"');
ok(V('missao').novas.length === 1 && V('missao').novas[0].titulo === 'Selo Registro na hora', 'a conquista não vista vira o toast');
ok((saida.missao as { toasts: Array<{ kicker: string }> }).toasts[0].kicker === 'CONQUISTA DESBLOQUEADA', 'o toast diz CONQUISTA DESBLOQUEADA');
ok(V('convites').habilidade.modo === 'convite' && /Sugestão pelo seu maior gap com o time: Sair com o dono/.test(V('convites').habilidade.conviteS), 'sem habilidade: o convite com a sugestão do maior gap (nunca bloco vazio)');
ok(V('convites').umAUm.convite && /Ainda sem 1:1 registrado/.test(V('convites').umAUm.texto), 'sem 1:1: o convite do README');
ok(V('lider').habilidade.bateu && /entrou na coleção/.test(V('lider').habilidade.falta), 'habilidade batida vira medalha');
ok(V('quarta').carreira.liderN === 2 && V('quarta').carreira.degraus[2].crit[0].s === '2 de 3 · falta 1 mês: outubro ficou em 5,7', 'líder de praça: os 4 critérios, com o próximo passo escrito');
ok(V('quarta').carreira.degraus[2].proximo === 'Próximo passo: 2 de 3 · falta 1 mês: outubro ficou em 5,7.', 'o próximo passo vem sempre escrito');
ok(V('quarta').playbook.nivel === 2 && V('quarta').playbook.titulo === 'Playbook · nível 2 de 6', 'Playbook: o nível é o capítulo em que está (ler sem o quiz não sobe)');
ok(V('quarta').colecao.reconhecimento === 'Você foi o destaque da semana em Ficha na hora (97% em até 15 min) · sex 06/11', 'o reconhecimento da sexta aparece para o executivo');
ok(V('quarta').pilula === 'Missão 1 de 2 · Na rua 4 dias', 'a pílula do Hoje');
ok((saida.quarta as { pushSegunda: { texto: string } }).pushSegunda.texto === 'Registrar o como foi antes de ligar o carro · 2 dias · selo Registro na hora', 'o push de segunda');
ok((saida.quarta as { pushSexta: { texto: string } }).pushSexta.texto === 'Você fechou a semana com 212 pts, 3º · seu recorde é 348', 'o push de sexta diz posição e recorde');
ok(Object.keys(saida).every((n) => !/último|pior/i.test(JSON.stringify(saida[n]))), 'nenhum texto diz "último" ou "pior"');

// ── feriado e fim de semana ──
ok(V('feriado2025').sequencias.notaTom === 'av' && V('feriado2025').sequencias.nota === 'Feriado não conta: qui 20/11 (Consciência Negra) não apagou a sua sequência.', 'quinta 20/11/2025: a nota do feriado');
ok(V('feriado2025').sequencias.itens[0].dias[3].st === 'fer' && V('feriado2025').sequencias.itens[0].dias[3].rotulo === 'feriado', 'o feriado aparece hachurado na tira, com o rótulo "feriado"');
ok(V('feriado2026').missao.nota === 'O feriado de sex 20/11 não conta: o prazo é qui 19/11, com 4 dias úteis.', '20/11/2026 (sexta): o prazo da missão conta dias úteis');
ok(V('feriado2025').missao.nota === 'O feriado de qui 20/11 não conta: o prazo é sex 21/11, com 4 dias úteis.', '20/11/2025 (quinta): o prazo da missão conta dias úteis');
const fer = [...feriadosNacionais(2025), ...feriadosNacionais(2026)];
ok(fer.indexOf('2026-11-20') >= 0 && fer.indexOf('2025-11-20') >= 0, '20/11 é feriado nacional nos dois anos');
for (const c of F.sequenciaComFeriado.casos) {
  ok(sequenciaUtil(c.dias, c.hoje, fer) === c.atual && recordeUtil(c.dias, fer) === c.recorde, 'sequência: ' + c.nome);
}

// ── fonte fora do ar: "—" com o nome da fonte, nunca 0 ──
const fora = JSON.stringify(V('fora'));
ok(V('fora').semana.pts === '—' && /placar_da_semana/.test(V('fora').semana.posTexto), 'placar fora: "—" e o nome da fonte');
ok(V('fora').variavel.titulo === '—' && /HubSpot/.test(V('fora').variavel.sub), 'variável fora: "—" e o nome da fonte');
ok(V('fora').missao.contagem === '—' && V('fora').colecao.n === '—', 'missão e coleção fora: "—"');
ok(!/"0 de|: 0 dias|"0 pts/.test(fora), 'com a fonte fora, nenhum zero inventado');

// ── zero emoji ──
ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(JSON.stringify(saida)), 'zero emoji em todos os textos');

// ── a paridade: a saída é a MESMA que o Cockpit compara ──
const arq = path.join(__dirname, 'desenvolvimentoV2.esperado.json');
const atual = JSON.stringify(saida, null, 1) + '\n';
if (process.env.GERAR === '1') { fs.writeFileSync(arq, atual); console.log('esperado regravado: ' + arq); }
const esperado = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').replace(/\r\n/g, '\n') : '';
ok(esperado === atual, 'a saída é igual à esperada (a mesma que o DV2 do Cockpit compara)');

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
