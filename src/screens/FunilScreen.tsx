// Aba Funil (Um app só, PR 3 · docs/11 §1 e U7, prancha "Funil · celular", 04/10/2026).
//
// Celular: lista agrupada por etapa — MRR da etapa, régua e barra de saúde (quantos estão
// dentro da régua); cartão com o próximo passo, os dias na etapa e o Avançar de 44 px.
// Computador (≥ 1024): o kanban do Cockpit, embutido e sem mudança (docs-v6/09).
//
// Os dados vêm da Edge fila-tarefas (op funil): a carteira do robô com a ETAPA conferida ao
// vivo no HubSpot — o que mudou de etapa agora aparece certo. Mudar etapa é o MESMO fluxo do
// cartão do lead (MudarEtapaNovo, as mesmas travas no servidor). Ag. Pagamento não tem
// Avançar: a entrada lá já disparou a cobrança.
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { useLayout } from '../hooks/useLayout';
import { QuadroEmbutido } from '../components/CockpitEmbutido';
import { IconArrowFoward, IconCall, IconPlus, useIconColors } from '../components/icons';
import { ETAPAS_DO_FUNIL, proximaEtapa } from '../utils/umApp';

export type NegocioDoFunil = {
  dealId: string; nome: string; etapaId: string; mrr: number | null; temperatura: number | null;
  diasNaEtapa: number | null; regua: number | null; passouRegua: boolean;
  proximoPasso: { assunto: string; dia: string | null } | null;
  clientId: string | null; telefone: string | null;
};
type RespostaFunil = { negocios: NegocioDoFunil[]; hoje: string; snapshotLidoEm: string | null; semMedicao?: string };

export { ETAPAS_DO_FUNIL, proximaEtapa } from '../utils/umApp';
const AG_PAGAMENTO = '1395880473';

export async function buscarFunil(): Promise<RespostaFunil> {
  const { data, error } = await supabase.functions.invoke('fila-tarefas', { body: { op: 'funil' } });
  if (error) throw error;
  const r = data as RespostaFunil & { itens?: unknown };
  return { negocios: r.negocios ?? [], hoje: r.hoje, snapshotLidoEm: r.snapshotLidoEm ?? null, semMedicao: r.semMedicao };
}

