// Teste da fila offline do campo.
//
// Rode com:  npx tsx src/utils/filaOffline.teste.ts
//
// Sem IndexedDB (Node), a fila roda no espelho em memória — é a mesma lógica
// de ordem, estado e deduplicação que o celular usa. O que este teste protege:
// sem sinal nada some e nada pula a ordem; a mesma ação nunca sobe duas vezes;
// erro de regra (longe demais) não fica tentando para sempre. Conferido
// vermelho em 25/09/2026 tirando o `break` e a trava de subida simultânea.
import { descartar, ehErroDeRede, enfileirar, itensDaFila, liberar, novoAcaoId, registrarExecutor, subirFila } from './filaOffline';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

let online = false;
let chamadas: string[] = [];
registrarExecutor('checkin', async (i) => {
  chamadas.push(i.acaoId);
  if (!online) throw new TypeError('Failed to fetch');
  if (i.payload.longe) throw new Error('Você está a 900 m do lead');
});

(async () => {
  const a = novoAcaoId(), b = novoAcaoId(), c = novoAcaoId();
  ok(/^[0-9a-f-]{36}$/.test(a) && a !== b, 'acaoId é uuid e único');

  await enfileirar({ acaoId: a, tipo: 'checkin', rotulo: 'A', payload: {} });
  await enfileirar({ acaoId: a, tipo: 'checkin', rotulo: 'A de novo', payload: {} });
  await enfileirar({ acaoId: b, tipo: 'checkin', rotulo: 'B', payload: { longe: true } });
  await enfileirar({ acaoId: c, tipo: 'checkin', rotulo: 'C', payload: {} });
  ok(itensDaFila().length === 3, 'a mesma ação não entra duas vezes');

  let n = await subirFila();
  ok(n === 0 && itensDaFila().length === 3 && chamadas.length === 1, 'sem sinal: para no primeiro e nada some');
  ok(itensDaFila()[0].tentativas === 1 && itensDaFila()[0].estado === 'na_fila', 'erro de rede deixa na fila');

  online = true;
  chamadas = [];
  const [n1, n2] = await Promise.all([subirFila(), subirFila()]);
  ok(n1 === 2 && n2 === 2 && chamadas.length === 3, 'duas subidas simultâneas viram uma (sem duplicar)');

  const resto = itensDaFila();
  ok(resto.length === 1 && resto[0].acaoId === b && resto[0].estado === 'falhou' && /900 m/.test(resto[0].erro ?? ''),
    'erro de regra vira "falhou" com o motivo');

  chamadas = [];
  n = await subirFila();
  ok(chamadas.length === 0, '"falhou" não tenta sozinho');
  await subirFila(true);
  ok(chamadas.length === 1, '"Tentar agora" tenta o que falhou');

  await descartar(b);
  ok(itensDaFila().length === 0, 'descartar tira da fila');

  // EM VOO (06/10/26): o HubSpot do "Marcar o próximo passo" entra antes do envio. Enquanto a
  // tela envia, a fila não sobe nem mostra; se o app fechar, sobe depois; se cair por sinal, liberar.
  const v = novoAcaoId();
  chamadas = [];
  await enfileirar({ acaoId: v, tipo: 'checkin', rotulo: 'V', payload: {}, naoAntesDe: new Date(Date.now() + 60_000).toISOString() });
  ok(itensDaFila().length === 0, 'em voo: não aparece na fila');
  await subirFila();
  ok(chamadas.length === 0, 'em voo: a fila não sobe o que a tela ainda está enviando');
  await liberar(v);
  ok(itensDaFila().length === 1, 'liberar (caiu o sinal): passa a aparecer');
  n = await subirFila();
  ok(n === 1 && chamadas.length === 1 && itensDaFila().length === 0, 'liberado: sobe na próxima subida');
  const w = novoAcaoId();
  await enfileirar({ acaoId: w, tipo: 'checkin', rotulo: 'W', payload: {}, naoAntesDe: new Date(Date.now() - 1000).toISOString() });
  chamadas = [];
  n = await subirFila();
  ok(n === 1 && chamadas.length === 1, 'app fechou no meio: passada a hora, sobe sozinho');

  ok(ehErroDeRede(new TypeError('Load failed')) && !ehErroDeRede(new Error('Lead não encontrado')),
    'separa erro de rede de erro de regra');

  if (falhas) {
    console.log(`\n${falhas} falha(s)`);
    process.exit(1);
  }
  console.log('\nfila offline: tudo certo');
})();
