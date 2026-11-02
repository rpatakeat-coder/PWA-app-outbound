// Teste das réguas do pino (porta ou endereço, e a pergunta do Cheguei) — 02/11/26.
//
// Rode com:  npx tsx src/utils/precisaoDoPino.teste.ts
import {
  DISTANCIA_PERGUNTA_APROX_M,
  DISTANCIA_PERGUNTA_M,
  DISTANCIA_PERGUNTA_NAO_CONFIRMADO_M,
  GRAVACAO_DA_MIRA,
  GRAVACAO_DO_CHEGUEI,
  PRECISAO_CONFIRMA_M,
  PRECISAO_PORTA_M,
  chaveDaPerguntaDoPino,
  decidirPinoNaPorta,
  deveSugerirMoverPino,
  enderecoCompleto,
  gpsServeNaPorta,
  gravacaoDoPino,
  gravacaoSemMapa,
  pinoConfirmado,
  textoDaBarraDoPino,
} from './precisaoDoPino';
import { pinoDeGps } from './mesmoLugar';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

// ── as réguas ───────────────────────────────────────────────────────────────────────────
ok(PRECISAO_PORTA_M === 50 && PRECISAO_CONFIRMA_M === 40, 'porta: abre no GPS até 50 m; confirma até 40 m');
ok(DISTANCIA_PERGUNTA_M === 100 && DISTANCIA_PERGUNTA_NAO_CONFIRMADO_M === 50 && DISTANCIA_PERGUNTA_APROX_M === 30, 'Cheguei: 100 / 50 / 30 m');

// ── como grava: nenhum caminho novo grava 'coords' exato ────────────────────────────────
const g1 = gravacaoDoPino({ modo: 'porta', precisaoM: 12, distanciaDoGpsM: 8 });
ok(g1.geo_source === 'checkin' && !g1.geo_approximate, 'na porta, GPS ±12 m, ajuste de 8 m: checkin exato');
const g2 = gravacaoDoPino({ modo: 'porta', precisaoM: 45, distanciaDoGpsM: 0 });
ok(g2.geo_source === 'mapa' && !g2.geo_approximate, 'na porta, GPS ±45 m (abre no GPS, não confirma): mapa exato');
const g3 = gravacaoDoPino({ modo: 'porta', precisaoM: 12, distanciaDoGpsM: 80 });
ok(g3.geo_source === 'mapa' && !g3.geo_approximate, 'na porta, arrastou 80 m do GPS: mapa exato (não confirmado)');
const g4 = gravacaoDoPino({ modo: 'porta', precisaoM: null, distanciaDoGpsM: null });
ok(g4.geo_source === 'mapa' && !g4.geo_approximate, 'na porta sem GPS: mapa exato (ele vê a porta)');
const g5 = gravacaoDoPino({ modo: 'endereco', precisaoM: 5, distanciaDoGpsM: 0 });
ok(g5.geo_source === 'geocode' && g5.geo_approximate, 'pelo endereço: geocode, SEMPRE aproximado');
ok(GRAVACAO_DA_MIRA.geo_source === 'mapa' && GRAVACAO_DA_MIRA.geo_approximate, 'Mover o pino (mira): mapa aproximado');
ok(GRAVACAO_DO_CHEGUEI.geo_source === 'checkin' && !GRAVACAO_DO_CHEGUEI.geo_approximate, 'Mover para cá no Cheguei: checkin');
ok([g1, g2, g3, g4, g5, GRAVACAO_DA_MIRA, GRAVACAO_DO_CHEGUEI].every((g) => !(g.geo_source === 'coords' && !g.geo_approximate)), 'nenhum grava coords exato');

// ── banco sem a 0247: 'mapa' cai para coords APROXIMADO ─────────────────────────────────
ok(gravacaoSemMapa(g2).geo_source === 'coords' && gravacaoSemMapa(g2).geo_approximate, 'mapa exato sem a 0247: coords aproximado');
ok(gravacaoSemMapa(GRAVACAO_DA_MIRA).geo_approximate, 'mira sem a 0247: coords aproximado');
ok(gravacaoSemMapa(g1) === g1 && gravacaoSemMapa(g5) === g5, 'checkin e geocode não mudam');

// ── confirmado é só checkin ─────────────────────────────────────────────────────────────
ok(pinoConfirmado({ geo_source: 'checkin', geo_approximate: false }), 'checkin exato: confirmado');
ok(!pinoConfirmado({ geo_source: 'coords', geo_approximate: false }), 'coords exato: NÃO confirmado');
ok(!pinoConfirmado({ geo_source: 'mapa', geo_approximate: false }), 'mapa exato: NÃO confirmado');
ok(!pinoConfirmado({ geo_source: 'checkin', geo_approximate: true }), 'checkin aproximado: não confirmado');
ok(pinoDeGps({ geo_source: 'checkin', geo_approximate: false }) && !pinoDeGps({ geo_source: 'coords', geo_approximate: false }), 'pinoDeGps (Cheguei) segue a mesma regra');

// ── GPS serve na porta? ─────────────────────────────────────────────────────────────────
ok(gpsServeNaPorta(12), '±12 m serve');
ok(gpsServeNaPorta(50), '±50 m serve (limite)');
ok(!gpsServeNaPorta(51), '±51 m não serve');
ok(!gpsServeNaPorta(null) && !gpsServeNaPorta(undefined) && !gpsServeNaPorta(Number.NaN), 'sem leitura não serve');

