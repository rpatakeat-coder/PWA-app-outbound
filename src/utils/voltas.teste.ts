// Teste do aviso das 8h com a volta no título (13/11/26).
// Rode com:  npx tsx src/utils/voltas.teste.ts
import { avisoDasVoltas, horarioDoDono, type VoltasDe } from '../../supabase/functions/_compartilhado/voltas';

let falhas = 0;
const ok = (c: boolean, m: string, extra?: unknown) => { if (c) console.log('  ok   ' + m); else { falhas += 1; console.log('  FALHOU ' + m + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } };

const base = { titulo: '6 paradas hoje · 12 leads sem passo', texto: '1ª às 10:00 em Méier · toque para ver o seu dia em 30 segundos' };
const V = (o: Partial<VoltasDe>): VoltasDe => ({ hoje: '2026-11-13', de_hoje: [], vencidas: [], n_vencidas: 0, ...o });
const volta = (nome: string, dia: string, visitou: string, horario: string | null = null) => ({ deal: '1', nome, bairro: 'Méier', visitou, dia, horario_dono: horario });

ok(avisoDasVoltas(null, base) === null, 'sem leitura do banco: o aviso de sempre segue (null)');
ok(avisoDasVoltas(V({}), base) === null, 'sem volta nenhuma: o aviso de sempre segue (null)');

const umaHoje = avisoDasVoltas(V({ de_hoje: [volta('Bar do Zé', '2026-11-13', '2026-11-06', '10h_11h30')] }), base);
ok(umaHoje?.titulo === 'Voltar hoje: Bar do Zé', 'volta de hoje: o título nomeia o restaurante e o verbo', umaHoje);
ok(umaHoje?.texto === 'o dono está 10h–11h30 · você marcou na visita de sex 06/11 · 6 paradas hoje · 12 leads sem passo', 'volta de hoje: o horário do dono, quando foi marcada e o resumo de antes', umaHoje);

const tresHoje = avisoDasVoltas(V({ de_hoje: [volta('Bar do Zé', '2026-11-13', '2026-11-06'), volta('Pizzaria Sol', '2026-11-13', '2026-11-10'), volta('Açaí Lua', '2026-11-13', '2026-11-10')], vencidas: [volta('Velha', '2026-11-01', '2026-10-25')], n_vencidas: 9 }), base);
ok(tresHoje?.titulo === 'Voltar hoje: Bar do Zé e mais 2', 'três de hoje: uma pelo nome e "e mais 2"; a de hoje vence a vencida', tresHoje);
ok(!/dono/.test(tresHoje?.texto ?? ''), 'sem horário anotado: o aviso não inventa horário', tresHoje);

const venc = avisoDasVoltas(V({ vencidas: [volta('Adega to de boa', '2026-11-12', '2026-11-05'), volta('Dizzy', '2026-11-10', '2026-11-04')], n_vencidas: 29 }), base);
ok(venc?.titulo === 'Adega to de boa: a volta venceu qui 12/11 · +28', 'só vencidas: a mais recente pelo nome, o dia e quantas mais', venc);
ok(venc?.texto === 'ponha no plano de hoje · 6 paradas hoje · 12 leads sem passo', 'só vencidas: o que fazer e o resumo de antes', venc);

const umaVenc = avisoDasVoltas(V({ vencidas: [volta('Dizzy', '2026-11-10', '2026-11-04', 'Só sábado')], n_vencidas: 1 }), base);
ok(umaVenc?.titulo === 'Dizzy: a volta venceu ter 10/11', 'uma vencida: sem "+0"', umaVenc);
ok(/o dono está Só sábado/.test(umaVenc?.texto ?? ''), 'horário em texto livre vai como foi escrito', umaVenc);

const longo = avisoDasVoltas(V({ de_hoje: [volta('Restaurante e Pizzaria Estoril da Vila Paulicéia de Guarulhos Unidade Dois', '2026-11-13', '2026-11-06')] }), base);
ok((longo?.titulo.length ?? 99) <= 60 && /…$/.test(longo?.titulo ?? ''), 'nome comprido é cortado com reticências (cabe no aviso)', longo?.titulo);

ok(horarioDoDono('10h_11h30') === '10h–11h30' && horarioDoDono('14h_16h') === '14h–16h' && horarioDoDono('') === null && horarioDoDono(null) === null, 'horarioDoDono: faixa vira travessão; vazio vira null');

console.log(falhas ? '\n' + falhas + ' FALHARAM' : '\nTODOS PASSARAM');
if (falhas) process.exit(1);
