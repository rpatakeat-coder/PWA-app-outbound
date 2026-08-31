import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../components/Alert';
import type { Client, ClientMeeting, FieldRouteStop } from '../types/client';
import { useFieldOps } from '../hooks/useFieldOps';
import { useLayout } from '../hooks/useLayout';
import { useTheme } from '../theme';
import {
  IconCalendar,
  IconCall,
  IconCar,
  IconChevronRight,
  IconClose,
  IconText,
  useIconColors,
} from '../components/icons';
import { ds, sharedStyles } from './sharedStyles';

// Tela de Agenda, extraida do App.tsx (prompt 02 do handoff) — refactor puro.
// Os estados que so' a agenda usava (semana visivel, filtro de tipo, acordeao
// do passado, exportacao) migraram pra ca'; o resto chega por props.
type FieldOps = ReturnType<typeof useFieldOps>;

interface Props {
  clients: Client[];
  meetings: ClientMeeting[];
  routeStops: FieldOps['stops'];
  /** Nome por id pra reuniao de lead fora do viewport (useNomesDeClientes). */
  nomesReunioes: Map<string, string>;
  openClientById: (id: string) => void;
  vendorLabel: (idHubspot: string | null) => string;
  canViewGestor: boolean;
  isViewer: boolean;
  confirmCancelMeeting: (m: ClientMeeting) => void;
  nomeDoLead: (c: Client) => string;
  fieldOps: FieldOps;
  /** Mesmo filtro de vendedor do mapa/lista (estado compartilhado no App). */
  vendorFilterHubspotId: string | null;
  reagendar: (v: { client: Client; type: 'reuniao' | 'follow_up'; reschedule?: ClientMeeting }) => void;
  /** Abre a aba Rota do dia (overlay de item de rota — prompt M3). */
  abrirRota: () => void;
  /** Dia que a tira da semana (no header, em App.tsx) selecionou. */
  diaSelecionado: Date;
}

