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
import { Marker, default as RNMapView } from 'react-native-maps';
import * as Location from 'expo-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClients } from './src/hooks/useClients';
import { useMeetings } from './src/hooks/useMeetings';
import { useForceReload } from './src/hooks/useForceReload';
import { supabase } from './src/integrations/supabase/client';
import { AREA_RADIUS_KM } from './src/utils/area';
import { getShowOnlyMyAreaPref, setShowOnlyMyAreaPref } from './src/utils/userPrefs';
import type { Client, ClientMeeting, ClientStatus } from './src/types/client';
import { openNavigation } from './src/utils/navigation';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { CEPStep } from './src/screens/CEPStep';
import { OutboundCadastroScreen } from './src/screens/OutboundCadastroScreen';
import { ScheduleMeetingModal } from './src/screens/ScheduleMeetingModal';
import { reverseGeocode } from './src/utils/geocoding';

const queryClient = new QueryClient();

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

function CustomMarker({ color, meetingCount }: { color: string; meetingCount: number }) {
  return (
    <View style={markerStyles.container}>
      <View style={[markerStyles.pin, { backgroundColor: color }]}>
        <Image
          source={require('./assets/icon.png')}
          style={markerStyles.logo}
          // Asset embarcado: pinta sincronamente. defaultSource garante fallback.
          defaultSource={require('./assets/icon.png')}
          fadeDuration={0}
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
    // Quando muda meetingCount, religa o tracking pra refletir o badge novo.
    // Timer alto (2000ms) porque quando o clustering desliga em zoom alto,
    // 2300+ markers montam de uma vez e o bridge nativo precisa de tempo
    // pra completar o primeiro paint de todos antes de congelar.
    const [tracking, setTracking] = useState(true);
    useEffect(() => {
      setTracking(true);
      const t = setTimeout(() => setTracking(false), 2000);
      return () => clearTimeout(t);
    }, [meetingCount]);

    const handlePress = useCallback(() => onPress(client), [onPress, client]);

    return (
      <Marker
        coordinate={coordinate}
        onPress={handlePress}
        tracksViewChanges={tracking}
      >
        <CustomMarker color={color} meetingCount={meetingCount} />
      </Marker>
    );
  },
  (prev, next) =>
    prev.color === next.color &&
    prev.client.id === next.client.id &&
    prev.client.latitude === next.client.latitude &&
    prev.client.longitude === next.client.longitude &&
    prev.meetingCount === next.meetingCount &&
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
});

