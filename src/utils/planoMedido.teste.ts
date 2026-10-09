// Teste puro dos dois números do dia (08/10/2026). Roda com: npx tsx src/utils/planoMedido.teste.ts
import { ehNoite, notasDoDia, segundaDe, semanaMedida, textoPlano } from './planoMedido';

let falhas = 0;
const ok = (c: boolean, msg: string) => { if (!c) { falhas++; console.log('  ✗ ' + msg); } else console.log('  ok ' + msg); };

// a resposta real de planejamento_do_time para o André em 08/10 (a que o gestor também lê)
const resp = { pessoas: [{ ownerId: '97353030', dias: [
  { dia: '2026-10-07', planejadas: 9, feitasDoPlano: 3, provadas: 5, fora: 2, semLugar: 3, feitas: 5, meta: 6 },
  { dia: '2026-10-08', planejadas: 13, feitasDoPlano: 4, provadas: 5, fora: 1, semLugar: 3, feitas: 5, meta: 6 },
] }] };
const m = semanaMedida(resp);
const h = m.get('2026-10-08')!;
ok(textoPlano(h) === '4 de 13', 'Plano do André em 08/10 = 4 de 13 (o mesmo do gestor)');
ok(h.provadas === 5 && h.meta === 6, 'Visitas = 5 com prova, meta 6');
ok(notasDoDia(h).join(' · ') === '3 sem lugar no mapa · +1 fora do plano', 'sem lugar e fora do plano aparecem à parte');
ok(semanaMedida(null).size === 0 && semanaMedida({ pessoas: [] }).size === 0, 'sem resposta não quebra e não inventa zero');
ok(segundaDe('2026-10-08') === '2026-10-05' && segundaDe('2026-10-05') === '2026-10-05' && segundaDe('2026-10-11') === '2026-10-05', 'a segunda da semana (domingo fecha a semana)');
ok(ehNoite(new Date('2026-10-08T21:30:00Z')) === true && ehNoite(new Date('2026-10-08T15:00:00Z')) === false, 'noite = 18h de Brasília em diante');

console.log(falhas ? `planoMedido: ${falhas} falha(s)` : 'planoMedido: tudo certo');
if (falhas) process.exit(1);
