// Teste das armas do mapa (prancha "Mapa do Executivo", 15/10/26).
//
// Rode com:  npx tsx src/utils/armasDoMapa.teste.ts
//
// Protege o que custa caro errar na calçada: a fala com "—" ou "{decisor}" no meio, o gatilho
// errado (pedir o decisor de quem já está em Negociação), o halo indo para uma porta a 2 km, o
// contador escrevendo "dia concluído" e o Google casando o vizinho como se fosse o mesmo lugar.
import {
  contadorDaMeta, decisorEstaAgora, escolherArma, escolhidaPor, horarioParaFrase, janelaDoDecisor, linhaDaMetaNaFolha,
  linhaDeReferencia, motivoDaQueda, nomeNormalizado, portaSugerida, preencherFala, segundaOpcao, similaridade, visitasDoDia,
} from './armasDoMapa';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

// 15/10/2026 é quinta-feira. 18h UTC = 15h em Brasília.
const qui15h = new Date('2026-10-15T18:00:00Z');
const qui9h = new Date('2026-10-15T12:00:00Z');
const sex13h = new Date('2026-10-16T16:00:00Z');
const sex11h = new Date('2026-10-16T14:00:00Z');
const sab10h = new Date('2026-10-17T13:00:00Z');

// preencher
ok(preencherFala('{decisor}, passei para a gente fechar.', { decisor: 'Marcos' }) === 'Marcos, passei para a gente fechar.', 'fala com o decisor');
ok(preencherFala('{decisor}, passei para a gente fechar.', {}) === 'Passei para a gente fechar.', 'sem decisor: o vocativo some e a frase começa em maiúscula');
ok(preencherFala('Cinco minutos para eu te mostrar {proximo}?', {}) === 'Cinco minutos para eu te mostrar como funciona?', 'sem próximo passo: "como funciona"');
ok(!/[{}—]/.test(preencherFala('Da última vez você falou de {dor}.', { dor: 'fila' })), 'nada de chave nem travessão na fala');

// horário
ok(JSON.stringify(janelaDoDecisor('14h30_17h30')) === JSON.stringify([870, 1050]), 'faixa da ficha vira janela');
ok(JSON.stringify(janelaDoDecisor('das 14h às 17h')) === JSON.stringify([840, 1020]), 'texto livre "das 14h às 17h"');
ok(JSON.stringify(janelaDoDecisor('9:30-11')) === JSON.stringify([570, 660]), 'texto livre "9:30-11"');
ok(janelaDoDecisor('depois do almoço') === null, 'texto sem hora não inventa janela');
ok(horarioParaFrase('14h30_17h30') === 'das 14h30 às 17h30' && horarioParaFrase('das 14h às 17h') === 'das 14h às 17h', 'horário para a frase');
ok(decisorEstaAgora('14h30_17h30', qui15h) && !decisorEstaAgora('14h30_17h30', qui9h), 'está agora: 15h dentro de 14h30–17h30');
ok(decisorEstaAgora('10h_11h30', new Date('2026-10-15T12:40:00Z')), 'começa em até 30 min (9h40 para 10h) conta como agora');
ok(!decisorEstaAgora('10h_11h30', new Date('2026-10-15T12:20:00Z')), '40 min antes ainda não');

