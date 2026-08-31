import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../components/Alert';
import type { Client, ClientTask } from '../types/client';
import { useLayout } from '../hooks/useLayout';
import { useTheme } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { ds, sharedStyles } from './sharedStyles';
import { IconCheck, IconClipboardCheck, IconClock, IconUser, useIconColors } from '../components/icons';

export type BaldeDeTarefa = 'atrasadas' | 'hoje' | 'proximas';

// ---- Vencimento ----
// Campo real: meta.due_date (gerado pelo cron de SLA como entrada na etapa +
// sla_days em dias uteis — migration 20260725). D2/D5 nao gravam o campo, mas
// o vencimento e' a MESMA aritmetica do gerador: a tarefa vence quando
// days_in_stage cruza o limite (2 ou 5). Nada aqui inventa criterio — e' o
// calculo que o SQL usa, feito no cliente.
//
// Vive no MODULO e e' exportado porque o header (App.tsx) precisa dos mesmos
// baldes pra escrever "{n} atrasadas · {n} para hoje". Duas copias da regra
// acabariam divergindo, e a sublinha do header contradiria as abas.
const diaBRTde = (iso: unknown): string | null =>
  typeof iso === 'string' && iso
    ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    : null;

// Calculado por CHAMADA, nao no import: um PWA aberto atravessando a meia-noite
// continuaria classificando pelo dia de ontem.
const hojeEmBRT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export const baldeDeVencimento = (task: ClientTask): BaldeDeTarefa => {
  const meta = (task.meta ?? {}) as { due_date?: unknown; days_in_stage?: unknown; sla_days?: unknown };
  const hojeBRT = hojeEmBRT();
  const due = diaBRTde(meta.due_date);
  if (due) return due < hojeBRT ? 'atrasadas' : due === hojeBRT ? 'hoje' : 'proximas';
  const dias = typeof meta.days_in_stage === 'number' ? meta.days_in_stage : null;
  const limite =
    task.severity === 'D5' ? 5
    : task.severity === 'D2' ? 2
    : typeof meta.sla_days === 'number' ? meta.sla_days : null;
  if (dias !== null && limite !== null) return dias > limite ? 'atrasadas' : 'hoje';
  // Sem vencimento derivavel (ex.: follow-up avulso): e' acao de agora.
  return 'hoje';
};

// Texto do prazo do card. Sai dos MESMOS campos do balde — se saisse de outro
// lugar, um card na aba "Atrasadas" poderia dizer "vence amanha".
const prazoDaTarefa = (task: ClientTask): { texto: string; vencido: boolean } | null => {
  const meta = (task.meta ?? {}) as { due_date?: unknown; days_in_stage?: unknown; sla_days?: unknown };
  const due = diaBRTde(meta.due_date);
  if (due) {
    const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    const delta = Math.round((dia(due) - dia(hojeEmBRT())) / 86_400_000);
    if (delta < -1) return { texto: `venceu há ${-delta} dias`, vencido: true };
    if (delta === -1) return { texto: 'venceu ontem', vencido: true };
    if (delta === 0) return { texto: 'vence hoje', vencido: false };
    if (delta === 1) return { texto: 'vence amanhã', vencido: false };
    return { texto: `vence em ${delta} dias`, vencido: false };
  }
  const dias = typeof meta.days_in_stage === 'number' ? meta.days_in_stage : null;
  const limite =
    task.severity === 'D5' ? 5
    : task.severity === 'D2' ? 2
    : typeof meta.sla_days === 'number' ? meta.sla_days : null;
  if (dias === null || limite === null) return null;
  const atraso = dias - limite;
  if (atraso > 1) return { texto: `venceu há ${atraso} dias`, vencido: true };
  if (atraso === 1) return { texto: 'venceu ontem', vencido: true };
  return { texto: 'vence hoje', vencido: false };
};

