// Teste da ficha de rua (regras do servidor espelhadas + bloco DESFECHO_VISITA).
//
// Rode com:  npx tsx src/utils/fichaDeRua.teste.ts
//
// Protege o que custa caro errar: sugerir uma etapa que o servidor recusa
// (pular fase, Ganho), mandar "decisor_alcancado: nao", salvar sem o que é
// obrigatório, e pedir o nome do lugar para "Bar do Zé".
import {
  opcoesAgora, HORARIOS,
  ETAPA, FICHA_VAZIA, etapaSugerida, faltandoParaEtapa, montarPropriedades, movimentoPermitido, notaDaVisita,
  pareceNomeDePessoa, proximoPassoDaFicha, rotuloSalvar, faltaNoProximo, proximoDiaUtil, type Ficha,
  degrausDaFicha, escadaAte, horaLivre, valorValido,
  GARGALO_OUTRA, HORARIO_OUTRO, MOTIVOS_PERDIDO, dorDaFicha, horarioDaFicha, papelDaFicha, papelParaHubspot, rotuloDoHorario, rotuloDoMotivo, tipoDaFicha,
} from './fichaDeRua';
import { MOTIVOS_SEM_INTERESSE } from './registroDaFila';

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
ok(etapaSugerida({ atual: null, comoFoi: 'decisor_ausente', proximo: 'voltar_horario', primeiraVisita: true }) === null, 'etapa desconhecida: não sugere mover (chutava Prospecção e pedia origem sem campo)');
ok(etapaSugerida({ atual: null, comoFoi: 'sem_interesse', proximo: 'sem_interesse', primeiraVisita: true }) === ETAPA.perdido, 'etapa desconhecida + sem interesse: Perdido continua valendo');
ok(etapaSugerida({ atual: ETAPA.negociacao, comoFoi: 'sem_interesse', proximo: 'sem_interesse', primeiraVisita: false }) === ETAPA.perdido, 'Sem interesse sugere Perdido de qualquer etapa');
ok(etapaSugerida({ atual: ETAPA.visita, comoFoi: 'decisor_ausente', proximo: 'ligar_amanha', primeiraVisita: false }) === null, 'Ligar amanhã mantém a etapa');
ok(etapaSugerida({ atual: ETAPA.demo, comoFoi: 'falou_com_decisor', proximo: 'reuniao', primeiraVisita: false }) === null, 'já além de Decisor: não sugere voltar');
ok(etapaSugerida({ atual: BACKLOG, comoFoi: 'decisor_ausente', proximo: 'voltar7', primeiraVisita: true }) === ETAPA.prospeccao, 'Backlog na 1ª visita: sugere Prospecção (o degrau possível)');

// campos obrigatórios
ok(faltandoParaEtapa(ETAPA.decisor, { celular: '27999', gargalo_operacional: 'Fila', nome_do_sistema: '' }).join() === 'nome_do_sistema', 'Decisor exige o sistema que falta');
ok(faltandoParaEtapa(ETAPA.visita, {}).length === 0, 'Visita não exige nada');
ok(faltandoParaEtapa(ETAPA.prospeccao, {}).join() === 'origem_do_lead', 'Prospecção exige origem_do_lead');

/* SALVAR NUNCA TRAVA (29/10/26, "a ordem da porta"). A ficha abre quando o executivo ENCOSTA na
   porta, antes de falar com alguém; exigir ali o "e agora?" é pedir uma resposta que ainda não
   existe. O botão sempre salva, e o que ficou em branco volta na saída, pela faixa pendente.
   14/10/26 segue valendo: o que a ETAPA pede nunca travou a visita — vira aviso. */
ok(rotuloSalvar(F({})).pode && rotuloSalvar(F({})).texto === 'Salvar o que sei', 'ficha vazia salva, e o botão diz que vai pela metade');
ok(rotuloSalvar(F({ comoFoi: 'decisor_ausente' })).pode, 'só o como foi: salva');
ok(rotuloSalvar(F({ proximo: 'ligar_amanha' })).pode, 'só o próximo passo: salva');
const inteira = rotuloSalvar(F({ comoFoi: 'falou_com_decisor', proximo: 'voltar7', dataVolta: '2026-09-29' }));
ok(inteira.pode && inteira.completa && inteira.texto === 'Salvar', 'ficha inteira: o botão volta a dizer só "Salvar"');
ok(!rotuloSalvar(F({ comoFoi: 'decisor_ausente', proximo: 'reuniao' })).completa, 'reunião sem dia não conta como completa');
ok(faltaNoProximo(F({ comoFoi: 'sem_interesse', proximo: 'sem_interesse' })) === 'o motivo', 'sem interesse ainda pede o motivo — virou checagem própria, não sumiu');
ok(faltaNoProximo(F({ proximo: 'reuniao', diasReuniao: 0 })) === 'a hora da reunião', 'reunião hoje ainda pede a hora');
ok(faltaNoProximo(F({})) === null, 'sem próximo passo escolhido, não falta nada nele');

