// Aba Tarefas do mapa novo (prompt final, Parte B §B4).
//
// O que o Cockpit movimenta para o executivo chega como tarefa no HubSpot
// (planejamento, funil, ficha de rua, cobrança de SLA); é essa a lista
// principal, agrupada por prazo. Concluir sai pelo círculo ou pelo `Liguei`,
// com Desfazer de 5 s (src/utils/concluirTarefa.ts). As `client_tasks` do app
// ficam à parte, como "sugestão do app": o Cockpit não as vê.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useTarefasDoCrm, type TarefaDoCrmNaTela, type TarefaParaAFicha } from '../hooks/useTarefasDoCrm';
import { IconCall, IconCheck, IconChevronDown, IconChevronRight, useIconColors } from '../components/icons';
import { acaoRapida, agrupar, chipsDaTarefa, diaBRT } from '../utils/abaTarefas';
import { concluirComDesfazer } from '../utils/concluirTarefa';
import type { ClientTask } from '../types/client';

type Feita = { id: string; assunto: string; nome: string | null; em: number };

const chaveFeitas = (email: string, dia: string) => `takeat-tarefas-feitas:${email.toLowerCase()}:${dia}`;
const lerFeitas = (k: string): Feita[] => {
  try { return JSON.parse(localStorage.getItem(k) ?? '[]') as Feita[]; } catch { return []; }
};

type Props = {
  email: string | null | undefined;
  sugestoes: ClientTask[];
  nomeDaSugestao: (t: ClientTask) => string;
  aoConcluirSugestao: (t: ClientTask) => void;
  aoAbrirSugestao: (t: ClientTask) => void;
  aoAbrirLead: (clientId: string, tarefa: TarefaParaAFicha) => void;
  distanciaAte: (clientId: string | null) => string | null;
};

