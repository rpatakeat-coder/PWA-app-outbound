import { colunaDoDia, diasPlanejaveis, diaInicial, ehCompromisso, faixaDoLead, rotuloDoDia, semanaDoDia, vaiAoCockpit } from './planoNoMapa';

let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) console.log('ok  ', nome);
  else { falhas++; console.log('FALHA', nome, '\n  obtido:  ', a, '\n  esperado:', b); }
}

// segunda 28/09/2026
igual('rótulo', rotuloDoDia('2026-09-30'), 'qua 30/09');
igual('dez dias úteis a partir de segunda', diasPlanejaveis('2026-09-28').map((d) => d.iso),
  ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
igual('hoje marcado', diasPlanejaveis('2026-09-28', 2).map((d) => d.hoje), [true, false]);
igual('sábado pula para segunda', diasPlanejaveis('2026-10-03', 1).map((d) => d.rotulo), ['seg 05/10']);
igual('virada de mês', diasPlanejaveis('2026-09-30', 3).map((d) => d.iso), ['2026-09-30', '2026-10-01', '2026-10-02']);
igual('manhã abre hoje', diaInicial('2026-09-28', 9), '2026-09-28');
igual('tarde abre amanhã', diaInicial('2026-09-28', 15), '2026-09-29');
igual('sexta à tarde abre segunda', diaInicial('2026-10-02', 15), '2026-10-05');
igual('domingo abre segunda', diaInicial('2026-10-04', 9), '2026-10-05');
igual('com negócio vai', vaiAoCockpit({ id_hubspot: '123' }), true);
igual('conta-alvo vai', vaiAoCockpit({ id_hubspot: null, lead_prospeccao_id: 'u' }), true);
igual('sem os dois não vai', vaiAoCockpit({ id_hubspot: ' ', lead_prospeccao_id: null }), false);

igual('semana de quarta', semanaDoDia('2026-09-30'), { segunda: '2026-09-28', indice: 2 });
igual('semana de sexta na virada', semanaDoDia('2026-10-02'), { segunda: '2026-09-28', indice: 4 });
igual('semana de segunda', semanaDoDia('2026-10-05'), { segunda: '2026-10-05', indice: 0 });
const grade = [[], [null, 'c-1', { id: '__rua' }, { id: 'n-u', origem: 'app' }, { id: 'c-2', origem: 'app-agenda', hora: '14:00' }]];
igual('coluna lê texto e objeto, sem marcação', colunaDoDia(grade, 1).map((f) => f.id), ['c-1', 'n-u', 'c-2']);
igual('coluna de grade quebrada', colunaDoDia(null, 1), []);
igual('lead com negócio achado por c-', faixaDoLead(colunaDoDia(grade, 1), { id_hubspot: '1' })?.id, 'c-1');
igual('conta-alvo com negócio achada por n-', faixaDoLead(colunaDoDia(grade, 1), { id_hubspot: '9', lead_prospeccao_id: 'u' })?.id, 'n-u');
igual('fora da coluna', faixaDoLead(colunaDoDia(grade, 1), { id_hubspot: '7' }), null);
igual('visita da agenda é compromisso', ehCompromisso(faixaDoLead(colunaDoDia(grade, 1), { id_hubspot: '2' })), true);
igual('faixa do app não é compromisso', ehCompromisso({ id: 'c-1', origem: 'app' }), false);

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntodos passaram');
