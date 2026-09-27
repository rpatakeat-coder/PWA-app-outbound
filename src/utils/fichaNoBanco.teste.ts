// Teste da linha da ficha no banco (0120). Rode com: npx tsx src/utils/fichaNoBanco.teste.ts
//
// Protege o que o Cockpit vai contar: "como foi" e o próximo passo com a data certa,
// o motivo do perdido só quando é sem interesse, texto vazio virando null (e não ""),
// e a ficha sem "como foi" não virando linha.
import { linhaDaFicha } from './fichaNoBanco';
import { FICHA_VAZIA, type Ficha } from './fichaDeRua';

let falhas = 0;
const ok = (c: boolean, m: string) => { if (c) console.log('OK   ', m); else { falhas++; console.log('FALHA', m); } };

const base = {
  acaoId: 'a1', ownerId: '339921752', clientId: 'c1', dealId: '62606052382', ocorridoEm: '2026-09-28T13:00:00.000Z',
  declarada: false, etapaAntes: 'visita', etapaDepois: null, comFoto: true, bairro: ' Centro ', cidade: 'Vitória', hoje: '2026-09-28',
};

ok(linhaDaFicha(FICHA_VAZIA, base) === null, 'sem "como foi" não vira linha');

const reuniao: Ficha = { ...FICHA_VAZIA, comoFoi: 'falou_com_decisor', proximo: 'reuniao', diasReuniao: 3, decisor: '  Ana  ', papel: 'Dono' as Ficha['papel'], sistema: '', dor: 'Fila', horario: null, motivoPerdido: 'Preço' };
const l1 = linhaDaFicha(reuniao, base)!;
ok(l1.como_foi === 'falou_com_decisor' && l1.proximo === 'reuniao', 'como foi e próximo');
ok(l1.proximo_tipo === 'reuniao' && !!l1.proximo_em && l1.proximo_em > '2026-09-28', 'reunião ganha data futura: ' + l1.proximo_em);
ok(l1.decisor_nome === 'Ana', 'nome do decisor aparado');
ok(l1.sistema === null, 'texto vazio vira null, não ""');
ok(l1.motivo_perdido === null, 'motivo do perdido só quando é sem interesse');
ok(l1.bairro === 'Centro' && l1.com_foto === true && l1.acao_id === 'a1', 'bairro aparado, foto, acao_id');

const sem: Ficha = { ...FICHA_VAZIA, comoFoi: 'sem_interesse', proximo: 'sem_interesse', motivoPerdido: 'Preço' };
const l2 = linhaDaFicha(sem, { ...base, declarada: true, dealId: null })!;
ok(l2.motivo_perdido === 'Preço' && l2.proximo_em === null, 'sem interesse leva o motivo e não tem data');
ok(l2.declarada === true && l2.deal_id === null, 'declarada e sem negócio');

const semAcao = linhaDaFicha(reuniao, { ...base, acaoId: undefined })!;
ok(typeof semAcao.acao_id === 'string' && semAcao.acao_id.length > 8, 'sem acaoId gera um');

console.log(falhas ? `\n${falhas} falha(s)` : '\nficha no banco: tudo certo');
if (falhas) process.exit(1);