export function AgendaScreen({
  clients,
  meetings,
  routeStops,
  nomesReunioes,
  openClientById,
  vendorLabel,
  canViewGestor,
  isViewer,
  confirmCancelMeeting,
  reagendar,
  abrirRota,
  nomeDoLead,
  fieldOps,
  vendorFilterHubspotId,
  diaSelecionado,
}: Props) {
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const iconColors = useIconColors();
  const { isDark } = useTheme();
  const [calSemanaOffset, setCalSemanaOffset] = useState(0);
  // Overlay de detalhe do COMPROMISSO (prompt M3) — nao e' a ficha do lead.
  const [compromisso, setCompromisso] = useState<(typeof allAgendaItems)[number] | null>(null);
  const [agendaTypeFilter, setAgendaTypeFilter] = useState<string | null>(null);
  const allAgendaItems = [
    ...routeStops.map(stop => ({ kind: 'route' as const, at: stop.planned_at, stop, client: stop.client })),
    ...meetings.map(meeting => ({
      kind: 'meeting' as const,
      at: meeting.scheduled_at,
      meeting,
      client: clients.find(c => c.id === meeting.client_id) ?? null,
    })),
  ].sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());

  // Aplica o mesmo filtro de vendedor que o mapa/lista usam — se o admin
  // escolheu um vendedor, agenda mostra so itens cujo cliente eh dele.
  // Itens sem client carregado (raro) ficam fora quando ha filtro ativo.
  const porVendedor = vendorFilterHubspotId === null
    ? allAgendaItems
    : vendorFilterHubspotId === '__none__'
      ? allAgendaItems.filter(item => !item.client?.vendedor_id_hubspot)
      : allAgendaItems.filter(item => item.client?.vendedor_id_hubspot === vendorFilterHubspotId);

  // Tipo do compromisso — define a cor da barra do card e os chips do topo.
  // Demo, follow up e parada de rota renderizavam idênticos; a cor é o que
  // deixa varrer o dia sem ler o texto de cada um.
  const tipoDoItem = (item: typeof allAgendaItems[number]) =>
    item.kind === 'meeting'
      ? (item.meeting.type === 'follow_up' ? 'follow_up' : 'reuniao')
      : 'rota';
  // UMA tabela de tipo pra tela inteira. Antes havia duas — `CORES_TIPO_WEB`
  // (calendario do desktop) e `TIPO_META` (lista e chips do celular) — com
  // cores DIFERENTES pro mesmo tipo: uma Demo era violeta no calendario e
  // vermelha no card, e uma Rota vermelha no calendario e verde no chip. O
  // tipo e' a chave de leitura da agenda; nao pode mudar de cor por onde se
  // olha. Fica a do calendario, que e' a do handoff.
  const META_TIPO: Record<string, {
    cor: string;
    tinta: string;
    rotulo: string;
    plural: string;
    Icone: typeof IconCar;
  }> = {
    rota: { cor: '#C8131B', tinta: '#FAE8E9', rotulo: 'Rota', plural: 'Rotas', Icone: IconCar },
    reuniao: { cor: '#7c3aed', tinta: '#F1EBFE', rotulo: 'Demo', plural: 'Demos', Icone: IconCalendar },
    follow_up: { cor: '#01AFFF', tinta: '#E6F7FF', rotulo: 'Follow-up', plural: 'Follow ups', Icone: IconCall },
  };
  // Contagem vem de ANTES do filtro de tipo — senão o chip ativo zeraria os
  // outros e não daria pra voltar sabendo o que tem em cada um.
  const contagemTipo = (['reuniao', 'follow_up', 'rota'] as const)
    .map((t) => ({ tipo: t, total: porVendedor.filter((i) => tipoDoItem(i) === t).length }))
    .filter((c) => c.total > 0);

  const agendaItems = agendaTypeFilter
    ? porVendedor.filter((i) => tipoDoItem(i) === agendaTypeFilter)
    : porVendedor;

  // O corpo mostra UM dia — o que a tira do header selecionou. Substitui o
  // acordeao de passado/hoje/futuro: a tira ja' e' a navegacao por data, e
  // manter as duas leituras na mesma tela era perguntar duas vezes "que dia".
  const inicioDoDia = new Date(diaSelecionado);
  inicioDoDia.setHours(0, 0, 0, 0);
  const fimDoDia = new Date(inicioDoDia);
  fimDoDia.setDate(fimDoDia.getDate() + 1);
  const itensDoDia = agendaItems.filter((item) => {
    if (!item.at) return false;
    const t = new Date(item.at).getTime();
    return t >= inicioDoDia.getTime() && t < fimDoDia.getTime();
  });

  // Nome do lead do item, com a base inteira como fonte: primeiro o client
  // carregado (area do mapa), senao o dicionario por id (reunioes fora do
  // viewport). So' depois disso admite "nao encontrado".
  const nomeDoItem = (item: typeof allAgendaItems[number]): string | null => {
    if (item.client) return nomeDoLead(item.client);
    if (item.kind === 'meeting') return nomesReunioes.get(item.meeting.client_id) ?? null;
    return null;
  };

  const renderAgendaItem = (item: typeof agendaItems[number], index: number) => {
    const date = item.at ? new Date(item.at) : null;
    const time = date ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const client = item.client;
    const nome = nomeDoItem(item) ?? 'Lead nao encontrado';
    const tipo = tipoDoItem(item);
    const meta = META_TIPO[tipo];

    // "Demo · Sushi Kaito": o tipo abre o titulo porque e' o que se varre com
    // o olho; o nome do lead vem logo atras, na mesma linha.
    const titulo = `${meta.rotulo} · ${nome}`;

    // Sublinha: ocasiao + lugar, os mesmos dados de antes. Nao ha' campo novo.
    const visitas = client ? (client.visit_count || (client.visited_at ? 1 : 0)) : 0;
    const ocasiao = item.kind === 'meeting'
      ? (item.meeting.type === 'follow_up' ? 'Follow up' : 'Reunião/demo')
      : visitas > 0 ? 'Revisita' : '1ª visita';
    const lugar = client?.bairro?.trim() || client?.cidade?.trim() || null;
    const sublinha = [ocasiao, lugar].filter(Boolean).join(' · ');

    // Duracao so' existe em compromisso marcado; parada de rota nao tem.
    const duracao = item.kind === 'meeting' && item.meeting.duration_minutes
      ? (item.meeting.duration_minutes >= 60
          ? `${Math.floor(item.meeting.duration_minutes / 60)}h${item.meeting.duration_minutes % 60 ? `${item.meeting.duration_minutes % 60}` : ''}`
          : `${item.meeting.duration_minutes}min`)
      : null;

    const agendavel = item.kind === 'meeting' && !isViewer && !!client;

    return (
      <View
        key={item.kind === 'meeting' ? `meeting-${item.meeting.id}` : `route-${item.stop.id ?? index}`}
        style={styles.linhaAgenda}
      >
        {/* Coluna de hora com 52px FIXOS. Fluida, as horas desalinhavam entre
            itens e a coluna deixava de se ler como regua. */}
        <View style={styles.colunaHora}>
          <Text style={styles.horaTexto}>{time}</Text>
          {duracao ? <Text style={styles.duracaoTexto}>{duracao}</Text> : null}
        </View>

        {/* O toque no card abre o compromisso — e' o caminho pras acoes que
            sairam daqui (ficha do lead, rota do dia). Ate' agora o overlay so'
            tinha entrada pelo calendario do desktop; no celular era codigo
            morto. */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${titulo}, ${time}`}
          activeOpacity={0.9}
          onPress={() => setCompromisso(item)}
          style={[styles.cardAgenda, { borderLeftColor: meta.cor }]}
        >
          <View style={styles.cardTopo}>
            <meta.Icone width={20} height={20} fill={meta.cor} />
            <Text style={styles.cardTitulo} numberOfLines={2}>{titulo}</Text>
          </View>
          {sublinha ? <Text style={styles.cardSublinha} numberOfLines={1}>{sublinha}</Text> : null}

          {agendavel && (
            <View style={styles.cardAcoes}>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.botaoReagendar}
                onPress={() => reagendar({
                  client: client as Client,
                  type: (item.meeting.type ?? 'reuniao') as 'reuniao' | 'follow_up',
                  reschedule: item.meeting,
                })}
              >
                <Text style={styles.botaoReagendarTexto}>Reagendar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.botaoCancelar}
                onPress={() => confirmCancelMeeting(item.meeting)}
              >
                <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // NAO e' a ficha do lead: e' o compromisso. Drawer padrao de 480 no
  // desktop; bottom sheet no celular. Le' o item ja carregado — sem query.
  const overlayCompromisso = compromisso ? (() => {
    const tipo = tipoDoItem(compromisso);
    const meta = META_TIPO[tipo];
    const nome = nomeDoItem(compromisso) ?? meta?.rotulo ?? 'Compromisso';
    const idCliente = compromisso.client?.id ?? (compromisso.kind === 'meeting' ? compromisso.meeting.client_id : null);
    const quando = compromisso.at
      ? new Date(compromisso.at).toLocaleString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'sem horário';
    const duracao = compromisso.kind === 'meeting' && compromisso.meeting.duration_minutes
      ? ` · ${compromisso.meeting.duration_minutes} min`
      : '';
    const ehRota = tipo === 'rota';
    return (
      <Modal visible transparent animationType={layout.ehDesktop ? 'fade' : 'slide'} onRequestClose={() => setCompromisso(null)}>
        <View style={[ovl.fundo, layout.ehDesktop ? ovl.fundoDesktop : ovl.fundoMobile]}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setCompromisso(null)}
            accessibilityLabel="Fechar"
          />
          <View style={[ovl.painel, layout.ehDesktop ? ovl.painelDesktop : ovl.painelMobile]}>
            {!layout.ehDesktop && <View style={ovl.alca} />}
            <View style={ovl.topo}>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: meta?.cor ?? meta?.cor ?? 'var(--text-faint)' }} />
                  <Text style={ovl.kicker}>{(meta?.rotulo ?? meta?.rotulo ?? 'Compromisso').toUpperCase()}</Text>
                </View>
                <Text style={ovl.titulo} numberOfLines={2}>{nome}</Text>
                <Text style={ovl.sublinha} numberOfLines={1}>{quando}{duracao}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                style={[ovl.fechar, layout.ehDesktop && { width: 40, height: 40, borderRadius: 8 }]}
                {...ds({ hover: 'surface2', trans: '1' })}
                onPress={() => setCompromisso(null)}
              >
                <IconClose width={20} height={20} fill={iconColors.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[ovl.corpo, { gap: layout.ehDesktop ? 24 : 16 }]}>
              {idCliente != null && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Abrir ficha do lead"
                  style={ovl.linhaLead}
                  {...ds({ hover: 'surface2', trans: '1' })}
                  onPress={() => openClientById(idCliente)}
                >
                  <View style={[ovl.barraTemp, { backgroundColor: meta?.cor ?? 'var(--stroke-default)' }]} />
                  <Text style={ovl.linhaLeadNome} numberOfLines={1}>{nome}</Text>
                  <IconChevronRight width={20} height={20} fill={iconColors.muted} />
                </TouchableOpacity>
              )}
              {compromisso.kind === 'meeting' && compromisso.meeting.observacoes ? (
                <View style={[ovl.observacoes, { borderRadius: layout.ehDesktop ? 8 : 16 }]}>
                  <Text style={ovl.observacoesTexto}>{compromisso.meeting.observacoes}</Text>
                </View>
              ) : null}
              {ehRota && (
                <View style={{ gap: 8 }}>
                  {routeStops.slice(0, 12).map((stop, i) => (
                    <View key={`${stop.client_id}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={ovl.indiceParada}>
                        <Text style={ovl.indiceParadaTexto}>{i + 1}</Text>
                      </View>
                      <Text style={ovl.paradaNome} numberOfLines={1}>
                        {stop.client ? nomeDoLead(stop.client) : 'Parada'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
            <View style={[ovl.rodape, layout.ehDesktop ? { flexDirection: 'row', padding: 24 } : { flexDirection: 'column', padding: 16, paddingBottom: 32 }]}>
              {ehRota ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[ovl.ctaCheio, !layout.ehDesktop && { height: 48 }]}
                  onPress={() => { setCompromisso(null); abrirRota(); }}
                >
                  <Text style={ovl.ctaCheioTexto}>Abrir rota do dia</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[ovl.ctaTonal, !layout.ehDesktop && { height: 48 }, !compromisso.client && { opacity: 0.4 }]}
                    disabled={!compromisso.client}
                    onPress={() => {
                      if (compromisso.kind !== 'meeting' || !compromisso.client) return;
                      setCompromisso(null);
                      reagendar({
                        client: compromisso.client,
                        type: (compromisso.meeting.type ?? 'reuniao') as 'reuniao' | 'follow_up',
                        reschedule: compromisso.meeting,
                      });
                    }}
                  >
                    <Text style={ovl.ctaTonalTexto}>Reagendar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[ovl.ctaVazado, !layout.ehDesktop && { height: 48 }]}
                    onPress={() => {
                      if (compromisso.kind !== 'meeting') return;
                      setCompromisso(null);
                      confirmCancelMeeting(compromisso.meeting);
                    }}
                  >
                    <Text style={ovl.ctaVazadoTexto}>Cancelar compromisso</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  })() : null;


  return (
    <>
    <ScrollView contentContainerStyle={[
      // 16/16/40 do handoff. Os 40 sao os 24 que o FAB central protrai acima
      // da barra, mais folga — a barra e o `insets` vivem FORA deste scroll
      // (sao irmaos na coluna da tela), entao os `90 + 24 + insets` de antes
      // contavam a barra duas vezes e deixavam ~74px mortos no fim. Mesma
      // correcao feita na Rota.
      { padding: 16, paddingBottom: 40 },
    // Mesmo teto da lista de leads: sem ele o conteudo se espalha por
    // toda a largura do monitor e a linha de texto fica ilegivel.
    { maxWidth: layout.larguraMaxima, width: '100%', alignSelf: 'center' }]}>
      {/* Cabeçalho enxuto: o parágrafo "rota planejada, demos e follow-ups em
          ordem cronológica" descrevia o que a tela mostra sozinha. */}
      {vendorFilterHubspotId !== null ? (
        <Text style={sharedStyles.taskVendorHint}>
          Filtro ativo: {vendorLabel(vendorFilterHubspotId)} — tire no modal de filtros.
        </Text>
      ) : null}

      {/* Chips por tipo: contam e filtram num toque. No desktop moram na
          barra do calendario — aqui so' na lista do celular/tablet. */}
      {!layout.ehDesktop && contagemTipo.length > 1 && (
        <View style={sharedStyles.countChipsRow}>
          {contagemTipo.map(({ tipo, total }) => {
            const ativo = agendaTypeFilter === tipo;
            const meta = META_TIPO[tipo];
            return (
              <TouchableOpacity
                key={tipo}
                style={[sharedStyles.countChip, ativo && { borderColor: meta.cor, backgroundColor: 'var(--surface)' }]}
                onPress={() => setAgendaTypeFilter(ativo ? null : tipo)}
              >
                <View style={[sharedStyles.countChipDot, { backgroundColor: meta.cor }]} />
                <Text style={[sharedStyles.countChipText, ativo && { color: 'var(--text)' }]}>
                  {meta.plural} {total}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {layout.ehDesktop ? (
        // CALENDARIO SEMANAL — so' desktop (>= 1024; prompt 07). No celular a agenda segue lista:
        // na rua a pergunta e' "o que e' agora"; na mesa, "como esta' minha
        // semana". Sete colunas sempre (handoff, tela 4).
        (() => {
          const hojeCal = new Date();
          const desloc = (hojeCal.getDay() + 6) % 7; // 0 = segunda
          const seg = new Date(hojeCal);
          seg.setDate(hojeCal.getDate() - desloc + calSemanaOffset * 7);
          seg.setHours(0, 0, 0, 0);
          const diasCal = Array.from({ length: 7 }, (_, k) => {
            const d = new Date(seg);
            d.setDate(seg.getDate() + k);
            const itens = agendaItems
              .filter((it) => {
                if (!it.at) return false;
                const t = new Date(it.at);
                return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth() && t.getDate() === d.getDate();
              })
              .sort((a, b) => String(a.at).localeCompare(String(b.at)));
            return { d, itens };
          });
          const visiveis = diasCal;
          const fimSemana = diasCal[6].d;
          const rotuloJanela = `${seg.getDate()} ${seg.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')} – ${fimSemana.getDate()} ${fimSemana.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}`;
          const totalDaSemana = diasCal.reduce((soma, dia) => soma + dia.itens.length, 0);
          return (
            <>
              <View style={styles.calNav}>
                <TouchableOpacity style={styles.calNavBotao} onPress={() => setCalSemanaOffset((v) => v - 1)}>
                  <Text style={styles.calNavSeta}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calNavRotulo}>
                  {rotuloJanela}
                  <Text style={styles.calNavTotal}>  ·  {totalDaSemana} {totalDaSemana === 1 ? 'item' : 'itens'}</Text>
                </Text>
                {calSemanaOffset !== 0 && (
                  <TouchableOpacity style={styles.calNavHoje} onPress={() => setCalSemanaOffset(0)}>
                    <Text style={styles.calNavHojeTexto}>hoje</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.calNavBotao} onPress={() => setCalSemanaOffset((v) => v + 1)}>
                  <Text style={styles.calNavSeta}>›</Text>
                </TouchableOpacity>
                {contagemTipo.length > 1 && contagemTipo.map(({ tipo, total }) => {
                  const ativo = agendaTypeFilter === tipo;
                  const meta = META_TIPO[tipo];
                  return (
                    <TouchableOpacity
                      key={tipo}
                      style={[sharedStyles.countChip, ativo && { borderColor: meta.cor, backgroundColor: 'var(--surface)' }]}
                      onPress={() => setAgendaTypeFilter(ativo ? null : tipo)}
                    >
                      <View style={[sharedStyles.countChipDot, { backgroundColor: meta.cor }]} />
                      <Text style={[sharedStyles.countChipText, ativo && { color: 'var(--text)' }]}>
                        {meta.plural} {total}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <View style={{ flex: 1 }} />
                {Object.entries(META_TIPO).map(([k, meta]) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: meta.cor }} />
                    <Text style={styles.calLegendaTexto}>{meta.rotulo}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.calSemana}>
                {visiveis.map(({ d, itens }, k) => {
                  const ehHojeCal = d.toDateString() === hojeCal.toDateString();
                  return (
                    <View key={k} style={[styles.calDia, ehHojeCal && styles.calDiaHoje]}>
                      <View style={[styles.calDiaCabecalho, ehHojeCal && styles.calDiaCabecalhoHoje]}>
                        <Text style={[styles.calDiaSemana, ehHojeCal && { color: 'var(--tint-red-text)' }]}>
                          {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                        </Text>
                        <Text style={[styles.calDiaNumero, ehHojeCal && { color: 'var(--tint-red-text)' }]}>
                          {d.getDate()}
                        </Text>
                      </View>
                      <ScrollView style={styles.calDiaCorpoRolagem} contentContainerStyle={styles.calDiaCorpo} showsVerticalScrollIndicator={false}>
                      {itens.length === 0 ? (
                        <Text style={styles.calVazio}>livre</Text>
                      ) : (
                        itens.map((it, ix) => {
                          const meta = META_TIPO[tipoDoItem(it)];
                          const hora = it.at
                            ? new Date(it.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                            : '';
                          const nomeChip = nomeDoItem(it) ?? meta?.rotulo ?? 'Item';
                          const idCliente = it.client?.id ?? (it.kind === 'meeting' ? it.meeting.client_id : null);
                          return (
                            <TouchableOpacity
                              key={ix}
                              style={[
                                styles.calChip,
                                { borderLeftColor: meta?.cor ?? 'var(--border)' },
                                { backgroundColor: isDark ? 'var(--surface-2)' : meta?.tinta ?? 'var(--surface-2)' },
                              ]}
                              onPress={() => setCompromisso(it)}
                            >
                              <Text style={[styles.calChipHora, meta && { color: meta.cor }]}>{hora} · {meta?.rotulo ?? meta?.rotulo}</Text>
                              <Text style={styles.calChipTitulo} numberOfLines={2}>{nomeChip}</Text>
                            </TouchableOpacity>
                          );
                        })
                      )}
                      </ScrollView>
                    </View>
                  );
                })}
              </View>
            </>
          );
        })()
      ) : itensDoDia.length === 0 ? (
        <View style={styles.vazio}>
          <IconCalendar width={40} height={40} fill={iconColors.faint} />
          <Text style={styles.vazioTexto}>Agenda vazia.</Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {itensDoDia.map(renderAgendaItem)}
        </View>
      )}
    </ScrollView>
    {overlayCompromisso}
    </>
  );
}

// Estilos exclusivos desta tela, movidos do App.tsx como estavam.
const styles = StyleSheet.create({
  // ---- Timeline do dia (M4) ----
  timeline: { gap: 16 },
  linhaAgenda: { flexDirection: 'row', gap: 12 },
  // 52px FIXOS (nao `width` fluido): a coluna so' se le como regua se as horas
  // de itens diferentes cairem na mesma vertical.
  colunaHora: { flexBasis: 52, flexGrow: 0, flexShrink: 0, width: 52, paddingTop: 16 },
  horaTexto: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
    fontWeight: '700',
    color: 'var(--text)',
    fontVariant: ['tabular-nums'],
  },
  duracaoTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, color: 'var(--text-faint)' },
  cardAgenda: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    // A barra de 4px e' a cor do TIPO — e' o que deixa varrer o dia sem ler
    // o texto de cada card.
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  cardTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitulo: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.15,
    fontWeight: '600',
    color: 'var(--text)',
  },
  cardSublinha: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    color: 'var(--text-faint)',
    marginTop: 4,
  },
  cardAcoes: { flexDirection: 'row', gap: 8, marginTop: 12 },
  // 48 de altura, nao os 32 do desktop: na rua o polegar e' o cursor.
  botaoReagendar: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'var(--tint-red)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoReagendarTexto: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.15,
    fontWeight: '600',
    color: 'var(--tint-red-text)',
  },
  botaoCancelar: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoCancelarTexto: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.15,
    fontWeight: '600',
    color: 'var(--text)',
  },
  vazio: { alignItems: 'center', justifyContent: 'center', marginTop: 24, gap: 12 },
  vazioTexto: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.25,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  calChip: {
    borderLeftWidth: 3,
    backgroundColor: 'var(--surface-2)',
    borderRadius: 4,
    padding: 8,
  },
  calChipHora: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: 'var(--text-muted)' },
  calChipTitulo: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'var(--text)' },
  calDia: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'var(--surface)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--border)',
    minHeight: 520,
    overflow: 'hidden',
  },
  calDiaCabecalho: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  calDiaCabecalhoHoje: { backgroundColor: 'var(--tint-red)' },
  calDiaCorpo: { padding: 8, gap: 8 },
  // 520 de coluna - ~61 do cabecalho: o dia cheio rola por dentro, nao vaza.
  calDiaCorpoRolagem: { maxHeight: 459 },
  calDiaHoje: { borderColor: '#C8131B' },
  calDiaNumero: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: 'var(--text)' },
  calDiaSemana: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  calLegendaTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  // DESKTOP-ONLY (>= 1024px): toda a familia `cal*` — inclusive os alvos de
  // 32px do calNavBotao/calNavHoje — so' monta dentro do ramo
  // `layout.ehDesktop`. No celular quem navega a semana e' a tira do header
  // (M4), que tem alvo de 48. Nao ha' 32px tocavel na Agenda do aparelho.
  calNav: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  calNavBotao: {
    width: 32, height: 32, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface)',
  },
  calNavHoje: {
    paddingHorizontal: 12, height: 32, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface)',
  },
  calNavHojeTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  calNavRotulo: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: 'var(--text)' },
  calNavSeta: { fontSize: 16, lineHeight: 20, color: 'var(--text)', fontWeight: '600' },
  calNavTotal: { fontSize: 12, fontWeight: '500', color: 'var(--text-subtle)' },
  calSemana: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  calVazio: { fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', marginTop: 16 },
});

