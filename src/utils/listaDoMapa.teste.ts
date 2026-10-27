// Teste da lista do que está filtrado no mapa (Julyan, 27/10/26).
//
// Rode com:  npx tsx src/utils/listaDoMapa.teste.ts
import { montarLista, situacao, type ItemDaLista } from './listaDoMapa';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const AGORA = new Date('2026-10-27T15:00:00-03:00');
const EU = { lat: -20.3000, lng: -40.2900 };

const it = (p: Partial<ItemDaLista> & { id: string }): ItemDaLista => ({
  nome: p.id, bairro: 'Praia do Canto', lat: -20.3, lng: -40.29, aproximado: false, cor: '#E23B3B',
  plano: null, visitadoEm: null, diasNaEtapa: null, etiqueta: null, ...p,
});

// ── ordem: mais perto primeiro ───────────────────────────────────────────────────────────
const perto = it({ id: 'perto', lat: -20.3005, lng: -40.2900 });   // ~55 m
const medio = it({ id: 'medio', lat: -20.3100, lng: -40.2900 });   // ~1,1 km
const longe = it({ id: 'longe', lat: -20.4000, lng: -40.2900 });   // ~11 km
const ordem = montarLista([longe, medio, perto], EU, AGORA);
ok(ordem.map((l) => l.id).join(',') === 'perto,medio,longe', 'mais perto primeiro');
ok(/^\d+ m$/.test(ordem[0].distancia ?? ''), `o mais perto sai em metros (${ordem[0].distancia})`);
ok((ordem[1].distancia ?? '').endsWith(' km'), 'acima de 1 km sai em km');

// ── coordenada aproximada: a distância NÃO pode parecer exata ────────────────────────────
const aprox = montarLista([it({ id: 'a', lat: -20.3005, lng: -40.29, aproximado: true })], EU, AGORA)[0];
ok(aprox.distancia!.startsWith('~'), `pino aproximado sai com ~ (${aprox.distancia})`);
ok(aprox.aproximado === true, 'a linha carrega o aviso de aproximado para a tela marcar');

// ── sem coordenada vai para o fim, não some e não inventa distância ──────────────────────
// AS DUAS ORDENS DE ENTRADA. Com dois itens o motor de ordenação chama o comparador uma vez só,
// e o teste passava mesmo com o lado errado invertido (pego aqui na sabotagem de 27/10/26).
const sem = it({ id: 'sem', lat: null, lng: null });
for (const [rotulo, entrada] of [['sem coordenada primeiro', [sem, perto, medio]], ['sem coordenada por último', [medio, perto, sem]]] as const) {
  const r = montarLista([...entrada], EU, AGORA);
  ok(r.length === 3, `quem não tem coordenada continua na lista (${rotulo})`);
  ok(r[2].id === 'sem' && r[2].distancia === null, `sem coordenada: último e sem distância (${rotulo})`);
  ok(r[0].id === 'perto', `a ordem por distância se mantém (${rotulo})`);
}

// ── sem GPS: alfabética e NENHUMA distância ──────────────────────────────────────────────
const semGps = montarLista([it({ id: 'zz', nome: 'Zeca' }), it({ id: 'aa', nome: 'Ana' })], null, AGORA);
ok(semGps.map((l) => l.nome).join(',') === 'Ana,Zeca', 'sem GPS a lista é alfabética');
ok(semGps.every((l) => l.distancia === null), 'sem GPS nenhuma linha mostra distância');

// ── a coluna que decide: o que falta ali ─────────────────────────────────────────────────
ok(situacao(it({ id: 'x' }), AGORA) === 'nunca visitado', 'nunca visitado');
ok(situacao(it({ id: 'x', diasNaEtapa: 12 }), AGORA) === 'nunca visitado · 12 dias parado', 'nunca visitado soma o tempo parado');
ok(situacao(it({ id: 'x', visitadoEm: '2026-10-27T09:00:00-03:00' }), AGORA) === 'visitado hoje', 'visita de hoje');
ok(situacao(it({ id: 'x', visitadoEm: '2026-10-26T22:00:00-03:00' }), AGORA) === 'visitado ontem', 'visita de ontem');
ok(situacao(it({ id: 'x', visitadoEm: '2026-10-17T09:00:00-03:00' }), AGORA) === 'última visita há 10 dias', 'visita antiga em dias');
ok(situacao(it({ id: 'x', plano: 2, visitadoEm: '2026-10-01T09:00:00-03:00' }), AGORA) === '2ª parada do plano', 'o plano de hoje manda');

