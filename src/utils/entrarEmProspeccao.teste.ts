// Teste da regra "todo lead planejado entra em Prospecção".
//
// Rode com:  npx tsx src/utils/entrarEmProspeccao.teste.ts
//
// Protege: cliente da Takeat virando negócio de Prospecção por uma visita de relacionamento; o plano
// trocando o dono de uma conta do colega; e lead com negócio ganhando um segundo.
import { decidirProspeccao } from './entrarEmProspeccao';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const eu = { idHubspot: '97353030', nome: 'André' };
const lead = { id_hubspot: null, status: 'lead', vendedor_id_hubspot: null } as const;

ok(decidirProspeccao(lead, eu).criar === true, 'lead sem negócio e sem dono: cria em Prospecção');
ok(decidirProspeccao({ ...lead, vendedor_id_hubspot: '97353030' }, eu).criar === true, 'lead sem negócio que já é meu: cria');
const colega = decidirProspeccao({ ...lead, vendedor_id_hubspot: '86100505' }, eu, 'Marco');
ok(colega.criar === false && /Marco/.test(colega.motivo ?? ''), 'conta do colega: não cria e diz de quem é');
const tem = decidirProspeccao({ ...lead, id_hubspot: '123' }, eu);
ok(tem.criar === false && tem.motivo === null, 'já tem negócio: nada, sem aviso');
ok(decidirProspeccao({ ...lead, status: 'cliente' }, eu).criar === false, 'cliente da Takeat não vira Prospecção');
ok(decidirProspeccao({ ...lead, status: 'churn' }, eu).criar === false, 'churn não vira Prospecção');
const semDono = decidirProspeccao(lead, { idHubspot: null, nome: null });
ok(semDono.criar === false && !!semDono.motivo, 'perfil sem dono no HubSpot: não cria e avisa');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nentrar em prospecção: tudo certo');
