// A SEMANA DO PLANEJAMENTO NO APP (Fase 0 das abas, 04/10/2026; docs/12 §1 e §11). A Agenda
// mostra a faixa da semana com o propósito de cada dia, lendo o MESMO planos_semanais.grade
// que o Planejamento do Cockpit grava. Só leitura: a RLS já deixa o dono ler o próprio plano
// (planos_semanais_select_por_owner); quem grava continua sendo o Cockpit e o espelho da rota.
import { supabase } from '../integrations/supabase/client';
import { colunaDoDia, semanaDoDia, type FaixaDoPlano } from './planoNoMapa';

/** Os propósitos que o Planejamento grava em cada faixa (`p`). */
export const PROPOSITOS: Record<string, string> = {
  rua: 'Rua', cobrar: 'Cobrar', relac: 'Relacionamento', follow: 'Follow-up', nova: 'Conta nova', funil: 'Funil',
};

export type DiaDoPlano = {
  iso: string;
  faixas: FaixaDoPlano[];
  /** O propósito que mais aparece no dia (empate: o primeiro da grade). null = dia vazio. */
  proposito: string | null;
  /** Quantas faixas têm hora marcada (o resto é "sem hora"). */
  comHora: number;
};

const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Seg–sex da grade, já normalizados. Puro: testado sem banco. */
export function resumoDaSemana(grade: unknown, segunda: string): DiaDoPlano[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const faixas = colunaDoDia(grade, i);
    const conta = new Map<string, number>();
    for (const f of faixas) if (f.p) conta.set(f.p, (conta.get(f.p) ?? 0) + 1);
    let proposito: string | null = null;
    let max = 0;
    for (const [p, n] of conta) if (n > max) { proposito = p; max = n; }
    return { iso: somaDias(segunda, i), faixas, proposito, comHora: faixas.filter((f) => !!f.hora).length };
  });
}

/** A semana do dia `diaIso` para o dono (owner do HubSpot). [] = sem plano nessa semana. */
export async function lerSemanaDoPlano(ownerHubspot: string, diaIso: string): Promise<DiaDoPlano[]> {
  const { segunda } = semanaDoDia(diaIso);
  const { data, error } = await supabase.from('planos_semanais').select('grade')
    .eq('owner_id', ownerHubspot).eq('data_segunda', segunda).limit(1);
  if (error) throw error;
  if (!data || !data[0]) return [];
  return resumoDaSemana((data[0] as { grade: unknown }).grade, segunda);
}
