// Teste da ficha de rua (regras do servidor espelhadas + bloco DESFECHO_VISITA).
//
// Rode com:  npx tsx src/utils/fichaDeRua.teste.ts
//
// Protege o que custa caro errar: sugerir uma etapa que o servidor recusa
// (pular fase, Ganho), mandar "decisor_alcancado: nao", salvar sem o que é
// obrigatório, e pedir o nome do lugar para "Bar do Zé".
import {
  ETAPA, FICHA_VAZIA, etapaSugerida, faltandoParaEtapa, montarPropriedades, movimentoPermitido, notaDaVisita,
  pareceNomeDePessoa, proximoPassoDaFicha, rotuloSalvar, type Ficha,
} from './fichaDeRua';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};
const F = (x: Partial<Ficha>): Ficha => ({ ...FICHA_VAZIA, ...x });
const BACKLOG = '1396007427';

// regras do servidor
ok(!movimentoPermitido(ETAPA.prospeccao, ETAPA.decisor).ok, 'Prospecção → Decisor pula fase: recusado');
ok(movimentoPermitido(ETAPA.prospeccao, ETAPA.visita).ok, 'Prospecção → Visita: aceito');
ok(movimentoPermitido(ETAPA.negociacao, ETAPA.visita).ok, 'voltar é permitido');
ok(movimentoPermitido(ETAPA.prospeccao, ETAPA.perdido).ok && movimentoPermitido(ETAPA.reciclagem, ETAPA.demo).ok, 'Perdido/Reciclagem isentos nos dois sentidos');
ok(!movimentoPermitido(ETAPA.pagamento, ETAPA.ganho).ok, 'Ganho nunca é destino (só ASAAS)');
ok(!movimentoPermitido(BACKLOG, ETAPA.visita).ok && movimentoPermitido(BACKLOG, ETAPA.prospeccao).ok, 'de Backlog só dá para ir a Prospecção');

// sugestão
ok(etapaSugerida({ atual: ETAPA.prospeccao, comoFoi: 'decisor_ausente', proximo: 'voltar7', primeiraVisita: true }) === ETAPA.visita, '1ª visita em Prospecção sugere Visita');
ok(etapaSugerida({ atual: ETAPA.visita, comoFoi: 'falou_com_decisor', proximo: 'reuniao', primeiraVisita: false }) === ETAPA.decisor, 'decisor + reunião em Visita sugere Conversa com Decisor');
ok(etapaSugerida({ atual: ETAPA.prospeccao, comoFoi: 'falou_com_decisor', proximo: 'reuniao', primeiraVisita: true }) === ETAPA.visita, 'decisor + reunião em Prospecção sobe só um degrau (Visita), não pula');
ok(etapaSugerida({ atual: ETAPA.negociacao, comoFoi: 'sem_interesse', proximo: 'sem_interesse', primeiraVisita: false }) === ETAPA.perdido, 'Sem interesse sugere Perdido de qualquer etapa');
ok(etapaSugerida({ atual: ETAPA.visita, comoFoi: 'decisor_ausente', proximo: 'ligar_amanha', primeiraVisita: false }) === null, 'Ligar amanhã mantém a etapa');
ok(etapaSugerida({ atual: ETAPA.demo, comoFoi: 'falou_com_decisor', proximo: 'reuniao', primeiraVisita: false }) === null, 'já além de Decisor: não sugere voltar');
ok(etapaSugerida({ atual: BACKLOG, comoFoi: 'decisor_ausente', proximo: 'voltar7', primeiraVisita: true }) === ETAPA.prospeccao, 'Backlog na 1ª visita: sugere Prospecção (o degrau possível)');

// campos obrigatórios
ok(faltandoParaEtapa(ETAPA.decisor, { celular: '27999', gargalo_operacional: 'Fila', nome_do_sistema: '' }).join() === 'nome_do_sistema', 'Decisor exige o sistema que falta');
ok(faltandoParaEtapa(ETAPA.visita, {}).length === 0, 'Visita não exige nada');
ok(faltandoParaEtapa(ETAPA.prospeccao, {}).join() === 'origem_do_lead', 'Prospecção exige origem_do_lead');

