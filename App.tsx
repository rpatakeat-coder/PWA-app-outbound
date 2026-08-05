import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Image,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Alert,
  Linking,
  Pressable,
  Animated,
  PanResponder,
  Switch,
  AppState,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView from 'react-native-map-clustering';
import { Marker, Polyline, default as RNMapView } from 'react-native-maps';
import * as Location from 'expo-location';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useClients } from './src/hooks/useClients';
import { useMeetings } from './src/hooks/useMeetings';
import { bearingDegrees, distanceMeters, todayKey, useFieldOps } from './src/hooks/useFieldOps';
import { useClientNotes } from './src/hooks/useClientNotes';
import { useClientStageChanges } from './src/hooks/useClientStageChanges';
import { useClientVisits } from './src/hooks/useClientVisits';
import { useClientTasks } from './src/hooks/useClientTasks';
import { useForceReload } from './src/hooks/useForceReload';
import { supabase } from './src/integrations/supabase/client';
import { AREA_RADIUS_KM } from './src/utils/area';
import { getShowOnlyMyAreaPref, setShowOnlyMyAreaPref } from './src/utils/userPrefs';
import type { Client, ClientMeeting, ClientStatus, ClientTask, MeetingType } from './src/types/client';
import { openMultiStopNavigation, openNavigation } from './src/utils/navigation';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { CEPStep } from './src/screens/CEPStep';
import { OutboundCadastroScreen } from './src/screens/OutboundCadastroScreen';
import { ScheduleMeetingModal } from './src/screens/ScheduleMeetingModal';
import { ChangeStageModal } from './src/screens/ChangeStageModal';
import { EditLocationModal } from './src/screens/EditLocationModal';
import { DECISOR_STAGE_ID, FUNNEL_STAGE_IDS, LOST_STAGE_ID, STAGES, TEMP_COLORS, stageTemperature } from './src/constants/stages';
import { useStages } from './src/hooks/useStages';
import { GestorScreen } from './src/screens/GestorScreen';
import { MeuDesempenhoScreen } from './src/screens/MeuDesempenhoScreen';
import { reverseGeocode } from './src/utils/geocoding';
import { fetchOptimizedTrip, fetchRouteGeometry, type RoutePoint, type RoutingProvider } from './src/utils/routing';
import { exportAgenda } from './src/utils/exportAgenda';

const queryClient = new QueryClient();

// Normalizacao de UF — no banco existem clientes salvos como "ES" e outros
// como "ESPIRITO SANTO" / "Espírito Santo". O filtro precisa colapsar todos
// pro mesmo bucket de 2 letras, senao aparece "ES" e "ESPIRITO SANTO" como
// chips separados (mesmo estado, listas duplicadas).
const BR_UF_BY_NAME: Record<string, string> = {
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM',
  'BAHIA': 'BA', 'CEARA': 'CE', 'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES',
  'GOIAS': 'GO', 'MARANHAO': 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', 'PARA': 'PA', 'PARAIBA': 'PB', 'PARANA': 'PR',
  'PERNAMBUCO': 'PE', 'PIAUI': 'PI', 'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO', 'RORAIMA': 'RR', 'SANTA CATARINA': 'SC',
  'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO',
};

const normalizeUf = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const cleaned = raw.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toUpperCase().trim();
  if (!cleaned) return null;
  if (cleaned.length === 2) return cleaned;
  return BR_UF_BY_NAME[cleaned] ?? cleaned;
};

// Labels do pipeline NOVO (2026-07). Etapa que nao esteja aqui e' de pipeline
// antigo (CASA DOS DADOS, RECICLAGEM 90 DIAS, Clientes Mapa Outbound etc.) e
// e' colapsada num unico bucket "Pipe Antigo" pra exibicao/agrupamento — sem
// mexer no clients.etapa. Conforme o RPA sincroniza o lead pro label novo, ele
// sai do bucket sozinho. Comparacao case/acento-insensitive por robustez.
const PIPE_ANTIGO_LABEL = 'Pipe Antigo';
// Ordem CANONICA do pipeline novo = displayOrder do HubSpot. Alem de definir
// "o que e' pipeline novo", esta lista define a ORDEM das secoes da aba Lista
// e dos chips de filtro (igual ao HubSpot).
const NEW_PIPELINE_STAGE_LABELS = [
  'Backlog', 'Reciclagem', 'Prospecção', 'Visita', 'Conversa com decisor',
  'Demo/Proposta', 'Negociação', 'Ag. Pagamento', 'Negócio Fechado',
  'Enviado Onboarding', 'Perdido',
];
const foldLabel = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// fold -> label CANONICO. Antes o normalizeStage devolvia o label cru quando
// o fold batia, entao "DEMO/PROPOSTA" (deal do pipe antigo, caixa alta) virava
// uma secao SEPARADA de "Demo/Proposta" — a mesma etapa aparecia duas vezes.
// Agora qualquer variacao de caixa/acentos colapsa no label canonico. Aliases
// cobrem renomeacoes ('Diagnóstico' virou 'Conversa com decisor' no HubSpot).
const CANONICAL_STAGE_BY_FOLDED = new Map<string, string>([
  ...NEW_PIPELINE_STAGE_LABELS.map((l): [string, string] => [foldLabel(l), l]),
  [foldLabel('Diagnóstico'), 'Conversa com decisor'],
]);

const normalizeStage = (raw: string | null | undefined): string | null => {
  const cleaned = raw?.trim();
  if (!cleaned) return null;
  return CANONICAL_STAGE_BY_FOLDED.get(foldLabel(cleaned)) ?? PIPE_ANTIGO_LABEL;
};

// Indice de ordenacao de etapa: funil na ordem do HubSpot, Pipe Antigo (e
// qualquer label desconhecido) depois de tudo. "Sem etapa" e' tratado a parte
// pelos consumidores — vai mais pro fim ainda.
const stageOrderIndex = (label: string): number => {
  const idx = NEW_PIPELINE_STAGE_LABELS.indexOf(label);
  return idx >= 0 ? idx : NEW_PIPELINE_STAGE_LABELS.length;
};

const initialFormState = {
  nome: '',
  empresa: '',
  endereco: '',
  numero: '',
  cep: '',
  cidade: '',
  estado: '',
  telefone: '',
  email: '',
  status: 'lead' as ClientStatus,
  latitude: '',
  longitude: '',
  observacoes: '',
};

const STATUS_OPTIONS: { value: ClientStatus; label: string; color: string }[] = [
  { value: 'lead', label: 'Lead', color: '#3b82f6' },
  { value: 'ativo', label: 'Cliente Ativo', color: '#22c55e' },
  { value: 'em_integracao', label: 'Em Integração', color: '#f97316' },
  { value: 'ex_cliente', label: 'Ex-cliente', color: '#ef4444' },
];

type AppTab = 'map' | 'list' | 'route' | 'agenda' | 'tasks' | 'gestor' | 'meu';

// Documentacao das regras de geracao automatica de tarefas (motor
// generate_client_tasks no Supabase). Isto e' so a explicacao mostrada no
// modal "ⓘ" da aba Tarefas — a fonte da verdade da logica esta na funcao SQL.
// Estruturado como array pra ficar facil adicionar novas regras conforme o
// motor cresce (cada objeto vira um card no modal).
type TaskRuleDoc = {
  code: string;               // identificador da regra (task_type)
  title: string;              // titulo legivel
  trigger: string;            // quando dispara
  levels: { badge: string; color: string; when: string }[]; // severidades
  suppress: string;           // o que impede a tarefa de existir
  autoResolve: string;        // quando a tarefa some sozinha
  timing: string;             // como o tempo e' contado
};

const TASK_RULES: TaskRuleDoc[] = [
  {
    code: 'agendar_demo',
    title: 'Agendar Demo',
    trigger: 'Lead na etapa Conversa com decisor sem uma reunião (demo) futura agendada.',
    levels: [
      { badge: 'D2', color: '#f59e0b', when: 'a partir de 2 dias úteis na etapa' },
      { badge: 'D5', color: '#dc2626', when: 'a partir de 5 dias úteis na etapa (a mesma tarefa escala de D2 para D5)' },
    ],
    suppress:
      'Se o lead tiver uma reunião do tipo "reunião" (não follow-up) com data futura e status "agendada", a tarefa não é criada.',
    autoResolve:
      'A tarefa some sozinha (resolvida automaticamente) quando o lead ganha uma reunião futura, sai da etapa Conversa com decisor, ou deixa de ser lead. Tarefas que você concluiu ou dispensou manualmente não voltam.',
    timing:
      'O tempo é contado em DIAS ÚTEIS (fim de semana não conta) a partir da entrada na etapa (histórico de mudança de etapa). Sem histórico, conta a partir de quando a funcionalidade foi ativada (08/07/2026) — não de datas antigas — pra não gerar tarefas retroativas.',
  },
  {
    code: 'sla_etapa',
    title: 'SLA por etapa (prazo no funil)',
    trigger: 'Lead parado numa etapa do funil por mais dias que o SLA daquela etapa, sem avançar.',
    levels: [
      { badge: 'Xd', color: '#2563eb', when: 'o número no badge = dias que o lead está parado na etapa' },
    ],
    suppress:
      'Cada etapa tem um prazo (SLA) próprio configurável. Prazos iniciais: Prospecção 3d (Qualificar), Demo/Proposta 3d (Enviar proposta), Negociação 5d (Fechar), Aguardando Pagamento 3d (Confirmar pagamento).',
    autoResolve:
      'A tarefa some sozinha quando o lead avança de etapa (ou deixa de ser lead). O objetivo é medir cumprimento de prazo por etapa.',
    timing:
      'Contado em DIAS ÚTEIS (fim de semana não conta) a partir da entrada na etapa (histórico). A geração roda automaticamente a cada 30 minutos no servidor — não depende de abrir o app.',
  },
];

// Limpa e normaliza telefone pra wa.me. Aceita "(27) 99618-3875" / "27996183875"
// / "5527996183875" e devolve "5527996183875" (com DDI 55 default Brasil).
// Retorna null se tiver < 10 digitos (DDD + numero base) — telefone invalido.
function toWhatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length < 10) return null;
  // Se ja tem DDI 55 (13 digitos) ou outro DDI longo, mantem; senao adiciona 55.
  if (d.length >= 12 && d.startsWith('55')) return d;
  return `55${d}`;
}

// Abre o WhatsApp no telefone do cliente. Em mobile, o link wa.me redireciona
// pro app nativo via universal link (whatsapp://send). Em web cai no whatsapp web.
function openWhatsapp(rawPhone: string | null | undefined): boolean {
  const num = toWhatsappNumber(rawPhone);
  if (!num) {
    Alert.alert('Telefone invalido', 'O telefone do cliente nao tem formato valido pra abrir o WhatsApp.');
    return false;
  }
  const url = `https://wa.me/${num}`;
  Linking.openURL(url).catch(() =>
    Alert.alert('Erro', 'Nao foi possivel abrir o WhatsApp. Verifique se o aplicativo esta instalado.'),
  );
  return true;
}

const getClientPrimaryName = (client: Client) => client.empresa?.trim() || client.nome;

// A COR do pin comunica a temperatura da etapa (quente/morno/frio/fechado/
// perdido) — antes era uma bandeirinha de emoji no canto, pequena demais pra
// ler em zoom baixo. Leads sem etapa conhecida caem na cor do status.
function CustomMarker({ color, meetingCount, onLogoLoad }: { color: string; meetingCount: number; onLogoLoad?: () => void }) {
  return (
    <View style={markerStyles.container}>
      <View style={[markerStyles.pin, { backgroundColor: color }]}>
        <Image
          source={require('./assets/icon.png')}
          style={markerStyles.logo}
          // Asset embarcado: pinta sincronamente. defaultSource garante fallback.
          defaultSource={require('./assets/icon.png')}
          fadeDuration={0}
          // Avisa o MarkerWithReady que o PNG terminou de decodificar — só a
          // partir daí o snapshot do marker pode ser congelado com segurança.
          onLoadEnd={onLogoLoad}
        />
        {meetingCount > 0 && (
          <View style={markerStyles.meetingBadge}>
            <Text style={markerStyles.meetingBadgeText}>📅</Text>
          </View>
        )}
      </View>
      <View style={[markerStyles.arrow, { borderTopColor: color }]} />
    </View>
  );
}

const MarkerWithReady = React.memo(
  function MarkerWithReady({
    client,
    onPress,
    color,
    meetingCount,
    coordinate,
  }: { client: Client; onPress: (client: Client) => void; color: string; meetingCount: number; coordinate: { latitude: number; longitude: number } }) {
    // Pinta o marker num primeiro frame com tracksViewChanges=true
    // e desliga em seguida pra evitar re-renderizações contínuas.
    // Religa o tracking sempre que algo que afeta o snapshot muda
    // (badge de reunião, cor, OU a coordenada). A coordenada é crítica:
    // ao dar zoom, a lib de clustering divide os clusters e reposiciona
    // markers reaproveitando o mesmo native view. Se não re-snapshotarmos
    // nesse momento, o view nativo fica com um snapshot vazio/velho e o
    // pin some do mapa. Religando o tracking por um instante forçamos o
    // native a recapturar a imagem do marker na nova posição.
    const [tracking, setTracking] = useState(true);
    // O snapshot só pode ser congelado DEPOIS que o PNG do logo decodificou.
    // onLayout dispara quando o layout termina, mas o decode da imagem é
    // assíncrono — quando um cluster se divide no zoom, dezenas de markers
    // montam juntos e o decode enfileira; nos que passavam de 800ms o
    // snapshot congelava vazio e o pin ficava INVISÍVEL até o próximo
    // re-track (o "some ao aproximar, uns sim outros não" do campo).
    const [logoLoaded, setLogoLoaded] = useState(false);
    // Contador que força a janela de re-snapshot a reabrir (onLayout). O
    // onLayout antigo fazia setTracking(true) sem timer — além de não
    // resolver o decode tardio, deixava o marker em tracking pra sempre.
    const [pokeKey, setPokeKey] = useState(0);
    useEffect(() => {
      setTracking(true);
      // 800ms basta pra o native completar o snapshot; timer curto evita
      // manter dezenas de markers em tracking contínuo (custo de perf).
      const t = setTimeout(() => setTracking(false), 800);
      return () => clearTimeout(t);
    }, [meetingCount, color, coordinate.latitude, coordinate.longitude, logoLoaded, pokeKey]);

    const handlePress = useCallback(() => onPress(client), [onPress, client]);
    const handleLogoLoad = useCallback(() => setLogoLoaded(true), []);
    const handleLayout = useCallback(() => setPokeKey((k) => k + 1), []);

    return (
      <Marker
        coordinate={coordinate}
        onPress={handlePress}
        // Enquanto o logo não carregou, mantém tracking ligado (snapshot
        // congelado sem a imagem = pin invisível). Depois disso, o tracking
        // vira janelas curtas de 800ms a cada mudança relevante.
        tracksViewChanges={tracking || !logoLoaded}
        // Redesenha o snapshot assim que o custom view termina o layout —
        // garante que markers recém-montados no zoom capturem a imagem.
        onLayout={handleLayout}
      >
        <CustomMarker color={color} meetingCount={meetingCount} onLogoLoad={handleLogoLoad} />
      </Marker>
    );
  },
  (prev, next) =>
    prev.color === next.color &&
    prev.client.id === next.client.id &&
    prev.client.latitude === next.client.latitude &&
    prev.client.longitude === next.client.longitude &&
    prev.meetingCount === next.meetingCount &&
    prev.coordinate.latitude === next.coordinate.latitude &&
    prev.coordinate.longitude === next.coordinate.longitude &&
    prev.onPress === next.onPress,
);

const markerStyles = StyleSheet.create({
  container: { alignItems: 'center' },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  logo: {
    width: 20,
    height: 20,
    tintColor: '#fff',
    resizeMode: 'contain',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  meetingBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#7c3aed',
    paddingHorizontal: 3,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingBadgeText: { fontSize: 9 },
  // Marker da rota: maior, vermelho forte, com numero da ordem dentro.
  routePin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  routePinNumber: { color: '#fff', fontSize: 16, fontWeight: '800' },
  routeArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#dc2626',
    marginTop: -1,
  },
});