// ── Estou na porta ──────────────────────────────────────────────────────────────────────
const bom = decidirPinoNaPorta({ latitude: -20.3, longitude: -40.29, precisaoM: 18 });
ok(bom.gpsBom && bom.aviso === null && bom.centro?.latitude === -20.3, 'GPS bom: centro no GPS, sem aviso');
const ruim = decidirPinoNaPorta({ latitude: -20.3, longitude: -40.29, precisaoM: 140.4 });
ok(!ruim.gpsBom && ruim.aviso === 'GPS impreciso agora (± 140 m): arraste o pino até a porta.', `GPS ruim: aviso com a margem (${ruim.aviso})`);
ok(ruim.centro != null, 'GPS ruim: ainda abre perto da leitura');
const sem = decidirPinoNaPorta(null);
ok(sem.centro === null && !sem.gpsBom && !!sem.aviso, 'sem GPS: sem centro, com aviso');

// ── Não estou lá: número obrigatório ────────────────────────────────────────────────────
ok(!enderecoCompleto({ rua: 'Rua Lélio Gama', numero: '', semNumero: false }), 'sem número e sem marcar "sem número": falta');
ok(enderecoCompleto({ rua: 'Rua Lélio Gama', numero: '105', semNumero: false }), 'rua + número: completo');
ok(enderecoCompleto({ rua: 'Rua Lélio Gama', numero: ' ', semNumero: true }), '"sem número" explícito: completo');
ok(!enderecoCompleto({ rua: ' ', numero: '105', semNumero: false }), 'sem rua: falta');

// ── Cheguei: "O restaurante é aqui?" ────────────────────────────────────────────────────
const CHECKIN = { geo_source: 'checkin', geo_approximate: false };
const COORDS = { geo_source: 'coords', geo_approximate: false };
const APROX = { geo_source: 'geocode', geo_approximate: true };
const base = { precisaoM: 15, pino: CHECKIN, declarada: false };
ok(!deveSugerirMoverPino({ ...base, distanciaM: 80 }), 'confirmado a 80 m: não pergunta');
ok(!deveSugerirMoverPino({ ...base, distanciaM: 100 }), 'confirmado a 100 m: não pergunta (limite)');
ok(deveSugerirMoverPino({ ...base, distanciaM: 101 }), 'confirmado a 101 m: pergunta');
ok(deveSugerirMoverPino({ ...base, pino: COORDS, distanciaM: 51 }), 'coords exato a 51 m: pergunta');
ok(!deveSugerirMoverPino({ ...base, pino: COORDS, distanciaM: 50 }), 'coords exato a 50 m: não pergunta');
ok(deveSugerirMoverPino({ ...base, pino: APROX, distanciaM: 31 }), 'aproximado a 31 m: pergunta');
ok(!deveSugerirMoverPino({ ...base, pino: APROX, distanciaM: 30 }), 'aproximado a 30 m: não pergunta');
ok(deveSugerirMoverPino({ ...base, precisaoM: 40, pino: COORDS, distanciaM: 300 }), 'GPS de ±40 m: pergunta (limite)');
ok(!deveSugerirMoverPino({ ...base, precisaoM: 41, distanciaM: 400 }), 'GPS de ±41 m: nunca pergunta');
ok(!deveSugerirMoverPino({ ...base, precisaoM: null, distanciaM: 400 }), 'sem precisão: nunca pergunta');
ok(!deveSugerirMoverPino({ ...base, declarada: true, distanciaM: 400 }), 'visita declarada: não pergunta');
ok(!deveSugerirMoverPino({ ...base, distanciaM: Number.NaN }), 'sem distância: não pergunta');

// ── uma pergunta por pino por visita ────────────────────────────────────────────────────
const k1 = chaveDaPerguntaDoPino('c1', -20.300001, -40.29, '2026-11-02');
ok(k1 === chaveDaPerguntaDoPino('c1', -20.300002, -40.29, '2026-11-02'), 'mesmo pino, mesmo dia: mesma chave');
ok(k1 !== chaveDaPerguntaDoPino('c1', -20.31, -40.29, '2026-11-02'), 'pino movido: chave nova');
ok(k1 !== chaveDaPerguntaDoPino('c1', -20.300001, -40.29, '2026-11-03'), 'outro dia: chave nova');

// ── a barra: sem coordenada crua ────────────────────────────────────────────────────────
const textos = [
  textoDaBarraDoPino({ modo: 'porta', lendoGps: true, precisaoM: null, depoisPasso: false }),
  textoDaBarraDoPino({ modo: 'porta', lendoGps: false, precisaoM: 12, depoisPasso: false }),
  textoDaBarraDoPino({ modo: 'porta', lendoGps: false, precisaoM: 90, depoisPasso: true }),
  textoDaBarraDoPino({ modo: 'porta', lendoGps: false, precisaoM: null, depoisPasso: false }),
  textoDaBarraDoPino({ modo: 'endereco', lendoGps: false, precisaoM: null, depoisPasso: true }),
];
ok(textos.every((t) => !/-?\d+\.\d{4,}/.test(t)), 'nenhum texto da barra tem coordenada');
ok(textos[1].includes('± 12 m'), 'GPS bom diz a margem');
ok(textos[2].startsWith('GPS impreciso agora (± 90 m)') && textos[2].endsWith('Depois abre o próximo passo.'), 'GPS ruim pede para arrastar e lembra o próximo passo');
ok(textos[4].includes('aproximada'), 'pelo endereço diz que fica aproximado');

if (falhas > 0) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\ntudo certo');
