import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../components/Alert';
import { MANDATORY_BADGE, type MandatoryReason } from '../utils/dailyRoute';
import type { Client, ClientStatus, FieldRouteStop } from '../types/client';
import { useFieldOps } from '../hooks/useFieldOps';
import { useLayout } from '../hooks/useLayout';
import type { RouteGeometry, RoutingProvider } from '../utils/routing';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconClose,
  IconEye,
  IconLocation,
  IconMenu,
  IconRefresh,
  IconSearch,
  IconText,
  useIconColors,
} from '../components/icons';
import { MinhaDailyCard } from './MinhaDailyCard';
import { ds, sharedStyles } from './sharedStyles';

// Tela de Rota, extraida do App.tsx (prompt 02 do handoff) — refactor puro.
// O estado da rota (stops, filtros, geracao) continua no App.tsx porque o
// mapa e outros fluxos compartilham; chega tudo por props.
type FieldOps = ReturnType<typeof useFieldOps>;

// Altura FIXA da linha de parada no rail web — e' o que torna o arraste
// deterministico: delta de posicoes = dy / ALTURA_LINHA_PARADA.
const ALTURA_LINHA_PARADA = 72;

// Linha com alca de arraste (handle a' direita). So' a alca captura o gesto —
// o resto da linha continua clicavel e o ScrollView continua rolando.
function LinhaArrastavel({
  indice,
  total,
  aoMover,
  desabilitado,
  children,
}: {
  indice: number;
  total: number;
  aoMover: (de: number, para: number) => void;
  desabilitado: boolean;
  children: React.ReactNode;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  // O PanResponder e' criado uma vez; le' os valores atuais por ref pra nao
  // capturar indice/total antigos (closure de primeira renderizacao).
  const atual = useRef({ indice, total, aoMover, desabilitado });
  atual.current = { indice, total, aoMover, desabilitado };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !atual.current.desabilitado,
      onMoveShouldSetPanResponder: (_, g) => !atual.current.desabilitado && Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => translateY.setValue(g.dy),
      onPanResponderRelease: (_, g) => {
        translateY.setValue(0);
        const delta = Math.round(g.dy / ALTURA_LINHA_PARADA);
        if (delta !== 0) {
          const { indice: de, total: n, aoMover: mover } = atual.current;
          mover(de, Math.max(0, Math.min(n - 1, de + delta)));
        }
      },
      onPanResponderTerminate: () => translateY.setValue(0),
    }),
  ).current;

  return (
    <Animated.View style={{ transform: [{ translateY }], zIndex: 1 }}>
      {children}
      <View style={estilosRail.alcaArea} {...(desabilitado ? {} : pan.panHandlers)}>
        {!desabilitado && <IconMenu width={20} height={20} fill="var(--text-faint)" />}
      </View>
    </Animated.View>
  );
}

interface Props {
  /** O MESMO JSX do mapa da aba Mapa — no web ele ancora a coluna esquerda. */
  conteudoMapa: React.ReactNode;
  clients: Client[];
  fieldOps: FieldOps;
  routeStops: FieldOps['stops'];
  routeDisplayClients: Client[];
  routeStopClientIds: Set<string>;
  geometriaDaRota: RouteGeometry | undefined;
  geometriaCarregando: boolean;
  routeLeadCount: string;
  setRouteLeadCount: React.Dispatch<React.SetStateAction<string>>;
  routeStatusSelection: Set<string>;
  setRouteStatusSelection: React.Dispatch<React.SetStateAction<Set<string>>>;
  routeVendorFilterHubspotId: string | null;
  setRouteVendorFilterHubspotId: React.Dispatch<React.SetStateAction<string | null>>;
  routeManualSearch: string;
  setRouteManualSearch: (v: string) => void;
  routeStartOverride: { latitude: number; longitude: number; label: string } | null;
  setRouteStartOverride: (v: { latitude: number; longitude: number; label: string } | null) => void;
  setRouteDraft: React.Dispatch<React.SetStateAction<Client[]>>;
  abrirEscolhaDePartida: () => void;
  abrirEscolhaDeVendedor: () => void;
  isMonitoringRoute: boolean;
  isOptimizing: boolean;
  lastProviderUsed: RoutingProvider | null;
  isAdmin: boolean;
  myHubspotId: string | null;
  generateDailyRoute: () => Promise<void> | void;
  startNavigation: () => void;
  viewRouteOnMap: () => void;
  addClientToRoute: (c: Client) => void;
  openClientDetails: (c: Client) => void;
  vendorLabel: (idHubspot: string | null) => string;
  nomeDoLead: (c: Client) => string;
  statusConfig: Record<string, { label: string; color: string }>;
  statusOptions: Array<{ value: ClientStatus; label: string; color: string }>;
  irParaMapa: () => void;
  metaVisitasDia: number;
  suggestRoute: () => Promise<void> | void;
}