function MainApp() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, loading, logout, profile, updatePassword } = useAuth();
  const [tab, setTab] = useState<'map' | 'list'>('map');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showCepStep, setShowCepStep] = useState(false);
  const [showOutboundForm, setShowOutboundForm] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ClientStatus>('lead' as ClientStatus);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showOnlyMyArea, setShowOnlyMyArea] = useState(false);
  const [locationPermission, setLocationPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
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
  const { upcomingByClient, meetingsByClient } = useMeetings();
  useForceReload(isAuthenticated);
  const isAdmin = profile?.email === 'arthurgothe.takeat@gmail.com';

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
  const [schedulingFor, setSchedulingFor] = useState<Client | null>(null);
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

  const filteredClients = useMemo(
    () => clients.filter(c => c.status === statusFilter),
    [clients, statusFilter]
  );

  const filteredWithCoords = useMemo(
    () => filteredClients.filter(c => c.latitude !== null && c.longitude !== null),
    [filteredClients]
  );

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
  };

  const handleMarkerPress = useCallback((c: Client) => setSelectedClient(c), []);

  // Modo de criação manual via mapa: pin fixo no centro da tela
  const [creationMode, setCreationMode] = useState(false);
  const [creationCenter, setCreationCenter] = useState<{ latitude: number; longitude: number } | null>(null);

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
    setForm({
      ...initialFormState,
      status: statusOptions[0]?.value ?? initialFormState.status,
      latitude: creationCenter.latitude.toString(),
      longitude: creationCenter.longitude.toString(),
      cep: addr?.cep ? `${addr.cep.slice(0, 5)}-${addr.cep.slice(5)}` : '',
      endereco: addr?.endereco ?? '',
      numero: addr?.numero ?? '',
      cidade: addr?.cidade ?? '',
      estado: addr?.estado ?? '',
    });
    setIsFormOpen(true);
    setCreationCenter(null);
  }, [creationCenter, statusOptions]);

  const resetForm = () => setForm(initialFormState);

  const submitClient = async () => {
    if (submittingRef.current) return;
    if (!form.nome.trim()) return;

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
          { text: '📅 Agendar reunião', onPress: () => setSchedulingFor(created) },
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

      if (distance > 50) {
        Alert.alert(
          'Você está muito longe',
          `Distância atual: ${Math.round(distance)} m (limite: 50 m).\nAproxime-se do local para marcar como visitado.`,
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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const opt of statusOptions) counts[opt.value] = 0;
    for (const c of clients) counts[c.status] = (counts[c.status] ?? 0) + 1;
    return counts;
  }, [clients, statusOptions]);

  const renderClientItem = useCallback(({ item }: { item: Client }) => {
    const color = statusConfig[item.status]?.color || '#3b82f6';
    const label = statusConfig[item.status]?.label || item.status;
    const meetingCount = upcomingByClient[item.id] ?? 0;
    return (
      <TouchableOpacity
        style={[styles.clientCard, { borderLeftColor: color }]}
        onPress={() => setSelectedClient(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardNameRow}>
            <Image source={require('./assets/icon.png')} style={[styles.cardLogo, { tintColor: color }]} />
            <Text style={styles.clientName} numberOfLines={1}>{item.nome}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
        <Text style={styles.clientCity}>
          {item.cidade ?? 'Cidade não informada'}{item.estado ? ` • ${item.estado}` : ''}
        </Text>
        {item.telefone && <Text style={styles.clientPhone}>{item.telefone}</Text>}
      </TouchableOpacity>
    );
  }, [statusConfig, upcomingByClient]);

  if (!isAuthenticated && !loading) {
    return <LoginScreen />;
  }

  if (loading || isLoading || waitingForLocation) {
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

      {/* Status Filter */}
      {/* Removido o chip "Todos" propositalmente: trazia todos os ~2k+ pinos
          de uma vez no mapa, travando o app. Agora sempre há exatamente um
          status ativo (default: 'lead'). */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
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

      {tab === 'map' ? (
        <>
          <MapView
            mapRef={(ref) => { mapRef.current = ref as unknown as RNMapView; }}
            style={styles.map}
            initialRegion={mapCenter}
            showsUserLocation={true}
            followsUserLocation={isFollowingUser && !creationMode}
            onPanDrag={handleMapInteraction}
            onRegionChange={(region) => {
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
          >
            {filteredWithCoords.map(client => (
              <MarkerWithReady
                key={client.id}
                client={client}
                coordinate={{
                  latitude: client.latitude as number,
                  longitude: client.longitude as number,
                }}
                color={statusConfig[client.status]?.color || '#3b82f6'}
                meetingCount={upcomingByClient[client.id] ?? 0}
                onPress={handleMarkerPress}
              />
            ))}
          </MapView>

          {/* Pin overlay fixo no centro da tela durante creationMode */}
          {creationMode && (
            <View pointerEvents="none" style={styles.creationPinOverlay}>
              <View style={[markerStyles.pin, { backgroundColor: '#dc2626' }]}>
                <Image
                  source={require('./assets/icon.png')}
                  style={markerStyles.logo}
                  fadeDuration={0}
                />
              </View>
              <View style={[markerStyles.arrow, { borderTopColor: '#dc2626' }]} />
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

          {!creationMode && (
            <>
              <TouchableOpacity
                style={[styles.fabSecondary, { bottom: 90 + insets.bottom + 68 }]}
                onPress={() => setShowOutboundForm(true)}
              >
                <Text style={styles.fabSecondaryIcon}>📤</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fab, { bottom: 90 + insets.bottom }]}
                onPress={() => setShowCepStep(true)}
              >
                <Text style={styles.fabText}>+</Text>
              </TouchableOpacity>
            </>
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

          {selectedClient && (
            <ClientBottomSheet
              client={selectedClient}
              insets={insets}
              statusConfig={statusConfig}
              meetings={meetingsByClient[selectedClient.id] ?? []}
              coordCollision={hasCoordCollision(selectedClient)}
              onClose={() => setSelectedClient(null)}
              onDelete={() => confirmDeleteClient(selectedClient, () => setSelectedClient(null))}
              onEdit={() => openEditClient(selectedClient)}
              onMarkVisited={() => handleMarkAsVisited(selectedClient, () => setSelectedClient(null))}
              onScheduleMeeting={() => { setSchedulingFor(selectedClient); setSelectedClient(null); }}
              isMarkingVisited={isVisiting || markAsVisited.isPending}
            />
          )}
        </>
      ) : (
        <>
          <FlatList
            data={filteredClients}
            keyExtractor={item => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: 80 + insets.bottom }]}
            renderItem={renderClientItem}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
                <Text style={styles.emptyStateText}>
                  {`Nenhum ${statusConfig[statusFilter]?.label?.toLowerCase() ?? statusFilter} encontrado`}
                </Text>
              </View>
            }
          />

          <TouchableOpacity
            style={[styles.fabSecondary, { bottom: 90 + insets.bottom + 68 }]}
            onPress={() => setShowOutboundForm(true)}
          >
            <Text style={styles.fabSecondaryIcon}>📤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fab, { bottom: 90 + insets.bottom }]}
            onPress={() => setShowCepStep(true)}
          >
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>

          {selectedClient && (
            <ClientBottomSheet
              client={selectedClient}
              insets={insets}
              statusConfig={statusConfig}
              meetings={meetingsByClient[selectedClient.id] ?? []}
              coordCollision={hasCoordCollision(selectedClient)}
              onClose={() => setSelectedClient(null)}
              onDelete={() => confirmDeleteClient(selectedClient, () => setSelectedClient(null))}
              onEdit={() => openEditClient(selectedClient)}
              onMarkVisited={() => handleMarkAsVisited(selectedClient, () => setSelectedClient(null))}
              onScheduleMeeting={() => { setSchedulingFor(selectedClient); setSelectedClient(null); }}
              isMarkingVisited={isVisiting || markAsVisited.isPending}
            />
          )}
        </>
      )}

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
        <Text
          style={[styles.brandMark, { bottom: Math.max(insets.bottom - 4, 2) }]}
          pointerEvents="none"
        >
          developed by RPA
        </Text>
      </View>

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

      {/* Outbound (sem localização) Modal */}
      {showOutboundForm && (
        <OutboundCadastroScreen
          profile={profile}
          onClose={() => setShowOutboundForm(false)}
        />
      )}

      {/* Schedule Meeting Modal */}
      {schedulingFor && (
        <ScheduleMeetingModal
          client={schedulingFor}
          onClose={() => setSchedulingFor(null)}
        />
      )}

      {/* CEP Step Modal */}
      {showCepStep && (
        <CEPStep
          onNext={(cepData) => {
            setForm(prev => ({
              ...prev,
              cep: cepData.cep || '',
              endereco: cepData.endereco || '',
              cidade: cepData.cidade || '',
              estado: cepData.estado || '',
              latitude: cepData.latitude?.toString() || '',
              longitude: cepData.longitude?.toString() || '',
            }));
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
              {/* Status Selector */}
              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.statusSelector}>
                {statusOptions.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.statusOption,
                      form.status === opt.value && { backgroundColor: opt.color, borderColor: opt.color },
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
                ))}
              </View>

              <Text style={styles.fieldLabel}>Informações</Text>
              <TextInput
                style={styles.input}
                placeholder="Nome *"
                placeholderTextColor="#94a3b8"
                value={form.nome}
                onChangeText={v => setForm(s => ({ ...s, nome: v }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Nome da empresa"
                placeholderTextColor="#94a3b8"
                value={form.empresa}
                onChangeText={v => setForm(s => ({ ...s, empresa: v }))}
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
  onMarkVisited,
  onScheduleMeeting,
  isMarkingVisited,
}: {
  client: Client;
  insets: { bottom: number };
  statusConfig: Record<string, { label: string; color: string }>;
  meetings: ClientMeeting[];
  coordCollision: boolean;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMarkVisited: () => void;
  onScheduleMeeting: () => void;
  isMarkingVisited: boolean;
}) {
  const statusColor = statusConfig[client.status]?.color || '#3b82f6';
  const statusLabel = statusConfig[client.status]?.label || client.status;

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
                <Text style={styles.clientDetailsName}>{client.nome}</Text>
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
              {client.telefone && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>📞</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Telefone</Text>
                    <Text style={styles.detailValue}>{client.telefone}</Text>
                  </View>
                </View>
              )}
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
                <Text style={styles.detailLabel}>Observações</Text>
                <Text style={styles.detailValue}>{client.observacoes}</Text>
              </View>
            )}

            {/* Navigation */}
            <View style={styles.navigationSection}>
              <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Traçar Rota</Text>
              {client.latitude && client.longitude && (
                <View style={[styles.navigationRow, { marginBottom: 8 }]}>
                  <TouchableOpacity
                    style={[styles.navRouteButton, styles.navButtonDriving]}
                    onPress={() => {
                      openNavigation({ latitude: client.latitude as number, longitude: client.longitude as number, clientName: client.nome, travelMode: 'driving' });
                      onClose();
                    }}
                  >
                    <Text style={styles.navRouteButtonText}>🚗 Carro</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.navRouteButton, styles.navButtonWalking]}
                    onPress={() => {
                      openNavigation({ latitude: client.latitude as number, longitude: client.longitude as number, clientName: client.nome, travelMode: 'walking' });
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
                  const query = addressParts ? `${addressParts}, Brasil` : client.nome;
                  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                  Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o Google Maps.'));
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>🗺️ Abrir no Google Maps</Text>
              </TouchableOpacity>
            </View>

            {/* Reuniões agendadas */}
            <View style={styles.meetingsSection}>
              <View style={styles.meetingsHeader}>
                <Text style={styles.fieldLabel}>
                  Reuniões{meetings.length > 0 ? ` (${meetings.length})` : ''}
                </Text>
              </View>
              {meetings.length === 0 ? (
                <Text style={styles.meetingsEmpty}>Nenhuma reunião agendada.</Text>
              ) : (
                meetings
                  .slice()
                  .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                  .map((m) => {
                    const d = new Date(m.scheduled_at);
                    const isPast = d.getTime() < Date.now();
                    const label = d.toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const durationLabel =
                      m.duration_minutes >= 60
                        ? `${Math.floor(m.duration_minutes / 60)}h${m.duration_minutes % 60 ? ` ${m.duration_minutes % 60}min` : ''}`
                        : `${m.duration_minutes} min`;
                    return (
                      <View key={m.id} style={[styles.meetingChip, isPast && { opacity: 0.55 }]}>
                        <Text style={styles.meetingChipDate}>📅 {label} • {durationLabel}{isPast ? ' (passada)' : ''}</Text>
                        {m.observacoes ? (
                          <Text style={styles.meetingChipObs} numberOfLines={2}>{m.observacoes}</Text>
                        ) : null}
                      </View>
                    );
                  })
              )}
              <TouchableOpacity
                style={styles.scheduleButton}
                onPress={onScheduleMeeting}
              >
                <Text style={styles.scheduleButtonText}>📅 Agendar reunião</Text>
              </TouchableOpacity>
            </View>

            {/* Marcar como visitado: só pra leads.
                Cliente Ativo, Em Integração e Ex-cliente nao sao alvo
                de visita outbound, e lead_visitado ja foi visitado. */}
            {client.status !== 'lead_visitado'
              && client.status !== 'ativo'
              && client.status !== 'ex_cliente'
              && client.status !== 'em_integracao' && (
              <TouchableOpacity
                disabled={isMarkingVisited}
                style={{
                  backgroundColor: isMarkingVisited ? '#94d4a8' : '#16a34a',
                  borderRadius: 10,
                  paddingVertical: 14,
                  alignItems: 'center',
                  marginBottom: 12,
                }}
                onPress={onMarkVisited}
              >
                {isMarkingVisited ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    ✅ Marcar como visitado
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
                <Text style={styles.deleteButtonText}>Remover</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#2563eb' }} onPress={onEdit}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Editar</Text>
              </TouchableOpacity>
            </View>
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
  // Loading
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 15 },
  errorText: { color: '#ef4444', fontSize: 16 },
  // Map
  map: { flex: 1 },
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
  creationPinOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Compensa o "rabicho" do pin pra ponta tocar exatamente o centro
    transform: [{ translateY: -22 }],
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
  clientCity: { fontSize: 13, color: '#64748b', marginBottom: 2 },
  clientPhone: { fontSize: 13, color: '#334155' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyStateText: { fontSize: 15, color: '#94a3b8' },
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
  clientDetailsName: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  statusBadgeLarge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  infoGrid: { gap: 12, marginBottom: 16 },
  infoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIcon: { fontSize: 16, marginTop: 2 },
  detailLabel: { fontSize: 11, fontWeight: '600', color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase' },
  detailValue: { fontSize: 14, color: '#0f172a' },
  observationsSection: { marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  navigationSection: { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginBottom: 16 },
  navigationRow: { flexDirection: 'row', gap: 10 },
  navRouteButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  navButtonDriving: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  navButtonWalking: { backgroundColor: '#fefce8', borderColor: '#eab308' },
  navRouteButtonText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
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
  scheduleButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  scheduleButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 8 },
  deleteButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  deleteButtonText: { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  closeActionButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#dc2626' },
  closeActionButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
