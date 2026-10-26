// Teste da conta da rota do dia (Agenda no computador).
//
// Rode com:  npx tsx src/utils/rotaDoDia.teste.ts
import { conflito, encaixar, horarios, hhmm, melhorPosicao, ordemParaDirigir, perna, resumo, temOutraCidade, type ParadaRota } from './rotaDoDia';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

// Quatro pontos em linha no Méier, ~500 m entre eles (0,0045° de latitude).
const pt = (i: number) => ({ latitude: -22.9 - i * 0.0045, longitude: -43.28 });
const P = (id: string, i: number, fixo: number | null = null): ParadaRota => ({ id, ponto: pt(i), fixo });

const t = perna(pt(0), pt(1))!;
ok(t.m > 600 && t.m < 700 && t.min === 2, `perna de ~500 m em linha reta vira ~650 m de rua e 2 min (${Math.round(t.m)} m, ${t.min} min)`);

const livre = [P('a', 0), P('b', 1), P('c', 2)];
const h = horarios(livre, 9 * 60);
ok(h.map((x) => hhmm(x.chega)).join() === '09:00,09:22,09:44', 'estimado: início + 20 min por visita + caminho');
ok(conflito(livre, h) === null, 'sem horário fixo, sem conflito');
const r = resumo(livre, h);
ok(hhmm(r.inicio!) === '09:00' && hhmm(r.fim!) === '10:04' && r.km > 1.2 && r.km < 1.4, `resumo: 09:00 → 10:04, ${r.km.toFixed(2)} km`);

// Uma reunião às 15:00 na 2ª posição faz esperar horas: conflito.
const comFixo = [P('a', 0), P('f', 1, 15 * 60), P('b', 2), P('c', 3)];
const h2 = horarios(comFixo, 9 * 60);
ok(h2[1].chega === 15 * 60 && h2[1].espera > 300, 'o cadeado segura o horário e a espera aparece');
ok(h2[2].chega === 15 * 60 + 20 + 2, 'a parada depois do cadeado anda a partir do horário fixo');
const c = conflito(comFixo, h2);
ok(c?.indice === 1 && c.espera > 20, 'espera > 20 min na fixa é conflito');

// Chegar atrasado à fixa também é conflito.
const atrasado = [P('a', 0), P('b', 1), P('c', 2), P('f', 3, 9 * 60 + 30)];
const c2 = conflito(atrasado, horarios(atrasado, 9 * 60));
ok(c2?.indice === 3 && c2.atraso > 10, 'atraso > 10 min na fixa é conflito');

// Encaixar: a fixa das 09:30 vai para onde chega na hora, e o resto fica pelo caminho.
const nova = encaixar(atrasado, 9 * 60);
const reord = nova.map((id) => atrasado.find((p) => p.id === id)!);
ok(conflito(reord, horarios(reord, 9 * 60)) === null, `encaixar resolve o atraso (${nova.join(' → ')})`);
ok(nova.length === 4 && new Set(nova).size === 4, 'encaixar não perde nem duplica parada');

// Melhor posição: um ponto entre b e c entra entre b e c.
const meio = { latitude: (pt(1).latitude + pt(2).latitude) / 2, longitude: -43.28 };
const m = melhorPosicao(livre, meio);
ok(m.indice === 2 && m.minAMais >= 20 && m.minAMais <= 23, `entra na posição 2 com ${m.minAMais} min a mais (20 da visita + caminho)`);
ok(m.maisPerto === 1 || m.maisPerto === 2, 'aponta a parada mais perto');
ok(melhorPosicao([], meio).indice === 0, 'dia vazio: entra em primeiro');

// Parada sem coordenada não quebra a conta.
const semPonto: ParadaRota[] = [P('a', 0), { id: 'x', ponto: null, fixo: null }, P('b', 1)];
ok(horarios(semPonto, 540).length === 3 && encaixar(semPonto, 540).length === 3, 'parada sem coordenada entra com 10 min de caminho e não some');

// paradas em cidades diferentes (auditoria 06/10/26: Vila Velha + Flamengo viravam 540 km e 22h de rua)
const vv = { latitude: -20.33, longitude: -40.29 }, rio = { latitude: -22.93, longitude: -43.17 };
ok(temOutraCidade([{ id: 'a', ponto: vv, fixo: null }, { id: 'b', ponto: rio, fixo: null }]), 'Vila Velha → Rio é outra cidade: sem horas de rua inventadas');
ok(!temOutraCidade([{ id: 'a', ponto: vv, fixo: null }, { id: 'b', ponto: { latitude: -20.35, longitude: -40.31 }, fixo: null }]), 'paradas no mesmo bairro seguem com a estimativa');

// A ORDEM PARA DIRIGIR (26/10/26): o dia real do Sérgio em 23/10, na ordem em que entrou no plano
// (Morumbi, Vila Paulicéia, Vila Guilherme, Vila Gertrudes no sul, Carandiru...), saindo de Santana.
{
  const sp = (id: string, lat: number, lng: number, fixo: number | null = null): ParadaRota => ({ id, ponto: { latitude: lat, longitude: lng }, fixo });
  const dia = [
    sp('morumbi', -23.62722, -46.69944), sp('barecito', -23.4888, -46.60992), sp('north', -23.48967, -46.61033),
    sp('quintal', -23.50855, -46.60621), sp('terraco', -23.4926, -46.61069), sp('quatro', -23.62532, -46.70093),
    sp('lelui', -23.50475, -46.61237), sp('villares', -23.49736, -46.61217),
  ];
  const santana = { latitude: -23.5018, longitude: -46.6168 };
  const km = (ids: string[], de: { latitude: number; longitude: number } | null) => {
    const pts = ids.map((id) => dia.find((p) => p.id === id)!.ponto!);
    let m = de ? perna(de, pts[0])!.m : 0;
    for (let i = 1; i < pts.length; i++) m += perna(pts[i - 1], pts[i])!.m;
    return m / 1000;
  };
  const ordem = ordemParaDirigir(dia, santana, 10 * 60);
  const antes = km(dia.map((p) => p.id), santana), depois = km(ordem, santana);
  ok(ordem.length === dia.length && new Set(ordem).size === dia.length, 'nenhuma parada some nem repete');
  ok(depois < antes * 0.6, `pelo caminho: ${depois.toFixed(1)} km contra ${antes.toFixed(1)} km na ordem do plano`);
  const sul = ['morumbi', 'quatro'].map((id) => ordem.indexOf(id)).sort((a, b) => a - b);
  ok(sul[1] - sul[0] === 1, 'as duas paradas da zona sul ficam juntas (sem voltar ao sul duas vezes)');
  ok(['lelui', 'villares', 'terraco', 'quintal'].includes(ordem[0]), 'começa pela parada mais perto de onde ele está');
  // com cadeado: o Quatro às 10:00 vem na hora, mesmo sendo longe
  const comCadeado = dia.map((p) => (p.id === 'quatro' ? { ...p, fixo: 11 * 60 } : p));
  const o2 = ordemParaDirigir(comCadeado, santana, 10 * 60);
  const hs = horarios([{ id: 'o', ponto: santana, fixo: null }, ...o2.map((id) => comCadeado.find((p) => p.id === id)!)], 10 * 60 - 20);
  const iQ = o2.indexOf('quatro') + 1;
  ok(hs[iQ].atraso <= 10, `a parada com cadeado às 11:00 chega no horário (atraso ${hs[iQ].atraso} min)`);
  ok(ordemParaDirigir(dia, null, 9 * 60).length === dia.length, 'sem GPS, cai no Encaixar com todas as paradas');
}

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
