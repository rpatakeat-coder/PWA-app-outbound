// Teste da lista do que está filtrado no mapa (Julyan, 27/10/26).
//
// Rode com:  npx tsx src/utils/listaDoMapa.teste.ts
import { gruposDaLista, montarLista, noTrecho, situacao, type ItemDaLista } from './listaDoMapa';

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

/* A POSIÇÃO NO PLANO SAI NA LINHA (prancha "Mapa limpo" §6, 29/10/26): o dado entrava e morria
   aqui dentro. É ele que separa "NO PLANO" de "FORA DO PLANO, PERTO" na folha da Lista. */
ok(montarLista([it({ id: 'a', plano: 2 })], EU, AGORA)[0].plano === 2, 'a linha diz em que posição do plano está');
ok(montarLista([it({ id: 'b' })], EU, AGORA)[0].plano === null, 'fora do plano, a linha diz null — não zero, que seria uma posição');

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

// ── o mapa na rua (prancha 6a/6b, 02/11/26): por quê, próximo passo, 3 grupos, trecho ───────
const pq = (p: Partial<ItemDaLista>) => montarLista([it({ id: 'x', ...p })], EU, AGORA)[0];
ok(pq({ plano: 4 }).porque === 'Parada 4 do plano' && !pq({ plano: 4 }).porqueCobra, 'parada do plano: "Parada 4 do plano"');
ok(pq({ cobrar: true, diasSemToque: 88 }).porque === '88 dias sem toque' && pq({ cobrar: true, diasSemToque: 88 }).porqueCobra, 'cobrar: "88 dias sem toque", em âmbar');
ok(pq({ familia: 'rec', abertoHa: 12 }).porque === 'Recém-aberto há 12 dias', 'recém: a idade exata (saiu do losango)');
ok(pq({ familia: 'rec', abertoHa: 81 }).porque === 'Recém-aberto há 81 dias', 'recém de 81 dias: a idade que o mapa não mostra mais');
ok(pq({ familia: 'cli', queda: '−32% em 30 dias' }).porque === 'Cliente em queda · −32% em 30 dias' && pq({ familia: 'cli', queda: 'x' }).porqueCobra, 'em queda: o motivo, em âmbar');
ok(pq({ proximo: { texto: 'Retorno com o dono', quando: '14/10', vencido: true } }).proximo === 'Próximo: retorno com o dono · venceu 14/10', 'próximo passo vencido diz "venceu"');
ok(pq({ familia: 'lead' }).proximo === 'Próximo: 1ª visita', 'nunca visitado sem passo: 1ª visita');
ok(pq({ familia: 'cli' }).proximo === null, 'cliente sem passo: sem linha inventada');
ok(pq({ lat: -20.3010, lng: -40.29 }).minutos === 1 && pq({ lat: -20.3022, lng: -40.29 }).minutos === 3, 'minutos a pé (80 m/min)');
ok(pq({ lat: -20.40, lng: -40.29 }).minutos === null, 'longe (mais de 2 km): sem minutos a pé');
const ls = montarLista(['a', 'b', 'c', 'd', 'e'].map((id, i) => it({ id, lat: -20.3 - i * 0.001 })), EU, AGORA);
const g = gruposDaLista(ls, 'c', ['e', 'a', 'zz']);
ok(g.map((x) => x.grupo).join() === 'proxima,perto,resto', 'três grupos, na ordem do mapa');
ok(g[0].linhas.map((l) => l.id).join() === 'c' && g[1].linhas.map((l) => l.id).join() === 'e,a' && g[2].linhas.map((l) => l.id).join() === 'b,d',
  'A PRÓXIMA = N1; PEDEM AÇÃO PERTO = os nomes do N2 na ordem do mapa; O RESTO = o resto, na ordem da lista');
ok(gruposDaLista(ls, null, [])[2].linhas.length === 5, 'sem N1 e sem N2, tudo é o resto');
const reg = { latitude: -20.3, longitude: -40.29, latitudeDelta: 0.01, longitudeDelta: 0.01 };
ok(noTrecho({ lat: -20.304, lng: -40.29 }, reg) && !noTrecho({ lat: -20.31, lng: -40.29 }, reg) && !noTrecho({ lat: null, lng: null }, reg) && noTrecho({ lat: 1, lng: 1 }, null),
  'trecho visível: dentro, fora, sem coordenada, sem região');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nTudo certo.');
