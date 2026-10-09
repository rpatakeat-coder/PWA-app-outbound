// A temporada no app de campo (docs/10 §2.6 B, B', C — 04/10/2026).
//
// O executivo vê o PÓDIO e a PRÓPRIA posição, nunca a lista completa nem "último lugar":
// a RPC ranking_executivo só devolve isso (a lista inteira mora em ranking_gestor, que
// confere o papel no servidor). Os pontos saem do livro pontos_eventos — nada é calculado
// aqui. Textos sempre como próximo passo ("1 contrato te leva ao 4º"), vindos do servidor.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { Painel } from '../components/Painel';
import { IconCheckCircle, IconTrophy, IconTrendingUp, IconTrendingDown } from '../components/icons';

// 09/10/26 (0192): a SEMANA é o placar do bônus de R$ 250 (regra 'bonus': venda 100 · reunião com
// desfecho 25 · visita com prova 3, até 6 por dia), a mesma conta do cockpit do gestor. O MÊS segue
// a temporada (% da meta). Os campos novos são opcionais: o app antigo e o banco novo convivem.
export type Ranking = {
  periodo: 'semana' | 'mes'; de: string; ate: string; regra?: 'bonus'; premio?: number;
  podio: Array<{ pos: number; nome: string; avatar_url: string | null; pct: number | null; pts: number; vendas?: number; reunioes?: number; visitas?: number }>;
  eu: null | { pos: number; total: number; movimento: number | null; pct: number | null; pts: number; meta_pts: number | null;
    faltam: string | null; proximo: string | null; provadas: number; declaradas: number; demos: number; contratos: number; mrr: number;
    vendas?: number; reunioes?: number; visitas?: number; nao_pontuaram?: number };
  destaques: Array<null | { titulo: string; nome: string; valor: number; mrr?: number }>;
  meta_coletiva: { feitos: number; meta: number } | null;
  campeao: null | { semana: string; inicio: string; fim: string; fechada_em: string; nome: string; pct: number; pts: number; contratos: number;
    premio_texto: string | null; minha_pos: number | null; meu_pct: number | null };
  erro?: string;
};
type Conquista = { id: string; titulo: string; feito: boolean; progresso: number; alvo: number; unidade: string; medido?: boolean };

export function useRanking(periodo: 'semana' | 'mes', ativo = true) {
  return useQuery<Ranking | null>({
    queryKey: ['ranking_executivo', periodo],
    enabled: ativo,
    staleTime: 2 * 60_000,
    placeholderData: (a) => a,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ranking_executivo', { p_periodo: periodo });
      if (error) throw error;
      const r = data as Ranking;
      return r?.erro ? null : r;
    },
  });
}

function useConquistas(ativo: boolean) {
  return useQuery<Conquista[]>({
    queryKey: ['minhas_conquistas'],
    enabled: ativo,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('minhas_conquistas');
      if (error) throw error;
      return (data as Conquista[]) ?? [];
    },
  });
}

const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
const primeiro = (n: string) => n.split(/\s+/)[0];
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(Number(v))}%`);
const pl = (n: number | undefined, um: string, varios: string) => `${n ?? 0} ${(n ?? 0) === 1 ? um : varios}`;
/** "1 venda · 2 reuniões · 18 visitas": a conta de cada um no placar da semana */
export const contaDoPlacar = (x: { vendas?: number; reunioes?: number; visitas?: number }) =>
  `${pl(x.vendas, 'venda', 'vendas')} · ${pl(x.reunioes, 'reunião', 'reuniões')} · ${pl(x.visitas, 'visita', 'visitas')}`;
const mesNome = (iso: string) => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][new Date(iso).getUTCMonth()];
const ddmm = (iso: string) => { const d = new Date(new Date(iso).getTime() - 3 * 3600000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

export function Avatar({ nome, url, tamanho = 40 }: { nome: string; url?: string | null; tamanho?: number }) {
  if (url) {
    return React.createElement('img', { src: url, alt: '', style: { width: tamanho, height: tamanho, borderRadius: tamanho / 2, objectFit: 'cover' } });
  }
  return (
    <View style={{ width: tamanho, height: tamanho, borderRadius: tamanho / 2, backgroundColor: 'var(--surface-3)', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: tamanho * 0.38, fontWeight: '700', color: 'var(--text)' }}>{iniciais(nome)}</Text>
    </View>
  );
}

/** Selo "5º" com troféu, no topo de Tarefas (D15: só lá). 24 px de altura, 44 de alvo. */
export function SeloPosicao({ aoAbrir }: { aoAbrir: () => void }) {
  const q = useRanking('semana');
  const pos = q.data?.eu?.pos;
  if (!pos) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Você está em ${pos}º na semana. Abrir o ranking`} onPress={aoAbrir} hitSlop={10} style={s.seloAlvo}>
      <View style={s.selo}><IconTrophy width={12} height={12} fill="var(--text)" /><Text style={s.seloTexto}>{`${pos}º`}</Text></View>
    </Pressable>
  );
}