// próximo passo e nota
const hoje = '2026-09-25'; // sexta
ok(proximoPassoDaFicha(F({ proximo: 'ligar_amanha' }), hoje)?.data === '2026-09-28', 'Ligar amanhã numa sexta cai na segunda');
ok(proximoPassoDaFicha(F({ proximo: 'sem_interesse' }), hoje) === null, 'Sem interesse não cria tarefa (vira Perdido)');
const nota = notaDaVisita(F({ comoFoi: 'decisor_ausente', proximo: 'voltar7', dataVolta: '2026-10-02', dor: 'Fila', sistema: 'Consumer' }), { cliente: 'Bar do Zé', ocorridoEm: '2026-09-25T15:00:00Z', hoje });
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

// ---- v4.1: "E agora?" depende do "Como foi?" ----
ok(opcoesAgora('decisor_ausente')[0].proximo === 'voltar_horario', 'quem decide não estava: primeira opção é voltar no horário do dono');
ok(!opcoesAgora('estabelecimento_fechado').some((o) => o.proximo === 'sem_interesse'), 'estava fechado: não oferece sem interesse');
ok(opcoesAgora('falou_com_decisor').filter((o) => o.proximo === 'reuniao').map((o) => o.dias).join() === '0,1,3,5', 'falou com quem decide: reunião hoje e em 1, 3 e 5 dias úteis');
ok(opcoesAgora(null).length === 0, 'sem desfecho: nenhuma opção');
{
  const p = proximoPassoDaFicha({ ...FICHA_VAZIA, comoFoi: 'decisor_ausente', proximo: 'voltar_horario', horario: '14h30_17h30', dataVolta: '2026-09-29' }, '2026-09-25');
  ok(!!p && p.tipo === 'visita' && p.texto.includes('14h30–17h30') && p.data === '2026-09-29', 'voltar no horário do dono: visita no dia que o executivo escolheu, com o horário');
  ok(HORARIOS.filter((h) => h.hs).length === 4 && HORARIOS.length === 5, 'quatro faixas de horário + "Outro horário"');
}

// ---- horário: os valores do app são os que a hubspot-sync aceita ----
{
  // eslint-free: o teste roda com o cwd na raiz do repositório
  const fs = require('fs');
  const edge = fs.readFileSync('supabase/functions/hubspot-sync/index.ts', 'utf8');
  const i = edge.indexOf('HORARIOS_DECISOR = new Set([');
  const trecho = i >= 0 ? edge.slice(i, edge.indexOf('])', i)) : '';
  const aceitos = (trecho.match(/'([^']*)'/g) ?? []).map((x: string) => x.slice(1, -1));
  ok(aceitos.length === 4 && HORARIOS.filter((h) => h.hs).every((h) => aceitos.includes(h.hs as string)), 'os 4 horários do app são os valores aceitos pela hubspot-sync');
  ok(HORARIOS.filter((h) => !h.hs).map((h) => h.valor).join() === HORARIO_OUTRO, 'só o "Outro horário" fica sem valor do HubSpot');
}