// Estilos do overlay de compromisso (prompt M3).
const ovl = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.32)' },
  fundoDesktop: { alignItems: 'flex-end' },
  fundoMobile: { justifyContent: 'flex-end' },
  painel: { backgroundColor: 'var(--surface)', overflow: 'hidden' },
  painelDesktop: {
    width: 480,
    maxWidth: '100%',
    height: '100%',
    borderLeftWidth: 1,
    borderLeftColor: 'var(--border)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: -8, height: 0 },
    shadowRadius: 16,
  },
  painelMobile: {
    maxHeight: '92%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
  },
  alca: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'var(--surface-3)',
    marginTop: 12,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  kicker: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  titulo: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: 'var(--text)' },
  sublinha: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  fechar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corpo: { padding: 24 },
  linhaLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  barraTemp: { width: 4, alignSelf: 'stretch', minHeight: 24, borderRadius: 2 },
  linhaLeadNome: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)' },
  observacoes: { padding: 16, backgroundColor: 'var(--surface-2)' },
  observacoesTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.25, color: 'var(--text-muted)' },
  indiceParada: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indiceParadaTexto: { fontSize: 12, lineHeight: 28, letterSpacing: 0.5, fontWeight: '700', color: 'var(--text-muted)' },
  paradaNome: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: 'var(--text)' },
  rodape: { gap: 8, borderTopWidth: 1, borderTopColor: 'var(--border)' },
  ctaCheio: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#C8131B',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaCheioTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: '#FFFFFF' },
  ctaTonal: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'var(--tint-red)',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaTonalTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--tint-red-text)' },
  ctaVazado: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaVazadoTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text-muted)' },
});
