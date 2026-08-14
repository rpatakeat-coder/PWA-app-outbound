// Teste das regras de negocio puras.
//
// Rode com:  npx tsx src/dados/regras.teste.ts
//
// `resolverMeta` esta' aqui porque eu ja' errei essa regra DUAS vezes escrevendo
// estas telas — nas duas, tratando os tres estados como dois e mostrando o time
// inteiro como "sem meta" enquanto todos rodavam pela meta global. E' um erro
// que nao levanta excecao, nao aparece em log e so' e' visivel pra quem conhece
// a operacao. Fica travado por teste.
import { resolverMeta, pontosDoDia, ehAvanco, calcularDelta, META_PADRAO } from './regras';

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

console.log('--- meta efetiva: o bug que se repetiu duas vezes ---');
ok('sem meta propria, cai na global', resolverMeta('ativo', undefined, 6), {
  meta: 6,
  ehGlobal: true,
});
ok('meta propria vence a global', resolverMeta('ativo', 10, 6), { meta: 10, ehGlobal: false });
ok("'sem_meta' e' o UNICO caso que zera", resolverMeta('sem_meta', undefined, 6), {
  meta: null,
  ehGlobal: false,
});
ok("'sem_meta' ignora ate meta propria", resolverMeta('sem_meta', 10, 6), {
  meta: null,
  ehGlobal: false,
});
ok('meta propria 0 e valida, nao vira global', resolverMeta('ativo', 0, 6), {
  meta: 0,
  ehGlobal: false,
});
ok('null tratado como ausente', resolverMeta('ativo', null, 6), { meta: 6, ehGlobal: true });
ok('default espelha route_config', META_PADRAO, 6);

console.log('\n--- pontos do dia (pesos do doc) ---');
ok('dia vazio', pontosDoDia({ visitas: 0, avancos: 0, propostas: 0, fechamentos: 0 }), 0);
ok('3 visitas', pontosDoDia({ visitas: 3, avancos: 0, propostas: 0, fechamentos: 0 }), 30);
ok(
  'exemplo do doc: 3 visitas + 1 avanco + 1 proposta',
  pontosDoDia({ visitas: 3, avancos: 1, propostas: 1, fechamentos: 0 }),
  95,
);
ok('1 fechamento vale mais que 9 visitas', pontosDoDia({ visitas: 0, avancos: 0, propostas: 0, fechamentos: 1 }) > pontosDoDia({ visitas: 9, avancos: 0, propostas: 0, fechamentos: 0 }), true);

console.log('\n--- avanco no funil ---');
const ordem = new Map([
  ['Prospecção', 0],
  ['Conversa com decisor', 1],
  ['Demo/Proposta', 2],
  ['Negociação', 3],
  ['Ag. Pagamento', 4],
]);
ok('subiu uma etapa', ehAvanco('Prospecção', 'Conversa com decisor', ordem), true);
ok('pulou etapas ainda e avanco', ehAvanco('Prospecção', 'Negociação', ordem), true);
ok('voltou nao e avanco', ehAvanco('Negociação', 'Prospecção', ordem), false);
ok('mesma etapa nao e avanco', ehAvanco('Negociação', 'Negociação', ordem), false);
ok('de etapa fora do funil nao conta', ehAvanco('Backlog', 'Negociação', ordem), false);
ok('para etapa fora do funil nao conta', ehAvanco('Negociação', 'Perdido', ordem), false);
ok('sem etapa de origem nao conta', ehAvanco(null, 'Negociação', ordem), false);
ok('origem indefinida nao conta', ehAvanco(undefined, 'Negociação', ordem), false);

console.log('\n--- delta: a cor vem do SIGNIFICADO, nao do sinal ---');
ok('mais ganhos e bom', calcularDelta(10, 6).tom, 'bom');
ok('menos ganhos e ruim', calcularDelta(4, 6).tom, 'ruim');
ok('MAIS PERDIDOS e ruim mesmo subindo', calcularDelta(10, 6, true).tom, 'ruim');
ok('menos perdidos e bom mesmo caindo', calcularDelta(4, 6, true).tom, 'bom');
ok('igual e neutro', calcularDelta(6, 6).tom, 'neutro');
ok('igual e neutro tambem invertido', calcularDelta(6, 6, true).tom, 'neutro');
ok('percentual normal', calcularDelta(12, 10).pct, 20);
ok('queda percentual', calcularDelta(8, 10).pct, -20);
ok('base zero nao vira infinito', calcularDelta(5, 0).pct, null);
ok('base zero ainda sabe que melhorou', calcularDelta(5, 0).tom, 'bom');
ok('zero a zero e neutro', calcularDelta(0, 0), {
  atual: 0,
  anterior: 0,
  diferenca: 0,
  pct: null,
  tom: 'neutro',
});
ok('diferenca absoluta', calcularDelta(7, 3).diferenca, 4);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`);
if (falhas) throw new Error(`${falhas} teste(s) de regra falharam`);