// ---- 14/10/26: listas únicas e os "Outro"/"Outra" que nunca vão ao enum ----
{
  ok(MOTIVOS_PERDIDO.map((m) => m.valor).join('|') === 'Preço|Funcionalidade|Não quer mudar de sistema|Sem retorno|Reembolso|Outros', 'motivos: a lista única, na ordem');
  ok(rotuloDoMotivo('Reembolso') === 'Estorno', 'Reembolso aparece como Estorno');
  ok(MOTIVOS_SEM_INTERESSE.join('|') === MOTIVOS_PERDIDO.map((m) => m.valor).join('|'), 'a fila de Tarefas usa a mesma lista');
  const fs = require('fs');
  const stages = fs.readFileSync('src/constants/stages.ts', 'utf8');
  ok(stages.includes(`'${MOTIVOS_PERDIDO.map((m) => m.valor).join("', '")}'`), 'o fallback do modal antigo (stages.ts) tem a mesma lista');
  ok(stages.includes("'GoogleMaps', 'Familia', 'Eventos'") && !stages.includes("'Família'"), 'origem: Familia sem acento, o valor do servidor');

  ok(faltaNoProximo(F({ comoFoi: 'sem_interesse', proximo: 'sem_interesse', motivoPerdido: 'Funcionalidade', moverEtapa: false })) === 'o que pesou', 'Funcionalidade sem texto: pede o que pesou');
  ok(rotuloSalvar(F({ comoFoi: 'sem_interesse', proximo: 'sem_interesse', motivoPerdido: 'Preço', moverEtapa: false })).pode, 'Preço: o que pesou é opcional');

  const perdidoOpc = montarPropriedades(ETAPA.perdido, { motivo_do_perdido: 'Sem retorno', observacao__desqualificado: '  3 ligações, nada ' }, {});
  ok(perdidoOpc.propriedades.observacao__desqualificado === '3 ligações, nada' && !Object.keys(perdidoOpc.erros).length, 'o que pesou opcional vai quando escrito');
  ok(montarPropriedades(ETAPA.perdido, { motivo_do_perdido: 'Outros', observacao__desqualificado: 'x'.repeat(400) }, {}).propriedades.observacao__desqualificado.length === 300, 'o que pesou corta em 300');

  const dorOutra = montarPropriedades(ETAPA.decisor, { celular: '27999', nome_do_sistema: 'Saipos', gargalo_operacional: GARGALO_OUTRA, gargalo_outro: ' Delivery atrasa ' }, {});
  ok(!('gargalo_operacional' in dorOutra.propriedades) && dorOutra.gargaloOutro === 'Delivery atrasa' && !Object.keys(dorOutra.erros).length, 'dor "Outra": sai das propriedades e vai como gargaloOutro');
  ok(montarPropriedades(ETAPA.decisor, { celular: '27999', nome_do_sistema: 'Saipos', gargalo_operacional: GARGALO_OUTRA }, {}).erros.gargalo_operacional === 'Escreva qual é a dor.', 'dor "Outra" sem texto: pede a dor');
  ok(montarPropriedades(ETAPA.decisor, { celular: '27999', nome_do_sistema: 'Saipos', gargalo_operacional: 'Fila' }, {}).gargaloOutro === undefined, 'dor da lista: sem gargaloOutro');

  ok(papelParaHubspot('Sócio') === 'Dono' && papelParaHubspot('Gerente') === 'Gerente' && papelParaHubspot('Chef') === undefined && papelParaHubspot('Outro') === undefined, 'papel: Sócio vai como Dono; o resto não vai');
  ok(rotuloDoHorario('10h_11h30') === '10h–11h30' && rotuloDoHorario('Só sábado') === 'Só sábado' && rotuloDoHorario(HORARIO_OUTRO) === '', 'horário livre aparece como foi escrito');

  const livre = F({ comoFoi: 'decisor_ausente', proximo: 'voltar_horario', dataVolta: '2026-10-20', dorOutra: 'Delivery atrasa', horario: 'outro', horarioOutro: 'Só sábado de manhã',
    papel: 'Outro', papelOutro: 'Chef', decisor: 'Ana', tipo: 'Outro', tipoOutro: 'Food truck' });
  ok(dorDaFicha(livre) === 'Delivery atrasa' && horarioDaFicha(livre) === 'Só sábado de manhã' && papelDaFicha(livre) === 'Chef' && tipoDaFicha(livre) === 'Food truck', 'os "Outro" gravam o texto');
  const notaLivre = notaDaVisita(livre, { cliente: 'x', ocorridoEm: 'x', hoje });
  ok(/\ndor: Delivery atrasa\n/.test(notaLivre) && /\npapel: Chef\n/.test(notaLivre) && /dono costuma estar: Só sábado de manhã/.test(notaLivre) && /tipo: Food truck/.test(notaLivre), 'a nota leva os textos livres');
  ok(proximoPassoDaFicha(livre, hoje)?.texto === 'Voltar no horário do dono (Só sábado de manhã)', 'a volta usa o horário digitado');
  const notaPesou = notaDaVisita(F({ comoFoi: 'sem_interesse', proximo: 'sem_interesse', motivoPerdido: 'Funcionalidade', motivoTexto: 'sem KDS' }), { cliente: 'x', ocorridoEm: 'x', hoje });
  ok(/sem interesse: Funcionalidade \(sem KDS\)/.test(notaPesou), 'o que pesou vai na nota');
}

