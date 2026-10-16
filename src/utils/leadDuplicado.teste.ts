// Teste da checagem de lead duplicado.
//
// Rode com:  npx tsx src/utils/leadDuplicado.teste.ts
//
// Os casos NAO sao inventados: cada um saiu da base de producao em
// 24/09/2026, medindo os 40 grupos de "mesmo telefone + mesmo nome". O que
// este teste protege e' o equilibrio — avisar nos duplicados de verdade SEM
// bloquear rede legitima, que e' o erro que uma trava por telefone cometeria
// em 435 dos 475 grupos.
import {
  RAIO_M,
  normalizarNome,
  digitosDoTelefone,
  metrosEntre,
  caixaDeBusca,
  nomeDaCasa,
  avaliar,
  avaliarMeuNegocio,
  parecidos,
  fraseDoAviso,
  type LeadExistente,
} from './leadDuplicado';

let falhas = 0;
const ok = (nome: string, real: unknown, esperado: unknown) => {
  const bom = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(
    `${bom ? '  ok  ' : ' FALHA'} ${nome}: ${JSON.stringify(real)}` +
      (bom ? '' : ` (esperado ${JSON.stringify(esperado)})`),
  );
};

const lead = (p: Partial<LeadExistente>): LeadExistente => ({
  id: p.id ?? 'x', nome: p.nome ?? null, empresa: p.empresa ?? null,
  telefone: p.telefone ?? null, latitude: p.latitude ?? null, longitude: p.longitude ?? null,
  etapa: p.etapa ?? null, id_hubspot: p.id_hubspot ?? null, created_at: p.created_at ?? null,
});

console.log('--- normalizacao ---');
ok('acento e caixa somem', normalizarNome('Cachorro do Bonfá'), 'cachorro do bonfa');
ok('pontuacao vira espaco', normalizarNome('Kadô Sushi Bar - Moema'), 'kado sushi bar moema');
ok('nulo e vazio', normalizarNome(null), '');
ok('+55, parenteses e hifen', digitosDoTelefone('+55 (21) 99779-0018'), '21997790018');
ok('mesmo numero, formatos diferentes', digitosDoTelefone('+5521997790018'), digitosDoTelefone('+55-21 99779-0018'));
ok('numero curto demais nao conta', digitosDoTelefone('1234'), '');

console.log('\n--- o nome que vale e o do RESTAURANTE ---');
// O indice antigo usava `nome` (o contato) e por isso deixou passar o
// "Best chicken" cadastrado como 'Fachada' e depois como 'Douglas'.
ok('empresa manda', nomeDaCasa({ empresa: 'Best chicken', nome: 'Douglas' }), 'best chicken');
ok('sem empresa, usa o contato', nomeDaCasa({ empresa: null, nome: 'Douglas' }), 'douglas');

console.log('\n--- distancia ---');
const a = { latitude: -23.5617, longitude: -46.6559 };
ok('mesmo ponto = 0 m', Math.round(metrosEntre(a, a)), 0);
ok('~111 m por 0,001 grau de latitude',
   Math.round(metrosEntre(a, { latitude: a.latitude + 0.001, longitude: a.longitude })), 111);
const cx = caixaDeBusca(a.latitude, a.longitude);
ok('a caixa contem o raio', cx.latMax - a.latitude > RAIO_M / 111_400, true);

console.log('\n--- CASOS REAIS: tem que AVISAR ---');
// Best chicken: dois cadastros no mesmo dia, contatos diferentes, sem telefone.
ok('Best chicken (contato diferente, mesmo lugar)',
   avaliar({ empresa: 'Best chicken', nome: 'Fachada', telefone: null, ...a },
           lead({ empresa: 'Best chicken', nome: 'Douglas', latitude: a.latitude, longitude: a.longitude }))?.motivo,
   'mesmo-lugar');
// Capitao boteco: os dois pins a 24 m — o indice antigo (11 m) nao pegava.
ok('Capitao boteco a 24 m',
   avaliar({ empresa: 'Capitão boteco', nome: 'x', telefone: null, ...a },
           lead({ empresa: 'Capitão boteco ', latitude: a.latitude + 0.000216, longitude: a.longitude }))?.motivo,
   'mesmo-lugar');
// Salseiro: mesmo telefone e mesmo nome, mas 33 km entre os pins.
ok('Salseiro a 33 km, mesmo telefone',
   avaliar({ empresa: 'Salseiro brasa e lenha', nome: 'Tadeu', telefone: '21 99779-0018', ...a },
           lead({ empresa: 'Salseiro brasa e lenha ', telefone: '+5521997790018',
                  latitude: a.latitude + 0.3, longitude: a.longitude }))?.motivo,
   'mesmo-telefone');

console.log('\n--- CASOS REAIS: NAO pode avisar ---');
// As tres lojas do Cachorro do Bonfa dividem o telefone 51995611173.
const bonfaExistente = lead({ empresa: 'Cachorro do Bonfa - Cidade Baixa', telefone: '51995611173',
                              latitude: -30.0400, longitude: -51.2200 });
ok('Cachorro do Bonfa: outra unidade, mesmo telefone',
   avaliar({ empresa: 'Cachorro do Bonfa - Redenção', nome: 'Eunice', telefone: '51995611173',
             latitude: -30.0346, longitude: -51.2177 }, bonfaExistente),
   null);