export function RotaScreen({
  conteudoMapa,
  clients,
  fieldOps,
  routeStops,
  routeDisplayClients,
  routeStopClientIds,
  geometriaDaRota,
  geometriaCarregando,
  routeLeadCount,
  setRouteLeadCount,
  routeStatusSelection,
  setRouteStatusSelection,
  routeVendorFilterHubspotId,
  setRouteVendorFilterHubspotId,
  routeManualSearch,
  setRouteManualSearch,
  routeStartOverride,
  setRouteStartOverride,
  setRouteDraft,
  abrirEscolhaDePartida,
  abrirEscolhaDeVendedor,
  isMonitoringRoute,
  isOptimizing,
  lastProviderUsed,
  isAdmin,
  myHubspotId,
  generateDailyRoute,
  startNavigation,
  viewRouteOnMap,
  addClientToRoute,
  openClientDetails,
  vendorLabel,
  nomeDoLead,
  statusConfig,
  statusOptions,
  irParaMapa,
  metaVisitasDia,
  suggestRoute,
}: Props) {
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const iconColors = useIconColors();
  // Aba do rail web: a sequencia do dia domina; a configuracao (personalizada,
  // adicionar manual, historico, daily) vive numa segunda aba (prompt 06).
  const [abaRail, setAbaRail] = useState<'sequencia' | 'config'>('sequencia');
  // Cada cartao vira uma constante pra tela poder COMPOR diferente por
  // largura. No celular: a coluna unica de sempre, na mesma ordem. No
  // desktop: duas colunas (o 6+6 do grid oficial) — planejamento a esquerda,
  // a rota em construcao a direita. E' isso que separa "desktop de verdade"
  // de "celular esticado": a composicao muda, nao so' a largura.
  const cartaoDaily = (
    <>
    {/* A promessa do dia mora AQUI, e nao so' na aba "Meu".
        Esta e' a tela onde o vendedor planeja o dia — perguntar "quantas
        visitas hoje?" em qualquer outro lugar seria perguntar fora do
        momento em que ele esta' decidindo isso. O mesmo cartao aparece em
        "Meu" (e no Gestor, pra gestor que faz campo); os tres leem e
        escrevem a mesma linha de `dailies`, entao nao ha' duas verdades.
        O numero declarado aqui e' o que o cockpit de gestao cobra. */}
    {!isMonitoringRoute && <MinhaDailyCard enabled={true} />}
    </>
  );
  const cartaoRotaDoDia = (
    <>
    {/* Rota do dia (automática): monta as obrigatórias + completa a meta.
        Fica no topo como CTA principal; o fluxo manual segue abaixo. */}
    <View style={[styles.panelCard, { borderWidth: 1, borderColor: 'var(--tint-red-border)' }]}>
      <IconText Icone={IconLocation} style={sharedStyles.panelTitle} tone="onSurface">Rota do dia</IconText>
      <Text style={styles.panelHint}>
        Monta as 3 visitas obrigatórias do dia (SLA estourado, Relacionamento +1000 comandas
        e Conta Alvo) e completa até {metaVisitasDia} paradas perto de você, já na ordem otimizada.
        Parte da sua localização atual.
      </Text>
      <TouchableOpacity
        style={[sharedStyles.submitButton, { marginTop: 12, backgroundColor: '#C8131B' }, isMonitoringRoute && { opacity: 0.4 }]}
        onPress={generateDailyRoute}
        disabled={fieldOps.saveRoute.isPending || isOptimizing || isMonitoringRoute}
      >
        {(fieldOps.saveRoute.isPending || isOptimizing)
          ? <ActivityIndicator color="#fff" />
          : <Text style={sharedStyles.submitButtonText}>Gerar Rota do dia</Text>}
      </TouchableOpacity>
    </View>
    </>
  );
  const cartaoPersonalizada = (
    <>
    <View style={styles.panelCard}>
      <Text style={sharedStyles.panelTitle}>Rota personalizada</Text>
      <Text style={styles.panelHint}>
        Monte você mesmo: escolha quantos leads, quais status e o responsável.
        A ordem é otimizada por estradas reais. (Alternativa à "Rota do dia" acima.)
      </Text>

      <Text style={[sharedStyles.fieldLabel, { marginTop: 12 }]}>Quantos leads visitar</Text>
      <TextInput
        style={[sharedStyles.input, { marginBottom: 0 }]}
        value={routeLeadCount}
        onChangeText={setRouteLeadCount}
        keyboardType="number-pad"
        placeholder="Ex.: 8"
        placeholderTextColor="var(--text-subtle)"
      />

      {/* Ponto de partida da rota. Default: minha localizacao (GPS). O
          vendedor pode escolher partir de um cliente especifico (ex.: comeca
          o dia de um ponto que nao e' onde ele esta agora). */}
      <Text style={[sharedStyles.fieldLabel, { marginTop: 12 }]}>Ponto de partida</Text>
      <View style={styles.routeStartRow}>
        <TouchableOpacity
          style={[styles.routeStartOption, !routeStartOverride && styles.routeStartOptionActive]}
          onPress={() => setRouteStartOverride(null)}
        >
          <IconText Icone={IconLocation} style={[styles.routeStartText, !routeStartOverride && styles.routeStartTextActive]} tone="onSurface">Minha localização</IconText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.routeStartOption, !!routeStartOverride && styles.routeStartOptionActive]}
          onPress={() => abrirEscolhaDePartida()}
        >
          <Text style={[styles.routeStartText, !!routeStartOverride && styles.routeStartTextActive]} numberOfLines={1}>
            {routeStartOverride ? routeStartOverride.label : 'Escolher local'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[sharedStyles.fieldLabel, { marginTop: 12 }]}>
        Status incluidos ({routeStatusSelection.size} selecionado{routeStatusSelection.size === 1 ? '' : 's'})
      </Text>
      <View style={styles.statusMultiRow}>
        {statusOptions.map(opt => {
          const selected = routeStatusSelection.has(opt.value);
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                sharedStyles.filterChip,
                selected && { backgroundColor: opt.color, borderColor: opt.color },
                !selected && { borderWidth: 1, borderColor: 'var(--border)' },
              ]}
              onPress={() => {
                setRouteStatusSelection(prev => {
                  const next = new Set(prev);
                  if (next.has(opt.value)) next.delete(opt.value);
                  else next.add(opt.value);
                  return next;
                });
              }}
            >
              <View style={[sharedStyles.filterDot, { backgroundColor: opt.color }]} />
              <Text style={[sharedStyles.filterChipText, selected && sharedStyles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[sharedStyles.fieldLabel, { marginTop: 12 }]}>Responsavel</Text>
      {isAdmin ? (
        <TouchableOpacity
          style={[
            sharedStyles.dropdownButton,
            routeVendorFilterHubspotId !== null && { borderColor: '#C8131B', backgroundColor: 'var(--tint-red)' },
          ]}
          onPress={() => abrirEscolhaDeVendedor()}
        >
          <Text style={[
            sharedStyles.dropdownButtonText,
            routeVendorFilterHubspotId === null && { color: 'var(--text-muted)' },
          ]}>
            {vendorLabel(routeVendorFilterHubspotId)}
          </Text>
          <Text style={sharedStyles.dropdownChevron}>▾</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[
            sharedStyles.dropdownButton,
            routeVendorFilterHubspotId !== null && { borderColor: '#C8131B', backgroundColor: 'var(--tint-red)' },
          ]}
          onPress={() => {
            if (!myHubspotId) {
              Alert.alert(
                'Sem id HubSpot',
                'Seu usuario nao tem id_hubspot configurado, entao nao da pra identificar quais leads sao seus.',
              );
              return;
            }
            setRouteVendorFilterHubspotId(prev => (prev === myHubspotId ? null : myHubspotId));
          }}
        >
          <Text style={[
            sharedStyles.dropdownButtonText,
            routeVendorFilterHubspotId === null && { color: 'var(--text-muted)' },
          ]}>
            {routeVendorFilterHubspotId === myHubspotId ? 'Somente meus leads' : 'Todos os leads do recorte'}
          </Text>
          <Text style={[
            sharedStyles.dropdownChevron,
            routeVendorFilterHubspotId === myHubspotId && { color: 'var(--brand-text)' },
          ]}>{routeVendorFilterHubspotId === myHubspotId ? '✓' : '○'}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[sharedStyles.submitButton, { marginTop: 16 }, isMonitoringRoute && { opacity: 0.4 }]}
        onPress={suggestRoute}
        disabled={fieldOps.saveRoute.isPending || isOptimizing || isMonitoringRoute}
      >
        {(fieldOps.saveRoute.isPending || isOptimizing)
          ? <ActivityIndicator color="#fff" />
          : <Text style={sharedStyles.submitButtonText}>Gerar rota personalizada</Text>}
      </TouchableOpacity>
    </View>
    </>
  );
  const cartaoAdicionar = (
    <>
    {/* Adicionar manualmente: busca em tempo real entre todos os leads.
        Resultado mostra os 10 primeiros matches com botao "Adicionar".
        Escondido no modo monitoramento (o gestor não edita a rota do vendedor). */}
    {!isMonitoringRoute && (
    <View style={styles.panelCard}>
      <Text style={sharedStyles.panelTitle}>Adicionar lead manualmente</Text>
      <Text style={styles.panelHint}>
        Busque pelo nome do restaurante ou contato pra incluir na rota.
      </Text>
      <View style={[sharedStyles.searchBar, { marginHorizontal: 0, marginTop: 8 }]}>
        <IconSearch width={16} height={16} fill={iconColors.muted} />
        <TextInput
          style={sharedStyles.searchInput}
          placeholder="Buscar restaurante, contato, cidade..."
          placeholderTextColor="var(--text-subtle)"
          value={routeManualSearch}
          onChangeText={setRouteManualSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {routeManualSearch.length > 0 && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar" onPress={() => setRouteManualSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <IconClose width={15} height={15} fill={iconColors.muted} />
          </TouchableOpacity>
        )}
      </View>
      {routeManualSearch.trim().length >= 2 && (() => {
        const term = routeManualSearch
          .normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().trim();
        const matches = clients.filter(c => {
          if (routeStopClientIds.has(c.id)) return false;
          const hay = `${c.empresa ?? ''} ${c.nome ?? ''} ${c.cidade ?? ''} ${c.bairro ?? ''}`
            .normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase();
          return hay.includes(term);
        }).slice(0, 10);
        if (matches.length === 0) {
          return <Text style={[sharedStyles.emptyStateText, { marginTop: 10 }]}>Nenhum lead encontrado.</Text>;
        }
        return matches.map(c => {
          const title = nomeDoLead(c);
          const subtitle = [c.cidade, c.estado].filter(Boolean).join(' • ');
          const noCoords = c.latitude == null || c.longitude == null;
          return (
            <View key={c.id} style={styles.manualRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.manualRowTitle} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={styles.manualRowSubtitle}>{subtitle}</Text> : null}
                {noCoords && <Text style={styles.manualRowWarning}>Sem coordenadas</Text>}
              </View>
              <TouchableOpacity
                style={[sharedStyles.smallActionButton, noCoords && { opacity: 0.5 }]}
                disabled={noCoords}
                onPress={() => addClientToRoute(c)}
              >
                <Text style={sharedStyles.smallActionButtonText}>+ Adicionar</Text>
              </TouchableOpacity>
            </View>
          );
        });
      })()}
      {routeManualSearch.trim().length > 0 && routeManualSearch.trim().length < 2 && (
        <Text style={[styles.panelHint, { marginTop: 10 }]}>Digite pelo menos 2 caracteres.</Text>
      )}
    </View>
    )}
    </>
  );
  const cartaoLista = (
    <>
    <View style={styles.panelCard}>
      <View style={styles.panelHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={sharedStyles.panelTitle}>
            {isMonitoringRoute ? `Rota de ${vendorLabel(routeVendorFilterHubspotId)}` : 'Rota de hoje'}
          </Text>
          <Text style={styles.panelHint}>
            {routeDisplayClients.length} leads planejados
            {geometriaDaRota && geometriaDaRota.coordinates.length > 1 && (
              ` • ${(geometriaDaRota!.distanceMeters / 1000).toFixed(1)} km`
              + ` • ~${Math.round(geometriaDaRota!.durationSeconds / 60)} min`
            )}
            {geometriaCarregando && ' • calculando rota...'}
          </Text>
          {/* Badge admin: mostra qual provedor foi usado na ultima sugestao.
              ORS = caminho feliz; OSRM = ORS caiu e o fallback rolou. */}
          {isAdmin && lastProviderUsed && (
            <View style={[styles.providerBadge, lastProviderUsed === 'osrm' && { backgroundColor: 'var(--tint-amber)', borderColor: 'var(--tint-amber-border)' }]}>
              <Text style={[styles.providerBadgeText, lastProviderUsed === 'osrm' && { color: 'var(--tint-amber-text)' }]}>
                {lastProviderUsed === 'ors'
                  ? 'Via OpenRouteService'
                  : 'Via OSRM (ORS estava fora)'}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {routeDisplayClients.length > 0 && (
            <TouchableOpacity
              style={[styles.secondaryButton, { backgroundColor: '#16a34a' }]}
              onPress={startNavigation}
            >
              <IconText Icone={IconLocation} style={[styles.secondaryButtonText, { color: '#fff' }]} tone="onSurface">Navegar</IconText>
            </TouchableOpacity>
          )}
          {routeDisplayClients.length > 0 ? (
            <TouchableOpacity
              style={[styles.secondaryButton, { backgroundColor: '#C8131B' }]}
              onPress={viewRouteOnMap}
            >
              <Text style={[styles.secondaryButtonText, { color: '#fff' }]}>Ver no mapa</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => irParaMapa()}>
              <Text style={styles.secondaryButtonText}>Abrir mapa</Text>
            </TouchableOpacity>
          )}
          {routeDisplayClients.length > 0 && !isMonitoringRoute && (
            <TouchableOpacity
              style={[styles.secondaryButton, { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' }]}
              onPress={() => {
                Alert.alert(
                  'Limpar rota',
                  `Remover todos os ${routeDisplayClients.length} leads da rota de hoje?`,
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Limpar',
                      style: 'destructive',
                      onPress: () => {
                        // Limpa tanto o draft local quanto as stops persistidas.
                        setRouteDraft([]);
                        routeStops.forEach(stop => fieldOps.removeStop.mutate(stop));
                      },
                    },
                  ],
                );
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: 'var(--brand-text)' }]}>Limpar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {routeDisplayClients.length === 0 ? (
        <Text style={sharedStyles.emptyStateText}>Nenhum lead na rota. Use a sugestao ou abra um pin no mapa.</Text>
      ) : (
        routeDisplayClients.map((client, index) => {
          const stop = routeStops.find(s => s.client_id === client.id);
          const isLast = index === routeDisplayClients.length - 1;
          const isDone = stop?.status === 'done';
          const color = statusConfig[client.status]?.color || '#3b82f6';
          const title = nomeDoLead(client);
          const subtitle = [client.bairro, client.cidade, client.estado].filter(Boolean).join(' - ') || 'Localizacao nao informada';
          return (
            <View
              key={client.id}
              style={[
                styles.routeStopCard,
                { borderLeftColor: isDone ? '#16a34a' : color },
                isDone && { backgroundColor: 'var(--tint-green)' },
              ]}
            >
              <View style={styles.routeStopHeader}>
                {/* Checkbox: toggle done/planned. Persiste via toggleStopDone */}
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Selecionado"
                  style={[styles.checkbox, isDone && styles.checkboxChecked]}
                  onPress={() => {
                    if (stop) fieldOps.toggleStopDone.mutate(stop);
                  }}
                  disabled={!stop || isMonitoringRoute}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isDone && <IconCheck width={14} height={14} fill={iconColors.onBrand} />}
                </TouchableOpacity>
                <Text style={sharedStyles.routePosition}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[sharedStyles.clientName, isDone && { textDecorationLine: 'line-through', color: 'var(--text-muted)' }]}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  <Text style={[styles.routeStopSubtitle, isDone && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                  {(() => {
                    const mreason = stop?.mandatory_reason as MandatoryReason | undefined;
                    if (!mreason || !MANDATORY_BADGE[mreason]) return null;
                    // Conta Alvo: acrescenta nota/avaliações do Google no badge.
                    const rating = client.conta_alvo_place_id && client.conta_alvo_rating != null
                      ? ` · ⭐ ${Number(client.conta_alvo_rating).toFixed(1)}${client.conta_alvo_reviews != null ? ` (${client.conta_alvo_reviews})` : ''}`
                      : '';
                    return <Text style={styles.mandatoryTag}>{MANDATORY_BADGE[mreason]}{rating}</Text>;
                  })()}
                </View>
                <View style={[sharedStyles.statusBadge, { backgroundColor: isDone ? '#16a34a' : color }]}>
                  <Text style={sharedStyles.statusBadgeText}>
                    {isDone ? 'Visitado' : (statusConfig[client.status]?.label || client.status)}
                  </Text>
                </View>
              </View>
              <View style={sharedStyles.routeActionsRow}>
                {index > 0 && !isMonitoringRoute && (
                  <TouchableOpacity
                    style={sharedStyles.smallActionButton}
                    onPress={() => {
                      const nextStops = routeStops.slice();
                      [nextStops[index - 1], nextStops[index]] = [nextStops[index], nextStops[index - 1]];
                      if (nextStops.length) fieldOps.updateStops.mutate(nextStops);
                    }}
                  >
                    <IconText Icone={IconArrowUp} style={sharedStyles.smallActionButtonText} tone="onSurface">Subir</IconText>
                  </TouchableOpacity>
                )}
                {!isLast && !isMonitoringRoute && (
                  <TouchableOpacity
                    style={sharedStyles.smallActionButton}
                    onPress={() => {
                      const nextStops = routeStops.slice();
                      [nextStops[index], nextStops[index + 1]] = [nextStops[index + 1], nextStops[index]];
                      if (nextStops.length) fieldOps.updateStops.mutate(nextStops);
                    }}
                  >
                    <IconText Icone={IconArrowDown} style={sharedStyles.smallActionButtonText} tone="onSurface">Descer</IconText>
                  </TouchableOpacity>
                )}
                {stop && !isMonitoringRoute && (
                  <TouchableOpacity style={sharedStyles.smallActionButton} onPress={() => fieldOps.removeStop.mutate(stop)}>
                    <Text style={sharedStyles.smallActionButtonText}>Remover</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={sharedStyles.smallActionButton}
                  onPress={() => openClientDetails(client)}
                >
                  <Text style={sharedStyles.smallActionButtonText}>Abrir</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
    </>
  );

  // Gestor monitorando a rota de OUTRO vendedor: banner + tela read-only.
  // Muda o "Responsável" pra "Todos" pra voltar a gerar a propria.
  const bannerMonitor = isMonitoringRoute && (
    <View style={styles.monitorBanner}>
      <Text style={styles.monitorBannerText}>
        <IconText Icone={IconEye} style={styles.monitorBannerText} tone="onSurface">Você está vendo a rota de</IconText> <Text style={{ fontWeight: '800' }}>{vendorLabel(routeVendorFilterHubspotId)}</Text> (somente leitura).
        Para gerar/editar a sua, mude o "Responsável" para "Todos os vendedores".
      </Text>
    </View>
  );

  // Web: a sequencia de paradas e' o objeto de trabalho — mapa a' esquerda
  // (o MESMO conteudoMapa, que ja desenha rota + polyline) e rail de 420px
  // a' direita com os cartoes. Handoff, tela 3.
  // ---- Rail web (prompt 06): a SEQUENCIA e' o objeto de trabalho ----
  const km = geometriaDaRota && geometriaDaRota.coordinates.length > 1
    ? `${(geometriaDaRota.distanceMeters / 1000).toFixed(1).replace('.', ',')} km`
    : '—';
  const minutos = geometriaDaRota && geometriaDaRota.coordinates.length > 1
    ? `~${Math.round(geometriaDaRota.durationSeconds / 60)} min`
    : '—';
  // A rota do modelo de dados e' SEMPRE a de hoje (fieldOps.stops) — setas de
  // navegar entre dias mentiriam. A data e' informativa.
  const dataDeHoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  // Reordenacao: quando ha' stops persistidas, regrava a ordem; no draft
  // (sugestao ainda nao salva) reordena o array local.
  const moverParada = (de: number, para: number) => {
    if (de === para) return;
    if (routeStops.length === routeDisplayClients.length && routeStops.length > 0) {
      const ordem = routeDisplayClients.map(c => routeStops.find(s => s.client_id === c.id)!).filter(Boolean);
      const [item] = ordem.splice(de, 1);
      ordem.splice(para, 0, item);
      fieldOps.updateStops.mutate(ordem);
    } else {
      setRouteDraft(prev => {
        const ordem = [...prev];
        const [item] = ordem.splice(de, 1);
        ordem.splice(para, 0, item);
        return ordem;
      });
    }
  };

  if (layout.ehLargo) {
    // Indice da parada "atual": a primeira ainda nao concluida.
    const indiceAtual = routeDisplayClients.findIndex(c => {
      const stop = routeStops.find(s => s.client_id === c.id);
      return stop?.status !== 'done';
    });
    return (
      <View style={sharedStyles.mapaLinhaWeb}>
        <View style={sharedStyles.mapaAreaWeb}>{conteudoMapa}</View>
        <View style={estilosRail.rail}>
          <View style={estilosRail.topo}>
            <Text style={estilosRail.kicker}>Rota do dia</Text>
            <Text style={estilosRail.data}>{dataDeHoje}</Text>
            <View style={estilosRail.kpis}>
              {[
                { v: String(routeDisplayClients.length), r: routeDisplayClients.length === 1 ? 'parada' : 'paradas' },
                { v: km, r: 'distância' },
                { v: minutos, r: 'em rota' },
              ].map(k => (
                <View key={k.r} style={estilosRail.kpi}>
                  <Text style={estilosRail.kpiValor} numberOfLines={1}>{k.v}</Text>
                  <Text style={estilosRail.kpiRotulo}>{k.r}</Text>
                </View>
              ))}
            </View>
            <View style={estilosRail.abas}>
              {([['sequencia', 'Sequência'], ['config', 'Configurar']] as const).map(([chave, rotulo]) => (
                <TouchableOpacity
                  key={chave}
                  accessibilityRole="button"
                  style={[estilosRail.aba, abaRail === chave && estilosRail.abaAtiva]}
                  onPress={() => setAbaRail(chave)}
                >
                  <Text style={[estilosRail.abaTexto, abaRail === chave && estilosRail.abaTextoAtiva]}>{rotulo}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {abaRail === 'sequencia' ? (
            <>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={estilosRail.lista}>
                {bannerMonitor}
                {geometriaCarregando && (
                  <Text style={styles.panelHint}>calculando rota…</Text>
                )}
                {routeDisplayClients.length === 0 ? (
                  <View style={sharedStyles.emptyState}>
                    <Text style={sharedStyles.emptyStateText}>
                      Nenhum lead na rota. Use a sugestão da aba Configurar ou abra um pin no mapa.
                    </Text>
                  </View>
                ) : (
                  routeDisplayClients.map((client, index) => {
                    const stop = routeStops.find(s => s.client_id === client.id);
                    const isDone = stop?.status === 'done';
                    const ehAtual = index === indiceAtual;
                    return (
                      <LinhaArrastavel
                        key={client.id}
                        indice={index}
                        total={routeDisplayClients.length}
                        aoMover={moverParada}
                        desabilitado={isMonitoringRoute}
                      >
                        <View style={estilosRail.parada}>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={isDone ? 'Desmarcar visita' : 'Marcar visita'}
                            style={[
                              estilosRail.indice,
                              isDone && estilosRail.indiceFeito,
                              !isDone && ehAtual && estilosRail.indiceAtual,
                            ]}
                            disabled={!stop || isMonitoringRoute}
                            onPress={() => stop && fieldOps.toggleStopDone.mutate(stop)}
                          >
                            {isDone ? (
                              <IconCheck width={14} height={14} fill="var(--tint-green-text)" />
                            ) : (
                              <Text style={[estilosRail.indiceTexto, ehAtual && { color: '#FFFFFF' }]}>{index + 1}</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ flex: 1, minWidth: 0 }}
                            accessibilityRole="button"
                            onPress={() => openClientDetails(client)}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={estilosRail.paradaNome} numberOfLines={1}>{nomeDoLead(client)}</Text>
                              {isDone && (
                                <View style={[estilosRail.tag, { backgroundColor: 'var(--tint-green)' }]}>
                                  <Text style={[estilosRail.tagTexto, { color: 'var(--tint-green-text)' }]}>Visitado</Text>
                                </View>
                              )}
                              {!isDone && ehAtual && (
                                <View style={[estilosRail.tag, { backgroundColor: 'var(--tint-red)' }]}>
                                  <Text style={[estilosRail.tagTexto, { color: 'var(--tint-red-text)' }]}>Agora</Text>
                                </View>
                              )}
                            </View>
                            <Text style={estilosRail.paradaDetalhe} numberOfLines={1}>
                              {[client.cidade, statusConfig[client.status]?.label ?? client.status].filter(Boolean).join(' · ')}
                            </Text>
                          </TouchableOpacity>
                          {!isMonitoringRoute && stop && (
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel="Remover da rota"
                              style={estilosRail.remover}
                              onPress={() => fieldOps.removeStop.mutate(stop)}
                            >
                              <IconClose width={14} height={14} fill={iconColors.muted} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </LinhaArrastavel>
                    );
                  })
                )}
              </ScrollView>
              <View style={estilosRail.rodape}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[estilosRail.ctaCheio, routeDisplayClients.length === 0 && { opacity: 0.4 }]}
                  disabled={routeDisplayClients.length === 0}
                  onPress={startNavigation}
                >
                  <IconLocation width={24} height={24} fill="#FFFFFF" />
                  <Text style={estilosRail.ctaCheioTexto}>Iniciar navegação</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[estilosRail.ctaVazado, (isOptimizing || isMonitoringRoute) && { opacity: 0.4 }]}
                  disabled={isOptimizing || isMonitoringRoute}
                  onPress={() => generateDailyRoute()}
                >
                  {isOptimizing ? (
                    <ActivityIndicator size="small" color={iconColors.brandText} />
                  ) : (
                    <IconRefresh width={24} height={24} fill={iconColors.brandText} />
                  )}
                  <Text style={estilosRail.ctaVazadoTexto}>Otimizar paradas</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.rotaRailConteudo}>
              {bannerMonitor}
              {cartaoDaily}
              {cartaoRotaDoDia}
              {cartaoPersonalizada}
              {cartaoAdicionar}
              {cartaoLista}
            </ScrollView>
          )}
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[sharedStyles.listContent, { paddingBottom: 90 + insets.bottom },
    { maxWidth: layout.larguraMaxima, width: '100%', alignSelf: 'center' }]}>
    {bannerMonitor}

    {cartaoDaily}
    {cartaoRotaDoDia}
    {cartaoPersonalizada}
    {cartaoAdicionar}
    {cartaoLista}
  </ScrollView>
  );
}

// Estilos exclusivos desta tela, movidos do App.tsx como estavam.
const styles = StyleSheet.create({
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  mandatoryTag: { fontSize: 11, fontWeight: '800', color: 'var(--brand-text)', marginTop: 3 },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border-soft)',
    gap: 10,
  },
  manualRowSubtitle: { fontSize: 12, color: 'var(--text-muted)', marginTop: 1 },
  manualRowTitle: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  manualRowWarning: { fontSize: 11, color: 'var(--brand-text)', fontWeight: '600', marginTop: 2 },
  monitorBanner: {
    backgroundColor: 'var(--tint-blue)',
    borderWidth: 1,
    borderColor: 'var(--tint-blue-border)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  monitorBannerText: { fontSize: 13, color: 'var(--tint-blue-text)', fontWeight: '600', lineHeight: 18 },
  panelCard: {
    backgroundColor: 'var(--surface)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelHint: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 17 },
  providerBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'var(--tint-green)',
    borderWidth: 1,
    borderColor: 'var(--tint-green-border)',
  },
  providerBadgeText: { fontSize: 10, fontWeight: '700', color: 'var(--tint-green-text)' },
  rotaRailConteudo: { padding: 24 },
  routeStartOption: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: 'var(--bg)', borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center',
  },
  routeStartOptionActive: { backgroundColor: 'var(--tint-blue)', borderColor: '#3b82f6' },
  routeStartRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  routeStartText: { fontSize: 13, fontWeight: '600', color: 'var(--text-muted)' },
  routeStartTextActive: { color: 'var(--info-text)' },
  routeStopCard: {
    backgroundColor: 'var(--surface)',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderLeftWidth: 4,
  },
  routeStopHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  routeStopSubtitle: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  secondaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'var(--surface-2)',
  },
  secondaryButtonText: { fontSize: 12, fontWeight: '800', color: 'var(--text)' },
  statusMultiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
});

// Estilos do rail web (prompt 06 do handoff).
const estilosRail = StyleSheet.create({
  rail: {
    width: 420,
    borderLeftWidth: 1,
    borderLeftColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
  },
  topo: { padding: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'var(--border)', gap: 8 },
  kicker: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  data: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: 'var(--text)', textTransform: 'capitalize' },
  kpis: { flexDirection: 'row', gap: 8, marginTop: 8 },
  kpi: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: 'var(--surface-2)', gap: 2 },
  kpiValor: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  kpiRotulo: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '500', color: 'var(--text-faint)' },
  abas: { flexDirection: 'row', gap: 8, marginTop: 8 },
  aba: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  abaAtiva: { backgroundColor: 'var(--tint-red)', borderColor: '#C8131B' },
  abaTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  abaTextoAtiva: { color: 'var(--tint-red-text)' },
  lista: { paddingHorizontal: 24, paddingVertical: 8 },
  parada: {
    height: ALTURA_LINHA_PARADA,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
    paddingRight: 40, // espaco da alca de arraste (absoluta)
  },
  indice: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--surface-2)',
  },
  indiceFeito: { backgroundColor: 'var(--tint-green)' },
  indiceAtual: { backgroundColor: '#C8131B' },
  indiceTexto: { fontSize: 12, lineHeight: 28, letterSpacing: 0.5, fontWeight: '700', color: 'var(--text-muted)' },
  paradaNome: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)', flexShrink: 1 },
  paradaDetalhe: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600' },
  remover: { width: 32, height: 32, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  alcaArea: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 1,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rodape: { padding: 24, borderTopWidth: 1, borderTopColor: 'var(--border)', gap: 8 },
  ctaCheio: {
    height: 40,
    borderRadius: 12,
    backgroundColor: '#C8131B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
  },
  ctaCheioTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: '#FFFFFF' },
  ctaVazado: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C8131B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
  },
  ctaVazadoTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--brand-text)' },
});