// A visita das 23h de ontem é ONTEM, não "há 0 dias": o dia é o de Brasília, não o fuso do aparelho.
ok(!situacao(it({ id: 'x', visitadoEm: '2026-10-26T23:30:00-03:00' }), AGORA).includes('0 dias'), 'nunca "há 0 dias"');
// Data podre no cadastro não pode virar "há NaN dias" na tela do executivo — nem LANÇAR, que é
// o que o Intl faz com data inválida. Chamada protegida: sem isso, o defeito mata a suíte em vez
// de ser reportado, e quem lê a saída não sabe qual regra quebrou.
const semLancar = <T>(f: () => T): T | '(lançou)' => { try { return f(); } catch { return '(lançou)'; } };
ok(semLancar(() => situacao(it({ id: 'x', visitadoEm: 'ontem' }), AGORA)) === 'nunca visitado', 'data inválida não vira NaN nem lança');

// ── a ORDEM "nunca visitado primeiro" (Julyan, 27/10/26) ─────────────────────────────────
// Dois blocos, e dentro de cada um a distância manda. Os casos são montados com a ordem de
// distância CRUZADA com a de visita: se o segundo critério sumir, a ordem muda.
const pertoVisitado = it({ id: 'pv', nome: 'Perto visitado', lat: -20.3005, lng: -40.29, visitadoEm: '2026-10-01T10:00:00-03:00' });
const medioNovo = it({ id: 'mn', nome: 'Médio novo', lat: -20.3100, lng: -40.29 });
const longeNovo = it({ id: 'ln', nome: 'Longe novo', lat: -20.4000, lng: -40.29 });
const medioVisitado = it({ id: 'mv', nome: 'Médio visitado', lat: -20.3050, lng: -40.29, visitadoEm: '2026-09-01T10:00:00-03:00' });
const baralho = [pertoVisitado, longeNovo, medioVisitado, medioNovo];

ok(montarLista([...baralho], EU, AGORA, 'perto').map((l) => l.id).join(',') === 'pv,mv,mn,ln',
  'ordem "perto" ignora a visita: puro metro');
ok(montarLista([...baralho], EU, AGORA, 'novo').map((l) => l.id).join(',') === 'mn,ln,pv,mv',
  'ordem "novo": nunca visitados primeiro e, dentro de cada bloco, o mais perto');
ok(montarLista([...baralho], EU, AGORA).map((l) => l.id).join(',') === 'pv,mv,mn,ln',
  'sem dizer a ordem, continua "perto" — a troca é escolha de quem usa, não padrão novo');

// Sem GPS a ordem "novo" ainda vale: blocos por visita, alfabética dentro de cada um.
ok(montarLista([...baralho], null, AGORA, 'novo').map((l) => l.nome).join(',') === 'Longe novo,Médio novo,Médio visitado,Perto visitado',
  'sem GPS a ordem "novo" separa os blocos e ordena por nome dentro de cada um');

// A linha carrega o mesmo veredito que a ordem usou — texto e ordem não podem discordar. E
// montar a lista NÃO PODE LANÇAR: `Intl.DateTimeFormat.format` joga RangeError em data inválida,
// e um throw aqui sobe até a BarreiraDeErro e apaga a tela de quem está na rua.
for (const podre of ['ontem', '', '0000-00-00', '31/10/2026']) {
  for (const o of ['perto', 'novo'] as const) {
    let linha: ReturnType<typeof montarLista>[number] | null = null;
    let lancou = false;
    try { linha = montarLista([it({ id: 'podre', visitadoEm: podre })], EU, AGORA, o)[0]; } catch { lancou = true; }
    ok(!lancou, `data podre ${JSON.stringify(podre)} na ordem "${o}" não derruba a lista`);
    ok(!lancou && linha!.nunca === true && linha!.sub.includes('nunca visitado'),
      `data podre ${JSON.stringify(podre)} na ordem "${o}": ordem e texto concordam`);
  }
}

// ── o bairro na linha ────────────────────────────────────────────────────────────────────
ok(montarLista([it({ id: 'x', bairro: 'SANTA ROSA DE LIMA' })], EU, AGORA)[0].sub.startsWith('Santa Rosa de Lima · '), 'caixa alta vira grafia de tela');
ok(montarLista([it({ id: 'x', bairro: null })], EU, AGORA)[0].sub.startsWith('sem bairro no cadastro · '), 'sem bairro diz que falta no cadastro, não fica vazio');
ok(montarLista([it({ id: 'x', etiqueta: 'Negociação' })], EU, AGORA)[0].sub.endsWith(' · Negociação'), 'a etiqueta do pino entra no fim');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nTudo certo.');
