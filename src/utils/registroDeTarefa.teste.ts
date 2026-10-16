// npx tsx src/utils/registroDeTarefa.teste.ts
import { diaUtilDepois, notaDoRegistro, pedidoDoProximo, podeRegistrar, proximoSugerido, PROXIMOS, type ComoFoi } from './registroDeTarefa';

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

// todo negócio sai do registro com desfecho (16/10/26)
const X = ['Outros', 'Funcionalidade'];
const base = { comoFoi: 'falou' as ComoFoi | null, proximoId: 'ligar3', temNegocio: true, motivo: null as string | null, motivoTexto: '', exigemTexto: X };
ok(podeRegistrar(base).pode, 'com negócio e passo datado: registra');
ok(!podeRegistrar({ ...base, proximoId: 'nada' }).pode, 'com negócio, "Nada agora" não registra: precisa do próximo passo');
ok(!podeRegistrar({ ...base, comoFoi: 'sem_interesse', proximoId: 'nada' }).pode, 'sem interesse sem motivo não registra');
ok(podeRegistrar({ ...base, comoFoi: 'sem_interesse', proximoId: 'nada', motivo: 'Preço' }).pode, 'sem interesse com motivo registra (vai a Perdido)');
ok(!podeRegistrar({ ...base, comoFoi: 'sem_interesse', motivo: 'Outros' }).pode, 'Outros exige o que pesou');
ok(podeRegistrar({ ...base, temNegocio: false, proximoId: 'nada' }).pode, 'sem negócio ligado: segue concluindo como antes');
ok(!podeRegistrar({ ...base, comoFoi: null }).pode, 'sem como foi não registra');

console.log(falhas ? `${falhas} falha(s)` : 'registro de tarefa: tudo certo');
if (falhas) process.exitCode = 1;