export default function TarefasNovoScreen({
  email, sugestoes, nomeDaSugestao, aoConcluirSugestao, aoAbrirSugestao, aoAbrirLead, distanciaAte,
}: Props) {
  const cores = useIconColors();
  const queryClient = useQueryClient();
  const { tarefas, carregando, erro, semMedicao } = useTarefasDoCrm(true);
  const agora = new Date();
  const hoje = diaBRT(agora)!;
  const chave = email ? chaveFeitas(email, hoje) : null;

  const [aba, setAba] = useState<'abertas' | 'feitas'>('abertas');
  const [verSugestoes, setVerSugestoes] = useState(false);
  // Some da lista no toque; volta se desfizer ou se o HubSpot recusar.
  const [emJanela, setEmJanela] = useState<Set<string>>(new Set());
  const [feitas, setFeitas] = useState<Feita[]>(() => (chave ? lerFeitas(chave) : []));
  useEffect(() => {
    if (!chave) return;
    try { localStorage.setItem(chave, JSON.stringify(feitas)); } catch { /* sem espaço: só perde o "feitas hoje" */ }
  }, [chave, feitas]);

  const idsFeitos = useMemo(() => new Set(feitas.map((f) => f.id)), [feitas]);
  const abertas = tarefas.filter((t) => !emJanela.has(t.id) && !idsFeitos.has(t.id));
  const grupos = agrupar(abertas.map((t) => ({ ...t, origem: t.marcador?.origem ?? null })), agora);

  const concluir = (t: TarefaDoCrmNaTela, liguei: boolean) => {
    setEmJanela((s) => new Set(s).add(t.id));
    const nome = t.nomeDoCliente ?? null;
    const feita: Feita = { id: t.id, assunto: t.assunto, nome, em: Date.now() };
    setFeitas((f) => [feita, ...f.filter((x) => x.id !== t.id)]);
    concluirComDesfazer({
      pedido: {
        taskId: t.id,
        nota: liguei && t.dealId ? { dealId: t.dealId, texto: `Ligação · tarefa encerrada: ${t.assunto}` } : null,
      },
      rotulo: `${liguei ? 'Liguei' : 'Tarefa feita'} · ${nome ?? t.assunto}`,
      textoToast: liguei ? '✓ Ligação registrada · HubSpot + Cockpit' : '✓ Tarefa feita · HubSpot + Cockpit',
      aoVoltar: () => {
        setEmJanela((s) => { const n = new Set(s); n.delete(t.id); return n; });
        setFeitas((f) => f.filter((x) => x.id !== t.id));
      },
      aoGravar: () => {
        setEmJanela((s) => { const n = new Set(s); n.delete(t.id); return n; });
        void queryClient.invalidateQueries({ queryKey: ['tarefas_crm'] });
      },
    });
  };

  const aviso = semMedicao ?? (erro ? 'Não consegui buscar as tarefas do HubSpot agora. Puxe de novo em instantes.' : null);

  return (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo}>
      <Text style={s.subtitulo}>Follow-ups, SLA e tudo que o Cockpit movimenta</Text>

      <View style={s.seletor} accessibilityRole="tablist">
        {([['abertas', `Abertas · ${abertas.length}`], ['feitas', `Feitas hoje · ${feitas.length}`]] as const).map(([id, rotulo]) => (
          <TouchableOpacity
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: aba === id }}
            style={[s.seletorItem, aba === id && s.seletorItemAtivo]}
            onPress={() => setAba(id)}
          >
            <Text style={[s.seletorTexto, aba === id && s.seletorTextoAtivo]}>{rotulo}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {aviso && <Text style={s.aviso}>{aviso}</Text>}

      {aba === 'abertas' ? (
        <>
          {carregando && !tarefas.length && <ActivityIndicator color="#C8131B" />}
          {!carregando && !grupos.length && !aviso && (
            <Text style={s.vazio}>Nada pendente. O Cockpit gera tarefas de SLA a cada 30 min.</Text>
          )}
          {grupos.map(({ grupo, itens }) => (
            <View key={grupo.id} style={s.grupo}>
              <Text style={[s.grupoTitulo, { color: grupo.cor }]}>{`${grupo.rotulo} · ${itens.length}`}</Text>
              {itens.map((t) => {
                const chips = chipsDaTarefa(t, agora);
                const rapida = acaoRapida(t);
                const dist = distanciaAte(t.clientId);
                const lead = [t.nomeDoCliente ?? 'cliente não identificado', dist].filter(Boolean).join(' · ');
                return (
                  <View key={t.id} style={[s.linha, chips.alerta && s.linhaAlerta]}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Concluir: ${t.assunto}`}
                      style={s.circuloAlvo}
                      onPress={() => concluir(t, false)}
                    >
                      <View style={s.circulo} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={s.linhaCorpo}
                      disabled={!t.clientId}
                      onPress={() => t.clientId && aoAbrirLead(t.clientId, { assunto: t.assunto, corpo: t.corpo, venceEm: t.venceEm })}
                    >
                      <Text style={s.linhaTitulo} numberOfLines={2}>{t.assunto}</Text>
                      <Text style={s.linhaLead} numberOfLines={1}>{lead}</Text>
                      <View style={s.chips}>
                        <Text style={s.chip}>{chips.tipo}</Text>
                        {chips.origem && <Text style={[s.chipOrigem, chips.alerta && s.chipAlerta]} numberOfLines={1}>{chips.origem}</Text>}
                      </View>
                    </TouchableOpacity>
                    {rapida === 'liguei' && (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Liguei: ${t.assunto}`}
                        style={s.rapida}
                        onPress={() => concluir(t, true)}
                      >
                        <IconCall width={18} height={18} fill={cores.onSurface} />
                        <Text style={s.rapidaTexto}>Liguei</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ))}

          {sugestoes.length > 0 && (
            <View style={s.grupo}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded: verSugestoes }}
                style={s.sugestoesTopo}
                onPress={() => setVerSugestoes((v) => !v)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.grupoTituloNeutro}>{`SUGESTÕES DO APP · ${sugestoes.length}`}</Text>
                  <Text style={s.sugestoesNota}>Geradas pelo app. O Cockpit não cobra estas.</Text>
                </View>
                {verSugestoes
                  ? <IconChevronDown width={22} height={22} fill={cores.muted} />
                  : <IconChevronRight width={22} height={22} fill={cores.muted} />}
              </TouchableOpacity>
              {verSugestoes && sugestoes.map((t) => (
                <View key={t.id} style={s.linha}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Concluir sugestão: ${t.title}`}
                    style={s.circuloAlvo}
                    onPress={() => aoConcluirSugestao(t)}
                  >
                    <View style={[s.circulo, s.circuloSugestao]} />
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" style={s.linhaCorpo} onPress={() => aoAbrirSugestao(t)}>
                    <Text style={s.linhaTitulo} numberOfLines={2}>{t.title}</Text>
                    <Text style={s.linhaLead} numberOfLines={1}>
                      {[nomeDaSugestao(t), distanciaAte(t.client_id)].filter(Boolean).join(' · ')}
                    </Text>
                    <View style={s.chips}><Text style={s.chip}>sugestão do app</Text></View>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={s.grupo}>
          {!feitas.length && <Text style={s.vazio}>Nenhuma tarefa feita hoje ainda.</Text>}
          {feitas.map((f) => (
            <View key={f.id} style={s.linha}>
              <View style={s.circuloAlvo}>
                <View style={[s.circulo, s.circuloFeito]}><IconCheck width={16} height={16} fill="#FFFFFF" /></View>
              </View>
              <View style={s.linhaCorpo}>
                <Text style={[s.linhaTitulo, s.linhaTituloFeita]} numberOfLines={2}>{f.assunto}</Text>
                <Text style={s.linhaLead} numberOfLines={1}>
                  {`${f.nome ?? ''}${f.nome ? ' · ' : ''}${new Date(f.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  conteudo: { padding: 16, paddingBottom: 32, gap: 16 },
  subtitulo: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  seletor: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  seletorItem: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  seletorItemAtivo: { backgroundColor: '#C8131B' },
  seletorTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  seletorTextoAtivo: { color: '#FFFFFF' },
  aviso: { fontSize: 13, lineHeight: 18, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 12, borderRadius: 10 },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)', textAlign: 'center', paddingVertical: 24 },
  grupo: { gap: 8 },
  grupoTitulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  grupoTituloNeutro: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--text-faint)' },
  linha: {
    flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingRight: 8, gap: 4,
    borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)',
  },
  linhaAlerta: { borderColor: 'var(--tint-red-border)' },
  circuloAlvo: { width: 48, minHeight: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  circulo: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  circuloSugestao: { borderStyle: 'dashed' },
  circuloFeito: { backgroundColor: 'var(--tint-green-text)', borderColor: 'var(--tint-green-text)' },
  linhaCorpo: { flex: 1, minWidth: 0, paddingVertical: 10, gap: 2 },
  linhaTitulo: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: 'var(--text)' },
  linhaTituloFeita: { color: 'var(--text-muted)', textDecorationLine: 'line-through' },
  linhaLead: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    fontSize: 11, fontWeight: '700', color: 'var(--text-muted)', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 999, borderWidth: 1, borderColor: 'var(--border)', overflow: 'hidden',
  },
  chipOrigem: { fontSize: 11, fontWeight: '600', color: 'var(--text-faint)', paddingVertical: 3, flexShrink: 1 },
  chipAlerta: { color: 'var(--tint-red-text)', fontWeight: '700' },
  rapida: {
    minHeight: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'var(--border)',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  rapidaTexto: { fontSize: 11, fontWeight: '700', color: 'var(--text)' },
  sugestoesTopo: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 },
  sugestoesNota: { fontSize: 12, lineHeight: 16, color: 'var(--text-faint)', marginTop: 2 },
});
