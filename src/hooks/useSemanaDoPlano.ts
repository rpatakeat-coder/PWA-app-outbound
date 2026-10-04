// A semana do Planejamento, lida no app (Um app só, PR 2 · Agenda · Semana, 04/10/2026).
//
// É o MESMO dado que o Planejamento do Cockpit grava (planos_semanais.grade: 5 dias × slots,
// cada slot {id, p, hora, regiao?, duracao?}) e que vira parada da rota pelo espelho do banco
// (0150). Aqui só se LÊ: criar e mover bloco continua no editor do Cockpit (embutido), para a
// regra de gravação ser uma só.
//   id: 'c-<negócio>' (funil), 'r-<negócio>' (relacionamento), 'n-<conta-alvo>' (prospecção
//       de conta nova), '__rua' (prospecção de rua), '__rel' (relacionamento sem conta),
//       outros '__…' = horário bloqueado.
//   p:  rua · cobrar · relac · follow · nova · funil (os seis propósitos do Cockpit).
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';

export const PROPOSITOS: Record<string, { nome: string; cor: string }> = {
  rua: { nome: 'Prospecção de rua', cor: '#7A8494' },
  cobrar: { nome: 'Cobrar pagamento', cor: '#B0782A' },
  relac: { nome: 'Visita de relacionamento', cor: '#1E9E7B' },
  follow: { nome: 'Follow-up', cor: '#E51A31' },
  nova: { nome: 'Prospecção de conta nova', cor: '#8E3B5C' },
  funil: { nome: 'Avançar o funil', cor: '#5B667A' },
};

export type BlocoDaSemana = { hora: string; proposito: string; alvo: string | null; tipo: 'conta' | 'rua' | 'rel' | 'bloqueado' };
export type DiaDaSemana = { iso: string; blocos: BlocoDaSemana[] };
export type SemanaDoPlano = {
  segunda: string;
  dias: DiaDaSemana[];
  promessa: { visitas: number | null; fechamentos: number | null; prospeccao: number | null } | null;
  fechadoEm: string | null;
};

const DIA_MS = 86400000;
const isoBRT = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);

/** A segunda da "esta semana" do Planejamento: no sábado e no domingo, já é a próxima (igual ao Cockpit). */
export function segundaDaSemana(agora = new Date(), deslocar = 0): string {
  const hoje = new Date(`${isoBRT(agora)}T12:00:00Z`);
  const dow = hoje.getUTCDay();
  const ate = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  return new Date(hoje.getTime() + (ate + deslocar * 7) * DIA_MS).toISOString().slice(0, 10);
}

export function useSemanaDoPlano(ownerId: string | null, segunda: string, ativo: boolean) {
  return useQuery<SemanaDoPlano>({
    queryKey: ['semana_do_plano', ownerId, segunda],
    enabled: ativo && !!ownerId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('planos_semanais')
        .select('grade, promessa, fechado_em').eq('owner_id', ownerId!).eq('data_segunda', segunda).maybeSingle();
      if (error) throw error;
      const grade = (Array.isArray(data?.grade) ? data!.grade : []) as unknown[][];
      const negocios = new Set<string>(); const contas = new Set<string>();
      for (const col of grade) for (const v of (Array.isArray(col) ? col : [])) {
        const id = v && typeof v === 'object' ? String((v as { id?: unknown }).id ?? '') : '';
        if (/^[cr]-/.test(id)) negocios.add(id.slice(2));
        if (/^n-/.test(id)) contas.add(id.slice(2));
      }
      const nomes = new Map<string, string>();
      if (negocios.size) {
        const { data: cs } = await supabase.from('clients').select('id_hubspot, nome, empresa').in('id_hubspot', [...negocios]);
        for (const c of cs ?? []) nomes.set(`d${c.id_hubspot}`, (c.empresa as string)?.trim() || (c.nome as string) || 'Negócio');
      }
      if (contas.size) {
        const { data: ls } = await supabase.from('leads_prospeccao').select('id, nome').in('id', [...contas]);
        for (const l of ls ?? []) nomes.set(`n${l.id}`, (l.nome as string) || 'Conta-alvo');
      }
      const dias: DiaDaSemana[] = Array.from({ length: 5 }, (_, i) => {
        const iso = new Date(new Date(`${segunda}T12:00:00Z`).getTime() + i * DIA_MS).toISOString().slice(0, 10);
        const col = Array.isArray(grade[i]) ? grade[i] : [];
        const blocos: BlocoDaSemana[] = [];
        for (const v of col) {
          if (!v) continue;
          const o = (typeof v === 'object' ? v : { id: v }) as { id?: string; p?: string; hora?: string; regiao?: string };
          const id = String(o.id ?? '');
          const hora = o.hora ? String(o.hora) : '';
          if (id === '__rua') blocos.push({ hora, proposito: 'rua', alvo: o.regiao ?? null, tipo: 'rua' });
          else if (id === '__rel') blocos.push({ hora, proposito: 'relac', alvo: null, tipo: 'rel' });
          else if (id.startsWith('__')) blocos.push({ hora, proposito: 'bloqueado', alvo: null, tipo: 'bloqueado' });
          else if (/^[cr]-/.test(id)) blocos.push({ hora, proposito: o.p ?? (id.startsWith('r-') ? 'relac' : 'funil'), alvo: nomes.get(`d${id.slice(2)}`) ?? 'Negócio', tipo: 'conta' });
          else if (id.startsWith('n-')) blocos.push({ hora, proposito: o.p ?? 'nova', alvo: nomes.get(`n${id.slice(2)}`) ?? 'Conta-alvo', tipo: 'conta' });
        }
        // hora ascendente; sem hora no fim (a mesma ordem do Cockpit)
        blocos.sort((a, b) => (a.hora || '99') .localeCompare(b.hora || '99'));
        return { iso, blocos };
      });
      const pr = (data?.promessa ?? null) as Record<string, unknown> | null;
      const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
      return {
        segunda, dias, fechadoEm: (data?.fechado_em as string) ?? null,
        promessa: pr ? { visitas: n(pr.visitas), fechamentos: n(pr.fechamentos), prospeccao: n(pr.prospeccao) } : null,
      };
    },
  });
}

/** Contas-alvo atribuídas a mim e ainda não trabalhadas: a munição da semana. */
export function useMunicao(ownerId: string | null, ativo: boolean) {
  return useQuery<number | null>({
    queryKey: ['municao', ownerId],
    enabled: ativo && !!ownerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('leads_prospeccao').select('id', { count: 'exact', head: true })
        .eq('responsavel_owner_id', ownerId!).eq('status', 'atribuido');
      if (error) return null;
      return count ?? null;
    },
  });
}
