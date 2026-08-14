// Regras de negocio puras — sem rede, sem Supabase, sem React.
//
// Mora aqui o que decide um numero na tela a partir de dados ja' carregados.
// Separado de proposito: e' o codigo que erra em silencio (numero errado com
// cara de certo) e o unico jeito de nao errar duas vezes e' poder testa-lo
// sozinho. Ver regras.teste.ts.
export type StatusVendedor = 'ativo' | 'sem_meta' | 'nao_vendedor';

/** Espelha o default da coluna route_config.meta_visitas_dia. So' entra em jogo
 *  se a tabela de config estiver vazia — nao e' pra "chutar" meta, e' pra a tela
 *  abrir com o mesmo numero que o app de campo usaria. */
export const META_PADRAO = 6;

/** A meta diaria de visitas que vale pra uma pessoa.
 *
 *  Tres estados, e e' aqui que as duas primeiras versoes das telas de gestao
 *  erraram — elas liam so' a meta propria e tratavam a ausencia dela como "sem
 *  meta". Com `seller_visit_goals` vazia, isso pintava o time inteiro como nao
 *  cadastrado, quando na verdade todos rodam pela meta global de route_config.
 *
 *  `null` sai SO' no caso 'sem_meta', que e' uma escolha explicita do gestor
 *  ("aparece no placar, mas nao comparo com meta") e nao um cadastro faltando.
 *  A distincao importa: uma cobra o gestor, a outra nao deve cobrar nada. */
export function resolverMeta(
  status: StatusVendedor,
  metaPropria: number | undefined | null,
  metaGlobal: number,
): { meta: number | null; ehGlobal: boolean } {
  if (status === 'sem_meta') return { meta: null, ehGlobal: false };
  if (metaPropria == null) return { meta: metaGlobal, ehGlobal: true };
  return { meta: metaPropria, ehGlobal: false };
}

/** Pontuacao do dia (02-FUNCIONALIDADES.md). Os pesos sao do doc — nao inventar. */
export const PONTOS = { visita: 10, avanco: 25, proposta: 40, fechamento: 100 } as const;

export function pontosDoDia(d: {
  visitas: number;
  avancos: number;
  propostas: number;
  fechamentos: number;
}): number {
  return (
    d.visitas * PONTOS.visita +
    d.avancos * PONTOS.avanco +
    d.propostas * PONTOS.proposta +
    d.fechamentos * PONTOS.fechamento
  );
}

export interface Delta {
  atual: number;
  anterior: number;
  diferenca: number;
  /** Variacao percentual. null quando a base e' zero — "subiu infinito%" nao
   *  e' leitura, e' ruido. A tela mostra o numero absoluto nesse caso. */
  pct: number | null;
  tom: 'bom' | 'ruim' | 'neutro';
}

/** Compara duas janelas.
 *
 *  A COR VEM DO SIGNIFICADO, NAO DO SINAL. O doc destaca isso porque e' o erro
 *  natural de quem implementa: pintar ▲ de verde sempre. Mas subir o numero de
 *  LEADS PERDIDOS e' ruim, e mostrar isso em verde faz o gestor ler a semana ao
 *  contrario. `inverter: true` marca as metricas em que menos e' melhor. */
export function calcularDelta(atual: number, anterior: number, inverter = false): Delta {
  const diferenca = atual - anterior;
  const pct = anterior === 0 ? null : Math.round((diferenca / anterior) * 100);
  const melhorou = inverter ? diferenca < 0 : diferenca > 0;
  const piorou = inverter ? diferenca > 0 : diferenca < 0;
  return {
    atual,
    anterior,
    diferenca,
    pct,
    tom: diferenca === 0 ? 'neutro' : melhorou ? 'bom' : piorou ? 'ruim' : 'neutro',
  };
}

/** Subiu no funil?
 *
 *  So' conta quando as DUAS pontas sao etapas conhecidas do funil e o indice
 *  cresceu. Mudanca vinda de etapa fora do funil (importacao, Backlog, Perdido)
 *  nao e' avanco: contar isso encheria o placar de movimentacao que nao e'
 *  venda, e o numero subiria justamente nos dias de faxina no CRM. */
export function ehAvanco(
  de: string | null | undefined,
  para: string,
  ordem: Map<string, number>,
): boolean {
  if (!de) return false;
  const i = ordem.get(de);
  const j = ordem.get(para);
  return i != null && j != null && j > i;
}
