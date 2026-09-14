// Teste da politica de revalidacao.
//
// Rode com:  npx tsx src/dados/vivo.teste.ts
//
// `devoRevalidar` foi separada do hook justamente pra caber aqui: e' a unica
// parte de `vivo.ts` com regra, e as tres coisas que ela impede (carga dupla,
// repintar em cima de quem digita, ir ao banco a cada alt-tab) sao invisiveis
// na tela quando quebram. Ninguem olha um cockpit e percebe que ele consultou
// o Supabase quatro vezes em dois segundos.
import { devoRevalidar, INTERVALO_MINIMO_MS } from './vivo';

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

const base = { agoraMs: 1_000_000, ultimaMs: null, emVoo: false, pausado: false };

console.log('--- colapso: nunca duas cargas ao mesmo tempo ---');
ok('carga em voo bloqueia', devoRevalidar({ ...base, emVoo: true }), false);
ok(
  'em voo vence ate' + ' com intervalo vencido',
  devoRevalidar({ ...base, emVoo: true, ultimaMs: 0 }),
  false,
);

console.log('\n--- a trava de quem esta registrando ---');
ok('pausado bloqueia', devoRevalidar({ ...base, pausado: true }), false);
ok(
  'pausado bloqueia mesmo com muito tempo parado',
  devoRevalidar({ ...base, pausado: true, ultimaMs: 0 }),
  false,
);

console.log('\n--- intervalo minimo: alt-tab nao vira rajada ---');
ok('nunca tentou antes, pode', devoRevalidar({ ...base, ultimaMs: null }), true);
ok(
  'acabou de tentar, nao',
  devoRevalidar({ ...base, ultimaMs: base.agoraMs - 1_000 }),
  false,
);
ok(
  'exatamente no limite, pode',
  devoRevalidar({ ...base, ultimaMs: base.agoraMs - INTERVALO_MINIMO_MS }),
  true,
);
ok(
  'um milissegundo antes do limite, nao',
  devoRevalidar({ ...base, ultimaMs: base.agoraMs - INTERVALO_MINIMO_MS + 1 }),
  false,
);
ok(
  'muito tempo depois, pode',
  devoRevalidar({ ...base, ultimaMs: base.agoraMs - 10 * INTERVALO_MINIMO_MS }),
  true,
);

console.log('\n--- minimo configuravel ---');
ok(
  'minimo proprio vence o padrao',
  devoRevalidar({ ...base, ultimaMs: base.agoraMs - 1_000, minimoMs: 500 }),
  true,
);
ok('minimo zero libera sempre', devoRevalidar({ ...base, ultimaMs: base.agoraMs, minimoMs: 0 }), true);

console.log('\n--- precedencia: bloqueio vence permissao ---');
ok(
  'pausado + em voo + intervalo vencido = nao',
  devoRevalidar({ ...base, ultimaMs: 0, emVoo: true, pausado: true }),
  false,
);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`);
if (falhas) throw new Error(`${falhas} teste(s) de revalidacao falharam`);
