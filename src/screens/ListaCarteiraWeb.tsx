// Lista do computador — "Na mesa: quais contas eu trabalho esta semana?" (handoff "Abas do app",
// 04/10/2026, prancha L1 e docs/12 §4).
//
// Abre em MINHA CARTEIRA: os negócios abertos do executivo, com os mesmos números da fila de
// Tarefas (a Edge fila-tarefas devolve a carteira junto: etapa ao vivo, dias e temperatura do
// snapshot do Cockpit, contatos e o próximo passo do HubSpot). Os outros recortes: Contas-alvo
// (as importadas e atribuídas a ele) e Área do mapa (a tabela de antes, que segue o mapa).
// Em lote: "Pôr no plano da semana" grava na rota do dia (field_route_stops), que o espelho 0150
// leva ao planos_semanais — o MESMO plano do Planejamento do Cockpit, e aparece na Agenda.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { Toast } from '../components/Toast';
import { IconCalendar, IconCheck, IconClose, IconDownload, useIconColors } from '../components/icons';
import { useLayout } from '../hooks/useLayout';
import { opcoesDaFila } from './FilaTarefasScreen';
import { porNoDia } from '../utils/paradaDoDia';
import { proximoDiaUtil } from '../../supabase/functions/_compartilhado/filaDoDinheiro';
import { ROTULO_ETAPA } from '../utils/fichaDeRua';
import { FUNIL8 } from '../utils/preparo';
import type { Client } from '../types/client';

export type LinhaCarteira = {
  dealId: string; clientId: string | null; negocio: string; etapaId: string; diasNaEtapa: number | null;
  temperatura: number | null; mrr: number | null; contato: string | null; bairro: string | null; temTelefone: boolean;
  ultimoContato: string | null; canalUltimo: string | null; contatos: number; proximoPasso: string | null;
};
type Recorte = 'carteira' | 'alvo' | 'area';
type Filtro = '' | 'sem' | 'regua' | 'q';

// Cores de etapa são DADO (as mesmas da fila de Tarefas).
const COR_ETAPA: Record<string, string> = {
  '1395880469': '#7A8494', '1396005401': '#E51A31', '1395880470': '#B07C1F', '1395880471': '#8E3B5C', '1395880472': '#2B3440', '1395880473': '#1E9E7B',
};
const CANAL: Record<string, string> = { visita: 'visita', ligacao: 'ligação', whatsapp: 'WhatsApp', reuniao: 'reunião', email: 'e-mail', contato: 'contato' };
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const fmtCurto = (iso: string) => { const d = new Date(iso); const b = new Date(d.getTime() - 3 * 3600000); return `${SEM[b.getUTCDay()]} ${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')}`; };
const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const diasDesde = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)) : null);
const tempLetra = (t: number | null) => (t == null ? null : t >= 70 ? 'Q' : t >= 55 ? 'M' : 'F');
const corTemp = (t: number | null) => (t == null ? 'var(--text-faint)' : t >= 70 ? 'var(--vermelho-acao)' : t >= 55 ? 'var(--tint-amber-text)' : 'var(--tint-blue-text)');
const mil = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

type Props = {
  ownerHubspot: string | null;
  sellerId: string | null;
  aoAbrirLead: (clientId: string) => void;
  /** A régua (SLA em dias) da etapa — a mesma do cartão e do Cockpit. null = sem régua. */
  reguaDe: (etapaId: string) => number | null;
  /** A tabela de antes (segue a área do mapa): o terceiro recorte. */
  tabelaDaArea: React.ReactNode;
};

