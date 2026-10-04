// A Proposta dentro do negócio (Um app só, PR 4 · docs/11 §1, prancha "Proposta", 04/10/2026).
//
// A Calculadora de Planos do Cockpit, em folha, já com o negócio: pacote, adicionais,
// período e a mensalidade — calculados pelo MESMO motor (utils/calculadoraPlanos.ts, cópia
// literal testada) com os preços do banco (pricing_config). Nenhum preço mora no código.
//
//  - Mandar pelo WhatsApp: abre a conversa com o resumo da proposta (não grava nada).
//  - Salvar no negócio: em Conversa com decisor ou Demo/Proposta, abre o Mudar etapa do app
//    já com plano e MRR preenchidos (as mesmas travas do cartão); depois disso, registra a
//    proposta como nota no negócio.
//  - Ag. Pagamento: travada, com o motivo (a cobrança já saiu; valor e proposta não mudam).
//  - Sem negócio ("Simular proposta", no menu): calcula e manda, não salva.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { Painel } from './Painel';
import { Toast } from './Toast';
import { IconClose, IconWhatsapp, useIconColors } from './icons';
import { negocioAcao } from '../utils/negocioAcao';
import { planoApresentadoHubSpot } from '../utils/umApp';
import { pc9Alertas, pc9BRL, pc9Calcular, pc9EstadoInicial, pc9SituacaoDoAdicional, pc9TextoDoInvestimento, pc9TierValido } from '../utils/calculadoraPlanos';

export type NegocioDaProposta = { dealId: string; nome: string; etapaId: string | null; telefone: string | null; clientId: string | null };

const ETAPA = { decisor: '1395880470', demo: '1395880471', negociacao: '1395880472', pagamento: '1395880473' };

export { planoApresentadoHubSpot } from '../utils/umApp';

type Config = {
  planos: Record<string, { label: string; tiers: Array<{ id: string; name: string; price: number }> }>;
  periodicidades: Array<{ id: string; label: string; months: number; discount?: number; creditCard?: boolean }>;
  adicionais: Array<{ id: string; name: string; price: number; perUnit?: boolean; minUnits?: number }>;
  funcionalidades?: unknown[];
};
type Estado = { tipoPlano: string; tier: string; periodicidade: string; adicionaisAtivos: Record<string, boolean>; quantidades: Record<string, number> };