ok('mesmo nome, mas a 600 m (nao e a mesma casa)',
   avaliar({ empresa: 'Marmitaria', nome: 'x', telefone: null, ...a },
           lead({ empresa: 'Marmitaria', latitude: a.latitude + 0.0054, longitude: a.longitude })),
   null);
ok('mesmo telefone, nome diferente (rede / mesmo dono)',
   avaliar({ empresa: 'Bar do Luan', nome: 'x', telefone: '21999199791', ...a },
           lead({ empresa: 'Asinha bar', telefone: '21999199791', latitude: a.latitude, longitude: a.longitude })),
   null);
ok('lead existente sem coordenada e sem telefone nao gera falso positivo',
   avaliar({ empresa: 'Zé', nome: 'x', telefone: null, ...a }, lead({ empresa: 'Zé' })),
   null);

console.log('\n--- ordem e frase ---');
const lista = parecidos(
  { empresa: 'Tom Pastel', nome: 'x', telefone: null, ...a },
  [lead({ id: 'longe', empresa: 'Tom Pastel', latitude: a.latitude + 0.001, longitude: a.longitude }),
   lead({ id: 'perto', empresa: 'Tom Pastel', etapa: 'Demo/Proposta', latitude: a.latitude, longitude: a.longitude })],
);
ok('o mais perto vem primeiro', lista.map((p) => p.lead.id), ['perto', 'longe']);
ok('a frase diz o nome, o lugar e a etapa',
   fraseDoAviso(lista[0]), '“Tom Pastel” já está cadastrado neste mesmo ponto em Demo/Proposta.');
ok('a frase do telefone',
   fraseDoAviso({ lead: lead({ empresa: 'Salseiro', etapa: 'Negociação' }), motivo: 'mesmo-telefone', distanciaM: null }),
   '“Salseiro” já está cadastrado com o mesmo telefone em Negociação.');

console.log('\n--- os duplicados que passaram em out/2026 (auditoria 16/10) ---');
// Top Gourmet: mesmo nome, mesmo executivo, ~180 m (o pino do 1º caiu na esquina)
const tg = avaliar({ empresa: 'Top Gourmet ', nome: 'Petterson', telefone: null, latitude: -22.94389, longitude: -43.36092 },
  lead({ empresa: 'Top Gourmet ', etapa: 'Negociação', latitude: -22.94305, longitude: -43.36246 }));
ok('Top Gourmet a ~180 m: avisa', tg?.motivo, 'mesmo-lugar');
// Maria Cereja: um nome dentro do outro, no mesmo ponto
const mc = avaliar({ empresa: 'Padaria Maria Cereja', nome: 'Marcelo', telefone: null, latitude: -23.46118, longitude: -46.52799 },
  lead({ empresa: 'Maria Cereja', etapa: 'Prospecção', latitude: -23.46095, longitude: -46.52811 }));
ok('"Padaria Maria Cereja" × "Maria Cereja" a 30 m: avisa', mc?.motivo, 'mesmo-lugar');
ok('nome contido longe (300 m) não avisa',
   avaliar({ empresa: 'Maria Cereja Doces e Salgados', nome: null, telefone: null, latitude: a.latitude + 0.0027, longitude: a.longitude },
     lead({ empresa: 'Maria Cereja', latitude: a.latitude, longitude: a.longitude })), null);
ok('"Bar do Zé" × "Bar do Luan" no mesmo ponto não avisa (só a palavra genérica em comum)',
   avaliar({ empresa: 'Bar do Zé', nome: null, telefone: null, latitude: a.latitude, longitude: a.longitude },
     lead({ empresa: 'Bar do Luan', latitude: a.latitude, longitude: a.longitude })), null);
ok('lojas da rede com sufixo diferente continuam fora (Bonfá Redenção × Harmonia)',
   avaliar({ empresa: 'Cachorro do Bonfá - Redenção', nome: null, telefone: '51995611173', latitude: a.latitude, longitude: a.longitude },
     lead({ empresa: 'Cachorro do Bonfá - Harmonia', telefone: '51995611173', latitude: a.latitude + 0.02, longitude: a.longitude })), null);

// Rústico: o negócio nasceu no HubSpot sem endereço, horas antes do cadastro na rua
const ru = avaliarMeuNegocio({ empresa: 'Rústico arte ferro e fogo', nome: 'Marlon', telefone: null, latitude: -22.81856, longitude: -43.19987 },
  lead({ id: 'hs-66044938046', empresa: 'Rustico Arte Ferro e Fogo', etapa: 'Negociação', id_hubspot: '66044938046' }));
ok('meu negócio no HubSpot sem lugar e mesmo nome: avisa', ru?.motivo, 'meu-negocio');
ok('a frase do meu negócio', ru ? fraseDoAviso(ru) : null, '“Rustico Arte Ferro e Fogo” já é um negócio seu no HubSpot, em Negociação.');
ok('meu negócio com nome só parecido e sem lugar: não avisa',
   avaliarMeuNegocio({ empresa: 'Rústico Grill', nome: null, telefone: null, latitude: 0, longitude: 0 }, lead({ empresa: 'Rústico arte ferro e fogo' })), null);

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
