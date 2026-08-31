import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  Pressable,
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
  IconArrowBack,
  IconArrowDown,
  IconArrowFoward,
  IconArrowUp,
  IconCheck,
  IconChevronRight,
  IconClose,
  IconExpand,
  IconEye,
  IconLocation,
  IconSettings,
  IconShrink,
  IconSparkle,
  IconTrash,
  IconLocationFilled,
  IconMenu,
  IconRefresh,
  IconSearch,
  IconText,
  IconUserAdd,
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
  /** Check-in de verdade: valida os 200m e conclui a Task no HubSpot. E' o
   *  mesmo `handleMarkAsVisited` da ficha do lead — nao ha' segunda regra. */
  onMarkVisited?: (client: Client, onDone?: () => void) => void;
  /** Sheet de montagem: o estado vive no App (o header e' dele), o conteudo
   *  aqui. Desde o M3c quem abre sao os botoes DESTA tela — "Montar eu mesmo"
   *  no estado vazio e "Refazer rota" no cabecalho da sequencia. */
  configAberta: boolean;
  aoAbrirConfig: () => void;
  aoFecharConfig: () => void;
  /** Mapa em tela cheia (M3c/D). Mora no App porque header e barra somem
   *  junto; nao persiste entre sessoes nem entre abas. */
  mapaExpandido: boolean;
  setMapaExpandido: (v: boolean) => void;
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
  onMarkVisited,
  configAberta,
  aoAbrirConfig,
  aoFecharConfig,
  mapaExpandido,
  setMapaExpandido,
}: Props) {
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const iconColors = useIconColors();
  // Aba do rail web: a sequencia do dia domina; a configuracao (personalizada,
  // adicionar manual, historico, daily) vive numa segunda aba (prompt 06).
  const [abaRail, setAbaRail] = useState<'sequencia' | 'config'>('sequencia');
  // Nivel do sheet de montagem (M3c/C): o menu do quadro 1c e, um degrau
  // abaixo, os formularios que ja' existiam. Nenhum deles foi reescrito — o
  // que mudou foi so' o ponto de entrada.
  const [nivelMontagem, setNivelMontagem] = useState<'menu' | 'personalizada' | 'adicionar' | 'paradas'>('menu');
  // Peek do mapa expandido: recolhido mostra so' a proxima parada; aberto,
  // a sequencia inteira. A alca e o "Ver as N paradas" alternam os dois.
  const [sequenciaAberta, setSequenciaAberta] = useState(false);

  const carregandoRota = fieldOps.saveRoute.isPending || isOptimizing;
  // A parada de agora e' a primeira ainda nao concluida.
  const indiceProxima = routeDisplayClients.findIndex(
    (c) => routeStops.find(st => st.client_id === c.id)?.status !== 'done',
  );
  const proximaParada = indiceProxima >= 0 ? routeDisplayClients[indiceProxima] : null;

  const abrirMontagem = () => { setNivelMontagem('menu'); aoAbrirConfig(); };
  const fecharMontagem = () => { setNivelMontagem('menu'); aoFecharConfig(); };

  // Gerar de novo DESCARTA a rota em andamento: `saveRoute` apaga as stops do
  // dia antes de inserir as novas — inclusive as ja' visitadas. Por isso
  // confirma antes, no mesmo padrao do "Limpar rota". E' tambem o motivo de o
  // CTA nao voltar como botao vermelho ao lado da sequencia.
  const gerarRotaDoDia = () => {
    if (routeDisplayClients.length === 0) {
      void generateDailyRoute();
      return;
    }
    Alert.alert(
      'Refazer a rota',
      `A rota de hoje tem ${routeDisplayClients.length} `
      + `${routeDisplayClients.length === 1 ? 'parada' : 'paradas'}. `
      + 'Gerar de novo descarta a sequência atual, inclusive o que já foi visitado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Gerar', style: 'destructive', onPress: () => { void generateDailyRoute(); } },
      ],
    );
  };

  // Uma copy so' pros dois lugares que explicam a Rota do dia: a longa no
  // cartao do sheet, o resumo no peek do estado vazio. Mesma promessa do M3 —
  // o peek nao inventa outra, so' corta o detalhe das obrigatorias.
  const copiaRotaLonga = 'Monta as 3 visitas obrigatórias do dia (SLA estourado, Relacionamento '
    + `+1000 comandas e Conta Alvo) e completa até ${metaVisitasDia} paradas perto de você, `
    + 'já na ordem otimizada. Parte da sua localização atual.';
  const copiaRotaCurta = `Monta as obrigatórias e completa até a meta de ${metaVisitasDia}, `
    + 'partindo de onde você está.';

  // Voltar do sistema (Android e gesto do iOS, no PWA) recolhe o mapa em vez
  // de sair da tela — mesmo padrao do Painel: empilha um estado ao expandir e
  // desempilha no cleanup, pra o botao nao ficar engasgado.
  useEffect(() => {
    // Recolher devolve o peek ao estagio de sempre: reabrir o mapa e cair
    // direto na lista inteira nao e' o que 1d promete.
    if (!mapaExpandido) setSequenciaAberta(false);
    if (!mapaExpandido || Platform.OS !== 'web' || typeof window === 'undefined') return;
    let nossoEstadoNaPilha = true;
    window.history.pushState({ mapaRotaExpandido: true }, '');
    const aoVoltar = () => {
      nossoEstadoNaPilha = false;
      setMapaExpandido(false);
    };
    window.addEventListener('popstate', aoVoltar);
    return () => {
      window.removeEventListener('popstate', aoVoltar);
      if (nossoEstadoNaPilha) window.history.back();
    };
    // `setMapaExpandido` vem do App e e' estavel (setState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaExpandido]);
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
  // O botao e' UM so' — o que muda por largura e' a moldura em volta dele.
  // No celular ele e' o alvo de 48 do handoff; no desktop segue o
  // `submitButton` de sempre, pra o rail nao mudar de cara.
  const botaoGerarRota = (
    <TouchableOpacity
      style={[
        layout.ehDesktop
          ? [sharedStyles.submitButton, { marginTop: 12, backgroundColor: '#C8131B' }]
          : [styles.ctaPrimario, { marginTop: 12 }],
        isMonitoringRoute && { opacity: 0.4 },
      ]}
      onPress={gerarRotaDoDia}
      disabled={carregandoRota || isMonitoringRoute}
    >
      {carregandoRota
        ? <ActivityIndicator color="#fff" />
        : <Text style={layout.ehDesktop ? sharedStyles.submitButtonText : styles.ctaPrimarioTexto}>
            Gerar Rota do dia
          </Text>}
    </TouchableOpacity>
  );
  // Rota do dia (automática): monta as obrigatórias + completa a meta. No
  // sheet do celular ela e' o cartao em DESTAQUE — tint vermelho e borda da
  // marca contra os dois cards-link neutros (M3c/C). No rail do desktop segue
  // o painel de sempre.
  const cartaoRotaDoDia = layout.ehDesktop ? (
    <View style={[styles.panelCard, { borderWidth: 1, borderColor: 'var(--tint-red-border)' }]}>
      <IconText Icone={IconLocation} style={sharedStyles.panelTitle} tone="onSurface">Rota do dia</IconText>
      <Text style={styles.panelHint}>{copiaRotaLonga}</Text>
      {botaoGerarRota}
    </View>
  ) : (
    <View style={styles.montagemDestaque}>
      <View style={styles.montagemLinha}>
        {/* O kit nao tem `bolt`: IconSparkle e' o que marca o caminho
            automatico sem inventar SVG novo. */}
        <IconSparkle width={24} height={24} fill={iconColors.tintRedText} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.montagemTitulo}>Rota do dia</Text>
          <Text style={styles.montagemDescricao}>{copiaRotaLonga}</Text>
        </View>
      </View>
      {botaoGerarRota}
    </View>
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
      {/* Empilhado no celular: em `row`, a coluna de texto (flex:1) disputava a
          linha com tres botoes de largura natural que nao encolhem, era
          comprimida ABAIXO do min-content e cada palavra virava uma linha
          ("Rota / de / hoje"). Em desktop a linha cabe — por isso so' quebrava
          no aparelho. O desktop segue como estava. */}
      <View style={[styles.panelHeaderRow, !layout.ehDesktop && styles.panelHeaderRowMovel]}>
        {/* minWidth:0 e' o que segura o bug: sem ele, `flex:1` ainda deixa a
            coluna encolher abaixo do conteudo em qualquer largura. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          {layout.ehDesktop ? (
            <>
              <Text style={sharedStyles.panelTitle} numberOfLines={1}>
                {isMonitoringRoute ? `Rota de ${vendorLabel(routeVendorFilterHubspotId)}` : 'Rota de hoje'}
              </Text>
              <Text style={styles.panelHint} numberOfLines={2}>
                {routeDisplayClients.length} leads planejados
                {geometriaDaRota && geometriaDaRota.coordinates.length > 1 && (
                  ` · ${(geometriaDaRota!.distanceMeters / 1000).toFixed(1)} km`
                  + ` · ~${Math.round(geometriaDaRota!.durationSeconds / 60)} min`
                )}
                {geometriaCarregando && ' · calculando rota...'}
              </Text>
            </>
          ) : (
            /* No celular o titulo vira o cabecalho da SEQUENCIA e recebe o
               caminho de volta pro sheet (M3c/B). Paradas, km e minutos ja'
               estao na faixa de KPIs do header — repeti-los aqui era a
               sublinha que o M3b teve de espremer. O "Refazer rota" e' text
               button, e nao CTA vermelho: gerar de novo descarta a rota em
               andamento, e um primario ao lado da sequencia convida ao
               acidente. */
            <View style={styles.sequenciaCabecalho}>
              <Text style={styles.sequenciaKicker} numberOfLines={1}>
                {isMonitoringRoute
                  ? `ROTA DE ${vendorLabel(routeVendorFilterHubspotId).toUpperCase()}`
                  : `SEQUÊNCIA · ${routeDisplayClients.length} `
                    + `${routeDisplayClients.length === 1 ? 'PARADA' : 'PARADAS'}`}
                {geometriaCarregando && ' · CALCULANDO…'}
              </Text>
              {!isMonitoringRoute && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Refazer rota"
                  style={styles.refazerBotao}
                  onPress={abrirMontagem}
                >
                  <IconSettings width={20} height={20} fill={iconColors.info} />
                  <Text style={styles.refazerTexto} numberOfLines={1}>Refazer rota</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {/* Badge admin: mostra qual provedor foi usado na ultima sugestao.
              ORS = caminho feliz; OSRM = ORS caiu e o fallback rolou.
              `alignSelf:flex-start` + `flexShrink:0`: ele nao empurra nem e'
              empurrado — era o outro texto que quebrava palavra por palavra. */}
          {isAdmin && lastProviderUsed && (
            <View style={[styles.providerBadge, lastProviderUsed === 'osrm' && { backgroundColor: 'var(--tint-amber)', borderColor: 'var(--tint-amber-border)' }]}>
              <Text
                style={[styles.providerBadgeText, lastProviderUsed === 'osrm' && { color: 'var(--tint-amber-text)' }]}
                numberOfLines={1}
              >
                {lastProviderUsed === 'ors'
                  ? 'Via OpenRouteService'
                  : 'Via OSRM (ORS estava fora)'}
              </Text>
            </View>
          )}
        </View>
        {/* No celular vira faixa de largura total. Sem `flexWrap`: com botoes
            de flex:1 nao ha' o que envolver. */}
        <View style={[
          { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
          !layout.ehDesktop && styles.faixaAcoes,
        ]}>
          {routeDisplayClients.length > 0 && (
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: '#16a34a' },
                !layout.ehDesktop && styles.acaoMovel,
              ]}
              onPress={startNavigation}
            >
              {layout.ehDesktop ? (
                <IconText
                  Icone={IconLocation}
                  style={[styles.secondaryButtonText, { color: '#fff' }]}
                  tone="onSurface"
                >Navegar</IconText>
              ) : (
                /* `IconText` nao repassa `numberOfLines`; no celular o rotulo
                   PRECISA de uma linha so', entao icone e texto vao soltos. */
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <IconLocation width={20} height={20} fill="#FFFFFF" />
                  <Text
                    style={[styles.secondaryButtonText, styles.acaoMovelTexto, { color: '#fff' }]}
                    numberOfLines={1}
                  >Navegar</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          {routeDisplayClients.length > 0 ? (
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: '#C8131B' },
                !layout.ehDesktop && styles.acaoMovel,
              ]}
              onPress={viewRouteOnMap}
            >
              <Text
                style={[styles.secondaryButtonText, !layout.ehDesktop && styles.acaoMovelTexto, { color: '#fff' }]}
                numberOfLines={1}
              >Ver no mapa</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.secondaryButton, !layout.ehDesktop && styles.acaoMovel]}
              onPress={() => irParaMapa()}
            >
              <Text
                style={[styles.secondaryButtonText, !layout.ehDesktop && styles.acaoMovelTexto]}
                numberOfLines={1}
              >Abrir mapa</Text>
            </TouchableOpacity>
          )}
          {routeDisplayClients.length > 0 && !isMonitoringRoute && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Limpar rota"
              style={[
                styles.secondaryButton,
                { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
                // No celular vira so' o icone: com os tres rotulados, "Navegar"
                // e "Ver no mapa" ja' ocupam a faixa inteira em 390px.
                !layout.ehDesktop && styles.acaoIcone,
              ]}
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
              {layout.ehDesktop ? (
                <Text style={[styles.secondaryButtonText, { color: 'var(--tint-red-text)' }]}>Limpar</Text>
              ) : (
                <IconTrash width={20} height={20} fill={iconColors.tintRedText} />
              )}
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
          // A parada ATUAL e' a primeira ainda nao feita: e' a proxima que ele
          // vai atacar, e a unica que ganha acao.
          const idxAtual = routeDisplayClients.findIndex(
            (c) => routeStops.find(st => st.client_id === c.id)?.status !== 'done',
          );
          const ehAtual = index === idxAtual && !isMonitoringRoute;
          const title = nomeDoLead(client);
          const detalhe = [client.bairro, client.cidade, client.estado].filter(Boolean).join(' · ')
            || 'Localização não informada';
          const mreason = stop?.mandatory_reason as MandatoryReason | undefined;
          // Tag: uma so', na ordem de quem manda mais na decisao.
          const tag = isDone
            ? { t: 'Visitado', bg: '#EAF7EE', fg: '#167532' }
            : ehAtual
              ? { t: 'Agora', bg: 'var(--tint-red)', fg: 'var(--tint-red-text)' }
              : mreason === 'sla'
                ? { t: 'SLA', bg: '#FFF8EB', fg: '#99670F' }
                : mreason === 'conta_alvo'
                  ? { t: 'Alvo', bg: '#F1EBFE', fg: '#5B32C4' }
                  : mreason === 'relacionamento'
                    ? { t: 'Demo', bg: '#F1EBFE', fg: '#5B32C4' }
                    : null;
          const indiceCor = isDone
            ? { bg: '#EAF7EE', fg: '#167532' }
            : ehAtual
              ? { bg: '#C8131B', fg: '#FFFFFF' }
              : { bg: 'var(--surface-2)', fg: 'var(--text-muted)' };
          return (
            <TouchableOpacity
              key={client.id}
              // O toque no card abre o lead — por isso "Abrir" saiu como botao.
              accessibilityRole="button"
              activeOpacity={0.9}
              onPress={() => openClientDetails(client)}
              style={[styles.paradaCard, ehAtual && styles.paradaCardAtual]}
            >
              <View style={styles.paradaTopo}>
                {/* O checkbox fica nas OUTRAS paradas: e' o caminho manual de
                    consertar a lista (visitou antes, pulou), sem GPS. Na atual
                    quem manda e' o Check-in, pra nao haver dois estados de
                    "feita". Alvo de 48 pelo padding, quadrado visual em 24. */}
                {!ehAtual && (
                  <TouchableOpacity
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isDone }}
                    accessibilityLabel={isDone ? 'Desmarcar parada' : 'Marcar parada como feita'}
                    style={styles.paradaCheckAlvo}
                    onPress={() => { if (stop) fieldOps.toggleStopDone.mutate(stop); }}
                    disabled={!stop || isMonitoringRoute}
                  >
                    <View style={[styles.checkbox, isDone && styles.checkboxChecked]}>
                      {isDone && <IconCheck width={14} height={14} fill={iconColors.onBrand} />}
                    </View>
                  </TouchableOpacity>
                )}
                <View style={[styles.paradaIndice, { backgroundColor: indiceCor.bg }]}>
                  <Text style={[styles.paradaIndiceTexto, { color: indiceCor.fg }]}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.paradaNomeLinha}>
                    <Text
                      style={[styles.paradaNome, isDone && { color: 'var(--text-muted)' }]}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    {tag && (
                      <View style={[styles.paradaTag, { backgroundColor: tag.bg }]}>
                        <Text style={[styles.paradaTagTexto, { color: tag.fg }]}>{tag.t}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.paradaDetalhe} numberOfLines={1}>{detalhe}</Text>
                </View>
                {/* Subir/Descer ficam: reordenar e' acao de rua, e dois toques
                    a mais custam caro em movimento. */}
                {!isMonitoringRoute && (
                  <View style={styles.paradaMover}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Subir parada"
                      style={[styles.paradaMoverBotao, index === 0 && { opacity: 0.3 }]}
                      disabled={index === 0}
                      onPress={() => moverParada(index, index - 1)}
                    >
                      <IconArrowUp width={20} height={20} fill={iconColors.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Descer parada"
                      style={[styles.paradaMoverBotao, isLast && { opacity: 0.3 }]}
                      disabled={isLast}
                      onPress={() => moverParada(index, index + 1)}
                    >
                      <IconArrowDown width={20} height={20} fill={iconColors.muted} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {ehAtual && (
                <View style={styles.paradaAcoes}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.paradaCheckin}
                    onPress={() => {
                      // No sucesso marca a parada como feita: um estado so'.
                      onMarkVisited?.(client, () => {
                        if (stop) fieldOps.markStopDone.mutate(stop);
                      });
                    }}
                    disabled={!onMarkVisited}
                  >
                    <IconLocationFilled width={24} height={24} fill="#FFFFFF" />
                    <Text style={styles.paradaCheckinTexto}>Check-in</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Navegar até a parada"
                    style={styles.paradaNavegar}
                    // Sem argumento de proposito: `startNavigation` entra no
                    // modo de navegacao da ROTA, que comeca justamente na
                    // parada atual. Nao ha' segunda rota pra um stop so'.
                    onPress={startNavigation}
                  >
                    <IconArrowFoward width={24} height={24} fill={iconColors.onSurface} />
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
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

  // Remover parada e' destrutivo, entao saiu do card e mora no sheet desde o
  // M3. Alvo 40: aqui e' ferramenta de configuracao, parado, com as duas maos
  // — nao a rua. Virou constante pra o menu do M3c poder linkar pra ele.
  const cartaoParadas = (
    <View style={styles.panelCard}>
      <Text style={sharedStyles.panelTitle}>Reordenar / remover paradas</Text>
      <Text style={styles.panelHint}>
        Subir e descer também ficam no card de cada parada. Remover mora só aqui.
      </Text>
      {routeDisplayClients.map((client, index) => {
        const stop = routeStops.find(st => st.client_id === client.id);
        return (
          <View key={client.id} style={styles.configParadaLinha}>
            <Text style={styles.configParadaIndice}>{index + 1}</Text>
            <Text style={styles.configParadaNome} numberOfLines={1}>{nomeDoLead(client)}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Subir ${nomeDoLead(client)}`}
              style={[styles.configParadaBotao, index === 0 && { opacity: 0.3 }]}
              disabled={index === 0}
              onPress={() => moverParada(index, index - 1)}
            >
              <IconArrowUp width={20} height={20} fill={iconColors.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Descer ${nomeDoLead(client)}`}
              style={[
                styles.configParadaBotao,
                index === routeDisplayClients.length - 1 && { opacity: 0.3 },
              ]}
              disabled={index === routeDisplayClients.length - 1}
              onPress={() => moverParada(index, index + 1)}
            >
              <IconArrowDown width={20} height={20} fill={iconColors.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Remover ${nomeDoLead(client)}`}
              style={styles.configParadaBotao}
              disabled={!stop}
              onPress={() => { if (stop) fieldOps.removeStop.mutate(stop); }}
            >
              <IconClose width={20} height={20} fill={iconColors.tintRedText} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

  // Card-link do menu de montagem: leva a um formulario que ja' existe. So' o
  // ponto de entrada e' novo — `cartaoPersonalizada` e `cartaoAdicionar` nao
  // foram reescritos.
  const linkMontagem = (
    Icone: typeof IconSettings,
    titulo: string,
    sub: string,
    aoTocar: () => void,
  ) => (
    <TouchableOpacity accessibilityRole="button" style={styles.montagemLink} onPress={aoTocar}>
      <Icone width={24} height={24} fill={iconColors.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.montagemTitulo}>{titulo}</Text>
        <Text style={styles.montagemLinkSub}>{sub}</Text>
      </View>
      <IconChevronRight width={24} height={24} fill={iconColors.faint} />
    </TouchableOpacity>
  );

  const tituloNivel = nivelMontagem === 'personalizada'
    ? 'Rota personalizada'
    : nivelMontagem === 'adicionar' ? 'Adicionar lead manualmente' : 'Reordenar / remover paradas';

  const semParadas = routeDisplayClients.length === 0;
  // O mapa cresce em dois casos: sem rota (e' o caminho de "abrir um pin", a
  // unica coisa que sobrou pra fazer) e no expandido.
  const mapaGrande = mapaExpandido || semParadas;

  // --- Peek do estado vazio (quadro 1a) ---------------------------------
  // O CTA fica a UM toque, com o mapa preservado atras. Era o que faltava: o
  // M3 mandou "Gerar Rota do dia" pro sheet e o primeiro gesto do dia virou
  // dois toques atras de uma engrenagem sem rotulo.
  const folhaVazia = (
    <View style={styles.folha}>
      <View style={styles.folhaAlca} />
      {bannerMonitor}
      <Text style={styles.folhaTitulo}>Nenhuma parada hoje</Text>
      <Text style={styles.folhaTexto}>{copiaRotaCurta}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.ctaPrimario, { marginTop: 16 }, isMonitoringRoute && { opacity: 0.4 }]}
        // Sem GPS e sem ponto de partida, o proprio `generateDailyRoute` avisa
        // com o Alert de "Sem localização" — desabilitar aqui seria negar o
        // toque sem dizer por que.
        onPress={gerarRotaDoDia}
        disabled={carregandoRota || isMonitoringRoute}
      >
        {carregandoRota ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.ctaPrimarioLinha}>
            <IconSparkle width={22} height={22} fill="#FFFFFF" />
            <Text style={styles.ctaPrimarioTexto}>Gerar Rota do dia</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.folhaSecundarios}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.botaoSecundario}
          onPress={abrirMontagem}
        >
          <IconSettings width={20} height={20} fill={iconColors.muted} />
          <Text style={styles.botaoSecundarioTexto} numberOfLines={1}>Montar eu mesmo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.botaoSecundario}
          onPress={() => irParaMapa()}
        >
          <IconLocation width={20} height={20} fill={iconColors.muted} />
          <Text style={styles.botaoSecundarioTexto} numberOfLines={1}>Abrir um pin</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // --- Peek do mapa expandido (quadro 1d) -------------------------------
  const proximaStop = proximaParada
    ? routeStops.find(st => st.client_id === proximaParada.id)
    : undefined;
  const proximaSublinha = proximaParada ? [
    'Próxima parada',
    proximaStop?.distance_meters != null
      ? `${(proximaStop.distance_meters / 1000).toFixed(1).replace('.', ',')} km`
      : null,
    proximaStop?.mandatory_reason
      ? MANDATORY_BADGE[proximaStop.mandatory_reason as MandatoryReason]
      : [proximaParada.bairro, proximaParada.cidade].filter(Boolean).join(', ') || null,
  ].filter(Boolean).join(' · ') : '';

  // Alca: arrastar pra cima abre a sequencia inteira, pra baixo recolhe.
  const alcaPan = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.dy < -32) setSequenciaAberta(true);
      else if (g.dy > 32) setSequenciaAberta(false);
    },
  });

  const folhaExpandida = (
    <View style={styles.folha}>
      <View style={styles.folhaAlcaArea} {...alcaPan.panHandlers}>
        <View style={styles.folhaAlca} />
      </View>
      {sequenciaAberta ? (
        <>
          <View style={styles.sequenciaCabecalho}>
            <Text style={styles.sequenciaKicker} numberOfLines={1}>
              {`SEQUÊNCIA · ${routeDisplayClients.length} `}
              {routeDisplayClients.length === 1 ? 'PARADA' : 'PARADAS'}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Recolher a sequência"
              style={styles.refazerBotao}
              onPress={() => setSequenciaAberta(false)}
            >
              <Text style={styles.refazerTexto} numberOfLines={1}>Recolher</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
            {routeDisplayClients.map((client, index) => {
              const stop = routeStops.find(st => st.client_id === client.id);
              const feita = stop?.status === 'done';
              const agora = index === indiceProxima;
              return (
                <TouchableOpacity
                  key={client.id}
                  accessibilityRole="button"
                  style={styles.folhaLinha}
                  onPress={() => openClientDetails(client)}
                >
                  <View style={[
                    styles.folhaPino,
                    feita
                      ? { backgroundColor: 'var(--tint-green)' }
                      : agora
                        ? { backgroundColor: '#C8131B' }
                        : { backgroundColor: 'var(--surface-2)' },
                  ]}>
                    {feita
                      ? <IconCheck width={14} height={14} fill={iconColors.tintGreenText} />
                      : <Text style={[
                          styles.folhaPinoTexto,
                          agora && { color: '#FFFFFF' },
                        ]}>{index + 1}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.folhaLinhaNome} numberOfLines={1}>{nomeDoLead(client)}</Text>
                    <Text style={styles.folhaLinhaDetalhe} numberOfLines={1}>
                      {[client.bairro, client.cidade].filter(Boolean).join(' · ') || 'Localização não informada'}
                    </Text>
                  </View>
                  <IconChevronRight width={20} height={20} fill={iconColors.faint} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      ) : proximaParada ? (
        <View style={styles.folhaProxima}>
          <View style={[styles.folhaPino, styles.folhaPinoAgora]}>
            <Text style={[styles.folhaPinoTexto, { color: '#FFFFFF' }]}>{indiceProxima + 1}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.folhaProximaNome} numberOfLines={1}>{nomeDoLead(proximaParada)}</Text>
            <Text style={styles.folhaLinhaDetalhe} numberOfLines={1}>{proximaSublinha}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.folhaTexto}>Todas as paradas de hoje foram feitas.</Text>
      )}
      {!sequenciaAberta && (
        <View style={styles.folhaSecundarios}>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.folhaNavegar}
            onPress={startNavigation}
          >
            <IconLocation width={20} height={20} fill="#FFFFFF" />
            <Text style={styles.folhaNavegarTexto} numberOfLines={1}>Navegar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.botaoSecundario}
            onPress={() => setSequenciaAberta(true)}
          >
            <Text style={styles.botaoSecundarioTexto} numberOfLines={1}>
              {`Ver as ${routeDisplayClients.length} paradas`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <>
      {/* O container do mapa e' SEMPRE o primeiro filho: so' a altura muda.
          Trocar de posicao na arvore remontaria o <MapView> e o Google Maps
          voltaria ao centro e ao zoom iniciais a cada expandir/recolher.
          Faixa de 180px com rota (a sequencia e' o objeto de trabalho, o mapa
          orienta); tela inteira sem rota ou no expandido. */}
      <View style={mapaGrande ? styles.mapaCheio : styles.mapaFaixa}>
        {conteudoMapa}
        {!mapaExpandido && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Expandir mapa"
            style={[styles.mapaBotao, { top: 12, right: 12 }]}
            onPress={() => setMapaExpandido(true)}
          >
            <IconExpand width={22} height={22} fill={iconColors.muted} />
          </TouchableOpacity>
        )}
        {mapaExpandido && (
          <View style={styles.mapaTopo}>
            {/* Os tres KPIs do header viram UMA pilula: o header some, mas o
                "quanto tem pela frente" nao pode sumir junto. Sem rota ela
                sai inteira, pela mesma razao que a faixa sai do header. */}
            {!semParadas && (
            <View style={styles.mapaPilula}>
              <Text style={styles.mapaPilulaValor}>{routeDisplayClients.length}</Text>
              <Text style={styles.mapaPilulaTexto} numberOfLines={1}>
                {`${routeDisplayClients.length === 1 ? 'parada' : 'paradas'} · ${km} · ${minutos}`}
              </Text>
            </View>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Recolher mapa"
              style={styles.mapaBotaoEstatico}
              onPress={() => setMapaExpandido(false)}
            >
              <IconShrink width={22} height={22} fill={iconColors.tintRedText} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Sem rota o peek e' sempre o do CTA, expandido ou nao: nao ha'
          sequencia a recolher, e o que falta fazer e' gerar a rota. */}
      {semParadas ? folhaVazia : mapaExpandido ? folhaExpandida : (
      <ScrollView
        contentContainerStyle={[
          sharedStyles.listContent,
          // 40 = os 24px que o FAB central protrai acima da barra + folga.
          // Nao ha' 90 de barra a reservar: a barra e o `insets` vivem FORA
          // deste scroll (sao irmaos na coluna da tela), e reserva-los aqui
          // deixava ~114px mortos no fim de uma lista cujo M3 inteiro foi
          // sobre devolver altura. Tarefas e Agenda carregam a mesma conta —
          // anotado pros prompts delas.
          { paddingBottom: 40 },
          { maxWidth: layout.larguraMaxima, width: '100%', alignSelf: 'center' },
        ]}
      >
        {bannerMonitor}
        {/* A promessa do dia NAO foi pro sheet: nao e' configuracao, e esta e'
            a tela onde ele decide o dia. Perguntar "quantas visitas hoje?"
            atras de uma engrenagem seria perguntar fora do momento. */}
        {cartaoDaily}
        {/* A sequencia sobe pro topo: era o ultimo de cinco cartoes, e ficava
            enterrada sob a configuracao que so' se usa uma vez por dia. */}
        {cartaoLista}
      </ScrollView>
      )}

      {/* Os TRES auxiliares que de fato moram nesta tela. RouteConfigCard,
          RouteHistorySection e DismissedContaAlvoCard, que o M3 lista, nao
          estao aqui — sao do GestorScreen. Nao foram tocados. */}
      <Modal
        visible={configAberta}
        animationType="slide"
        transparent
        onRequestClose={() => (nivelMontagem === 'menu' ? fecharMontagem() : setNivelMontagem('menu'))}
      >
        {nivelMontagem === 'menu' ? (
          /* Menu de montagem (quadro 1c): hierarquia declarada — o automatico
             em destaque, o manual como card-link. Nada sumiu: os tres
             auxiliares do M3 continuam alcancaveis daqui. */
          <View style={styles.montagemFundo}>
            {/* Backdrop IRMAO do conteudo, nunca envolvendo: um Pressable em
                volta vira responder no navegador touch, cancela o click
                sintetico e o campo de busca do nivel de baixo nunca recebe
                foco (regra do CLAUDE.md). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              style={StyleSheet.absoluteFill}
              onPress={fecharMontagem}
            />
            <View style={[styles.montagemFolha, { paddingBottom: 32 + insets.bottom }]}>
              <View style={styles.folhaAlca} />
              <Text style={styles.folhaTitulo}>Montar a rota</Text>
              <Text style={styles.montagemSublinha}>Três caminhos. O primeiro é o do dia a dia.</Text>
              {/* Rolavel: com rota na tela sao quatro itens, e num aparelho de
                  568px de altura eles passariam do rodape. */}
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingTop: 16 }}>
                {cartaoRotaDoDia}
                {linkMontagem(
                  IconSettings,
                  'Rota personalizada',
                  'Escolha quantos leads, quais status e o responsável.',
                  () => setNivelMontagem('personalizada'),
                )}
                {!isMonitoringRoute && linkMontagem(
                  IconUserAdd,
                  'Adicionar lead manualmente',
                  'Busque pelo nome do restaurante ou contato pra incluir na rota.',
                  () => setNivelMontagem('adicionar'),
                )}
                {routeDisplayClients.length > 0 && !isMonitoringRoute && linkMontagem(
                  IconMenu,
                  'Reordenar / remover paradas',
                  'Subir e descer também ficam no card de cada parada. Remover mora só aqui.',
                  () => setNivelMontagem('paradas'),
                )}
              </ScrollView>
            </View>
          </View>
        ) : (
          /* Um degrau abaixo: os formularios que ja' existiam, sem uma linha
             reescrita. O arrow_back volta pro menu, nao fecha o sheet. */
          <View style={styles.configSheet}>
            <View style={styles.configCabecalho}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Voltar"
                style={styles.configVoltar}
                onPress={() => setNivelMontagem('menu')}
              >
                <IconArrowBack width={24} height={24} fill={iconColors.onSurface} />
              </TouchableOpacity>
              <Text style={styles.configTitulo}>{tituloNivel}</Text>
            </View>
            {/* O sheet e' de tela cheia: sem o inset o ultimo cartao fica sob o
                indicador de home. E' o unico lugar da tela que ainda precisa
                dele — o scroll da sequencia para acima da barra. */}
            <ScrollView contentContainerStyle={[styles.configCorpo, { paddingBottom: 16 + insets.bottom }]}>
              {nivelMontagem === 'personalizada' && cartaoPersonalizada}
              {nivelMontagem === 'adicionar' && cartaoAdicionar}
              {nivelMontagem === 'paradas' && cartaoParadas}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

// Estilos exclusivos desta tela, movidos do App.tsx como estavam.
const styles = StyleSheet.create({
  // Faixa do mapa: 180px fixos. `flex: 0 0 180px` no RN e' flexGrow/Shrink 0.
  mapaFaixa: { flexGrow: 0, flexShrink: 0, height: 180 },
  // Mapa grande (sem rota ou expandido). Objeto SEPARADO, e nao um override
  // do de cima: no react-native-web um `height: undefined` nao emite regra e
  // portanto nao cancela os 180px da base.
  mapaCheio: { flexGrow: 1, flexShrink: 1, minHeight: 0 },

  // ---- M3c: chrome do mapa da Rota ----
  // Pill de 48 sobre o mapa. Mesmo desenho do `mapaControleRota` do App.tsx
  // (recentrar e calor) — aqui ficam os controles que sao SO' desta tela.
  mapaBotao: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 9999,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  // Mesma pill, mas dentro da linha do topo (nao absoluta).
  mapaBotaoEstatico: {
    width: 48,
    height: 48,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 48,
    borderRadius: 9999,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  mapaTopo: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    // Sem a pilula (rota vazia) o recolher fica sozinho — e a' direita, no
    // lugar de onde o expandir saiu.
    justifyContent: 'flex-end',
    gap: 8,
  },
  mapaPilula: {
    flex: 1,
    minWidth: 0,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  mapaPilulaValor: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
    fontWeight: '700',
    color: 'var(--text)',
    fontVariant: ['tabular-nums'],
  },
  mapaPilulaTexto: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },

  // ---- M3c: folha ancorada no rodape (quadros 1a e 1d) ----
  // 40 de reserva mesmo sem barra visivel: a area de gestos continua la'.
  folha: {
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: 'var(--border)',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 12,
    elevation: 8,
  },
  folhaAlca: {
    width: 36,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'var(--stroke-default)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  // Area de arraste em volta da alca: 4px de alca nao se pega com o dedo.
  folhaAlcaArea: { alignSelf: 'stretch', paddingVertical: 8, marginTop: -8, alignItems: 'center' },
  folhaTitulo: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: 'var(--text)' },
  folhaTexto: { marginTop: 4, fontSize: 14, lineHeight: 20, letterSpacing: 0.25, color: 'var(--text-muted)' },
  folhaSecundarios: { flexDirection: 'row', gap: 8, marginTop: 8 },
  folhaProxima: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  folhaProximaNome: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: 'var(--text)' },
  folhaPino: { width: 32, height: 32, flexGrow: 0, flexShrink: 0, flexBasis: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  folhaPinoAgora: { backgroundColor: '#C8131B' },
  folhaPinoTexto: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: 'var(--text-muted)', fontVariant: ['tabular-nums'] },
  folhaLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  folhaLinhaNome: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: 'var(--text)' },
  folhaLinhaDetalhe: { marginTop: 2, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  folhaNavegar: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  folhaNavegarTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: '#FFFFFF' },

  // ---- M3c: botoes de acao ----
  ctaPrimario: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#C8131B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimarioLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaPrimarioTexto: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: '#FFFFFF' },
  botaoSecundario: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  botaoSecundarioTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text-muted)' },

  // ---- M3c: cabecalho da sequencia (quadro 1b) ----
  sequenciaCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sequenciaKicker: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  // Alvo de 48 de altura sem caixa desenhada: e' text button, nao botao.
  refazerBotao: { height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  // `--info-text` no lugar do #018CCC do handoff: o azul do desenho da 3,8:1
  // sobre a superficie clara, abaixo dos 4,5:1 de texto — e no escuro o token
  // ja' tem o par claro.
  refazerTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--info-text)' },

  // ---- M3c: sheet de montagem (quadro 1c) ----
  montagemFundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  montagemFolha: {
    maxHeight: '90%',
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  montagemSublinha: { marginTop: 2, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  montagemDestaque: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'var(--tint-red)',
    borderWidth: 1,
    borderColor: '#C8131B',
  },
  montagemLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  montagemTitulo: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: 'var(--text)' },
  montagemDescricao: { marginTop: 2, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-muted)' },
  montagemLink: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
  },
  montagemLinkSub: { marginTop: 2, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  configSheet: { flex: 1, backgroundColor: 'var(--bg)' },
  configCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'var(--surface)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  configVoltar: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  configTitulo: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: 'var(--text)' },
  configCorpo: { padding: 16, gap: 24 },
  paradaCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  paradaCardAtual: { borderColor: '#C8131B' },
  paradaTopo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Alvo de 48 sem engordar o quadrado de 24: o padding e' que cresce.
  paradaCheckAlvo: { padding: 12, marginLeft: -12, marginVertical: -12 },
  paradaIndice: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  paradaIndiceTexto: { fontSize: 14, lineHeight: 32, letterSpacing: 0.1, fontWeight: '700' },
  paradaNomeLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  paradaNome: { flexShrink: 1, fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: 'var(--text)' },
  paradaTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  paradaTagTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600' },
  paradaDetalhe: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)', marginTop: 2 },
  paradaMover: { flexDirection: 'row', gap: 4 },
  // EXCECAO DOCUMENTADA a' regra de alvo >= 48 (auditoria M3, item 15): 48 de
  // ALTURA, 32 de largura. Levar a largura a 48 tiraria 28px do nome do lead
  // (de ~154 pra ~134 num card de 390) — pior troca, porque o nome e' o
  // conteudo e a seta e' o acessorio. Os dois botoes sao adjacentes e
  // empilhados na horizontal, entao a faixa tocavel continua com 68x48
  // contigua; errar a seta acerta a vizinha, nao o vazio.
  paradaMoverBotao: { width: 32, height: 48, alignItems: 'center', justifyContent: 'center' },
  paradaAcoes: { flexDirection: 'row', gap: 8, marginTop: 12 },
  paradaCheckin: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#27A84C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  paradaCheckinTexto: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: '#FFFFFF' },
  paradaNavegar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  configParadaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border-soft)',
  },
  configParadaIndice: {
    width: 24,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: 'var(--text-faint)',
    fontVariant: ['tabular-nums'],
  },
  configParadaNome: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)' },
  configParadaBotao: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
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
  // ---- M3b: o cartao "Rota de hoje" em 390px ----
  panelHeaderRowMovel: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  // `tituloCartao` e `sublinhaCartao` sairam com o M3c: no celular o titulo do
  // cartao virou o kicker da sequencia (`sequenciaKicker`), e a sublinha de
  // paradas/km/min ja' esta' na faixa de KPIs do header.
  faixaAcoes: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, justifyContent: 'flex-start' },
  acaoMovel: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoMovelTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600' },
  acaoIcone: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 48,
    width: 48,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelHint: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 17 },
  providerBadge: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    marginTop: 8,
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
