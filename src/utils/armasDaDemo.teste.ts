// Teste das armas para a demo. Roda: npx tsx src/utils/armasDaDemo.teste.ts
import { argumentoDoSistema, armasConhecidas, armasQueFaltam, enviosDasArmas, fichasDaFolha, linhaDaPraca, normalizarSistema, registroDoAvanco, resumoDasArmas, rotuloDasFaltas } from './armasDaDemo';

let falhas = 0;
const ok = (c: unknown, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

const fichas = [
  { ocorrido_em: '2026-10-01T15:00:00Z', decisor_nome: 'Sidnei', decisor_papel: 'Dono', horario_dono: '10h_11h30', sistema: 'Goomer', dor: 'Fila' },
  { ocorrido_em: '2026-10-03T15:00:00Z', decisor_nome: null, decisor_papel: null, horario_dono: null, sistema: 'Saipos', dor: null },
];

// a ficha mais recente vence o negócio (a mesma regra do Raio X do gestor); sem ficha, o negócio
const a0 = armasConhecidas({ nome_do_sistema: 'Colibri' }, fichas);
ok(a0.sistema === 'Saipos', 'a ficha mais recente com sistema vence o HubSpot');
ok(armasConhecidas({ nome_do_sistema: 'Colibri' }, []).sistema === 'Colibri', 'sem ficha, vale o HubSpot');
const a = armasConhecidas({ nome_do_sistema: 'Colibri' }, fichas.map((f) => ({ ...f, sistema: null })));
ok(a.sistema === 'Colibri', 'ficha sem sistema não apaga o do negócio');
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

// o decisor do negócio (contato Dono/Gerente) vale quando nenhuma ficha tem
const dn = armasConhecidas({ decisor_nome: "Carlos", decisor_papel: "Dono" }, []);
ok(dn.decisor === "Carlos" && dn.papel === "Dono", "decisor do HubSpot preenche a arma");

// sistema normalizado: o mesmo mapa do Cockpit
const N = (v: string, e: string | null) => ok(normalizarSistema(v) === e, `"${v}" → ${e ?? 'não registrado'}`);
N('SAIPOS', 'Saipos'); N('anotai', 'Anota Aí'); N('Anota Aí', 'Anota Aí'); N('saipos e cardápio web', 'Saipos'); N('não usa', 'Nenhum');
N('caderno', 'Nenhum'); N('VERIFICAR', null); N('', null); N('Não sei ainda', null); N('IR LA', null); N('usa Bitbar', 'BitiBar'); N('Sistema da casa', 'Outro');

// o argumento por tipo de sistema
ok(argumentoDoSistema('Saipos')?.objecao === 'Já tenho sistema' && argumentoDoSistema('Saipos')?.contra === 'a Saipos', 'PDV: já tenho sistema');
ok(argumentoDoSistema('anota ai')?.objecao === 'Meu delivery já está resolvido', 'delivery: o salão');
ok(argumentoDoSistema('VERIFICAR') === null, 'sem sistema registrado, sem argumento pronto');

// na sua praça
const praca = { praca: 'Rio de Janeiro', dores: [{ dor: 'Fila', n: 14 }, { dor: 'Estoque', n: 2 }],
  fechados: [{ s: 'saipos', g: true, m: null }, { s: 'SAIPOS', g: false, m: 'Não quer mudar de sistema' }, { s: 'Saipos pdv', g: false, m: 'Não quer mudar de sistema' }, { s: 'Saipos', g: false, m: 'Outros' }, { s: 'Goomer', g: false, m: 'Preço' }] };
ok(linhaDaPraca(praca, 'Saipos') === 'Fila é a dor nº 1 (14 negócios em Rio de Janeiro). Contra a Saipos, o time ganhou 1 e perdeu 3, a maioria por "não quer mudar de sistema".', 'a dor nº 1 e o placar contra o sistema');
ok(linhaDaPraca(praca, '') === 'Fila é a dor nº 1 (14 negócios em Rio de Janeiro).', 'sem sistema, só a dor');
ok(linhaDaPraca({ praca: null, dores: [], fechados: [] }, 'Saipos') === null, 'sem praça no cadastro, a linha some');

// a folha também é fonte (gv2_falta_etapa.armas), pela data
const daFolha = fichasDaFolha([{ criado_em: '2026-10-05T12:00:00Z', armas: { sistema: 'Goomer', dor: null, decisor: 'Ana', papel: 'Gerente', horario: 'noite_apos_17h' } }]);
const f2 = armasConhecidas({}, [...fichas, ...daFolha]);
ok(f2.sistema === 'Goomer' && f2.decisor === 'Ana' && f2.horario === 'noite_apos_17h' && f2.dor === 'Fila', 'o que a folha gravou vale como ficha mais recente');

// o registro do avanço sem preencher
const reg = registroDoAvanco({ dealId: '7', execId: '9', etapa: 'Demo/Proposta', armas: { sistema: 'Saipos', dor: 'Fila', decisor: '', papel: '', horario: '' } });
ok(reg.faltou.join() === 'decisor,horario' && reg.armas.sistema === 'Saipos' && reg.armas.decisor === null, 'faltou = o que ficou vazio; armas = o que se sabia');
ok(rotuloDasFaltas({ sistema: 'Saipos', dor: 'Fila', decisor: '', papel: '', horario: '' }) === 'decisor, horário', 'o toast diz o que faltou');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\narmas da demo: tudo certo');
