import { supabase } from '../supabase';
// Busca uma tabela inteira, em paginas.
//
// POR QUE ISTO EXISTE
// O PostgREST corta a resposta num teto de linhas (1.000 por padrao) e NAO
// avisa: vem menos dado, status 200, nenhum erro. Numa tela de gestao isso e'
// pior que uma falha — o numero aparece, parece certo, e esta' errado pra menos.
//
// Ja' mordeu duas vezes neste projeto: no backfill de won_at (que teria dito
// "pronto" depois de olhar um terco da base) e em client_stage_changes no
// cockpit, onde o corte faria leads antigos perderem a data de entrada na etapa
// e sumirem silenciosamente da conta de travados.
//
// Usar .range() explicito deixa o comportamento igual independente de como o
// servidor esteja configurado.
const PAGINA = 1000;

export async function buscarTudo<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const tudo: T[] = [];
  // Teto de seguranca: 200 paginas = 200 mil linhas. Se estourar, e' bug de
  // filtro (busca sem where), nao volume real — melhor parar que travar a aba.
  for (let pagina = 0; pagina < 200; pagina++) {
    const { data, error } = await montar(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
    if (error) throw error;
    const lote = data ?? [];
    tudo.push(...lote);
    if (lote.length < PAGINA) return tudo;
  }
  return tudo;
}

/** Nomes dos leads citados, buscados POR ID.
 *
 *  Existe porque estas telas so' precisam do nome de quem aparece na janela —
 *  algumas centenas — e antes baixavam a tabela `clients` inteira (~5,6 mil
 *  linhas, seis paginas SEQUENCIAIS) pra montar o dicionario. */
export async function nomesPorId(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  const mapa = new Map<string, string>();
  const LOTE = 200; // ids por consulta: tamanho de URL do PostgREST
  for (let i = 0; i < unicos.length; i += LOTE) {
    const { data } = await supabase
      .from('clients')
      .select('id, nome, empresa')
      .in('id', unicos.slice(i, i + LOTE));
    for (const c of data ?? []) {
      mapa.set(c.id, (c.empresa || '').trim() || c.nome || 'sem nome');
    }
  }
  return mapa;
}
