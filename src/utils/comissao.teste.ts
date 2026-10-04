// Teste do variável e da semana do plano (Fase 0 das abas). Roda: npx tsx src/utils/comissao.teste.ts
import { faixaDe, proximaVenda, variavelDoMes, type TabelaComissao } from './comissao';
import { resumoDaSemana } from './semanaDoPlano';

let falhas = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log('OK   ', msg); else { falhas++; console.log('FALHA', msg); } };

// Faixas de EXEMPLO com a forma do banco (a tabela real só vem por faixas_comissao()).
const t: TabelaComissao = {
  modelo: 'retroativo',
  faixas: [
    { de: 0, ate: 5, porCliente: 10 },
    { de: 6, ate: 7, porCliente: 12 },
    { de: 8, ate: null, porCliente: 20 },
  ],
};
ok(faixaDe(0, t.faixas)?.porCliente === 10, 'zero clientes cai na primeira faixa');
ok(faixaDe(7, t.faixas)?.porCliente === 12 && faixaDe(99, t.faixas)?.porCliente === 20, 'limites e faixa aberta');
ok(variavelDoMes(0, t) === 0, 'mês sem cliente = 0');
ok(variavelDoMes(5, t) === 50, '5 × 10');
ok(variavelDoMes(6, t) === 72, 'retroativo: 6 × 12, não 5×10 + 12');
const p5 = proximaVenda(5, t);
ok(p5.vale === 22 && p5.mudaFaixa && p5.total === 50, 'a 6ª venda vale o salto da faixa (+22) e avisa que muda');
const p6 = proximaVenda(6, t);
ok(p6.vale === 12 && !p6.mudaFaixa, 'dentro da faixa vale o porCliente');
ok(proximaVenda(0, t).vale === 10 && !proximaVenda(0, t).mudaFaixa, 'primeira venda do mês não é "mudar de faixa"');
const m: TabelaComissao = { ...t, modelo: 'marginal' };
ok(variavelDoMes(6, m) === 62, 'marginal: 5×10 + 12');

// Semana do plano: a grade guarda null, texto simples e objeto; '__' é marcação interna.
const grade = [
  [{ p: 'funil', id: 'c-1', hora: '13:00' }, { p: 'funil', id: 'c-2' }, { p: 'follow', id: 'c-3' }, null],
  [null, null],
  ['c-9', { p: 'rua', id: 'n-x' }, { id: '__reserva' }],
  [{ p: 'follow', id: 'c-4' }, { p: 'cobrar', id: 'c-5' }],
];
const s = resumoDaSemana(grade, '2026-10-05');
ok(s.length === 5 && s[0].iso === '2026-10-05' && s[4].iso === '2026-10-09', 'seg a sex, datas certas');
ok(s[0].proposito === 'funil' && s[0].faixas.length === 3 && s[0].comHora === 1, 'propósito = o que mais aparece; conta hora');
ok(s[1].proposito === null && s[1].faixas.length === 0, 'dia vazio');
ok(s[2].faixas.length === 2 && s[2].proposito === 'rua', 'texto simples entra, "__" sai');
ok(s[3].proposito === 'follow', 'empate fica com o primeiro da grade');
ok(s[4].faixas.length === 0, 'dia que falta na grade');
ok(resumoDaSemana(null, '2026-10-05').every((d) => d.faixas.length === 0), 'sem grade não quebra');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
