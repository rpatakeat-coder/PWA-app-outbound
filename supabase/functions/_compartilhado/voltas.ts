// VOLTAS NO AVISO DAS 8H (13/11/26).
//
// Medido em 13/11: de 180 voltas marcadas na ficha de rua e já vencidas, 134 entraram no plano e só 50
// foram feitas. O aviso da manhã dizia "6 paradas hoje · 12 leads sem passo": contagem, que não move
// ninguém. Desde 19/10 a regra dos avisos é nomear UM negócio e UM verbo. Este módulo troca o título do
// aviso das 8h pelo restaurante da volta, quando há volta para hoje ou volta vencida.
//
// Módulo PURO: recebe o que public.voltas_de(pessoa) devolve e o aviso que já existia. Sem volta, devolve
// null e o aviso de sempre segue como está.

export type Volta = { deal: string; nome: string; bairro: string | null; visitou: string; dia: string; horario_dono: string | null };
export type VoltasDe = { hoje: string; de_hoje: Volta[]; vencidas: Volta[]; n_vencidas: number };
export type AvisoBase = { titulo: string; texto: string };

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dia = (iso: string) => String(iso || '').slice(0, 10);
const diaCurto = (iso: string) => DIAS[new Date(dia(iso) + 'T12:00:00Z').getUTCDay()] + ' ' + dia(iso).slice(8, 10) + '/' + dia(iso).slice(5, 7);
const juntar = (xs: Array<string | null | undefined | false>) => xs.filter(Boolean).join(' · ');
const curto = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** '10h_11h30' vira '10h–11h30'; texto livre ("Só sábado") fica como foi escrito. */
export function horarioDoDono(h: string | null | undefined): string | null {
  const t = String(h ?? '').trim();
  if (!t) return null;
  return /^\d{1,2}h\d{0,2}_\d{1,2}h\d{0,2}$/.test(t) ? t.replace('_', '–') : t;
}

/**
 * O aviso das 8h com a volta no título. Volta de hoje vence a vencida: é a que ainda dá para cumprir
 * no dia marcado. Entre as vencidas, a mais recente primeiro (a mais fácil de recuperar).
 * O texto de baixo guarda o que o aviso de antes dizia (paradas e leads sem passo), para nada sumir.
 */
export function avisoDasVoltas(v: VoltasDe | null | undefined, base: AvisoBase): AvisoBase | null {
  if (!v) return null;
  const deHoje = v.de_hoje || [], venc = v.vencidas || [];
  if (deHoje.length) {
    const p = deHoje[0], h = horarioDoDono(p.horario_dono);
    return {
      titulo: curto('Voltar hoje: ' + p.nome, 60) + (deHoje.length > 1 ? ' e mais ' + (deHoje.length - 1) : ''),
      texto: juntar([h ? 'o dono está ' + h : null, 'você marcou na visita de ' + diaCurto(p.visitou), base.titulo]),
    };
  }
  if (venc.length) {
    const p = venc[0], n = Math.max(v.n_vencidas || 0, venc.length), h = horarioDoDono(p.horario_dono);
    return {
      titulo: curto(p.nome, 44) + ': a volta venceu ' + diaCurto(p.dia) + (n > 1 ? ' · +' + (n - 1) : ''),
      texto: juntar(['ponha no plano de hoje', h ? 'o dono está ' + h : null, base.titulo]),
    };
  }
  return null;
}
