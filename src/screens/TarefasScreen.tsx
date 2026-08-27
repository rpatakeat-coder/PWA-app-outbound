import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../components/Alert';
import type { Client, ClientTask } from '../types/client';
import { useLayout } from '../hooks/useLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { ds, sharedStyles } from './sharedStyles';
import { IconCheck, useIconColors } from '../components/icons';

// Tela de Tarefas, extraida do App.tsx (prompt 02 do handoff) — refactor puro,
// nada mudou visualmente. O recorte visibleTasks/tasksActiveVendor continua
// sendo calculado no App.tsx porque o badge da barra de navegacao usa os
// mesmos numeros; aqui chega pronto, por props.
interface Props {
  visibleTasks: ClientTask[];
  tasksActiveVendor: string | null;
  filtroSev: string | null;
  setFiltroSev: (sev: string | null) => void;
  clients: Client[];
  /** Nome por id pra lead fora do viewport do mapa (useNomesDeClientes). */
  nomesTarefas: Map<string, string>;
  nomeDoLead: (c: Client) => string;
  vendorLabel: (idHubspot: string | null) => string;
  abrirLeadNoMapa: (c: Client) => void;
  agendarDemo: (c: Client) => void;
  abrirRegras: () => void;
  concluirTarefa: (vars: { id: string; status: 'concluida' | 'dispensada' }) => void;
  /** Abre o menu de destino (avancar / perdido / manter) ao concluir com lead. */
  abrirMenuDeConclusao: (v: { task: ClientTask; client: Client }) => void;
  myHubspotId: string | null;
}