// Badge e regua sao VARIAVEIS DIFERENTES. O badge tem fundo tonal claro
// (superficie propria, que nao inverte com o tema), entao o texto fica escuro
// sempre. A regua fica sobre `--surface`: no escuro ela precisa do par CLARO,
// senao o #94090F vira vinho sobre quase-preto e desaparece.
const SLA_BADGE: Record<string, { bg: string; fg: string }> = {
  D5: { bg: '#FAE8E9', fg: '#94090F' },
  D2: { bg: '#FFF8EB', fg: '#99670F' },
};
const SLA_BADGE_PADRAO = { bg: 'var(--surface-2)', fg: 'var(--text-faint)' };
const SLA_REGUA: Record<string, { claro: string; escuro: string }> = {
  D5: { claro: '#94090F', escuro: '#E5A1A4' },
  D2: { claro: '#99670F', escuro: '#FFD894' },
};
const SLA_REGUA_PADRAO = 'var(--border)';

const ABAS: Array<{ chave: BaldeDeTarefa; rotulo: string }> = [
  { chave: 'atrasadas', rotulo: 'Atrasadas' },
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: 'proximas', rotulo: 'Próximas' },
];

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
  /** Abre a ficha por id — cobre lead fora do viewport do mapa. */
  abrirLeadPorId: (id: string) => void;
  /** Limpa o filtro de vendedor compartilhado (gestor). */
  limparFiltroVendedor?: () => void;
  agendarDemo: (c: Client, task?: ClientTask) => void;
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
  abrirLeadPorId,
  limparFiltroVendedor,
  agendarDemo,
  abrirRegras,
  concluirTarefa,
  abrirMenuDeConclusao,
  myHubspotId,
}: Props) {
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const iconColors = useIconColors();
  const { isDark } = useTheme();
  // Unico estado novo do M5. As tres colunas do kanban do desktop viram abas
  // no celular: rolagem horizontal em app de campo e' toque errado garantido.
  const [tabTarefa, setTabTarefa] = useState<BaldeDeTarefa>('atrasadas');
  // Recorte (gestor ve todas, vendedor ve so as suas) calculado uma vez em
  // visibleTasks/tasksActiveVendor — compartilhado com o badge do rodape.
  const activeVendor = tasksActiveVendor;

  const sevColor = (s: string | null) => (s === 'D5' ? '#C8131B' : s === 'D2' ? '#FFB32F' : s === 'SLA' ? '#0ea5e9' : '#64748b');
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

  const COLUNAS_VENCIMENTO = [
    { chave: 'atrasadas' as const, titulo: 'Atrasadas', cor: '#C8131B', tintaBg: 'var(--tint-red)', tintaFg: 'var(--tint-red-text)' },
    { chave: 'hoje' as const, titulo: 'Hoje', cor: '#FFB32F', tintaBg: 'var(--tint-amber)', tintaFg: 'var(--tint-amber-text)' },
    { chave: 'proximas' as const, titulo: 'Próximas', cor: '#0ea5e9', tintaBg: 'var(--tint-blue)', tintaFg: 'var(--tint-blue-text)' },
  ];
  const colunasVencimento = COLUNAS_VENCIMENTO.map(c => ({
    ...c,
    itens: sorted.filter(task => baldeDeVencimento(task) === c.chave),
  }));

  // Com o lead carregado, concluir abre o menu de destino (avancar / perdido /
  // manter + proxima). Sem lead (raro: cliente deletado), cai na confirmacao
  // simples. Os dois ramos de layout usam o mesmo caminho.
  const aoConcluir = (task: ClientTask, client: Client | null) => {
    if (client) {
      abrirMenuDeConclusao({ task, client });
      return;
    }
    Alert.alert('Concluir tarefa', `Marcar "${task.title}" como concluída?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Concluir', onPress: () => concluirTarefa({ id: task.id, status: 'concluida' }) },
    ]);
  };

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

    const sev = task.severity ?? '';
    const badge = SLA_BADGE[sev] ?? SLA_BADGE_PADRAO;
    const parRegua = SLA_REGUA[sev];
    const regua = parRegua ? (isDark ? parRegua.escuro : parRegua.claro) : SLA_REGUA_PADRAO;
    const prazo = prazoDaTarefa(task);

    return (
      <TouchableOpacity
        key={task.id}
        activeOpacity={0.9}
        disabled={!layout.ehDesktop}
        onPress={() => (client ? abrirLeadNoMapa(client) : abrirLeadPorId(task.client_id))}
        style={[
          styles.taskCard,
          layout.ehDesktop && styles.taskCardWeb,
          !layout.ehDesktop && styles.cartaoTarefa,
          !layout.ehDesktop && { borderLeftColor: regua },
        ]}
        {...ds({ hover: 'borda', trans: '1' })}
      >
        <View style={styles.taskCardTop}>
          <Text
            style={[styles.taskLead, layout.ehDesktop && styles.taskLeadWeb, !layout.ehDesktop && styles.leadTarefa]}
            numberOfLines={2}
          >
            {leadNome}
          </Text>
          <View
            style={[
              styles.taskBadge,
              layout.ehDesktop
                ? task.severity === 'D5'
                  ? { backgroundColor: 'var(--tint-red)' }
                  : task.severity === 'D2'
                    ? { backgroundColor: 'var(--tint-amber)' }
                    : { backgroundColor: 'var(--surface-2)' }
                : [styles.badgeTarefa, { backgroundColor: badge.bg }],
            ]}
          >
            <Text
              style={[
                styles.taskBadgeText,
                !layout.ehDesktop && [styles.badgeTarefaTexto, { color: badge.fg }],
                layout.ehDesktop && {
                  color:
                    task.severity === 'D5'
                      ? 'var(--tint-red-text)'
                      : task.severity === 'D2'
                        ? 'var(--tint-amber-text)'
                        : 'var(--text-faint)',
                },
              ]}
            >
              {badgeText}
            </Text>
          </View>
        </View>

        <Text style={[styles.taskTipo, layout.ehDesktop && styles.taskTipoWeb, !layout.ehDesktop && styles.tarefaTexto]}>{tipo}</Text>
        {/* No celular a linha e' o PRAZO ("venceu ha 3 dias"), nao "N dias em
            etapa": a pergunta da tela e' o que venceu, e dias-na-etapa faz a
            pessoa calcular de cabeca. O desktop segue como estava. */}
        {layout.ehDesktop ? (
          typeof days === 'number' ? (
            <View style={styles.metaLinhaWeb}>
              <IconClock width={16} height={16} fill={iconColors.muted} />
              <Text style={[styles.taskMeta, styles.taskMetaWeb]}>{days} dia(s) em {etapaMeta ?? 'etapa'}</Text>
            </View>
          ) : null
        ) : prazo ? (
          <View style={styles.linhaPrazo}>
            <IconClock
              width={16}
              height={16}
              fill={prazo.vencido ? iconColors.tintRedText : iconColors.faint}
            />
            <Text
              style={[
                styles.prazoTexto,
                { color: prazo.vencido ? 'var(--tint-red-text)' : 'var(--text-faint)' },
              ]}
            >
              {prazo.texto}
            </Text>
          </View>
        ) : null}
        {responsavel ? (
          <View style={styles.taskRespRow}>
            {layout.ehDesktop && <IconUser width={16} height={16} fill={iconColors.muted} />}
            <Text style={[styles.taskMeta, layout.ehDesktop && styles.taskMetaWeb, { flexShrink: 1 }]} numberOfLines={1}>
              {responsavelNome}
            </Text>
            {inativoMatch ? (
              <View style={styles.taskInativoTag}>
                <Text style={styles.taskInativoTagText}>DESATIVADO</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.taskActionsRow, !layout.ehDesktop && styles.acoesTarefa]}>
          {layout.ehDesktop ? (
            <>
              {client && (
                <TouchableOpacity
                  style={[sharedStyles.smallActionButton, styles.acaoAgendarWeb]}
                  onPress={() => agendarDemo(client, task)}
                >
                  <Text style={[sharedStyles.smallActionButtonText, { color: 'var(--tint-red-text)' }]}>Agendar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessibilityLabel="Concluir tarefa"
                style={[sharedStyles.smallActionButton, styles.acaoConcluirWeb]}
                onPress={() => aoConcluir(task, client)}
              >
                <IconCheck width={20} height={20} fill={iconColors.muted} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* "Abrir lead" saiu como botao: o toque no card ja' abre a ficha
                  — mesma regra da Rota e da Agenda. Sobram as duas acoes que a
                  tela existe pra provocar. */}
              {client && (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.botaoAgendar}
                  onPress={() => agendarDemo(client, task)}
                >
                  <Text style={styles.botaoAgendarTexto}>Agendar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Concluir tarefa"
                style={styles.botaoConcluir}
                onPress={() => aoConcluir(task, client)}
              >
                <IconCheck width={24} height={24} fill={iconColors.onSurface} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView contentContainerStyle={[
      // 16/16/40 do handoff. Os 40 sao os 24 que o FAB protrai acima da barra
      // mais folga: a barra e o `insets` vivem FORA deste scroll (irmaos na
      // coluna da tela), e os `90 + 24 + insets` de antes contavam a barra
      // duas vezes, deixando ~74px mortos no fim. Mesma correcao da Rota e da
      // Agenda.
      { padding: 16, paddingBottom: 40 },
    layout.ehDesktop && { padding: 24 },
    // Mesmo teto da lista de leads: sem ele o conteudo se espalha por
    // toda a largura do monitor e a linha de texto fica ilegivel.
    !layout.ehDesktop && { maxWidth: layout.larguraMaxima, width: '100%', alignSelf: 'center' }]}>
      {/* Cabeçalho enxuto: o texto explicativo que ficava aqui virou o modal
          ⓘ, que já tinha as regras completas — ele ocupava um terço da tela
          em toda visita, mesmo pra quem já conhece a mecânica. */}
      {/* No celular o titulo "Tarefas · N" e o acesso as regras subiram pro
          header da casca (M5 secao 1): la' o botao de ajuda tem 48px, contra
          os 30 do `taskInfoButton` que vivia aqui. */}
      {layout.ehDesktop && (
        /* Desktop: o header do shell ja' diz "Tarefas" e as colunas contam —
           sobra so' o acesso a's regras, discreto e a' direita (prompt 08). */
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[sharedStyles.smallActionButton, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
            onPress={abrirRegras}
          >
            <Text style={sharedStyles.smallActionButtonText}>Como as tarefas são geradas</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Abas de ESTADO, nao kanban. As tres colunas do desktop viram abas: a
          rolagem horizontal de um quadro e' toque errado garantido num app que
          se usa em pe', com uma mao. A faixa fica sobre --surface (nao sobre o
          header vermelho), entao o par ativo e' #C8131B/branco e funciona nos
          dois temas — diferente do segmented do Mapa e da tira da Agenda, que
          vivem sobre o header e precisam do par de opacidade. */}
      {!layout.ehDesktop && (
        <View style={styles.faixaAbas}>
          {ABAS.map((aba) => {
            const ativo = tabTarefa === aba.chave;
            const total = colunasVencimento.find((c) => c.chave === aba.chave)?.itens.length ?? 0;
            return (
              <TouchableOpacity
                key={aba.chave}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                style={[styles.aba, ativo ? styles.abaAtiva : styles.abaInativa]}
                onPress={() => setTabTarefa(aba.chave)}
              >
                <Text style={[styles.abaTexto, ativo ? styles.abaTextoAtivo : styles.abaTextoInativo]} numberOfLines={1}>
                  {aba.rotulo} · {total}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {activeVendor !== null && activeVendor !== myHubspotId ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={sharedStyles.taskVendorHint}>
            Filtro ativo: {vendorLabel(activeVendor)}
          </Text>
          {limparFiltroVendedor && (
            <TouchableOpacity accessibilityRole="button" onPress={limparFiltroVendedor}>
              <Text style={[sharedStyles.taskVendorHint, { textDecorationLine: 'underline' }]}>limpar</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Chips: quanto tem de cada urgência, e filtro de um toque. No desktop
          as colunas do kanban ja' contam — os chips sao so' do celular. */}
      {!layout.ehDesktop && chips.length > 1 && (
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

      {sorted.length === 0 && layout.ehDesktop ? (
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
              {/* Colunas por VENCIMENTO (prompt 08a/08b). As tres sempre
                  aparecem — coluna vazia mostra a copy padrao. */}
              {colunasVencimento.map((col) => (
                <View key={col.chave} style={styles.kanbanColuna}>
                  <View style={styles.kanbanCabecalho}>
                    <View style={[sharedStyles.countChipDot, { backgroundColor: col.cor }]} />
                    <Text style={styles.kanbanTitulo}>{col.titulo}</Text>
                    <View style={[styles.kanbanContagem, { backgroundColor: col.tintaBg }]}>
                      <Text style={[styles.kanbanContagemTexto, { color: col.tintaFg }]}>{col.itens.length}</Text>
                    </View>
                  </View>
                  <ScrollView
                    style={{ maxHeight: Math.max(360, layout.altura - 320) }}
                    contentContainerStyle={{ padding: 12 }}
                    showsVerticalScrollIndicator
                  >
                    {col.itens.length === 0 ? (
                      <Text style={[sharedStyles.emptyStateText, { fontSize: 12, textAlign: 'center', paddingVertical: 16 }]}>
                        Nenhuma tarefa pendente.
                      </Text>
                    ) : (
                      col.itens.map(renderTaskCard)
                    )}
                  </ScrollView>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          (() => {
            // Lista PLANA da aba escolhida — o agrupamento por severidade saiu:
            // ele respondia "que tipo de cobranca", e a pergunta da tela e' "o
            // que venceu". O chip de severidade segue filtrando por cima.
            const itens = (colunasVencimento.find((c) => c.chave === tabTarefa)?.itens ?? [])
              .filter((t) => filtroSev === null || sevKey(t.severity) === filtroSev);
            if (itens.length === 0) {
              // As duas copies originais ficam. O `{status}` do "Nenhuma
              // {status} encontrada" era a SEVERIDADE (D5/D2/SLA) e continua
              // sendo quando o chip esta' ativo. Sem chip, o rotulo da aba nao
              // cabe na frase — "Nenhuma proximas encontrada" nao e' portugues
              // — entao a terceira forma e' a mesma frase no singular.
              const texto = sorted.length === 0
                ? 'Nenhuma tarefa pendente.'
                : filtroSev
                  ? `Nenhuma ${filtroSev} encontrada`
                  : tabTarefa === 'atrasadas'
                    ? 'Nenhuma tarefa atrasada'
                    : tabTarefa === 'hoje'
                      ? 'Nenhuma tarefa para hoje'
                      : 'Nenhuma tarefa próxima';
              return (
                <View style={styles.vazio}>
                  <IconClipboardCheck width={40} height={40} fill={iconColors.faint} />
                  <Text style={styles.vazioTexto}>{texto}</Text>
                </View>
              );
            }
            return <View style={styles.listaTarefas}>{itens.map(renderTaskCard)}</View>;
          })()
        )
      )}
    </ScrollView>
  );
}

// Estilos exclusivos desta tela, movidos do App.tsx como estavam.
const styles = StyleSheet.create({
  // ---- Abas de estado (M5) ----
  // Fora do padding de 16 do scroll: a faixa vai de borda a borda e leva a
  // propria borda inferior, como um cabecalho fixo de secao.
  faixaAbas: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 16,
    backgroundColor: 'var(--surface)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  aba: {
    flex: 1,
    minWidth: 0,
    height: 40,
    // Raio 12 nos QUATRO cantos, nao so' nas pontas: com gap 8 as abas sao
    // pilulas separadas, e cantos internos retos ficariam quadrados soltos no
    // vazio. E' o que a referencia (05-tarefas.png) mostra.
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  abaAtiva: { backgroundColor: '#C8131B' },
  abaInativa: { backgroundColor: 'var(--surface-2)' },
  abaTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600' },
  abaTextoAtivo: { color: '#FFFFFF' },
  abaTextoInativo: { color: 'var(--text-muted)' },

  // ---- Card de tarefa (M5) ----
  listaTarefas: { gap: 12 },
  leadTarefa: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600' },
  cartaoTarefa: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 0,
    // A regua de 4px leva a cor do SLA — variavel DIFERENTE da do badge.
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  badgeTarefa: { minWidth: 0, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeTarefaTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600' },
  tarefaTexto: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.25,
    fontWeight: '400',
    color: 'var(--text-muted)',
    marginTop: 6,
  },
  linhaPrazo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  prazoTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600' },
  acoesTarefa: { flexWrap: 'nowrap', gap: 8, marginTop: 16 },
  botaoAgendar: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#C8131B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoAgendarTexto: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  botaoConcluir: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vazio: { alignItems: 'center', justifyContent: 'center', marginTop: 24, gap: 12 },
  vazioTexto: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.25,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
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
  taskLeadWeb: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600' },
  taskTipoWeb: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  taskMetaWeb: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600' },
  metaLinhaWeb: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },

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



  taskActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },


});
