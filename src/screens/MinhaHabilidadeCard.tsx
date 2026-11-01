import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { TAXAS, daPessoa, doTime, fmt, mesNome, qualMostrar, veredito, type QuadroHab, type TaxaK } from '../utils/habilidadeDoMes';

// "Meu desempenho" ganha a habilidade do mês — handoff "Acelerar Field Sales v2", tela 3d (31/10/26).
//
// Cartão novo no TOPO da aba Eu: a minha habilidade (antes, meta e agora), quando o gestor combinou
// uma no 1:1, e as minhas 4 taxas contra a média do time. As contagens que já existiam continuam
// abaixo, iguais. A função habilidade_quadro() (0233) só entrega a linha da própria pessoa e a soma
// do time; quem está em rampa não tem habilidade do mês (o cartão dele é o Minha rampa).

const prim = (nome?: string | null) => String(nome || '').split(' ')[0];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const Mes = (iso: string) => mesNome(iso).replace(/^./, (c) => c.toUpperCase());

export function MinhaHabilidadeCard({ enabled }: { enabled: boolean }) {
  const q = useQuery({
    queryKey: ['minha_habilidade'],
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const [{ data, error }, sessao] = await Promise.all([supabase.rpc('habilidade_quadro'), supabase.auth.getSession()]);
      if (error) throw error;
      return { d: data as unknown as QuadroHab & { erro?: string }, eu: sessao.data.session?.user?.id ?? null };
    },
  });
  const d = q.data?.d;
  if (!d || d.erro || !Array.isArray(d.pessoas)) return null;
  const x = d.pessoas.find((p) => p.pessoa === q.data?.eu) ?? null;
  if (!x || x.emRampa) return null;
  const h = x.habilidade;
  const qual = qualMostrar(d, x);
  const lido = d.lidoEm ? new Date(d.lidoEm) : null;
  const lidoTxt = lido && !isNaN(lido.getTime())
    ? `${lido.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })} ${lido.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`
    : '';

  const agoraH = h ? daPessoa(d, x, h.taxa, 'atual') : null;
  const ver = h && agoraH ? veredito(h, agoraH.v) : null;
  const corVer = ver === 'melhorou' ? 'var(--tint-green-text)' : ver ? 'var(--tint-amber-text)' : 'var(--text-muted)';

  const linha = (k: TaxaK) => {
    const t = TAXAS.find((y) => y.k === k)!;
    const eu = daPessoa(d, x, k, qual), tm = doTime(d, k, qual);
    const minha = h?.taxa === k && qual === 'atual';
    const bateu = minha && eu.v != null && eu.v >= Number(h!.meta);
    const max = t.pct ? 100 : Math.max(1, (eu.v ?? 0), (tm.v ?? 0)) * 1.4;
    const w = eu.v == null ? 0 : Math.max(0, Math.min(100, Math.round((eu.v / max) * 100)));
    const tick = tm.v == null ? null : Math.max(0, Math.min(100, Math.round((tm.v / max) * 100)));
    const sub = k === 'volume' ? `visitas/semana · time ${fmt(k, tm.v)}`
      : k === 'fechar' && eu.v != null ? `${eu.n} de ${eu.den} · time ${fmt(k, tm.v)}`
        : `time ${fmt(k, tm.v)}`;
    return (
      <View style={s.linha} key={k}>
        <View style={s.linhaTopo}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.linhaRot}>{t.t}</Text>
            <Text style={s.linhaSub}>{sub}</Text>
          </View>
          <Text style={[s.linhaNum, minha && { color: bateu ? 'var(--tint-green-text)' : 'var(--tint-amber-text)' }]}>{fmt(k, eu.v)}</Text>
        </View>
        <View style={s.trilho} accessibilityRole="progressbar" accessibilityLabel={`${t.t}: ${fmt(k, eu.v)}, time ${fmt(k, tm.v)}`}>
          <View style={[s.enchimento, { width: `${w}%`, backgroundColor: minha ? (bateu ? 'var(--verde-acao)' : 'var(--tint-amber-text)') : 'var(--text-faint)' }]} />
          {tick != null && <View style={[s.traco, { left: `${tick}%` }]} />}
        </View>
      </View>
    );
  };

  return (
    <>
      {h && (
        <View style={[s.card, s.cardHab]} accessibilityLabel={`Minha habilidade do mês: ${TAXAS.find((y) => y.k === h.taxa)!.t}`}>
          <Text style={s.kicker}>MINHA HABILIDADE DO MÊS</Text>
          <Text style={s.titulo}>{TAXAS.find((y) => y.k === h.taxa)!.t}</Text>
          <Text style={s.sub}>{`combinada${h.combinadaPor ? ` com ${prim(h.combinadaPor)}` : ''} em ${ddmm(h.combinadaEm)}${h.comoTreinar ? ` · treino: ${h.comoTreinar}` : ''}`}</Text>
          <View style={s.trio}>
            {[
              { l: Mes(d.anterior), v: fmt(h.taxa, h.antes == null ? null : Number(h.antes)), c: 'var(--text-muted)' },
              { l: 'Meta', v: fmt(h.taxa, Number(h.meta)), c: 'var(--text)' },
              { l: 'Agora', v: fmt(h.taxa, agoraH?.v ?? null), c: corVer },
            ].map((i) => (
              <View key={i.l} style={s.trioItem}>
                <Text style={s.trioRot}>{i.l}</Text>
                <Text style={[s.trioVal, { color: i.c }]}>{i.v}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <View style={s.card}>
        <Text style={s.titulo}>Minhas taxas contra o time</Text>
        <Text style={s.sub}>{qual === 'atual' ? `${mesNome(d.mes)} · traço = média do time no mês` : `${mesNome(d.anterior)} fechado · traço = média do time · ${mesNome(d.mes)} começa no primeiro dia útil`}</Text>
        {TAXAS.map((t) => linha(t.k))}
        <Text style={s.rodape}>{`fichas_de_rua + HubSpot${lidoTxt ? ` · ${lidoTxt}` : ''}`}</Text>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: 'var(--surface)', borderRadius: 16, borderWidth: 1, borderColor: 'var(--border)', paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  cardHab: { borderLeftWidth: 3, borderLeftColor: 'var(--info-text)' },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.72, color: 'var(--info-text)' },
  titulo: { fontSize: 17, fontWeight: '700', lineHeight: 22, color: 'var(--text)' },
  sub: { fontSize: 12.5, fontWeight: '500', color: 'var(--text-muted)', marginTop: -6 },
  trio: { flexDirection: 'row', gap: 8 },
  trioItem: { flex: 1, minWidth: 0, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', gap: 2 },
  trioRot: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  trioVal: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  linha: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  linhaRot: { fontSize: 13.5, fontWeight: '600', color: 'var(--text)' },
  linhaSub: { fontSize: 12.5, fontWeight: '500', color: 'var(--text-muted)' },
  linhaNum: { fontSize: 14, fontWeight: '700', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  trilho: { height: 6, borderRadius: 3, backgroundColor: 'var(--surface-3)', overflow: 'visible', position: 'relative' },
  enchimento: { height: 6, borderRadius: 3 },
  traco: { position: 'absolute', top: -4, width: 2, height: 14, marginLeft: -1, backgroundColor: 'var(--text)' },
  rodape: { fontSize: 12, fontWeight: '500', color: 'var(--text-faint)' },
});