const reais = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const corDaTemp = (t: number | null) => (t == null ? 'var(--text-faint)' : t >= 70 ? 'var(--vermelho-acao)' : t >= 55 ? 'var(--tint-amber-text)' : 'var(--tint-blue-text)');
const diaCurto = (iso: string, hoje: string) => {
  if (iso === hoje) return 'hoje';
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

type Filtro = 'todos' | 'regua' | 'semdata';

export default function FunilScreen({ aoAbrirLead, aoMudarEtapa, aoNovoNegocio, aoProposta, kanbanNoComputador = true }: {
  aoAbrirLead: (clientId: string) => void;
  /** o kanban do Cockpit é o Meu funil do EXECUTIVO; o gestor no app fica com a lista */
  kanbanNoComputador?: boolean;
  aoProposta?: (n: NegocioDoFunil) => void;
  aoMudarEtapa?: (n: NegocioDoFunil, destino: string) => void;
  aoNovoNegocio?: () => void;
}) {
  const layout = useLayout();
  const cores = useIconColors();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const embutido = layout.ehDesktop && kanbanNoComputador;
  const q = useQuery<RespostaFunil>({ queryKey: ['funil'], staleTime: 60_000, queryFn: buscarFunil, enabled: !embutido });

  const negocios = q.data?.negocios ?? [];
  const passa = (n: NegocioDoFunil, f: Filtro) => f === 'todos' || (f === 'regua' && n.passouRegua) || (f === 'semdata' && !n.proximoPasso?.dia);
  const visiveis = useMemo(() => negocios.filter((n) => passa(n, filtro)), [negocios, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const passaram = negocios.filter((n) => n.passouRegua).length;
  const semData = negocios.filter((n) => !n.proximoPasso?.dia).length;

  if (embutido) {
    // computador: o kanban do Cockpit, igual (docs-v6/09)
    return <View style={{ flex: 1 }}><QuadroEmbutido aba="funil" /></View>;
  }

  return (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo}
      refreshControl={<RefreshControl refreshing={q.isFetching && !!q.data} onRefresh={() => q.refetch()} />}>
      <View style={s.resumoLinha}>
        <Text style={s.resumo}>
          {q.data ? `${negocios.length} ${negocios.length === 1 ? 'negócio aberto' : 'negócios abertos'} · ${passaram} ${passaram === 1 ? 'passou' : 'passaram'} da régua · ${semData} sem próximo passo` : 'Lendo seus negócios…'}
        </Text>
        {aoNovoNegocio && (
          <Pressable accessibilityRole="button" accessibilityLabel="Novo negócio" onPress={aoNovoNegocio} style={s.novo}>
            <IconPlus width={18} height={18} fill={cores.onSurface} />
            <Text style={s.novoTexto}>Novo negócio</Text>
          </Pressable>
        )}
      </View>

      <View style={s.filtros}>
        {([['todos', 'Todos', 0.8], ['regua', 'Passou da régua', 1.5], ['semdata', 'Sem data', 1]] as Array<[Filtro, string, number]>).map(([f, r, peso]) => (
          <Pressable key={f} accessibilityRole="tab" accessibilityState={{ selected: filtro === f }} onPress={() => setFiltro(f)} style={[s.filtro, { flex: peso }, filtro === f && s.filtroAtivo]}>
            <Text style={[s.filtroTexto, filtro === f && s.filtroTextoAtivo]} numberOfLines={1}>{r}</Text>
          </Pressable>
        ))}
      </View>

      {q.isLoading && <View style={{ paddingVertical: 24 }}><ActivityIndicator /></View>}
      {q.isError && !q.data && (
        <View style={s.estado}>
          <Text style={s.estadoTexto}>Não consegui ler o funil agora.</Text>
          <Pressable accessibilityRole="button" onPress={() => q.refetch()} style={s.botaoSec}><Text style={s.botaoSecTexto}>Tentar de novo</Text></Pressable>
        </View>
      )}
      {q.data?.semMedicao && <Text style={s.estadoTexto}>Não há carteira para medir: seu usuário não está ligado a um dono no HubSpot.</Text>}
      {q.data && !q.data.semMedicao && visiveis.length === 0 && (
        <View style={s.estado}>
          <Text style={s.estadoTexto}>{filtro === 'todos' ? 'Nenhum negócio aberto.' : 'Nada neste filtro.'}</Text>
          {filtro !== 'todos' && <Pressable accessibilityRole="button" onPress={() => setFiltro('todos')} style={s.botaoSec}><Text style={s.botaoSecTexto}>Ver todos</Text></Pressable>}
        </View>
      )}

      {ETAPAS_DO_FUNIL.map((e, idx) => {
        const daEtapa = visiveis.filter((n) => n.etapaId === e.id)
          .sort((a, b) => Number(b.passouRegua) - Number(a.passouRegua) || (b.temperatura ?? 0) - (a.temperatura ?? 0));
        if (!daEtapa.length) return null;
        const todosDaEtapa = negocios.filter((n) => n.etapaId === e.id);
        const mrr = todosDaEtapa.reduce((acc, n) => acc + (n.mrr ?? 0), 0);
        const dentro = todosDaEtapa.filter((n) => !n.passouRegua).length;
        const regua = todosDaEtapa.find((n) => n.regua != null)?.regua ?? null;
        const aberta = abertas.has(e.id);
        const mostrar = aberta ? daEtapa : daEtapa.slice(0, 3);
        return (
          <View key={e.id} style={{ gap: 10 }}>
            <View style={s.etapaCab}>
              <View style={s.etapaN}><Text style={s.etapaNTexto}>{idx + 1}</Text></View>
              <View style={[s.ponto, { backgroundColor: e.cor }]} />
              <Text style={s.etapaNome} numberOfLines={1}>{e.rotulo}</Text>
              <Text style={s.etapaConta}>{todosDaEtapa.length}</Text>
            </View>
            <View style={s.etapaLinha2}>
              <Text style={s.etapaMrr}>{reais(mrr)}<Text style={s.etapaMes}> /mês</Text></Text>
              {regua != null && <Text style={s.etapaRegua}>{`régua ${regua} ${regua === 1 ? 'dia' : 'dias'}`}</Text>}
            </View>
            <View style={s.saude} accessibilityLabel={`${dentro} de ${todosDaEtapa.length} dentro da régua`}>
              <View style={{ flex: Math.max(dentro, 0.0001), height: 4, backgroundColor: 'var(--verde-acao)' }} />
              <View style={{ flex: Math.max(todosDaEtapa.length - dentro, 0.0001), height: 4, backgroundColor: 'var(--vermelho-acao)' }} />
            </View>
            {mostrar.map((n) => (
              <CartaoDoFunil key={n.dealId} n={n} hoje={q.data!.hoje} aoAbrir={() => n.clientId && aoAbrirLead(n.clientId)}
                aoAvancar={aoMudarEtapa ? (destino) => aoMudarEtapa(n, destino) : undefined}
                aoProposta={aoProposta ? () => aoProposta(n) : undefined} />
            ))}
            {daEtapa.length > 3 && (
              <Pressable accessibilityRole="button" onPress={() => setAbertas((st) => { const x = new Set(st); if (x.has(e.id)) x.delete(e.id); else x.add(e.id); return x; })} style={s.mais}>
                <Text style={s.maisTexto}>{aberta ? 'Mostrar menos' : `+ ${daEtapa.length - 3} ${daEtapa.length - 3 === 1 ? 'negócio' : 'negócios'} nesta etapa`}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {q.data?.snapshotLidoEm && <Text style={s.nota}>Etapa ao vivo do HubSpot · temperatura e dias do robô</Text>}
    </ScrollView>
  );
}

function CartaoDoFunil({ n, hoje, aoAbrir, aoAvancar, aoProposta }: { n: NegocioDoFunil; hoje: string; aoAbrir: () => void; aoAvancar?: (destino: string) => void; aoProposta?: () => void }) {
  const cores = useIconColors();
  const prox = proximaEtapa(n.etapaId);
  const agPag = n.etapaId === AG_PAGAMENTO;
  const vencido = !!n.proximoPasso?.dia && n.proximoPasso.dia < hoje;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${n.nome}`} onPress={aoAbrir} disabled={!n.clientId} style={s.cartao}>
      <View style={s.cartaoTopo}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.cartaoNome} numberOfLines={1}>{n.nome}</Text>
          <Text style={s.cartaoSub} numberOfLines={1}>{n.mrr ? `${reais(n.mrr)}/mês` : 'sem valor no CRM'}</Text>
        </View>
        {n.temperatura != null && (
          <View style={s.temp}><View style={[s.ponto, { backgroundColor: corDaTemp(n.temperatura) }]} /><Text style={s.tempTexto}>{Math.round(n.temperatura)}</Text></View>
        )}
      </View>
      <View style={s.passo}>
        {n.proximoPasso ? (
          <>
            <Text style={s.passoTitulo} numberOfLines={1}>{n.proximoPasso.assunto || 'Próximo passo'}</Text>
            <Text style={[s.passoSub, vencido && { color: 'var(--vermelho-texto)' }]}>{n.proximoPasso.dia ? (vencido ? `venceu ${diaCurto(n.proximoPasso.dia, hoje)}` : diaCurto(n.proximoPasso.dia, hoje)) : 'sem data'}</Text>
          </>
        ) : (
          <>
            <Text style={[s.passoTitulo, { color: 'var(--vermelho-texto)' }]}>sem próximo passo</Text>
            <Text style={s.passoSub}>falta datar</Text>
          </>
        )}
      </View>
      {agPag ? (
        <View style={s.agPag}>
          <Text style={s.agPagTexto}>Pode: ligar, mandar WhatsApp, reenviar o link e ver a cobrança. Não pode: mudar a etapa nem o valor — a entrada aqui já disparou a cobrança.</Text>
        </View>
      ) : null}
      <View style={s.cartaoRodape}>
        {n.diasNaEtapa != null ? (
          <View style={[s.dias, n.passouRegua ? s.diasFora : s.diasDentro]}>
            <Text style={[s.diasTexto, { color: n.passouRegua ? 'var(--vermelho-texto)' : 'var(--tint-green-text)' }]}>{`${n.diasNaEtapa} ${n.diasNaEtapa === 1 ? 'dia' : 'dias'} aqui`}</Text>
          </View>
        ) : <View />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {aoProposta && !agPag && ['1395880470', '1395880471', '1395880472'].includes(n.etapaId) && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Proposta para ${n.nome}`} onPress={aoProposta} style={s.avancar}>
              <Text style={s.avancarTexto}>Proposta</Text>
            </Pressable>
          )}
          {n.telefone && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Ligar para ${n.nome}`} onPress={() => { const t = n.telefone!.replace(/\D/g, ''); void Linking.openURL(`tel:+${t.length <= 11 ? `55${t}` : t}`); }} style={s.icone}>
              <IconCall width={18} height={18} fill={cores.onSurface} />
            </Pressable>
          )}
          {!agPag && prox && aoAvancar && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Avançar ${n.nome} para ${prox.rotulo}`} onPress={() => aoAvancar(prox.id)} style={s.avancar}>
              <Text style={s.avancarTexto}>{prox.id === AG_PAGAMENTO ? 'Cobrança' : 'Avançar'}</Text>
              <IconArrowFoward width={16} height={16} fill={cores.onSurface} />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  conteudo: { padding: 16, paddingBottom: 32, gap: 14 },
  resumoLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resumo: { flex: 1, fontSize: 14, fontWeight: '700', color: 'var(--text)', lineHeight: 19 },
  novo: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', paddingHorizontal: 14 },
  novoTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  filtros: { flexDirection: 'row', borderRadius: 14, backgroundColor: 'var(--surface-2)', padding: 4, gap: 4 },
  filtro: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filtroAtivo: { backgroundColor: 'var(--surface)' },
  filtroTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  filtroTextoAtivo: { color: 'var(--text)', fontWeight: '700' },
  estado: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  estadoTexto: { fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' },
  botaoSec: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  botaoSecTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  etapaCab: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  etapaN: { minWidth: 24, height: 24, borderRadius: 6, backgroundColor: 'var(--surface-2)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  etapaNTexto: { fontSize: 12, fontWeight: '800', color: 'var(--text)' },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  etapaNome: { flex: 1, fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  etapaConta: { fontSize: 14, fontWeight: '700', color: 'var(--text-muted)' },
  etapaLinha2: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  etapaMrr: { fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  etapaMes: { fontSize: 12, fontWeight: '500', color: 'var(--text-muted)' },
  etapaRegua: { fontSize: 12, color: 'var(--text-muted)' },
  saude: { flexDirection: 'row', borderRadius: 2, overflow: 'hidden' },
  cartao: { borderRadius: 14, borderWidth: 1, borderColor: 'var(--border-soft)', backgroundColor: 'var(--surface)', padding: 14, gap: 10 },
  cartaoTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cartaoNome: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  cartaoSub: { fontSize: 13, color: 'var(--text-muted)' },
  temp: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: 'var(--surface-2)', paddingHorizontal: 8, height: 24 },
  tempTexto: { fontSize: 12, fontWeight: '700', color: 'var(--text)' },
  passo: { borderRadius: 10, backgroundColor: 'var(--surface-2)', paddingHorizontal: 12, paddingVertical: 8, gap: 1 },
  passoTitulo: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  passoSub: { fontSize: 12, color: 'var(--text-muted)' },
  agPag: { borderRadius: 10, backgroundColor: 'var(--tint-amber)', borderWidth: 1, borderColor: 'var(--tint-amber-border, transparent)', padding: 10 },
  agPagTexto: { fontSize: 13, color: 'var(--tint-amber-text)', lineHeight: 18 },
  cartaoRodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dias: { borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: 'center' },
  diasDentro: { backgroundColor: 'var(--tint-green)' },
  diasFora: { backgroundColor: 'var(--tint-red)' },
  diasTexto: { fontSize: 12, fontWeight: '700' },
  icone: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  avancar: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', paddingHorizontal: 14 },
  avancarTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  mais: { minHeight: 44, justifyContent: 'center' },
  maisTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  nota: { fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', marginTop: 8 },
});
