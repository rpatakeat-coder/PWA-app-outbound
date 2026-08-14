// Teste das contas de data em horario de Brasilia.
//
// Rode com:  npx tsx src/dados/datas.teste.ts
//
// Existe porque "datas em UTC" e' o primeiro erro da tabela de armadilhas do
// doc (10-PLANO-DE-IMPLEMENTACAO.md): entre 21h e 23h59 a janela do dia virava
// e as visitas sumiam da tela. E' um bug que so' aparece a noite, que ninguem
// reproduz de manha, e que faz o gestor cobrar visita que a pessoa fez.
//
// Sem framework de proposito: o projeto nao tem runner configurado, e um
// arquivo que roda com `npx tsx` continua sendo executavel daqui a um ano.
import { diaBRT, ehDiaUtil, diasUteisAte, segundaDaSemana, diasDaSemana } from './datas';

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

console.log('--- a virada das 21h, o bug que o doc manda evitar ---');
// 14/08 00:30 UTC = 13/08 21:30 em Brasilia. toISOString() diria 14; BRT diz 13.
ok('00:30Z vira dia anterior em BRT', diaBRT('2026-08-14T00:30:00Z'), '2026-08-13');
ok('02:59Z ainda e o dia anterior', diaBRT('2026-08-14T02:59:00Z'), '2026-08-13');
ok('03:00Z ja e o dia seguinte', diaBRT('2026-08-14T03:00:00Z'), '2026-08-14');
ok('meio-dia UTC nao escorrega', diaBRT('2026-08-14T12:00:00Z'), '2026-08-14');
console.log('  (o bug seria usar toISOString().slice(0,10), que da 2026-08-14 no 1o caso)');

console.log('\n--- dia util ---');
ok('sexta 14/08 e util', ehDiaUtil('2026-08-14'), true);
ok('sabado 15/08 nao e', ehDiaUtil('2026-08-15'), false);
ok('domingo 16/08 nao e', ehDiaUtil('2026-08-16'), false);
ok('segunda 17/08 e util', ehDiaUtil('2026-08-17'), true);

console.log('\n--- ultimos dias uteis ---');
ok('a partir de sexta 14/08', diasUteisAte('2026-08-14', 5), [
  '2026-08-14',
  '2026-08-13',
  '2026-08-12',
  '2026-08-11',
  '2026-08-10',
]);
ok('a partir de segunda 17/08 pula o fim de semana', diasUteisAte('2026-08-17', 5), [
  '2026-08-17',
  '2026-08-14',
  '2026-08-13',
  '2026-08-12',
  '2026-08-11',
]);
ok('a partir de domingo 16/08 (nao util) volta pros uteis', diasUteisAte('2026-08-16', 3), [
  '2026-08-14',
  '2026-08-13',
  '2026-08-12',
]);
ok('atravessa a virada do mes', diasUteisAte('2026-09-01', 3), [
  '2026-09-01',
  '2026-08-31',
  '2026-08-28',
]);
ok('60 dias uteis nao trava nem repete', new Set(diasUteisAte('2026-08-14', 60)).size, 60);

console.log('\n--- semana CIVIL (segunda 00:00), nunca rolante ---');
// 14/08/2026 e' sexta; a segunda da semana e' 10/08.
ok('sexta 14/08 -> segunda 10/08', segundaDaSemana('2026-08-14'), '2026-08-10');
ok('a propria segunda nao se move', segundaDaSemana('2026-08-10'), '2026-08-10');
ok('sabado 15/08 ainda e a semana do 10', segundaDaSemana('2026-08-15'), '2026-08-10');
ok('domingo 16/08 FECHA a semana do 10, nao abre a do 17', segundaDaSemana('2026-08-16'), '2026-08-10');
ok('segunda 17/08 abre a semana seguinte', segundaDaSemana('2026-08-17'), '2026-08-17');
ok('semana de sexta 14/08', diasDaSemana('2026-08-14'), [
  '2026-08-10',
  '2026-08-11',
  '2026-08-12',
  '2026-08-13',
  '2026-08-14',
]);
ok('semana que atravessa o mes', diasDaSemana('2026-09-02'), [
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
]);
ok('todo dia da semana e util', diasDaSemana('2026-08-14').every(ehDiaUtil), true);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`);
// throw em vez de process.exit: o tsconfig deste app e' de browser e nao tem
// @types/node, entao `process` nao existe pro compilador. O throw tambem sai
// com codigo 1, que e' o que um runner de CI precisa.
if (falhas) throw new Error(`${falhas} teste(s) de data falharam`);
