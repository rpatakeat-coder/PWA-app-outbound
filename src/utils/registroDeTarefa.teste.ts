// npx tsx src/utils/registroDeTarefa.teste.ts
import { diaUtilDepois, notaDoRegistro, pedidoDoProximo, proximoSugerido, PROXIMOS } from './registroDeTarefa';

let falhas = 0;
const ok = (c: boolean, m: string) => { if (c) console.log('ok  ', m); else { falhas++; console.log('FALHA', m); } };

ok(diaUtilDepois('2026-09-28', 1) === '2026-09-29', 'segunda + 1 útil = terça');
ok(diaUtilDepois('2026-10-02', 1) === '2026-10-05', 'sexta + 1 útil = segunda');
ok(diaUtilDepois('2026-10-01', 3) === '2026-10-06', 'quinta + 3 úteis = terça');

ok(proximoSugerido('nao_atendeu') === 'ligar1', 'não atendeu sugere ligar amanhã');
ok(proximoSugerido('sem_interesse') === 'nada', 'sem interesse não sugere nada');

const ligar1 = PROXIMOS.find((p) => p.id === 'ligar1')!.proximo;
const nota = notaDoRegistro({ comoFoi: 'nao_atendeu', assunto: 'Follow-up - Kadô', nota: ' caixa postal ', proximo: ligar1, data: '2026-09-29' });
ok(nota === 'Ligação · Não atendeu · caixa postal · Próximo: ligar em 29/09 · (tarefa: Follow-up - Kadô)', `nota: ${nota}`);

const p = pedidoDoProximo({ dealId: '123', proximo: ligar1, data: '2026-09-29', nome: 'Kadô' });
ok(!!p && p.tipo === 'follow-up' && p.data === '2026-09-29' && p.texto === 'Ligar Kadô', 'ligar vira follow-up na data');
const v = pedidoDoProximo({ dealId: '123', proximo: { tipo: 'visita', dias: 3 }, data: '2026-10-01', nome: null });
ok(!!v && v.tipo === 'visita', 'visita vira visita (entra no Planejamento)');
ok(pedidoDoProximo({ dealId: null, proximo: ligar1, data: '2026-09-29', nome: null }) === null, 'sem negócio não cria passo');
ok(pedidoDoProximo({ dealId: '1', proximo: { tipo: 'nada', dias: 0 }, data: '2026-09-29', nome: null }) === null, '"nada agora" não cria passo');

console.log(falhas ? `${falhas} falha(s)` : 'registro de tarefa: tudo certo');
if (falhas) process.exitCode = 1;
