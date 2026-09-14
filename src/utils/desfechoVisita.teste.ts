// Teste do bloco DESFECHO_VISITA v1.
//
// Rode com:  npx tsx src/utils/desfechoVisita.teste.ts
//
// Esta' aqui porque o bloco e' CONTRATO com um parser que vive em outro
// sistema: quando ele quebra, nada falha, nada loga e nada aparece vermelho na
// tela — o desfecho so' volta `null` do outro lado e a cadencia cai na regua
// generica. Um defeito que se esconde por semanas.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GARGALOS } from './desfechoVisita';
import { STAGES } from '../constants/stages';
import {
  decisorDoDesfecho,
  ehDiaUtil,
  proximoDiaUtil,
  montarBlocoDesfecho,
  vencimentoDoDia,
  tituloDoProximoPasso,
  PRIMEIRA_LINHA,
  type EntradaDesfecho,
} from './desfechoVisita';

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

const base: EntradaDesfecho = {
  cliente: 'Bar do Zé',
  ocorridoEm: '2026-08-27T17:30:00.000Z',
  canal: 'visita',
  desfecho: 'decisor_ausente',
  decisorAlcancado: 'desconhecido',
};
const campo = (bloco: string, chave: string) =>
  bloco.split('\n').find((l) => l.startsWith(`${chave}: `))?.slice(chave.length + 2) ?? null;

console.log('--- o cabecalho e a forma ---');
ok('primeira linha exata', montarBlocoDesfecho(base).split('\n')[0], PRIMEIRA_LINHA);
ok('uma chave por linha, todas presentes', montarBlocoDesfecho(base).split('\n').length, 15);
ok(
  'chave vazia aparece, nao some',
  montarBlocoDesfecho(base).includes('\ndor: '),
  true,
);
ok('origem sempre pwa', campo(montarBlocoDesfecho(base), 'origem'), 'pwa');

console.log('\n--- decisor_alcancado: so "sim" e verdadeiro ---');
ok('sim sai sim', campo(montarBlocoDesfecho({ ...base, decisorAlcancado: 'sim' }), 'decisor_alcancado'), 'sim');
ok(
  '"nao sei" sai VAZIO — nunca "nao"',
  campo(montarBlocoDesfecho({ ...base, decisorAlcancado: 'desconhecido' }), 'decisor_alcancado'),
  '',
);
ok(
  'nao explicito sai nao',
  campo(montarBlocoDesfecho({ ...base, decisorAlcancado: 'nao' }), 'decisor_alcancado'),
  'nao',
);

console.log('\n--- decisor derivado do desfecho: so o inequivoco ---');
ok('falou com o decisor => sim', decisorDoDesfecho('falou_com_decisor'), 'sim');
ok('decisor ausente => nao', decisorDoDesfecho('decisor_ausente'), 'nao');
ok('estabelecimento fechado => nao', decisorDoDesfecho('estabelecimento_fechado'), 'nao');
ok('sem interesse => desconhecido (nao se sabe quem recusou)', decisorDoDesfecho('sem_interesse'), 'desconhecido');
ok('pediu retorno => desconhecido', decisorDoDesfecho('pediu_retorno'), 'desconhecido');
ok('outro => desconhecido', decisorDoDesfecho('outro'), 'desconhecido');
ok(
  'e o desconhecido chega VAZIO no bloco',
  campo(montarBlocoDesfecho({ ...base, desfecho: 'sem_interesse', decisorAlcancado: decisorDoDesfecho('sem_interesse') }), 'decisor_alcancado'),
  '',
);

console.log('\n--- quebra de linha nao pode vazar pro bloco ---');
const sujo = montarBlocoDesfecho({
  ...base,
  observacao: 'dono aparece\ndepois das 19h\r\nperguntar por ele',
  dor: 'taxa\tcome a margem',
});
ok('observacao vira uma linha so', campo(sujo, 'observacao'), 'dono aparece depois das 19h perguntar por ele');
ok('tabulacao vira espaco', campo(sujo, 'dor'), 'taxa come a margem');
ok('o bloco continua com 15 linhas', sujo.split('\n').length, 15);

