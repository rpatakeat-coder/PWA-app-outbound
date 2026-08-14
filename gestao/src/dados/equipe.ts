// Quem e' o time, e qual e' a meta de cada um.
//
// FONTE UNICA. As duas telas de gestao (Cockpit e Daily) e o app de campo
// precisam concordar sobre duas coisas: quem aparece num ranking e qual meta
// vale pra pessoa. Antes isto estava duplicado — e divergindo — entre
// cockpit.ts, daily.ts e src/screens/RouteHistorySection.tsx.
//
// A REGRA E' A DO APP DE CAMPO, e nao uma nova. Ela e' de TRES estados, e as
// duas primeiras versoes destas telas erraram por tratar como dois:
//
//   nao_vendedor -> some de tudo (rankings, metas, filtros).
//   sem_meta     -> aparece no placar, mas sem "bateu/nao bateu".
//   ativo        -> meta propria (seller_visit_goals) OU, faltando ela, a meta
//                   GLOBAL de route_config.meta_visitas_dia.
//
// O fallback global e' o ponto que mais custou: `seller_visit_goals` esta'
// vazia hoje, entao ler so' ela faz o time inteiro parecer "sem meta" quando
// na verdade todo mundo tem meta 6 pela config. A tela diria "cadastre as
// metas" para um gestor que ja' as configurou — no lugar errado.
//
// Sem linha em seller_classification = 'ativo' (default declarado na migration
// 20260807_seller_classification.sql, pra preservar o comportamento ate o
// gestor curar a lista).
import { supabase } from '../supabase';
import { resolverMeta, META_PADRAO, type StatusVendedor } from './regras';

export type { StatusVendedor };

export interface MembroEquipe {
  /** UUID de profiles = auth.uid = client_visits.visited_by. */
  perfilId: string;
  /** Owner do HubSpot. Chave dos fechamentos (clients.vendedor_id_hubspot). */
  ownerId: string | null;
  /** Sem o sufixo "/ DESATIVADO" — ele vira a flag `desativado`. */
  nome: string;
  email: string;
  desativado: boolean;
  status: StatusVendedor;
  /** Meta diaria efetiva. null quando o gestor marcou a pessoa como sem_meta:
   *  ai' nao existe "bateu", e a tela mostra vazio em vez de zero. */
  metaVisitasDia: number | null;
  /** A meta veio da config global, e nao de uma meta propria da pessoa. */
  metaEhGlobal: boolean;
}

export interface Equipe {
  membros: MembroEquipe[];
  metaGlobal: number;
  /** Quantos tem meta propria cadastrada — o resto roda no fallback global. */
  comMetaPropria: number;
}

export async function carregarEquipe(): Promise<Equipe> {
  const [perfis, classificacao, metas, config] = await Promise.all([
    // Igual ao useAllSellers do app: 'view' nao e' campo, entao nao entra.
    supabase.from('profiles').select('id, full_name, email, id_hubspot, role').neq('role', 'view'),
    supabase.from('seller_classification').select('seller_id, status'),
    supabase.from('seller_visit_goals').select('seller_id, meta_visitas_dia'),
    supabase.from('route_config').select('meta_visitas_dia').eq('id', 1).maybeSingle(),
  ]);

  if (perfis.error) throw perfis.error;

  // A classificacao e a config sao OPCIONAIS de proposito: se a tabela nao
  // existir ou a leitura falhar, o placar ainda abre com o default declarado,
  // em vez de a tela inteira virar mensagem de erro por causa da curadoria.
  const statusPor = new Map<string, StatusVendedor>();
  for (const c of (classificacao.data ?? []) as any[]) {
    statusPor.set(c.seller_id, c.status as StatusVendedor);
  }

  const metaPropriaPor = new Map<string, number>();
  for (const m of (metas.data ?? []) as any[]) {
    if (m.seller_id && typeof m.meta_visitas_dia === 'number') {
      metaPropriaPor.set(m.seller_id, m.meta_visitas_dia);
    }
  }

  const metaGlobal = (config.data as any)?.meta_visitas_dia || META_PADRAO;

  const membros: MembroEquipe[] = ((perfis.data ?? []) as any[])
    .map((p) => {
      const bruto = (p.full_name?.trim() || p.email || 'Sem nome') as string;
      const desativado = /DESATIVADO/i.test(bruto);
      const status = statusPor.get(p.id) ?? 'ativo';
      const { meta, ehGlobal } = resolverMeta(status, metaPropriaPor.get(p.id), metaGlobal);
      return {
        perfilId: p.id,
        ownerId: p.id_hubspot ?? null,
        nome: bruto.replace(/\s*\/\s*DESATIVADO\s*$/i, '').trim() || p.email || 'Sem nome',
        email: p.email,
        desativado,
        status,
        metaVisitasDia: meta,
        metaEhGlobal: ehGlobal,
      };
    })
    .filter((m) => m.status !== 'nao_vendedor')
    .sort((a, b) =>
      a.desativado === b.desativado ? a.nome.localeCompare(b.nome) : a.desativado ? 1 : -1,
    );

  return {
    membros,
    metaGlobal,
    comMetaPropria: membros.filter((m) => !m.metaEhGlobal && m.metaVisitasDia != null).length,
  };
}

/** Quem trabalha hoje: o recorte que as telas de "agora" usam. Desativado sai —
 *  apareceria com carteira parada e travados que ninguem vai atacar. */
export function ativos(equipe: Equipe): MembroEquipe[] {
  return equipe.membros.filter((m) => !m.desativado);
}
