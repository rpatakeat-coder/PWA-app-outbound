// A ida ao banco da aba de documentação.
//
// Separado de `documentacao.ts` porque aquele é puro e tem teste: assim que um
// arquivo importa o cliente do Supabase, ele deixa de rodar por `npx tsx` (o
// cliente lê `import.meta.env`, que só existe dentro do build do Vite). A
// regra que decide o selo de "confere" não pode ficar refém disso.
import { supabase } from '../supabase';
import type { FatosVivos } from './documentacao';

const VAZIO = (erro: string | null): FatosVivos => ({
  statuses: [],
  visibilidade: [],
  slas: [],
  contagemPorStatus: [],
  semIdHubspot: 0,
  pessoasAtivas: 0,
  lidoEm: new Date().toISOString(),
  erro,
});

export async function carregarFatosVivos(): Promise<FatosVivos> {
  try {
    const [statusRes, visRes, slaRes, perfis] = await Promise.all([
      supabase.from('client_statuses').select('slug, label, is_active'),
      supabase.from('sector_visibility').select('sector, status_slug'),
      supabase.from('stage_sla').select('stage_label, sla_days, task_title, is_active'),
      supabase.from('profiles').select('full_name, id_hubspot, role'),
    ]);

    const erroDuro = statusRes.error || visRes.error || slaRes.error || perfis.error;
    if (erroDuro) return VAZIO(erroDuro.message);

    // Desativado é convenção de NOME (`/ DESATIVADO`), não coluna — é o que
    // várias telas leem, e a documentação descreve essa mesma convenção.
    const ativos = (perfis.data ?? []).filter(
      (p) => p.role !== 'view' && !/\/\s*DESATIVADO/i.test(p.full_name ?? ''),
    );

    // Contagem com `head: true` + `count: 'exact'`: o servidor devolve só o
    // número, sem trafegar linha nenhuma. A alternativa seria paginar as ~5,5
    // mil linhas de `clients` a cada abertura da aba — caro, e ainda sujeito ao
    // corte silencioso de 1000 do PostgREST se alguém esquecesse a paginação.
    const slugsAtivos = (statusRes.data ?? [])
      .filter((s) => s.is_active === true)
      .map((s) => s.slug as string);
    const contagens = await Promise.all(
      slugsAtivos.map(async (slug) => {
        const { count } = await supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('status', slug);
        return { status: slug, total: count ?? 0 };
      }),
    );

    return {
      statuses: (statusRes.data ?? []).map((s) => ({
        slug: s.slug as string,
        label: s.label as string,
        ativo: s.is_active === true,
      })),
      visibilidade: (visRes.data ?? []).map((v) => ({
        setor: v.sector as string,
        status: v.status_slug as string,
      })),
      slas: (slaRes.data ?? []).map((s) => ({
        etapa: s.stage_label as string,
        dias: (s.sla_days as number | null) ?? null,
        tarefa: (s.task_title as string | null) ?? null,
        ativo: s.is_active === true,
      })),
      contagemPorStatus: contagens.sort((a, b) => b.total - a.total),
      semIdHubspot: ativos.filter((p) => !p.id_hubspot).length,
      pessoasAtivas: ativos.length,
      lidoEm: new Date().toISOString(),
      erro: null,
    };
  } catch (err) {
    return VAZIO((err as Error)?.message ?? 'falhou');
  }
}
