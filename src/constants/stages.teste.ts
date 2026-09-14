// Guarda: campo que o HubSpot declara como ENUMERAÇÃO não pode ser texto livre.
//
// Rode com:  npx tsx src/constants/stages.teste.ts
//
// POR QUE EXISTE
// Em 14/09/2026 `qual_maior_desafio_` estava como `kind: 'text'` com um TODO
// ("virar select quando me passarem as opções"). As opções já estavam em
// `stage_property_options` desde sempre. O app mandava o texto digitado, o
// HubSpot recusava a passagem INTEIRA para Ag. Pagamento — não só aquele
// campo — e uma vendedora ficou travada sem saber por quê.
//
// O defeito é invisível no código: `kind: 'text'` compila, renderiza e parece
// certo. Só o HubSpot sabe que aquele campo é enum, e ele só conta na hora de
// gravar, quando a pessoa já está na frente do cliente.
//
// A LISTA ABAIXO foi lida do HubSpot (get_properties em DEAL) em 14/09/2026.
// Ela é uma CÓPIA, e cópia diverge: se uma propriedade virar enum lá e ninguém
// atualizar aqui, esta guarda não pega. O que ela garante é o contrário —
// que ninguém transforme de volta em texto o que já sabemos ser enum.
import { STAGES, camposQueSeAplicam, type StageSubField } from './stages';

/** Propriedades que o HubSpot declara como `enumeration`. */
const ENUM_NO_HUBSPOT = new Set([
  'pacote_contratado',
  'adicional',
  'tipo_de_pagamento',
  'periodo_contratado',
  'qual_maior_desafio_',
  'deseja_criar_perfil_no_asaas_',
  'origem_do_lead',
  'gargalo_operacional',
  'adquirente',
  'plano_apresentado',
  'motivo_do_perdido',
]);

/** `boolean` é aceitável para enum de dois valores: o app manda 'true'/'false'. */
const KINDS_QUE_RESPEITAM_ENUM = new Set(['select', 'boolean']);

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

console.log('--- enum no HubSpot nao pode ser texto livre no app ---');
const errados: string[] = [];
const vistos: string[] = [];
for (const etapa of STAGES) {
  for (const sf of (etapa.subFields ?? []) as StageSubField[]) {
    if (!ENUM_NO_HUBSPOT.has(sf.field)) continue;
    vistos.push(sf.field);
    if (!KINDS_QUE_RESPEITAM_ENUM.has(sf.kind)) {
      errados.push(`${sf.field} (etapa ${etapa.label}) está como '${sf.kind}'`);
    }
  }
}
ok('nenhum enum declarado como texto', errados, []);

// Guarda que perdeu o alvo é guarda morta: se nenhum dos campos da lista
// aparecer em STAGES, o teste passaria em branco sem verificar nada.
ok('a guarda encontrou campos para verificar', vistos.length > 0, true);
console.log(`       campos conferidos: ${vistos.join(', ')}`);

console.log('\n--- Ag. Pagamento continua pedindo o que o HubSpot exige ---');
const pagamento = STAGES.find((e) => e.id === '1395880473');
const campos = ((pagamento?.subFields ?? []) as StageSubField[]).map((s) => s.field);
for (const obrigatorio of [
  'cnpj_cpf',
  'email',
  'cep',
  'numero',
  'pacote_contratado',
  'adicional',
  'tipo_de_pagamento',
  'periodo_contratado',
  'amount',
  'mrr',
  'deseja_criar_perfil_no_asaas_',
  'qual_maior_desafio_',
  'informacoes_sobre_o_maior_desafio',
]) {
  ok(`  coleta ${obrigatorio}`, campos.includes(obrigatorio), true);
}

console.log('\n--- adquirente so aparece com Maquininha POS ---');
// Medido no HubSpot em 14/09/2026: ZERO negocios do Field Sales tem
// `adquirente` sem "Maquininha POS" no `adicional`, e 107 tem a maquininha SEM
// a adquirente — os que passaram pelo app, onde o campo nem existia.
const daEtapa = (pagamento?.subFields ?? []) as StageSubField[];
const nomes = (vs: Record<string, string | string[] | undefined>) =>
  camposQueSeAplicam(daEtapa, vs).map((c) => c.field);

ok('sem adicional escolhido, nao pede', nomes({}).includes('adquirente'), false);
ok(
  'com "Sem adicionais", nao pede',
  nomes({ adicional: ['Sem adicionais'] }).includes('adquirente'),
  false,
);
ok(
  'com Maquininha POS, PEDE',
  nomes({ adicional: ['Maquininha POS'] }).includes('adquirente'),
  true,
);
ok(
  'multi: maquininha junto de outro adicional, PEDE',
  nomes({ adicional: ['Multilojas', 'Maquininha POS'] }).includes('adquirente'),
  true,
);
ok(
  'outro adicional sozinho nao pede',
  nomes({ adicional: ['Tablet', 'Dark Kitchen'] }).includes('adquirente'),
  false,
);
ok(
  'os campos incondicionais nao somem nunca',
  nomes({}).includes('cnpj_cpf') && nomes({ adicional: ['Maquininha POS'] }).includes('cnpj_cpf'),
  true,
);
// Se o campo sair da etapa, estes testes passariam em branco.
ok('o adquirente existe na etapa', daEtapa.some((c) => c.field === 'adquirente'), true);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`);
if (falhas) throw new Error(`${falhas} verificacao(oes) de etapa falharam`);
