// Teste da conferência da documentação.
//
// Rode com:  npx tsx src/dados/documentacao.teste.ts   (dentro de gestao/)
//
// O que se testa aqui é a única parte que pode MENTIR: o selo de "confere".
// Um verde errado é pior que nenhum selo — ele encerra a dúvida sem resolver.
// Por isso há caso para cada jeito de errar: divergência de verdade, banco
// vazio (que não é o mesmo que "confere"), e diferença que não é diferença
// (maiúscula, espaço à toa).
import { conferir, fatosEmTexto, type FatosVivos } from './documentacao';

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

const BASE: FatosVivos = {
  statuses: [
    { slug: 'lead', label: 'Lead', ativo: true },
    { slug: 'cliente', label: 'Cliente', ativo: true },
    { slug: 'churn', label: 'Churn', ativo: true },
    { slug: 'ganho_fs', label: 'Ganho FS', ativo: true },
  ],
  visibilidade: [
    { setor: 'Outbound', status: 'lead' },
    { setor: 'RPA', status: 'lead' },
    { setor: 'Sucesso', status: 'cliente' },
  ],
  slas: [{ etapa: 'Prospecção', dias: 3, tarefa: 'Qualificar lead', ativo: true }],
  contagemPorStatus: [{ status: 'cliente', total: 2869 }],
  semIdHubspot: 1,
  pessoasAtivas: 12,
  lidoEm: '2026-09-21T12:00:00.000Z',
  erro: null,
};

const situacaoDe = (fatos: FatosVivos, id: string) =>
  conferir(fatos).find((v) => v.id === id)?.situacao;

console.log('--- o caso feliz ---');
ok('setores conferem', situacaoDe(BASE, 'setores-lead'), 'confere');
ok('status conferem', situacaoDe(BASE, 'status-ativos'), 'confere');
ok('sla configurado', situacaoDe(BASE, 'sla-configurado'), 'confere');

console.log('\n--- divergência de verdade ---');
// Um setor A MAIS no banco: alguém liberou `lead` pra Sucesso e o texto não sabe.
ok(
  'setor novo com lead acusa',
  situacaoDe(
    { ...BASE, visibilidade: [...BASE.visibilidade, { setor: 'Sucesso', status: 'lead' }] },
    'setores-lead',
  ),
  'divergiu',
);
// Um setor A MENOS: tiraram o RPA e o texto continuaria prometendo.
ok(
  'setor removido acusa',
  situacaoDe(
    { ...BASE, visibilidade: [{ setor: 'Outbound', status: 'lead' }] },
    'setores-lead',
  ),
  'divergiu',
);
ok(
  'status novo ativo acusa',
  situacaoDe(
    { ...BASE, statuses: [...BASE.statuses, { slug: 'parceiro', label: 'Parceiro', ativo: true }] },
    'status-ativos',
  ),
  'divergiu',
);
// Status DESATIVADO não conta como ativo — desativar `churn` tem que acusar.
ok(
  'status desativado acusa',
  situacaoDe(
    {
      ...BASE,
      statuses: BASE.statuses.map((s) => (s.slug === 'churn' ? { ...s, ativo: false } : s)),
    },
    'status-ativos',
  ),
  'divergiu',
);

console.log('\n--- diferença que NÃO é diferença ---');
// Caixa e espaço à toa são o mesmo setor. Acusar aqui seria alarme falso, e
// alarme falso ensina a ignorar o alarme.
ok(
  'maiuscula e espaco nao acusam',
  situacaoDe(
    {
      ...BASE,
      visibilidade: [
        { setor: 'outbound ', status: 'lead' },
        { setor: ' RPA', status: 'LEAD' },
      ],
    },
    'setores-lead',
  ),
  'confere',
);
// Ordem também não importa.
ok(
  'ordem invertida nao acusa',
  situacaoDe(
    {
      ...BASE,
      visibilidade: [
        { setor: 'RPA', status: 'lead' },
        { setor: 'Outbound', status: 'lead' },
      ],
    },
    'setores-lead',
  ),
  'confere',
);

console.log('\n--- vazio NÃO é "confere" ---');
ok(
  'sem setor com lead: nao-medido',
  situacaoDe({ ...BASE, visibilidade: [{ setor: 'Sucesso', status: 'cliente' }] }, 'setores-lead'),
  'nao-medido',
);
ok('sem status: nao-medido', situacaoDe({ ...BASE, statuses: [] }, 'status-ativos'), 'nao-medido');
ok('sem sla: nao-medido', situacaoDe({ ...BASE, slas: [] }, 'sla-configurado'), 'nao-medido');

console.log('\n--- banco fora do ar ---');
const comErro = conferir({ ...BASE, erro: 'connection refused' });
ok('uma linha so', comErro.length, 1);
ok('e ela NAO diz que confere', comErro[0].situacao, 'nao-medido');

console.log('\n--- o texto que vai pro modelo do chat ---');
const texto = fatosEmTexto(BASE);
ok('leva a configuracao', /Outbound→lead/.test(texto), true);
ok('leva as contagens', /cliente=2869/.test(texto), true);
ok('leva quem esta sem id', /sem id_hubspot: 1/.test(texto), true);
// O CONTRATO DE PRIVACIDADE: o resumo é agregado. Se um dia alguém puser nome
// de cliente aqui, este teste tem que quebrar antes de ir pro provedor externo.
ok('nao leva nome de pessoa', /full_name|telefone|@/.test(texto), false);
ok(
  'erro vira aviso, nao numero inventado',
  fatosEmTexto({ ...BASE, erro: 'timeout' }),
  '(não foi possível ler a configuração do banco: timeout)',
);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`);
if (falhas) throw new Error(`${falhas} teste(s) da documentação falharam`);
