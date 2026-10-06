// Teste do "Feito hoje" da Agenda. Roda: npx tsx src/utils/feitoNoDia.teste.ts
import { montarFeitoNoDia } from './feitoNoDia';

let falhas = 0;
const ok = (c: unknown, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

const nomes: Record<string, string> = { a: 'Capitão Jack', b: 'Malz Burguer', c: 'Dom Pasco' };
const itens = montarFeitoNoDia({
  visitas: [
    { id: 'v1', client_id: 'a', visited_at: '2026-10-06T16:45:00Z', distance_m: 38, declarada: false },
    { id: 'v2', client_id: 'b', visited_at: '2026-10-06T14:10:00Z', distance_m: null, declarada: true },
    { id: 'v3', client_id: 'c', visited_at: '2026-10-06T18:00:00Z', distance_m: 12, declarada: false },
  ],
  fichas: [
    { client_id: 'a', ocorrido_em: '2026-10-06T16:47:00Z', como_foi: 'falou_com_decisor', proximo: 'reuniao', proximo_em: '2026-10-08', proximo_tipo: 'reuniao',
      etapa_antes: '1396005401', etapa_depois: '1395880470', decisor_nome: 'Paulo', motivo_perdido: null },
    { client_id: 'b', ocorrido_em: '2026-10-06T14:12:00Z', como_foi: 'sem_interesse', proximo: 'sem_interesse', proximo_em: null, proximo_tipo: null,
      etapa_antes: 'Visita', etapa_depois: 'Perdido', decisor_nome: null, motivo_perdido: 'Já tem sistema' },
  ],
  registros: [{ id: 'r1', deal_id: '9', negocio: 'Sushi X', hora: '15:20', resultado: 'Não atendeu', volta: '2026-10-08', perdido: null, criada_em: '2026-10-06T18:20:00Z' }],
  nomeDe: (id) => nomes[id] ?? null,
  noPlano: new Set(['a', 'b']),
});

ok(itens.map((i) => i.nome).join() === 'Malz Burguer,Capitão Jack,Dom Pasco,Sushi X', 'tudo do dia, na ordem da hora (visitas e registros da Tarefas)');
const jack = itens.find((i) => i.nome === 'Capitão Jack')!;
ok(jack.linha1 === 'Visita · GPS a 38 m', 'a prova da visita');
ok(jack.linha2 === 'Falou com o decisor · com Paulo · Visita → Conversa com decisor', 'como foi, com quem e a etapa pelo nome (o banco grava o id do HubSpot)');
ok(jack.proximo === 'Reunião qui 08/10', 'o próximo passo com o dia');
const malz = itens.find((i) => i.nome === 'Malz Burguer')!;
ok(malz.linha1 === 'Visita · sem GPS' && malz.proximo === 'Encerrado: Já tem sistema', 'sem GPS e o motivo do encerramento');
const dom = itens.find((i) => i.nome === 'Dom Pasco')!;
ok(dom.faltaRegistro && dom.linha1.endsWith('fora do plano') && dom.proximo === null, 'check-in sem registro fica marcado (falta registrar) e fora do plano');
const sushi = itens.find((i) => i.nome === 'Sushi X')!;
ok(sushi.tipo === 'tarefa' && sushi.linha2 === 'Não atendeu' && sushi.proximo === 'Voltar qui 08/10', 'o que foi registrado na Tarefas, com a volta');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nfeito no dia: tudo certo');
