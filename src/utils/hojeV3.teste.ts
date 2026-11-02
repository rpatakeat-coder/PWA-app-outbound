// Teste do Hoje v3 (handoff de 01/11/26): as frases de cada momento do dia e a PARIDADE com o Cockpit.
// A fixture (hojeV3.fixture.json) e a saída esperada (hojeV3.esperado.json) são as mesmas de
// scripts/fixtures/hoje-v3/ no cockpit-unificado, onde o HJ3 do gv2-js monta o mesmo dia: se um lado
// mudar uma frase ou uma conta e o outro não, uma das duas suítes cai.
//
// "Sem próximo passo" é provado com negócios e tarefas: aqui pela montarFila (a regra da Edge fila-tarefas)
// e semProximoPassoDaFila; no Cockpit pelo GV2.semProximoPasso. Os dois têm de achar os mesmos negócios.
//
// Rode com:  npx tsx src/utils/hojeV3.teste.ts
// Para regravar a esperada depois de uma mudança combinada nos dois lados: GERAR=1 npx tsx ...
// (e copie o arquivo para o cockpit-unificado).
import * as fs from 'fs';
import * as path from 'path';
import {
  chipsDeDia, diaDoExecutivo, ordemPorDinheiro, semProximoPassoDaFila, sugestoes, toastCheguei, toastFicha,
  type EntradaDoDia, type EntradaSug, type LeadOrdem,
} from '../../supabase/functions/_compartilhado/hojeV3';
import { feriadosNacionais, montarFila, type NegocioEntrada, type TarefaEntrada } from '../../supabase/functions/_compartilhado/filaDoDinheiro';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

type NegFix = { id: string; nome: string; etapa: string; tarefas: Array<string | null>; noPlano: string | null };
type Fixture = {
  feriados: string[];
  estados: Record<string, Record<string, unknown>>;
  chips: Array<{ hoje: string; comHoje: boolean }>;
  toasts: { cheguei: Array<Parameters<typeof toastCheguei>[0]>; ficha: Array<Parameters<typeof toastFicha>[0]> };
  sugestoes: EntradaSug;
  ordem: LeadOrdem[];
  semPasso: { hoje: string; negocios: NegFix[] };
};
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'hojeV3.fixture.json'), 'utf8')) as Fixture;
/* "$base" herda o estado indicado (só o primeiro nível): a MESMA resolução da suíte do Cockpit */
function resolver(nome: string): EntradaDoDia {
  const e = F.estados[nome];
  const base = e.$base ? resolver(String(e.$base)) : {};
  const q = Object.assign({}, base, e) as Record<string, unknown>;
  delete q.$base;
  return q as unknown as EntradaDoDia;
}

/* o "sem próximo passo" pela regra de verdade da fila: negócios + tarefas → montarFila → a contagem */
const ETAPA: Record<string, string> = {
  prospeccao: '1395880469', visita: '1396005401', decisor: '1395880470', demo: '1395880471', negociacao: '1395880472', pagamento: '1395880473',
};
function semPassoPelaFila(sp: Fixture['semPasso']): string[] {
  const negocios: NegocioEntrada[] = sp.negocios.map((n) => ({
    dealId: n.id, nome: n.nome, etapaId: ETAPA[n.etapa], mrr: null, temperatura: null, diasNaEtapa: 5, pessoa: null, papel: null,
    temTelefone: true, clientId: null, lat: null, lng: null,
  }));
  const tarefas: TarefaEntrada[] = [];
  sp.negocios.forEach((n) => n.tarefas.forEach((t, k) => tarefas.push({ id: n.id + '-' + k, dealId: n.id, assunto: 'Ligar', venceEm: t })));
  const agendaHoje: Record<string, string> = {};
  const passoFuturo: string[] = [];
  sp.negocios.forEach((n) => {
    if (n.noPlano === sp.hoje) agendaHoje[n.id] = '10h';
    else if (n.noPlano && n.noPlano > sp.hoje) passoFuturo.push(n.id);
  });
  const itens = montarFila(negocios, tarefas, {
    hoje: sp.hoje, feriados: feriadosNacionais(2026), contatos: {}, decisorAlcancado: [], visitaHojeSemRegistro: {}, agendaHoje, passoFuturo,
  });
  return semProximoPassoDaFila(itens).ids.sort((a, b) => Number(a) - Number(b));
}