// ---- 03/10/26: a volta à porta tem o dia escolhido pelo executivo, não 7 dias fixos ----
{
  ok(!opcoesAgora('decisor_ausente').some((o) => /7 dias/.test(o.rotulo)), 'nenhuma opção promete "7 dias" fixo');
  for (const proximo of ['voltar7', 'voltar_horario', 'voltar_amanha'] as const) {
    ok(proximoPassoDaFicha(F({ comoFoi: 'decisor_ausente', proximo }), hoje) === null, proximo + ' sem dia escolhido não vira tarefa');
    ok(faltaNoProximo(F({ comoFoi: 'decisor_ausente', proximo, moverEtapa: false })) === 'o dia da volta', proximo + ' sem dia: ainda pede o dia da volta');
    ok(proximoPassoDaFicha(F({ comoFoi: 'decisor_ausente', proximo, dataVolta: '2026-09-30' }), hoje)?.data === '2026-09-30', proximo + ': a tarefa cai no dia escolhido');
  }
  ok(rotuloSalvar(F({ comoFoi: 'decisor_ausente', proximo: 'voltar7', dataVolta: '2026-09-29', moverEtapa: false })).pode, 'com o dia escolhido, salva');
  ok(proximoDiaUtil('2026-09-25', 2) === '2026-09-29', '"Em 2 dias" numa sexta cai na terça (pula o fim de semana)');
}

// ── 14/10/26: "Apresentei agora", "Reunião hoje", degraus e valor de lixo ──
{
  const op = opcoesAgora('falou_com_decisor');
  ok(op[0].proximo === 'apresentei' && op[1].dias === 0, 'falou com quem decide: Apresentei agora e Reunião hoje vêm primeiro');
  ok(!opcoesAgora('decisor_ausente').some((o) => o.proximo === 'apresentei'), 'sem quem decide, não há "apresentei"');
  ok(faltaNoProximo(F({ comoFoi: 'falou_com_decisor', proximo: 'reuniao', diasReuniao: 0 })) === 'a hora da reunião', 'reunião hoje pede a hora');
  const rh = proximoPassoDaFicha(F({ comoFoi: 'falou_com_decisor', proximo: 'reuniao', diasReuniao: 0, horaReuniao: '15:00' }), hoje);
  ok(rh?.data === hoje && rh?.hora === '15:00' && rh?.tipo === 'reuniao', 'reunião hoje: tarefa de hoje, na hora escolhida');
  ok(rotuloSalvar(F({ comoFoi: 'falou_com_decisor', proximo: 'apresentei' })).pode, 'apresentei agora salva sem plano/MRR (a etapa é que espera)');
  ok(proximoPassoDaFicha(F({ comoFoi: 'falou_com_decisor', proximo: 'apresentei' }), hoje)?.texto === 'Retorno da proposta', 'apresentei: próximo passo é o retorno da proposta');
  ok(escadaAte(ETAPA.visita, ETAPA.demo).join() === [ETAPA.decisor, ETAPA.demo].join(), 'de Visita até Demo: Decisor e Demo, nessa ordem');
  ok(escadaAte(ETAPA.prospeccao, ETAPA.demo).length === 3, 'de Prospecção até Demo: três degraus');
  ok(escadaAte(ETAPA.negociacao, ETAPA.demo).length === 0 && escadaAte(null, ETAPA.demo).length === 0, 'já além, ou etapa desconhecida: nenhum degrau');
  ok(!valorValido('.') && !valorValido('VERIFICAR') && !valorValido('x') && valorValido('Saipos') && valorValido('449'), 'o "." e o "VERIFICAR" contam como vazio');
  const val = { celular: '27999990000', gargalo_operacional: 'Fila', nome_do_sistema: 'Saipos', plano_apresentado: 'Pro', valor_de_mrr: '449', motivo_do_perdido: '' };
  const tudo = degrausDaFicha({ degraus: [ETAPA.decisor, ETAPA.demo], valores: val, negocio: {}, digitado: new Set(['plano_apresentado', 'valor_de_mrr']), dorLivre: '', hoje });
  ok(tudo.vai.length === 2 && !tudo.paraEm, 'com tudo, sobe Decisor e Demo no mesmo toque');
  ok(tudo.vai[1].propriedades.data_da_reuniao === String(Date.UTC(2026, 8, 25)), 'a data da reunião é hoje (meia-noite UTC)');
  const semSis = degrausDaFicha({ degraus: [ETAPA.decisor, ETAPA.demo], valores: { ...val, nome_do_sistema: '.' }, negocio: { nome_do_sistema: '.' }, digitado: new Set(), dorLivre: '', hoje });
  ok(semSis.vai.length === 0 && semSis.paraEm === ETAPA.decisor && semSis.falta.join() === 'nome_do_sistema', 'sistema "." no negócio: para em Decisor e diz que falta o sistema');
  const jaTem = degrausDaFicha({ degraus: [ETAPA.decisor], valores: { ...val, celular: '2733334444' }, negocio: { celular: '27999990000', gargalo_operacional: 'Fila', nome_do_sistema: 'Saipos' }, digitado: new Set(), dorLivre: '', hoje });
  ok(jaTem.vai.length === 1 && !('celular' in jaTem.vai[0].propriedades), 'o celular do cadastro não sobrescreve o do negócio');
  const livre = degrausDaFicha({ degraus: [ETAPA.decisor], valores: { ...val, gargalo_operacional: '' }, negocio: {}, digitado: new Set(), dorLivre: 'Cozinha lenta', hoje });
  ok(livre.vai[0]?.gargaloOutro === 'Cozinha lenta', 'a dor escrita vale para Decisor (gargaloOutro)');
  const mrrRuim = degrausDaFicha({ degraus: [ETAPA.demo], valores: { ...val, valor_de_mrr: 'abc' }, negocio: {}, digitado: new Set(), dorLivre: '', hoje });
  ok(mrrRuim.paraEm === ETAPA.demo && mrrRuim.falta.join() === 'valor_de_mrr', 'MRR que não é número: não vai a Demo');
  ok(horaLivre('18h30') === '18:30' && horaLivre('940') === '09:40' && horaLivre('25') === null, 'a hora digitada vira HH:MM');
}

