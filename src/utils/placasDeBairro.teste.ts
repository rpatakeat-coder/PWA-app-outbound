// Teste das placas de bairro do zoom afastado (prancha "Mapa do Executivo", 15/10/26).
//
// Rode com:  npx tsx src/utils/placasDeBairro.teste.ts
import { contaDaPlaca, LARGURA_MAX_PLACA, larguraDaPlaca, placasDeBairro, placasNaTela, type FamiliaDaPlaca } from './placasDeBairro';

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

// NO CELULAR A PLACA CABE NA TELA (print do iPhone de 390 pt, 02/11/26)
{
  const j = { latitude: 0, longitude: 0, latitudeDelta: 0.1, longitudeDelta: 0.1, larguraPx: 390, alturaPx: 600 };
  const area = { x0: 8, y0: 130, x1: 382, y1: 520 };
  // lng → x: x = (lng + 0.05) / 0.1 * 390; lat → y: y = (0.05 - lat) / 0.1 * 600
  const placa = (bairro: string, lat: number, lng: number, conta = '28 novos', cli: string | null = '11 clientes Takeat') =>
    ({ chave: bairro, bairro, lat, lng, titulo: `${bairro} · ${conta}`, clientes: cli, n: 28 });
  const costa = placa('Praia da Costa', 0, 0.046); // x ≈ 374: a 8 px da borda livre
  const [c] = placasNaTela([costa], j, area);
  ok(!!c && c.ancoraX > 0.9, 'na borda direita a placa desliza para dentro (âncora perto de 1), não corta');
  const w = larguraDaPlaca(costa);
  ok(w <= LARGURA_MAX_PLACA && w >= 100, 'largura do cartão compacto dentro do teto');
  ok(contaDaPlaca(costa).conta === '28 novos' && contaDaPlaca(costa).takeat === '11 Takeat', 'segunda linha curta: "28 novos · 11 Takeat"');
  ok(placasNaTela([placa('Praia do Canto', 0.04, 0)], j, area).length === 0, 'por baixo da busca e da faixa do dia (y < 130): sai');
  ok(placasNaTela([placa('Fora', 0, 0.06)], j, area).length === 0, 'bairro fora da tela: sem placa');
  const duas = placasNaTela([placa('A', 0, 0), placa('B', 0.001, 0.002)], j, area);
  ok(duas.length === 1 && duas[0].bairro === 'A', 'duas placas que se batem na tela: fica a primeira (a maior)');
  const muitas = placasNaTela(Array.from({ length: 8 }, (_, i) => placa(`P${i}`, 0.035 - i * 0.012, i % 2 ? 0.025 : -0.025)), j, area);
  ok(muitas.length <= 4 && muitas.length >= 2, 'no celular, no máximo 4 placas');
  const semCli = placasNaTela([placa('Centro', 0, 0, '3 clientes', null)], j, area)[0];
  ok(!!semCli && contaDaPlaca(semCli).takeat === null, 'sem cliente Takeat: só a conta');
}

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nTudo certo.');