const saida = {
  estados: {} as Record<string, unknown>,
  chips: F.chips.map((c) => chipsDeDia(c.hoje, F.feriados, c.comHoje)),
  toasts: { cheguei: F.toasts.cheguei.map(toastCheguei), ficha: F.toasts.ficha.map(toastFicha) },
  sugestoes: sugestoes(F.sugestoes),
  ordem: ordemPorDinheiro(F.ordem).map((l) => l.nome),
  semPasso: semPassoPelaFila(F.semPasso),
};
for (const nome of Object.keys(F.estados)) saida.estados[nome] = diaDoExecutivo(resolver(nome));
const V = (n: string) => saida.estados[n] as ReturnType<typeof diaDoExecutivo>;

// ── as regras, uma a uma ──
ok(V('manha').folha.mostra && V('manha').folha.titulo === 'Bom dia, Kelly.' && V('manha').folha.kicker === 'SEU DIA EM 30 SEGUNDOS', 'a folha da manhã: "seu dia em 30 segundos" e o bom dia');
ok(V('manha').folha.plano.titulo === 'Plano de hoje: 7 paradas' && V('manha').folha.plano.sub === '1ª às 09:00 em Madureira · Feijoada da Portela', 'linha 1: o plano, a 1ª parada e o bairro');
ok(V('manha').folha.vencem!.titulo === '2 passos vencem hoje' && V('manha').folha.vencem!.sub === 'ligar Cantina Sole Mare às 12:30 · WhatsApp Empório Carioca às 16:00', 'linha 2: os passos que vencem hoje');
ok(V('manha').folha.sem!.titulo === '12 sem próximo passo' && V('manha').folha.sem!.linhas.length === 3 && V('manha').folha.sem!.mais === '+ 9 no Planejamento e no Hoje do Cockpit · o mesmo número', 'linha 3: o número único, os 3 primeiros e "+ 9 … o mesmo número"');
ok(V('manha').folha.sem!.linhas[0].sugT === 'Pôr em qui 12/11' && V('manha').folha.sem!.linhas[0].sugS === 'sugerido · mesmo bairro do dia', 'o atalho do Planejamento v3: "Pôr em qui 12/11 · sugerido"');
ok(V('manhaSem').folha.plano.titulo === 'Nada no plano de hoje' && V('manhaSem').folha.plano.montar === 'Montar o dia · 6 sugestões', 'sem plano: "Montar o dia · 6 sugestões"');
ok(V('manhaOk').folha.emOrdem && !V('manha').folha.emOrdem && V('manhaOk').folha.sem === null && V('manhaOk').folha.vencem === null, 'tudo em ordem: a folha vira "Dia em ordem"');
ok(V('seguinte').folha.ontem!.titulo === 'Ontem (qua 11/11) ficou sem fechar: 2 sem próximo passo' && !V('seguinte').folha.emOrdem, 'a manhã seguinte sem fecho: as pendências de ontem no topo');
ok(!V('feriado').folha.mostra && V('feriado').push08 === null && V('feriado').push18 === null, 'feriado: sem folha e sem push');
ok(V('feriado').feriado!.texto === 'Feriado · Consciência Negra. Sem folha da manhã, sem push e sem cobrança. A sequência não apaga.', 'feriado: "Sem expediente hoje" com o nome');
ok(!V('fimDeSemana').folha.mostra && V('fimDeSemana').pilula.l1 === 'Fim de semana · sem expediente', 'fim de semana: sem folha, pílula neutra');
ok(V('manha').pilula.l1 === '0 de 6 com prova · 7 paradas hoje' && V('manha').pilula.l2 === 'sequência 4 dias · missão 1 de 2', 'a pílula antes do 1º check-in');
ok(V('meioDia').pilula.n === '4' && V('meioDia').pilula.l1 === '4 de 6 com prova · 2 sem prova · 37 pts na semana' && V('meioDia').pilula.l2 === 'faltam 10 para passar o 2º · sequência 5 dias', 'a pílula ao meio-dia: com prova, sem prova, pontos e "faltam 10"');
ok(V('fecho0').pilula.tom === 'ok' && V('meioDia').pilula.tom === 'acao', 'a pílula fica verde quando bate a meta com prova');
ok(V('meioDia').porta!.kicker === 'PRÓXIMA PORTA · 7 DE 7' && V('meioDia').porta!.sub === 'Visita · ≈ 16:10 · 350 m', 'o cartão da próxima porta');
ok(V('manha').porta!.vence === null && saida.estados.manha !== null, 'a 1ª porta sem passo vencendo não tem o selo');
ok(V('fecho2').fecho.titulo === '6 portas · 2 sem próximo passo' && V('fecho2').fecho.botao === 'fechar mesmo assim', 'o fecho com pendência: "fechar mesmo assim"');
ok(V('fecho0').fecho.titulo === '6 portas · todas com próximo passo' && V('fecho0').fecho.botao === 'Fechar o dia', 'o fecho sem pendência: "Fechar o dia"');
ok(V('fecho2').checkout.texto === '6 portas · 2 ficaram sem passo e voltam amanhã às 8h', 'fechou com pendência: volta amanhã às 8h');
ok(V('fecho0').checkout.texto === '6 portas · todas com próximo passo · sequência 5 dias' && V('fecho0').checkout.chips.indexOf('missão cumprida') >= 0, 'o check-out com recompensa');
ok(V('manha').push08!.titulo === '7 paradas hoje · 12 leads sem passo' && V('manha').push08!.texto === '1ª às 09:00 em Madureira · toque para ver o seu dia em 30 segundos', 'o push das 8h (README §6)');
ok(V('manhaSem').push08!.titulo === 'Nada no plano de hoje · 12 leads sem passo' && V('manhaSem').push08!.texto === 'monte o dia com 6 sugestões em 1 toque', 'o push das 8h sem plano');
ok(V('fecho2').push18!.titulo === 'Feche o dia: 6 portas · 2 sem próximo passo' && V('fecho2').push18!.texto === 'leva 1 minuto · conta para a sequência', 'o push das 18h');
ok(V('fecho0').push18!.titulo === 'Feche o dia: 6 portas · todas com próximo passo' && V('fecho0').push18!.texto === '1 toque · sequência 5 dias', 'o push das 18h sem pendência');
ok(V('manha').push18 === null, 'quem não foi à rua não recebe o push do fecho');
ok(V('planoFora').folha.plano.titulo === 'O plano de hoje não respondeu' && V('planoFora').folha.sem!.titulo === '— sem próximo passo' && V('planoFora').cockpit.placar.pts === '—', 'fonte fora: "—", nunca 0');
ok(V('meioDia').cockpit.plano.titulo === 'Próxima porta: Pizzaria Cerqueira · ≈ 16:10' && V('meioDia').cockpit.plano.contagem === '4 de 6 com prova', 'o Hoje do Cockpit · plano de hoje');
ok(V('meioDiaFora').pilula.l1 === '6 de 6 com prova · 2 sem prova · 37 pts na semana' && V('meioDiaFora').pilula.tom === 'ok' && V('meioDiaFora').cockpit.plano.contagem === '6 de 6 com prova', 'o "X de 6 com prova" conta a visita com prova fora do plano (o Cockpit conta dv5.fora)');
ok(V('soFora').pilula.n === '1' && V('soFora').cockpit.plano.contagem === '1 de 6 com prova' && V('soFora').cockpit.plano.titulo === 'Nada no plano de hoje', 'sem plano e uma visita provada fora dele: 1 de 6, o plano segue vazio');
ok(V('meioDia').cockpit.placar.prox ==='Faltam 10 pts para passar Marco.', 'o Hoje do Cockpit · placar: "Faltam 10 pts para passar Marco."');
ok(V('zerada').cockpit.sem.zero && V('zerada').cockpit.sem.n === '0', 'o Hoje do Cockpit · fila zerada');
ok(V('seguinte').cockpit.placar.linhas[2].v === 'Fechou o dia ontem: não', 'o Hoje do Cockpit · "Fechou o dia ontem"');
ok(saida.chips[0].map((c) => c.rot).join(' · ') === 'amanhã · sex 13 · seg 16', 'os chips: amanhã · sex 13 · seg 16');
ok(saida.chips[1].map((c) => c.rot).join(' · ') === 'hoje · sex 13 · seg 16', 'as pendências de ontem: hoje · sex 13 · seg 16');
ok(saida.chips[2].map((c) => c.rot).join(' · ') === 'seg 23 · ter 24 · qua 25', 'o chip pula o feriado (sex 20/11, Consciência Negra)');
ok(saida.toasts.cheguei[0].titulo === '+3 pts · sequência 5 dias' && saida.toasts.cheguei[0].texto === 'check-in com prova · GPS a 12 m · agora a ficha', 'o toast pós-Cheguei');
ok(saida.toasts.cheguei[1].titulo.indexOf('pts') < 0, 'ponto só nasce de prova: restaurante já visitado na semana não ganha "+3"');
ok(saida.toasts.cheguei[2].titulo === 'Check-in sem prova · fora do raio', 'o toast do Cheguei sem prova');
ok(saida.toasts.ficha[1].titulo === 'Sushi Madu ficou sem próximo passo' && saida.toasts.ficha[1].chips, 'o toast pós-ficha sem passo, com os chips');
ok(saida.sugestoes.deLead['c-1'].dia === 4 && saida.sugestoes.deLead['c-1'].mesmo === true && saida.sugestoes.deLead['c-2'].dia === 3 && !saida.sugestoes.deLead['c-2'].mesmo, 'a sugestão: o quente vai ao dia do mesmo bairro com vaga (hoje está cheio); sem bairro igual, ao 1º dia com vaga');
ok(!saida.sugestoes.deLead['c-6'] && !saida.sugestoes.deLead['c-9'], 'sem endereço e já usado não são sugeridos');
ok(saida.ordem.slice(0, 3).join(' · ') === 'Pizzaria Fornalha · Cantina do Porto · Botequim da Praça Seca', 'a fila por dinheiro: etapa, depois o vencido, depois os dias na etapa');
ok(saida.semPasso.join(',') === '1,2,9,11,12', 'sem próximo passo: vencido + nunca marcado, Ag. Pagamento fora (pela montarFila)');
ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(JSON.stringify(saida)), 'zero emoji');
ok(!/último|pior/i.test(JSON.stringify(saida)), 'ninguém é exposto como último ou pior');

// ── a paridade: a mesma saída esperada do Cockpit ──
const arqEsperado = path.join(__dirname, 'hojeV3.esperado.json');
const texto = JSON.stringify(saida, null, 2) + '\n';
if (process.env.GERAR === '1') {
  fs.writeFileSync(arqEsperado, texto);
  console.log('esperada regravada: ' + arqEsperado);
}
const esperado = fs.existsSync(arqEsperado) ? fs.readFileSync(arqEsperado, 'utf8').replace(/\r\n/g, '\n') : '';
ok(esperado === texto, 'a saída é a esperada (a mesma que o Cockpit tem de dar)');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