// gatilhos, na ordem
const base = { familia: 'lead' as const, temp: 'M' as const, agora: qui15h };
ok(escolherArma({ ...base, cobrar: true, diasNaEtapa: 12, decisor: 'Marcos Lima' })?.gatilho === 1, '1: cobrar vence tudo');
ok(escolherArma({ ...base, cobrar: true, diasNaEtapa: 12 })?.motivo === 'Prazo da etapa estourou há 12 dias: feche a data hoje', '1: motivo com os dias');
ok(escolherArma({ ...base, cobrar: true })?.fala.startsWith('Passei para a gente'), '1: sem decisor a fala começa sem vocativo');
{
  const a = escolherArma({ ...base, etapaCodigo: '1395880471', mrr: 449, decisor: 'Marcos', horario: '14h30_17h30' });
  ok(a?.gatilho === 3 && a.motivo === 'Proposta de R$ 449 pronta · Marcos está das 14h30 às 17h30', '2+3 juntos: motivo combinado e fala do 3');
  ok(!!a?.fala.startsWith('Marcos, trouxe a proposta'), '2+3: fala do fechamento');
}
{
  const a = escolherArma({ ...base, etapaCodigo: '1395880470', decisor: 'Ana', horario: '14h30_17h30', proximo: 'a demo do salão' });
  ok(a?.gatilho === 2 && a.motivo === 'Ana costuma estar agora (das 14h30 às 17h30) · a demo do salão', '2: dono está agora com o próximo passo');
  ok(!!a?.fala.includes('te mostrar a demo do salão?'), '2: a fala leva o próximo passo');
}
ok(escolherArma({ ...base, agora: qui9h, etapaCodigo: '1395880471', mrr: 449, decisor: 'Marcos', horario: '14h30_17h30' })?.motivo === 'Proposta de R$ 449 pronta · Marcos está das 14h30 às 17h30', '3 fora do horário: ainda diz quando ele está');
ok(escolherArma({ ...base, agora: qui9h, etapaCodigo: '1395880471', mrr: 449 })?.motivo === 'Proposta de R$ 449 pronta', '3 sem horário: termina no MRR');
ok(escolherArma({ ...base, etapaCodigo: '1396005401' })?.gatilho === 4, '4: Visita sem decisor');
ok(escolherArma({ ...base, etapaCodigo: '1395880472', dor: 'Fila' })?.gatilho === 5, '4 não vale em Negociação: cai na dor');
ok(escolherArma({ ...base, etapaCodigo: '1396005401', decisor: 'Ana', sistema: 'Saipos', dor: 'Fila' })?.motivo === 'Usa Saipos e reclama de fila', '5: sistema e dor no motivo');
ok(!escolherArma({ ...base, etapaCodigo: '1396005401', decisor: 'Ana', sistema: 'Saipos', dor: 'Fila' })?.fala.includes('Saipos'), '5: o concorrente não entra na fala');
ok(escolherArma({ ...base, etapaCodigo: '1395880470', decisor: 'Ana' }) === null, 'sem dado de gatilho: o bloco não aparece');
ok(escolherArma({ ...base, temp: 'X', cobrar: true }) === null, 'negócio perdido não tem arma');
ok(escolherArma({ familia: 'rec', abertoHa: 9, agora: qui15h })?.motivo === 'Abriu há 9 dias: ainda está escolhendo sistema', '6: recém-aberto');
ok(escolherArma({ familia: 'rec', abertoHa: 1, agora: qui15h })?.motivo === 'Abriu há 1 dia: ainda está escolhendo sistema', '6: "há 1 dia"');
ok(escolherArma({ familia: 'rec', abertoHa: 9, clientePerto: 'Café Odara', agora: qui15h })?.referencia?.includes('Café Odara'), '6: referência do cliente perto');
ok(escolherArma({ familia: 'av', nota: 4.8, avaliacoes: 1240, agora: qui15h })?.motivo === '★ 4,8 com 1.240 avaliações: casa cheia', '7: casa cheia');
ok(escolherArma({ familia: 'ex', agora: qui15h }) === null, '8: ex-cliente sem motivo não tem bloco');
ok(escolherArma({ familia: 'ex', motivoSaida: 'Preço', agora: qui15h })?.motivo === 'Saiu por preço', '8: com motivo');
ok(escolherArma({ familia: 'cli', queda: 'faturamento -35% no bimestre', agora: qui15h })?.motivo === 'Faturamento caindo: visita de cuidado, não de venda', '9: queda de faturamento');
ok(escolherArma({ familia: 'cli', queda: 'faturamento -35% no bimestre', agora: qui15h })?.kicker === 'PARA A VISITA', '9: kicker de cuidado');
ok(escolherArma({ familia: 'cli', agora: qui15h }) === null, 'cliente sem queda não tem bloco');
ok(motivoDaQueda('sem comanda há 9 dias') === 'Sem comanda há 9 dias', 'queda por dias sem comanda');
ok(escolherArma({ ...base, cobrar: true }, { 1: { fala: 'Texto novo do Playbook.' } })?.fala === 'Texto novo do Playbook.', 'o texto do Playbook vence a cópia do app');

