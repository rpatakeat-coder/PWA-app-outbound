// Datas em horario de Brasilia.
//
// Modulo separado e SEM dependencia de rede de proposito: estas tres funcoes
// decidem o que conta como "hoje" e "esta semana" em toda tela de gestao, e
// precisam ser testaveis sozinhas.
//
// O doc (10-PLANO-DE-IMPLEMENTACAO.md) lista "datas em UTC" entre os erros que
// mais custaram no sistema original: entre 21h e 23h59 a janela do dia virava,
// a API voltava vazia e as visitas do dia sumiam da tela. O horario de Brasilia
// e' UTC-3, entao das 21h em diante o dia UTC ja' e' o SEGUINTE — usar
// toISOString() pra extrair a data e' o bug, nao um detalhe.
const FUSO = 'America/Sao_Paulo';

const fmtDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data-calendario em Brasilia, no formato YYYY-MM-DD. */
export function diaBRT(quando: string | Date): string {
  return fmtDia.format(new Date(quando));
}

/** Segunda a sexta. Feriado nao entra na conta: o banco nao tem calendario de
 *  feriados e inventar um daria erro silencioso em datas que ninguem conferiria. */
export function ehDiaUtil(dia: string): boolean {
  // Meio-dia UTC de proposito: o valor ja' e' uma data-calendario de Brasilia,
  // e ancorar no meio do dia impede que o proprio parse escorregue de dia.
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return semana >= 1 && semana <= 5;
}

/** A segunda-feira da semana CIVIL que contem `dia`.
 *
 *  Semana civil, nunca rolante de 7 dias. O doc lista isso entre os erros do
 *  original: uma janela rolante da o numero certo com o rotulo errado — "esta
 *  semana" mostrando terca a terca nao e' o que o gestor le' quando planeja. */
export function segundaDaSemana(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  // getUTCDay: 0=domingo. Domingo pertence a' semana que ACABOU, entao volta 6.
  const desloca = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - desloca);
  return d.toISOString().slice(0, 10);
}

/** Segunda a sexta da semana civil que contem `dia`, em ordem. */
export function diasDaSemana(dia: string): string[] {
  const segunda = new Date(`${segundaDaSemana(dia)}T12:00:00Z`);
  const dias: string[] = [];
  for (let i = 0; i < 5; i++) {
    dias.push(segunda.toISOString().slice(0, 10));
    segunda.setUTCDate(segunda.getUTCDate() + 1);
  }
  return dias;
}

/** Dias uteis de `hoje` pra tras, em ordem decrescente (hoje primeiro). */
export function diasUteisAte(hoje: string, quantos: number): string[] {
  const dias: string[] = [];
  const cursor = new Date(`${hoje}T12:00:00Z`);
  // Teto de seguranca: 10x o pedido cobre qualquer sequencia de fim de semana
  // e impede laco infinito se `quantos` vier absurdo.
  for (let i = 0; dias.length < quantos && i < quantos * 10 + 14; i++) {
    const dia = cursor.toISOString().slice(0, 10);
    if (ehDiaUtil(dia)) dias.push(dia);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dias;
}
