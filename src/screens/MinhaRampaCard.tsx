import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

// "Minha rampa" — handoff "Acelerar Field Sales v2", tela 1d (31/10/26).
//
// Cartão novo no TOPO do Hoje, só para quem está na rampa de 60 dias: a fase, o que falta, o prazo,
// o padrinho e o dia 45. Some no dia 60 (ou quando a rua é aprovada). Nenhuma outra tela muda.
//
// O número é o MESMO da aba Rampa do cockpit do gestor: os dois leem rampa_quadro() (migração 0231),
// que mede no servidor o que tem fonte (demos, visitas à base, visitas por dia, prospecção antes da
// S4) e devolve o que o gestor contou e aprovou. A RLS e a função só entregam a linha da própria
// pessoa. Os prazos abaixo espelham GV2.RP do cockpit (template/cockpit.template.html): se mudar lá,
// muda aqui.

type Semana = { segunda: string; provadas: number; uteis: number };
type Fase = { aprovadaEm?: string | null; estendidaAte?: string | null; realizado?: Record<string, number> | null };
type Linha = {
  pessoa: string; nome: string; inicio: string; turma: string; dia: number;
  padrinhoNome?: string | null; padrinhoTelefone?: string | null;
  fases: Record<string, Fase>;
  decisao?: { decisao: 'avanca' | 'estende' | 'encerra'; novaData?: string | null } | null;
  medido: { demos: number; visitasBase: number; prospeccao: number; semanas: Semana[] };
};
type Quadro = { hoje: string; lidoEm: string; pessoas: Linha[] };

type Item = { k: string; rot: string; meta: number; auto?: 'demos' | 'visitasBase' | 'visitasDia'; sub?: string; falta: (n: number) => string };
const FASES: { k: string; curto: string; ate: number; itens: Item[] }[] = [
  { k: 's1', curto: 'S1', ate: 7, itens: [
    { k: 'reunioes', rot: 'Reuniões IS assistidas', meta: 8, falta: (n) => `${n} ${n === 1 ? 'reunião' : 'reuniões'} do Inside Sales` },
    { k: 'simulacoes', rot: 'Simulações aprovadas', meta: 3, sub: 'o gestor aprova na daily', falta: (n) => `${n} ${n === 1 ? 'simulação' : 'simulações'}` }] },
  { k: 's23', curto: 'S2–3', ate: 21, itens: [
    { k: 'demos', rot: 'Demos', meta: 15, auto: 'demos', falta: (n) => `${n} ${n === 1 ? 'demo' : 'demos'}` },
    { k: 'demoAprovada', rot: 'Demo aprovada', meta: 1, sub: 'o gestor assiste e aprova', falta: () => 'a demo aprovada' }] },
  { k: 's4', curto: 'S4', ate: 30, itens: [
    { k: 'visitasBase', rot: 'Visitas na base', meta: 12, auto: 'visitasBase', falta: (n) => `${n} ${n === 1 ? 'visita' : 'visitas'} na base` },
    { k: 'casos', rot: 'Casos documentados', meta: 3, sub: 'casos reais de cliente da base', falta: (n) => `${n} ${n === 1 ? 'caso' : 'casos'} documentados` }] },
  { k: 'rua', curto: 'Rua', ate: 60, itens: [
    { k: 'visitasDia', rot: 'Visitas por dia', meta: 6, auto: 'visitasDia', sub: '6 por dia por 2 semanas seguidas', falta: () => '6 visitas por dia por 2 semanas' }] },
];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const somaDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dataLonga = (iso: string) => `${DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${ddmm(iso)}`;
const soDigitos = (t: string) => String(t || '').replace(/\D/g, '');
const com55 = (t: string) => { const d = soDigitos(t); return d.length <= 11 ? `55${d}` : d; };
const prim = (nome?: string | null) => String(nome || '').split(' ')[0];