// Marker numerado que destaca leads pertencentes a rota do dia.
// Render direto (sem React.memo elaborado): a quantidade eh pequena
// (max ~30) e a posicao na rota pode mudar com reorder.
function RouteMarker({
  client,
  position,
  done = false,
  onPress,
}: {
  client: Client;
  position: number;
  done?: boolean;
  onPress: (client: Client) => void;
}) {
  return (
    <Marker
      coordinate={{ latitude: client.latitude as number, longitude: client.longitude as number }}
      onPress={() => onPress(client)}
      zIndex={1000}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
      // cluster={false}: react-native-map-clustering respeita esse flag
      // (lib/helpers.js linha 10). Sem isso, route markers proximos viravam
      // cluster azul com contagem e sumiam visualmente — o bug que o usuario
      // viu ao adicionar pin via mapa.
      // @ts-ignore — prop nao tipada na assinatura padrao do react-native-maps,
      // mas reconhecida pelo wrapper de clustering.
      cluster={false}
    >
      <View style={markerStyles.container}>
        <View style={[markerStyles.routePin, done && { backgroundColor: '#16a34a' }]}>
          <Text style={markerStyles.routePinNumber}>{done ? '✓' : position}</Text>
        </View>
        <View style={[markerStyles.routeArrow, done && { borderTopColor: '#16a34a' }]} />
      </View>
    </Marker>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, loading, logout, profile, updatePassword } = useAuth();
  const [tab, setTab] = useState<AppTab>('map');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showCepStep, setShowCepStep] = useState(false);
  // Guarda o flag de geocoding aproximado vindo do CEPStep ate o submit do
  // formulario, pra persistir em clients.geo_approximate.
  const [pendingGeoApproximate, setPendingGeoApproximate] = useState(false);
  const [showOutboundForm, setShowOutboundForm] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ClientStatus>('lead' as ClientStatus);
  // Multi-selecao de status exclusiva do viewer (role='view'). Diferente do
  // statusFilter (um status por vez) usado por vendedor/admin, aqui o viewer
  // marca varios status pra ver leads E clientes no mesmo mapa. Default: os
  // dois principais ligados.
  const [viewerStatuses, setViewerStatuses] = useState<Set<ClientStatus>>(
    () => new Set<ClientStatus>(['cliente', 'lead']),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  // Filtro de vendedor responsavel. null = sem filtro.
  // Non-admin so consegue setar pro proprio id_hubspot (toggle "meus leads").
  // Admin pode escolher qualquer vendedor via picker.
  const [vendorFilterHubspotId, setVendorFilterHubspotId] = useState<string | null>(null);
  // Filtro temporal de visita. null = sem filtro.
  // - 'never': visited_at IS NULL
  // - 'visited:<N>': visitado nos ultimos N dias
  // - 'not_visited:<N>': nao visitado nos ultimos N dias (inclui never + visited > N dias)
  const [visitFilter, setVisitFilter] = useState<string | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isPickingUf, setIsPickingUf] = useState(false);
  const [isPickingStage, setIsPickingStage] = useState(false);
  const [isPickingVendor, setIsPickingVendor] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(() => new Set());
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  // Modal que explica as regras de geracao automatica de tarefas (botao "ⓘ"
  // no cabecalho da aba Tarefas).
  const [isTaskRulesOpen, setIsTaskRulesOpen] = useState(false);
  // Chip de severidade selecionado na aba Tarefas (null = todas). Tocar no
  // chip ativo limpa o filtro.
  const [taskSevFilter, setTaskSevFilter] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showOnlyMyArea, setShowOnlyMyArea] = useState(true);
  const [locationPermission, setLocationPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [routeDate] = useState(todayKey());
  const [routeDraft, setRouteDraft] = useState<Client[]>([]);
  // Ponto de partida customizado da rota. null = usa o GPS (comportamento
  // padrao). Quando definido (o vendedor escolheu um cliente/local como base),
  // a rota parte dele em vez da localizacao atual. Guarda coords + um rotulo
  // pra UI mostrar de onde a rota vai partir.
  const [routeStartOverride, setRouteStartOverride] = useState<
    { latitude: number; longitude: number; label: string } | null
  >(null);
  // Controla o modal de escolha do ponto de partida (lista de clientes).
  const [isPickingRouteStart, setIsPickingRouteStart] = useState(false);
  const [routeLeadCount, setRouteLeadCount] = useState('8');
  // Status que entram no pool de sugestao. Default: leads que ainda precisam
  // ser visitados (caso de uso principal outbound). Multi-select substitui
  // o antigo "Filtro atual vs Todos visiveis".
  const [routeStatusSelection, setRouteStatusSelection] = useState<Set<string>>(
    () => new Set(['lead']),
  );
  // Filtro de vendedor na geracao de rota. null = sem filtro.
  // Non-admin: toggle pro proprio id_hubspot. Admin: picker com todos.
  const [routeVendorFilterHubspotId, setRouteVendorFilterHubspotId] = useState<string | null>(null);
  const [isPickingRouteVendor, setIsPickingRouteVendor] = useState(false);
  const [routeManualSearch, setRouteManualSearch] = useState('');
  const mapRef = useRef<RNMapView | null>(null);
  const submittingRef = useRef(false);

  // Filtro espacial — quando o toggle "minha área" tá ligado e já temos
  // GPS, monta o objeto que vira bounding box na query do Supabase.
  // Sem GPS ou toggle off → null (sem filtro espacial, comportamento antigo).
  const areaFilter = useMemo(() => {
    if (!showOnlyMyArea || !userLocation) return null;
    return {
      lat: userLocation.latitude,
      lon: userLocation.longitude,
      radiusKm: AREA_RADIUS_KM,
    };
  }, [showOnlyMyArea, userLocation]);

  // Bloqueia a query enquanto esperamos o GPS lockar com filtro ligado.
  // Sem isso o app dispararia uma query "todos os clientes" e depois outra
  // já filtrada — dobra de banda à toa.
  const waitingForLocation = showOnlyMyArea && !userLocation && locationPermission === 'pending';
  const areaPermissionDenied = showOnlyMyArea && locationPermission === 'denied';

  const { clients, statuses: dynamicStatuses, isLoading, error, deleteClient, addClient, updateClient, markAsVisited } = useClients({
    areaFilter,
    enabled: !waitingForLocation && !areaPermissionDenied,
  });
  const { meetings, upcomingByClient, meetingsByClient, deleteMeeting } = useMeetings();
  // Tarefas geradas automaticamente (motor de regras no banco). O hook dispara
  // a geracao ao autenticar e le as pendentes. O badge do rodape usa a contagem
  // JA filtrada por vendedor (visibleTasksCount), nao o total global.
  const { tasks, resolveTask } = useClientTasks();
  useForceReload(isAuthenticated);
  // Gestor = acesso total. Antes existiam dois tiers separados (admin por
  // e-mail hardcoded + uma lista de "so metricas"); agora e' um so, vindo do
  // role no banco. Adicionar gestor = UPDATE em profiles.role, sem deploy.
  // No banco as RLS correspondentes sao is_field_admin() / can_view_metrics(),
  // ambas checando role='gestor'.
  const isGestor = profile?.role === 'gestor';
  // Aliases mantidos porque o resto do arquivo referencia os dois nomes; hoje
  // apontam pro mesmo tier.
  const isAdmin = isGestor;
  const canViewGestor = isGestor;
  // Usuario 'view' = somente leitura. Esconde criar/editar/excluir/rotas/agenda/notas.
  // Aplicacao real do bloqueio esta nas RLS policies do Supabase (is_view_only_user()).
  const isViewer = profile?.role === 'view';
  const fieldOps = useFieldOps(routeDate, isAuthenticated);

  // Se o usuario viewer entrou em uma aba que nao existe pra ele (rota/agenda)
  // via state preservado entre sessoes, joga de volta pro mapa.
  // Mesma protecao pra aba gestor: so admin pode ver, qualquer outro perfil
  // que caia ali (state preservado) volta pro mapa.
  useEffect(() => {
    if (isViewer && (tab === 'route' || tab === 'agenda' || tab === 'tasks' || tab === 'meu')) {
      setTab('map');
    }
    if (!canViewGestor && tab === 'gestor') {
      setTab('map');
    }
  }, [isViewer, canViewGestor, tab]);

  // Lista de vendedores com id_hubspot configurado — alimenta o picker do admin
  // no filtro do mapa/lista/rota e o "Responsável" nos itens da agenda.
  // Roda pra todo autenticado; o RLS de profiles decide quem enxerga quem
  // (non-admin pode voltar so o proprio perfil — a agenda degrada pro id cru).
  const vendorsQuery = useQuery({
    queryKey: ['profiles_with_hubspot'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, id_hubspot')
        .not('id_hubspot', 'is', null)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; id_hubspot: string }>;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  const vendors = vendorsQuery.data ?? [];
  const vendorById = useMemo(() => {
    const m = new Map<string, { full_name: string | null; email: string | null }>();
    for (const v of vendors) m.set(v.id_hubspot, { full_name: v.full_name, email: v.email });
    return m;
  }, [vendors]);
  // Helper pra renderizar label do vendedor (full_name > email > id cru).
  // Sentinel '__none__' = leads sem vendedor associado.
  const vendorLabel = (idHubspot: string | null): string => {
    if (idHubspot === null) return 'Todos os vendedores';
    if (idHubspot === '__none__') return 'Sem vendedor associado';
    const v = vendorById.get(idHubspot);
    if (!v) return `id ${idHubspot}`;
    return v.full_name?.trim() || v.email || `id ${idHubspot}`;
  };

  // Carrega o toggle da preferência local na inicialização.
  useEffect(() => {
    getShowOnlyMyAreaPref().then(setShowOnlyMyArea);
  }, []);

  // Quando o app volta do background e a permissão estava negada, re-checa
  // — usuário pode ter ido nas configurações do sistema e habilitado.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      if (locationPermission !== 'denied') return;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          setLocationPermission('granted');
          const loc = await Location.getCurrentPositionAsync({});
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch (err) {
        console.warn('[LOC] re-check pós-foreground falhou:', err);
      }
    });
    return () => sub.remove();
  }, [locationPermission]);

  const handleToggleArea = useCallback(async (value: boolean) => {
    setShowOnlyMyArea(value);
    await setShowOnlyMyAreaPref(value);
    // Se ligou e ainda não temos GPS, dispara o pedido (caso ainda não tenha
    // sido feito ou usuário tenha negado antes — request é no-op se já decidido).
    if (value && !userLocation) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLocationPermission(status === 'granted' ? 'granted' : 'denied');
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch (err) {
        console.warn('[LOC] request pós-toggle falhou:', err);
        setLocationPermission('denied');
      }
    }
  }, [userLocation]);
  // Agendamento aberto: guarda o cliente + o tipo (reunião ou follow up).
  // Mesmo modal serve os dois; só muda o `type` salvo e os rótulos.
  // reschedule preenchido => o modal abre em modo "reagendar" daquela reunião.
  const [schedulingFor, setSchedulingFor] = useState<{ client: Client; type: MeetingType; reschedule?: ClientMeeting } | null>(null);
  // Passado da agenda começa fechado (igual lista). Hoje/futuro viram uma
  // timeline contínua agrupada por dia — não precisam de acordeão.
  const [agendaPastOpen, setAgendaPastOpen] = useState(false);
  // Exportação da agenda em andamento (botão "Exportar JSON" no topo da aba).
  const [exportingAgenda, setExportingAgenda] = useState(false);

  // Cancelar (remover) uma reunião/follow up com confirmação. deleteMeeting já
  // apaga o evento no Google (demo — a Meeting no HubSpot acompanha via sync) /
  // marca a Observação como cancelada (follow up). Usado na Agenda e no lead.
  const confirmCancelMeeting = (meeting: ClientMeeting) => {
    const isFollowUp = meeting.type === 'follow_up';
    const noun = isFollowUp ? 'follow up' : 'reunião';
    const quando = new Date(meeting.scheduled_at).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const detalhe = isFollowUp
      ? 'A observação no HubSpot será marcada como cancelada.'
      : 'O evento no Google Calendar será apagado (e a reunião some no HubSpot).';
    Alert.alert(
      `Cancelar ${noun}`,
      `Remover ${noun} de ${quando}?\n\n${detalhe}`,
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => deleteMeeting.mutate(meeting, {
            onError: (err: any) => Alert.alert('Erro ao cancelar', err?.message ?? 'Tente novamente.'),
          }),
        },
      ],
    );
  };
  // Mudanca de etapa. initialStageId trava o modal numa etapa (ex.: "Mover pra
  // perdido" a partir de uma tarefa); taskId, quando presente, e' a tarefa a
  // resolver depois que o envio concluir.
  const [changingStageFor, setChangingStageFor] = useState<
    { client: Client; initialStageId?: string; taskId?: string } | null
  >(null);
  // "Concluir tarefa" abre um menu de destino do lead: avançar etapa, mover
  // p/ Perdido, ou manter a etapa e gerar a próxima tarefa numerada.
  const [completingTask, setCompletingTask] = useState<{ task: ClientTask; client: Client } | null>(null);
  const [editingLocationFor, setEditingLocationFor] = useState<Client | null>(null);
  const isSaving = addClient.isPending || updateClient.isPending;

  // Lista de status pra UI: dinâmica (banco) ou fallback hardcoded enquanto carrega.
  const statusOptions = useMemo(() => {
    if (dynamicStatuses.length > 0) {
      return dynamicStatuses.map((s: any) => ({
        value: s.slug as ClientStatus,
        label: s.label as string,
        color: (s.color as string) ?? '#3b82f6',
      }));
    }
    return STATUS_OPTIONS;
  }, [dynamicStatuses]);

  // Garante que o status selecionado no form pertença aos status atuais.
  // Se mudou (ex.: removeu o slug 'lead' antigo), reaponta pro primeiro disponível.
  useEffect(() => {
    if (statusOptions.length === 0) return;
    const slugs = statusOptions.map(o => o.value);
    if (!slugs.includes(form.status)) {
      setForm(s => ({ ...s, status: statusOptions[0].value }));
    }
  }, [statusOptions, form.status]);

  // Mesma proteção pro filtro de status: se o slug atual sumiu da lista
  // de status disponíveis (visibilidade do setor, slug renomeado, etc.),
  // recai pro primeiro status disponível pra não deixar o usuário com
  // a tela vazia sem chip ativo.
  useEffect(() => {
    if (statusOptions.length === 0) return;
    const slugs = statusOptions.map(o => o.value);
    if (!slugs.includes(statusFilter)) {
      setStatusFilter(statusOptions[0].value);
    }
  }, [statusOptions, statusFilter]);

  // Build status config from dynamic data, fallback to hardcoded options.
  const statusConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    if (dynamicStatuses.length > 0) {
      dynamicStatuses.forEach((s: any) => { config[s.slug] = { label: s.label, color: s.color }; });
    } else {
      for (const opt of STATUS_OPTIONS) {
        config[opt.value] = { label: opt.label, color: opt.color };
      }
    }
    return config;
  }, [dynamicStatuses]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLocationPermission(status === 'granted' ? 'granted' : 'denied');
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      } catch (err) {
        console.warn('Erro ao obter localização:', err);
        setLocationPermission('denied');
      }
    })();
  }, []);

  // Normaliza pra busca case/diacritic-insensitive — "ipê" casa com "ipe".
  const searchTerm = useMemo(
    () => searchQuery.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().trim(),
    [searchQuery],
  );

  // UFs presentes no conjunto carregado — chips só mostram opção que existe.
  const availableStates = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) {
      const uf = normalizeUf(c.estado);
      if (uf) set.add(uf);
    }
    return Array.from(set).sort();
  }, [clients]);

  const availableStages = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) {
      const stage = normalizeStage(c.etapa);
      if (stage) set.add(stage);
    }
    // Chips na ordem do funil (HubSpot); Pipe Antigo por ultimo.
    return Array.from(set).sort((a, b) => stageOrderIndex(a) - stageOrderIndex(b));
  }, [clients]);

  // Se o UF selecionado some (mudou setor, filtro, etc.), volta pra "todos".
  useEffect(() => {
    if (stateFilter && !availableStates.includes(stateFilter)) {
      setStateFilter(null);
    }
  }, [availableStates, stateFilter]);

  useEffect(() => {
    if (stageFilter && !availableStages.includes(stageFilter)) {
      setStageFilter(null);
    }
  }, [availableStages, stageFilter]);

  // Aplica search + UF (mas NAO status) — usado pra recalcular contadores dos
  // chips de status em tempo real conforme o usuario digita no search.
  // id_hubspot do usuario logado, usado pelo toggle "meus leads" (non-admin).
  const myHubspotId = profile?.id_hubspot ?? null;

  // Recorte de tarefas por vendedor. Gestor (canViewGestor: admin ou Julyan) ve
  // TODAS; vendedor comum ve so as dos leads dele (match por vendedor_id_hubspot).
  // Se um gestor escolheu um vendedor no filtro do mapa, respeita esse recorte.
  // Compartilhado entre a tela de Tarefas e o badge do rodape — antes o badge
  // usava a contagem GLOBAL (tasks.length) e mostrava 99+ pra todo mundo.
  const tasksActiveVendor = vendorFilterHubspotId ?? (canViewGestor ? null : myHubspotId);
  const visibleTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (tasksActiveVendor === null) return true;
        if (tasksActiveVendor === '__none__') return !t.vendedor_id_hubspot;
        return t.vendedor_id_hubspot === tasksActiveVendor;
      }),
    [tasks, tasksActiveVendor],
  );
  const visibleTasksCount = visibleTasks.length;

  // Avalia o filtro temporal de visita pra um cliente.
  // - null: sem filtro
  // - 'never': visited_at IS NULL
  // - 'visited': visited_at IS NOT NULL (qualquer momento)
  // - 'visited:<N>': visitado nos ultimos N dias
  // - 'not_visited:<N>': nunca visitado OU visitado ha mais de N dias
  const matchesVisitFilter = (visitedAt: string | null): boolean => {
    if (visitFilter === null) return true;
    if (visitFilter === 'never') return visitedAt === null;
    if (visitFilter === 'visited') return visitedAt !== null;
    const days = Number(visitFilter.split(':')[1]);
    if (!Number.isFinite(days)) return true;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    if (visitFilter.startsWith('visited:')) {
      if (!visitedAt) return false;
      return new Date(visitedAt).getTime() >= cutoff;
    }
    if (visitFilter.startsWith('not_visited:')) {
      if (!visitedAt) return true;
      return new Date(visitedAt).getTime() < cutoff;
    }
    return true;
  };

  const clientsForCount = useMemo(
    () => clients.filter(c => {
      if (stateFilter && normalizeUf(c.estado) !== stateFilter) return false;
      if (stageFilter && normalizeStage(c.etapa) !== stageFilter) return false;
      if (vendorFilterHubspotId === '__none__') {
        if (c.vendedor_id_hubspot) return false;
      } else if (vendorFilterHubspotId !== null && c.vendedor_id_hubspot !== vendorFilterHubspotId) {
        return false;
      }
      if (!matchesVisitFilter(c.visited_at)) return false;
      if (searchTerm) {
        const haystack = `${c.nome ?? ''} ${c.empresa ?? ''} ${c.cidade ?? ''} ${c.bairro ?? ''} ${c.etapa ?? ''}`
          .normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
      }
      return true;
    }),
    [clients, stateFilter, stageFilter, searchTerm, vendorFilterHubspotId, visitFilter],
  );

  // Viewer filtra pela multi-selecao (leads + clientes etc.); vendedor/admin
  // pelo status unico do chip ativo. Mantem a aba Lista consistente com o mapa.
  const filteredClients = useMemo(
    () => clientsForCount.filter(c =>
      isViewer ? viewerStatuses.has(c.status as ClientStatus) : c.status === statusFilter,
    ),
    [clientsForCount, statusFilter, isViewer, viewerStatuses],
  );

  const listStageSections = useMemo(() => {
    const groups = new Map<string, { title: string; clients: Client[] }>();
    for (const client of filteredClients) {
      const stage = normalizeStage(client.etapa);
      const key = stage ?? '__sem_etapa__';
      const title = stage ?? 'Sem etapa';
      const existing = groups.get(key);
      if (existing) {
        existing.clients.push(client);
      } else {
        groups.set(key, { title, clients: [client] });
      }
    }
    return Array.from(groups.entries())
      .map(([key, value]) => ({ key, ...value }))
      // Ordem do funil (HubSpot); Pipe Antigo penultimo, Sem etapa por ultimo.
      .sort((a, b) => {
        if (a.key === '__sem_etapa__') return 1;
        if (b.key === '__sem_etapa__') return -1;
        return stageOrderIndex(a.title) - stageOrderIndex(b.title);
      });
  }, [filteredClients]);

  // Agrupamento por etapa so faz sentido na visao de leads do vendedor/admin.
  // Viewer ve lista plana (mistura leads + clientes, sem agrupar por etapa).
  const shouldGroupListByStage =
    !isViewer
    && listStageSections.length > 0
    && statusFilter === 'lead';

  useEffect(() => {
    if (!stageFilter) return;
    setExpandedStages(prev => {
      const next = new Set(prev);
      next.add(stageFilter);
      return next;
    });
  }, [stageFilter]);

  const listRows = useMemo(() => {
    const rows: Array<
      | { type: 'stage'; key: string; stageKey: string; title: string; count: number; expanded: boolean }
      | { type: 'client'; key: string; item: Client }
    > = [];
    for (const section of listStageSections) {
      const expanded = expandedStages.has(section.key);
      rows.push({
        type: 'stage',
        key: `stage-${section.key}`,
        stageKey: section.key,
        title: section.title,
        count: section.clients.length,
        expanded,
      });
      if (expanded) {
        for (const client of section.clients) {
          rows.push({ type: 'client', key: client.id, item: client });
        }
      }
    }
    return rows;
  }, [expandedStages, listStageSections]);

  const activeFilterCount = (searchQuery ? 1 : 0) + (stateFilter ? 1 : 0) + (stageFilter ? 1 : 0) + (vendorFilterHubspotId !== null ? 1 : 0) + (visitFilter !== null ? 1 : 0);

  const filteredWithCoords = useMemo(
    () => filteredClients.filter(c => c.latitude !== null && c.longitude !== null),
    [filteredClients]
  );

  const routeStops = fieldOps.stops;
  const routeStopClientIds = useMemo(
    () => new Set(routeStops.map(stop => stop.client_id).concat(routeDraft.map(c => c.id))),
    [routeStops, routeDraft],
  );

  // Markers normais do mapa = filtrados MENOS os da rota (evita dupe — rota
  // sempre renderiza com numero, mesmo que o status nao bata o chip ativo).
  // Viewer (somente leitura) enxerga os pins dos status que ele marcou nos
  // chips (multi-selecao — leads E clientes juntos, por ex.), ignorando o
  // statusFilter de status unico usado por vendedor/admin.
  const filteredMapMarkers = useMemo(
    () => {
      const base = isViewer
        ? clients.filter(c => viewerStatuses.has(c.status as ClientStatus) && c.latitude !== null && c.longitude !== null)
        : filteredWithCoords;
      return base.filter(c => !routeStopClientIds.has(c.id));
    },
    [isViewer, clients, viewerStatuses, filteredWithCoords, routeStopClientIds],
  );

  // Pontos da rota pra OSRM: comeca em userLocation (arredondado pra cache
  // estavel) seguindo a ordem das stops PENDENTES (status !== 'done').
  // Stops ja visitados saem do polyline pra refletir o checklist em tempo
  // real — a linha mostra so o que falta percorrer.
  const routeWaypoints = useMemo<RoutePoint[]>(() => {
    const points: RoutePoint[] = [];
    if (userLocation) {
      points.push({
        latitude: Math.round(userLocation.latitude * 10_000) / 10_000,
        longitude: Math.round(userLocation.longitude * 10_000) / 10_000,
      });
    }
    if (routeStops.length > 0) {
      for (const s of routeStops) {
        if (s.status === 'done') continue;
        const c = s.client;
        if (c?.latitude != null && c?.longitude != null) {
          points.push({ latitude: c.latitude, longitude: c.longitude });
        }
      }
    } else {
      for (const c of routeDraft) {
        if (c.latitude != null && c.longitude != null) {
          points.push({ latitude: c.latitude, longitude: c.longitude });
        }
      }
    }
    return points;
  }, [userLocation, routeStops, routeDraft]);

  // Cache do polyline real (segue ruas via OSRM). Key = waypoints, garante
  // re-fetch ao reordenar/adicionar/remover stops. staleTime alto pra nao
  // bater a API publica gratuita repetidamente.
  const routeGeometry = useQuery({
    queryKey: ['route-geometry', routeWaypoints],
    queryFn: () => fetchRouteGeometry(routeWaypoints),
    enabled: routeWaypoints.length >= 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev: any) => prev,
    retry: 1,
  });

  const routeClients = useMemo(
    () => routeStops.map(stop => stop.client).filter(Boolean) as Client[],
    [routeStops],
  );

  const routeDisplayClients = routeClients.length > 0 ? routeClients : routeDraft;

  const [isOptimizing, setIsOptimizing] = useState(false);
  // Provider usado na ultima sugestao bem-sucedida. Persistido em memoria
  // pra mostrar um indicador admin no card "Rota de hoje".
  const [lastProviderUsed, setLastProviderUsed] = useState<RoutingProvider | null>(null);

  // Modo navegacao: ocupa a tela toda com mapa focado no GPS + card do
  // proximo destino. Avanca por toque em "Finalizar visita".
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  // Heading do dispositivo em graus (0=norte). Vem da bussola (preferido)
  // ou do heading derivado pelo GPS quando em movimento.
  const [navUserHeading, setNavUserHeading] = useState<number | null>(null);
  // Modo da camera:
  //  - follow: mapa segue o GPS + rotaciona pra direcao do movimento
  //  - free: usuario arrastou; aparece botao "centralizar em mim"
  //  - overview: zoom out mostrando rota inteira
  const [navCameraMode, setNavCameraMode] = useState<'follow' | 'free' | 'overview'>('follow');
  const [gpsUnstable, setGpsUnstable] = useState(false);
  // Trilha de pontos percorridos durante a sessao de navegacao — renderizada
  // como Polyline cinza atras (efeito "rastro" tipo Google Maps).
  const [navTrail, setNavTrail] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const navMapRef = useRef<RNMapView | null>(null);
  // Throttle pra evitar que GPS dispare multiplas animacoes simultaneas —
  // o sintoma era zoom "derivando" pra fora durante caminhada.
  const lastCameraAnimateAt = useRef(0);
  // Posicao GPS anterior — usada pra calcular bearing entre dois pontos
  // quando o GPS nao reporta heading proprio (parado curto, sinal fraco).
  const lastNavPosition = useRef<{ latitude: number; longitude: number } | null>(null);

  const suggestRoute = useCallback(async () => {
    // Validacao explicita da qtd pedida: invalido -> avisa, nao cai pra 8.
    const requestedRaw = Number(routeLeadCount);
    if (!Number.isFinite(requestedRaw) || requestedRaw < 1) {
      Alert.alert('Quantidade invalida', 'Informe um numero de leads entre 1 e 30.');
      return;
    }
    const desired = Math.max(1, Math.min(30, Math.floor(requestedRaw)));
    const capped = Math.floor(requestedRaw) > 30;

    // Prioridade da base: override escolhido pelo vendedor > GPS > 1o lead.
    const base = routeStartOverride
      ? { latitude: routeStartOverride.latitude, longitude: routeStartOverride.longitude }
      : userLocation ?? (
          filteredWithCoords[0]?.latitude != null && filteredWithCoords[0]?.longitude != null
            ? { latitude: filteredWithCoords[0].latitude, longitude: filteredWithCoords[0].longitude }
            : null
        );
    if (!base) {
      Alert.alert('Sem base de rota', 'Ative a localizacao ou mantenha leads com coordenadas carregados para sugerir a rota.');
      return;
    }

    // Pool base: TODOS os clientes carregados. O recorte vem do multi-select
    // de status (routeStatusSelection) que o vendedor escolhe explicitamente
    // — sem ambiguidade de "qual filtro tava ativo".
    if (routeStatusSelection.size === 0) {
      Alert.alert('Sem status selecionado', 'Selecione pelo menos um status pra incluir na rota.');
      return;
    }
    const poolBase = clients;
    const totalLoaded = poolBase.length;

    let withoutCoord = 0;
    let alreadyInRoute = 0;
    let outOfSelection = 0;
    let outOfVendor = 0;

    const eligible: Client[] = [];
    for (const c of poolBase) {
      if (!routeStatusSelection.has(c.status)) { outOfSelection++; continue; }
      if (routeVendorFilterHubspotId === '__none__') {
        if (c.vendedor_id_hubspot) { outOfVendor++; continue; }
      } else if (routeVendorFilterHubspotId !== null && c.vendedor_id_hubspot !== routeVendorFilterHubspotId) {
        outOfVendor++; continue;
      }
      if (c.latitude == null || c.longitude == null) { withoutCoord++; continue; }
      if (routeStopClientIds.has(c.id)) { alreadyInRoute++; continue; }
      eligible.push(c);
    }

    // Pesos por slug REAL do banco: lead > cliente > churn.
    // Valor menor = melhor prioridade (mesma convencao da distancia).
    // Dentro de 'lead', a refinacao "visitado/nao visitado" entra via
    // potentialScore que penaliza visited_at recente.
    const statusWeight = (status: string) => {
      if (status === 'lead') return 0;
      if (status === 'cliente') return 6;
      if (status === 'churn') return 9;
      return 4;
    };

    // Pre-computa distancias e potenciais pra evitar varrer 2x e pra
    // permitir normalizacao do modo smart.
    const withMeters = eligible.map(client => ({
      client,
      meters: distanceMeters(base.latitude, base.longitude, client.latitude as number, client.longitude as number),
    }));
    const maxMeters = Math.max(1, ...withMeters.map(item => item.meters));

    // Modo smart: combina proximidade, status e potencial em escala normalizada
    // (0..1 cada componente). Pesos calibrados pra priorizar proximidade
    // (mais pratico no campo) sem ignorar leads quentes com bom status.
    const SMART_WEIGHTS = { proximity: 0.5, status: 0.3, potential: 0.2 };
    const MAX_STATUS_WEIGHT = 9; // valor max de statusWeight
    const potentialScore = (c: Client) => {
      // Heuristica simples — sem campo de potencial estruturado por enquanto.
      // id_hubspot indica lead processado por SDR; empresa nomeada eh sinal
      // de validacao; ambos juntos = mais quente.
      let p = 0;
      if (c.id_hubspot) p += 0.6;
      if (c.empresa?.trim()) p += 0.4;
      return Math.min(1, p);
    };

    // Score smart fixo: combina proximidade + status + potencial em escala
    // normalizada. Nao expomos mais escolha de criterio na UI; smart cobre
    // os 3 casos de uso (priorizar perto, lead frio vs quente, etc.) com
    // pesos calibrados pro caso de campo.
    const scored = withMeters
      .map(({ client, meters }) => {
        const score =
          SMART_WEIGHTS.proximity * (meters / maxMeters) +
          SMART_WEIGHTS.status * (statusWeight(client.status) / MAX_STATUS_WEIGHT) +
          SMART_WEIGHTS.potential * (1 - potentialScore(client));
        return { client, meters, score };
      })
      .sort((a, b) => a.score - b.score);

    const topCandidates = scored.slice(0, desired);

    // Ordenacao via TSP real (ORS Optimization -> OSRM /trip). Se AMBOS
    // provedores falharem, NAO cai pra linha reta — avisa o usuario com
    // mensagem clara e contato pro time RPA, conforme decisao do produto.
    let ordered: Array<{ client: Client; meters: number }> = [];
    let tripDistanceMeters: number | null = null;
    let tripDurationSeconds: number | null = null;
    let optimizationProvider: RoutingProvider | null = null;

    if (topCandidates.length > 0) {
      setIsOptimizing(true);
      try {
        const tripPoints: RoutePoint[] = [
          { latitude: base.latitude, longitude: base.longitude },
          ...topCandidates.map(item => ({
            latitude: item.client.latitude as number,
            longitude: item.client.longitude as number,
          })),
        ];
        const trip = await fetchOptimizedTrip(tripPoints);
        const visitOrder = trip.inputOrderToVisit.slice(1);
        let prevLat = base.latitude;
        let prevLon = base.longitude;
        for (const inputIdx of visitOrder) {
          const cand = topCandidates[inputIdx - 1];
          if (!cand) continue;
          const segMeters = distanceMeters(
            prevLat, prevLon,
            cand.client.latitude as number, cand.client.longitude as number,
          );
          ordered.push({ client: cand.client, meters: segMeters });
          prevLat = cand.client.latitude as number;
          prevLon = cand.client.longitude as number;
        }
        tripDistanceMeters = trip.distanceMeters;
        tripDurationSeconds = trip.durationSeconds;
        optimizationProvider = trip.provider;
        setLastProviderUsed(trip.provider);
      } catch (err: any) {
        console.warn('[ROTA] Ambos provedores (ORS e OSRM) falharam:', err?.message ?? err);
        setIsOptimizing(false);
        Alert.alert(
          'Erro ao gerar rota',
          'Nao conseguimos calcular a ordem otimizada (OpenRouteService e OSRM '
          + 'estao fora). Tente novamente em alguns minutos.\n\n'
          + 'Se o problema persistir, contate o time de RPA.',
        );
        return;
      } finally {
        setIsOptimizing(false);
      }
    }

    if (ordered.length === 0) {
      const vendorLine = routeVendorFilterHubspotId !== null
        ? `• ${outOfVendor} fora do vendedor "${vendorLabel(routeVendorFilterHubspotId)}"`
        : null;
      Alert.alert(
        'Nenhum lead disponivel',
        [
          `Total carregado: ${totalLoaded}`,
          outOfSelection > 0 ? `• ${outOfSelection} fora dos status escolhidos` : null,
          outOfVendor > 0 ? vendorLine : null,
          withoutCoord > 0 ? `• ${withoutCoord} sem coordenadas` : null,
          alreadyInRoute > 0 ? `• ${alreadyInRoute} ja estavam na rota` : null,
          '',
          routeVendorFilterHubspotId !== null
            ? 'Tire o filtro de vendedor ou inclua mais status no recorte.'
            : 'Tente incluir mais status no recorte.',
        ].filter(Boolean).join('\n'),
      );
      return;
    }

    setRouteDraft(ordered.map(item => item.client));
    fieldOps.saveRoute.mutate({
      routeDate,
      title: 'Rota sugerida',
      source: 'suggested',
      priorityMode: 'smart',
      base,
      stops: ordered.map(item => ({ client: item.client, distance_meters: item.meters })),
    }, {
      onSuccess: () => {
        const got = ordered.length;
        const providerLabel = optimizationProvider === 'ors'
          ? 'OpenRouteService'
          : optimizationProvider === 'osrm' ? 'OSRM (ORS fora)' : '';
        const tripInfo = tripDistanceMeters != null && tripDurationSeconds != null
          ? `\n\n🛣️ ${(tripDistanceMeters / 1000).toFixed(1)} km • ~${Math.round(tripDurationSeconds / 60)} min de carro`
            + (providerLabel ? `\n(Otimizado via ${providerLabel})` : '')
          : '';
        const lines = [
          got === desired
            ? `Rota sugerida com ${got} leads.`
            : `Encontramos apenas ${got} leads compativeis (pediu ${desired}).`,
          tripInfo,
          '',
          'Descartados:',
          outOfSelection > 0 ? `• ${outOfSelection} fora dos status escolhidos` : null,
          outOfVendor > 0 ? `• ${outOfVendor} fora do vendedor "${vendorLabel(routeVendorFilterHubspotId)}"` : null,
          withoutCoord > 0 ? `• ${withoutCoord} sem coordenadas` : null,
          alreadyInRoute > 0 ? `• ${alreadyInRoute} ja estavam na rota` : null,
          capped ? '\nObs.: limite maximo por rota = 30.' : null,
        ].filter(Boolean);
        Alert.alert('Rota sugerida', lines.join('\n'));
      },
      onError: (err: any) => Alert.alert('Erro ao salvar rota', err?.message ?? 'Tente novamente'),
    });
  }, [clients, fieldOps.saveRoute, filteredWithCoords, routeDate, routeLeadCount, routeVendorFilterHubspotId, routeStatusSelection, routeStopClientIds, userLocation, routeStartOverride, vendorById]);

  const saveManualRoute = useCallback((draft = routeDraft) => {
    if (draft.length === 0) {
      Alert.alert('Rota vazia', 'Adicione leads antes de salvar.');
      return;
    }
    const base = userLocation ?? null;
    fieldOps.saveRoute.mutate({
      routeDate,
      title: 'Rota manual',
      source: 'manual',
      priorityMode: 'manual',
      base,
      stops: draft.map(client => ({
        client,
        distance_meters: base && client.latitude != null && client.longitude != null
          ? distanceMeters(base.latitude, base.longitude, client.latitude, client.longitude)
          : null,
      })),
    }, {
      onSuccess: () => Alert.alert('Rota salva', 'Planejamento atualizado.'),
      onError: (err: any) => Alert.alert('Erro ao salvar rota', err?.message ?? 'Tente novamente'),
    });
  }, [fieldOps.saveRoute, routeDate, routeDraft, userLocation]);

  // Troca pra aba mapa e da fit-bounds nos pontos da rota + localizacao
  // do usuario, se disponivel. Timeout pequeno espera a tab montar antes
  // de chamar fitToCoordinates (precisa do MapView no DOM).
  const viewRouteOnMap = useCallback(() => {
    const coords = routeDisplayClients
      .filter(c => c.latitude != null && c.longitude != null)
      .map(c => ({ latitude: c.latitude as number, longitude: c.longitude as number }));
    if (userLocation) coords.unshift(userLocation);
    if (coords.length === 0) {
      Alert.alert('Rota vazia', 'Adicione leads na rota primeiro.');
      return;
    }
    setTab('map');
    setTimeout(() => {
      if (mapRef.current && coords.length > 0) {
        try {
          mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 120, right: 60, bottom: 220, left: 60 },
            animated: true,
          });
        } catch (err) {
          console.warn('[ROTA] fitToCoordinates falhou:', err);
        }
      }
    }, 350);
  }, [routeDisplayClients, userLocation]);

  // ===== Modo Navegacao: watcher GPS =====
  // SO usamos GPS — bussola foi removida porque a rotacao acompanhava como
  // o usuario segurava o celular (vira o aparelho 30deg pra esquerda, mapa
  // gira 30deg). Realista pra direcao do movimento, NAO pra posicao do
  // dispositivo.
  //
  // Fonte do heading, em ordem de prioridade:
  // 1. loc.coords.heading + speed > 0.5 m/s — o proprio chip GPS ja calcula
  // 2. bearing(prev -> next) quando deslocamento > 5m — fallback manual
  // 3. ultimo valor conhecido — quando parado, mapa nao gira
  useEffect(() => {
    if (!isNavigating) return;
    let posSub: Location.LocationSubscription | null = null;
    let cancelled = false;

    lastNavPosition.current = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        Alert.alert(
          'Sem permissao de localizacao',
          'Nao conseguimos acessar sua localizacao. Ative a permissao nas configuracoes do sistema para usar a navegacao.',
          [
            { text: 'Abrir configuracoes', onPress: () => Linking.openSettings() },
            { text: 'Cancelar', style: 'cancel', onPress: () => setIsNavigating(false) },
          ],
        );
        setIsNavigating(false);
        return;
      }

      try {
        posSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 5,
            timeInterval: 2000,
          },
          (loc) => {
            const next = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setUserLocation(next);

            // Trilha do percurso
            setNavTrail(prev => {
              const trail = [...prev, next];
              return trail.length > 500 ? trail.slice(-500) : trail;
            });

            // Heading: GPS proprio se confiavel
            const speed = loc.coords.speed ?? 0;
            const gpsHeading = loc.coords.heading;
            const prev = lastNavPosition.current;

            if (gpsHeading != null && gpsHeading >= 0 && speed > 0.5) {
              setNavUserHeading(gpsHeading);
            } else if (prev) {
              // Fallback: calcula bearing prev -> next, se moveu >= 5m
              const meters = distanceMeters(prev.latitude, prev.longitude, next.latitude, next.longitude);
              if (meters >= 5) {
                setNavUserHeading(bearingDegrees(prev.latitude, prev.longitude, next.latitude, next.longitude));
              }
              // se moveu < 5m, mantem o heading anterior (parado/jitter)
            }
            lastNavPosition.current = next;

            setGpsUnstable((loc.coords.accuracy ?? 0) > 30);
          }
        );
      } catch (err) {
        console.warn('[NAV] watchPositionAsync falhou:', err);
      }
    })();

    return () => {
      cancelled = true;
      try { posSub?.remove?.(); } catch {}
      lastNavPosition.current = null;
    };
  }, [isNavigating]);

  // Camera follow: anima sempre que o usuario muda de posicao ou direcao
  // E o modo da camera eh 'follow'. animateCamera ja interpola — visual fica
  // suave sem precisar Animated.Value adicional.
  useEffect(() => {
    if (!isNavigating || navCameraMode !== 'follow') return;
    if (!userLocation || !navMapRef.current) return;
    // Throttle: minimo 800ms entre animateCamera. Sem isso, GPS + bussola
    // disparavam animacoes simultaneas (cada uma com 600ms de easing), o
    // zoom acabava "derivando" porque as interpolacoes se cancelavam mid-flight.
    const now = Date.now();
    if (now - lastCameraAnimateAt.current < 800) return;
    lastCameraAnimateAt.current = now;

    try {
      // animateCamera faz update PARCIAL: propriedades omitidas mantem o
      // valor atual. Quando navUserHeading eh null (compass falhou ou usuario
      // ainda nao se moveu), NAO seta heading — assim o mapa nao vira pro
      // norte; preserva a rotacao atual ate o GPS reportar uma direcao real.
      const camera: any = {
        center: { latitude: userLocation.latitude, longitude: userLocation.longitude },
        // pitch menor (era 60): tilt agressivo demais expande a area visivel
        // horizontalmente, da sensacao de "zoom out". 45 mantem o 3D feel
        // sem mostrar tanto da paisagem distante.
        pitch: 45,
        // zoom 20 = maximo da maioria dos provedores; nivel "carros e
        // calcadas visiveis". Necessario pra enxergar a proxima virada.
        zoom: 20,
      };
      if (navUserHeading != null) camera.heading = navUserHeading;
      navMapRef.current.animateCamera(camera, { duration: 350 });
    } catch (err) {
      console.warn('[NAV] animateCamera falhou:', err);
    }
  }, [isNavigating, navCameraMode, userLocation, navUserHeading]);

  // ===== Modo Navegacao =====
  const startNavigation = useCallback(() => {
    if (routeDisplayClients.length === 0) {
      Alert.alert('Rota vazia', 'Gere ou monte uma rota antes de iniciar a navegacao.');
      return;
    }
    // Comeca pelo primeiro stop ainda nao marcado como done.
    const firstPendingIdx = routeStops.findIndex(s => s.status !== 'done');
    setCurrentStopIndex(firstPendingIdx >= 0 ? firstPendingIdx : 0);
    setIsNavigating(true);
  }, [routeDisplayClients.length, routeStops]);

  const exitNavigation = useCallback(() => {
    setIsNavigating(false);
    setNavCameraMode('follow');
    setNavUserHeading(null);
    setNavTrail([]);
  }, []);

  // Volta pro modo follow (acompanha GPS). O effect de camera vai pegar
  // automaticamente o userLocation atual e animar.
  const recenterNavigation = useCallback(() => {
    setNavCameraMode('follow');
  }, []);

  // Zoom out mostrando a rota inteira + GPS. Pausa o acompanhamento ate
  // o usuario tocar em "Centralizar em mim".
  const showFullRouteInNav = useCallback(() => {
    setNavCameraMode('overview');
    setTimeout(() => {
      if (!navMapRef.current) return;
      const coords: Array<{ latitude: number; longitude: number }> = [];
      if (userLocation) coords.push(userLocation);
      for (const c of routeDisplayClients) {
        if (c.latitude != null && c.longitude != null) {
          coords.push({ latitude: c.latitude, longitude: c.longitude });
        }
      }
      if (coords.length < 1) return;
      try {
        navMapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 160, right: 60, bottom: 220, left: 60 },
          animated: true,
        });
      } catch (err) {
        console.warn('[NAV] fitToCoordinates falhou:', err);
      }
    }, 100);
  }, [userLocation, routeDisplayClients]);

  const navigationCurrentStop = isNavigating ? routeDisplayClients[currentStopIndex] : null;

  // Geometria do trecho de navegacao: parte do GPS atual (mesmo padrao do
  // routeWaypoints da view geral). userLocation arredondado a ~10m pra
  // estabilizar a chave de cache; placeholderData na useQuery garante que,
  // durante eventuais refetches, o polyline anterior continue visivel
  // (sem flash de "sem linha").
  const navWaypoints = useMemo<RoutePoint[]>(() => {
    if (!isNavigating) return [];
    const remaining = routeDisplayClients
      .slice(currentStopIndex)
      .filter(c => c.latitude != null && c.longitude != null)
      .map(c => ({ latitude: c.latitude as number, longitude: c.longitude as number }));
    if (remaining.length === 0 || !userLocation) return remaining;
    return [
      {
        latitude: Math.round(userLocation.latitude * 10_000) / 10_000,
        longitude: Math.round(userLocation.longitude * 10_000) / 10_000,
      },
      ...remaining,
    ];
  }, [isNavigating, userLocation, routeDisplayClients, currentStopIndex]);

  const navRouteGeometry = useQuery({
    queryKey: ['nav-route-geometry', navWaypoints],
    queryFn: () => fetchRouteGeometry(navWaypoints),
    enabled: isNavigating && navWaypoints.length >= 2,
    staleTime: 5 * 60 * 1000,
    // placeholderData = previousData mantem o polyline anterior na tela
    // enquanto um eventual refetch acontece — sem flash de "sem linha".
    placeholderData: (prev: any) => prev,
    retry: 1,
  });

  // Mete dist em metros do user ate o destino atual (linha reta — so pra
  // mostrar "X.X km" no card, nao eh usado em ordenacao).
  const navigationDistanceMeters = useMemo(() => {
    if (!isNavigating || !userLocation || !navigationCurrentStop) return null;
    if (navigationCurrentStop.latitude == null || navigationCurrentStop.longitude == null) return null;
    return distanceMeters(
      userLocation.latitude, userLocation.longitude,
      navigationCurrentStop.latitude, navigationCurrentStop.longitude,
    );
  }, [isNavigating, userLocation, navigationCurrentStop]);

  const advanceNavigationStop = useCallback(async () => {
    const stop = navigationCurrentStop
      ? routeStops.find(s => s.client_id === navigationCurrentStop.id)
      : null;
    if (stop) {
      try { await fieldOps.markStopDone.mutateAsync(stop); } catch (err) {
        console.warn('[NAV] markStopDone falhou:', err);
      }
    }
    if (currentStopIndex + 1 >= routeDisplayClients.length) {
      Alert.alert(
        '🎉 Rota concluida',
        `Voce visitou os ${routeDisplayClients.length} leads da rota de hoje.`,
        [{ text: 'OK', onPress: () => setIsNavigating(false) }],
      );
      return;
    }
    setCurrentStopIndex(idx => idx + 1);
  }, [navigationCurrentStop, routeStops, currentStopIndex, routeDisplayClients.length, fieldOps.markStopDone]);

  const skipNavigationStop = useCallback(() => {
    if (currentStopIndex + 1 >= routeDisplayClients.length) {
      Alert.alert('Ultimo lead', 'Esse eh o ultimo destino da rota — sem mais leads pra pular.');
      return;
    }
    setCurrentStopIndex(idx => idx + 1);
  }, [currentStopIndex, routeDisplayClients.length]);

  const addClientToRoute = useCallback((client: Client) => {
    if (routeStopClientIds.has(client.id)) {
      Alert.alert('Ja esta na rota', 'Este lead ja faz parte do planejamento.');
      return;
    }
    const next = [...routeDisplayClients, client];
    setRouteDraft(next);
    setSelectedClient(null);
    saveManualRoute(next);
  }, [routeDisplayClients, routeStopClientIds, saveManualRoute]);

  // Detecta lat/lon que aparecem em mais de um cliente — é sinal claro de
  // geocodificação ruim (Nominatim caiu no centroide da rua/CEP em vez do
  // imóvel). Usamos pra rebaixar esses pinos pra "Localização aproximada"
  // mesmo quando o registro diz que veio do Nominatim com número.
  // Arredonda em 6 casas (~10cm) só pra absorver ruído de float.
  const duplicateCoordKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of clients) {
      if (c.latitude == null || c.longitude == null) continue;
      const key = `${Number(c.latitude).toFixed(6)},${Number(c.longitude).toFixed(6)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    counts.forEach((count, key) => { if (count > 1) dupes.add(key); });
    return dupes;
  }, [clients]);

  const hasCoordCollision = (c: Client | null) => {
    if (!c || c.latitude == null || c.longitude == null) return false;
    const key = `${Number(c.latitude).toFixed(6)},${Number(c.longitude).toFixed(6)}`;
    return duplicateCoordKeys.has(key);
  };

  const mapCenter = useMemo(() => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    if (filteredWithCoords.length > 0) {
      return {
        latitude: filteredWithCoords[0].latitude as number,
        longitude: filteredWithCoords[0].longitude as number,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }
    return {
      latitude: -14.235,
      longitude: -51.9253,
      latitudeDelta: 15,
      longitudeDelta: 15,
    };
  }, [userLocation, filteredWithCoords]);

  const centerOnUser = () => {
    if (userLocation && mapRef.current) {
      setIsFollowingUser(true);
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };

  const handleMapInteraction = () => {
    setIsFollowingUser(false);
    Keyboard.dismiss();
  };

  const openClientDetails = useCallback((client: Client) => {
    setSelectedClient(client);
  }, []);

  // Abre o detalhe de um lead a partir do painel do Gestor (so tem o clientId).
  // Tenta achar na lista local; se nao estiver (recorte de setor/area do
  // useClients nao cobre o painel), busca a linha sob demanda no Supabase.
  const openClientById = useCallback(async (clientId: string) => {
    const local = clients.find((c) => c.id === clientId);
    if (local) { setSelectedClient(local); return; }
    const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
    if (error || !data) {
      Alert.alert('Lead não encontrado', 'Não foi possível abrir esse lead. Ele pode ter sido removido.');
      return;
    }
    setSelectedClient(data as Client);
  }, [clients]);

  const handleMarkerPress = useCallback((c: Client) => openClientDetails(c), [openClientDetails]);

  // Modo de criação manual via mapa: pin fixo no centro da tela
  const [creationMode, setCreationMode] = useState(false);
  const [creationCenter, setCreationCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  // Dimensoes/posicao do MapView na tela (via onLayout). O pin fixo de criacao
  // precisa ficar no centro do MAPA, nao da tela — como ha searchBar/filterBar
  // acima e bottomNav abaixo, o centro do mapa fica deslocado do centro da tela.
  // Sem isso, o pin visual aponta um lugar mas a coordenada salva e' outra.
  const [mapLayout, setMapLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const [resolvingPin, setResolvingPin] = useState(false);

  const startMapCreation = useCallback(() => {
    setShowCepStep(false);
    setTab('map');
    setCreationCenter({ latitude: mapCenter.latitude, longitude: mapCenter.longitude });
    setCreationMode(true);
  }, [mapCenter]);

  const cancelMapCreation = useCallback(() => {
    setCreationMode(false);
    setCreationCenter(null);
  }, []);

  const confirmMapCreation = useCallback(async () => {
    if (!creationCenter) return;
    setResolvingPin(true);
    let addr: { endereco: string; numero: string; bairro: string; cidade: string; estado: string; cep: string } | null = null;
    try {
      addr = await reverseGeocode(creationCenter.latitude, creationCenter.longitude);
    } catch (err: any) {
      console.warn('[reverseGeocode] falhou:', err?.message ?? err);
    } finally {
      setResolvingPin(false);
    }

    setCreationMode(false);
    // Cadastro novo sempre comeca como "lead a visitar" — cliente/churn
    // nao sao opcoes na criacao manual (so via fluxo de pos-venda).
    setForm({
      ...initialFormState,
      status: 'lead' as ClientStatus,
      latitude: creationCenter.latitude.toString(),
      longitude: creationCenter.longitude.toString(),
      cep: addr?.cep ? `${addr.cep.slice(0, 5)}-${addr.cep.slice(5)}` : '',
      endereco: addr?.endereco ?? '',
      numero: addr?.numero ?? '',
      cidade: addr?.cidade ?? '',
      estado: addr?.estado ?? '',
    });
    // Pin no mapa é sempre preciso (o usuário aponta o local exato).
    setPendingGeoApproximate(false);
    setIsFormOpen(true);
    setCreationCenter(null);
  }, [creationCenter, statusOptions]);

  const resetForm = () => { setForm(initialFormState); setPendingGeoApproximate(false); };

  const submitClient = async () => {
    if (submittingRef.current) return;
    if (!form.nome.trim()) {
      Alert.alert('Nome do contato', 'Informe o nome do contato responsavel.');
      return;
    }
    if (!form.empresa.trim()) {
      Alert.alert('Restaurante obrigatorio', 'Informe o nome do restaurante (empresa).');
      return;
    }

    const lat = form.latitude ? parseFloat(form.latitude) : null;
    const lng = form.longitude ? parseFloat(form.longitude) : null;

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      Alert.alert(
        'Localização ausente',
        'Não foi possível determinar as coordenadas. Tente novamente ou use o cadastro via coordenadas.',
      );
      return;
    }

    const newClient = {
      ...form,
      latitude: lat,
      longitude: lng,
      empresa: form.empresa || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      cep: form.cep || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      telefone: form.telefone || null,
      email: form.email || null,
      observacoes: form.observacoes || null,
      // Aproximado só quando veio do CEP sem número exato. Pin no mapa/coords
      // e edição resetam pra false (setPendingGeoApproximate(false) nesses fluxos).
      geo_approximate: pendingGeoApproximate,
    };

    submittingRef.current = true;
    try {
      const created = await addClient.mutateAsync(newClient);
      resetForm();
      setIsFormOpen(false);
      Alert.alert(
        'Cliente cadastrado',
        'Deseja agendar uma reunião com este lead agora?',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: '📅 Agendar reunião', onPress: () => setSchedulingFor({ client: created, type: 'reuniao' }) },
        ],
      );
    } catch (err: any) {
      const isDuplicate = err?.code === '23505' || /duplicate|unique/i.test(err?.message || '');
      Alert.alert(
        isDuplicate ? 'Cliente já existe' : 'Erro ao cadastrar',
        isDuplicate
          ? 'Já existe um cliente com esse nome nesta localização.'
          : (err?.message || 'Tente novamente'),
      );
    } finally {
      submittingRef.current = false;
    }
  };

  const openEditClient = (client: Client) => {
    setEditingClient(client);
    setForm({
      nome: client.nome || '',
      empresa: client.empresa || '',
      endereco: client.endereco || '',
      numero: client.numero || '',
      cep: client.cep || '',
      cidade: client.cidade || '',
      estado: client.estado || '',
      telefone: client.telefone || '',
      email: client.email || '',
      status: client.status as ClientStatus || 'lead',
      latitude: client.latitude?.toString() || '',
      longitude: client.longitude?.toString() || '',
      observacoes: client.observacoes || '',
    });
    setSelectedClient(null);
    setIsFormOpen(true);
  };

  const saveEditClient = async () => {
    if (submittingRef.current) return;
    if (!editingClient || !form.nome.trim()) return;
    if (!form.empresa.trim()) {
      Alert.alert('Restaurante obrigatorio', 'Informe o nome do restaurante (empresa).');
      return;
    }
    // Defesa em profundidade: trigger no banco tambem bloqueia, mas avisar
    // aqui evita ter que mostrar erro feio do Postgres se o usuario tentou.
    if (
      (editingClient.status === 'cliente' || editingClient.status === 'churn')
      && form.status === 'lead'
    ) {
      Alert.alert(
        'Transicao nao permitida',
        'Cliente atual ou ex-cliente nao pode voltar pra status de lead.',
      );
      return;
    }

    const lat = form.latitude ? parseFloat(form.latitude) : null;
    const lng = form.longitude ? parseFloat(form.longitude) : null;

    submittingRef.current = true;
    try {
      await updateClient.mutateAsync({
        id: editingClient.id,
        ...form,
        latitude: lat,
        longitude: lng,
      });
      setEditingClient(null);
      resetForm();
      setIsFormOpen(false);
      Alert.alert('Sucesso', 'Cliente atualizado!');
    } catch (err: any) {
      Alert.alert('Erro ao atualizar', err?.message || 'Tente novamente');
    } finally {
      submittingRef.current = false;
    }
  };

  // Salva a nova localizacao vinda do EditLocationModal (pin arrastavel). Reusa
  // updateClient passando as coords + endereco resolvido; marca geo_source
  // 'coords' e geo_approximate false (o usuario apontou o local exato).
  const saveEditedLocation = useCallback(
    async (client: Client, payload: {
      latitude: number; longitude: number;
      endereco?: string; numero?: string | null; bairro?: string | null;
      cep?: string; cidade?: string; estado?: string;
    }) => {
      await updateClient.mutateAsync({
        id: client.id,
        // Mantem os campos NAO-geo do cliente (o update sobrescreve a linha toda
        // pros campos que passamos; os de texto vao com o valor atual).
        nome: client.nome,
        empresa: client.empresa ?? undefined,
        telefone: client.telefone ?? undefined,
        email: client.email ?? undefined,
        observacoes: client.observacoes ?? undefined,
        status: client.status as ClientStatus,
        // Campos de localizacao — os novos. Endereco/cidade/etc do reverse-geocode
        // quando vierem; senao mantem o atual do cliente.
        latitude: payload.latitude,
        longitude: payload.longitude,
        endereco: payload.endereco ?? client.endereco ?? undefined,
        numero: payload.numero ?? client.numero ?? undefined,
        bairro: payload.bairro ?? client.bairro ?? undefined,
        cep: payload.cep ?? client.cep ?? undefined,
        cidade: payload.cidade ?? client.cidade ?? undefined,
        estado: payload.estado ?? client.estado ?? undefined,
        geo_source: 'coords',
        geo_approximate: false,
      });
    },
    [updateClient],
  );

  const confirmDeleteClient = useCallback((client: Client, onDone?: () => void) => {
    Alert.alert(
      'Remover cliente',
      `Deseja realmente remover "${client.nome}"? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            deleteClient.mutate(client.id, {
              onSuccess: () => onDone?.(),
              onError: (err: any) => Alert.alert('Erro', err?.message || 'Erro ao remover cliente'),
            });
          },
        },
      ],
    );
  }, [deleteClient]);

  // Distância Haversine em metros (mesma fórmula da RPC, só pra UX antes do round-trip).
  const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  const visitingRef = useRef(false);
  const [isVisiting, setIsVisiting] = useState(false);

  const handleMarkAsVisited = useCallback(async (client: Client, onDone?: () => void) => {
    if (visitingRef.current) return;
    visitingRef.current = true;
    setIsVisiting(true);

    try {
      if (client.latitude == null || client.longitude == null) {
        Alert.alert('Sem coordenadas', 'Este lead não tem latitude/longitude — não é possível validar proximidade.');
        return;
      }

      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        // requestForegroundPermissionsAsync só abre o prompt do sistema na
        // primeira vez. Se o usuário já negou antes, ele só retorna 'denied'
        // sem abrir nada — por isso a gente direciona pro app de configurações
        // do sistema, que é o único caminho de reverter um "deny" prévio.
        Alert.alert(
          'Localização desativada',
          'Pra marcar como visitado a gente precisa do GPS do celular pra confirmar que você tá no local. Abrir as configurações do sistema pra habilitar?',
          [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Abrir configurações', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }

      let position: Location.LocationObject;
      try {
        position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      } catch (err: any) {
        Alert.alert('Erro de GPS', err?.message ?? 'Não foi possível obter sua localização.');
        return;
      }

      const userLat = position.coords.latitude;
      const userLon = position.coords.longitude;
      const distance = haversineMeters(userLat, userLon, client.latitude as number, client.longitude as number);

      if (distance > 200) {
        Alert.alert(
          'Você está muito longe',
          `Distância atual: ${Math.round(distance)} m (limite: 200 m).\nAproxime-se do local para marcar como visitado.`,
        );
        return;
      }

      await markAsVisited.mutateAsync({ clientId: client.id, latitude: userLat, longitude: userLon });
      Alert.alert('Pronto', 'Lead marcado como visitado.');
      onDone?.();
    } catch (err: any) {
      Alert.alert('Não foi possível marcar como visitado', err?.message ?? 'Erro desconhecido');
    } finally {
      visitingRef.current = false;
      setIsVisiting(false);
    }
  }, [markAsVisited]);

  // Conta por status respeitando search + UF — assim o usuario ve em tempo
  // real qual aba traz resultados conforme digita ("Lead (316)" -> "Lead (200)").
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const opt of statusOptions) counts[opt.value] = 0;
    for (const c of clientsForCount) counts[c.status] = (counts[c.status] ?? 0) + 1;
    return counts;
  }, [clientsForCount, statusOptions]);

  // Contagem por status pro viewer: sobre TODOS os clientes (viewer nao tem
  // search/UF/vendedor pra estreitar o pool), so os que tem coordenada — que
  // sao os que efetivamente entram como pin no mapa.
  const viewerStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const opt of statusOptions) counts[opt.value] = 0;
    for (const c of clients) {
      if (c.latitude === null || c.longitude === null) continue;
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    }
    return counts;
  }, [clients, statusOptions]);

  // Liga/desliga um status na multi-selecao do viewer. Impede desmarcar o
  // ultimo status ligado — sem nenhum, o mapa ficaria vazio sem motivo.
  const toggleViewerStatus = useCallback((status: ClientStatus) => {
    setViewerStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        if (next.size === 1) return prev;
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const renderClientItem = useCallback(({ item }: { item: Client }) => {
    const color = statusConfig[item.status]?.color || '#3b82f6';
    const label = statusConfig[item.status]?.label || item.status;
    const meetingCount = upcomingByClient[item.id] ?? 0;
    // Restaurante (empresa) eh o titulo principal. Fallback pro nome do
    // contato em leads antigos que ainda nao tem empresa preenchida.
    const primary = getClientPrimaryName(item);
    const secondary = item.empresa?.trim() ? item.nome : null;
    return (
      <TouchableOpacity
        style={[styles.clientCard, { borderLeftColor: color }]}
        onPress={() => openClientDetails(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardNameRow}>
            <Image source={require('./assets/icon.png')} style={[styles.cardLogo, { tintColor: color }]} />
            <Text style={styles.clientName} numberOfLines={1}>{primary}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Visitas: so mostra a partir da 2a (revisita) — na 1a o proprio
                status "lead visitado" ja comunica. */}
            {(item.visit_count ?? 0) > 1 && (
              <View style={styles.cardVisitBadge}>
                <Text style={styles.cardVisitBadgeText}>📍 {item.visit_count}</Text>
              </View>
            )}
            {meetingCount > 0 && (
              <View style={styles.cardMeetingBadge}>
                <Text style={styles.cardMeetingBadgeText}>📅 {meetingCount}</Text>
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: color }]}>
              <Text style={styles.statusBadgeText}>{label}</Text>
            </View>
          </View>
        </View>
        {secondary && <Text style={styles.clientContact} numberOfLines={1}>Contato: {secondary}</Text>}
        {item.etapa && <Text style={styles.clientStage} numberOfLines={1}>Etapa: {item.etapa}</Text>}
        <Text style={styles.clientCity}>
          {item.cidade ?? 'Cidade não informada'}{item.estado ? ` • ${item.estado}` : ''}
        </Text>
        {item.telefone && <Text style={styles.clientPhone}>{item.telefone}</Text>}
      </TouchableOpacity>
    );
  }, [openClientDetails, statusConfig, upcomingByClient]);

  const renderListRow = useCallback(({ item }: { item: typeof listRows[number] }) => {
    if (item.type === 'client') {
      return renderClientItem({ item: item.item });
    }
    return (
      <TouchableOpacity
        style={styles.stageAccordionHeader}
        onPress={() => {
          setExpandedStages(prev => {
            const next = new Set(prev);
            if (next.has(item.stageKey)) {
              next.delete(item.stageKey);
            } else {
              next.add(item.stageKey);
            }
            return next;
          });
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.stageAccordionTitle}>{item.title}</Text>
          <Text style={styles.stageAccordionMeta}>{item.count} leads</Text>
        </View>
        <Text style={styles.stageAccordionChevron}>{item.expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
    );
  }, [renderClientItem]);

  const renderCompactClient = (client: Client, index: number, actions?: React.ReactNode) => {
    const color = statusConfig[client.status]?.color || '#3b82f6';
    return (
      <View key={client.id} style={[styles.clientCard, { borderLeftColor: color }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardNameRow}>
            <Text style={styles.routePosition}>{index + 1}</Text>
            <Text style={styles.clientName} numberOfLines={1}>{getClientPrimaryName(client)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: color }]}>
            <Text style={styles.statusBadgeText}>{statusConfig[client.status]?.label || client.status}</Text>
          </View>
        </View>
        <Text style={styles.clientCity}>
          {[client.bairro, client.cidade, client.estado].filter(Boolean).join(' - ') || 'Localizacao nao informada'}
        </Text>
        {actions}
      </View>
    );
  };

  const renderRouteScreen = () => (
    <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 90 + insets.bottom }]}>
      <View style={styles.panelCard}>
        <Text style={styles.panelTitle}>Sugerir rota do dia</Text>
        <Text style={styles.panelHint}>
          Informe quantos leads quer visitar e quais status entram no recorte.
          A ordem eh otimizada por estradas reais.
        </Text>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Quantos leads visitar</Text>
        <TextInput
          style={[styles.input, { marginBottom: 0 }]}
          value={routeLeadCount}
          onChangeText={setRouteLeadCount}
          keyboardType="number-pad"
          placeholder="Ex.: 8"
          placeholderTextColor="#94a3b8"
        />

        {/* Ponto de partida da rota. Default: minha localizacao (GPS). O
            vendedor pode escolher partir de um cliente especifico (ex.: comeca
            o dia de um ponto que nao e' onde ele esta agora). */}
        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Ponto de partida</Text>
        <View style={styles.routeStartRow}>
          <TouchableOpacity
            style={[styles.routeStartOption, !routeStartOverride && styles.routeStartOptionActive]}
            onPress={() => setRouteStartOverride(null)}
          >
            <Text style={[styles.routeStartText, !routeStartOverride && styles.routeStartTextActive]}>
              📍 Minha localização
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.routeStartOption, !!routeStartOverride && styles.routeStartOptionActive]}
            onPress={() => setIsPickingRouteStart(true)}
          >
            <Text style={[styles.routeStartText, !!routeStartOverride && styles.routeStartTextActive]} numberOfLines={1}>
              {routeStartOverride ? `🎯 ${routeStartOverride.label}` : '🎯 Escolher local'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
          Status incluidos ({routeStatusSelection.size} selecionado{routeStatusSelection.size === 1 ? '' : 's'})
        </Text>
        <View style={styles.statusMultiRow}>
          {statusOptions.map(opt => {
            const selected = routeStatusSelection.has(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.filterChip,
                  selected && { backgroundColor: opt.color, borderColor: opt.color },
                  !selected && { borderWidth: 1, borderColor: '#e2e8f0' },
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
                <View style={[styles.filterDot, { backgroundColor: opt.color }]} />
                <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Responsavel</Text>
        {isAdmin ? (
          <TouchableOpacity
            style={[
              styles.dropdownButton,
              routeVendorFilterHubspotId !== null && { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
            ]}
            onPress={() => setIsPickingRouteVendor(true)}
          >
            <Text style={[
              styles.dropdownButtonText,
              routeVendorFilterHubspotId === null && { color: '#64748b' },
            ]}>
              {vendorLabel(routeVendorFilterHubspotId)}
            </Text>
            <Text style={styles.dropdownChevron}>▾</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.dropdownButton,
              routeVendorFilterHubspotId !== null && { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
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
              styles.dropdownButtonText,
              routeVendorFilterHubspotId === null && { color: '#64748b' },
            ]}>
              {routeVendorFilterHubspotId === myHubspotId ? 'Somente meus leads' : 'Todos os leads do recorte'}
            </Text>
            <Text style={[
              styles.dropdownChevron,
              routeVendorFilterHubspotId === myHubspotId && { color: '#dc2626' },
            ]}>{routeVendorFilterHubspotId === myHubspotId ? '✓' : '○'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.submitButton, { marginTop: 16 }]}
          onPress={suggestRoute}
          disabled={fieldOps.saveRoute.isPending || isOptimizing}
        >
          {(fieldOps.saveRoute.isPending || isOptimizing)
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitButtonText}>Gerar rota</Text>}
        </TouchableOpacity>
      </View>

      {/* Adicionar manualmente: busca em tempo real entre todos os leads.
          Resultado mostra os 10 primeiros matches com botao "Adicionar". */}
      <View style={styles.panelCard}>
        <Text style={styles.panelTitle}>Adicionar lead manualmente</Text>
        <Text style={styles.panelHint}>
          Busque pelo nome do restaurante ou contato pra incluir na rota.
        </Text>
        <View style={[styles.searchBar, { marginHorizontal: 0, marginTop: 8 }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar restaurante, contato, cidade..."
            placeholderTextColor="#94a3b8"
            value={routeManualSearch}
            onChangeText={setRouteManualSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {routeManualSearch.length > 0 && (
            <TouchableOpacity onPress={() => setRouteManualSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.searchClear}>✕</Text>
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
            return <Text style={[styles.emptyStateText, { marginTop: 10 }]}>Nenhum lead encontrado.</Text>;
          }
          return matches.map(c => {
            const title = getClientPrimaryName(c);
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
                  style={[styles.smallActionButton, noCoords && { opacity: 0.5 }]}
                  disabled={noCoords}
                  onPress={() => addClientToRoute(c)}
                >
                  <Text style={styles.smallActionButtonText}>+ Adicionar</Text>
                </TouchableOpacity>
              </View>
            );
          });
        })()}
        {routeManualSearch.trim().length > 0 && routeManualSearch.trim().length < 2 && (
          <Text style={[styles.panelHint, { marginTop: 10 }]}>Digite pelo menos 2 caracteres.</Text>
        )}
      </View>

      <View style={styles.panelCard}>
        <View style={styles.panelHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.panelTitle}>Rota de hoje</Text>
            <Text style={styles.panelHint}>
              {routeDisplayClients.length} leads planejados
              {routeGeometry.data && routeGeometry.data.coordinates.length > 1 && (
                ` • ${(routeGeometry.data.distanceMeters / 1000).toFixed(1)} km`
                + ` • ~${Math.round(routeGeometry.data.durationSeconds / 60)} min`
              )}
              {routeGeometry.isFetching && ' • calculando rota...'}
            </Text>
            {/* Badge admin: mostra qual provedor foi usado na ultima sugestao.
                ORS = caminho feliz; OSRM = ORS caiu e o fallback rolou. */}
            {isAdmin && lastProviderUsed && (
              <View style={[styles.providerBadge, lastProviderUsed === 'osrm' && { backgroundColor: '#fef3c7', borderColor: '#fde68a' }]}>
                <Text style={[styles.providerBadgeText, lastProviderUsed === 'osrm' && { color: '#92400e' }]}>
                  {lastProviderUsed === 'ors'
                    ? '✓ Via OpenRouteService'
                    : '⚠ Via OSRM (ORS estava fora)'}
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
                <Text style={[styles.secondaryButtonText, { color: '#fff' }]}>🧭 Navegar</Text>
              </TouchableOpacity>
            )}
            {routeDisplayClients.length > 0 ? (
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: '#dc2626' }]}
                onPress={viewRouteOnMap}
              >
                <Text style={[styles.secondaryButtonText, { color: '#fff' }]}>Ver no mapa</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setTab('map')}>
                <Text style={styles.secondaryButtonText}>Abrir mapa</Text>
              </TouchableOpacity>
            )}
            {routeDisplayClients.length > 0 && (
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}
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
                <Text style={[styles.secondaryButtonText, { color: '#dc2626' }]}>Limpar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {routeDisplayClients.length === 0 ? (
          <Text style={styles.emptyStateText}>Nenhum lead na rota. Use a sugestao ou abra um pin no mapa.</Text>
        ) : (
          routeDisplayClients.map((client, index) => {
            const stop = routeStops.find(s => s.client_id === client.id);
            const isLast = index === routeDisplayClients.length - 1;
            const isDone = stop?.status === 'done';
            const color = statusConfig[client.status]?.color || '#3b82f6';
            const title = getClientPrimaryName(client);
            const subtitle = [client.bairro, client.cidade, client.estado].filter(Boolean).join(' - ') || 'Localizacao nao informada';
            return (
              <View
                key={client.id}
                style={[
                  styles.routeStopCard,
                  { borderLeftColor: isDone ? '#16a34a' : color },
                  isDone && { backgroundColor: '#f0fdf4' },
                ]}
              >
                <View style={styles.routeStopHeader}>
                  {/* Checkbox: toggle done/planned. Persiste via toggleStopDone */}
                  <TouchableOpacity
                    style={[styles.checkbox, isDone && styles.checkboxChecked]}
                    onPress={() => {
                      if (stop) fieldOps.toggleStopDone.mutate(stop);
                    }}
                    disabled={!stop}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {isDone && <Text style={styles.checkboxCheckmark}>✓</Text>}
                  </TouchableOpacity>
                  <Text style={styles.routePosition}>{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.clientName, isDone && { textDecorationLine: 'line-through', color: '#64748b' }]}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    <Text style={[styles.routeStopSubtitle, isDone && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: isDone ? '#16a34a' : color }]}>
                    <Text style={styles.statusBadgeText}>
                      {isDone ? 'Visitado' : (statusConfig[client.status]?.label || client.status)}
                    </Text>
                  </View>
                </View>
                <View style={styles.routeActionsRow}>
                  {index > 0 && (
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => {
                        const nextStops = routeStops.slice();
                        [nextStops[index - 1], nextStops[index]] = [nextStops[index], nextStops[index - 1]];
                        if (nextStops.length) fieldOps.updateStops.mutate(nextStops);
                      }}
                    >
                      <Text style={styles.smallActionButtonText}>↑ Subir</Text>
                    </TouchableOpacity>
                  )}
                  {!isLast && (
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => {
                        const nextStops = routeStops.slice();
                        [nextStops[index], nextStops[index + 1]] = [nextStops[index + 1], nextStops[index]];
                        if (nextStops.length) fieldOps.updateStops.mutate(nextStops);
                      }}
                    >
                      <Text style={styles.smallActionButtonText}>↓ Descer</Text>
                    </TouchableOpacity>
                  )}
                  {stop && (
                    <TouchableOpacity style={styles.smallActionButton} onPress={() => fieldOps.removeStop.mutate(stop)}>
                      <Text style={styles.smallActionButtonText}>Remover</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.smallActionButton}
                    onPress={() => openClientDetails(client)}
                  >
                    <Text style={styles.smallActionButtonText}>Abrir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );

  const renderTasksScreen = () => {
    // Recorte (gestor ve todas, vendedor ve so as suas) calculado uma vez em
    // visibleTasks/tasksActiveVendor — compartilhado com o badge do rodape.
    const activeVendor = tasksActiveVendor;

    const sevColor = (s: string | null) => (s === 'D5' ? '#dc2626' : s === 'D2' ? '#f59e0b' : s === 'SLA' ? '#2563eb' : '#64748b');
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
      .filter(([sev]) => taskSevFilter === null || sev === taskSevFilter)
      .map(([sev, total]) => ({
        sev,
        total,
        itens: sorted.filter((t) => sevKey(t.severity) === sev),
      }))
      .filter((s) => s.itens.length > 0);

    const renderTaskCard = (task: ClientTask) => {
      const client = clients.find((c) => c.id === task.client_id) ?? null;
      const leadNome = client ? getClientPrimaryName(client) : 'Lead não encontrado';
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
        <View key={task.id} style={styles.taskCard}>
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
                style={styles.smallActionButton}
                onPress={() => { setTab('map'); openClientDetails(client); }}
              >
                <Text style={styles.smallActionButtonText}>Abrir lead</Text>
              </TouchableOpacity>
            )}
            {client && task.task_type === 'agendar_demo' && (
              <TouchableOpacity
                style={[styles.smallActionButton, { backgroundColor: '#7c3aed', borderColor: '#7c3aed' }]}
                onPress={() => setSchedulingFor({ client, type: 'reuniao' })}
              >
                <Text style={[styles.smallActionButtonText, { color: '#fff' }]}>Agendar demo</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.smallActionButton, { backgroundColor: '#16a34a', borderColor: '#16a34a' }]}
              onPress={() => {
                // Com o lead carregado, concluir abre o menu de destino
                // (avançar / perdido / manter + próxima). Sem lead
                // (raro: cliente deletado), cai na conclusão simples.
                if (client) {
                  setCompletingTask({ task, client });
                } else {
                  Alert.alert('Concluir tarefa', `Marcar "${task.title}" como concluída?`, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Concluir', onPress: () => resolveTask.mutate({ id: task.id, status: 'concluida' }) },
                  ]);
                }
              }}
            >
              <Text style={[styles.smallActionButtonText, { color: '#fff' }]}>Concluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    };

    return (
      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 90 + insets.bottom }]}>
        {/* Cabeçalho enxuto: o texto explicativo que ficava aqui virou o modal
            ⓘ, que já tinha as regras completas — ele ocupava um terço da tela
            em toda visita, mesmo pra quem já conhece a mecânica. */}
        <View style={styles.taskHeaderRow}>
          <Text style={styles.panelTitle}>
            Tarefas{sorted.length > 0 ? ` · ${sorted.length}` : ''}
          </Text>
          <TouchableOpacity
            style={styles.taskInfoButton}
            onPress={() => setIsTaskRulesOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.taskInfoButtonText}>ⓘ</Text>
          </TouchableOpacity>
        </View>

        {activeVendor !== null && activeVendor !== myHubspotId ? (
          <Text style={styles.taskVendorHint}>
            Filtro ativo: {vendorLabel(activeVendor)} — tire no modal de filtros.
          </Text>
        ) : null}

        {/* Chips: quanto tem de cada urgência, e filtro de um toque. */}
        {chips.length > 1 && (
          <View style={styles.taskChipsRow}>
            {chips.map(([sev, total]) => {
              const ativo = taskSevFilter === sev;
              return (
                <TouchableOpacity
                  key={sev}
                  style={[styles.taskChip, ativo && { borderColor: sevColor(sev), backgroundColor: '#fff' }]}
                  onPress={() => setTaskSevFilter(ativo ? null : sev)}
                >
                  <View style={[styles.taskChipDot, { backgroundColor: sevColor(sev) }]} />
                  <Text style={[styles.taskChipText, ativo && { color: '#0f172a' }]}>
                    {sev} {total}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {sorted.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Nenhuma tarefa pendente. 🎉</Text>
          </View>
        ) : (
          secoes.map((secao) => (
            <View key={secao.sev}>
              <View style={styles.taskSectionHeader}>
                <View style={[styles.taskChipDot, { backgroundColor: sevColor(secao.sev) }]} />
                <Text style={styles.taskSectionText}>
                  {secao.sev} · {secao.total} {secao.total === 1 ? 'tarefa' : 'tarefas'}
                </Text>
              </View>
              {secao.itens.map(renderTaskCard)}
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  const renderAgendaScreen = () => {
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
    const agendaItems = vendorFilterHubspotId === null
      ? allAgendaItems
      : vendorFilterHubspotId === '__none__'
        ? allAgendaItems.filter(item => !item.client?.vendedor_id_hubspot)
        : allAgendaItems.filter(item => item.client?.vendedor_id_hubspot === vendorFilterHubspotId);

    // Divide em passado / hoje / futuro. "Hoje" fica sempre aberto no topo;
    // passado e futuro viram acordeão fechado (mesmo padrão da aba Lista).
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const pastItems: typeof agendaItems = [];
    const todayItems: typeof agendaItems = [];
    const futureItems: typeof agendaItems = [];
    for (const item of agendaItems) {
      const t = item.at ? new Date(item.at).getTime() : 0;
      if (t >= todayStart.getTime() && t < todayEnd.getTime()) {
        todayItems.push(item);
      } else if (t < now) {
        pastItems.push(item);
      } else {
        futureItems.push(item);
      }
    }
    // Passado mais recente primeiro — o que acabou de passar é o mais relevante.
    pastItems.reverse();

    const renderAgendaItem = (item: typeof agendaItems[number], index: number) => {
          const date = item.at ? new Date(item.at) : null;
          const time = date ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
          const client = item.client;
          const title = client ? getClientPrimaryName(client) : 'Lead nao encontrado';
          const contact = client?.empresa?.trim() && client.nome && client.nome !== client.empresa ? client.nome : null;
          const responsavel = client?.vendedor_id_hubspot
            ? vendorLabel(client.vendedor_id_hubspot)
            : null;

          // Linha de contexto (como no card do mockup): "1ª visita · Bairro" ou
          // "Revisita · Bairro". Reuniao/follow up dizem o tipo no lugar da
          // contagem de visita — o que importa ali e' o compromisso, nao o pin.
          const visitas = client ? (client.visit_count || (client.visited_at ? 1 : 0)) : 0;
          const ocasiao = item.kind === 'meeting'
            ? (item.meeting.type === 'follow_up' ? 'Follow up' : 'Reunião/demo')
            : visitas > 0 ? 'Revisita' : '1ª visita';
          const lugar = client?.bairro?.trim() || client?.cidade?.trim() || null;
          const subtitle = [ocasiao, lugar].filter(Boolean).join(' · ');

          // Pill de temperatura da etapa — mesma escala de cor dos pins do mapa.
          const temp = stageTemperature(client?.etapa);

          return (
            <View
              key={item.kind === 'meeting' ? `meeting-${item.meeting.id}` : `route-${item.stop.id ?? index}`}
              style={styles.agendaItem}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.agendaTitle}>
                  {title} <Text style={styles.agendaTitleTime}>— {time}</Text>
                </Text>
                <Text style={styles.agendaSubtitle}>{subtitle}</Text>
                {contact ? <Text style={styles.agendaMeta}>Contato: {contact}</Text> : null}
                {responsavel ? <Text style={styles.agendaMeta}>Responsável: {responsavel}</Text> : null}
                {temp && (
                  <View style={[styles.agendaTempPill, { backgroundColor: `${temp.color}1a`, borderColor: `${temp.color}59` }]}>
                    <Text style={[styles.agendaTempPillText, { color: temp.color }]}>
                      {temp.label} · {client?.etapa}
                    </Text>
                  </View>
                )}
                {client && (
                  <View style={styles.routeActionsRow}>
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => openClientDetails(client)}
                    >
                      <Text style={styles.smallActionButtonText}>Abrir lead</Text>
                    </TouchableOpacity>
                    {client.latitude != null && client.longitude != null && (
                      <TouchableOpacity
                        style={styles.smallActionButton}
                        onPress={() => openNavigation({ latitude: client.latitude as number, longitude: client.longitude as number, clientName: title, travelMode: 'driving' })}
                      >
                        <Text style={styles.smallActionButtonText}>Rota</Text>
                      </TouchableOpacity>
                    )}
                    {toWhatsappNumber(client.telefone) && (
                      <TouchableOpacity
                        style={[styles.smallActionButton, { backgroundColor: '#25d366' }]}
                        onPress={() => openWhatsapp(client.telefone)}
                      >
                        <Text style={[styles.smallActionButtonText, { color: '#fff' }]}>WhatsApp</Text>
                      </TouchableOpacity>
                    )}
                    {/* Reagendar: so pra reuniao/follow up (rota nao tem evento
                        no Google Agenda pra mover). Abre o modal ja preenchido. */}
                    {item.kind === 'meeting' && !isViewer && (
                      <TouchableOpacity
                        style={[styles.smallActionButton, { backgroundColor: '#f97316' }]}
                        onPress={() => setSchedulingFor({
                          client,
                          type: item.meeting.type ?? 'reuniao',
                          reschedule: item.meeting,
                        })}
                      >
                        <Text style={[styles.smallActionButtonText, { color: '#fff' }]}>Reagendar</Text>
                      </TouchableOpacity>
                    )}
                    {item.kind === 'meeting' && !isViewer && (
                      <TouchableOpacity
                        style={[styles.smallActionButton, { backgroundColor: '#dc2626' }]}
                        onPress={() => confirmCancelMeeting(item.meeting)}
                      >
                        <Text style={[styles.smallActionButtonText, { color: '#fff' }]}>Cancelar</Text>
                      </TouchableOpacity>
                    )}
                    {item.kind === 'route' && (
                      <TouchableOpacity style={styles.smallActionButton} onPress={() => fieldOps.markStopDone.mutate(item.stop)}>
                        <Text style={styles.smallActionButtonText}>Realizada</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
    };

    // Agrupa por DIA. O cabecalho vermelho de cada grupo ("HOJE · TER, 11 AGO")
    // e' o que da a leitura de calendario — em vez de uma lista corrida onde o
    // vendedor tinha que ler a data item a item.
    const groupByDay = (items: typeof agendaItems) => {
      const groups: { key: string; date: Date | null; items: typeof agendaItems }[] = [];
      for (const item of items) {
        const d = item.at ? new Date(item.at) : null;
        const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : 'sem-data';
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.items.push(item);
        else groups.push({ key, date: d, items: [item] });
      }
      return groups;
    };

    // "HOJE · TER, 11 AGO" / "AMANHÃ · QUA, 12 AGO" / "QUI, 13 AGO".
    const dayHeaderLabel = (d: Date | null) => {
      if (!d) return 'SEM DATA';
      const dia = new Date(d);
      dia.setHours(0, 0, 0, 0);
      const diff = Math.round((dia.getTime() - todayStart.getTime()) / 86_400_000);
      const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
      const dayMonth = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        .replace('.', '')
        .toUpperCase();
      const base = `${weekday}, ${dayMonth}`;
      if (diff === 0) return `HOJE · ${base}`;
      if (diff === 1) return `AMANHÃ · ${base}`;
      if (diff === -1) return `ONTEM · ${base}`;
      return base;
    };

    // Um dia inteiro de compromissos: cabecalho + cards.
    const renderDayGroup = (
      group: { key: string; date: Date | null; items: typeof agendaItems },
      opts?: { dimmed?: boolean },
    ) => (
      <View key={group.key} style={opts?.dimmed ? { opacity: 0.7 } : undefined}>
        <View style={styles.agendaDayHeader}>
          <Text style={styles.agendaDayHeaderText}>{dayHeaderLabel(group.date)}</Text>
          <Text style={styles.agendaDayHeaderCount}>
            {group.items.length} {group.items.length === 1 ? 'item' : 'itens'}
          </Text>
        </View>
        {group.items.map((item, i) => renderAgendaItem(item, i))}
      </View>
    );

    // Hoje + futuro entram na MESMA timeline continua (é o fluxo natural de
    // "o que vem pela frente"); passado fica no acordeão fechado acima.
    const proximosGroups = groupByDay([...todayItems, ...futureItems]);
    const pastGroups = groupByDay(pastItems);

    // Serializa UM item da agenda pro JSON (mesma leitura do card: cliente,
    // responsavel, etapa/temperatura, local + campos especificos de
    // reuniao/rota). `periodo` = passado|hoje|futuro conforme o grupo.
    const serializeAgendaItem = (
      item: typeof agendaItems[number],
      periodo: 'passado' | 'hoje' | 'futuro',
    ) => {
      const client = item.client;
      const temp = stageTemperature(client?.etapa);
      const base = {
        tipo: item.kind === 'meeting'
          ? (item.meeting.type === 'follow_up' ? 'follow_up' : 'reuniao')
          : 'rota',
        periodo,
        quando: item.at ?? null,
        cliente: client ? getClientPrimaryName(client) : null,
        client_id: client?.id ?? null,
        empresa: client?.empresa ?? null,
        contato: client?.nome ?? null,
        telefone: client?.telefone ?? null,
        email: client?.email ?? null,
        responsavel: client?.vendedor_id_hubspot ? vendorLabel(client.vendedor_id_hubspot) : null,
        vendedor_id_hubspot: client?.vendedor_id_hubspot ?? null,
        etapa: client?.etapa ?? null,
        temperatura: temp?.label ?? null,
        status_lead: client?.status ?? null,
        bairro: client?.bairro ?? null,
        cidade: client?.cidade ?? null,
        estado: client?.estado ?? null,
        endereco: [client?.endereco, client?.numero].filter(Boolean).join(', ') || null,
        latitude: client?.latitude ?? null,
        longitude: client?.longitude ?? null,
        visitas_total: client ? (client.visit_count || (client.visited_at ? 1 : 0)) : null,
        url_hubspot: (client as any)?.url_hubspot ?? null,
      };
      if (item.kind === 'meeting') {
        return {
          ...base,
          meeting_id: item.meeting.id,
          duracao_minutos: item.meeting.duration_minutes ?? null,
          observacoes: item.meeting.observacoes ?? null,
          status_reuniao: item.meeting.status ?? null,
        };
      }
      return {
        ...base,
        stop_id: item.stop.id ?? null,
        posicao_rota: (item.stop as any).position ?? null,
        status_parada: (item.stop as any).status ?? null,
        minutos_deslocamento: (item.stop as any).estimated_drive_minutes ?? null,
      };
    };

    const buildAgendaPayload = () => {
      const itens = [
        ...pastItems.map(i => serializeAgendaItem(i, 'passado')),
        ...todayItems.map(i => serializeAgendaItem(i, 'hoje')),
        ...futureItems.map(i => serializeAgendaItem(i, 'futuro')),
      ];
      return {
        meta: {
          tipo: 'agenda',
          filtro_vendedor: vendorFilterHubspotId === null ? 'Todos' : vendorLabel(vendorFilterHubspotId),
          gerado_em_app: new Date().toISOString(),
          contagens: {
            total: itens.length,
            passado: pastItems.length,
            hoje: todayItems.length,
            futuro: futureItems.length,
            reunioes: itens.filter(i => i.tipo === 'reuniao').length,
            follow_ups: itens.filter(i => i.tipo === 'follow_up').length,
            rotas: itens.filter(i => i.tipo === 'rota').length,
          },
        },
        itens,
      };
    };

    // Igual ao runExport do gestor: gera o JSON, abre o Alert e o link (baixa o
    // .json no navegador). Bloqueia se a agenda estiver vazia.
    const handleExportAgenda = async () => {
      if (exportingAgenda) return;
      if (agendaItems.length === 0) {
        Alert.alert('Agenda vazia', 'Não há itens na agenda para exportar.');
        return;
      }
      setExportingAgenda(true);
      try {
        const payload = buildAgendaPayload();
        const filtro = vendorFilterHubspotId === null ? 'todos' : vendorLabel(vendorFilterHubspotId);
        const res = await exportAgenda(payload, `agenda_${filtro}`);
        Alert.alert(
          'Exportação pronta 📅',
          `${payload.meta.contagens.total} itens (${payload.meta.contagens.reunioes} reuniões, ${payload.meta.contagens.follow_ups} follow-ups, ${payload.meta.contagens.rotas} rotas).\n\nToque em Abrir para baixar o .json (abre no navegador). Depois é só jogar na IA.`,
          [
            { text: 'Fechar', style: 'cancel' },
            { text: 'Abrir', onPress: () => Linking.openURL(res.url) },
          ],
        );
      } catch (err: any) {
        Alert.alert('Erro ao exportar', err?.message ?? 'Tente novamente.');
      } finally {
        setExportingAgenda(false);
      }
    };

    return (
      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 90 + insets.bottom }]}>
        <View style={styles.panelCard}>
          <Text style={styles.panelTitle}>Agenda do vendedor</Text>
          <Text style={styles.panelHint}>
            Rota planejada, demos e follow-ups em ordem cronologica.
            {vendorFilterHubspotId !== null
              ? `\n\nFiltro ativo: ${vendorLabel(vendorFilterHubspotId)} (tire no modal de filtros).`
              : ''}
          </Text>
          {/* Exportar agenda em JSON — visivel so pra gestor (mesma regra da
              aba do Gestor). Exporta apenas os itens da agenda na tela. */}
          {canViewGestor && (
            <TouchableOpacity
              style={[styles.agendaExportBtn, exportingAgenda && styles.agendaExportBtnDisabled]}
              onPress={handleExportAgenda}
              disabled={exportingAgenda}
            >
              {exportingAgenda
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.agendaExportBtnText}>📤 Exportar agenda (JSON p/ IA)</Text>}
            </TouchableOpacity>
          )}
        </View>

        {agendaItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Agenda vazia.</Text>
          </View>
        ) : (
          <>
            {/* PASSADO — acordeão fechado por padrão */}
            {pastItems.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.stageAccordionHeader}
                  onPress={() => setAgendaPastOpen(v => !v)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stageAccordionTitle}>Passado</Text>
                    <Text style={styles.stageAccordionMeta}>{pastItems.length} {pastItems.length === 1 ? 'item' : 'itens'}</Text>
                  </View>
                  <Text style={styles.stageAccordionChevron}>{agendaPastOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {agendaPastOpen && pastGroups.map(g => renderDayGroup(g, { dimmed: true }))}
              </>
            )}

            {/* HOJE + PRÓXIMOS DIAS — timeline contínua agrupada por data */}
            {todayItems.length === 0 && (
              <>
                <View style={styles.agendaDayHeader}>
                  <Text style={styles.agendaDayHeaderText}>{dayHeaderLabel(todayStart)}</Text>
                </View>
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>Nada agendado para hoje.</Text>
                </View>
              </>
            )}
            {proximosGroups.map(g => renderDayGroup(g))}
          </>
        )}
      </ScrollView>
    );
  };

  if (!isAuthenticated && !loading) {
    return <LoginScreen />;
  }

  // Spinner full-screen SO quando nao ha nada pra mostrar (boot). Depois que
  // existe lista (mesmo placeholder da area anterior), refetch roda por baixo
  // sem esconder o app — antes qualquer troca de areaCacheKey (vendedor andou
  // ~1km) trocava o mapa inteiro por "Carregando..." no meio do uso.
  if (loading || (isLoading && clients.length === 0) || waitingForLocation) {
    return (
      <View style={styles.centered}>
        <Image source={require('./assets/icon.png')} style={{ width: 72, height: 72, marginBottom: 16, tintColor: '#dc2626', resizeMode: 'contain' }} />
        <ActivityIndicator size="large" color="#dc2626" />
        <Text style={styles.loadingText}>{waitingForLocation ? 'Localizando você...' : 'Carregando...'}</Text>
        {waitingForLocation && (
          <TouchableOpacity
            style={styles.skipLocationButton}
            onPress={() => handleToggleArea(false)}
          >
            <Text style={styles.skipLocationButtonText}>Continuar sem o filtro</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (areaPermissionDenied) {
    return (
      <View style={[styles.centered, { paddingHorizontal: 32 }]}>
        <Text style={{ fontSize: 56, marginBottom: 16 }}>📍</Text>
        <Text style={styles.permissionTitle}>Localização desativada</Text>
        <Text style={styles.permissionBody}>
          Pra mostrar só os clientes da sua área a gente precisa da localização do
          celular. Habilite nas configurações do sistema ou desative o filtro pra
          ver todos os clientes.
        </Text>
        <TouchableOpacity
          style={styles.permissionPrimaryButton}
          onPress={() => Linking.openSettings()}
        >
          <Text style={styles.permissionPrimaryButtonText}>Abrir configurações do sistema</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.permissionSecondaryButton}
          onPress={() => handleToggleArea(false)}
        >
          <Text style={styles.permissionSecondaryButtonText}>Desativar filtro e ver todos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Erro ao carregar</Text>
      </View>
    );
  }

  // ===== Tela de navegacao (full-screen) =====
  // Renderiza acima de tudo quando isNavigating === true. Mapa focado no
  // GPS, polyline da rota restante, card do proximo destino, botoes pra
  // abrir Google Maps no trecho e marcar "Cheguei".
  if (isNavigating && navigationCurrentStop) {
    const remaining = routeDisplayClients.slice(currentStopIndex);
    const remainingWithCoords = remaining.filter(c => c.latitude != null && c.longitude != null);
    const navTitle = getClientPrimaryName(navigationCurrentStop);
    const navSubtitle = [navigationCurrentStop.cidade, navigationCurrentStop.estado].filter(Boolean).join(' • ');
    const distKm = navigationDistanceMeters != null ? (navigationDistanceMeters / 1000).toFixed(1) : null;
    const isLast = currentStopIndex === routeDisplayClients.length - 1;

    const navigationStop = routeStops.find(s => s.client_id === navigationCurrentStop.id);
    const navStatusLabel = statusConfig[navigationCurrentStop.status]?.label || navigationCurrentStop.status;
    const navStatusColor = statusConfig[navigationCurrentStop.status]?.color || '#3b82f6';
    const distLabel = navigationDistanceMeters != null
      ? (navigationDistanceMeters >= 1000
          ? `${(navigationDistanceMeters / 1000).toFixed(1)} km`
          : `${Math.round(navigationDistanceMeters)} m`)
      : null;
    const noCoords = navigationCurrentStop.latitude == null || navigationCurrentStop.longitude == null;

    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: '#0f172a' }]}>
        <StatusBar style="light" />

        {/* Mapa cheio. zIndex baixo: cards e botoes flutuam sobre. */}
        <MapView
          mapRef={(ref) => { navMapRef.current = ref as unknown as RNMapView; }}
          style={{ flex: 1 }}
          initialRegion={{
            latitude: (userLocation?.latitude ?? navigationCurrentStop.latitude) as number,
            longitude: (userLocation?.longitude ?? navigationCurrentStop.longitude) as number,
            // Delta menor = mais perto. animateCamera vai ajustar mais ainda
            // (zoom=18) assim que o GPS reportar a primeira posicao.
            latitudeDelta: 0.004,
            longitudeDelta: 0.004,
          }}
          showsUserLocation={false}      /* renderizamos nossa propria seta */
          followsUserLocation={false}    /* camera controlada pelo useEffect */
          rotateEnabled
          pitchEnabled
          radius={50}
          minPoints={50}
          // Mesmo motivo do mapa principal: LayoutAnimation do clustering no
          // iOS deixa markers com snapshot vazio (pin invisivel) ao dar zoom.
          animationEnabled={false}
          onPanDrag={() => {
            // Toque pra arrastar pausa o follow automaticamente.
            if (navCameraMode === 'follow') setNavCameraMode('free');
          }}
        >
          {/* Seta da posicao atual do usuario. Marker.flat=true mantem a
              orientacao mesmo com pitch do mapa. tracksViewChanges=false
              evita rerender excessivo; a rotacao eh propriedade nativa. */}
          {userLocation && (
            <Marker
              coordinate={userLocation}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              tracksViewChanges={false}
              rotation={navCameraMode === 'follow' ? 0 : (navUserHeading ?? 0)}
              zIndex={2000}
              // @ts-ignore
              cluster={false}
            >
              <View style={navStyles.userArrowOuter}>
                {/* Triângulo branco (outline) atrás */}
                <View style={navStyles.userArrowOutline} />
                {/* Triângulo azul (preenchimento) na frente */}
                <View style={navStyles.userArrowFill} />
                {/* Bolinha base mostrando a posição real do GPS */}
                <View style={navStyles.userArrowDot} />
              </View>
            </Marker>
          )}

          {/* Trail cinza: rastro percorrido durante a sessao (Google Maps style).
              Renderizado ANTES do polyline azul pra ficar visualmente embaixo. */}
          {navTrail.length > 1 && (
            <Polyline
              coordinates={navTrail}
              strokeColor="#94a3b8"
              strokeWidth={5}
            />
          )}

          {/* Markers da rota: stops nao concluidos + concluidos */}
          {remainingWithCoords.map((client, idx) => (
            <RouteMarker
              key={`nav-${client.id}`}
              client={client}
              position={currentStopIndex + idx + 1}
              done={routeStops.find(s => s.client_id === client.id)?.status === 'done'}
              onPress={() => {}}
            />
          ))}

          {/* Polyline AZUL: caminho que falta percorrer (OSRM/ORS). */}
          {navRouteGeometry.data && navRouteGeometry.data.coordinates.length > 1 && (
            <Polyline
              coordinates={navRouteGeometry.data.coordinates}
              strokeColor="#1d4ed8"
              strokeWidth={6}
            />
          )}
        </MapView>

        {/* Header overlay translucido (nao consome MapView clicks) */}
        <View style={[navStyles.headerOverlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={navStyles.headerPill} pointerEvents="auto">
            <TouchableOpacity onPress={exitNavigation} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={navStyles.headerPillClose}>✕</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={navStyles.headerPillTitle}>Parada {currentStopIndex + 1} de {routeDisplayClients.length}</Text>
              {gpsUnstable && <Text style={navStyles.headerPillWarning}>⚠ Sinal de GPS instavel</Text>}
            </View>
            <View style={{ width: 24 }} />
          </View>
        </View>

        {/* Botoes flutuantes a direita */}
        <View
          style={[navStyles.floatingButtons, { top: insets.top + 70 }]}
          pointerEvents="box-none"
        >
          {navCameraMode !== 'follow' && (
            <TouchableOpacity
              style={[navStyles.fab, { backgroundColor: '#1d4ed8' }]}
              onPress={recenterNavigation}
            >
              {/* Chevron branco apontando pra cima: indica "modo motorista,
                  segue minha direcao". Mais claro que o pin (📍) que sugeria
                  "centralizar / voltar pro norte". */}
              <View style={navStyles.fabChevron} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={navStyles.fab} onPress={showFullRouteInNav}>
            <Text style={navStyles.fabText}>🔍</Text>
          </TouchableOpacity>
        </View>

        {/* Card inferior fixo com info do proximo + acoes */}
        <View style={[navStyles.bottomCard, { paddingBottom: insets.bottom + 14 }]}>
          <View style={navStyles.bottomCardHeader}>
            <View style={[navStyles.bottomCardBadge, { backgroundColor: navStatusColor }]}>
              <Text style={navStyles.bottomCardBadgeText}>{currentStopIndex + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={navStyles.bottomCardLabel}>Proximo destino</Text>
              <Text style={navStyles.bottomCardTitle} numberOfLines={1}>{navTitle}</Text>
              {navSubtitle ? <Text style={navStyles.bottomCardSubtitle} numberOfLines={1}>{navSubtitle}</Text> : null}
              <View style={navStyles.bottomCardMetaRow}>
                {distLabel && <Text style={navStyles.bottomCardMeta}>📍 {distLabel}</Text>}
                <Text style={[navStyles.bottomCardMeta, { color: navStatusColor }]}>● {navStatusLabel}</Text>
              </View>
              {noCoords && (
                <Text style={navStyles.bottomCardWarning}>Este destino nao possui localizacao cadastrada.</Text>
              )}
            </View>
          </View>

          <View style={navStyles.bottomCardActions}>
            <TouchableOpacity
              style={[navStyles.bottomCardButton, { backgroundColor: '#16a34a' }]}
              onPress={() => {
                Alert.alert(
                  isLast ? 'Concluir rota' : 'Finalizar visita',
                  isLast
                    ? `Marcar ${navTitle} como visitado e encerrar a rota?`
                    : `Marcar ${navTitle} como visitado e ir pro proximo?`,
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Sim', onPress: advanceNavigationStop },
                  ],
                );
              }}
            >
              <Text style={navStyles.bottomCardButtonText}>✓ Finalizar visita</Text>
            </TouchableOpacity>
            <View style={navStyles.bottomCardSecondaryRow}>
              {!isLast && (
                <TouchableOpacity
                  style={[navStyles.bottomCardSecondaryButton, { flex: 1 }]}
                  onPress={skipNavigationStop}
                >
                  <Text style={navStyles.bottomCardSecondaryText}>↪ Pular</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[navStyles.bottomCardSecondaryButton, { flex: 1.5 }]}
                disabled={noCoords}
                onPress={() => openMultiStopNavigation({
                  origin: userLocation,
                  stops: remainingWithCoords.map(c => ({
                    latitude: c.latitude as number,
                    longitude: c.longitude as number,
                  })),
                  travelMode: 'driving',
                })}
              >
                <Text style={[navStyles.bottomCardSecondaryText, noCoords && { opacity: 0.4 }]}>🚗 Maps</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const selectedClientSheet = selectedClient ? (
    <ClientBottomSheet
      client={selectedClient}
      insets={insets}
      statusConfig={statusConfig}
      meetings={meetingsByClient[selectedClient.id] ?? []}
      coordCollision={hasCoordCollision(selectedClient)}
      onClose={() => setSelectedClient(null)}
      onDelete={isViewer ? undefined : () => confirmDeleteClient(selectedClient, () => setSelectedClient(null))}
      onEdit={isViewer ? undefined : () => openEditClient(selectedClient)}
      onSavePhone={isViewer ? undefined : async (tel) => {
        // Reusa o updateClient (mesmo caminho do form completo) pra manter o
        // webhook type=update — telefone novo sincroniza pro HubSpot. Os
        // demais campos vao com o valor atual (nada e' sobrescrito).
        const c = selectedClient;
        await updateClient.mutateAsync({
          id: c.id,
          nome: c.nome,
          empresa: c.empresa ?? undefined,
          endereco: c.endereco ?? undefined,
          numero: c.numero,
          cep: c.cep ?? undefined,
          cidade: c.cidade ?? undefined,
          estado: c.estado ?? undefined,
          telefone: tel || undefined,
          email: c.email ?? undefined,
          status: c.status,
          latitude: c.latitude,
          longitude: c.longitude,
          observacoes: c.observacoes ?? undefined,
        });
        // Atualiza o snapshot aberto no sheet pra UI refletir na hora.
        setSelectedClient({ ...c, telefone: tel || null });
      }}
      onEditLocation={isViewer ? undefined : () => { setEditingLocationFor(selectedClient); setSelectedClient(null); }}
      onMarkVisited={isViewer ? undefined : () => handleMarkAsVisited(selectedClient, () => setSelectedClient(null))}
      onScheduleMeeting={isViewer ? undefined : () => { setSchedulingFor({ client: selectedClient, type: 'reuniao' }); setSelectedClient(null); }}
      onFollowUp={isViewer ? undefined : () => { setSchedulingFor({ client: selectedClient, type: 'follow_up' }); setSelectedClient(null); }}
      onRescheduleMeeting={isViewer ? undefined : (m) => { setSchedulingFor({ client: selectedClient, type: m.type ?? 'reuniao', reschedule: m }); setSelectedClient(null); }}
      onCancelMeeting={isViewer ? undefined : (m) => confirmCancelMeeting(m)}
      onChangeStage={
        !isViewer && selectedClient.status === 'lead'
          ? () => { setChangingStageFor({ client: selectedClient }); setSelectedClient(null); }
          : undefined
      }
      isMarkingVisited={isVisiting || markAsVisited.isPending}
      onAddToRoute={!isViewer && isAdmin ? () => addClientToRoute(selectedClient) : undefined}
      canWriteNotes={!isViewer}
    />
  ) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('./assets/icon.png')} style={styles.headerLogo} />
          {profile && (
            <Text style={styles.headerSubtitle}>{profile.full_name || profile.email}</Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => {
              setNewPassword('');
              setConfirmPassword('');
              setIsPasswordModalOpen(true);
            }}
          >
            <Text style={styles.headerIconText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutButtonText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Viewer (somente leitura): sem busca nem filtros avancados, mas com
          chips de status em MULTI-selecao pra escolher ver leads, clientes ou
          ambos no mesmo mapa. Toque alterna cada status; nao da pra desmarcar
          todos (o mapa ficaria vazio). */}
      {isViewer && (
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {statusOptions.map(opt => {
              const active = viewerStatuses.has(opt.value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.filterChip,
                    active && { backgroundColor: opt.color },
                  ]}
                  onPress={() => toggleViewerStatus(opt.value)}
                >
                  <View style={[styles.filterDot, { backgroundColor: opt.color }]} />
                  <Text style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}>
                    {opt.label} ({viewerStatusCounts[opt.value] ?? 0})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Vendedor/admin: search + chips de status (um por vez) + filtros. */}
      {!isViewer && (
        <>
          {/* Search bar: busca por nome, empresa, cidade ou bairro.
              Reflete em mapa, lista e contadores dos chips de status em tempo real. */}
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nome, empresa ou cidade"
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              onSubmitEditing={Keyboard.dismiss}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Linha de chips de status com botão de filtros (UF) ancorado à esquerda.
              Removido o chip "Todos" propositalmente: trazia todos os ~2k+ pinos
              de uma vez no mapa, travando o app. */}
          <View style={styles.filterBar}>
            <View style={styles.filterBarRow}>
              {(availableStates.length > 0 || availableStages.length > 0) && (
                <TouchableOpacity
                  style={styles.filterIconButton}
                  onPress={() => { Keyboard.dismiss(); setIsFiltersOpen(true); }}
                >
                  <View style={styles.filterFunnel}>
                    <View style={[styles.filterFunnelBar, { width: 18 }]} />
                    <View style={[styles.filterFunnelBar, { width: 11 }]} />
                    <View style={[styles.filterFunnelBar, { width: 5 }]} />
                  </View>
                  {activeFilterCount > 0 && (
                    <View style={styles.filterIconBadge}>
                      <Text style={styles.filterIconBadgeText}>{activeFilterCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
                keyboardShouldPersistTaps="handled"
              >
                {statusOptions.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.filterChip,
                      statusFilter === opt.value && { backgroundColor: opt.color },
                    ]}
                    onPress={() => setStatusFilter(opt.value)}
                  >
                    <View style={[styles.filterDot, { backgroundColor: opt.color }]} />
                    <Text style={[
                      styles.filterChipText,
                      statusFilter === opt.value && styles.filterChipTextActive,
                    ]}>
                      {opt.label} ({statusCounts[opt.value]})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </>
      )}

      {tab === 'map' ? (
        <>
          <MapView
            mapRef={(ref) => { mapRef.current = ref as unknown as RNMapView; }}
            style={styles.map}
            // Mede a area real do mapa na tela pra ancorar o pin de criacao no
            // centro do MAPA (nao da tela). Guarda x/y/width/height absolutos.
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              setMapLayout({ x, y, width, height });
            }}
            initialRegion={mapCenter}
            showsUserLocation={true}
            followsUserLocation={isFollowingUser && !creationMode}
            onPanDrag={handleMapInteraction}
            // Atualiza o preview de coords continuamente enquanto arrasta...
            onRegionChange={(region) => {
              if (creationMode) {
                setCreationCenter({ latitude: region.latitude, longitude: region.longitude });
              }
            }}
            // ...mas o valor DEFINITIVO e' o do assentamento final (Complete).
            // onRegionChange sozinho pode deixar um valor intermediario se o
            // usuario confirmar logo apos soltar — Complete garante a posicao
            // exata onde o mapa parou (a que o pin fixo esta apontando).
            onRegionChangeComplete={(region) => {
              if (creationMode) {
                setCreationCenter({ latitude: region.latitude, longitude: region.longitude });
              }
            }}
            showsBuildings={true}
            // Clustering: agrupa pinos próximos numa bolha com contador.
            // Com 2300+ clientes, sem isso o pan/zoom no zoom-out fica inviável.
            // maxZoom: acima desse nível, lib desliga o clustering e mostra
            // todos os pinos individuais (ajuste fino: 15=bairro, 17=quarteirão).
            radius={50}
            minPoints={3}
            maxZoom={9}
            clusterColor="#3b82f6"
            clusterTextColor="#ffffff"
            spiralEnabled={false}
            // Bug conhecido da lib no iOS: o LayoutAnimation disparado a cada
            // zoom anima os markers enquanto o native captura o snapshot do
            // custom view — o snapshot sai vazio e o pin fica invisivel
            // (sumindo "aleatoriamente" conforme o zoom). Desligar a animacao
            // resolve; os pins apenas reposicionam sem transicao.
            animationEnabled={false}
          >
            {filteredMapMarkers.map(client => (
              <MarkerWithReady
                key={client.id}
                client={client}
                coordinate={{
                  latitude: client.latitude as number,
                  longitude: client.longitude as number,
                }}
                // Cor = temperatura da etapa. Lead sem etapa conhecida
                // (Backlog, sem etapa) cai na cor do status.
                color={
                  stageTemperature(client.etapa)?.color ??
                  statusConfig[client.status]?.color ??
                  '#3b82f6'
                }
                meetingCount={upcomingByClient[client.id] ?? 0}
                onPress={handleMarkerPress}
              />
            ))}
            {/* Markers da rota com numero da ordem — renderizam acima dos
                normais e ficam visiveis independente do filtro de status. */}
            {routeDisplayClients
              .filter(c => c.latitude != null && c.longitude != null)
              .map((client, index) => {
                const stop = routeStops.find(s => s.client_id === client.id);
                return (
                <RouteMarker
                  key={`route-${client.id}`}
                  client={client}
                  position={index + 1}
                  done={stop?.status === 'done'}
                  onPress={handleMarkerPress}
                />
              );
              })}
            {/* Polyline da rota: usa geometria real (OSRM, segue ruas) quando
                disponivel; cai pra linha reta tracejada enquanto carrega ou
                se a API falhou. */}
            {routeWaypoints.length >= 2 && (
              <Polyline
                coordinates={
                  routeGeometry.data && routeGeometry.data.coordinates.length > 1
                    ? routeGeometry.data.coordinates
                    : routeWaypoints
                }
                strokeColor="#dc2626"
                strokeWidth={4}
                lineDashPattern={
                  routeGeometry.data && routeGeometry.data.coordinates.length > 1
                    ? undefined
                    : [8, 4]
                }
              />
            )}
          </MapView>

          {/* Pin de criacao ancorado no CENTRO DO MAPA (nao da tela). O
              region.latitude/longitude que salvamos e' o centro do MapView;
              como ha searchBar/filterBar acima e bottomNav abaixo, esse centro
              fica deslocado do centro da tela. Usamos mapLayout pra desenhar o
              pin exatamente sobre o centro do mapa — assim o que voce ve e' o
              que salva. A ponta do pin e o dot ficam nesse ponto exato. */}
          {creationMode && mapLayout && (() => {
            const centerY = mapLayout.y + mapLayout.height / 2;
            const centerX = mapLayout.x + mapLayout.width / 2;
            return (
              <>
                {/* Pin: base (ponta) no centro. Altura total = 36 (corpo) - 1
                    (margin da seta) + 8 (seta) = 43; alignItems centraliza a
                    seta sob o corpo — sem isso ela encosta na borda esquerda
                    e a ponta aponta ~12px fora do ponto capturado. */}
                <View
                  pointerEvents="none"
                  style={{ position: 'absolute', left: centerX - 18, top: centerY - 43, alignItems: 'center' }}
                >
                  <View style={[markerStyles.pin, { backgroundColor: '#dc2626' }]}>
                    <Image source={require('./assets/icon.png')} style={markerStyles.logo} fadeDuration={0} />
                  </View>
                  <View style={[markerStyles.arrow, { borderTopColor: '#dc2626' }]} />
                </View>
                {/* Dot no centro EXATO do mapa = onde a coordenada e' capturada.
                    Dot tem 8px — offset de metade (4) centraliza no ponto. */}
                <View
                  pointerEvents="none"
                  style={{ position: 'absolute', left: centerX - 4, top: centerY - 4 }}
                >
                  <View style={styles.creationCenterDotInner} />
                </View>
              </>
            );
          })()}

          {/* Legenda das cores dos pins. Como a temperatura virou COR (nao ha
              mais a bandeirinha de emoji explicando), a legenda passa a ser
              necessaria pra decifrar o mapa. Fica fora do modo de criacao. */}
          {!creationMode && (
            <View style={[styles.tempLegend, { bottom: 90 + insets.bottom }]} pointerEvents="none">
              {[
                { c: TEMP_COLORS.hot, l: 'Quente' },
                { c: TEMP_COLORS.warm, l: 'Morno' },
                { c: TEMP_COLORS.cold, l: 'Frio' },
                { c: TEMP_COLORS.won, l: 'Fechado' },
                { c: TEMP_COLORS.lost, l: 'Perdido' },
              ].map(item => (
                <View key={item.l} style={styles.tempLegendRow}>
                  <View style={[styles.tempLegendDot, { backgroundColor: item.c }]} />
                  <Text style={styles.tempLegendLabel}>{item.l}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Map buttons */}
          {userLocation && !creationMode && (
            <TouchableOpacity
              style={[styles.mapButton, { bottom: 90 + insets.bottom, left: 16 }]}
              onPress={centerOnUser}
            >
              <Text style={{ fontSize: 20 }}>
                {isFollowingUser ? '📍' : '🧭'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Cadastro outbound (📤) escondido: mandava só pro HubSpot sem
              registrar no app. Fica apenas o FAB vermelho (+). */}
          {!creationMode && !isViewer && (
            <TouchableOpacity
              style={[styles.fab, { bottom: 90 + insets.bottom }]}
              onPress={() => setShowCepStep(true)}
            >
              <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>
          )}

          {creationMode && creationCenter && (
            <View style={[styles.creationBar, { bottom: 90 + insets.bottom }]}>
              <Text style={styles.creationBarTitle}>Selecione o local do cliente</Text>
              <Text style={styles.creationBarHint}>
                Arraste o mapa para posicionar o pin no local exato. Endereço, CEP e bairro serão preenchidos automaticamente.
              </Text>
              <Text style={styles.creationBarCoords}>
                {creationCenter.latitude.toFixed(6)}, {creationCenter.longitude.toFixed(6)}
              </Text>
              <View style={styles.creationBarRow}>
                <TouchableOpacity
                  style={styles.creationBarCancel}
                  onPress={cancelMapCreation}
                  disabled={resolvingPin}
                >
                  <Text style={styles.creationBarCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.creationBarConfirm, resolvingPin && { opacity: 0.7 }]}
                  onPress={confirmMapCreation}
                  disabled={resolvingPin}
                >
                  {resolvingPin ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.creationBarConfirmText}>Confirmar local</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

        </>
      ) : tab === 'list' ? (
        <>
          <FlatList
            data={shouldGroupListByStage ? listRows : filteredClients}
            keyExtractor={(item: any) => item.key ?? item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: 80 + insets.bottom }]}
            renderItem={shouldGroupListByStage ? (renderListRow as any) : (renderClientItem as any)}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
                <Text style={styles.emptyStateText}>
                  {searchTerm || stateFilter || stageFilter
                    ? 'Nenhum cliente encontrado com esses filtros.'
                    : `Nenhum ${statusConfig[statusFilter]?.label?.toLowerCase() ?? statusFilter} encontrado`}
                </Text>
              </View>
            }
          />

          {/* Cadastro outbound (📤) escondido — só o FAB vermelho (+). */}
          {!isViewer && (
            <TouchableOpacity
              style={[styles.fab, { bottom: 90 + insets.bottom }]}
              onPress={() => setShowCepStep(true)}
            >
              <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>
          )}

        </>
      ) : tab === 'route' ? (
        renderRouteScreen()
      ) : tab === 'tasks' ? (
        renderTasksScreen()
      ) : tab === 'gestor' ? (
        <GestorScreen enabled={canViewGestor && tab === 'gestor'} onOpenClient={openClientById} />
      ) : tab === 'meu' ? (
        <MeuDesempenhoScreen enabled={tab === 'meu'} />
      ) : (
        renderAgendaScreen()
      )}

      {selectedClientSheet}

      {/* Bottom Navigation */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity
          style={[styles.navItem, tab === 'map' && styles.navItemActive]}
          onPress={() => setTab('map')}
        >
          <Text style={[styles.navIcon, tab === 'map' && styles.navIconActive]}>🗺️</Text>
          <Text style={[styles.navItemText, tab === 'map' && styles.navItemTextActive]}>Mapa</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navItem, tab === 'list' && styles.navItemActive]}
          onPress={() => setTab('list')}
        >
          <Text style={[styles.navIcon, tab === 'list' && styles.navIconActive]}>📋</Text>
          <Text style={[styles.navItemText, tab === 'list' && styles.navItemTextActive]}>Lista</Text>
        </TouchableOpacity>
        {!isViewer && (
          <>
            <TouchableOpacity
              style={[styles.navItem, tab === 'route' && styles.navItemActive]}
              onPress={() => setTab('route')}
            >
              <Text style={[styles.navIcon, tab === 'route' && styles.navIconActive]}>🧭</Text>
              <Text style={[styles.navItemText, tab === 'route' && styles.navItemTextActive]}>Rota</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navItem, tab === 'agenda' && styles.navItemActive]}
              onPress={() => setTab('agenda')}
            >
              <Text style={[styles.navIcon, tab === 'agenda' && styles.navIconActive]}>🗓️</Text>
              <Text style={[styles.navItemText, tab === 'agenda' && styles.navItemTextActive]}>Agenda</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navItem, tab === 'tasks' && styles.navItemActive]}
              onPress={() => setTab('tasks')}
            >
              <View>
                <Text style={[styles.navIcon, tab === 'tasks' && styles.navIconActive]}>✅</Text>
                {visibleTasksCount > 0 && (
                  <View style={styles.navBadge}>
                    <Text style={styles.navBadgeText}>
                      {visibleTasksCount > 99 ? '99+' : visibleTasksCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.navItemText, tab === 'tasks' && styles.navItemTextActive]}>Tarefas</Text>
            </TouchableOpacity>
          </>
        )}
        {canViewGestor ? (
          <TouchableOpacity
            style={[styles.navItem, tab === 'gestor' && styles.navItemActive]}
            onPress={() => setTab('gestor')}
          >
            <Text style={[styles.navIcon, tab === 'gestor' && styles.navIconActive]}>📊</Text>
            <Text style={[styles.navItemText, tab === 'gestor' && styles.navItemTextActive]}>Gestor</Text>
          </TouchableOpacity>
        ) : !isViewer && (
          // Vendedor comum (nao-gestor, nao-viewer): ve so o proprio desempenho.
          <TouchableOpacity
            style={[styles.navItem, tab === 'meu' && styles.navItemActive]}
            onPress={() => setTab('meu')}
          >
            <Text style={[styles.navIcon, tab === 'meu' && styles.navIconActive]}>📊</Text>
            <Text style={[styles.navItemText, tab === 'meu' && styles.navItemTextActive]}>Meu</Text>
          </TouchableOpacity>
        )}
        <Text
          style={[styles.brandMark, { bottom: Math.max(insets.bottom - 4, 2) }]}
          pointerEvents="none"
        >
          developed by RPA
        </Text>
      </View>

      {/* Modal: escolher ponto de partida da rota (um cliente como base) */}
      <Modal
        visible={isPickingRouteStart}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPickingRouteStart(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.taskRulesCard, { maxHeight: '80%' }]}>
            <View style={styles.taskRulesHeader}>
              <Text style={styles.taskRulesTitle}>Partir de qual local?</Text>
              <TouchableOpacity
                style={styles.taskRulesClose}
                onPress={() => setIsPickingRouteStart(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.taskRulesCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.taskRulesIntro}>
              A rota vai começar deste ponto em vez da sua localização atual.
              Escolha um cliente/lead como ponto de partida.
            </Text>
            <TextInput
              style={styles.input}
              value={routeManualSearch}
              onChangeText={setRouteManualSearch}
              placeholder="Buscar por nome ou empresa..."
              placeholderTextColor="#94a3b8"
            />
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {(() => {
                const term = routeManualSearch
                  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
                const candidates = clients
                  .filter((c) => c.latitude != null && c.longitude != null)
                  .filter((c) => {
                    if (!term) return true;
                    const hay = `${c.nome ?? ''} ${c.empresa ?? ''} ${c.cidade ?? ''}`
                      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
                    return hay.includes(term);
                  })
                  .slice(0, 40);
                if (candidates.length === 0) {
                  return <Text style={styles.meetingsEmpty}>Nenhum cliente com localização encontrado.</Text>;
                }
                return candidates.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.routeStartPick}
                    onPress={() => {
                      setRouteStartOverride({
                        latitude: c.latitude as number,
                        longitude: c.longitude as number,
                        label: getClientPrimaryName(c),
                      });
                      setIsPickingRouteStart(false);
                      setRouteManualSearch('');
                    }}
                  >
                    <Text style={styles.routeStartPickName} numberOfLines={1}>{getClientPrimaryName(c)}</Text>
                    <Text style={styles.routeStartPickMeta} numberOfLines={1}>
                      {[c.cidade, c.estado].filter(Boolean).join(' • ') || 'Sem cidade'}
                    </Text>
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Regras de geração automática de tarefas */}
      <Modal
        visible={isTaskRulesOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsTaskRulesOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.taskRulesCard}>
            <View style={styles.taskRulesHeader}>
              <Text style={styles.taskRulesTitle}>Como as tarefas são geradas</Text>
              <TouchableOpacity
                style={styles.taskRulesClose}
                onPress={() => setIsTaskRulesOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.taskRulesCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.taskRulesIntro}>
              As tarefas são criadas automaticamente pelo sistema a partir do
              estado dos seus leads. Você não cria manualmente — só conclui ou
              dispensa.
              {'\n\n'}Ao concluir, você escolhe o destino do lead: avançar de
              etapa, mover para Perdido, ou manter na etapa atual.
              {'\n\n'}Regras ativas:
            </Text>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator>
              {TASK_RULES.map((rule) => (
                <View key={rule.code} style={styles.ruleCard}>
                  <Text style={styles.ruleTitle}>{rule.title}</Text>

                  <Text style={styles.ruleSectionLabel}>Quando é gerada</Text>
                  <Text style={styles.ruleText}>{rule.trigger}</Text>

                  <Text style={styles.ruleSectionLabel}>Níveis de urgência</Text>
                  {rule.levels.map((lvl) => (
                    <View key={lvl.badge} style={styles.ruleLevelRow}>
                      <View style={[styles.ruleLevelBadge, { backgroundColor: lvl.color }]}>
                        <Text style={styles.ruleLevelBadgeText}>{lvl.badge}</Text>
                      </View>
                      <Text style={styles.ruleLevelText}>{lvl.when}</Text>
                    </View>
                  ))}

                  <Text style={styles.ruleSectionLabel}>Como o tempo é contado</Text>
                  <Text style={styles.ruleText}>{rule.timing}</Text>

                  <Text style={styles.ruleSectionLabel}>O que impede a tarefa</Text>
                  <Text style={styles.ruleText}>{rule.suppress}</Text>

                  <Text style={styles.ruleSectionLabel}>Quando some sozinha</Text>
                  <Text style={styles.ruleText}>{rule.autoResolve}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.taskRulesDoneButton}
              onPress={() => setIsTaskRulesOpen(false)}
            >
              <Text style={styles.taskRulesDoneButtonText}>Entendi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: destino do lead ao concluir uma tarefa */}
      <Modal
        visible={completingTask !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setCompletingTask(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.taskRulesCard}>
            {completingTask && (() => {
              const { task, client } = completingTask;
              return (
                <>
                  <View style={styles.taskRulesHeader}>
                    <Text style={styles.taskRulesTitle}>Concluir "{task.title}"</Text>
                    <TouchableOpacity
                      style={styles.taskRulesClose}
                      onPress={() => setCompletingTask(null)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.taskRulesCloseText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.taskRulesIntro}>
                    {getClientPrimaryName(client)} — o que acontece com o lead depois de concluir?
                  </Text>
                  <TouchableOpacity
                    style={[styles.taskDoneOption, { backgroundColor: '#16a34a' }]}
                    onPress={() => {
                      setCompletingTask(null);
                      setChangingStageFor({ client, taskId: task.id });
                    }}
                  >
                    <Text style={styles.taskDoneOptionText}>➡️ Avançar etapa</Text>
                    <Text style={styles.taskDoneOptionHint}>
                      Move o lead pra próxima etapa do funil e conclui a tarefa.
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.taskDoneOption, { backgroundColor: '#ef4444' }]}
                    onPress={() => {
                      setCompletingTask(null);
                      setChangingStageFor({ client, initialStageId: LOST_STAGE_ID, taskId: task.id });
                    }}
                  >
                    <Text style={styles.taskDoneOptionText}>❌ Mover p/ Perdido</Text>
                    <Text style={styles.taskDoneOptionHint}>
                      Registra o motivo do perdido e conclui a tarefa.
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.taskDoneOption, { backgroundColor: '#2563eb' }]}
                    onPress={() => {
                      setCompletingTask(null);
                      resolveTask.mutate({ id: task.id, status: 'concluida' });
                    }}
                  >
                    <Text style={styles.taskDoneOptionText}>✔️ Manter na etapa</Text>
                    <Text style={styles.taskDoneOptionHint}>
                      Só conclui a tarefa; o lead segue na etapa e no fluxo automático.
                    </Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Modal: Configurações (filtro de área + redefinir senha + admin) */}
      <Modal
        visible={isPasswordModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsPasswordModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <View style={styles.passwordModalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Configurações</Text>
                  <TouchableOpacity onPress={() => setIsPasswordModalOpen(false)}>
                    <Text style={styles.closeButton}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Filtro de área */}
                <View style={styles.settingsRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.settingsLabel}>Mostrar só clientes da minha área</Text>
                    <Text style={styles.settingsHint}>
                      Filtra os pinos num raio de {AREA_RADIUS_KM} km do seu GPS.
                      Atualiza quando você abrir o app de novo.
                    </Text>
                  </View>
                  <Switch
                    value={showOnlyMyArea}
                    onValueChange={handleToggleArea}
                  />
                </View>

                <View style={styles.adminDivider} />
                <Text style={styles.adminSectionTitle}>Trocar senha</Text>
                <Text style={styles.passwordModalHint}>
                  Digite uma nova senha. Mínimo de 6 caracteres.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nova senha"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  editable={!isSavingPassword}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Confirmar nova senha"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!isSavingPassword}
                />
                <TouchableOpacity
                  style={[styles.submitButton, isSavingPassword && { opacity: 0.6 }]}
                  disabled={isSavingPassword}
                  onPress={async () => {
                    if (newPassword.length < 6) {
                      Alert.alert('Senha curta', 'A senha precisa ter pelo menos 6 caracteres.');
                      return;
                    }
                    if (newPassword !== confirmPassword) {
                      Alert.alert('Confirmação não confere', 'As duas senhas digitadas precisam ser iguais.');
                      return;
                    }
                    try {
                      setIsSavingPassword(true);
                      await updatePassword(newPassword);
                      setIsPasswordModalOpen(false);
                      setNewPassword('');
                      setConfirmPassword('');
                      Alert.alert('Pronto', 'Senha redefinida com sucesso.');
                    } catch (err: any) {
                      Alert.alert('Erro ao redefinir senha', err?.message ?? 'Erro desconhecido');
                    } finally {
                      setIsSavingPassword(false);
                    }
                  }}
                >
                  {isSavingPassword ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Salvar nova senha</Text>
                  )}
                </TouchableOpacity>

                {isAdmin && (
                  <>
                    <View style={styles.adminDivider} />
                    <Text style={styles.adminSectionTitle}>Admin</Text>
                    <Text style={styles.passwordModalHint}>
                      Dispara um reload imediato em todos os apps abertos
                      (puxa OTA novo do EAS antes). Use com cuidado — usuários
                      no meio de um cadastro perdem o que não foi salvo.
                    </Text>
                    <TouchableOpacity
                      style={styles.adminButton}
                      onPress={() => {
                        Alert.alert(
                          'Forçar reload de todos',
                          'Todos os apps abertos vão recarregar agora. Confirmar?',
                          [
                            { text: 'Cancelar', style: 'cancel' },
                            {
                              text: 'Sim, reload',
                              style: 'destructive',
                              onPress: async () => {
                                const { error: err } = await supabase
                                  .from('app_force_reload')
                                  .update({
                                    triggered_at: new Date().toISOString(),
                                    triggered_by: profile?.id ?? null,
                                    triggered_reason: 'manual-by-admin',
                                  })
                                  .eq('id', 1);
                                if (err) {
                                  Alert.alert('Erro', err.message);
                                  return;
                                }
                                Alert.alert('Pronto', 'Sinal enviado. Seu próprio app vai recarregar em alguns segundos.');
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={styles.adminButtonText}>🔄 Forçar reload de todos</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal de filtros: UF + etapa comercial. */}
      <Modal
        visible={isFiltersOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFiltersOpen(false)}
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop separado pra fechar ao tocar fora — assim o sheet
              em cima fica num View puro, sem Pressable competindo com o
              gesto de scroll do ScrollView dentro. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => { setIsPickingUf(false); setIsPickingStage(false); setIsPickingVendor(false); setIsFiltersOpen(false); }}
          />
          <View style={styles.filtersSheet}>
            {isPickingVendor ? (
              <>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => setIsPickingVendor(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.backButton}>‹ Voltar</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>Selecione o vendedor</Text>
                  <View style={{ width: 60 }} />
                </View>
                <ScrollView style={styles.ufPickerList} contentContainerStyle={{ paddingBottom: 12 }}>
                  <TouchableOpacity
                    style={styles.ufPickerRow}
                    onPress={() => { setVendorFilterHubspotId(null); setIsPickingVendor(false); }}
                  >
                    <Text style={[styles.ufPickerRowText, vendorFilterHubspotId === null && styles.ufPickerRowTextActive]}>Todos os vendedores</Text>
                    {vendorFilterHubspotId === null && <Text style={styles.ufPickerCheck}>✓</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ufPickerRow}
                    onPress={() => { setVendorFilterHubspotId('__none__'); setIsPickingVendor(false); }}
                  >
                    <Text style={[styles.ufPickerRowText, vendorFilterHubspotId === '__none__' && styles.ufPickerRowTextActive]}>Sem vendedor associado</Text>
                    {vendorFilterHubspotId === '__none__' && <Text style={styles.ufPickerCheck}>✓</Text>}
                  </TouchableOpacity>
                  {vendors.length === 0 && (
                    <Text style={[styles.passwordModalHint, { padding: 16 }]}>
                      Nenhum vendedor com id_hubspot cadastrado.
                    </Text>
                  )}
                  {vendors.map(v => {
                    const selected = vendorFilterHubspotId === v.id_hubspot;
                    const label = v.full_name?.trim() || v.email || `id ${v.id_hubspot}`;
                    return (
                      <TouchableOpacity
                        key={v.id_hubspot}
                        style={styles.ufPickerRow}
                        onPress={() => { setVendorFilterHubspotId(v.id_hubspot); setIsPickingVendor(false); }}
                      >
                        <Text style={[styles.ufPickerRowText, selected && styles.ufPickerRowTextActive]}>{label}</Text>
                        {selected && <Text style={styles.ufPickerCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : isPickingUf ? (
              <>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => setIsPickingUf(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.backButton}>‹ Voltar</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>Selecione o estado</Text>
                  <View style={{ width: 60 }} />
                </View>
                <ScrollView style={styles.ufPickerList} contentContainerStyle={{ paddingBottom: 12 }}>
                  <TouchableOpacity
                    style={styles.ufPickerRow}
                    onPress={() => { setStateFilter(null); setIsPickingUf(false); }}
                  >
                    <Text style={[styles.ufPickerRowText, !stateFilter && styles.ufPickerRowTextActive]}>Todos os estados</Text>
                    {!stateFilter && <Text style={styles.ufPickerCheck}>✓</Text>}
                  </TouchableOpacity>
                  {availableStates.map(uf => (
                    <TouchableOpacity
                      key={uf}
                      style={styles.ufPickerRow}
                      onPress={() => { setStateFilter(uf); setIsPickingUf(false); }}
                    >
                      <Text style={[styles.ufPickerRowText, stateFilter === uf && styles.ufPickerRowTextActive]}>{uf}</Text>
                      {stateFilter === uf && <Text style={styles.ufPickerCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : isPickingStage ? (
              <>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => setIsPickingStage(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.backButton}>‹ Voltar</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>Selecione a etapa</Text>
                  <View style={{ width: 60 }} />
                </View>
                <ScrollView style={styles.ufPickerList} contentContainerStyle={{ paddingBottom: 12 }}>
                  <TouchableOpacity
                    style={styles.ufPickerRow}
                    onPress={() => { setStageFilter(null); setIsPickingStage(false); }}
                  >
                    <Text style={[styles.ufPickerRowText, !stageFilter && styles.ufPickerRowTextActive]}>Todas as etapas</Text>
                    {!stageFilter && <Text style={styles.ufPickerCheck}>✓</Text>}
                  </TouchableOpacity>
                  {availableStages.map(stage => (
                    <TouchableOpacity
                      key={stage}
                      style={styles.ufPickerRow}
                      onPress={() => { setStageFilter(stage); setIsPickingStage(false); }}
                    >
                      <Text style={[styles.ufPickerRowText, stageFilter === stage && styles.ufPickerRowTextActive]}>{stage}</Text>
                      {stageFilter === stage && <Text style={styles.ufPickerCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Filtros</Text>
                  <TouchableOpacity onPress={() => setIsFiltersOpen(false)}>
                    <Text style={styles.closeButton}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={{ flexGrow: 0, flexShrink: 1 }}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                >
                <Text style={styles.adminSectionTitle}>Responsavel</Text>
                <Text style={styles.passwordModalHint}>
                  {isAdmin
                    ? 'Filtra por qualquer vendedor do time (admin).'
                    : 'Mostra somente os leads em que voce eh o responsavel.'}
                </Text>
                {isAdmin ? (
                  <TouchableOpacity
                    style={[
                      styles.dropdownButton,
                      vendorFilterHubspotId !== null && { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
                    ]}
                    onPress={() => setIsPickingVendor(true)}
                  >
                    <Text style={[
                      styles.dropdownButtonText,
                      vendorFilterHubspotId === null && { color: '#64748b' },
                    ]}>
                      {vendorLabel(vendorFilterHubspotId)}
                    </Text>
                    <Text style={styles.dropdownChevron}>▾</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.dropdownButton,
                      vendorFilterHubspotId !== null && { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
                    ]}
                    onPress={() => {
                      if (!myHubspotId) {
                        Alert.alert(
                          'Sem id HubSpot',
                          'Seu usuario nao tem id_hubspot configurado. Sem ele nao da pra identificar quais leads sao seus.',
                        );
                        return;
                      }
                      setVendorFilterHubspotId(prev => (prev === myHubspotId ? null : myHubspotId));
                    }}
                  >
                    <Text style={[
                      styles.dropdownButtonText,
                      vendorFilterHubspotId === null && { color: '#64748b' },
                    ]}>
                      {vendorFilterHubspotId === myHubspotId ? 'Somente meus leads' : 'Todos os leads visiveis'}
                    </Text>
                    <Text style={[
                      styles.dropdownChevron,
                      vendorFilterHubspotId === myHubspotId && { color: '#dc2626' },
                    ]}>{vendorFilterHubspotId === myHubspotId ? '✓' : '○'}</Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.adminSectionTitle, { marginTop: 18 }]}>Visita</Text>
                <Text style={styles.passwordModalHint}>
                  Filtra pelo timestamp da ultima visita (visited_at). Vale pra qualquer status.
                </Text>
                {(() => {
                  const renderChip = (v: string | null, label: string) => {
                    const selected = visitFilter === v;
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[
                          styles.filterChip,
                          selected && { backgroundColor: '#dc2626', borderColor: '#dc2626' },
                          !selected && { borderWidth: 1, borderColor: '#e2e8f0' },
                          { alignSelf: 'flex-start' },
                        ]}
                        onPress={() => setVisitFilter(v)}
                      >
                        <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  };
                  return (
                    <View style={{ marginTop: 4 }}>
                      {/* Primeira linha: opcoes "globais" — sem filtro e nunca visitado. */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {renderChip(null, 'Sem filtro')}
                        {renderChip('never', 'Nunca visitado')}
                      </View>

                      {/* Colunas: Visitados | Nao visitados */}
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Visitados
                          </Text>
                          <View style={{ gap: 6 }}>
                            {renderChip('visited', 'Visitado')}
                            {renderChip('visited:7', '< 7 dias')}
                            {renderChip('visited:30', '< 30 dias')}
                          </View>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Nao visitados
                          </Text>
                          <View style={{ gap: 6 }}>
                            {renderChip('not_visited:30', '> 30 dias')}
                            {renderChip('not_visited:60', '> 60 dias')}
                            {renderChip('not_visited:90', '> 90 dias')}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })()}

                <Text style={[styles.adminSectionTitle, { marginTop: 18 }]}>Estado</Text>
                <Text style={styles.passwordModalHint}>
                  Filtra os pinos pelo UF do endereco do cliente.
                </Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setIsPickingUf(true)}
                  disabled={availableStates.length === 0}
                >
                  <Text style={[styles.dropdownButtonText, !stateFilter && { color: '#64748b' }]}>
                    {stateFilter ?? (availableStates.length === 0 ? 'Sem estados disponiveis' : 'Todos os estados')}
                  </Text>
                  <Text style={styles.dropdownChevron}>▾</Text>
                </TouchableOpacity>

                <Text style={[styles.adminSectionTitle, { marginTop: 18 }]}>Etapa</Text>
                <Text style={styles.passwordModalHint}>
                  Filtra os leads pela etapa comercial sincronizada.
                </Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setIsPickingStage(true)}
                  disabled={availableStages.length === 0}
                >
                  <Text style={[styles.dropdownButtonText, !stageFilter && { color: '#64748b' }]}>
                    {stageFilter ?? (availableStages.length === 0 ? 'Sem etapas disponiveis' : 'Todas as etapas')}
                  </Text>
                  <Text style={styles.dropdownChevron}>▾</Text>
                </TouchableOpacity>
                </ScrollView>

                <View style={styles.filtersFooter}>
                  <TouchableOpacity
                    style={styles.filtersSecondaryButton}
                    onPress={() => { setSearchQuery(''); setStateFilter(null); setStageFilter(null); setVendorFilterHubspotId(null); setVisitFilter(null); }}
                    disabled={activeFilterCount === 0}
                  >
                    <Text style={[styles.filtersSecondaryButtonText, activeFilterCount === 0 && { opacity: 0.4 }]}>Limpar tudo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.submitButton, { flex: 1, marginTop: 0 }]} onPress={() => setIsFiltersOpen(false)}>
                    <Text style={styles.submitButtonText}>Aplicar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Picker de vendedor pra geracao de rota (so admin) */}
      <Modal
        visible={isPickingRouteVendor}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPickingRouteVendor(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsPickingRouteVendor(false)}>
          <Pressable style={styles.filtersSheet} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecione o vendedor</Text>
              <TouchableOpacity onPress={() => setIsPickingRouteVendor(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.ufPickerList} contentContainerStyle={{ paddingBottom: 12 }}>
              <TouchableOpacity
                style={styles.ufPickerRow}
                onPress={() => { setRouteVendorFilterHubspotId(null); setIsPickingRouteVendor(false); }}
              >
                <Text style={[styles.ufPickerRowText, routeVendorFilterHubspotId === null && styles.ufPickerRowTextActive]}>Todos os vendedores</Text>
                {routeVendorFilterHubspotId === null && <Text style={styles.ufPickerCheck}>✓</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ufPickerRow}
                onPress={() => { setRouteVendorFilterHubspotId('__none__'); setIsPickingRouteVendor(false); }}
              >
                <Text style={[styles.ufPickerRowText, routeVendorFilterHubspotId === '__none__' && styles.ufPickerRowTextActive]}>Sem vendedor associado</Text>
                {routeVendorFilterHubspotId === '__none__' && <Text style={styles.ufPickerCheck}>✓</Text>}
              </TouchableOpacity>
              {vendors.length === 0 && (
                <Text style={[styles.passwordModalHint, { padding: 16 }]}>
                  Nenhum vendedor com id_hubspot cadastrado.
                </Text>
              )}
              {vendors.map(v => {
                const selected = routeVendorFilterHubspotId === v.id_hubspot;
                const label = v.full_name?.trim() || v.email || `id ${v.id_hubspot}`;
                return (
                  <TouchableOpacity
                    key={v.id_hubspot}
                    style={styles.ufPickerRow}
                    onPress={() => { setRouteVendorFilterHubspotId(v.id_hubspot); setIsPickingRouteVendor(false); }}
                  >
                    <Text style={[styles.ufPickerRowText, selected && styles.ufPickerRowTextActive]}>{label}</Text>
                    {selected && <Text style={styles.ufPickerCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Outbound (sem localização) Modal */}
      {showOutboundForm && (
        <OutboundCadastroScreen
          profile={profile}
          onClose={() => setShowOutboundForm(false)}
        />
      )}

      {/* Schedule Meeting Modal */}
      {changingStageFor && (
        <ChangeStageModal
          client={changingStageFor.client}
          initialStageId={changingStageFor.initialStageId}
          onDone={
            changingStageFor.taskId
              ? () => resolveTask.mutate({ id: changingStageFor.taskId!, status: 'concluida' })
              : undefined
          }
          onClose={() => setChangingStageFor(null)}
        />
      )}

      {editingLocationFor && (
        <EditLocationModal
          client={editingLocationFor}
          onSave={(payload) => saveEditedLocation(editingLocationFor, payload)}
          onClose={() => setEditingLocationFor(null)}
        />
      )}

      {schedulingFor && (
        <ScheduleMeetingModal
          client={schedulingFor.client}
          meetingType={schedulingFor.type}
          rescheduleOf={schedulingFor.reschedule}
          onClose={() => setSchedulingFor(null)}
        />
      )}

      {/* CEP Step Modal */}
      {showCepStep && (
        <CEPStep
          onNext={(cepData) => {
            setForm(prev => ({
              ...prev,
              // Cadastro novo via CEP sempre comeca como "lead".
              status: 'lead' as ClientStatus,
              cep: cepData.cep || '',
              endereco: cepData.endereco || '',
              // Numero agora vem em campo proprio (nao concatenado no endereco).
              numero: cepData.numero || '',
              cidade: cepData.cidade || '',
              estado: cepData.estado || '',
              latitude: cepData.latitude?.toString() || '',
              longitude: cepData.longitude?.toString() || '',
            }));
            // Guarda se o geocoding ficou aproximado (centroide da rua) pra
            // persistir em geo_approximate no submit.
            setPendingGeoApproximate(cepData.geoApproximate ?? false);
            setShowCepStep(false);
            setIsFormOpen(true);
          }}
          onCancel={() => setShowCepStep(false)}
          onPickOnMap={startMapCreation}
        />
      )}

      {/* New Client Form Modal */}
      <Modal visible={isFormOpen} animationType="slide" transparent onRequestClose={() => setIsFormOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{editingClient ? 'Editar Cliente' : 'Novo Cadastro'}</Text>
                  <TouchableOpacity onPress={() => { setIsFormOpen(false); resetForm(); setEditingClient(null); }}>
                    <Text style={styles.closeButton}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
              {/* Status Selector — na criacao so libera 'lead' (cliente/churn
                  so existem via upgrade no fluxo de pos-venda). Na edicao,
                  bloqueia transitar de cliente/churn de volta pra lead —
                  espelho do trigger guard_client_status_transition no banco. */}
              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.statusSelector}>
                {statusOptions
                  .filter(opt => editingClient ? true : opt.value === 'lead')
                  .map(opt => {
                    const lockedFromClient = !!editingClient
                      && (editingClient.status === 'cliente' || editingClient.status === 'churn')
                      && opt.value === 'lead';
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        disabled={lockedFromClient}
                        style={[
                          styles.statusOption,
                          form.status === opt.value && { backgroundColor: opt.color, borderColor: opt.color },
                          lockedFromClient && { opacity: 0.35 },
                        ]}
                        onPress={() => setForm(s => ({ ...s, status: opt.value }))}
                      >
                        <Text style={[
                          styles.statusOptionText,
                          form.status === opt.value && { color: '#fff' },
                        ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
              {editingClient && (editingClient.status === 'cliente' || editingClient.status === 'churn') && (
                <Text style={{ fontSize: 12, color: '#dc2626', marginTop: -4, marginBottom: 6 }}>
                  Cliente atual / ex-cliente nao pode voltar pra "lead".
                </Text>
              )}

              <Text style={styles.fieldLabel}>Informações</Text>
              <TextInput
                style={styles.input}
                placeholder="Nome do restaurante *"
                placeholderTextColor="#94a3b8"
                value={form.empresa}
                onChangeText={v => setForm(s => ({ ...s, empresa: v }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Nome do contato *"
                placeholderTextColor="#94a3b8"
                value={form.nome}
                onChangeText={v => setForm(s => ({ ...s, nome: v }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Telefone"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={form.telefone}
                onChangeText={v => setForm(s => ({ ...s, telefone: v }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                value={form.email}
                onChangeText={v => setForm(s => ({ ...s, email: v }))}
              />

              <Text style={styles.fieldLabel}>Localização</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Cidade"
                  placeholderTextColor="#94a3b8"
                  value={form.cidade}
                  onChangeText={v => setForm(s => ({ ...s, cidade: v }))}
                />
                <TextInput
                  style={[styles.input, { width: 80, marginLeft: 8 }]}
                  placeholder="UF"
                  placeholderTextColor="#94a3b8"
                  maxLength={2}
                  autoCapitalize="characters"
                  value={form.estado}
                  onChangeText={v => setForm(s => ({ ...s, estado: v }))}
                />
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Endereço (rua)"
                  placeholderTextColor="#94a3b8"
                  value={form.endereco}
                  onChangeText={v => setForm(s => ({ ...s, endereco: v }))}
                />
                <TextInput
                  style={[styles.input, { width: 90, marginLeft: 8 }]}
                  placeholder="Número"
                  placeholderTextColor="#94a3b8"
                  keyboardType="default"
                  value={form.numero}
                  onChangeText={v => setForm(s => ({ ...s, numero: v }))}
                />
              </View>
              <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: -4, marginBottom: 8 }}>
                ⚠️ Confira o número — pode ter sido auto-preenchido pelo mapa e estar impreciso.
              </Text>

              <Text style={styles.fieldLabel}>Observações</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Anotações sobre este contato..."
                placeholderTextColor="#94a3b8"
                multiline
                value={form.observacoes}
                onChangeText={v => setForm(s => ({ ...s, observacoes: v }))}
              />

              {/* Location summary if filled by CEP/coords */}
              {(form.latitude || form.longitude) && (
                <View style={styles.locationSummary}>
                  <Text style={styles.locationSummaryText}>
                    📍 Localização definida ({form.latitude}, {form.longitude})
                  </Text>
                </View>
              )}

              <View style={{ height: 16 }} />
                </ScrollView>
                <TouchableOpacity
                  style={[styles.submitButton, (!form.nome.trim() || isSaving) && { opacity: 0.5 }]}
                  onPress={editingClient ? saveEditClient : submitClient}
                  disabled={!form.nome.trim() || isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ClientBottomSheet({
  client,
  insets,
  statusConfig,
  meetings,
  coordCollision,
  onClose,
  onDelete,
  onEdit,
  onEditLocation,
  onMarkVisited,
  onScheduleMeeting,
  onFollowUp,
  onChangeStage,
  onRescheduleMeeting,
  onCancelMeeting,
  isMarkingVisited,
  onAddToRoute,
  canWriteNotes = true,
  onSavePhone,
}: {
  client: Client;
  insets: { bottom: number };
  statusConfig: Record<string, { label: string; color: string }>;
  meetings: ClientMeeting[];
  coordCollision: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onEditLocation?: () => void;
  onMarkVisited?: () => void;
  onScheduleMeeting?: () => void;
  onFollowUp?: () => void;
  onChangeStage?: () => void;
  onRescheduleMeeting?: (m: ClientMeeting) => void;
  onCancelMeeting?: (m: ClientMeeting) => void;
  isMarkingVisited: boolean;
  onAddToRoute?: () => void;
  canWriteNotes?: boolean;
  onSavePhone?: (telefone: string) => Promise<void>;
}) {
  const statusColor = statusConfig[client.status]?.color || '#3b82f6';
  const statusLabel = statusConfig[client.status]?.label || client.status;
  const primaryName = getClientPrimaryName(client);
  const { user } = useAuth();

  // Separa reuniões de follow ups (linhas antigas sem type = 'reuniao').
  const sortByDate = (a: ClientMeeting, b: ClientMeeting) =>
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  const reunioes = meetings.filter(m => (m.type ?? 'reuniao') === 'reuniao').slice().sort(sortByDate);
  const followUps = meetings.filter(m => m.type === 'follow_up').slice().sort(sortByDate);

  // Chip visual de um agendamento (reunião ou follow up). O emoji distingue.
  const renderMeetingChip = (m: ClientMeeting, emoji: string) => {
    const d = new Date(m.scheduled_at);
    const isPast = d.getTime() < Date.now();
    const label = d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const durationLabel =
      m.duration_minutes >= 60
        ? `${Math.floor(m.duration_minutes / 60)}h${m.duration_minutes % 60 ? ` ${m.duration_minutes % 60}min` : ''}`
        : `${m.duration_minutes} min`;
    return (
      <View key={m.id} style={[styles.meetingChip, isPast && { opacity: 0.55 }]}>
        <Text style={styles.meetingChipDate}>{emoji} {label} • {durationLabel}{isPast ? ' (passada)' : ''}</Text>
        {m.observacoes ? (
          <Text style={styles.meetingChipObs} numberOfLines={2}>{m.observacoes}</Text>
        ) : null}
        {!isPast && (onRescheduleMeeting || onCancelMeeting) && (
          <View style={styles.meetingChipActions}>
            {onRescheduleMeeting && (
              <TouchableOpacity
                style={[styles.smallActionButton, { backgroundColor: '#f97316' }]}
                onPress={() => onRescheduleMeeting(m)}
              >
                <Text style={[styles.smallActionButtonText, { color: '#fff' }]}>Reagendar</Text>
              </TouchableOpacity>
            )}
            {onCancelMeeting && (
              <TouchableOpacity
                style={[styles.smallActionButton, { backgroundColor: '#dc2626' }]}
                onPress={() => onCancelMeeting(m)}
              >
                <Text style={[styles.smallActionButtonText, { color: '#fff' }]}>Cancelar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };
  const { notes, addNote, updateNote, deleteNote } = useClientNotes(client.id);
  const { changes: stageChanges } = useClientStageChanges(client.id);
  const { visits } = useClientVisits(client.id);
  // Historico e' a fonte preferida; visit_count cobre o intervalo em que a
  // tabela ainda nao existe, e visited_at cobre leads visitados antes dela.
  const visitCount = visits.length || client.visit_count || (client.visited_at ? 1 : 0);
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  // Telefone editavel inline (sem abrir o form completo). Draft local; o
  // botao Salvar so aparece quando o valor difere do salvo.
  const [phoneDraft, setPhoneDraft] = useState(client.telefone ?? '');
  const [savingPhone, setSavingPhone] = useState(false);
  const phoneDirty = phoneDraft.trim() !== (client.telefone ?? '');
  const handleSavePhone = async () => {
    if (!onSavePhone || savingPhone) return;
    setSavingPhone(true);
    try {
      await onSavePhone(phoneDraft.trim());
      Keyboard.dismiss();
    } catch (err: any) {
      Alert.alert('Erro ao salvar telefone', err?.message ?? 'Tente novamente.');
    } finally {
      setSavingPhone(false);
    }
  };

  // "Agendar reuniao" so aparece de Conversa com decisor (ex-Diagnóstico) em
  // diante no funil — antes disso a cadencia ainda nao chegou na demo. O id e'
  // fixo; o label vem do get_stages (com fallback no STAGES hardcoded pra
  // labels antigos tipo 'Diagnóstico' em registros ainda nao sincronizados).
  const { stages: pipelineStages } = useStages(true);
  const currentStageId = client.etapa
    ? (pipelineStages.find((s) => s.label === client.etapa)?.id
        ?? STAGES.find((s) => s.label === client.etapa)?.id
        ?? null)
    : null;
  const stageIdx = currentStageId ? FUNNEL_STAGE_IDS.indexOf(currentStageId) : -1;
  const canScheduleMeeting = stageIdx >= FUNNEL_STAGE_IDS.indexOf(DECISOR_STAGE_ID);

  // Timeline unificada: notas + mudancas de etapa + reunioes/follow-ups +
  // visita (check-in), mais recentes primeiro. Cada entrada carrega kind pra
  // UI decidir como renderizar (notas tem editar/apagar; o resto e' read-only).
  type TimelineEntry =
    | { kind: 'note'; createdAt: string; note: typeof notes[number] }
    | { kind: 'stage'; createdAt: string; change: typeof stageChanges[number] }
    | { kind: 'meeting'; createdAt: string; meeting: ClientMeeting }
    | { kind: 'visit'; createdAt: string; visitNumber?: number; visitedByName?: string | null };
  const timeline: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [
      ...notes.map((n) => ({ kind: 'note' as const, createdAt: n.created_at, note: n })),
      ...stageChanges.map((c) => ({ kind: 'stage' as const, createdAt: c.created_at, change: c })),
      // Reunioes e follow-ups entram pela data agendada (scheduled_at).
      ...meetings.map((m) => ({ kind: 'meeting' as const, createdAt: m.scheduled_at, meeting: m })),
    ];
    // Visitas (check-ins) — uma entrada por visita do historico, numeradas na
    // ordem cronologica (1a visita, 2a visita...). Fallback pro visited_at do
    // lead enquanto a tabela client_visits nao existir/carregar.
    if (visits.length > 0) {
      const asc = [...visits].sort(
        (a, b) => new Date(a.visited_at).getTime() - new Date(b.visited_at).getTime(),
      );
      asc.forEach((v, i) => {
        entries.push({
          kind: 'visit' as const,
          createdAt: v.visited_at,
          visitNumber: i + 1,
          visitedByName: v.visited_by_name,
        });
      });
    } else if (client.visited_at) {
      entries.push({ kind: 'visit' as const, createdAt: client.visited_at });
    }
    return entries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [notes, stageChanges, meetings, client.visited_at, visits]);

  const approxReasons: string[] = [];
  if (!client.numero) approxReasons.push('Endereço sem número');
  if (client.geo_source === 'hubspot' || client.geo_source === 'coords') {
    approxReasons.push('Posicionado pela latitude/longitude (sem geocodificação por endereço)');
  }
  // Coordenadas idênticas a outro cliente são, na prática, garantia de erro de
  // geocodificação (provável centroide de rua/CEP). Rebaixamos pra aproximada
  // mesmo se o registro diz nominatim+numero.
  if (coordCollision) {
    approxReasons.push('Outro(s) cliente(s) no mesmo ponto — provável falha de geocodificação');
  }
  // Respeita o flag de aproximado vindo do banco (webhook/repair), caso ele
  // tenha sido marcado por motivo que a UI não consegue inferir sozinha.
  if (client.geo_approximate === true && approxReasons.length === 0) {
    approxReasons.push('Marcado como aproximado pela origem do dado');
  }
  const isApprox = approxReasons.length > 0;

  const sourceLabel =
    client.geo_source === 'nominatim'
      ? 'Geocodificado pelo endereço'
      : client.geo_source === 'hubspot'
      ? 'Latitude/longitude vindas do HubSpot'
      : client.geo_source === 'coords'
      ? 'Latitude/longitude informadas manualmente'
      : 'Origem da localização não identificada';

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('pt-BR');
  };
  const createdAt = formatDate(client.created_at);
  const updatedAt = formatDate(client.updated_at);

  // ── Uso do produto (HubSpot, 1x por semana) ───────────────────────────────
  // Só existe pra quem o sync alcança: os deals nas etapas de Acompanhamento /
  // Saudável (Onboarding e Sucesso). Esse é o recorte de "cliente de verdade",
  // e é o que responde em campo "é cliente, mas será que usa?".
  const uso = useMemo(() => {
    if (!client.hs_uso_sincronizado_em) return null;

    // 'YYYY-MM-DD' com new Date() vira meia-noite UTC e, em BRT, exibe o dia
    // ANTERIOR. Monta na data local pra bater com o que o HubSpot mostra.
    const parseDia = (s: string | null) => {
      if (!s) return null;
      const [a, m, d] = s.split('-').map(Number);
      if (!a || !m || !d) return null;
      const dt = new Date(a, m - 1, d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };
    const diasAte = (dt: Date) => {
      const hoje = new Date();
      const zera = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      return Math.round((zera(hoje) - zera(dt)) / 86_400_000);
    };
    const label = (dt: Date) => dt.toLocaleDateString('pt-BR');
    const haQuanto = (dias: number) =>
      dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;

    const comanda = parseDia(client.hs_ultima_comanda_em);
    const dias = comanda ? diasAte(comanda) : null;
    const cancelamento = parseDia(client.hs_cancelamento_solicitado_em);

    const VERMELHO = { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c', sub: '#dc2626' };
    const AMBAR = { bg: '#fffbeb', border: '#fde68a', fg: '#b45309', sub: '#d97706' };
    const VERDE = { bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d', sub: '#16a34a' };

    // Ex-cliente é quem está na etapa de Churn no HubSpot — NÃO quem tem data
    // de cancelamento. A data registra que houve um pedido: há clientes com
    // pedido de meses atrás que foram retidos e emitem comanda até hoje (56 na
    // primeira sincronização, o mais antigo de janeiro). Tratá-los como saída
    // pintaria de vermelho cliente saudável.
    const saiu = client.hs_situacao === 'churn';

    // Fora do churn, a cor é a recência da última comanda — e nenhuma comanda
    // é o pior caso, não ausência de informação.
    const tom = saiu
      ? VERMELHO
      : dias === null || dias > 30
      ? VERMELHO
      : dias > 7
      ? AMBAR
      : VERDE;

    const sincronizado = new Date(client.hs_uso_sincronizado_em);
    const horas = Math.floor((Date.now() - sincronizado.getTime()) / 3_600_000);
    const sincLabel =
      Number.isNaN(sincronizado.getTime())
        ? null
        : horas < 1
        ? 'agora há pouco'
        : horas < 24
        ? `há ${horas}h`
        : `há ${Math.floor(horas / 24)} dia(s)`;

    const linhaComanda = comanda
      ? `🧾 Última comanda: ${label(comanda)} • ${haQuanto(dias!)}`
      : '🧾 Nenhuma comanda emitida';

    // Quantas comandas já saíram. A data diz QUANDO parou, o total diz QUANTO
    // usou — é o que separa "nunca engrenou" de "usava muito e parou".
    // Zero é omitido: nesse caso a própria linha de comanda já diz "nenhuma".
    const qtd = client.hs_qtd_comandas;
    const linhaQtd =
      qtd && qtd > 0
        ? `${qtd.toLocaleString('pt-BR')} ${qtd === 1 ? 'comanda emitida' : 'comandas emitidas'}`
        : null;

    // Ex-cliente: a manchete é QUANDO pediu pra sair, e a última comanda vira
    // detalhe (até quando usaram). Cliente ativo com pedido antigo: manchete
    // continua sendo o uso, e o pedido desce pra aviso.
    const linhas = [
      saiu ? linhaComanda : null,
      linhaQtd,
      !saiu && cancelamento ? `⚠️ Pediu cancelamento em ${label(cancelamento)}` : null,
    ].filter(Boolean) as string[];

    return {
      tom,
      titulo: saiu
        ? cancelamento
          ? `⚠️ Cancelamento solicitado em ${label(cancelamento)}`
          : '⚠️ Ex-cliente (Churn no HubSpot)'
        : linhaComanda,
      linhas,
      // Sync parado é visível: o dado some de "hoje" e vira "há N dias".
      rodape: sincLabel ? `Dados do HubSpot • atualizado ${sincLabel}` : null,
    };
  }, [
    client.hs_uso_sincronizado_em,
    client.hs_ultima_comanda_em,
    client.hs_cancelamento_solicitado_em,
    client.hs_situacao,
    client.hs_qtd_comandas,
  ]);

  // Gesture pra arrastar a aba pra baixo e fechar.
  // Threshold: 100px de drag aciona o fechamento.
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 2 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        translateY.setValue(0);
      },
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.4) {
          Animated.timing(translateY, {
            toValue: 800,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal visible={true} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.bottomSheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.bottomSheet, { transform: [{ translateY }] }]}>
          <View style={styles.dragHandleArea} {...panResponder.panHandlers}>
            <View style={styles.bottomSheetHandle} />
          </View>
          <ScrollView
            style={styles.bottomSheetContent}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.bsHeader}>
              <View style={[styles.bsLogoWrap, { backgroundColor: statusColor }]}>
                <Image source={require('./assets/icon.png')} style={styles.bsLogo} />
              </View>
              <View style={styles.bsHeaderInfo}>
                <Text style={styles.clientDetailsName}>{primaryName}</Text>
                {client.empresa?.trim() && client.nome && client.nome !== client.empresa && (
                  <Text style={styles.bsContactSubtitle} numberOfLines={1}>Contato: {client.nome}</Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.statusBadgeLarge, { backgroundColor: statusColor }]}>
                    <Text style={styles.statusBadgeText}>
                      {statusLabel}
                    </Text>
                  </View>
                  {isApprox && (
                    <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, color: '#92400e', fontWeight: '600' }}>≈ Aprox.</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Uso do produto (HubSpot). Vem antes das visitas de proposito:
                pra cliente/ex-cliente, "usa ou nao usa" e' a primeira coisa
                que o vendedor precisa ver ao abrir o pin. */}
            {uso && (
              <View
                style={[
                  styles.usoBox,
                  { backgroundColor: uso.tom.bg, borderColor: uso.tom.border },
                ]}
              >
                <Text style={[styles.usoTitulo, { color: uso.tom.fg }]}>{uso.titulo}</Text>
                {uso.linhas.map((linha) => (
                  <Text key={linha} style={[styles.usoDetalhe, { color: uso.tom.sub }]}>
                    {linha}
                  </Text>
                ))}
                {uso.rodape && (
                  <Text style={[styles.usoRodape, { color: uso.tom.sub }]}>{uso.rodape}</Text>
                )}
              </View>
            )}

            {/* Contador de visitas: o lead pode ser visitado varias vezes; o
                numero vem do historico (client_visits) com fallback pro
                visit_count do proprio lead. */}
            {visitCount > 0 && (
              <View style={styles.visitCountBox}>
                <Text style={styles.visitCountText}>
                  📍 {visitCount} {visitCount === 1 ? 'visita realizada' : 'visitas realizadas'}
                </Text>
                {client.visited_at ? (
                  <Text style={styles.visitCountHint}>
                    Última: {new Date(client.visited_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                ) : null}
              </View>
            )}

            {/* Acoes rapidas no topo: visita (acao mais usada em campo) e
                editar — antes ficavam no fim do sheet, exigindo rolar tudo. */}
            {(onMarkVisited || onEdit) && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {onMarkVisited && (
                  <TouchableOpacity
                    disabled={isMarkingVisited}
                    style={{
                      flex: 1,
                      backgroundColor: isMarkingVisited ? '#94d4a8' : '#16a34a',
                      borderRadius: 10,
                      paddingVertical: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={onMarkVisited}
                  >
                    {isMarkingVisited ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                        {client.visited_at ? '🔁 Re-marcar visita' : '✅ Marcar como visitado'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                {onEdit && (
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 18,
                      backgroundColor: '#2563eb',
                      borderRadius: 10,
                      paddingVertical: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={onEdit}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>✏️ Editar</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Geo quality indicator */}
            <View style={{ backgroundColor: isApprox ? '#fefce8' : '#f0fdf4', borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: 'row', gap: 8 }}>
              <Text style={{ fontSize: 14 }}>{isApprox ? '⚠️' : '✅'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: isApprox ? '#92400e' : '#166534', fontWeight: '700' }}>
                  {isApprox ? 'Localização aproximada' : 'Localização precisa'}
                </Text>
                <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sourceLabel}</Text>
                {isApprox && approxReasons.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    {approxReasons.map((reason, idx) => (
                      <Text key={idx} style={{ fontSize: 11, color: '#92400e' }}>• {reason}</Text>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Info Grid */}
            <View style={styles.infoGrid}>
              {client.empresa && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>🏢</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Empresa</Text>
                    <Text style={styles.detailValue}>{client.empresa}</Text>
                  </View>
                </View>
              )}
              {/* Telefone: editavel direto aqui (sem abrir o form completo).
                  O Salvar so aparece quando o valor muda; grava via
                  updateClient (mesmo fluxo do form — sincroniza HubSpot). */}
              {onSavePhone ? (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>📞</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Telefone</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <TextInput
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: phoneDirty ? '#2563eb' : '#e2e8f0',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          fontSize: 14,
                          color: '#0f172a',
                          backgroundColor: '#f8fafc',
                        }}
                        value={phoneDraft}
                        onChangeText={setPhoneDraft}
                        placeholder="(00) 00000-0000"
                        placeholderTextColor="#94a3b8"
                        keyboardType="phone-pad"
                        editable={!savingPhone}
                      />
                      {phoneDirty && (
                        <TouchableOpacity
                          onPress={handleSavePhone}
                          disabled={savingPhone}
                          style={{
                            backgroundColor: '#16a34a',
                            borderRadius: 8,
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                          }}
                        >
                          {savingPhone ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Salvar</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              ) : client.telefone ? (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>📞</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Telefone</Text>
                    <Text style={styles.detailValue}>{client.telefone}</Text>
                  </View>
                </View>
              ) : null}
              {client.email && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>✉️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Email</Text>
                    <Text style={styles.detailValue}>{client.email}</Text>
                  </View>
                </View>
              )}
              <View style={styles.infoItem}>
                <Text style={styles.infoIcon}>🏠</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailLabel}>Endereço</Text>
                  <Text style={styles.detailValue}>
                    {client.endereco || 'Não informado'}
                    {client.numero ? `, ${client.numero}` : (client.endereco ? ' (sem número)' : '')}
                  </Text>
                </View>
              </View>
              {client.bairro && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>🏘️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Bairro</Text>
                    <Text style={styles.detailValue}>{client.bairro}</Text>
                  </View>
                </View>
              )}
              {(client.cidade || client.estado) && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Cidade / UF</Text>
                    <Text style={styles.detailValue}>
                      {client.cidade || ''}{client.estado ? ` • ${client.estado}` : ''}
                    </Text>
                  </View>
                </View>
              )}
              {client.cep && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>📮</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>CEP</Text>
                    <Text style={styles.detailValue}>{client.cep}</Text>
                  </View>
                </View>
              )}
              {client.latitude !== null && client.longitude !== null && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>🧭</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Coordenadas</Text>
                    <Text style={styles.detailValue}>
                      {Number(client.latitude).toFixed(6)}, {Number(client.longitude).toFixed(6)}
                    </Text>
                  </View>
                </View>
              )}
              {client.etapa && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>↪</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Etapa</Text>
                    <Text style={styles.detailValue}>{client.etapa}</Text>
                  </View>
                </View>
              )}
              {client.id_hubspot && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>🆔</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>ID HubSpot</Text>
                    <Text style={styles.detailValue}>{client.id_hubspot}</Text>
                  </View>
                </View>
              )}
              {(createdAt || updatedAt) && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>🕒</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Criado / atualizado</Text>
                    <Text style={styles.detailValue}>
                      {createdAt ?? '—'}{updatedAt && updatedAt !== createdAt ? ` → ${updatedAt}` : ''}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {client.url_hubspot && (
              <TouchableOpacity
                style={{ backgroundColor: '#ff7a59', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 12 }}
                onPress={() => Linking.openURL(client.url_hubspot!).catch(() => Alert.alert('Erro', 'Não foi possível abrir o link.'))}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Abrir no HubSpot ↗</Text>
              </TouchableOpacity>
            )}

            {client.observacoes && (
              <View style={styles.observationsSection}>
                <Text style={styles.detailLabel}>Observação principal</Text>
                <Text style={styles.detailValue}>{client.observacoes}</Text>
              </View>
            )}

            {/* Timeline unificada: notas de campo + mudancas de etapa, em
                ordem cronologica (mais recentes em cima). Mudancas de etapa
                sao imutaveis; notas mantem editar/apagar pro autor. */}
            <View style={styles.notesSection}>
              <Text style={styles.fieldLabel}>
                Histórico{timeline.length > 0 ? ` (${timeline.length})` : ''}
              </Text>
              {timeline.length === 0 ? (
                <Text style={styles.meetingsEmpty}>Nenhum registro ainda.</Text>
              ) : (
                timeline.map((entry) => {
                  const when = new Date(entry.createdAt).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  });
                  if (entry.kind === 'stage') {
                    const change = entry.change;
                    const authorLabel =
                      change.created_by_name || change.created_by_email || 'Autor desconhecido';
                    const arrow = change.from_stage
                      ? `${change.from_stage} → ${change.to_stage}`
                      : `→ ${change.to_stage}`;
                    return (
                      <View key={`stage-${change.id}`} style={styles.noteItem}>
                        <View style={styles.noteHeaderRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.noteAuthor} numberOfLines={1}>
                              🔄 {authorLabel}
                            </Text>
                            <Text style={styles.noteDate}>{when}</Text>
                          </View>
                        </View>
                        <Text style={[styles.noteBody, { fontWeight: '600' }]}>
                          Moveu etapa: {arrow}
                        </Text>
                      </View>
                    );
                  }
                  if (entry.kind === 'meeting') {
                    const m = entry.meeting;
                    const isFollowUp = m.type === 'follow_up';
                    const isPast = new Date(m.scheduled_at).getTime() < Date.now();
                    return (
                      <View key={`meeting-${m.id}`} style={styles.noteItem}>
                        <View style={styles.noteHeaderRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.noteAuthor} numberOfLines={1}>
                              {isFollowUp ? '🔁 Follow up' : '📅 Reunião/demo'}
                              {isPast ? ' (realizada/passada)' : ' (agendada)'}
                            </Text>
                            <Text style={styles.noteDate}>{when}</Text>
                          </View>
                        </View>
                        {m.observacoes ? (
                          <Text style={styles.noteBody}>{m.observacoes}</Text>
                        ) : null}
                      </View>
                    );
                  }
                  if (entry.kind === 'visit') {
                    return (
                      <View key={`visit-${entry.createdAt}`} style={styles.noteItem}>
                        <View style={styles.noteHeaderRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.noteAuthor} numberOfLines={1}>
                              📍 Check-in de visita
                              {entry.visitNumber ? ` — ${entry.visitNumber}ª` : ''}
                            </Text>
                            <Text style={styles.noteDate}>
                              {when}{entry.visitedByName ? ` • ${entry.visitedByName}` : ''}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.noteBody, { fontWeight: '600' }]}>
                          Cliente visitado no local
                        </Text>
                      </View>
                    );
                  }
                  const note = entry.note;
                  const isMine = !!user?.id && note.created_by === user.id;
                  const isEditing = editingNoteId === note.id;
                  const wasEdited = new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 2000;
                  const authorLabel = note.created_by_name || note.created_by_email || 'Autor desconhecido';
                  return (
                    <View key={`note-${note.id}`} style={styles.noteItem}>
                      <View style={styles.noteHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.noteAuthor} numberOfLines={1}>👤 {authorLabel}</Text>
                          <Text style={styles.noteDate}>
                            {when}{wasEdited ? ' • editado' : ''}
                          </Text>
                        </View>
                        {canWriteNotes && isMine && !isEditing && (
                          <View style={styles.noteActions}>
                            <TouchableOpacity
                              onPress={() => { setEditingNoteId(note.id); setEditingBody(note.body); }}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Text style={styles.noteAction}>Editar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                Alert.alert(
                                  'Remover nota',
                                  'Apagar essa nota? Nao pode ser desfeito.',
                                  [
                                    { text: 'Cancelar', style: 'cancel' },
                                    {
                                      text: 'Apagar',
                                      style: 'destructive',
                                      onPress: () => deleteNote.mutate(note.id, {
                                        onError: (err: any) => Alert.alert('Erro', err?.message ?? 'Falhou'),
                                      }),
                                    },
                                  ],
                                );
                              }}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Text style={[styles.noteAction, { color: '#dc2626' }]}>Apagar</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      {isEditing ? (
                        <>
                          <TextInput
                            style={[styles.input, { marginTop: 8, marginBottom: 0, minHeight: 60 }]}
                            value={editingBody}
                            onChangeText={setEditingBody}
                            multiline
                            autoFocus
                            editable={!updateNote.isPending}
                          />
                          <View style={styles.noteEditActions}>
                            <TouchableOpacity
                              style={styles.noteEditCancel}
                              onPress={() => { setEditingNoteId(null); setEditingBody(''); }}
                              disabled={updateNote.isPending}
                            >
                              <Text style={styles.noteEditCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.noteEditSave, (!editingBody.trim() || updateNote.isPending) && { opacity: 0.5 }]}
                              disabled={!editingBody.trim() || updateNote.isPending}
                              onPress={() => {
                                updateNote.mutate({ id: note.id, body: editingBody }, {
                                  onSuccess: () => { setEditingNoteId(null); setEditingBody(''); },
                                  onError: (err: any) => Alert.alert('Erro', err?.message ?? 'Falhou'),
                                });
                              }}
                            >
                              {updateNote.isPending ? (
                                <ActivityIndicator color="#fff" />
                              ) : (
                                <Text style={styles.noteEditSaveText}>Salvar</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : (
                        <Text style={styles.noteBody}>{note.body}</Text>
                      )}
                    </View>
                  );
                })
              )}
              {canWriteNotes && (
                <>
                  <TextInput
                    style={[styles.input, { marginTop: 8, minHeight: 64 }]}
                    placeholder="Adicionar nova nota..."
                    placeholderTextColor="#94a3b8"
                    value={newNote}
                    onChangeText={setNewNote}
                    multiline
                    editable={!addNote.isPending}
                  />
                  <TouchableOpacity
                    style={[styles.submitButton, (!newNote.trim() || addNote.isPending) && { opacity: 0.5 }]}
                    disabled={!newNote.trim() || addNote.isPending}
                    onPress={() => {
                      addNote.mutate(newNote, {
                        onSuccess: () => setNewNote(''),
                        onError: (err: any) => {
                          const msg = /relation .* does not exist/i.test(err?.message ?? '')
                            ? 'A tabela client_notes ainda nao foi criada no Supabase. Aplique a migration 20260617_client_notes.sql.'
                            : (err?.message ?? 'Falhou ao salvar nota');
                          Alert.alert('Erro', msg);
                        },
                      });
                    }}
                  >
                    {addNote.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.submitButtonText}>Adicionar nota</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {onAddToRoute && (
              <TouchableOpacity
                style={styles.addRouteButton}
                onPress={onAddToRoute}
              >
                <Text style={styles.addRouteButtonText}>Adicionar a rota de hoje</Text>
              </TouchableOpacity>
            )}

            {/* Navigation */}
            <View style={styles.navigationSection}>
              <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Traçar Rota</Text>
              {client.latitude && client.longitude && (
                <View style={[styles.navigationRow, { marginBottom: 8 }]}>
                  <TouchableOpacity
                    style={[styles.navRouteButton, styles.navButtonDriving]}
                    onPress={() => {
                      openNavigation({ latitude: client.latitude as number, longitude: client.longitude as number, clientName: primaryName, travelMode: 'driving' });
                      onClose();
                    }}
                  >
                    <Text style={styles.navRouteButtonText}>🚗 Carro</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.navRouteButton, styles.navButtonWalking]}
                    onPress={() => {
                      openNavigation({ latitude: client.latitude as number, longitude: client.longitude as number, clientName: primaryName, travelMode: 'walking' });
                      onClose();
                    }}
                  >
                    <Text style={styles.navRouteButtonText}>🚶 A pé</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                style={{ backgroundColor: '#4285f4', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => {
                  const addressParts = [client.endereco, client.numero, client.bairro, client.cidade, client.estado, client.cep]
                    .filter(Boolean)
                    .join(', ');
                  const query = addressParts ? `${addressParts}, Brasil` : primaryName;
                  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                  Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o Google Maps.'));
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>🗺️ Abrir no Google Maps</Text>
              </TouchableOpacity>
              {(() => {
                const waNum = toWhatsappNumber(client.telefone);
                return (
                  <TouchableOpacity
                    style={{
                      backgroundColor: waNum ? '#25d366' : '#cbd5e1',
                      borderRadius: 10,
                      paddingVertical: 12,
                      alignItems: 'center',
                      marginTop: 8,
                    }}
                    disabled={!waNum}
                    onPress={() => openWhatsapp(client.telefone)}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                      {waNum ? '💬 Abrir WhatsApp' : '💬 WhatsApp (sem telefone)'}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>

            {/* Reuniões agendadas */}
            <View style={styles.meetingsSection}>
              <View style={styles.meetingsHeader}>
                <Text style={styles.fieldLabel}>
                  Reuniões{reunioes.length > 0 ? ` (${reunioes.length})` : ''}
                </Text>
              </View>
              {reunioes.length === 0 ? (
                <Text style={styles.meetingsEmpty}>Nenhuma reunião agendada.</Text>
              ) : (
                reunioes.map((m) => renderMeetingChip(m, '📅'))
              )}
              {/* Agendar reuniao: so de "Conversa com decisor" em diante no
                  funil — antes disso a cadencia ainda nao pede demo. */}
              {onScheduleMeeting && canScheduleMeeting && (
                <TouchableOpacity
                  style={styles.scheduleButton}
                  onPress={onScheduleMeeting}
                >
                  <Text style={styles.scheduleButtonText}>📅 Agendar reunião</Text>
                </TouchableOpacity>
              )}
              {onScheduleMeeting && !canScheduleMeeting && (
                <Text style={[styles.meetingsEmpty, { fontStyle: 'italic' }]}>
                  Agendamento libera na etapa "Conversa com decisor".
                </Text>
              )}
            </View>

            {/* Follow ups — mesma mecânica de reunião, organização separada */}
            <View style={styles.meetingsSection}>
              <View style={styles.meetingsHeader}>
                <Text style={styles.fieldLabel}>
                  Follow ups{followUps.length > 0 ? ` (${followUps.length})` : ''}
                </Text>
              </View>
              {followUps.length === 0 ? (
                <Text style={styles.meetingsEmpty}>Nenhum follow up marcado.</Text>
              ) : (
                followUps.map((m) => renderMeetingChip(m, '🔁'))
              )}
              {onFollowUp && (
                <TouchableOpacity
                  style={styles.followUpButton}
                  onPress={onFollowUp}
                >
                  <Text style={styles.followUpButtonText}>🔁 Marcar Follow Up</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Mover para etapa: admin-only durante testes. Dispara webhook change_stage.
                Se o cliente não tiver id_hubspot, o modal alerta. */}
            {onChangeStage && (
              <TouchableOpacity
                style={styles.changeStageButton}
                onPress={onChangeStage}
              >
                <Text style={styles.changeStageButtonText}>🔄 Mover para etapa</Text>
              </TouchableOpacity>
            )}

            {/* Marcar como visitado + Editar migraram pro TOPO do sheet
                (acoes mais usadas em campo — sem precisar rolar ate aqui). */}

            {/* Actions */}
            {onEditLocation && (
              <TouchableOpacity
                style={{ paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#0f172a', marginBottom: 8, flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                onPress={onEditLocation}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>📍 Editar localização (mover pin)</Text>
              </TouchableOpacity>
            )}
            {onDelete && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
                  <Text style={styles.deleteButtonText}>Remover</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MainApp />
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// ===== Estilos do modo Navegacao =====
// Separados dos styles globais pra ficar facil ajustar sem mexer no resto.
const navStyles = StyleSheet.create({
  // Seta do GPS estilo Google Maps: triangulo grande azul forte com
  // contorno branco, alem de uma bolinha base no GPS exato.
  // - userArrowOutline: triangulo branco maior (atras) — funciona como
  //   contorno destacando contra qualquer fundo do mapa
  // - userArrowFill: triangulo azul forte (na frente) — a "seta" em si
  // - userArrowDot: bolinha azul + borda branca na base — indica o ponto
  //   GPS exato (a ponta do triangulo eh a "direcao", a bolinha eh o "onde")
  // O Marker tem rotation prop que gira o container inteiro pelo eixo
  // do anchor (centro), entao o conjunto rota como uma peca so.
  userArrowOuter: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  userArrowOutline: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 18,
    borderRightWidth: 18,
    borderBottomWidth: 36,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
  },
  userArrowFill: {
    position: 'absolute',
    top: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderBottomWidth: 28,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1d4ed8',
  },
  userArrowDot: {
    position: 'absolute',
    bottom: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1d4ed8',
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 3,
  },
  // Header pill semi-transparente — flutua sobre o mapa
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  headerPillClose: { color: '#fff', fontSize: 20, fontWeight: '700', width: 24, textAlign: 'left' },
  headerPillTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerPillWarning: { color: '#fde68a', fontSize: 11, marginTop: 2, fontWeight: '600' },
  // FABs do canto: centralizar + ver rota completa
  floatingButtons: {
    position: 'absolute',
    right: 14,
    gap: 10,
  },
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 5,
  },
  fabText: { fontSize: 20 },
  // Chevron branco dentro do FAB azul — sinal de "modo motorista".
  fabChevron: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
  },
  // Card inferior com info + acoes
  bottomCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 8,
  },
  bottomCardHeader: { flexDirection: 'row', gap: 12 },
  bottomCardBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCardBadgeText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  bottomCardLabel: { color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  bottomCardTitle: { color: '#0f172a', fontSize: 19, fontWeight: '800', marginTop: 2 },
  bottomCardSubtitle: { color: '#64748b', fontSize: 13, marginTop: 1 },
  bottomCardMetaRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  bottomCardMeta: { fontSize: 12, fontWeight: '600', color: '#475569' },
  bottomCardWarning: { fontSize: 12, color: '#dc2626', fontWeight: '700', marginTop: 6 },
  bottomCardActions: { gap: 8 },
  bottomCardButton: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  bottomCardButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  bottomCardSecondaryRow: { flexDirection: 'row', gap: 8 },
  bottomCardSecondaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  bottomCardSecondaryText: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#dc2626',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 32, height: 32, tintColor: '#fff', resizeMode: 'contain' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  logoutButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6 },
  logoutButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: { fontSize: 16 },
  passwordModalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    margin: 20,
    marginBottom: 40,
    alignSelf: 'stretch',
  },
  passwordModalHint: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  adminDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 18 },
  adminSectionTitle: { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  adminButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  adminButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  settingsLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginBottom: 2 },
  settingsHint: { fontSize: 12, color: '#64748b' },
  skipLocationButton: { marginTop: 18, paddingHorizontal: 16, paddingVertical: 10 },
  skipLocationButtonText: { color: '#64748b', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 8, textAlign: 'center' },
  permissionBody: { fontSize: 14, color: '#475569', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  permissionPrimaryButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 10,
  },
  permissionPrimaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  permissionSecondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  permissionSecondaryButtonText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  // Filter Bar
  filterBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  filterScroll: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 6,
  },
  filterChipActive: { backgroundColor: '#dc2626' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  filterChipTextActive: { color: '#fff' },
  filterDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  // Multi-select dos status na aba Rota (wrap, varios chips em ordem livre)
  statusMultiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  // Resultado da busca manual: titulo + cidade + botao adicionar
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 10,
  },
  manualRowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  manualRowSubtitle: { fontSize: 12, color: '#64748b', marginTop: 1 },
  manualRowWarning: { fontSize: 11, color: '#dc2626', fontWeight: '600', marginTop: 2 },
  // Badge admin: indica qual roteador foi usado pra otimizar a ultima rota.
  providerBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  providerBadgeText: { fontSize: 10, fontWeight: '700', color: '#166534' },
  // Card de stop da rota (com checkbox + linha de acoes)
  routeStopCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderLeftWidth: 4,
  },
  routeStopHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  routeStopSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkboxCheckmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  // Search bar (busca por nome) — fica acima dos chips de status.
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  searchIcon: { fontSize: 14, color: '#64748b' },
  searchInput: { flex: 1, color: '#0f172a', fontSize: 14, padding: 0 },
  searchClear: { color: '#64748b', fontSize: 14, paddingHorizontal: 4 },
  // Linha horizontal com o icone de filtros ancorado a esquerda + chips de status rolando.
  filterBarRow: { flexDirection: 'row', alignItems: 'center' },
  filterIconButton: {
    width: 40,
    height: 36,
    marginLeft: 8,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconText: { fontSize: 18 },
  // Funil minimalista feito com 3 barrinhas afinando — sem dep nova.
  filterFunnel: { alignItems: 'center', gap: 3 },
  filterFunnelBar: { height: 2, borderRadius: 1, backgroundColor: '#fff' },
  filterIconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#dc2626',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  filterIconBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  // Modal de filtros (UF e etapa comercial)
  filtersSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    marginTop: 'auto',
    maxHeight: '80%',
  },
  // Botao de dropdown (estilo "menu suspenso") que abre a lista de UFs.
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  dropdownButtonText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  dropdownChevron: { fontSize: 16, color: '#64748b' },
  // Lista vertical do seletor de UF (modo "picker" dentro do mesmo sheet).
  ufPickerList: { maxHeight: 380, marginTop: 4 },
  ufPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  ufPickerRowText: { fontSize: 15, color: '#0f172a' },
  ufPickerRowTextActive: { fontWeight: '800', color: '#dc2626' },
  ufPickerCheck: { fontSize: 16, fontWeight: '800', color: '#dc2626' },
  backButton: { color: '#64748b', fontSize: 15, fontWeight: '600', width: 60 },
  filtersFooter: { flexDirection: 'row', gap: 10, marginTop: 20 },
  filtersSecondaryButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#f1f5f9' },
  filtersSecondaryButtonText: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  // Loading
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 15 },
  errorText: { color: '#ef4444', fontSize: 16 },
  // Map
  map: { flex: 1 },
  // Legenda de temperatura: fica ACIMA do botao de localizacao (que ocupa
  // left:16 / bottom:90+insets), por isso o offset extra de 56px.
  tempLegend: {
    position: 'absolute',
    left: 16,
    marginBottom: 56,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  tempLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tempLegendDot: { width: 10, height: 10, borderRadius: 5 },
  tempLegendLabel: { fontSize: 11, fontWeight: '700', color: '#334155' },
  mapButton: {
    position: 'absolute',
    left: 16,
    backgroundColor: '#fff',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },
  fab: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#dc2626',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  fabSecondary: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#0ea5e9',
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 8,
  },
  fabSecondaryIcon: { fontSize: 22 },
  // Ponto vermelho no centro exato do mapa — marca onde a coordenada e' capturada.
  creationCenterDotInner: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#dc2626',
    borderWidth: 2, borderColor: '#fff',
  },
  creationBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  creationBarTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  creationBarHint: { fontSize: 12, color: '#64748b' },
  creationBarCoords: { fontSize: 12, color: '#0f172a', marginTop: 6, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  creationBarRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  creationBarCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#f1f5f9' },
  creationBarCancelText: { color: '#0f172a', fontWeight: '700' },
  creationBarConfirm: { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#16a34a' },
  creationBarConfirmText: { color: '#fff', fontWeight: '700' },
  // Bottom Nav
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  navItem: { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  navItemActive: { borderTopWidth: 2, borderTopColor: '#dc2626' },
  navIcon: { fontSize: 18, marginBottom: 2 },
  navIconActive: {},
  // Badge de notificacao de tarefas pendentes, sobreposto no icone da aba.
  navBadge: {
    position: 'absolute',
    top: -6,
    right: -12,
    backgroundColor: '#dc2626',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  navBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  navItemText: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  brandMark: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '500',
    fontStyle: 'italic',
    letterSpacing: 0.5,
    color: '#cbd5e1',
  },
  navItemTextActive: { color: '#dc2626' },
  // List
  listContent: { padding: 12 },
  clientCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  cardLogo: { width: 18, height: 18, resizeMode: 'contain', marginRight: 8 },
  clientName: { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1 },
  clientContact: { fontSize: 12, color: '#64748b', marginTop: 2 },
  clientStage: { fontSize: 12, color: '#7c3aed', fontWeight: '700', marginTop: 2 },
  stageAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  stageAccordionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  stageAccordionMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  stageAccordionChevron: { fontSize: 13, color: '#64748b', fontWeight: '800', marginLeft: 10 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardMeetingBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  cardMeetingBadgeText: { color: '#6d28d9', fontSize: 10, fontWeight: '700' },
  cardVisitBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  cardVisitBadgeText: { color: '#15803d', fontSize: 10, fontWeight: '700' },
  clientCity: { fontSize: 13, color: '#64748b', marginBottom: 2 },
  clientPhone: { fontSize: 13, color: '#334155' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyStateText: { fontSize: 15, color: '#94a3b8' },
  panelCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  panelHint: { fontSize: 12, color: '#64748b', lineHeight: 17 },
  agendaExportBtn: {
    marginTop: 12,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaExportBtnDisabled: { opacity: 0.6 },
  agendaExportBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentButtonActive: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  segmentButtonText: { fontSize: 12, fontWeight: '700', color: '#475569', textAlign: 'center' },
  segmentButtonTextActive: { color: '#fff' },
  routePosition: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0f172a',
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 26,
    marginRight: 8,
  },
  routeActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  smallActionButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  smallActionButtonText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  secondaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  secondaryButtonText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  agendaItem: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  visitCountBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  visitCountText: { fontSize: 14, fontWeight: '800', color: '#15803d' },
  visitCountHint: { fontSize: 12, color: '#16a34a', marginTop: 2 },
  // Uso do produto (HubSpot) — cores vem do estado, so' o layout fica aqui.
  usoBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  usoTitulo: { fontSize: 14, fontWeight: '800' },
  usoDetalhe: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  usoRodape: { fontSize: 11, marginTop: 4 },
  agendaSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 14,
    marginBottom: 6,
  },
  agendaSectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  agendaSectionMeta: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  agendaWhen: { width: 56, alignItems: 'center' },
  agendaDate: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  agendaWeekday: { fontSize: 10, color: '#94a3b8', fontWeight: '600', textTransform: 'capitalize' },
  agendaTime: { fontSize: 14, fontWeight: '800', color: '#dc2626', marginTop: 2 },
  agendaTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  agendaTitleTime: { fontSize: 15, fontWeight: '800', color: '#334155' },
  agendaSubtitle: { fontSize: 13, color: '#64748b', marginTop: 3 },
  agendaMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  // Cabecalho de dia da timeline — vermelho, caixa alta, o marcador visual
  // que separa "HOJE" de "AMANHÃ" sem o vendedor ter que ler data por item.
  agendaDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 16,
    marginBottom: 8,
  },
  agendaDayHeaderText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#dc2626',
    letterSpacing: 0.6,
  },
  agendaDayHeaderCount: { fontSize: 11, color: '#94a3b8', fontWeight: '700' },
  // Pill de temperatura da etapa (Quente/Morno/Frio) — cor vem de TEMP_COLORS
  // com alpha em hex (1a = ~10% fundo, 59 = ~35% borda).
  agendaTempPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  agendaTempPillText: { fontSize: 11, fontWeight: '800' },
  // Tarefas
  taskMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  // Card da tarefa: lead como título, badge de urgência à direita.
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  taskCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  taskLead: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0f172a' },
  taskBadge: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  taskTipo: { fontSize: 13, fontWeight: '600', color: '#334155', marginTop: 2 },
  taskActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  // Chips de urgência (contam e filtram) + cabeçalho de cada seção.
  taskChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  taskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  taskChipDot: { width: 8, height: 8, borderRadius: 4 },
  taskChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  taskSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  taskSectionText: { fontSize: 12, fontWeight: '800', color: '#64748b', letterSpacing: 0.4 },
  taskVendorHint: { fontSize: 12, color: '#b45309', marginBottom: 10 },
  // Responsável + tag de vendedor desativado (sufixo "/ DESATIVADO" no nome).
  taskRespRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  taskInativoTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#fee2e2',
  },
  taskInativoTagText: { fontSize: 9, fontWeight: '800', color: '#b91c1c', letterSpacing: 0.3 },
  // Cabecalho da aba Tarefas com botao de info
  taskHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  taskInfoButton: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  taskInfoButtonText: { fontSize: 18, color: '#2563eb', fontWeight: '700' },
  // Modal de regras
  taskRulesCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 24,
    width: '100%',
  },
  taskRulesHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  taskRulesTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', flex: 1 },
  taskRulesClose: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9',
  },
  taskRulesCloseText: { fontSize: 15, color: '#475569', fontWeight: '700' },
  taskRulesIntro: { fontSize: 13, color: '#64748b', lineHeight: 19, marginBottom: 12 },
  ruleCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  ruleTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  ruleSectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 3,
  },
  ruleText: { fontSize: 13, color: '#334155', lineHeight: 19 },
  ruleLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ruleLevelBadge: {
    minWidth: 34, height: 24, borderRadius: 12, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  ruleLevelBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  ruleLevelText: { fontSize: 13, color: '#334155', flex: 1, lineHeight: 18 },
  taskRulesDoneButton: {
    marginTop: 14,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  taskRulesDoneButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  // Opções do modal "destino do lead" ao concluir tarefa
  taskDoneOption: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginTop: 10 },
  taskDoneOptionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  taskDoneOptionHint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 3, lineHeight: 16 },
  // Ponto de partida da rota
  routeStartRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  routeStartOption: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center',
  },
  routeStartOptionActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  routeStartText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  routeStartTextActive: { color: '#2563eb' },
  routeStartPick: {
    paddingVertical: 11, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  routeStartPickName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  routeStartPickMeta: { fontSize: 12, color: '#64748b', marginTop: 1 },
  metricCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricLabel: { fontSize: 13, fontWeight: '800', color: '#334155' },
  metricValue: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#16a34a' },
  rankingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  warningText: { fontSize: 12, color: '#92400e', backgroundColor: '#fef3c7', padding: 10, borderRadius: 8, marginTop: 10 },
  masterGrid: { gap: 8, marginTop: 8 },
  masterMetric: { fontSize: 13, fontWeight: '700', color: '#334155', backgroundColor: '#f8fafc', padding: 10, borderRadius: 8 },
  auditRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  auditAction: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  // Modal Form
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  closeButton: { fontSize: 22, color: '#94a3b8', padding: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  statusOptionText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
  },
  inputRow: { flexDirection: 'row' },
  submitButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  locationSummary: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#bbf7d0' },
  locationSummaryText: { fontSize: 12, color: '#16a34a', fontWeight: '500' },
  // Bottom Sheet
  bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  bottomSheetHandle: { alignSelf: 'center', width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2 },
  dragHandleArea: { width: '100%', paddingTop: 14, paddingBottom: 14, alignItems: 'center' },
  bottomSheetContent: { paddingHorizontal: 20 },
  bsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  bsLogoWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  bsLogo: { width: 28, height: 28, tintColor: '#fff', resizeMode: 'contain' },
  bsHeaderInfo: { flex: 1 },
  clientDetailsName: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  bsContactSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  statusBadgeLarge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  infoGrid: { gap: 12, marginBottom: 16 },
  infoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIcon: { fontSize: 16, marginTop: 2 },
  detailLabel: { fontSize: 11, fontWeight: '600', color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase' },
  detailValue: { fontSize: 14, color: '#0f172a' },
  observationsSection: { marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  // Historico de notas: cada entrada vira card cronologico no bottom sheet.
  notesSection: { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginBottom: 16 },
  noteItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  noteHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  noteAuthor: { fontSize: 12, fontWeight: '700', color: '#0f172a', marginBottom: 1 },
  noteDate: { fontSize: 11, color: '#64748b' },
  noteActions: { flexDirection: 'row', gap: 12 },
  noteAction: { fontSize: 12, fontWeight: '700', color: '#3b82f6' },
  noteDelete: { fontSize: 14, color: '#94a3b8', paddingHorizontal: 4 },
  noteBody: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  // Modo edicao inline: botoes Cancelar/Salvar abaixo do textarea.
  noteEditActions: { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' },
  noteEditCancel: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  noteEditCancelText: { color: '#64748b', fontWeight: '700', fontSize: 13 },
  noteEditSave: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#dc2626' },
  noteEditSaveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  navigationSection: { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginBottom: 16 },
  navigationRow: { flexDirection: 'row', gap: 10 },
  navRouteButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  navButtonDriving: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  navButtonWalking: { backgroundColor: '#fefce8', borderColor: '#eab308' },
  navRouteButtonText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  addRouteButton: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  addRouteButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  meetingsSection: { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginBottom: 16 },
  meetingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meetingsEmpty: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
  meetingChip: {
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  meetingChipDate: { fontSize: 13, fontWeight: '700', color: '#5b21b6' },
  meetingChipObs: { fontSize: 12, color: '#475569', marginTop: 2 },
  meetingChipActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  scheduleButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  scheduleButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  followUpButton: {
    backgroundColor: '#0891b2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  followUpButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  changeStageButton: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  changeStageButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 8 },
  deleteButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  deleteButtonText: { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  closeActionButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#dc2626' },
  closeActionButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
