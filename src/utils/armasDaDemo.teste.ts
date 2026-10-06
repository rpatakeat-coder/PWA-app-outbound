// Teste das armas para a demo. Roda: npx tsx src/utils/armasDaDemo.teste.ts
import { armasConhecidas, armasQueFaltam, enviosDasArmas, resumoDasArmas } from './armasDaDemo';

let falhas = 0;
const ok = (c: unknown, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

const fichas = [
  { ocorrido_em: '2026-10-01T15:00:00Z', decisor_nome: 'Sidnei', decisor_papel: 'Dono', horario_dono: '10h_11h30', sistema: 'Goomer', dor: 'Fila' },
  { ocorrido_em: '2026-10-03T15:00:00Z', decisor_nome: null, decisor_papel: null, horario_dono: null, sistema: 'Saipos', dor: null },
];

// o negócio vence a ficha; a ficha mais recente vence a antiga
const a = armasConhecidas({ nome_do_sistema: 'Colibri' }, fichas);
ok(a.sistema === 'Colibri', 'o sistema do negócio (HubSpot) vence o da ficha');
ok(a.dor === 'Fila' && a.decisor === 'Sidnei' && a.papel === 'Dono' && a.horario === '10h_11h30', 'o resto vem da ficha que tem o campo');
const b = armasConhecidas({}, fichas);
ok(b.sistema === 'Saipos', 'sem o negócio, a ficha MAIS RECENTE com sistema');

// "VERIFICAR" não é resposta; dor fora da lista do HubSpot também não
const c = armasConhecidas({ nome_do_sistema: 'VERIFICAR', gargalo_operacional: 'qualquer coisa' }, []);
ok(c.sistema === '' && c.dor === '', '"VERIFICAR" e dor fora da enumeração contam como não sabido');
ok(armasQueFaltam(c).join() === 'sistema que usa,maior dor,quem decide,melhor horário', 'falta tudo, na ordem do gestor');
ok(armasQueFaltam(a).length === 0, 'completo não pede nada');
ok(resumoDasArmas(a) === 'Colibri · Fila · Sidnei (dono) · 10h–11h30', 'o resumo de uma linha');

// o horário do HubSpot (valor interno) volta para o chip
const h = armasConhecidas({ melhor_horario_do_decisor: '14:30-17:30' }, []);
ok(h.horario === '14h30_17h30', 'horário do HubSpot vira o chip certo');

// envios: só o que é novo para o negócio
const e1 = enviosDasArmas({ dealId: '1', ownerId: '9', negocio: { nome_do_sistema: 'Colibri' }, armas: a, decisorNoNegocio: true });
ok(e1.length === 1 && e1[0].corpo.type === 'qualificar', 'o que o negócio já tem não vai de novo');
const props = (e1[0].corpo as { propriedades: Record<string, string> }).propriedades;
ok(!('nome_do_sistema' in props) && props.gargalo_operacional === 'Fila' && props.melhor_horario_do_decisor === '10-11:30',
  'vão a dor e o horário que só a ficha sabia — com o valor interno do HubSpot');
const e2 = enviosDasArmas({ dealId: '1', ownerId: '9', negocio: {}, armas: { sistema: 'Saipos', dor: '', decisor: 'Ana', papel: 'Gerente', horario: '' } });
ok(e2.length === 2 && e2[1].corpo.type === 'decisor' && e2[1].corpo.nome === 'Ana' && e2[1].corpo.owner_id === '9', 'decisor novo vira contato do negócio');
const e3 = enviosDasArmas({ dealId: '1', ownerId: null, negocio: {}, armas: { sistema: '', dor: '', decisor: '', papel: '', horario: '' } });
ok(e3.length === 0, 'nada preenchido, nada enviado (nunca apaga)');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\narmas da demo: tudo certo');
