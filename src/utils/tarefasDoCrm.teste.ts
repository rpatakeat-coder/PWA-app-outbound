// Teste do marcador COCKPIT:PLANO.
//
// Rode com:  npx tsx src/utils/tarefasDoCrm.teste.ts
//
// É contrato de OUTRO sistema: quem escreve estas linhas é o Cockpit de
// gestão, que pode mudar sem avisar este repositório. Quando o parser quebra,
// nada falha e nada loga — a tarefa só aparece sem link para o lead, e o
// vendedor não consegue abrir o cliente no mapa. Defeito que se esconde.
import {
  lerMarcador,
  corpoLimpo,
  interpretarTarefa,
  clienteDoAssunto,
} from './tarefasDoCrm';

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

// Corpo real, copiado de uma Task do portal em 14/09/2026.
const REAL =
  'Endereço: SANTA RITA, Vila Velha\nOrigem: visita posta na semana pelo Planejamento do Cockpit.\nCOCKPIT:PLANO:v1:86100505:2026-09-14:17:00:visita:planejamento:65042434372';

console.log('--- o marcador de verdade ---');
const m = lerMarcador(REAL).marcador!;
ok('owner', m.ownerId, '86100505');
ok('dia', m.dia, '2026-09-14');
ok('hora (o ":" de dentro nao quebra o split)', m.hora, '17:00');
ok('tipo', m.tipo, 'visita');
ok('origem', m.origem, 'planejamento');
ok('deal — o que liga ao lead no app', m.dealId, '65042434372');

console.log('\n--- follow up, corpo so com o marcador ---');
const f = lerMarcador('COCKPIT:PLANO:v1:86100505:2026-09-14:09:00:follow_up:funil:60779219633').marcador!;
ok('tipo', f.tipo, 'follow_up');
ok('origem', f.origem, 'funil');
ok('hora', f.hora, '09:00');

console.log('\n--- o corpo que a pessoa le nao mostra o marcador ---');
ok(
  'linha de maquina sai',
  corpoLimpo(REAL),
  'Endereço: SANTA RITA, Vila Velha\nOrigem: visita posta na semana pelo Planejamento do Cockpit.',
);
ok('corpo so com marcador fica vazio', corpoLimpo('COCKPIT:PLANO:v1:a:b:c:d:e:f:g'), '');
ok('corpo sem marcador passa inteiro', corpoLimpo('Ligar depois das 19h'), 'Ligar depois das 19h');

console.log('\n--- o que nao entendemos NAO e descartado ---');
const sem = interpretarTarefa({ id: '1', assunto: 'Visita - Bar do Zé', corpo: 'sem marcador', vence_em: null });
ok('tarefa sem marcador continua existindo', sem.id, '1');
ok('e o tipo vem do assunto', sem.tipo, 'visita');
ok('marcador null', sem.marcador, null);
ok('sem falso aviso de versao', sem.versaoDesconhecida, null);

const v2 = interpretarTarefa({
  id: '2',
  assunto: 'Visita - X',
  corpo: 'COCKPIT:PLANO:v2:86100505:2026-09-14:17:00:visita:planejamento:999',
  vence_em: null,
});
ok('v2 NAO e' + ' reinterpretada como v1', v2.marcador, null);
ok('v2 e reportada', v2.versaoDesconhecida, 'v2');

const truncado = interpretarTarefa({ id: '3', assunto: 'Follow-up - Y', corpo: 'COCKPIT:PLANO:v1:86100505', vence_em: null });
ok('marcador cortado nao vira marcador torto', truncado.marcador, null);
ok('e a tarefa continua, pelo assunto', truncado.tipo, 'follow_up');

console.log('\n--- o cliente sai do assunto ---');
ok('visita', clienteDoAssunto('Visita - FRANGUINHO DO PRENHA'), 'FRANGUINHO DO PRENHA');
ok('follow-up com hifen', clienteDoAssunto('Follow-up - Dunas'), 'Dunas');
ok('travessao', clienteDoAssunto('Visita — Bar do Zé'), 'Bar do Zé');
ok('assunto livre nao inventa cliente', clienteDoAssunto('Ligar para o contador'), null);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`);
if (falhas) throw new Error(`${falhas} teste(s) do marcador falharam`);