export default function ListaCarteiraWeb({ ownerHubspot, sellerId, aoAbrirLead, reguaDe, tabelaDaArea }: Props) {
  const layout = useLayout();
  const largo = layout.largura >= 1500;
  const cores = useIconColors();
  const queryClient = useQueryClient();
  const [recorte, setRecorte] = useState<Recorte>('carteira');
  const [filtro, setFiltro] = useState<Filtro>('');
  const [etapa, setEtapa] = useState<string | null>(null);
  const [bairro, setBairro] = useState<string | null>(null);
  const [semToque, setSemToque] = useState<number | null>(null);
  const [aberto, setAberto] = useState<'etapa' | 'bairro' | 'toque' | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [gravando, setGravando] = useState(false);

  // A mesma consulta (e o mesmo cache) da fila de Tarefas, que já carrega na abertura do app.
  const fila = useQuery(opcoesDaFila());
  const carteira = ((fila.data as { carteira?: LinhaCarteira[] } | undefined)?.carteira ?? []) as LinhaCarteira[];
  const alvos = useQuery<Client[]>({
    queryKey: ['contas_alvo_lista', ownerHubspot],
    enabled: !!ownerHubspot,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*')
        .eq('vendedor_id_hubspot', ownerHubspot!).not('lead_prospeccao_id', 'is', null).is('id_hubspot', null)
        .or('conta_alvo_dismissed.is.null,conta_alvo_dismissed.eq.false').order('empresa').limit(1000);
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  // Contas-alvo na mesma forma das linhas da carteira (sem etapa nem toque: ainda não é negócio).
  const linhasAlvo: LinhaCarteira[] = useMemo(() => (alvos.data ?? []).map((c) => ({
    dealId: `alvo-${c.id}`, clientId: c.id, negocio: (c.empresa?.trim() || c.nome || 'Conta-alvo'), etapaId: 'alvo', diasNaEtapa: null,
    temperatura: null, mrr: null, contato: null, bairro: c.bairro ?? null, temTelefone: !!c.telefone,
    ultimoContato: c.visited_at ?? null, canalUltimo: c.visited_at ? 'visita' : null, contatos: 0, proximoPasso: null,
  })), [alvos.data]);

  const base = recorte === 'alvo' ? linhasAlvo : carteira;
  const passouRegua = (l: LinhaCarteira) => { const r = reguaDe(l.etapaId); return r != null && l.diasNaEtapa != null && l.diasNaEtapa > r; };
  const passa = (l: LinhaCarteira, f: Filtro) => !f || (f === 'sem' && !l.proximoPasso) || (f === 'regua' && passouRegua(l)) || (f === 'q' && (l.temperatura ?? 0) >= 70);
  const linhas = base.filter((l) => passa(l, filtro)
    && (!etapa || l.etapaId === etapa) && (!bairro || (l.bairro ?? '') === bairro)
    && (semToque == null || (diasDesde(l.ultimoContato) ?? 999) >= semToque));
  const bairros = [...new Set(base.map((l) => l.bairro).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // "Pôr no plano da semana": os próximos 5 dias úteis (amanhã em diante).
  const hoje = hojeBRT();
  const diasDoPlano = [1, 2, 3, 4, 5].map((n) => proximoDiaUtil(hoje, n));
  const porNoPlano = async (dia: string) => {
    if (!sellerId) return;
    const escolhidas = linhas.filter((l) => sel.has(l.dealId));
    const comPino = escolhidas.filter((l) => l.clientId);
    setGravando(true);
    let ok = 0;
    try {
      for (const l of comPino) { await porNoDia(sellerId, dia, l.clientId!); ok++; }
      void queryClient.invalidateQueries({ queryKey: ['field_route_stops'] });
      void queryClient.invalidateQueries({ queryKey: ['plano_semana_agenda'] });
      void queryClient.invalidateQueries({ queryKey: ['plano_semana_fila'] });
      const semPino = escolhidas.length - comPino.length;
      Toast.mostrar(`${ok} ${ok === 1 ? 'conta' : 'contas'} no plano de ${fmtCurto(`${dia}T15:00:00Z`)} · aparece no Planejamento do Cockpit e na sua Agenda${semPino ? ` · ${semPino} sem pino ficaram de fora` : ''}`, 'ok');
      setSel(new Set());
    } catch (e) {
      Toast.mostrar(`Gravei ${ok} de ${comPino.length}. ${String((e as Error)?.message ?? 'Tente de novo.')}`, 'erro');
    } finally {
      setGravando(false);
    }
  };

  const baixar = () => {
    if (typeof document === 'undefined') return;
    const cab = ['Restaurante', 'Bairro', 'Contato', 'Etapa', 'Dias na etapa', 'Último toque', 'Próximo passo', 'Temperatura', 'MRR'];
    const rows = linhas.map((l) => [l.negocio, l.bairro, l.contato, ROTULO_ETAPA[l.etapaId] ?? (l.etapaId === 'alvo' ? 'Conta-alvo' : ''), l.diasNaEtapa,
      l.ultimoContato ? fmtCurto(l.ultimoContato) : '', l.proximoPasso ? fmtCurto(l.proximoPasso) : 'sem próximo passo', l.temperatura, l.mrr]);
    const csv = [cab, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${recorte === 'alvo' ? 'contas-alvo' : 'carteira'}-${hoje}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const recortes: Array<[Recorte, string]> = [
    ['carteira', `Minha carteira${fila.data ? ` · ${carteira.length}` : ''}`],
    ['alvo', `Contas-alvo${alvos.data ? ` · ${linhasAlvo.length}` : ''}`],
    ['area', 'Área do mapa'],
  ];
  const chipsFiltro: Array<{ k: Filtro; r: string; n: number; dot?: string }> = [
    { k: 'sem', r: 'Sem próximo passo', n: base.filter((l) => passa(l, 'sem')).length },
    { k: 'regua', r: 'Passou da régua', n: base.filter((l) => passa(l, 'regua')).length },
    { k: 'q', r: 'Quentes', n: base.filter((l) => passa(l, 'q')).length, dot: 'var(--vermelho-acao)' },
  ];
  const cols = largo
    ? { ck: 28, rest: 1.4, et: 200, ult: 150, prox: 1, tmp: 70, mrr: 100, cont: 1 }
    : { ck: 28, rest: 1.4, et: 180, ult: 140, prox: 1, tmp: 64, mrr: 90, cont: 0 };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.pagina}>
        <View style={st.topo}>
          <View style={st.seg}>
            {recortes.map(([k, r]) => (
              <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: recorte === k }} style={[st.segItem, recorte === k && st.segAtivo]}
                onPress={() => { setRecorte(k); setSel(new Set()); setFiltro(''); setEtapa(null); setBairro(null); setSemToque(null); }}>
                <Text style={[st.segTexto, recorte !== k && { color: 'var(--text-muted)' }]}>{r}</Text>
              </Pressable>
            ))}
          </View>
          {recorte !== 'area' && (
            <Pressable accessibilityRole="button" accessibilityLabel="Baixar planilha" style={st.botaoContorno} onPress={baixar}>
              <IconDownload width={16} height={16} fill={cores.onSurface} /><Text style={st.botaoContornoTexto}>Baixar planilha</Text>
            </Pressable>
          )}
        </View>

        {recorte === 'area' ? tabelaDaArea : (
          <>
            <View style={st.filtros}>
              {chipsFiltro.map((c) => (
                <Pressable key={c.k} accessibilityRole="button" accessibilityState={{ selected: filtro === c.k }} style={[st.chip, filtro === c.k && st.chipAtivo]}
                  onPress={() => setFiltro(filtro === c.k ? '' : c.k)}>
                  {!!c.dot && <View style={[st.ponto, { backgroundColor: c.dot }]} />}
                  <Text style={st.chipTexto}>{c.r}</Text><Text style={st.chipN}>{c.n}</Text>
                </Pressable>
              ))}
              {([['etapa', etapa ? (ROTULO_ETAPA[etapa] ?? 'Etapa') : 'Etapa'], ['bairro', bairro ?? 'Bairro'], ['toque', semToque != null ? `${semToque}+ dias sem toque` : 'Dias sem toque']] as Array<['etapa' | 'bairro' | 'toque', string]>).map(([k, r]) => {
                const ativo = (k === 'etapa' && !!etapa) || (k === 'bairro' && !!bairro) || (k === 'toque' && semToque != null);
                return (
                  <Pressable key={k} accessibilityRole="button" accessibilityState={{ expanded: aberto === k }} style={[st.chip, ativo && st.chipAtivo]}
                    onPress={() => setAberto(aberto === k ? null : k)}>
                    <Text style={st.chipTexto}>{r}</Text>
                    {ativo && (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Tirar o filtro ${r}`} hitSlop={10}
                        onPress={() => { if (k === 'etapa') setEtapa(null); if (k === 'bairro') setBairro(null); if (k === 'toque') setSemToque(null); setAberto(null); }}>
                        <IconClose width={14} height={14} fill={cores.muted} />
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {aberto && (
              <View style={st.opcoes}>
                {(aberto === 'etapa' ? (FUNIL8.slice(0, 6) as readonly string[]).map((id) => ({ v: id, r: ROTULO_ETAPA[id], n: base.filter((l) => l.etapaId === id).length }))
                  : aberto === 'bairro' ? bairros.map((b) => ({ v: b, r: b, n: base.filter((l) => l.bairro === b).length }))
                    : [7, 14, 30].map((d) => ({ v: String(d), r: `${d}+ dias`, n: base.filter((l) => (diasDesde(l.ultimoContato) ?? 999) >= d).length }))
                ).map((o) => (
                  <Pressable key={o.v} accessibilityRole="button" style={st.opcao}
                    onPress={() => { if (aberto === 'etapa') setEtapa(o.v); if (aberto === 'bairro') setBairro(o.v); if (aberto === 'toque') setSemToque(Number(o.v)); setAberto(null); }}>
                    <Text style={st.chipTexto}>{o.r}</Text><Text style={st.chipN}>{o.n}</Text>
                  </Pressable>
                ))}
                {aberto === 'bairro' && bairros.length === 0 && <Text style={st.fraco}>Nenhum bairro nas contas deste recorte.</Text>}
              </View>
            )}

            <View style={st.tabela}>
              <View style={[st.linha, st.cabecalho]}>
                <View style={{ width: cols.ck }} />
                <Text style={[st.th, { flex: cols.rest }]}>Restaurante</Text>
                {largo && <Text style={[st.th, { flex: cols.cont }]}>Contato</Text>}
                <Text style={[st.th, { width: cols.et }]}>Etapa</Text>
                <Text style={[st.th, { width: cols.ult }]}>Último toque</Text>
                <Text style={[st.th, { flex: cols.prox }]}>Próximo passo</Text>
                <Text style={[st.th, { width: cols.tmp }]}>Temp.</Text>
                <Text style={[st.th, { width: cols.mrr, textAlign: 'right' }]}>MRR</Text>
              </View>
              {(fila.isLoading && recorte === 'carteira') || (alvos.isLoading && recorte === 'alvo') ? (
                <Text style={st.vazio}>Carregando sua carteira…</Text>
              ) : linhas.length === 0 ? (
                <View style={{ padding: 24, gap: 8, alignItems: 'flex-start' }}>
                  <Text style={st.vazioTitulo}>{base.length ? 'Nenhum negócio com estes filtros' : recorte === 'alvo' ? 'Nenhuma conta-alvo atribuída a você' : 'Sua carteira está vazia'}</Text>
                  <Text style={st.fraco}>{base.length ? 'Tire um filtro ou troque para Contas-alvo.' : (fila.data as { semMedicao?: string } | undefined)?.semMedicao ?? 'Os negócios abertos no HubSpot em seu nome aparecem aqui.'}</Text>
                  {base.length > 0 && (
                    <Pressable accessibilityRole="button" style={st.botaoContorno} onPress={() => { setFiltro(''); setEtapa(null); setBairro(null); setSemToque(null); }}>
                      <Text style={st.botaoContornoTexto}>Limpar filtros</Text>
                    </Pressable>
                  )}
                </View>
              ) : linhas.map((l) => {
                const on = sel.has(l.dealId);
                const r = reguaDe(l.etapaId);
                const corRegua = l.diasNaEtapa == null || r == null ? 'var(--text-muted)' : l.diasNaEtapa > r ? 'var(--vermelho-texto)' : l.diasNaEtapa > r * 0.7 ? 'var(--ambar-texto)' : 'var(--tint-green-text)';
                const letra = tempLetra(l.temperatura);
                return (
                  <Pressable key={l.dealId} accessibilityRole="button" style={[st.linha, on && st.linhaSel]}
                    onPress={() => l.clientId && aoAbrirLead(l.clientId)}>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Selecionar ${l.negocio}`}
                      style={[st.check, on && st.checkOn, { width: cols.ck }]} hitSlop={8}
                      onPress={() => setSel((s) => { const n = new Set(s); if (n.has(l.dealId)) n.delete(l.dealId); else n.add(l.dealId); return n; })}>
                      {on && <IconCheck width={14} height={14} fill="#FFFFFF" />}
                    </Pressable>
                    <View style={{ flex: cols.rest, minWidth: 0 }}>
                      <Text style={st.nome} numberOfLines={1}>{l.negocio}</Text>
                      <Text style={st.fraco} numberOfLines={1}>{[l.bairro, !largo ? l.contato : null].filter(Boolean).join(' · ') || '—'}</Text>
                    </View>
                    {largo && <Text style={[st.td, { flex: cols.cont }]} numberOfLines={1}>{l.contato ?? 'sem contato'}</Text>}
                    <View style={{ width: cols.et, gap: 2 }}>
                      {l.etapaId === 'alvo' ? <Text style={st.td}>Conta-alvo</Text> : (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={[st.ponto, { backgroundColor: COR_ETAPA[l.etapaId] ?? 'var(--text-faint)' }]} />
                            <Text style={st.td} numberOfLines={1}>{ROTULO_ETAPA[l.etapaId] ?? 'Etapa'}</Text>
                          </View>
                          {l.diasNaEtapa != null && <Text style={[st.mini, { color: corRegua }]}>{`há ${l.diasNaEtapa} ${l.diasNaEtapa === 1 ? 'dia' : 'dias'}${r != null && l.diasNaEtapa > r ? ` · régua ${r}` : ''}`}</Text>}
                        </>
                      )}
                    </View>
                    <Text style={[st.td, { width: cols.ult }]} numberOfLines={2}>{l.ultimoContato ? `${CANAL[l.canalUltimo ?? ''] ?? 'contato'} ${fmtCurto(l.ultimoContato)}` : 'nenhum'}</Text>
                    {(() => {
                      // próximo passo vencido em vermelho ("venceu"), faltando em âmbar (docs/12 §4)
                      const venceu = !!l.proximoPasso && l.proximoPasso.slice(0, 10) < hoje;
                      return (
                        <Text style={[st.td, { flex: cols.prox }, !l.proximoPasso && l.etapaId !== 'alvo' && { color: 'var(--ambar-texto)' }, venceu && { color: 'var(--vermelho-texto)', fontWeight: '600' }]} numberOfLines={1}>
                          {l.proximoPasso ? `${venceu ? 'venceu ' : ''}${fmtCurto(l.proximoPasso)}` : l.etapaId === 'alvo' ? '—' : 'sem próximo passo'}
                        </Text>
                      );
                    })()}
                    <View style={{ width: cols.tmp, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {letra ? <><View style={[st.ponto, { backgroundColor: corTemp(l.temperatura) }]} /><Text style={st.td}>{`${letra} ${Math.round(l.temperatura!)}`}</Text></> : <Text style={st.fraco}>—</Text>}
                    </View>
                    <Text style={[st.td, { width: cols.mrr, textAlign: 'right' }, !l.mrr && { color: 'var(--text-faint)' }]}>{l.mrr ? mil(l.mrr) : 'sem valor'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {sel.size > 0 && recorte !== 'area' && (
        <View style={st.lote}>
          <Text style={st.loteTexto}>{`${sel.size} ${sel.size === 1 ? 'selecionada' : 'selecionadas'} · Pôr no plano da semana:`}</Text>
          {diasDoPlano.map((d) => (
            <Pressable key={d} accessibilityRole="button" disabled={gravando} style={[st.loteDia, gravando && { opacity: 0.5 }]} onPress={() => { void porNoPlano(d); }}>
              <IconCalendar width={14} height={14} fill="#111418" />
              <Text style={st.loteDiaTexto}>{`${SEM[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8)}`}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar seleção" style={st.loteLimpar} onPress={() => setSel(new Set())}>
            <IconClose width={18} height={18} fill="#FFFFFF" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  pagina: { padding: 24, paddingBottom: 96, gap: 14 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: 'var(--surface-2)' },
  segItem: { minHeight: 40, paddingHorizontal: 16, borderRadius: 11, justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  segAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)' },
  segTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  botaoContorno: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  botaoContornoTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipAtivo: { borderColor: 'var(--vermelho-acao)', backgroundColor: 'var(--tint-red)' },
  chipTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  chipN: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)' },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 14, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  opcao: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'var(--surface-2)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  tabela: { borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', overflow: 'hidden' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  linhaSel: { backgroundColor: 'var(--tint-red)' },
  cabecalho: { minHeight: 40, borderTopWidth: 0, backgroundColor: 'var(--surface-2)' },
  th: { fontSize: 12, fontWeight: '700', color: 'var(--text-faint)', letterSpacing: 0.4 },
  td: { fontSize: 13, color: 'var(--text)' },
  mini: { fontSize: 12, fontWeight: '600' },
  nome: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  fraco: { fontSize: 12, color: 'var(--text-muted)' },
  check: { height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', maxWidth: 22 },
  checkOn: { backgroundColor: 'var(--vermelho-acao)', borderColor: 'var(--vermelho-acao)' },
  vazio: { padding: 24, fontSize: 14, color: 'var(--text-muted)' },
  vazioTitulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  lote: { position: 'absolute', left: 24, right: 24, bottom: 20, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 12, borderRadius: 16, backgroundColor: '#111418' },
  loteTexto: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginRight: 4 },
  loteDia: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6 },
  loteDiaTexto: { fontSize: 14, fontWeight: '700', color: '#111418' },
  loteLimpar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
});