export default function PropostaSheet({ visivel, aoFechar, negocio, aoAvancarComProposta }: {
  visivel: boolean; aoFechar: () => void; negocio: NegocioDaProposta | null;
  /** abre o Mudar etapa do app com plano e MRR preenchidos */
  aoAvancarComProposta?: (n: NegocioDaProposta, destino: string, preenchido: Record<string, string>) => void;
}) {
  const cores = useIconColors();
  const cfgQ = useQuery<Config>({
    queryKey: ['pricing_config'],
    enabled: visivel,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('pricing_config').select('*').eq('id', 'current').maybeSingle();
      if (error) throw new Error('A tabela de preços não carregou: ' + error.message);
      if (!data) throw new Error('A tabela de preços ainda não existe no banco.');
      const c = data as unknown as Config;
      if (!c.planos || !Object.keys(c.planos).length || !Array.isArray(c.periodicidades) || !c.periodicidades.length) {
        throw new Error('A tabela de preços está incompleta no banco (faltam planos ou periodicidades). Avise a gestão.');
      }
      return c;
    },
  });
  const cfg = cfgQ.data;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (cfg && !estado) setEstado(pc9EstadoInicial(cfg) as Estado); }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!visivel) setEstado(null); }, [visivel]);

  const calculo = useMemo(() => (cfg && estado ? pc9Calcular(cfg, estado) : null), [cfg, estado]);
  const alertas = useMemo(() => (cfg && estado ? (pc9Alertas(cfg, estado) as Array<{ message: string }>) : []), [cfg, estado]);
  const travada = negocio?.etapaId === ETAPA.pagamento;

  const resumo = () => {
    if (!calculo || !estado) return '';
    const c = calculo as { plano: { label: string }; tierData: { name: string }; periodo: { label: string }; adicionaisDetail: Array<{ name: string; included: boolean; qty: number }>; totalMonthly: number };
    const inv = pc9TextoDoInvestimento(calculo) as { principal: string; total: string | null };
    const extras = c.adicionaisDetail.filter((a) => !a.included).map((a) => (a.qty > 1 ? `${a.name} (${a.qty}x)` : a.name));
    return [
      `Proposta Takeat${negocio ? ` · ${negocio.nome}` : ''}`,
      `Plano ${c.tierData.name} · ${c.plano.label} · ${c.periodo.label}`,
      extras.length ? `Adicionais: ${extras.join(', ')}` : null,
      `Investimento: ${inv.principal}${inv.total ? ` (${inv.total})` : ''}`,
      'Proposta válida por 2 dias.',
    ].filter(Boolean).join('\n');
  };

  const mandarWhats = () => {
    const tel = (negocio?.telefone ?? '').replace(/\D/g, '');
    const texto = encodeURIComponent(resumo());
    const url = tel ? `https://wa.me/${tel.length <= 11 ? `55${tel}` : tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
    void Linking.openURL(url);
  };

  const salvar = async () => {
    if (!negocio || !calculo || !estado || travada) return;
    const mensal = Math.round((calculo as { totalMonthly: number }).totalMonthly);
    const plano = planoApresentadoHubSpot(estado.tipoPlano, (calculo as { tier: string }).tier);
    const preenchido = { plano_apresentado: plano, valor_de_mrr: String(mensal) };
    if ((negocio.etapaId === ETAPA.decisor || negocio.etapaId === ETAPA.demo) && aoAvancarComProposta) {
      // a nota vai sempre: se o negócio já tinha plano e MRR, o Mudar etapa não pede nada e o valor
      // desta proposta ficaria só na tela (medido na auditoria de 04/10)
      void negocioAcao({ op: 'nota', dealId: negocio.dealId, texto: `Proposta apresentada pelo app
${resumo()}` }).catch(() => { /* o avanço segue; a nota é complemento */ });
      aoFechar();
      aoAvancarComProposta(negocio, negocio.etapaId === ETAPA.decisor ? ETAPA.demo : ETAPA.negociacao, preenchido);
      return;
    }
    setSalvando(true);
    try {
      await negocioAcao({ op: 'nota', dealId: negocio.dealId, texto: `Proposta apresentada pelo app\n${resumo()}` });
      Toast.mostrar(`Proposta registrada em ${negocio.nome}`, 'ok');
      aoFechar();
    } catch (e) {
      Toast.mostrar(`Não registrou: ${(e as Error).message}`, 'erro');
    } finally { setSalvando(false); }
  };

  const tiers = cfg && estado ? cfg.planos[estado.tipoPlano]?.tiers ?? [] : [];
  const inv = calculo ? (pc9TextoDoInvestimento(calculo) as { principal: string; detalhe: string | null; total: string | null }) : null;
  return (
    <Painel visivel={visivel} aoFechar={aoFechar} rotulo="Proposta" topo={
      <View style={s.topo}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.titulo} numberOfLines={1}>{negocio ? `Proposta · ${negocio.nome}` : 'Simular proposta'}</Text>
          <Text style={s.sub} numberOfLines={1}>{negocio ? 'já preenchida com o negócio' : 'sem negócio · não salva no funil'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fechar}>
          <IconClose width={20} height={20} fill={cores.muted} />
        </Pressable>
      </View>
    }>
      <ScrollView contentContainerStyle={s.corpo}>
        {travada ? (
          <View style={s.trava}>
            <Text style={s.travaTexto}>Este negócio está em Ag. Pagamento: a cobrança já saiu. Valor e proposta não mudam por aqui — se precisar refazer, fale com a gestão.</Text>
          </View>
        ) : cfgQ.isLoading || !estado ? (
          cfgQ.isError ? <Text style={s.erro}>{(cfgQ.error as Error).message}</Text> : <ActivityIndicator />
        ) : (
          <>
            {Object.keys(cfg!.planos).length > 1 && (
              <>
                <Text style={s.rotulo}>TIPO</Text>
                <View style={s.chips}>
                  {Object.entries(cfg!.planos).map(([id, p]) => (
                    <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: estado.tipoPlano === id }}
                      onPress={() => setEstado((e) => e && ({ ...e, tipoPlano: id, tier: pc9TierValido(cfg!, id, e.tier) }))}
                      style={[s.chip, estado.tipoPlano === id && s.chipAtivo]}>
                      <Text style={[s.chipTexto, estado.tipoPlano === id && s.chipTextoAtivo]}>{(p as { label: string }).label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Text style={s.rotulo}>PACOTE</Text>
            <View style={s.chips}>
              {tiers.map((t) => (
                <Pressable key={t.id} accessibilityRole="button" accessibilityState={{ selected: estado.tier === t.id }}
                  onPress={() => setEstado((e) => e && ({ ...e, tier: t.id }))} style={[s.chip, estado.tier === t.id && s.chipAtivo]}>
                  <Text style={[s.chipTexto, estado.tier === t.id && s.chipTextoAtivo]}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.rotulo}>ADICIONAIS</Text>
            <View style={s.chips}>
              {cfg!.adicionais.map((ad) => {
                const sit = pc9SituacaoDoAdicional(ad, estado) as { incluso: boolean; marcado: boolean };
                const qtd = estado.quantidades[ad.id] ?? ad.minUnits ?? 1;
                return (
                  <View key={ad.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: sit.incluso || sit.marcado, disabled: sit.incluso }} disabled={sit.incluso}
                      onPress={() => setEstado((e) => e && ({ ...e, adicionaisAtivos: { ...e.adicionaisAtivos, [ad.id]: !e.adicionaisAtivos[ad.id] } }))}
                      style={[s.chip, (sit.marcado || sit.incluso) && s.chipAtivo, sit.incluso && { opacity: 0.7 }]}>
                      <Text style={[s.chipTexto, (sit.marcado || sit.incluso) && s.chipTextoAtivo]}>{sit.incluso ? `${ad.name} · incluso` : ad.name}</Text>
                    </Pressable>
                    {ad.perUnit && sit.marcado && !sit.incluso && (
                      <View style={s.qtd}>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir ${ad.name}`} onPress={() => setEstado((e) => e && ({ ...e, quantidades: { ...e.quantidades, [ad.id]: Math.max(ad.minUnits ?? 1, qtd - 1) } }))} style={s.qtdBotao}><Text style={s.qtdTexto}>−</Text></Pressable>
                        <Text style={s.qtdN}>{qtd}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${ad.name}`} onPress={() => setEstado((e) => e && ({ ...e, quantidades: { ...e.quantidades, [ad.id]: qtd + 1 } }))} style={s.qtdBotao}><Text style={s.qtdTexto}>+</Text></Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={s.rotulo}>PERÍODO</Text>
            {/* 8 períodos não cabem numa régua de 390 px: viram botões que quebram linha (auditoria 04/10) */}
            <View style={s.chips}>
              {cfg!.periodicidades.map((p) => (
                <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ selected: estado.periodicidade === p.id }}
                  onPress={() => setEstado((e) => e && ({ ...e, periodicidade: p.id }))} style={[s.chip, estado.periodicidade === p.id && s.chipAtivo]}>
                  <Text style={[s.chipTexto, estado.periodicidade === p.id && s.chipTextoAtivo]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            {alertas.map((a, i) => <Text key={i} style={s.alerta}>{a.message}</Text>)}
            {inv && (
              <View style={s.total}>
                <Text style={s.rotulo}>MENSALIDADE</Text>
                <Text style={s.totalValor}>{inv.principal}</Text>
                {inv.detalhe ? <Text style={s.sub}>{inv.detalhe}</Text> : null}
                {inv.total ? <Text style={s.sub}>{inv.total}</Text> : null}
                {(calculo as { economia: number }).economia > 0 && <Text style={[s.sub, { color: 'var(--tint-green-text)' }]}>{`Economia de ${pc9BRL((calculo as { economia: number }).economia)}`}</Text>}
              </View>
            )}
            <View style={s.acoes}>
              <Pressable accessibilityRole="button" onPress={mandarWhats} style={[s.acao, s.acaoWhats]}>
                <IconWhatsapp width={18} height={18} fill="#FFFFFF" />
                <Text style={[s.acaoTexto, { color: '#FFFFFF' }]}>Mandar pelo WhatsApp</Text>
              </Pressable>
              {negocio && (
                <Pressable accessibilityRole="button" disabled={salvando} onPress={() => { void salvar(); }} style={[s.acao, s.acaoSec, salvando && { opacity: 0.6 }]}>
                  <Text style={s.acaoTexto}>{salvando ? 'Salvando…' : 'Salvar'}</Text>
                </Pressable>
              )}
            </View>
            <Text style={s.nota}>{negocio
              ? (negocio.etapaId === ETAPA.decisor || negocio.etapaId === ETAPA.demo
                ? 'Salvar leva o negócio para a próxima etapa com o plano e o MRR desta proposta.'
                : 'Salvar registra a proposta como nota no negócio.')
              : 'Simulação: nada é gravado.'}</Text>
          </>
        )}
      </ScrollView>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 8 },
  titulo: { fontSize: 19, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  corpo: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  rotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: 'var(--text-muted)', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', paddingHorizontal: 14, justifyContent: 'center' },
  chipAtivo: { borderColor: 'var(--vermelho-acao)', backgroundColor: 'var(--tint-red)' },
  chipTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  chipTextoAtivo: { color: 'var(--text)', fontWeight: '700' },
  qtd: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  qtdBotao: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  qtdTexto: { fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  qtdN: { minWidth: 24, textAlign: 'center', fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  periodos: { flexDirection: 'row', borderRadius: 14, backgroundColor: 'var(--surface-2)', padding: 4, gap: 4 },
  periodo: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  periodoAtivo: { backgroundColor: 'var(--surface)' },
  periodoTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text-muted)' },
  alerta: { fontSize: 13, color: 'var(--tint-amber-text)', lineHeight: 18 },
  total: { borderRadius: 14, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)', padding: 14, gap: 2, marginTop: 4 },
  totalValor: { fontSize: 30, fontWeight: '800', color: 'var(--text)' },
  acoes: { flexDirection: 'row', gap: 10, marginTop: 6 },
  acao: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 14 },
  acaoWhats: { flex: 1, backgroundColor: 'var(--whatsapp)' },
  acaoSec: { borderWidth: 1, borderColor: 'var(--border)' },
  acaoTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  nota: { fontSize: 12, color: 'var(--text-muted)' },
  trava: { borderRadius: 12, backgroundColor: 'var(--tint-amber)', padding: 14 },
  travaTexto: { fontSize: 14, color: 'var(--tint-amber-text)', lineHeight: 20 },
  erro: { fontSize: 14, color: 'var(--tint-red-text)' },
});
