// Teste das regras de Emitir cobrança (src/utils/cobranca.ts).
// A tela nunca pode oferecer o que o servidor recusa: as listas e os 15 campos
// são comparados com o arquivo do servidor no cockpit-unificado, quando ele
// está ao lado deste repositório.
import * as fs from 'fs';
import * as path from 'path';
import {
  ADICIONAIS, COBRANCA_VAZIA, DESAFIOS, PACOTES, alternarAdicional, conferirDocumento, faltaNoPasso,
  MINIMO_DESAFIO, propriedadesDaCobranca, rascunhoDoDesafio, valorDoPeriodo,
} from './cobranca';

let falhas = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

ok(conferirDocumento('11.222.333/0001-81')?.ok === true, 'CNPJ válido (com pontuação) confere');
ok(conferirDocumento('11222333000180')?.ok === false, 'CNPJ com dígito errado recusa');
ok(conferirDocumento('1122233300018')?.texto.includes('13 dígitos') === true, 'CNPJ com 13 dígitos diz quantos vieram');
ok(conferirDocumento('529.982.247-25')?.ok === true, 'CPF válido confere');
ok(conferirDocumento('111.111.111-11')?.ok === false, 'CPF de dígitos repetidos recusa');
ok(valorDoPeriodo('449', 'Trimestral') === '1347', 'valor do período = MRR × 3 no trimestral');
ok(valorDoPeriodo('', 'Mensal') === '', 'sem MRR não inventa valor');
ok(alternarAdicional(['TEF'], 'Sem adicionais').join() === 'Sem adicionais', '"Sem adicionais" limpa os outros');
ok(alternarAdicional(['Sem adicionais'], 'TEF').join() === 'TEF', 'escolher um adicional tira o "Sem adicionais"');

const cheia = {
  ...COBRANCA_VAZIA, dealname: 'Cantina', cnpj_cpf: '11.222.333/0001-81', email: 'dono@cantina.com', celular: '(27) 99812-4410',
  cep: '29055-270', numero: '100', pacote_contratado: 'Profissional', adicional: ['Sem adicionais'], periodo_contratado: 'Mensal',
  tipo_de_pagamento: 'Crédito', mrr: '449', amount: '449', qual_maior_desafio_: 'Operação',
  informacoes_sobre_o_maior_desafio: 'Fila no almoço e demora para fechar a conta das mesas grandes.',
};
ok(faltaNoPasso(cheia, 1).length === 0 && faltaNoPasso(cheia, 2).length === 0 && faltaNoPasso(cheia, 3).length === 0, 'cobrança completa passa nos três passos');
ok(faltaNoPasso({ ...cheia, informacoes_sobre_o_maior_desafio: 'curto' }, 2).some((f) => f.includes('mín. 50')), 'desafio com menos de 50 caracteres trava o passo 2');
const props = propriedadesDaCobranca(cheia);
ok(props.cep === '29055270' && props.cnpj_cpf === '11222333000181', 'CEP e CNPJ vão só com dígitos');
ok(props.deseja_criar_perfil_no_asaas_ === 'true' && props.adicional === 'Sem adicionais', 'perfil Asaas e adicional no formato do servidor');

// ---- rascunho do desafio (28/10/26) ----
// O app escreve com o que já foi registrado; o executivo só confere. Asserção por texto
// exato de propósito: qualquer troca na composição aparece aqui, não só o tamanho.
const base = { nome: 'Cantina do Zé', dor: 'Fila', sistema: 'Saipos', pacote: 'Profissional', adicionais: ['Fiscal SN'] };
ok(rascunhoDoDesafio(base) === 'Cantina do Zé: a maior dor é a fila no atendimento. Hoje usa Saipos. Fechou Profissional com Fiscal SN para resolver isso.',
  'com dor da lista, sistema e pacote: a frase sai inteira');
ok(rascunhoDoDesafio(base).length >= MINIMO_DESAFIO, 'o rascunho completo já passa do mínimo do HubSpot');
ok(rascunhoDoDesafio({ ...base, dor: 'Cozinha lenta no almoço' }).startsWith('Cantina do Zé: a maior dor é cozinha lenta no almoço.'),
  'dor escrita pelo vendedor vai com as palavras dele');
ok(rascunhoDoDesafio({ ...base, adicionais: ['Sem adicionais'] }) === 'Cantina do Zé: a maior dor é a fila no atendimento. Hoje usa Saipos. Fechou Profissional para resolver isso.',
  '"Sem adicionais" não vira texto');
ok(rascunhoDoDesafio({ ...base, dor: '', sistema: '' }) === '', 'sem dor e sem sistema: nada é inventado, a tela volta a pedir');
ok(rascunhoDoDesafio({ ...base, dor: '' }) === 'Cantina do Zé usa Saipos. Fechou Profissional com Fiscal SN.',
  'só com o sistema: não fala de dor nem promete resolver');
ok(rascunhoDoDesafio({ ...base, nome: '' }).startsWith('A maior dor é a fila'), 'sem nome, a frase começa pela dor');
ok(!rascunhoDoDesafio({ ...base, pacote: '' }).includes('Fechou'), 'sem pacote, não inventa contrato');

// ---- espelho do servidor ----
const servidor = path.resolve(__dirname, '../../../cockpit-unificado/lib/acoes-negocio/mudar-etapa-negocio.js');
if (fs.existsSync(servidor)) {
  const src = fs.readFileSync(servidor, 'utf8');
  const lista = (chave: string) => {
    const m = src.match(new RegExp(`${chave}: \\[([^\\]]*)\\]`));
    return m ? (m[1].match(/'([^']*)'/g) ?? []).map((x) => x.slice(1, -1)) : [];
  };
  ok(JSON.stringify(lista('pacote_contratado')) === JSON.stringify(PACOTES), 'pacotes iguais aos do servidor');
  ok(JSON.stringify(lista('adicional')) === JSON.stringify(ADICIONAIS), 'adicionais iguais aos do servidor');
  ok(JSON.stringify(lista('qual_maior_desafio_')) === JSON.stringify(DESAFIOS), 'desafios iguais aos do servidor');
  const exig = src.match(/'1395880473': \[([^\]]*)\]/);
  const campos = exig ? (exig[1].match(/'([^']*)'/g) ?? []).map((x) => x.slice(1, -1)).sort() : [];
  ok(campos.length === 15 && JSON.stringify(Object.keys(props).sort()) === JSON.stringify(campos), 'os 15 campos da cobrança são exatamente os que o servidor exige');
} else {
  console.log('(cockpit-unificado não está ao lado: espelho do servidor não conferido)');
}

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ncobrança: tudo certo');
