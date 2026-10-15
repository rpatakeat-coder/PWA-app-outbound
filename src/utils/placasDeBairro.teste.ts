// Teste das placas de bairro do zoom afastado (prancha "Mapa do Executivo", 15/10/26).
//
// Rode com:  npx tsx src/utils/placasDeBairro.teste.ts
import { placasDeBairro, type FamiliaDaPlaca } from './placasDeBairro';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const it = (id: string, bairro: string, lat: number, lng: number, familia: FamiliaDaPlaca = 'rec', cidade = 'Vitória') => ({ id, bairro, cidade, lat, lng, familia });
const canto = Array.from({ length: 18 }, (_, i) => it(`c${i}`, i % 2 ? 'Praia do Canto' : 'PRAIA DO CANTO', -20.29 + i * 0.0001, -40.29));
const lucia = Array.from({ length: 9 }, (_, i) => it(`l${i}`, 'Santa Lúcia', -20.30, -40.30 + i * 0.0001));
const pertoDoCanto = [it('x1', 'Canto Grande', -20.2905, -40.2902)];
const soLeads = [it('m1', 'Jardim Camburi', -20.25, -40.27, 'lead'), it('m2', 'Jardim Camburi', -20.251, -40.271, 'lead')];
const clientes = [...Array.from({ length: 6 }, () => ({ bairro: 'Praia do Canto', cidade: 'VITORIA' })), { bairro: 'Santa Lucia', cidade: 'Vitória' }, { bairro: null }];
const p = placasDeBairro([...canto, ...lucia, ...pertoDoCanto, ...soLeads], clientes);

ok(p[0].titulo === 'Praia do Canto · 18 novos', 'o maior bairro primeiro, juntando caixa e acento');
ok(p[0].clientes === '6 clientes Takeat', 'clientes Takeat do bairro, em verde embaixo (cidade sem acento casa)');
ok(p.some((x) => x.titulo === 'Santa Lúcia · 9 novos' && x.clientes === '1 cliente Takeat'), 'Santa Lúcia casa com "Santa Lucia" sem acento');
ok(!p.some((x) => x.bairro === 'Canto Grande'), 'placa que cairia em cima de outra sai');
ok(p.some((x) => x.titulo === 'Jardim Camburi · 2 leads' && x.clientes === null), 'sem recém-aberto: conta os leads; sem cliente, sem a linha verde');
ok(placasDeBairro([it('s', '', 0, 0)], []).length === 0, 'sem bairro no cadastro: sem placa');
ok(placasDeBairro(Array.from({ length: 10 }, (_, i) => it(`b${i}`, `B${i}`, i, i)), [], 6).length === 6, 'no máximo 6 placas');

// "CENTRO" de cidades diferentes não vira uma placa só (visto no mapa real em 15/10/26: "CENTRO · 72")
const centros = placasDeBairro([it('a', 'CENTRO', -20.32, -40.34, 'cli', 'Vitória'), it('b', 'CENTRO', -20.33, -40.29, 'cli', 'Vila Velha'), it('c', 'CENTRO', -20.321, -40.341, 'cli', 'Vitória')], [], 6, 0.001);
ok(centros.length === 2 && centros[0].titulo === 'Centro · 2 clientes', 'Centro de Vitória e de Vila Velha são placas diferentes; caixa alta vira "Centro"');
ok(centros[0].clientes === null, 'na lente de clientes a linha verde não repete a placa');
ok(placasDeBairro([it('d', 'SANTA ROSA DE LIMA', 0, 0, 'lead')], [])[0].titulo === 'Santa Rosa de Lima · 1 lead', '"de" fica minúsculo');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nTudo certo.');
