// Testes da lógica pura do "Um app só" (04/10/2026). Rodar: npx tsx src/utils/umApp.teste.ts
import { momentoDoDia, planoApresentadoHubSpot, proximaEtapa, segundaDaSemana, textoDoPiso } from './umApp';

let falhas = 0;
const ok = (cond: boolean, nome: string) => { if (!cond) { falhas++; console.error('FALHOU:', nome); } else console.log('ok -', nome); };
const brt = (iso: string) => new Date(`${iso}-03:00`);

// abertura por horário (docs/11 §1): manhã = antes do 1º check-in E antes das 11h; noite = depois das 18h
ok(momentoDoDia(0, brt('2026-10-05T07:40:00')) === 'manha', '07:40 sem check-in é manhã');
ok(momentoDoDia(1, brt('2026-10-05T09:00:00')) === 'rua', '09:00 com 1 check-in já é rua');
ok(momentoDoDia(0, brt('2026-10-05T11:00:00')) === 'rua', '11:00 sem check-in é rua');
ok(momentoDoDia(3, brt('2026-10-05T18:00:00')) === 'noite', '18:00 é noite');
ok(momentoDoDia(0, brt('2026-10-05T23:59:00')) === 'noite', '23:59 é noite (não vira o dia por UTC)');

// "esta semana" do Planejamento: no sábado e no domingo, já é a próxima
ok(segundaDaSemana(brt('2026-10-04T15:00:00')) === '2026-10-05', 'domingo → segunda seguinte');
ok(segundaDaSemana(brt('2026-10-03T10:00:00')) === '2026-10-05', 'sábado → segunda seguinte');
ok(segundaDaSemana(brt('2026-10-07T10:00:00')) === '2026-10-05', 'quarta → a segunda da semana');
ok(segundaDaSemana(brt('2026-10-05T00:30:00')) === '2026-10-05', 'segunda 00:30 BRT (ainda domingo em UTC-?) → ela mesma');
ok(segundaDaSemana(brt('2026-10-09T22:00:00'), 1) === '2026-10-12', 'sexta 22h + 1 → próxima segunda');

// piso
const p = (v: number, d: number) => ({ sem_carteira: false, semana: { piso_faltam_provadas: v, piso_faltam_demos: d } } as never);
ok(textoDoPiso(p(0, 0)) === 'Piso da semana batido', 'piso batido');
ok(textoDoPiso(p(3, 0)) === 'Piso: faltam 3 provadas', 'faltam 3 provadas');
ok(textoDoPiso(p(1, 1)) === 'Piso: faltam 1 provada e 1 demo', 'singular');
ok(textoDoPiso(undefined) === null, 'sem dado é null, não zero');

// plano apresentado na lista do HubSpot (a mesma do Cockpit)
ok(planoApresentadoHubSpot('completo', 'basico') === 'Básico (PDV + mesa + delivery)', 'completo + básico');
ok(planoApresentadoHubSpot('delivery', 'basico') === 'Básico (PDV + delivery)', 'delivery + básico');
ok(planoApresentadoHubSpot('completo', 'intermediario') === 'Inovação', 'intermediário vira Inovação');
ok(planoApresentadoHubSpot('completo', 'profissional') === 'Pro', 'profissional vira Pro');

// funil: Ag. Pagamento é a última etapa do quadro, sem próxima
ok(proximaEtapa('1395880472')?.id === '1395880473', 'Negociação → Ag. Pagamento (Cobrança)');
ok(proximaEtapa('1395880473') === null, 'Ag. Pagamento não avança pelo app');

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log('todas passaram');
