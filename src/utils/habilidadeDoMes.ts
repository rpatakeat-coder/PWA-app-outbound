// A habilidade do mês no app (handoff "Acelerar Field Sales v2", tela 3d, 31/10/26).
//
// A conta é a MESMA do cockpit do gestor (GV2.HB em template/cockpit.template.html): os dois leem
// habilidade_quadro() (migração 0233), que devolve as contagens de cada dia do mês anterior e do
// corrente e a soma do time sem quem está em rampa. Dias úteis = seg a sex nos dois lados. Se a
// regra mudar lá, muda aqui.
//   dono    Sair com o dono   fichas com quem decide ÷ fichas
//   demo    Virar demo        demos ÷ visitas com prova
//   fechar  Fechar            clientes ÷ demos
//   volume  Volume            visitas com prova por semana

export type TaxaK = 'dono' | 'demo' | 'fechar' | 'volume';
export type Soma = { p: number; f: number; o: number; m: number; c: number };
export type DiaHab = Soma & { d: string };
export type Habilidade = { taxa: TaxaK; antes: number | null; meta: number; comoTreinar?: string | null; combinadaEm: string; combinadaPor?: string | null };
export type LinhaHab = { pessoa: string; nome: string; emRampa: boolean; dias: DiaHab[]; habilidade: Habilidade | null };
export type QuadroHab = {
  mes: string; anterior: string; ate: string; hoje: string; lidoEm?: string;
  time: { anterior: Soma & { pessoas: number }; atual: Soma & { pessoas: number } };
  pessoas: LinhaHab[];
};
export type Valor = { v: number | null; n: number; den: number };

export const TAXAS: { k: TaxaK; t: string; pct: boolean }[] = [
  { k: 'dono', t: 'Sair com o dono', pct: true },
  { k: 'demo', t: 'Virar demo', pct: true },
  { k: 'fechar', t: 'Fechar', pct: true },
  { k: 'volume', t: 'Volume', pct: false },
];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const somaDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mesNome = (iso: string) => MESES[Number(String(iso).slice(5, 7)) - 1];

export function uteis(de: string, ate: string): number {
  let n = 0;
  for (let d = de; d <= ate; d = somaDias(d, 1)) { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); if (w > 0 && w < 6) n++; }
  return n;
}
export function janela(q: QuadroHab, qual: 'anterior' | 'atual') {
  return qual === 'anterior' ? { de: q.anterior, ate: somaDias(q.mes, -1) } : { de: q.mes, ate: q.ate };
}
export function somar(dias: DiaHab[], de: string, ate: string): Soma {
  const s: Soma = { p: 0, f: 0, o: 0, m: 0, c: 0 };
  for (const y of dias || []) if (y.d >= de && y.d <= ate) { s.p += Number(y.p) || 0; s.f += Number(y.f) || 0; s.o += Number(y.o) || 0; s.m += Number(y.m) || 0; s.c += Number(y.c) || 0; }
  return s;
}
export function valor(k: TaxaK, s: Soma, diasUteis: number, pessoas = 1): Valor {
  const pc = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  if (k === 'dono') return { v: pc(s.o, s.f), n: s.o, den: s.f };
  if (k === 'demo') return { v: pc(s.m, s.p), n: s.m, den: s.p };
  if (k === 'fechar') { const c = Math.max(0, s.c); return { v: pc(c, s.m), n: c, den: s.m }; }
  const sem = diasUteis / 5;
  return { v: sem > 0 && pessoas > 0 ? Math.round(s.p / pessoas / sem) : null, n: s.p, den: diasUteis };
}
export function daPessoa(q: QuadroHab, x: LinhaHab, k: TaxaK, qual: 'anterior' | 'atual'): Valor {
  const J = janela(q, qual);
  return valor(k, somar(x.dias, J.de, J.ate), uteis(J.de, J.ate));
}
export function doTime(q: QuadroHab, k: TaxaK, qual: 'anterior' | 'atual'): Valor {
  const J = janela(q, qual), t = q.time[qual];
  return valor(k, t, uteis(J.de, J.ate), Number(t.pessoas) || 0);
}
export const fmt = (k: TaxaK, v: number | null) => (v == null ? '—' : TAXAS.find((t) => t.k === k)!.pct ? `${v}%` : String(v));
/** bateu a meta = melhorou; passou do antes = subiu, não bateu; senão, não melhorou */
export function veredito(h: Habilidade, agora: number | null): 'melhorou' | 'subiu' | 'nao_melhorou' | null {
  if (agora == null) return null;
  if (agora >= Number(h.meta)) return 'melhorou';
  if (h.antes != null && agora > Number(h.antes)) return 'subiu';
  return 'nao_melhorou';
}
/** o mês que as taxas mostram: o corrente; antes da primeira visita do mês, o anterior inteiro */
export function qualMostrar(q: QuadroHab, x: LinhaHab): 'anterior' | 'atual' {
  const s = somar(x.dias, q.mes, q.ate), t = q.time.atual;
  return s.p + s.f + s.m > 0 || t.p + t.f + t.m > 0 ? 'atual' : 'anterior';
}