export function TarefasScreen({
  visibleTasks,
  tasksActiveVendor,
  filtroSev,
  setFiltroSev,
  clients,
  nomesTarefas,
  nomeDoLead,
  vendorLabel,
  abrirLeadNoMapa,
  agendarDemo,
  abrirRegras,
  concluirTarefa,
  abrirMenuDeConclusao,
  myHubspotId,
}: Props) {
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const iconColors = useIconColors();
  // Recorte (gestor ve todas, vendedor ve so as suas) calculado uma vez em
  // visibleTasks/tasksActiveVendor — compartilhado com o badge do rodape.
  const activeVendor = tasksActiveVendor;

  const sevColor = (s: string | null) => (s === 'D5' ? '#C8131B' : s === 'D2' ? '#FFB32F' : s === 'SLA' ? '#2563eb' : '#64748b');
  // Peso da urgência — ordena chips, seções e a lista dentro de cada seção.
  const sevRank = (s: string | null) => (s === 'D5' ? 3 : s === 'D2' ? 2 : s === 'SLA' ? 1 : 0);
  // Severidade nula vira uma chave própria pra não sumir do agrupamento.
  const SEM_SEV = 'Outras';
  const sevKey = (s: string | null) => s ?? SEM_SEV;

  // Mais urgente primeiro; dentro da severidade, os mais antigos na frente.
  const sorted = [...visibleTasks].sort((a, b) => {
    if (sevRank(b.severity) !== sevRank(a.severity)) return sevRank(b.severity) - sevRank(a.severity);
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Contagem por severidade — alimenta os chips e os cabeçalhos de seção.
  const contagem = new Map<string, number>();
  for (const t of sorted) contagem.set(sevKey(t.severity), (contagem.get(sevKey(t.severity)) ?? 0) + 1);
  const chips = [...contagem.entries()].sort((a, b) => sevRank(b[0]) - sevRank(a[0]));

  // O chip filtra a lista; a seção que sobra continua com cabeçalho, pra
  // deixar claro que é um recorte e não a lista inteira.
  const secoes = chips
    .filter(([sev]) => filtroSev === null || sev === filtroSev)
    .map(([sev, total]) => ({
      sev,
      total,
      itens: sorted.filter((t) => sevKey(t.severity) === sev),
    }))
    .filter((s) => s.itens.length > 0);

  const renderTaskCard = (task: ClientTask) => {
    const client = clients.find((c) => c.id === task.client_id) ?? null;
    const leadNome = client
      ? nomeDoLead(client)
      : nomesTarefas.get(task.client_id) ?? 'Lead não encontrado';
    const days = (task.meta as any)?.days_in_stage;
    const etapaMeta = (task.meta as any)?.etapa as string | undefined;
    const responsavel = task.vendedor_id_hubspot ? vendorLabel(task.vendedor_id_hubspot) : null;
    // Convenção do time: vendedor desativado é marcado renomeando o profile
    // com o sufixo "/ DESATIVADO". Vira tag — no meio do nome ele competia
    // com a informação e ainda estourava a linha.
    const inativoMatch = responsavel?.match(/^(.*?)\s*\/\s*DESATIVADO\s*$/i) ?? null;
    const responsavelNome = inativoMatch ? inativoMatch[1].trim() : responsavel;
    // O tipo da tarefa já vive na seção; no título o que importa é o LEAD.
    // Tira o prefixo de severidade ("D5 Agendar Demo" -> "Agendar Demo") pra
    // não repetir o que o badge e o cabeçalho da seção já dizem.
    const tipo = task.title.replace(/^(D\d+|SLA)\s+/i, '');
    // SLA mostra os dias na etapa (ex.: "3d"); D2/D5 mostram como estão.
    const badgeText = task.severity === 'SLA'
      ? (typeof days === 'number' ? `${days}d` : 'SLA')
      : (task.severity ?? '•');

    return (
      <View key={task.id} style={[styles.taskCard, layout.ehDesktop && styles.taskCardWeb]} {...ds({ hover: 'borda', trans: '1' })}>
        <View style={styles.taskCardTop}>
          <Text style={styles.taskLead} numberOfLines={2}>{leadNome}</Text>
          <View style={[styles.taskBadge, { backgroundColor: sevColor(task.severity) }]}>
            <Text style={styles.taskBadgeText}>{badgeText}</Text>
          </View>
        </View>

        <Text style={styles.taskTipo}>{tipo}</Text>
        {typeof days === 'number' ? (
          <Text style={styles.taskMeta}>{days} dia(s) em {etapaMeta ?? 'etapa'}</Text>
        ) : null}
        {responsavel ? (
          <View style={styles.taskRespRow}>
            <Text style={[styles.taskMeta, { flexShrink: 1 }]} numberOfLines={1}>
              {responsavelNome}
            </Text>
            {inativoMatch ? (
              <View style={styles.taskInativoTag}>
                <Text style={styles.taskInativoTagText}>DESATIVADO</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.taskActionsRow}>
          {client && (
            <TouchableOpacity
              style={sharedStyles.smallActionButton}
              onPress={() => abrirLeadNoMapa(client)}
            >
              <Text style={sharedStyles.smallActionButtonText}>Abrir lead</Text>
            </TouchableOpacity>
          )}
          {client && task.task_type === 'agendar_demo' && (
            <TouchableOpacity
              style={[
                sharedStyles.smallActionButton,
                layout.ehDesktop
                  ? styles.acaoAgendarWeb
                  : { backgroundColor: '#C8131B', borderColor: '#C8131B' },
              ]}
              onPress={() => agendarDemo(client)}
            >
              <Text
                style={[
                  sharedStyles.smallActionButtonText,
                  layout.ehDesktop ? { color: 'var(--tint-red-text)' } : { color: '#fff' },
                ]}
              >
                Agendar demo
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            accessibilityLabel="Concluir tarefa"
            style={[
              sharedStyles.smallActionButton,
              layout.ehDesktop ? styles.acaoConcluirWeb : { backgroundColor: '#16a34a', borderColor: '#16a34a' },
            ]}
            onPress={() => {
              // Com o lead carregado, concluir abre o menu de destino
              // (avançar / perdido / manter + próxima). Sem lead
              // (raro: cliente deletado), cai na conclusão simples.
              if (client) {
                abrirMenuDeConclusao({ task, client });
              } else {
                Alert.alert('Concluir tarefa', `Marcar "${task.title}" como concluída?`, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Concluir', onPress: () => concluirTarefa({ id: task.id, status: 'concluida' }) },
                ]);
              }
            }}
          >
            {layout.ehDesktop ? (
              <IconCheck width={20} height={20} fill={iconColors.muted} />
            ) : (
              <Text style={[sharedStyles.smallActionButtonText, { color: '#fff' }]}>Concluir</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={[sharedStyles.listContent, { paddingBottom: 90 + insets.bottom },
    // Mesmo teto da lista de leads: sem ele o conteudo se espalha por
    // toda a largura do monitor e a linha de texto fica ilegivel.
    { maxWidth: layout.larguraMaxima, width: '100%', alignSelf: 'center' }]}>
      {/* Cabeçalho enxuto: o texto explicativo que ficava aqui virou o modal
          ⓘ, que já tinha as regras completas — ele ocupava um terço da tela
          em toda visita, mesmo pra quem já conhece a mecânica. */}
      <View style={sharedStyles.taskHeaderRow}>
        <Text style={sharedStyles.panelTitle}>
          Tarefas{sorted.length > 0 ? ` · ${sorted.length}` : ''}
        </Text>
        <TouchableOpacity
          style={styles.taskInfoButton}
          onPress={abrirRegras}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.taskInfoButtonText}>ⓘ</Text>
        </TouchableOpacity>
      </View>

      {activeVendor !== null && activeVendor !== myHubspotId ? (
        <Text style={sharedStyles.taskVendorHint}>
          Filtro ativo: {vendorLabel(activeVendor)} — tire no modal de filtros.
        </Text>
      ) : null}

      {/* Chips: quanto tem de cada urgência, e filtro de um toque. */}
      {chips.length > 1 && (
        <View style={sharedStyles.countChipsRow}>
          {chips.map(([sev, total]) => {
            const ativo = filtroSev === sev;
            return (
              <TouchableOpacity
                key={sev}
                style={[sharedStyles.countChip, ativo && { borderColor: sevColor(sev), backgroundColor: 'var(--surface)' }]}
                onPress={() => setFiltroSev(ativo ? null : sev)}
              >
                <View style={[sharedStyles.countChipDot, { backgroundColor: sevColor(sev) }]} />
                <Text style={[sharedStyles.countChipText, ativo && { color: 'var(--text)' }]}>
                  {sev} {total}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {sorted.length === 0 ? (
        <View style={sharedStyles.emptyState}>
          <Text style={sharedStyles.emptyStateText}>Nenhuma tarefa pendente.</Text>
        </View>
      ) : (
        // KANBAN no desktop, com tres regras que o print pediu:
        //   1. Coluna tem LARGURA PROPRIA (320-400px), nao flex:1 — com o
        //      filtro de urgencia ativo sobrava uma coluna unica esticada na
        //      tela inteira, o "mobile maior" de novo.
        //   2. Coluna tem SCROLL INTERNO limitado a uma tela: o cabecalho do
        //      quadro fica sempre visivel e SLA com 75 tarefas rola DENTRO
        //      da coluna, nao a pagina inteira.
        //   3. O quadro rola na horizontal se as colunas nao couberem.
        // No celular continua a pilha de secoes de sempre.
        layout.ehDesktop ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
              {secoes.map((secao) => {
                const tinta =
                  secao.sev === 'D5'
                    ? { bg: 'var(--tint-red)', fg: 'var(--tint-red-text)' }
                    : secao.sev === 'D2'
                      ? { bg: 'var(--tint-amber)', fg: 'var(--tint-amber-text)' }
                      : { bg: 'var(--tint-blue)', fg: 'var(--tint-blue-text)' };
                return (
                <View key={secao.sev} style={styles.kanbanColuna}>
                  <View style={styles.kanbanCabecalho}>
                    <View style={[sharedStyles.countChipDot, { backgroundColor: sevColor(secao.sev) }]} />
                    <Text style={styles.kanbanTitulo}>{secao.sev}</Text>
                    <View style={[styles.kanbanContagem, { backgroundColor: tinta.bg }]}>
                      <Text style={[styles.kanbanContagemTexto, { color: tinta.fg }]}>{secao.total}</Text>
                    </View>
                  </View>
                  <ScrollView
                    style={{ maxHeight: Math.max(360, layout.altura - 320) }}
                    contentContainerStyle={{ padding: 12 }}
                    showsVerticalScrollIndicator
                  >
                    {secao.itens.map(renderTaskCard)}
                  </ScrollView>
                </View>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          secoes.map((secao) => (
            <View key={secao.sev}>
              <View style={styles.taskSectionHeader}>
                <View style={[sharedStyles.countChipDot, { backgroundColor: sevColor(secao.sev) }]} />
                <Text style={styles.taskSectionText}>
                  {secao.sev} · {secao.total} {secao.total === 1 ? 'tarefa' : 'tarefas'}
                </Text>
              </View>
              {secao.itens.map(renderTaskCard)}
            </View>
          ))
        )
      )}
    </ScrollView>
  );
}

// Estilos exclusivos desta tela, movidos do App.tsx como estavam.
const styles = StyleSheet.create({
  // Acoes do card no desktop (prompt 08): Agendar tonal ocupa a linha,
  // concluir vira quadrado 32x32 com check.
  acaoAgendarWeb: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'var(--tint-red)',
    borderColor: 'var(--tint-red)',
    justifyContent: 'flex-start',
  },
  acaoConcluirWeb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'var(--stroke-default)',
    backgroundColor: 'var(--surface)',
  },
  kanbanColuna: {
    width: 380,
    backgroundColor: 'var(--surface)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--border)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },

  kanbanCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },

  kanbanTitulo: { flex: 1, fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)' },

  kanbanContagem: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  kanbanContagemTexto: { fontSize: 12, lineHeight: 24, letterSpacing: 0.5, fontWeight: '700' },

  taskCard: {
    backgroundColor: 'var(--surface)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'var(--border)',
  },

  taskCardWeb: { padding: 16, borderRadius: 8, marginBottom: 12 },

  taskCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },

  taskLead: { flex: 1, fontSize: 16, fontWeight: '800', color: 'var(--text)' },

  taskBadge: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  taskBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  taskTipo: { fontSize: 13, fontWeight: '600', color: 'var(--text)', marginTop: 2 },

  taskMeta: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },

  taskRespRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },

  taskInativoTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'var(--tint-red)',
  },

  taskInativoTagText: { fontSize: 9, fontWeight: '800', color: 'var(--tint-red-text)', letterSpacing: 0.3 },

  taskSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 2,
  },

  taskSectionText: { fontSize: 12, fontWeight: '800', color: 'var(--text-muted)', letterSpacing: 0.4 },

  taskActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },

  taskInfoButton: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'var(--tint-blue)',
  },

  taskInfoButtonText: { fontSize: 18, color: 'var(--info-text)', fontWeight: '700' },
});
