// Teste do Hoje do Cockpit no celular (24/11/26).
//
// Rode com:  npx tsx src/utils/hojeComoCockpit.teste.ts
//
// As contas de hojeComoCockpit.ts são as do GV2.H5 do Cockpit. Na implementação, um comparador recortou o
// H5 do template e rodou as duas versões lado a lado (1.075 saídas iguais, 0 diferentes; vermelho ao mudar
// a janela do horário fixo ou a escada). Aqui ficam os valores que o Cockpit deu, para a prova não depender
// da pasta do cockpit-unificado.
import { cobrar, dinheiro, etapas, frase, mes, paradas, proxima, rodape, semana, textoDoAcumulo, textoDoBonus } from './hojeComoCockpit';

let falhas = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };
const FER = ['2026-11-20', '2026-11-02'];
// a tabela do variável (data/comissionamento.json do Cockpit, retroativa)
const FX = [{ de: 0, ate: 5, porCliente: 250 }, { de: 6, ate: 7, porCliente: 300 }, { de: 8, ate: 9, porCliente: 400 }, { de: 10, ate: 14, porCliente: 500 }, { de: 15, ate: null, porCliente: 550 }];

// o mês: novembro/26 tem 19 dias úteis (2 e 20 são feriado); até 24/11 são 15
const m = mes(5, 8, '2026-11-24', FER);
ok(m.uteis === 19 && m.ate === 15 && m.esperado === 6 && m.falta === 3 && m.restam === 4, 'mês: 19 úteis, 15 até hoje, esperado 6, faltam 3 em 4');
ok(m.ritmo?.t === 'abaixo do ritmo', 'mês: 5 de 8 com esperado 6 = abaixo do ritmo');
ok(mes(0, 0, '2026-11-24', FER).ritmo === null, 'sem meta, sem ritmo');

// o dinheiro: o Julyan na tela do Cockpit (0 vendas): R$ 0, a próxima +R$ 250, o salto da 6ª +R$ 550
const d0 = dinheiro({ vendas: 0, meta: 0, faixas: FX })!;
ok(d0.total === 0 && d0.proxima === 250 && d0.degrau?.clientes === 6 && d0.degrau.salto === 550 && d0.degrau.total === 1800, 'dinheiro 0: +250, salto da 6ª +550 (R$ 1.800)');
const d5 = dinheiro({ vendas: 5, meta: 8, faixas: FX })!;
ok(d5.total === 1250 && d5.proxima === 550 && d5.naMeta?.total === 3200 && d5.naMeta.rende === 1100, 'dinheiro 5/8: R$ 1.250, a 6ª vale +550, na meta R$ 3.200 (a 8ª rende +1.100)');
ok(d5.escada.map((g) => g.k).join(',') === 'feita,feita,feita,feita,feita,prox,futura,futura', 'escada: 5 feitas, a 6ª é a próxima, até a meta');
ok(dinheiro({ vendas: 3, meta: 8, faixas: [] }) === null, 'sem tabela: null (a tela diz "fonte fora", nunca inventa)');

// as paradas e a próxima
const plano = [{ id: 'a', nome: 'A', sub: '', feita: false, hora: null }, { id: 'b', nome: 'B', sub: '', feita: false, hora: '14:30' }, { id: 'c', nome: 'C', sub: '', feita: true, hora: null }];
ok(proxima(plano, 9 * 60) === 0, 'às 9h a próxima é a 1ª que falta');
ok(proxima(plano, 13 * 60 + 40) === 1, 'a 50 min do horário fixo, ele fura a ordem');
const ps = paradas(plano, 'rua', 9 * 60);
ok(ps[0].est.t === 'a próxima' && ps[1].est.t === 'horário fixo · 14h30' && ps[2].est.t === 'feita no app', 'etiquetas: a próxima, horário fixo, feita no app');
ok(rodape(ps, 'rua').t === 'B às 14h30, horário fixo.', 'rodapé: o horário fixo que vence hoje');
ok(rodape(paradas(plano, 'fecho', 19 * 60), 'fecho').t === 'As 2 que ficaram para trás voltam para a fila de amanhã.', 'rodapé do fecho');

// a frase (a do Julyan no Cockpit em 24/11, 11h36)
ok(frase('antes', { visitas: 0, meta: 6, demos: 0, metaDemo: 1, semPlano: true, paradas: [] }, mes(0, 0, '2026-11-24', FER), d0) === 'Hoje: 6 visitas e 1 demo. Sua próxima venda vale R$ 250.', 'frase antes de sair = a do Cockpit');
ok(frase('rua', { visitas: 2, meta: 6, demos: 0, metaDemo: 1, semPlano: false, paradas: ps }, m, d5) === 'A próxima é A. Faltam 4 visitas e a demo de hoje.', 'frase na rua');
ok(frase('fecho', { visitas: 7, meta: 6, demos: 1, metaDemo: 1, semPlano: false, paradas: paradas(plano, 'fecho', 1100) }, m, d5) === 'O dia fechou com 7 visitas, acima da meta de 6. 2 paradas ficaram para trás.', 'frase do fecho');

// o que cobrar e as etapas: Negociação primeiro, no máximo 4 linhas, Ag. Pagamento fora
const E = etapas([
  { etapaIdx: 4, dias: 9, regua: 7, combinadoFuturo: false }, { etapaIdx: 4, dias: 9, regua: 7, combinadoFuturo: true },
  { etapaIdx: 1, dias: 6, regua: 5, combinadoFuturo: false }, { etapaIdx: 1, dias: 6, regua: 5, combinadoFuturo: false }, { etapaIdx: 1, dias: 2, regua: 5, combinadoFuturo: false },
  { etapaIdx: 5, dias: 30, regua: 2, combinadoFuturo: false },
]);
ok(E.por[4].parados === 1 && E.por[1].parados === 2 && E.por[5].parados === 0 && E.pior === 1 && E.abertos === 6 && E.parados === 3, 'parados: passou da régua sem data combinada; Ag. Pagamento fora');
ok(textoDoAcumulo(E, (i) => ['Prospecção', 'Visita'][i] ?? '?') === 'Visita é a mais entupida · 3 parados de 6', 'etapa com acúmulo');
const c = cobrar([0, 1, 1, 2, 3, 4, 5].map((i, k) => ({ etapaIdx: i, item: 'n' + k })), E);
ok(c.total === 7 && c.linhas.map((x) => x.idx).join(',') === '4,3,2,1' && c.mais === 1 && c.linhas[3].n === 2 && c.linhas[3].pior, 'cobrar: Negociação › Demo › Decisor › Visita, +1 de fora');

// a semana e o bônus
const S = semana({ segunda: '2026-11-23', sexta: '2026-11-27', premio: 250, linhas: [{ pos: 1, nome: 'Sérgio Caetano', pontos: 137 }, { pos: 2, nome: 'Sandro Brito', pontos: 43, euMesmo: true }, { pos: 3, nome: 'Allef', pontos: 40 }] })!;
ok(S.fim === '2026-11-29' && S.falta === 95 && S.acima?.nome === 'Sérgio Caetano', 'semana: até domingo; faltam 95 para passar o 1º');
ok(textoDoBonus(S) === 'Bônus da semana, R$ 250: faltam 95 pts para passar Sérgio. Quatro demos passam.', 'a linha do bônus');
ok(semana({ segunda: '2026-11-23', linhas: [{ pos: 1, nome: 'X', pontos: 3 }] })!.eu === null, 'fora do placar: sem "eu"');

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
if (falhas) process.exit(1);