// porta sugerida
{
  const r = portaSugerida([
    { id: 'a', nome: 'Empório Lírio', distanciaM: 220, familia: 'rec', abertoHa: 9, clientesPerto: 3 },
    { id: 'b', nome: 'Cantina Bento', distanciaM: 400, familia: 'lead', temp: 'M' },
    { id: 'c', nome: 'Longe', distanciaM: 1500, familia: 'rec', abertoHa: 2 },
  ]);
  ok(r?.melhor.c.id === 'a' && r.melhor.pontos === 4, 'halo: casa nova perto com clientes (3 + 1 − 0)');
  ok(r?.segunda?.c.id === 'b', '2ª opção: o lead morno');
  ok(escolhidaPor(r!.melhor, '220 m') === 'Casa nova (9 dias) · 220 m · 3 clientes Takeat perto', '"Escolhida por" com a distância no meio');
  ok(segundaOpcao(r!.segunda!, '400 m') === 'Ou: Cantina Bento, lead morno seu, a 400 m', 'linha da 2ª opção');
}
ok(portaSugerida([{ id: 'x', nome: 'x', distanciaM: 1200, familia: 'lead', temp: 'Q' }]) === null, 'nada a até 1 km: sem halo');
ok(portaSugerida([
  { id: 'perto', nome: 'p', distanciaM: 100, familia: 'lead', temp: 'M' },
  { id: 'longe', nome: 'l', distanciaM: 290, familia: 'lead', temp: 'M' },
])?.melhor.c.id === 'perto', 'empate: a mais perto');
ok(portaSugerida([
  { id: 'q', nome: 'q', distanciaM: 900, familia: 'lead', temp: 'Q' },
  { id: 'f', nome: 'f', distanciaM: 50, familia: 'lead', temp: 'F' },
])?.melhor.c.id === 'f', 'cada 300 m custa 1 ponto (quente a 900 m = −1; frio a 50 m = 0)');

// contador e visitas
ok(contadorDaMeta(0, qui15h).texto === '0/5' && contadorDaMeta(0, qui15h).estilo === 'zero', 'segunda: 0/5 contorno');
ok(contadorDaMeta(3, qui15h).estilo === 'meio', 'meio: 3/5 neutro');
ok(contadorDaMeta(5, qui15h).texto === '5/5 ✓' && contadorDaMeta(7, qui15h).texto === '7/5 ✓', 'meta batida passa de 5');
ok(contadorDaMeta(2, sex13h).texto === 'faltam 3' && contadorDaMeta(2, sex11h).texto === '2/5', 'sexta: só a partir das 12h');
ok(contadorDaMeta(4, sab10h).texto === 'faltam 1', 'sábado ainda é fim da semana');
ok(linhaDaMetaNaFolha(2, 4, sex13h) === 'Recém-abertos: 2 de 5 na semana. Faltam 3, e 4 estão a menos de 1 km.', 'linha da folha na sexta');
ok(linhaDaMetaNaFolha(2, 4, qui15h) === null && linhaDaMetaNaFolha(5, 4, sex13h) === null, 'sem linha fora da sexta ou com a meta batida');
ok(linhaDaMetaNaFolha(4, 0, sex13h) === 'Recém-abertos: 4 de 5 na semana. Falta 1.', 'sem recém perto: sem o trecho');
ok(visitasDoDia(9, 6) === '9 visitas hoje · mínimo 6' && visitasDoDia(1, 6) === '1 visita hoje · mínimo 6', '"N visitas hoje · mínimo 6", passa de 6');
ok(visitasDoDia(null, 6) === null, 'não medido: nada (nunca "0")');

// referências
ok(linhaDeReferencia([{ id: '1', nome: 'Café Odara', distanciaM: 120 }, { id: '2', nome: 'Bar do Zé', distanciaM: 280 }, { id: '3', nome: 'Longe', distanciaM: 900 }]) === '2 clientes Takeat a 300 m · Café Odara e Bar do Zé', 'dois clientes a 400 m, o mais perto primeiro');
ok(linhaDeReferencia([{ id: '1', nome: 'Café Odara', distanciaM: 60 }]) === '1 cliente Takeat a 100 m · Café Odara', 'um cliente');
ok(linhaDeReferencia([{ id: '3', nome: 'Longe', distanciaM: 900 }]) === null, 'nenhum no raio: sem linha');

// Google: o mesmo lugar
ok(nomeNormalizado('Restaurante Cantina Bento LTDA') === 'cantina bento', 'nome normalizado');
ok(similaridade('Cantina Bento', 'Restaurante Cantina Bento') >= 0.8, 'mesmo lugar com "Restaurante" na frente');
ok(similaridade('Bar do Zé', 'Bar do João') < 0.8, 'vizinho de nome parecido não casa');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nTudo certo.');