/** "Faltam 110 pts para o 4º" depois de uma visita provada (o livro sincroniza a cada 10 min). */
export function faltamDepoisDe(r: Ranking | null | undefined, ganhou: number): string | null {
  const eu = r?.eu;
  if (!eu || !eu.faltam) return null;
  const m = /Faltam (\d+) pts para o (\d+)º/.exec(eu.faltam);
  if (!m) return null;
  const resto = Number(m[1]) - ganhou;
  return resto > 0 ? `Faltam ${resto} pts para o ${m[2]}º na semana` : `Você deve passar para o ${m[2]}º`;
}

/**
 * Depois do check-in: se o SERVIDOR diz que a visita foi provada (GPS no raio ou foto —
 * a régua de visitas_com_prova), mostra "+20 · visita provada" com quanto falta para a
 * próxima posição. Visita declarada não gera toast nem ponto (docs/10 §2.6 D, aceite 7).
 */
export async function avisarSeVisitaProvada(clientId: string, mostrar: (texto: string) => void, buscarRanking: () => Promise<Ranking | null | undefined>) {
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const { data } = await supabase.rpc('visitas_com_prova', { p_de: hoje, p_ate: hoje });
    const daqui = ((data ?? []) as Array<{ client_id: string; visited_at: string; provada: boolean }>)
      .filter((v) => v.client_id === clientId).sort((a, b) => b.visited_at.localeCompare(a.visited_at))[0];
    if (!daqui?.provada) return;
    const r = await buscarRanking();
    if (r?.regra === 'bonus') {
      // o placar da semana é lido ao vivo (a visita já entrou): conta até 6 por dia e um restaurante
      // por dia — por isso o toast não promete +3, diz a regra
      const provadasHoje = ((data ?? []) as Array<{ provada: boolean }>).filter((v) => v.provada).length;
      const base = provadasHoje > 6 ? `Visita com prova · já são ${provadasHoje} hoje: o placar conta 6 por dia` : 'Visita com prova · conta no placar da semana';
      mostrar(r.eu?.faltam ? `${base} · ${r.eu.faltam.replace(/^Faltam/, 'faltam')}` : base);
      return;
    }
    const falta = faltamDepoisDe(r, 20);
    mostrar(falta ? `+20 · visita provada · ${falta}` : '+20 · visita provada');
  } catch { /* o toast é um extra: nunca derruba o check-in */ }
}

