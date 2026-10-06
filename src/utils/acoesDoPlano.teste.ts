// Teste do plano único. Roda: npx tsx src/utils/acoesDoPlano.teste.ts
import { ACOES, acaoDoProposito, acaoSugerida, casarCompromisso, diaComEspaco, diaSugerido, nomeNormalizado, propositoDaAcao } from './acoesDoPlano';
import { ETAPA } from './fichaDeRua';

let falhas = 0;
const ok = (c: unknown, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

ok(ACOES.length === 7 && ACOES.filter((a) => !a.ehParada).map((a) => a.id).join() === 'ligar', '7 chips; só Ligar não é parada de rua');
ok(propositoDaAcao('prosp', true) === 'Prospecção de conta nova' && propositoDaAcao('prosp', false) === 'Prospecção de rua', 'prospecção: conta nova em conta-alvo, rua no resto');
ok(propositoDaAcao('demo', false) === 'Avançar o funil' && propositoDaAcao('cobrar', false) === 'Cobrar pagamento', 'Demo avança o funil; Cobrar é Cobrar pagamento');
ok(acaoDoProposito('nova') === 'prosp' && acaoDoProposito('relac') === 'rel' && acaoDoProposito(null) === null, 'faixa do Cockpit sem chip: o chip sai do propósito');

ok(acaoSugerida({ etapa: null, tipoPino: 'alvo', cliente: false }).id === 'prosp', 'conta-alvo → prospecção');
ok(acaoSugerida({ etapa: ETAPA.visita, tipoPino: null, cliente: false }).id === 'follow', 'Visita → follow-up');
ok(acaoSugerida({ etapa: ETAPA.demo, tipoPino: null, cliente: false }).motivo === 'Demo/Proposta → Demo', 'Demo/Proposta → Demo, com o motivo');
ok(acaoSugerida({ etapa: ETAPA.pagamento, tipoPino: null, cliente: false }).id === 'cobrar', 'Ag. Pagamento → cobrar');
ok(acaoSugerida({ etapa: ETAPA.negociacao, tipoPino: 'cliente', cliente: true }).id === 'rel', 'cliente → relacionamento');

const dias = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12'];
ok(diaComEspaco(dias, { '2026-10-09': 15, '2026-10-12': 0 }, '2026-10-09') === '2026-10-12', 'sexta cheia → o próximo dia com espaço');
ok(diaComEspaco(dias, { '2026-10-09': 15, '2026-10-12': 15, '2026-10-08': 5 }, '2026-10-09') === '2026-10-08', 'sem espaço depois, volta para o mais perto antes');

ok(nomeNormalizado('Mada Restaurante e Lanches') === 'mada lanches' && nomeNormalizado('MADA lanches LTDA') === 'mada lanches', 'nome normalizado tira acento, caixa e "restaurante/ltda"');
const paradas = [
  { clientId: 'c-mada-cliente', dealId: null, nome: 'Mada Restaurante e lanches', bairro: 'Bom Fim' },
  { clientId: 'c-armazem', dealId: '777', nome: 'Armazém da Redenção', bairro: 'Farroupilha' },
  { clientId: 'c-purple', dealId: '888', nome: 'Purple Drinkeria', bairro: 'Cidade Baixa' },
];
ok(casarCompromisso({ clientId: 'c-mada-lead', dealId: null, nome: 'Mada Restaurante e Lanches', bairro: 'Bom Fim' }, paradas)?.motivo === 'nome', 'Mada: outro cadastro, casa pelo nome no mesmo bairro');
ok(casarCompromisso({ clientId: null, dealId: '777', nome: 'Armazém', bairro: null }, paradas)?.clientId === 'c-armazem', 'Armazém: casa pelo negócio');
ok(casarCompromisso({ clientId: 'c-purple', dealId: null, nome: 'outro nome', bairro: null }, paradas)?.motivo === 'cadastro', 'pelo cadastro quando o resto não casa');
ok(casarCompromisso({ clientId: 'c-x', dealId: '999', nome: 'Mada Restaurante', bairro: 'Centro' }, paradas) === null, 'mesmo nome em OUTRO bairro não casa');
ok(casarCompromisso({ clientId: 'c-x', dealId: null, nome: 'Pizzaria Lua Cheia', bairro: null }, paradas) === null, 'sem casamento: fica fora do plano');

// o dia sugerido: a rota que passa mais perto; senão o primeiro vazio; hoje só antes do meio-dia
const pontos = { '2026-10-08': [{ lat: -30.0346, lng: -51.2177 }], '2026-10-07': [] as Array<{ lat: number; lng: number }> };
const s1 = diaSugerido({ dias, hoje: '2026-10-06', horaBRT: 10, ponto: { lat: -30.0380, lng: -51.2177 }, contagem: { '2026-10-08': 5, '2026-10-09': 15 }, pontosDoDia: pontos });
ok(s1?.dia === '2026-10-08' && /a rota passa a 3[5-9]0 m/.test(s1.motivo), 'sugere quinta: a rota passa a ~380 m (' + (s1 && s1.motivo) + ')');
const s2 = diaSugerido({ dias, hoje: '2026-10-06', horaBRT: 15, ponto: null, contagem: { '2026-10-06': 2, '2026-10-08': 5 }, pontosDoDia: {} });
ok(s2?.dia === '2026-10-07' && s2.motivo === 'está vazio', 'sem ponto, depois do meio-dia: o primeiro dia vazio a partir de amanhã');
ok(diaSugerido({ dias: ['2026-10-09'], hoje: '2026-10-06', horaBRT: 9, ponto: null, contagem: { '2026-10-09': 15 }, pontosDoDia: {} }) === null, 'tudo cheio: sem sugestão');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nplano único: tudo certo');