function visitasDia(x: Linha): number | null {
  const s = (x.medido.semanas || []).filter((w) => w.uteis > 0);
  const w = s[s.length - 1];
  return w ? Math.round((w.provadas / w.uteis) * 10) / 10 : null;
}
function valor(x: Linha, f: (typeof FASES)[number], it: Item): number {
  const real = x.fases[f.k]?.realizado;
  if (real && real[it.k] != null && (!it.auto || x.fases[f.k]?.aprovadaEm)) return Number(real[it.k]);
  if (it.auto === 'visitasDia') return visitasDia(x) ?? 0;
  if (it.auto) return Number(x.medido[it.auto]) || 0;
  return 0;
}
/** a fase atual sai das aprovações: a primeira ainda não aprovada (a mesma regra da aba Rampa) */
function faseAtual(x: Linha) {
  for (const f of FASES) {
    const ap = x.fases[f.k];
    if (ap?.aprovadaEm) continue;
    return { f, prazo: ap?.estendidaAte || somaDias(x.inicio, f.ate - 1), estendida: !!ap?.estendidaAte };
  }
  return null;
}

export function MinhaRampaCard() {
  const q = useQuery({
    queryKey: ['minha_rampa'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rampa_quadro');
      if (error) throw error;
      return data as unknown as Quadro;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const d = q.data;
  const x = d && Array.isArray(d.pessoas) ? d.pessoas[0] : null;
  if (!d || !x) return null;
  const atual = faseAtual(x);
  const estende = x.decisao?.decisao === 'estende' && x.decisao.novaData;
  /* some no dia 60 (ou antes, com a rua aprovada); a extensão do dia 45 segura o cartão até a nova data */
  if (!atual || (x.dia > 60 && !(estende && String(x.decisao?.novaData) >= d.hoje))) return null;
  const { f, prazo } = atual;
  const vencida = prazo < d.hoje;
  const faltas = f.itens.map((it) => ({ it, v: valor(x, f, it) })).filter(({ it, v }) => (it.auto === 'visitasDia' ? true : v < it.meta));
  const titulo = faltas.length
    ? `${f.curto} · faltam ${faltas.map(({ it, v }) => it.falta(Math.max(0, Math.ceil(it.meta - v)))).join(' e ')}`
    : `${f.curto} · bateu: falta a aprovação do gestor`;
  const principal = f.itens.find((it) => it.auto);
  const outros = f.itens.filter((it) => it !== principal);
  const s4ok = !!x.fases.s4?.aprovadaEm;
  const dia45 = estende ? String(x.decisao?.novaData) : somaDias(x.inicio, 44);
  const decidido = x.decisao && x.decisao.decisao !== 'estende';
  const tel = x.padrinhoTelefone && soDigitos(x.padrinhoTelefone).length >= 10 ? x.padrinhoTelefone : null;
  const lido = d.lidoEm ? new Date(d.lidoEm) : null;
  const lidoTxt = lido && !isNaN(lido.getTime())
    ? `${lido.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })} ${lido.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`
    : '';

  const barra = (it: Item) => {
    const v = valor(x, f, it);
    const pct = Math.max(0, Math.min(1, v / it.meta));
    const ok = v >= it.meta;
    return (
      <View style={s.linha} key={it.k}>
        <View style={s.linhaTopo}>
          <Text style={s.linhaRot}>{it.rot}</Text>
          <Text style={[s.linhaNum, { color: ok ? 'var(--tint-green-text)' : 'var(--tint-amber-text)' }]}>
            {it.auto === 'visitasDia' ? `${String(v).replace('.', ',')} por dia` : `${v} de ${it.meta}`}
          </Text>
        </View>
        {!!it.sub && <Text style={s.linhaSub}>{it.sub}</Text>}
        <View style={s.trilho} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: it.meta, now: Math.min(v, it.meta) }}>
          <View style={[s.enchimento, { width: `${pct * 100}%`, backgroundColor: ok ? 'var(--verde-acao)' : 'var(--tint-amber-text)' }]} />
          <View style={s.marcaMeta} />
        </View>
      </View>
    );
  };

  return (
    <View style={s.card} accessibilityLabel={`Minha rampa, dia ${x.dia} de 60`}>
      <Text style={s.kicker}>{`MINHA RAMPA · DIA ${Math.max(1, x.dia)} DE 60`}</Text>
      <Text style={s.titulo}>{titulo}</Text>
      <Text style={s.sub}>
        {`${vencida ? 'venceu' : 'prazo'} ${dataLonga(prazo)}${atual.estendida ? ' (estendido)' : ''} · ${x.padrinhoNome ? `padrinho ${prim(x.padrinhoNome)}` : 'sem padrinho'}`}
      </Text>
      {principal && barra(principal)}
      {outros.map((it) => {
        const v = valor(x, f, it);
        return (
          <View style={s.linha} key={it.k}>
            <View style={s.linhaTopo}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.linhaRot}>{it.rot}</Text>
                {!!it.sub && <Text style={s.linhaSub}>{it.sub}</Text>}
              </View>
              <Text style={[s.linhaNum, v >= it.meta && { color: 'var(--tint-green-text)' }]}>{`${v} de ${it.meta}`}</Text>
            </View>
          </View>
        );
      })}
      <View style={s.linha}>
        <View style={s.linhaTopo}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.linhaRot}>{estende ? 'Rampa estendida' : 'Dia 45'}</Text>
            <Text style={s.linhaSub}>{decidido ? { avanca: 'decidido: você avança', encerra: 'decisão registrada com o gestor', estende: '' }[x.decisao!.decisao] : 'decisão com o gestor'}</Text>
          </View>
          <Text style={s.linhaNum}>{dataLonga(dia45)}</Text>
        </View>
      </View>
      {!s4ok && (
        <View style={s.aviso}>
          <Text style={s.avisoTexto}>
            {x.medido.prospeccao > 0
              ? `Prospecção ainda não conta: as suas ${x.medido.prospeccao} visitas a lead ficam fora da rampa. Ela começa no dia 31, depois da S4 aprovada.`
              : 'Prospecção ainda não conta. Ela começa no dia 31, depois da S4 aprovada.'}
          </Text>
        </View>
      )}
      {tel && (
        <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL(`https://wa.me/${com55(tel)}`); }} style={s.botao}>
          <Text style={s.botaoTexto}>{`Chamar ${prim(x.padrinhoNome)}`}</Text>
        </Pressable>
      )}
      <Text style={s.rodape}>{`rampa_fases${lidoTxt ? ` · ${lidoTxt}` : ''}`}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'var(--surface)', borderRadius: 16, borderWidth: 1, borderColor: 'var(--border)',
    borderLeftWidth: 3, borderLeftColor: 'var(--info-text)', paddingVertical: 14, paddingHorizontal: 16, gap: 10,
  },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.72, color: 'var(--info-text)' },
  titulo: { fontSize: 17, fontWeight: '700', lineHeight: 22, color: 'var(--text)' },
  sub: { fontSize: 12.5, fontWeight: '500', color: 'var(--text-muted)', marginTop: -6 },
  linha: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  linhaRot: { fontSize: 13.5, fontWeight: '600', color: 'var(--text)' },
  linhaSub: { fontSize: 12.5, fontWeight: '500', color: 'var(--text-muted)' },
  linhaNum: { fontSize: 14, fontWeight: '700', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  trilho: { height: 6, borderRadius: 3, backgroundColor: 'var(--surface-3)', overflow: 'visible', position: 'relative' },
  enchimento: { height: 6, borderRadius: 3 },
  marcaMeta: { position: 'absolute', right: 0, top: -4, width: 2, height: 14, backgroundColor: 'var(--text)' },
  aviso: { borderRadius: 10, padding: 12, backgroundColor: 'var(--tint-amber)', borderWidth: 1, borderColor: 'var(--tint-amber-border)' },
  avisoTexto: { fontSize: 13, fontWeight: '600', lineHeight: 18, color: 'var(--tint-amber-text)' },
  botao: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--text)' },
  botaoTexto: { fontSize: 14, fontWeight: '700', color: 'var(--bg)' },
  rodape: { fontSize: 12, fontWeight: '500', color: 'var(--text-faint)' },
});