export default function FolhaRanking({ visivel, aoFechar }: { visivel: boolean; aoFechar: () => void }) {
  const [periodo, setPeriodo] = useState<'semana' | 'mes'>('semana');
  const q = useRanking(periodo, visivel);
  const c = useConquistas(visivel);
  const r = q.data;

  const topo = (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 8 }}>
      <Text style={s.titulo}>Ranking</Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        {(['semana', 'mes'] as const).map((p) => (
          <Pressable key={p} accessibilityRole="tab" accessibilityState={{ selected: periodo === p }} onPress={() => setPeriodo(p)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={[s.aba, periodo === p && s.abaAtiva]}>{p === 'semana' ? 'Semana' : 'Mês'}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  let corpo: React.ReactNode;
  if (q.isLoading && !r) corpo = <Text style={s.ajuda}>lendo…</Text>;
  else if (!r) corpo = <Text style={s.ajuda}>O ranking não está disponível para o seu usuário.</Text>;
  else {
    const eu = r.eu;
    const podio = r.podio;
    const ordemPodio = [podio[1], podio[0], podio[2]].filter(Boolean);
    const bonus = r.regra === 'bonus';
    corpo = (
      <View style={{ gap: 16 }}>
        <Text style={s.ajuda}>{periodo === 'semana'
          ? `Semana · ${ddmm(r.de)} a ${ddmm(new Date(new Date(r.ate).getTime() - 86400000).toISOString())} · ${bonus ? `fecha sexta às 23:59 · 1º leva R$ ${r.premio ?? 250}` : 'fecha segunda 9h'}`
          : `Mês · ${mesNome(r.de)}`}</Text>

        {bonus && !!r.campeao && (
          <View style={s.bloco}>
            <Text style={s.rotulo}>SEMANA PASSADA</Text>
            <Text style={s.forte}>{`${primeiro(r.campeao.nome)} levou ${r.campeao.premio_texto ?? 'o bônus'} · ${r.campeao.pts} pts`}</Text>
            {r.campeao.minha_pos != null && <Text style={s.ajuda}>{`Você ficou em ${r.campeao.minha_pos}º`}</Text>}
          </View>
        )}

        {!!r.meta_coletiva && r.meta_coletiva.meta > 0 && (
          <View style={s.bloco}>
            <Text style={s.rotulo}>{`TIME · ${mesNome(new Date().toISOString()).toUpperCase()}`}</Text>
            <Text style={s.forte}>{`${r.meta_coletiva.feitos} de ${r.meta_coletiva.meta} contratos`}</Text>
            <View style={s.barra}><View style={[s.barraCheia, { width: `${Math.min(100, (r.meta_coletiva.feitos / r.meta_coletiva.meta) * 100)}%` }]} /></View>
          </View>
        )}

        <View style={s.podio}>
          {ordemPodio.map((p) => (
            <View key={p.pos} style={[s.podioCol, p.pos === 1 && { marginTop: -12 }]}>
              <View>
                <Avatar nome={p.nome} url={p.avatar_url} tamanho={p.pos === 1 ? 64 : 52} />
                <View style={[s.podioNum, p.pos === 1 && { backgroundColor: 'var(--vermelho-acao)' }]}><Text style={s.podioNumTexto}>{p.pos}</Text></View>
              </View>
              <Text style={s.podioNome} numberOfLines={1}>{primeiro(p.nome)}</Text>
              {bonus ? <Text style={s.podioPct}>{`${p.pts} pts`}</Text> : <Text style={s.podioPct}>{pct(p.pct)}</Text>}
              {/* no bônus, o pódio fica com nome e pontos: a conta não cabe em 88 px e cortava; ela está no seu bloco */}
              {!bonus && <Text style={s.miuda}>{`${p.pts} pts`}</Text>}
            </View>
          ))}
        </View>

        {eu && (
          <View style={[s.bloco, { borderColor: 'var(--vermelho-acao)' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={s.posGrande}>{`${eu.pos}º`}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.forte}>{bonus ? `${eu.pts} pts · ${contaDoPlacar(eu)}` : `${pct(eu.pct)} da meta · ${eu.pts} de ${eu.meta_pts} pts`}</Text>
                {eu.movimento != null && eu.movimento !== 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {eu.movimento > 0 ? <IconTrendingUp width={14} height={14} fill="var(--verde-texto)" /> : <IconTrendingDown width={14} height={14} fill="var(--text-muted)" />}
                    <Text style={[s.miuda, { color: eu.movimento > 0 ? 'var(--verde-texto)' : 'var(--text-muted)' }]}>{eu.movimento > 0 ? `subiu ${eu.movimento}` : `desceu ${-eu.movimento}`}</Text>
                  </View>
                )}
              </View>
            </View>
            {!!eu.faltam && <Text style={s.forte}>{eu.faltam}</Text>}
            {!!eu.proximo && <Text style={s.ajuda}>{eu.proximo}</Text>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(bonus
                ? [['Vendas', `${eu.vendas ?? 0} × 100`], ['Reuniões com desfecho', `${eu.reunioes ?? 0} × 25`], ['Visitas com prova', `${eu.visitas ?? 0} × 3`]]
                : [['Visitas provadas', String(eu.provadas)], ['Demos realizadas', String(eu.demos)], ['Contratos', `${eu.contratos}${eu.mrr ? ` · R$ ${Math.round(eu.mrr)}` : ''}`]]).map(([rot, v]) => (
                <View key={rot} style={s.caixa}><Text style={s.miuda}>{rot}</Text><Text style={s.forte}>{v}</Text></View>
              ))}
            </View>
            {bonus && (eu.nao_pontuaram ?? 0) > 0 && <Text style={[s.miuda, { color: 'var(--text-faint)' }]}>{`${eu.nao_pontuaram} ${eu.nao_pontuaram === 1 ? 'visita não pontuou' : 'visitas não pontuaram'}: acima de 6 no dia`}</Text>}
            {!bonus && eu.declaradas > 0 && <Text style={[s.miuda, { color: 'var(--text-faint)' }]}>{`${eu.declaradas} ${eu.declaradas === 1 ? 'visita declarada' : 'visitas declaradas'}, sem GPS nem foto: não pontuam`}</Text>}
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {r.destaques.filter(Boolean).map((d) => (
            <View key={d!.titulo} style={s.destaque}>
              <Text style={s.rotulo}>{d!.titulo.toUpperCase()}</Text>
              <Text style={s.forte} numberOfLines={1}>{primeiro(d!.nome)}</Text>
              <Text style={s.ajuda}>{d!.titulo === 'Quem mais evoluiu' ? `+${d!.valor} p.p.` : d!.titulo === 'Mais contratos' ? `${d!.valor}${d!.mrr ? ` · R$ ${Math.round(d!.mrr)}` : ''}` : String(d!.valor)}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={{ gap: 8 }}>
          <Text style={s.rotulo}>SUAS CONQUISTAS</Text>
          {(c.data ?? []).map((k) => {
            const naoMedido = k.medido === false;
            return (
              <View key={k.id} style={[s.conquista, !k.feito && s.conquistaBloq]}>
                <IconCheckCircle width={22} height={22} fill={k.feito ? 'var(--verde-acao)' : 'var(--text-faint)'} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.forte, !k.feito && { color: 'var(--text-muted)' }]}>{k.titulo}</Text>
                  <Text style={s.miuda}>{k.feito ? 'conquistada' : naoMedido ? (k.id === 'quentes_4' ? 'sem quentes na carteira agora' : 'não medido ainda') : `${k.progresso} de ${k.alvo} ${k.unidade}`}</Text>
                </View>
              </View>
            );
          })}
          {c.isLoading && <Text style={s.ajuda}>lendo…</Text>}
        </View>

        <Text style={s.regras}>{bonus
          ? 'Placar da semana (o mesmo do cockpit): venda 100 (negócio em Fechado no HubSpot; Ag. Pagamento não conta) · reunião com desfecho registrado no app 25 (uma por restaurante na semana) · visita com prova 3 (GPS até 200 m; foto só quando o GPS não confirma; até 6 por dia). Desempate: vendas, reuniões, visitas. A semana fecha sexta às 23:59 e o ganhador aparece na segunda às 08:00; o pagamento é com o financeiro.'
          : 'Pontos: visita provada 20 (GPS ou foto) · demo realizada 50 (o negócio entrou em Demo/Proposta) · contrato 200. Visita declarada não pontua. O ranking é pela % da sua meta; desempate por contratos e MRR. A semana fecha segunda às 9h.'}</Text>
      </View>
    );
  }

  return (
    <Painel visivel={visivel} aoFechar={aoFechar} rotulo="Ranking" topo={topo}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>{corpo}</View>
    </Painel>
  );
}

const s = StyleSheet.create({
  titulo: { fontSize: 20, fontWeight: '700', color: 'var(--text)' },
  aba: { fontSize: 14, color: 'var(--text-muted)' },
  abaAtiva: { color: 'var(--text)', fontWeight: '700', textDecorationLine: 'underline', textDecorationColor: 'var(--vermelho-acao)' },
  ajuda: { fontSize: 13, color: 'var(--text-muted)' },
  miuda: { fontSize: 11, color: 'var(--text-muted)' },
  rotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: 'var(--text-muted)' },
  forte: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  bloco: { gap: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  barra: { height: 8, borderRadius: 4, backgroundColor: 'var(--border)' },
  barraCheia: { height: 8, borderRadius: 4, backgroundColor: 'var(--verde-acao)' },
  podio: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 18, paddingTop: 16 },
  podioCol: { alignItems: 'center', gap: 2, width: 88 },
  podioNum: { position: 'absolute', right: -4, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: 'var(--surface-3)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'var(--surface)' },
  podioNumTexto: { fontSize: 11, fontWeight: '700', color: 'var(--text)' },
  podioNome: { fontSize: 13, fontWeight: '700', color: 'var(--text)', marginTop: 6 },
  podioPct: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  posGrande: { fontSize: 32, fontWeight: '700', color: 'var(--text)' },
  caixa: { flex: 1, gap: 2, padding: 10, borderRadius: 10, backgroundColor: 'var(--surface-2)' },
  destaque: { width: 168, gap: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  conquista: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  conquistaBloq: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  regras: { fontSize: 11, color: 'var(--text-muted)', lineHeight: 16 },
  seloAlvo: { minHeight: 44, justifyContent: 'center' },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' },
  seloTexto: { fontSize: 12, fontWeight: '700', color: 'var(--text)' },
});