// ── 14/10/26: a visita de retorno fala da proposta ──
{
  ok(opcoesAgora('falou_com_decisor', ETAPA.demo).map((o) => o.proximo).join() === 'fechou,negociando,retorno,voltar7,sem_interesse', 'em Demo: Fechou, Negociando, Vai pensar, Voltar, Sem interesse');
  ok(opcoesAgora('falou_com_decisor', ETAPA.negociacao)[0].proximo === 'fechou' && !opcoesAgora('falou_com_decisor', ETAPA.negociacao).some((o) => o.proximo === 'apresentei'), 'em Negociação: Fechou primeiro, sem "Apresentei"');
  ok(opcoesAgora('falou_com_decisor', ETAPA.visita)[0].proximo === 'apresentei', 'em Visita: continua o "Apresentei agora"');
  ok(etapaSugerida({ atual: ETAPA.demo, comoFoi: 'falou_com_decisor', proximo: 'fechou', primeiraVisita: false }) === ETAPA.negociacao, 'Fechou em Demo sugere Negociação');
  ok(etapaSugerida({ atual: ETAPA.demo, comoFoi: 'falou_com_decisor', proximo: 'retorno', primeiraVisita: false }) === null, 'Vai pensar não mexe na etapa');
  ok(proximoPassoDaFicha(F({ comoFoi: 'falou_com_decisor', proximo: 'fechou' }), hoje)?.texto === 'Emitir a cobrança', 'Fechou: o passo é emitir a cobrança hoje');
  ok(faltaNoProximo(F({ comoFoi: 'falou_com_decisor', proximo: 'retorno' })) === 'o dia da volta', 'Vai pensar pede o dia do retorno');
  ok(proximoPassoDaFicha(F({ comoFoi: 'falou_com_decisor', proximo: 'negociando', dataVolta: '2026-09-29' }), hoje)?.texto === 'Retorno da negociação', 'Negociando: retorno no dia escolhido');
}

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nficha de rua: tudo certo');