// salvar
ok(!rotuloSalvar(F({})).pode && rotuloSalvar(F({})).texto === 'Falta como foi e o próximo passo', 'vazio: diz os dois obrigatórios');
ok(rotuloSalvar(F({ comoFoi: 'decisor_ausente', proximo: 'reuniao' })).texto === 'Falta o dia da reunião', 'reunião pede o dia');
ok(rotuloSalvar(F({ comoFoi: 'sem_interesse', proximo: 'sem_interesse' })).texto === 'Falta o motivo', 'sem interesse pede o motivo');
ok(rotuloSalvar(F({ comoFoi: 'falou_com_decisor', proximo: 'voltar7' }), ['nome_do_sistema']).texto === 'Falta sistema que usa hoje', 'mover etapa pede o campo que ela exige');
ok(rotuloSalvar(F({ comoFoi: 'falou_com_decisor', proximo: 'voltar7', moverEtapa: false }), ['nome_do_sistema']).pode, 'sem mover a etapa, o campo dela não trava');

// próximo passo e nota
const hoje = '2026-09-25'; // sexta
ok(proximoPassoDaFicha(F({ proximo: 'ligar_amanha' }), hoje)?.data === '2026-09-28', 'Ligar amanhã numa sexta cai na segunda');
ok(proximoPassoDaFicha(F({ proximo: 'sem_interesse' }), hoje) === null, 'Sem interesse não cria tarefa (vira Perdido)');
const nota = notaDaVisita(F({ comoFoi: 'decisor_ausente', proximo: 'voltar7', dor: 'Fila', sistema: 'Consumer' }), { cliente: 'Bar do Zé', ocorridoEm: '2026-09-25T15:00:00Z', hoje });
ok(nota.startsWith('DESFECHO_VISITA v1\n'), 'nota começa com a linha do contrato');
ok(/\ndecisor_alcancado: \n/.test(nota), 'decisor ausente: decisor_alcancado VAZIO, nunca "nao"');
ok(/\nproximo_passo: visita \| 2026-10-02 \| Voltar para nova visita\n/.test(nota), 'proximo_passo no formato canal | data | ação');
ok(/\ndor: Fila\n/.test(nota) && /sistema: Consumer/.test(nota), 'dor e sistema vão no bloco');
ok(/\ndecisor_alcancado: sim\n/.test(notaDaVisita(F({ comoFoi: 'falou_com_decisor', proximo: 'reuniao', diasReuniao: 1 }), { cliente: 'x', ocorridoEm: 'x', hoje })), 'falou com quem decide: "sim"');

// nome de pessoa
ok(pareceNomeDePessoa('Amanda') && pareceNomeDePessoa('FRANCISCO'), 'Amanda / FRANCISCO parecem pessoa');
ok(!pareceNomeDePessoa('Bar do Zé') && !pareceNomeDePessoa('Avelí') && !pareceNomeDePessoa('Marcos Bar'), 'nome de lugar não pede correção');

// folha "Mudar etapa": propriedades no formato do servidor
const demo = montarPropriedades(ETAPA.demo, { plano_apresentado: 'Pro', valor_de_mrr: '249,90', data_da_reuniao: '2026-09-30' }, {});
ok(demo.propriedades.valor_de_mrr === '249.9' && demo.propriedades.data_da_reuniao === String(Date.UTC(2026, 8, 30)) && !Object.keys(demo.erros).length,
  'Demo: MRR com vírgula vira número e a data vira meia-noite UTC em ms (igual ao Cockpit)');
ok(montarPropriedades(ETAPA.demo, { plano_apresentado: 'Plano X', valor_de_mrr: '0', data_da_reuniao: '30/09' }, {}).erros.plano_apresentado === 'Escolha uma das opções.',
  'picklist fora da lista é recusada no app');
ok(Object.keys(montarPropriedades(ETAPA.demo, { plano_apresentado: 'Pro', valor_de_mrr: '0', data_da_reuniao: '30/09' }, {}).erros).length === 2, 'MRR 0 e data mal escrita são recusados');
ok(!Object.keys(montarPropriedades(ETAPA.decisor, {}, { celular: '+5527999', gargalo_operacional: 'Fila', nome_do_sistema: 'Saipos' }).erros).length,
  'o que o negócio já tem não é pedido de novo');
ok(montarPropriedades(ETAPA.perdido, { motivo_do_perdido: 'Outros' }, {}).erros.observacao__desqualificado !== undefined, 'Perdido por "Outros" pede o texto');
ok(!Object.keys(montarPropriedades(ETAPA.perdido, { motivo_do_perdido: 'Preço' }, {}).erros).length, 'Perdido por "Preço" não pede texto');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nficha de rua: tudo certo');
