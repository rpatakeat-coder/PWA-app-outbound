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
  textoDoCorpo,
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

console.log('\n--- corpo em HTML (tarefa criada pela tela do HubSpot) ---');
// Copiado da Task 116966894658 do portal, 16/09/2026 — a que apareceu no app
// mostrando a marcacao crua no lugar do recado.
const HTML =
  '<div style="" dir="auto" data-top-level="true"><p style="margin:0;">Falar com Marcelo - Gerente</p></div>';
ok('a marcacao sai e sobra o recado', textoDoCorpo(HTML), 'Falar com Marcelo - Gerente');

const html = interpretarTarefa({ id: '9', assunto: 'Visita ', corpo: HTML, vence_em: null });
ok('e chega limpa na ficha', html.corpo, 'Falar com Marcelo - Gerente');
ok('assunto com espaco sobrando e aparado', html.assunto, 'Visita');

ok(
  'dois paragrafos nao colam',
  textoDoCorpo('<p>Falar com Marcelo</p><p>Gerente</p>'),
  'Falar com Marcelo\nGerente',
);
ok('<br> vira quebra', textoDoCorpo('linha um<br>linha dois'), 'linha um\nlinha dois');
ok('entidade vira caractere', textoDoCorpo('<p>Casa &amp; Cia</p>'), 'Casa & Cia');
ok('texto puro passa inteiro', textoDoCorpo('Falar com Marcelo - Gerente'), 'Falar com Marcelo - Gerente');
ok('"a < b" nao e tag e sobrevive', textoDoCorpo('se a < b entao liga'), 'se a < b entao liga');

// O caso que justifica normalizar ANTES de ler o marcador: tarefa do Cockpit
// editada no portal volta embrulhada em HTML, com o marcador dentro do <p>.
const embrulhada = interpretarTarefa({
  id: '10',
  assunto: 'Visita - Bar do Ze',
  corpo: '<div><p>Origem: planejamento.</p><p>COCKPIT:PLANO:v1:86100505:2026-09-14:17:00:visita:planejamento:65042434372</p></div>',
  vence_em: null,
});
ok('o marcador sobrevive ao HTML', embrulhada.marcador?.dealId, '65042434372');
ok('e o corpo fica sem ele', embrulhada.corpo, 'Origem: planejamento.');

console.log('\n--- o negocio: marcador OU associacao ---');
const semMarcador = interpretarTarefa({
  id: '11', assunto: 'Visita ', corpo: HTML, vence_em: null, deal_id: '64926992815',
});
ok('sem marcador, vale a associacao', semMarcador.dealId, '64926992815');
ok('e nao inventa marcador', semMarcador.marcador, null);

const comAmbos = interpretarTarefa({
  id: '12',
  assunto: 'Visita - X',
  corpo: 'COCKPIT:PLANO:v1:86100505:2026-09-14:17:00:visita:planejamento:65042434372',
  vence_em: null,
  deal_id: '999',
});
ok('com os dois, o marcador manda', comAmbos.dealId, '65042434372');

const nenhum = interpretarTarefa({ id: '13', assunto: 'Ligar para o contador', corpo: '', vence_em: null });
ok('sem os dois, fica null (e a tela avisa)', nenhum.dealId, null);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`);
if (falhas) throw new Error(`${falhas} teste(s) do marcador falharam`);