console.log('\n--- proximo passo ---');
ok(
  'formato canal | dia | acao',
  campo(
    montarBlocoDesfecho({ ...base, proximoPasso: { canal: 'ligacao', dia: '2026-08-28', acao: 'Ligar pedindo o decisor pelo nome' } }),
    'proximo_passo',
  ),
  'ligacao | 2026-08-28 | Ligar pedindo o decisor pelo nome',
);
ok('sem proximo passo, chave vazia', campo(montarBlocoDesfecho(base), 'proximo_passo'), '');
ok(
  'acao em branco nao vira passo fantasma',
  campo(montarBlocoDesfecho({ ...base, proximoPasso: { canal: 'ligacao', dia: '2026-08-28', acao: '   ' } }), 'proximo_passo'),
  '',
);

console.log('\n--- vencimento: 12:00 UTC = 09:00 BRT ---');
ok('data vira meio-dia UTC', vencimentoDoDia('2026-09-15'), '2026-09-15T12:00:00.000Z');
ok(
  'o dia nao anda pra tras no Brasil',
  new Date(vencimentoDoDia('2026-09-15')).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  '15/09/2026',
);
ok('virada de ano', vencimentoDoDia('2027-01-01'), '2027-01-01T12:00:00.000Z');

console.log('\n--- prazo do proximo passo nunca cai em fim de semana ---');
// 11/09/2026 e' sexta; 12 sabado; 13 domingo; 14 segunda.
ok('sexta e dia util', ehDiaUtil('2026-09-11'), true);
ok('sabado nao e', ehDiaUtil('2026-09-12'), false);
ok('domingo nao e', ehDiaUtil('2026-09-13'), false);
ok('D+1 de sexta pula o fim de semana', proximoDiaUtil('2026-09-11', 1), '2026-09-14');
ok('D+1 de segunda e terca', proximoDiaUtil('2026-09-14', 1), '2026-09-15');
ok('D+3 de quinta cai na terca', proximoDiaUtil('2026-09-10', 3), '2026-09-15');
ok('D+5 de segunda fecha a semana seguinte', proximoDiaUtil('2026-09-14', 5), '2026-09-21');
ok('nenhum prazo cai em fim de semana', [1, 2, 3, 4, 5, 7, 10].every((n) =>
  ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14'].every((base) =>
    ehDiaUtil(proximoDiaUtil(base, n)))), true);

console.log('\n--- titulo da tarefa ---');
ok('ligacao', tituloDoProximoPasso('ligacao', 'Bar do Zé'), 'Ligar para Bar do Zé');
ok('visita', tituloDoProximoPasso('visita', 'Bar do Zé'), 'Revisitar Bar do Zé');

// A MESMA lista de gargalos vive em tres lugares que nao podem se importar:
// aqui (o formulario de desfecho), em constants/stages.ts (a passagem pra
// Conversa com decisor) e dentro da edge function, que roda em Deno. Como o
// HubSpot recusa valor fora da enumeracao com erro cru, divergir significa o
// vendedor apertar "Salvar" na calcada e receber uma mensagem que nao explica
// nada. A guarda le' os outros dois arquivos e compara.
console.log('\n--- a lista de gargalos nao pode divergir entre os tres lugares ---');

// `fileURLToPath` e' obrigatorio aqui: o caminho do repositorio tem espaco
// ("PWA app-Outbound"), e `.pathname` devolveria %20 — arquivo nao encontrado.
const edge = readFileSync(
  fileURLToPath(new URL('../../supabase/functions/hubspot-sync/index.ts', import.meta.url).href),
  'utf8',
);
const bloco = edge.match(/const GARGALOS_VALIDOS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
const naEdge = [...bloco.matchAll(/'([^']*)'/g)].map((m) =>
  m[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
);
ok('a edge declara a lista', naEdge.length, GARGALOS.length);
ok('edge x formulario de desfecho', naEdge, [...GARGALOS]);

const campoNoStages = STAGES.find((e) => e.id === '1395880470')?.subFields?.find(
  (f) => f.field === 'gargalo_operacional',
);
// `StageSubField` e' uniao (select/currency/date/...); so' o ramo de select tem
// `options`, e a guarda precisa REPROVAR se o campo deixar de ser select.
const noStages = campoNoStages && campoNoStages.kind === 'select' ? campoNoStages.options : [];
ok('stages.ts x formulario de desfecho', noStages, [...GARGALOS]);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`);
if (falhas) throw new Error(`${falhas} teste(s) do desfecho falharam`);
