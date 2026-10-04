// O VARIÁVEL DO FIELD SALES (Fase 0 das abas, 04/10/2026; docs/12 §6). A tabela vem do banco
// (faixas_comissao(), 0158 → cockpit_config.comissionamento): nenhuma faixa nem valor fica
// escrito aqui. Modelo RETROATIVO, confirmado pelo Julyan em 22/09/26: ao entrar numa faixa,
// o valor novo vale para TODOS os clientes do mês — por isso a 6ª venda vale +R$ 550.
import { supabase } from '../integrations/supabase/client';

export type FaixaComissao = { de: number; ate: number | null; porCliente: number };
export type TabelaComissao = { modelo: 'retroativo' | 'marginal'; faixas: FaixaComissao[] };

/** A faixa em que caem `clientes` clientes no mês (null = tabela vazia ou fora dela). */
export function faixaDe(clientes: number, faixas: FaixaComissao[]): FaixaComissao | null {
  return faixas.find((f) => clientes >= f.de && (f.ate == null || clientes <= f.ate)) ?? null;
}

/** Quanto vale o mês com `clientes` clientes. */
export function variavelDoMes(clientes: number, tabela: TabelaComissao): number {
  if (clientes <= 0) return 0;
  if (tabela.modelo === 'marginal') {
    let total = 0;
    for (let i = 1; i <= clientes; i++) total += faixaDe(i, tabela.faixas)?.porCliente ?? 0;
    return total;
  }
  return clientes * (faixaDe(clientes, tabela.faixas)?.porCliente ?? 0);
}

/** O que muda no variável com a PRÓXIMA venda, e se ela troca de faixa. */
export function proximaVenda(clientes: number, tabela: TabelaComissao): { vale: number; mudaFaixa: boolean; total: number } {
  const n = Math.max(0, clientes);
  const agora = variavelDoMes(n, tabela);
  const depois = variavelDoMes(n + 1, tabela);
  const fa = faixaDe(n, tabela.faixas);
  const fd = faixaDe(n + 1, tabela.faixas);
  return { vale: depois - agora, mudaFaixa: !!fd && fa !== fd && n > 0, total: agora };
}

/** Lê a tabela do banco. null = não consegui ler (a tela diz "não medido", nunca R$ 0). */
export async function lerTabelaComissao(): Promise<TabelaComissao | null> {
  const { data, error } = await supabase.rpc('faixas_comissao');
  if (error || !data) return null;
  const d = data as { modelo?: string; faixas?: unknown };
  if (!Array.isArray(d.faixas) || d.faixas.length === 0) return null;
  const faixas = (d.faixas as Array<Record<string, unknown>>)
    .map((f) => ({ de: Number(f.de), ate: f.ate == null ? null : Number(f.ate), porCliente: Number(f.porCliente) }))
    .filter((f) => Number.isFinite(f.de) && Number.isFinite(f.porCliente));
  return { modelo: d.modelo === 'marginal' ? 'marginal' : 'retroativo', faixas };
}
