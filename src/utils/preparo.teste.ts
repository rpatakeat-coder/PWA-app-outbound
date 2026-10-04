// Teste do preparo de 10 s da Agenda (handoff das abas). Roda: npx tsx src/utils/preparo.teste.ts
import { montarPreparo } from './preparo';

let falhas = 0;
const ok = (c: unknown, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

const DECISOR = '1395880470';
const VISITA = '1396005401';
const base = { codigo: DECISOR, diasNaEtapa: 2, reguaDias: 3, telefone: null, fichas: [], toques: [] };

// "O que falta" só lista o que o negócio NÃO tem (auditoria 04/10: dizia "valor de MRR" com MRR R$ 100)
const a = montarPreparo({ ...base, negocio: { valor_de_mrr: 100, data_da_reuniao: '2026-10-10' } });
ok(a.faltaConferida && a.falta === 'Para Demo/Proposta: plano apresentado', 'falta só o que o negócio não tem');
const b = montarPreparo({ ...base, negocio: { valor_de_mrr: 100, plano_apresentado: 'Pro', data_da_reuniao: '2026-10-10' } });
ok(b.falta === null, 'negócio completo: nada falta');
const c = montarPreparo({ ...base, negocio: null });
ok(!c.faltaConferida && c.falta?.startsWith('Para Demo/Proposta:'), 'sem o negócio no robô: é o que a etapa pede, não conferido');
// régua
ok(montarPreparo({ ...base, diasNaEtapa: 5, negocio: null }).regua === 'passou', 'passou da régua');
ok(montarPreparo({ ...base, diasNaEtapa: 3, negocio: null }).regua === 'perto', 'perto da régua (≥ 70%)');
ok(montarPreparo({ ...base, diasNaEtapa: 5, negocio: null }).etapaTexto === 'Conversa com decisor · há 5 dias · passou da régua de 3', 'texto da etapa');
// Visita → Decisor: telefone da ficha/cliente vale, e falar com quem decide
const v = montarPreparo({ ...base, codigo: VISITA, telefone: '27999990000', negocio: {}, fichas: [{ ocorrido_em: '2026-10-01T15:00:00Z', como_foi: 'decisor_ausente', decisor_nome: null, decisor_papel: null, horario_dono: '10h_11h30', sistema: 'Saipos', dor: null }] });
ok(v.falta === 'Para Conversa com decisor: maior dor · e falar com quem decide', 'visita: telefone e sistema já sabidos, falta a dor e o decisor');
ok(v.decide === 'Decisor não conhecido · dono costuma estar 10h–11h30', 'horário do dono pelo rótulo curto');
// último contato e contatos
const t = montarPreparo({ ...base, negocio: null, toques: [{ em: '2026-09-28T15:00:00Z', canal: 'visita' }, { em: '2026-09-30T15:00:00Z', canal: 'whatsapp' }] });
ok(t.ultimo.startsWith('WhatsApp') && t.contatos === 2, 'último contato é o mais recente; contatos contam');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\npreparo: tudo certo');
