import {
  StatusBar } from 'expo-status-bar';
import React,
  { useEffect,
  useMemo,
  useState,
  useRef,
  useCallback } from 'react';
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
  Linking,
  Pressable,
  Switch,
  AppState,
} from 'react-native';
import { KeyboardAvoidingView } from './src/components/KeyboardAvoidingView';
import { Alert, AlertHost } from './src/components/Alert';
import { Painel } from './src/components/Painel';
import { useTheme } from './src/theme';
import {
  IconArrowDown,
  IconArrowFoward,
  IconArrowUp,
  IconBarGraph,
  IconCalendar,
  IconCall,
  IconCar,
  IconCheck,
  IconClipboardCheck,
  IconClock,
  IconClose,
  IconCloseCircle,
  IconDownload,
  IconFilterList,
  IconHome,
  IconLocation,
  IconLocationFilled,
  IconMail,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconSquareMenu,
  IconStore,
  IconText,
  IconTrendingUp,
  IconUndo,
  IconWarning,
  IconBill,
  IconIdCard,
  IconManager,
  NavIcon,
  useIconColors,
  IconUser,
  IconExternalLink,
  IconWhatsapp,
  IconPencil,
  IconStar,
  IconEye,
  IconCheckCircle,
  IconBell,
  IconLogout,
  IconLightBulb,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconMenu,
  IconMenuCircles,
  IconTrendingDown,
} from './src/components/icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
// Camada de mapa web (Google Maps JS API) com a mesma API que o
// react-native-maps + react-native-map-clustering expunham. O clustering
// deixou de ser um wrapper e virou props do proprio MapView — que e' como
// este arquivo ja as passava (radius/minPoints/maxZoom/clusterColor).
import MapView, { Marker, Polyline, Circle, type MapViewHandle as RNMapView } from './src/map';
import * as Location from 'expo-location';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClientSearch, useClients } from './src/hooks/useClients';
import { useMeetings } from './src/hooks/useMeetings';
import { bearingDegrees, distanceMeters, todayKey, useFieldOps } from './src/hooks/useFieldOps';
import { useClientNotes } from './src/hooks/useClientNotes';
import { useClientStageChanges } from './src/hooks/useClientStageChanges';
import { useClientVisits } from './src/hooks/useClientVisits';
import { useClientTasks } from './src/hooks/useClientTasks';
import { useForceReload } from './src/hooks/useForceReload';
import { supabase } from './src/integrations/supabase/client';
import {
  MAX_VIEWPORT_KM,
  boundsContains,
  boundsForRender,
  boundsFromRegion,
  type Bounds,
} from './src/utils/area';
import { getShowOnlyMyAreaPref, setShowOnlyMyAreaPref } from './src/utils/userPrefs';
import type { Client, ClientMeeting, ClientStatus, ClientTask, MeetingType } from './src/types/client';
import { openMultiStopNavigation, openNavigation } from './src/utils/navigation';
import { openWhatsapp, toWhatsappNumber } from './src/utils/whatsapp';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { CEPStep } from './src/screens/CEPStep';
import { OutboundCadastroScreen } from './src/screens/OutboundCadastroScreen';
import { ScheduleMeetingModal } from './src/screens/ScheduleMeetingModal';
import { ChangeStageModal } from './src/screens/ChangeStageModal';
import { EditLocationModal } from './src/screens/EditLocationModal';
import { MinhaDailyCard } from './src/screens/MinhaDailyCard';
import { useLayout } from './src/hooks/useLayout';
import { useNomesDeClientes } from './src/hooks/useNomesDeClientes';
import { DECISOR_STAGE_ID, FUNNEL_STAGE_IDS, LOST_STAGE_ID, STAGES, TEMP_COLORS, stageTemperature } from './src/constants/stages';
import { useStages } from './src/hooks/useStages';
import { GestorScreen } from './src/screens/GestorScreen';
import { TarefasScreen } from './src/screens/TarefasScreen';
import { RotaScreen } from './src/screens/RotaScreen';
import { AgendaScreen } from './src/screens/AgendaScreen';
import { ConfiguracoesScreen } from './src/screens/ConfiguracoesScreen';
import { ds, sharedStyles } from './src/screens/sharedStyles';
import { MeuDesempenhoScreen } from './src/screens/MeuDesempenhoScreen';
import { reverseGeocode } from './src/utils/geocoding';
import { fetchOptimizedTrip, fetchRouteGeometry, type RoutePoint, type RoutingProvider } from './src/utils/routing';
import { exportAgenda } from './src/utils/exportAgenda';
import { useVisitsHeatmap } from './src/hooks/useVisitsHeatmap';
import { buildHeatCells, heatColor, heatIntensity, HEAT_CELL_M, HEAT_LEGEND_STOPS } from './src/utils/heatmap';
import { assembleDailyRoute, MANDATORY_LABEL, MANDATORY_BADGE, DAILY_GOAL, type MandatoryReason } from './src/utils/dailyRoute';
import { fetchContaAlvo } from './src/utils/contaAlvo';
import { fetchSlaCandidate } from './src/utils/slaCandidate';
import { slaStatus, type SlaDays } from './src/utils/sla';
import { useRouteConfig } from './src/hooks/useRouteConfig';

// Sem essas opcoes valem os padroes do react-query — `staleTime: 0` e
// `refetchOnWindowFocus: true` —, que num PWA de celular sao o pior caso:
// TODA vez que o vendedor sai pro WhatsApp e volta, a lista de clientes
// (~5.5k linhas) e' rebaixada e reparseada na thread principal. Era a
// principal causa do app "travado" no iPhone.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Janela em que o dado ja' carregado e' considerado bom. Cobre o
      // vaivem entre apps durante uma visita sem refazer a busca.
      staleTime: 5 * 60 * 1000,
      // Mantem em memoria depois de a tela desmontar: trocar de aba e voltar
      // reaproveita o cache em vez de buscar de novo.
      gcTime: 30 * 60 * 1000,
      // Voltar pro app NAO rebaixa. A frescura vem de onde importa: abrir/
      // recarregar o app, o realtime, e as invalidacoes apos cada acao do
      // proprio vendedor (visita, mudanca de etapa, cadastro).
      refetchOnWindowFocus: false,
      // Reconectar, sim: significa que houve janela sem rede, e o que esta
      // em tela pode ter perdido atualizacoes.
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

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
  { value: 'ex_cliente', label: 'Ex-cliente', color: 'var(--brand-text)' },
];

type AppTab = 'map' | 'list' | 'route' | 'agenda' | 'tasks' | 'gestor' | 'meu' | 'config';

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
      { badge: 'D2', color: '#FFB32F', when: 'a partir de 2 dias úteis na etapa' },
      { badge: 'D5', color: 'var(--brand-text)', when: 'a partir de 5 dias úteis na etapa (a mesma tarefa escala de D2 para D5)' },
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
      { badge: 'Xd', color: 'var(--info-text)', when: 'o número no badge = dias que o lead está parado na etapa' },
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

// Abre o WhatsApp no telefone do cliente. Em mobile, o link wa.me redireciona
// pro app nativo via universal link (whatsapp://send). Em web cai no whatsapp web.

const getClientPrimaryName = (client: Client) => client.empresa?.trim() || client.nome;

// Cor de texto legivel sobre um fundo qualquer (decisao M1-DECISOES-3 §2).
// O badge de status usa a cor cadastrada em `client_statuses`, que e' hex
// arbitrario digitado na interface: nao da' pra escolher o texto de antemao.
// Luminancia relativa da WCAG; acima de 0.45 o fundo e' claro e pede texto
// escuro. Vive aqui, ao lado do unico uso, em vez de virar utilitario.
const textoSobre = (fundo: string): string => {
  const hex = fundo.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return '#FFFFFF';
  const canal = (i: number) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return l > 0.45 ? '#222222' : '#FFFFFF';
};

// Telefone brasileiro legivel na sublinha do topo do painel (M1c pede
// "telefone formatado"). Fora dos dois formatos conhecidos — 10 digitos (fixo)
// e 11 (celular) — devolve o que veio: e' melhor mostrar o numero cru do que
// mutilar um internacional ou um ramal.
const formatarTelefone = (raw: string | null | undefined): string | null => {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const d = t.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
};

// A COR do pin comunica a temperatura da etapa (quente/morno/frio/fechado/
// perdido) — antes era uma bandeirinha de emoji no canto, pequena demais pra
// ler em zoom baixo. Leads sem etapa conhecida caem na cor do status.
// Cor dedicada da Conta Alvo (Rota do dia) — roxo, destaca do funil térmico.
// Roxo — a UNICA cor roxa que sobrou no app, e de proposito.
//
// Aqui ela nao e' decoracao: e' o que distingue a Conta Alvo das demais no
// mapa e na legenda. O vermelho da marca ja' esta' ocupado por "Quente"
// (TEMP_COLORS.hot) e as outras posicoes tambem estao tomadas — ambar =
// Morno, azul = Frio, verde = Fechado, cinza = Perdido. Pintar a Conta Alvo
// de vermelho deixaria duas entradas identicas na legenda.
const CONTA_ALVO_COLOR = '#7c3aed';

// Tint da badge de etapa na tabela de leads (handoff desktop). No claro cada
// etapa tem seu par bg/fg; no escuro o handoff manda cair pra superficie
// aninhada com texto normal — tint clara sobre fundo escuro vira lama.
function tintDaEtapa(etapa: string | null | undefined, escuro: boolean): { bg: string; fg: string } {
  if (escuro) return { bg: 'var(--surface-2)', fg: 'var(--text)' };
  const e = (etapa ?? '').toLowerCase();
  if (e.includes('prospec')) return { bg: '#E6F7FF', fg: '#016999' };
  if (e.includes('visita')) return { bg: '#E6FBF8', fg: '#0F6B61' };
  if (e.includes('decisor')) return { bg: '#F1EBFE', fg: '#5B32C4' };
  if (e.includes('demo') || e.includes('proposta')) return { bg: '#FFF8EB', fg: '#99670F' };
  if (e.includes('negocia')) return { bg: '#FFF1E0', fg: '#8A4A0C' };
  if (e.includes('pagamento')) return { bg: '#FAE8E9', fg: '#94090F' };
  if (e.includes('ganho') || e.includes('onboarding') || e.includes('fechado')) return { bg: '#EAF7EE', fg: '#167532' };
  return { bg: '#EDEDED', fg: '#545454' };
}

function CustomMarker({ color, meetingCount, isContaAlvo }: { color: string; meetingCount: number; isContaAlvo?: boolean }) {
  const iconColors = useIconColors();
  return (
    <View style={markerStyles.container}>
      {/* data-pin: no web (>=768) o CSS de public/index.html sobe o pin de
          36 pra 40px — mais alvo de clique, como manda o handoff. */}
      <View style={[markerStyles.pin, { backgroundColor: color }]} {...ds({ pin: '1' })}>
        {/* Asset ja' BRANCO e ja' no tamanho de exibicao — nao usa tintColor.
            O react-native-web implementa tintColor criando um <svg> com um
            <filter> inline POR IMAGEM e aplicando `filter: url(#id)` no <img>.
            Filtro SVG obriga o navegador a re-rasterizar o elemento; com
            centenas de pinos sendo reposicionados a cada quadro do arraste,
            a GPU de celular nao da' conta (no desktop passava despercebido —
            era o "trava so' no mapa, so' no celular").

            De quebra o arquivo saiu de 1295x1637 / 99 KB para 38x48 / 1,4 KB:
            o anterior era reamostrado a cada pintura pra caber em 20px. */}
        <Image source={require('./assets/pin-logo.png')} style={markerStyles.logo} fadeDuration={0} />
        {meetingCount > 0 && (
          <View style={markerStyles.meetingBadge}>
            <IconCalendar width={16} height={16} fill={iconColors.onSurface} />
          </View>
        )}
        {/* Conta Alvo: badge 🎯 no canto esquerdo (o de reunião fica no direito). */}
        {isContaAlvo && (
          <View style={markerStyles.contaAlvoBadge}>
            <IconStar width={9} height={9} fill="#fff" />
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
    isContaAlvo,
    coordinate,
  }: { client: Client; onPress: (client: Client) => void; color: string; meetingCount: number; isContaAlvo?: boolean; coordinate: { latitude: number; longitude: number } }) {
    // Aqui existia toda a maquinaria de `tracksViewChanges`: tres estados,
    // um timer de 800ms por marker e um onLayout que forcava re-render. Ela
    // resolvia um bug EXCLUSIVO do render nativo — o iOS tira um "snapshot"
    // da view do marker, e o snapshot saia vazio quando o PNG do logo ainda
    // nao tinha decodificado (o "pin some ao dar zoom" do campo).
    //
    // Na web nao ha snapshot: o pin e' HTML ao vivo, sempre pintado. Manter
    // aquilo custava, por pin, 3 useState + 1 setTimeout + renders extras —
    // com algumas centenas de pins na tela, puro desperdicio.
    const handlePress = useCallback(() => onPress(client), [onPress, client]);

    return (
      <Marker coordinate={coordinate} onPress={handlePress}>
        <CustomMarker color={color} meetingCount={meetingCount} isContaAlvo={isContaAlvo} />
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
    // Sem `tintColor`: o asset ja' vem branco (ver comentario no CustomMarker).
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
    backgroundColor: 'var(--surface)',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C8131B',
    paddingHorizontal: 3,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingBadgeText: { fontSize: 9 },
  // Badge da Conta Alvo — canto esquerdo (o de reunião fica no direito).
  contaAlvoBadge: {
    position: 'absolute',
    top: -6,
    left: -8,
    backgroundColor: 'var(--surface)',
    borderRadius: 10,
    borderWidth: 1.5,
    // Segue a cor do PINO de Conta Alvo, nao o vermelho da interface: o badge
    // marca justamente esse dado, e o pino embaixo dele e' roxo.
    borderColor: CONTA_ALVO_COLOR,
    paddingHorizontal: 3,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contaAlvoBadgeText: { fontSize: 9 },
  // Marker da rota: maior, vermelho forte, com numero da ordem dentro.
  routePin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C8131B',
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
    borderTopColor: '#C8131B',
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
  // O tema em si e' aplicado por CSS no <html>; daqui so' sai o estado do
  // seletor nas configuracoes.
  const { pref: themePref, setPref: setThemePref, isDark } = useTheme();
  // Icones recebem cor por prop; `var()` nao resolve em atributo SVG.
  const iconColors = useIconColors();

  // Altura da linha "developed by RPA" (fonte 10 + folga).
  const BRAND_H = 16;
  // Num iPhone a area segura de baixo (barra de gestos) ja' tem ~34px de sobra
  // — a assinatura mora DENTRO dela e nao custa altura nenhuma. Reserva-se
  // espaco proprio so' em aparelho sem essa area, senao a faixa branca abaixo
  // das abas fica grande a' toa.
  const navPaddingBottom = Math.max(insets.bottom, BRAND_H);
  // 4px de respiro entre os rotulos das abas e a assinatura.
  const brandMarkBottom = Math.max(navPaddingBottom - BRAND_H + 2, 2);
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
  const layout = useLayout();
  // Busca global do header web. Cmd+K / Ctrl+K foca o campo (handoff desktop).
  const webSearchRef = useRef<TextInput>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        webSearchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);
  // Acessibilidade (03R item 22): ao trocar de aba, o foco vai pro titulo da
  // tela — leitores de tela anunciam onde o usuario chegou. O outline azul e'
  // suprimido so' nesse caso pelo CSS [tabindex="-1"].
  const tituloWebRef = useRef<Text>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !layout.ehLargo) return;
    (tituloWebRef.current as unknown as { focus?: () => void } | null)?.focus?.();
  }, [tab, layout.ehLargo]);
  // Chao dos elementos flutuantes (FAB, legenda, botoes do mapa).
  // Os 90px eram a altura da barra inferior. No desktop ela virou coluna
  // lateral, entao esse espaco deixou de existir — sem isto os botoes ficariam
  // pairando 90px acima do nada.
  const baseInferior = layout.ehDesktop ? 24 : 90 + insets.bottom;
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
  // Temperatura da etapa (Quente/Morno/Frio/Fechado/Perdido). Guarda o LABEL
  // que stageTemperature devolve — a etapa->temperatura já é mapeada lá, e é a
  // mesma fonte da cor do pin no mapa.
  const [tempFilter, setTempFilter] = useState<string | null>(null);
  // Mostra só os leads vindos de Conta Alvo (materializados pela Rota do dia).
  // Marcador: conta_alvo_place_id != null.
  const [contaAlvoOnly, setContaAlvoOnly] = useState(false);
  // Tabela de leads do web: ordenacao por coluna + paginacao (o celular segue
  // com FlatList infinita de cards).
  const [ordemColuna, setOrdemColuna] = useState<'nome' | 'etapa' | 'temp' | 'cidade' | 'visita' | 'reunioes'>('nome');
  const [ordemDir, setOrdemDir] = useState<'asc' | 'desc'>('asc');
  const [paginaLista, setPaginaLista] = useState(0);
  // Modo alternativo da tabela (prompt 05R item 19): agrupar por etapa.
  const [agruparPorEtapa, setAgruparPorEtapa] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isPickingVendor, setIsPickingVendor] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(() => new Set());
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  // Modal que explica as regras de geracao automatica de tarefas (botao "ⓘ"
  // no cabecalho da aba Tarefas).
  const [isTaskRulesOpen, setIsTaskRulesOpen] = useState(false);
  // Chip de severidade selecionado na aba Tarefas (null = todas). Tocar no
  // chip ativo limpa o filtro.
  const [taskSevFilter, setTaskSevFilter] = useState<string | null>(null);
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
  // ===== Carregamento por área visível do mapa =====
  //
  // Antes o app trazia tudo num raio fixo de 200 km em volta do GPS — o que,
  // numa capital, ainda são ~1.100 clientes e ~1,8 MB de JSON antes de a
  // primeira tela aparecer. Agora quem manda é o que está na tela: a busca
  // acompanha o mapa e traz só a região visível, com folga.
  const [mapRegion, setMapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);

  // Caixa efetivamente buscada. Separada de `mapRegion` porque nem todo
  // movimento do mapa vira busca nova — ver o boundsContains abaixo.
  const [activeBounds, setActiveBounds] = useState<Bounds | null>(null);
  const [viewportTooWide, setViewportTooWide] = useState(false);

  // Primeira caixa: em volta do GPS, do tamanho do initialRegion do mapa.
  // Dispara a busca junto com a montagem do mapa, em vez de esperar o
  // primeiro assentamento — senão a tela abre vazia por um instante.
  useEffect(() => {
    if (activeBounds || !userLocation || !showOnlyMyArea) return;
    setActiveBounds(
      boundsFromRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }),
    );
  }, [userLocation, activeBounds, showOnlyMyArea]);

  useEffect(() => {
    if (!showOnlyMyArea || !mapRegion) return;

    const nova = boundsFromRegion(mapRegion);

    // Zoom aberto demais: não busca (pegaria estados inteiros) e mantém na
    // tela os pins que já vieram, com um aviso pra aproximar.
    if (!nova) {
      setViewportTooWide(true);
      return;
    }
    setViewportTooWide(false);

    // A caixa buscada tem meia tela de folga de cada lado. Enquanto o novo
    // enquadramento couber dentro do que já foi buscado, não há o que pedir
    // — é isso que faz arrastar o mapa não virar uma rajada de requisições.
    setActiveBounds((anterior) => (anterior && boundsContains(anterior, nova) ? anterior : nova));
  }, [mapRegion, showOnlyMyArea]);

  // Bloqueia a query enquanto esperamos o GPS lockar com filtro ligado.
  // Sem isso o app dispararia uma query "todos os clientes" e depois outra
  // já filtrada — dobra de banda à toa.
  const waitingForLocation = showOnlyMyArea && !userLocation && locationPermission === 'pending';
  const areaPermissionDenied = showOnlyMyArea && locationPermission === 'denied';

  const { clients: clientsNaArea, statuses: dynamicStatuses, isLoading, jaCarregouAlgumaVez, error, deleteClient, addClient, updateClient, markAsVisited, ensureHubspotDeal, dismissContaAlvo } = useClients({
    // Filtro ligado: só a área visível. Desligado: base inteira (é o modo do
    // gestor olhando o país todo — pesado por natureza, e agora é escolha
    // explícita em vez de padrão).
    bounds: showOnlyMyArea ? activeBounds : null,
    // Com o filtro ligado, não busca antes de existir uma caixa: sem isso a
    // primeira query sairia sem recorte e traria tudo.
    enabled: !waitingForLocation && !areaPermissionDenied && (!showOnlyMyArea || !!activeBounds),
  });

  // Busca no servidor: cobre a base inteira, não só o pedaço carregado. Sem
  // isto, procurar por nome um cliente a 80 km não acharia nada depois que a
  // listagem passou a seguir o mapa.
  const { data: resultadosBusca, isFetching: buscando } = useClientSearch(searchQuery);

  // O resto do app continua consumindo uma lista só. Os achados da busca
  // entram por cima dos da área, sem duplicar quem já estava nas duas.
  const clients = useMemo(() => {
    if (!resultadosBusca || resultadosBusca.length === 0) return clientsNaArea;
    const vistos = new Set(clientsNaArea.map((c) => c.id));
    return [...clientsNaArea, ...resultadosBusca.filter((c) => !vistos.has(c.id))];
  }, [clientsNaArea, resultadosBusca]);
  const { meetings, upcomingByClient, meetingsByClient, deleteMeeting } = useMeetings();
  // Nomes dos leads das reunioes da agenda, POR ID. A lista `clients` cobre
  // so' a area visivel do mapa; sem isto a agenda mostrava "Lead" em tudo.
  const idsClientesDasReunioes = useMemo(
    () => [...new Set(meetings.map((m) => m.client_id).filter(Boolean))] as string[],
    [meetings],
  );
  const nomesReunioes = useNomesDeClientes(idsClientesDasReunioes, tab === 'agenda');
  const queryClient = useQueryClient();
  // Config editável pelo gestor (meta/dia, SLAs, params da Conta Alvo).
  const { config: routeConfig } = useRouteConfig();
  const routeSlaDays: SlaDays = {
    prospeccao: routeConfig.sla_prospeccao,
    visita: routeConfig.sla_visita,
    conversa: routeConfig.sla_conversa,
    demo: routeConfig.sla_demo,
    negociacao: routeConfig.sla_negociacao,
    ag_pagamento: routeConfig.sla_ag_pagamento,
  };
  // Tarefas geradas automaticamente (motor de regras no banco). O hook dispara
  // a geracao ao autenticar e le as pendentes. O badge do rodape usa a contagem
  // JA filtrada por vendedor (visibleTasksCount), nao o total global.
  const { tasks, resolveTask } = useClientTasks();
  // Mesmo problema nas tarefas: task.client_id pode apontar pra lead fora da
  // area carregada do mapa, e o card mostrava "Lead nao encontrado".
  const idsClientesDasTarefas = useMemo(
    () => [...new Set(tasks.map((t) => t.client_id).filter(Boolean))] as string[],
    [tasks],
  );
  const nomesTarefas = useNomesDeClientes(idsClientesDasTarefas, tab === 'tasks');
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

  // ===== Mapa de calor de visitas (só gestor) =====
  // Camada opcional sobre o mapa principal: densidade de check-ins por área.
  // Só o gestor vê o botão; a busca dos pontos só dispara quando ligado.
  const [heatOn, setHeatOn] = useState(false);
  const [heatSeller, setHeatSeller] = useState<string | null>(null); // null = Todos
  const [exportingHeat, setExportingHeat] = useState(false);
  const {
    points: heatPoints,
    sellers: heatSellers,
    capped: heatCapped,
    isLoading: heatLoading,
  } = useVisitsHeatmap(canViewGestor && heatOn);

  // Pontos filtrados pelo vendedor selecionado, agregados na grade.
  const heat = useMemo(() => {
    if (!heatOn) return { cells: [], max: 0, total: 0 };
    const pts = heatSeller ? heatPoints.filter((p) => p.sellerId === heatSeller) : heatPoints;
    const { cells, max } = buildHeatCells(pts);
    return { cells, max, total: pts.length };
  }, [heatOn, heatSeller, heatPoints]);

  // Exporta o mapa de calor (visitas) em JSON — mesmo mecanismo do export da
  // agenda (sobe no bucket 'exports', devolve signed URL de 7 dias). Respeita o
  // filtro de vendedor ativo (Todos ou um). Só gestor (o painel é gestor-only).
  const handleExportHeatmap = async () => {
    if (exportingHeat) return;
    const pts = heatSeller ? heatPoints.filter((p) => p.sellerId === heatSeller) : heatPoints;
    if (pts.length === 0) {
      Alert.alert('Sem dados', 'Não há visitas com GPS para exportar.');
      return;
    }
    setExportingHeat(true);
    try {
      const sellerName = heatSeller
        ? (heatSellers.find((s) => s.id === heatSeller)?.name ?? heatSeller)
        : 'Todos os vendedores';
      const { cells } = buildHeatCells(pts);
      const payload = {
        meta: {
          tipo: 'mapa_de_calor',
          gerado_em: new Date().toISOString(),
          filtro: sellerName,
          total_visitas: pts.length,
          amostra_recente: heatCapped,
          celulas: cells.length,
          celula_metros: HEAT_CELL_M,
        },
        vendedores: heatSellers.map((s) => ({ id: s.id, nome: s.name, visitas: s.count })),
        // Agregado da grade (o "calor" de fato): lat/lon do centro + contagem.
        celulas: cells.map((c) => ({ lat: c.lat, lon: c.lon, visitas: c.n })),
        // Pontos crus (cada check-in): lat/lon + vendedor + data/hora + cidade/bairro.
        pontos: pts.map((p) => ({
          lat: p.lat,
          lon: p.lon,
          vendedor_id: p.sellerId,
          vendedor: p.sellerName,
          data_hora: p.at,
          cidade: p.cidade,
          bairro: p.bairro,
        })),
      };
      const res = await exportAgenda(payload, `mapa-calor_${sellerName}`);
      Alert.alert(
        'Exportação pronta',
        `${payload.meta.total_visitas} visitas • ${payload.meta.celulas} células (${sellerName}).\n\nToque em Abrir pra baixar o .json (abre no navegador).`,
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'Abrir', onPress: () => Linking.openURL(res.url) },
        ],
      );
    } catch (err: any) {
      Alert.alert('Erro ao exportar', err?.message ?? 'Tente novamente.');
    } finally {
      setExportingHeat(false);
    }
  };

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

  // ===== Rota do gestor: ver a rota do VENDEDOR selecionado (monitoramento) =====
  // A rota é por seller_id (auth uid); o "Responsável" usa id_hubspot. Mapeia
  // id_hubspot -> auth uid (profiles.id) pra o gestor carregar a rota do vendedor.
  const authUidByHubspotId = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendors) m.set(v.id_hubspot, v.id);
    return m;
  }, [vendors]);
  // De quem é a rota exibida: o vendedor escolhido (gestor) ou o próprio.
  const routeViewSellerId = useMemo(() => {
    if (isAdmin && routeVendorFilterHubspotId && routeVendorFilterHubspotId !== '__none__') {
      return authUidByHubspotId.get(routeVendorFilterHubspotId) ?? profile?.id ?? null;
    }
    return profile?.id ?? null;
  }, [isAdmin, routeVendorFilterHubspotId, authUidByHubspotId, profile?.id]);
  // Gestor monitorando a rota de OUTRO vendedor -> tela read-only.
  const isMonitoringRoute = !!profile?.id && !!routeViewSellerId && routeViewSellerId !== profile.id;
  const fieldOps = useFieldOps(routeDate, isAuthenticated, routeViewSellerId);

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
  const [schedulingFor, setSchedulingFor] = useState<{ client: Client; type: MeetingType; reschedule?: ClientMeeting; tarefa?: { id: string; titulo: string; severity: string | null; diasNaEtapa: number | null; etapa: string | null } } | null>(null);
  // Passado da agenda começa fechado (igual lista). Hoje/futuro viram uma
  // timeline contínua agrupada por dia — não precisam de acordeão.
  // Chip de tipo na aba Agenda (null = todos): 'reuniao' | 'follow_up' | 'rota'.
  // Semana exibida no calendario web: 0 = corrente, -1 = anterior, +1 = proxima.
  // Exportação da agenda em andamento (botão "Exportar JSON" no topo da aba).

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
      // Etapa desconhecida não tem temperatura — fica de fora de qualquer
      // recorte térmico (é o mesmo critério do pin, que cai na cor do status).
      if (tempFilter && stageTemperature(c.etapa)?.label !== tempFilter) return false;
      // Conta Alvo descartada ("Não interessa") some do mapa/lista.
      if (c.conta_alvo_dismissed) return false;
      if (contaAlvoOnly && !c.conta_alvo_place_id) return false;
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
    [clients, stateFilter, stageFilter, searchTerm, vendorFilterHubspotId, visitFilter, tempFilter, contaAlvoOnly],
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
  // Agrupado por etapa nao vira grade: as linhas sao cabecalho E cliente
  // misturados, e o cabecalho viraria uma celula ao lado de um lead.
  const colunasDaLista = shouldGroupListByStage ? 1 : layout.colunas;

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

  // A busca e os filtros de status/UF/etapa recortam a LISTA DE LEADS — que so'
  // existe no mapa e na lista. Nas outras abas eles ficavam visiveis sem ter o
  // que filtrar: a Rota tem o proprio recorte de status e vendedor, a Agenda
  // filtra por tipo de compromisso, Tarefas por severidade, e Gestor/Meu tem
  // seletor de periodo. Filtro que nao afeta a tela na frente e' ruido, e pior:
  // faz o vendedor achar que mexeu em algo quando nao mexeu.
  //
  // A sugestao de rota NAO depende deles (poolBase = clients, a base inteira),
  // entao esconder aqui nao muda nenhum resultado.
  const ehAbaDeLeads = tab === 'map' || tab === 'list';

  // Contagem por temperatura pros chips do painel web do mapa. Base: clientes
  // da area visivel no recorte de status atual, ANTES do filtro de temperatura
  // (senao selecionar um chip zeraria os outros).
  const contagemTemp = useMemo(() => {
    const base = clients.filter(c =>
      isViewer ? viewerStatuses.has(c.status as ClientStatus) : c.status === statusFilter,
    );
    const m = new Map<string, number>();
    let alvo = 0;
    for (const c of base) {
      const rotulo = stageTemperature(c.etapa)?.label;
      if (rotulo) m.set(rotulo, (m.get(rotulo) ?? 0) + 1);
      if (c.conta_alvo_place_id) alvo += 1;
    }
    return { porRotulo: m, contaAlvo: alvo };
  }, [clients, isViewer, viewerStatuses, statusFilter]);

  const activeFilterCount = (searchQuery ? 1 : 0) + (stateFilter ? 1 : 0) + (stageFilter ? 1 : 0) + (vendorFilterHubspotId !== null ? 1 : 0) + (visitFilter !== null ? 1 : 0) + (tempFilter !== null ? 1 : 0) + (contaAlvoOnly ? 1 : 0);

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
  // Recorte de RENDERIZAÇÃO: só vira pino quem está na área visível (+15%).
  // Encaixado numa grade de ~1,1 km, então arrastar não recalcula a lista a
  // cada pixel. Sem isto, todo cliente carregado virava um nó de DOM vivo —
  // acima do maxZoom do clustering a biblioteca anexa TODOS ao mapa, mesmo
  // os fora da tela, e é isso que travava ao aproximar.
  const renderBounds = useMemo(
    () => (mapRegion ? boundsForRender(mapRegion) : null),
    [mapRegion],
  );

  const filteredMapMarkers = useMemo(
    () => {
      const base = isViewer
        ? clients.filter(c => viewerStatuses.has(c.status as ClientStatus) && c.latitude !== null && c.longitude !== null)
        : filteredWithCoords;
      const semRota = base.filter(c => !routeStopClientIds.has(c.id));

      // Antes do mapa reportar o primeiro enquadramento não há o que recortar.
      if (!renderBounds) return semRota;

      return semRota.filter((c) => {
        const lat = c.latitude as number;
        const lon = c.longitude as number;
        return (
          lat >= renderBounds.latMin &&
          lat <= renderBounds.latMax &&
          lon >= renderBounds.lonMin &&
          lon <= renderBounds.lonMax
        );
      });
    },
    [isViewer, clients, viewerStatuses, filteredWithCoords, routeStopClientIds, renderBounds],
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
          ? `\n\n${(tripDistanceMeters / 1000).toFixed(1)} km • ~${Math.round(tripDurationSeconds / 60)} min de carro`
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

  // ===== Rota do dia (automática) =====
  // Monta as visitas OBRIGATÓRIAS do dia (Fase 1: Relacionamento; SLA/Conta
  // Alvo entram nas Fases 2/3) + completa até a meta com sugestões, partindo do
  // GPS do vendedor, já otimizada (TSP). Não mexe no fluxo manual de rota.
  const generateDailyRoute = useCallback(async () => {
    // Base = onde o vendedor ESTÁ agora (a Rota do dia parte daqui). Cai pro
    // override de ponto de partida só se o GPS não estiver disponível.
    const base = userLocation ?? (routeStartOverride
      ? { latitude: routeStartOverride.latitude, longitude: routeStartOverride.longitude }
      : null);
    if (!base) {
      Alert.alert('Sem localização', 'Ative o GPS pra montar a Rota do dia a partir de onde você está.');
      return;
    }

    // Vendedor alvo: admin usa o filtro escolhido; vendedor comum, o próprio.
    const vendor = (isAdmin ? routeVendorFilterHubspotId : myHubspotId) ?? myHubspotId ?? null;

    setIsOptimizing(true);
    let assembly;
    try {
      assembly = await assembleDailyRoute({
        clients,
        base,
        vendor,
        excludeIds: routeStopClientIds,
        goal: routeConfig.meta_visitas_dia || DAILY_GOAL,
        providers: {
          // SLA estourado (regra do MD): lead mais urgente do vendedor via RPC.
          sla: async (excludeIds) => fetchSlaCandidate(vendor, excludeIds),
          // Conta Alvo: edge acha restaurante 4,5+/100+ a <=2km e materializa
          // como lead. Sem GPS real (só override), nao busca (a regra é "perto
          // de onde o vendedor está").
          contaAlvo: async () => (
            userLocation
              ? await fetchContaAlvo({
                  lat: base.latitude,
                  lon: base.longitude,
                  vendedor_id_hubspot: vendor,
                  // profile.id = auth.users.id (created_by NOT NULL no clients).
                  created_by: profile?.id ?? null,
                })
              : null
          ),
        },
      });
    } catch (err: any) {
      setIsOptimizing(false);
      Alert.alert('Erro', err?.message ?? 'Falha ao montar a Rota do dia.');
      return;
    }

    const candidates = assembly.candidates;
    if (candidates.length === 0) {
      setIsOptimizing(false);
      Alert.alert('Sem candidatos', 'Não achei clientes/leads com coordenadas pra montar a rota a partir daqui.');
      return;
    }

    // Ordena por TSP real (ORS → OSRM), igual à sugestão manual. Sem fallback
    // pra linha reta: se ambos caírem, avisa.
    const ordered: Array<{ client: Client; meters: number }> = [];
    let tripDistanceMeters: number | null = null;
    let tripDurationSeconds: number | null = null;
    let optimizationProvider: RoutingProvider | null = null;
    try {
      const tripPoints: RoutePoint[] = [
        { latitude: base.latitude, longitude: base.longitude },
        ...candidates.map(c => ({ latitude: c.latitude as number, longitude: c.longitude as number })),
      ];
      const trip = await fetchOptimizedTrip(tripPoints);
      const visitOrder = trip.inputOrderToVisit.slice(1);
      let prevLat = base.latitude;
      let prevLon = base.longitude;
      for (const inputIdx of visitOrder) {
        const c = candidates[inputIdx - 1];
        if (!c) continue;
        const segMeters = distanceMeters(prevLat, prevLon, c.latitude as number, c.longitude as number);
        ordered.push({ client: c, meters: segMeters });
        prevLat = c.latitude as number;
        prevLon = c.longitude as number;
      }
      tripDistanceMeters = trip.distanceMeters;
      tripDurationSeconds = trip.durationSeconds;
      optimizationProvider = trip.provider;
      setLastProviderUsed(trip.provider);
    } catch (err: any) {
      console.warn('[ROTA DIA] Otimização (ORS e OSRM) falhou:', err?.message ?? err);
      setIsOptimizing(false);
      Alert.alert(
        'Erro ao gerar rota',
        'Não conseguimos calcular a ordem otimizada (OpenRouteService e OSRM estão fora). '
        + 'Tente novamente em alguns minutos.',
      );
      return;
    } finally {
      setIsOptimizing(false);
    }

    if (ordered.length === 0) {
      Alert.alert('Sem candidatos', 'Não consegui montar a Rota do dia.');
      return;
    }

    setRouteDraft(ordered.map(o => o.client));
    fieldOps.saveRoute.mutate({
      routeDate,
      title: 'Rota do dia',
      source: 'suggested',
      priorityMode: 'daily',
      base,
      stops: ordered.map(o => ({
        client: o.client,
        distance_meters: o.meters,
        mandatory_reason: assembly!.reasonByClientId.get(o.client.id) ?? null,
      })),
    }, {
      onSuccess: () => {
        // Se materializou uma conta-alvo (lead novo), atualiza o mapa/lista.
        queryClient.invalidateQueries({ queryKey: ['clients'] });
        const obrig = [...assembly!.reasonByClientId.values()];
        const providerLabel = optimizationProvider === 'ors'
          ? 'OpenRouteService'
          : optimizationProvider === 'osrm' ? 'OSRM (ORS fora)' : '';
        const tripInfo = tripDistanceMeters != null && tripDurationSeconds != null
          ? `\n${(tripDistanceMeters / 1000).toFixed(1)} km • ~${Math.round(tripDurationSeconds / 60)} min de carro`
            + (providerLabel ? ` (via ${providerLabel})` : '')
          : '';
        const lines = [
          `Rota do dia com ${ordered.length} parada${ordered.length === 1 ? '' : 's'}.`,
          tripInfo,
          '',
          obrig.length
            ? `Obrigatórias: ${obrig.map(r => MANDATORY_LABEL[r]).join(', ')}`
            : 'Nenhuma obrigatória encontrada hoje.',
          assembly!.missing.length
            ? `Sem candidato hoje: ${assembly!.missing.map(r => MANDATORY_LABEL[r]).join(', ')}`
            : null,
        ].filter(Boolean);
        Alert.alert('Rota do dia', lines.join('\n'));
      },
      onError: (err: any) => Alert.alert('Erro ao salvar rota', err?.message ?? 'Tente novamente'),
    });
  }, [clients, fieldOps.saveRoute, userLocation, routeStartOverride, isAdmin, routeVendorFilterHubspotId, myHubspotId, profile?.id, routeStopClientIds, routeDate, queryClient, routeConfig.meta_visitas_dia]);

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
        'Rota concluida',
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
          { text: 'Agendar reunião', onPress: () => setSchedulingFor({ client: created, type: 'reuniao' }) },
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

  // Fix "bom o suficiente" pra medir proximidade: acima disso o raio de erro do
  // proprio GPS ja e' da ordem do limite de check-in.
  const GOOD_FIX_ACCURACY_M = 50;
  // Acima disso o fix nao e' GPS de verdade — e' torre/Wi-Fi ou "Localizacao
  // Exata" desligada no iOS (que devolve um ponto fuzzy a ~1-3km). Nesse caso a
  // distancia calculada e' ficcao: nao adianta mandar o vendedor "se aproximar".
  const COARSE_FIX_ACCURACY_M = 150;

  // getCurrentPositionAsync pode voltar rapido com um fix grosseiro/cacheado.
  // Se vier ruim, escuta ate ~8s e fica com o de menor raio de erro.
  const getBestFix = useCallback(async (): Promise<Location.LocationObject> => {
    const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    if ((first.coords.accuracy ?? Number.POSITIVE_INFINITY) <= GOOD_FIX_ACCURACY_M) return first;

    return new Promise((resolve) => {
      let best = first;
      let sub: Location.LocationSubscription | null = null;
      let done = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { sub?.remove?.(); } catch {}
        resolve(best);
      };
      timer = setTimeout(finish, 8000);
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const acc = loc.coords.accuracy ?? Number.POSITIVE_INFINITY;
          if (acc < (best.coords.accuracy ?? Number.POSITIVE_INFINITY)) best = loc;
          if (acc <= GOOD_FIX_ACCURACY_M) finish();
        },
      )
        .then((s) => { if (done) { try { s.remove(); } catch {} } else { sub = s; } })
        .catch(() => finish());
    });
  }, []);

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

      // Coordenada do lead LIDA DO BANCO na hora. O objeto do sheet e' um
      // snapshot (pode ter sido aberto antes de uma edicao de localizacao feita
      // nesta sessao ou em outro device) — medir contra pin velho gera um
      // "voce esta muito longe" fantasma logo depois de arrastar o pin.
      let targetLat = Number(client.latitude);
      let targetLon = Number(client.longitude);
      let isApproxPin = client.geo_approximate === true;
      try {
        const { data: freshRow } = await supabase
          .from('clients')
          .select('latitude, longitude, geo_approximate')
          .eq('id', client.id)
          .maybeSingle();
        if (freshRow?.latitude != null && freshRow?.longitude != null) {
          targetLat = Number(freshRow.latitude);
          targetLon = Number(freshRow.longitude);
          isApproxPin = freshRow.geo_approximate === true;
        }
      } catch { /* sem rede: segue com o snapshot do sheet */ }

      let position: Location.LocationObject;
      try {
        position = await getBestFix();
      } catch (err: any) {
        Alert.alert('Erro de GPS', err?.message ?? 'Não foi possível obter sua localização.');
        return;
      }

      const userLat = position.coords.latitude;
      const userLon = position.coords.longitude;
      const fixAccuracy = position.coords.accuracy ?? null;
      const distance = haversineMeters(userLat, userLon, targetLat, targetLon);
      // Mesmo criterio da RPC mark_client_as_visited (200m preciso / 500m
      // aproximado). Antes o app travava em 200m fixo e barrava check-in que o
      // banco teria aceitado.
      const maxDistance = isApproxPin ? 500 : 200;

      if (distance > maxDistance) {
        // Fix grosseiro: o problema nao e' a distancia, e' a leitura. Mandar
        // "aproxime-se" aqui e' o que fazia o vendedor andar em volta do lead
        // sem nunca conseguir bater o ponto.
        if (fixAccuracy != null && fixAccuracy > COARSE_FIX_ACCURACY_M) {
          Alert.alert(
            'Localização imprecisa',
            `Seu aparelho está reportando a posição com margem de erro de ~${Math.round(fixAccuracy)} m `
            + `(a conta deu ${Math.round(distance)} m até o lead), então não dá pra confirmar que você está no local.\n\n`
            + 'No iPhone: Ajustes › Privacidade e Segurança › Serviços de Localização › este app › ative "Localização Exata". '
            + 'Depois volte pro app e tente de novo.',
            [
              { text: 'Fechar', style: 'cancel' },
              { text: 'Abrir configurações', onPress: () => Linking.openSettings() },
            ],
          );
          return;
        }
        Alert.alert(
          'Você está muito longe',
          `Distância atual: ${Math.round(distance)} m (limite: ${maxDistance} m).`
          + (fixAccuracy != null ? `\nPrecisão do GPS: ±${Math.round(fixAccuracy)} m.` : '')
          + '\nAproxime-se do local para marcar como visitado.',
        );
        return;
      }

      await markAsVisited.mutateAsync({ clientId: client.id, latitude: userLat, longitude: userLon });
      // Auto-conclui a parada da rota do dia correspondente: o check-in É a
      // conclusão da visita, então a parada não deveria ficar "pendente" só
      // porque o vendedor não tocou o checkbox (senão o ranking subestima).
      // Só na própria rota (não quando o gestor está monitorando outro).
      if (!isMonitoringRoute) {
        const stop = fieldOps.stops.find((s) => s.client_id === client.id && s.status !== 'done');
        if (stop) {
          try { await fieldOps.markStopDone.mutateAsync(stop); } catch { /* não bloqueia o check-in */ }
        }
      }
      Alert.alert('Pronto', 'Lead marcado como visitado.');
      onDone?.();
    } catch (err: any) {
      Alert.alert('Não foi possível marcar como visitado', err?.message ?? 'Erro desconhecido');
    } finally {
      visitingRef.current = false;
      setIsVisiting(false);
    }
  }, [markAsVisited, fieldOps.stops, fieldOps.markStopDone, isMonitoringRoute, getBestFix]);

  // Conta Alvo "Não interessa": descarta o alvo (some do mapa/lista, sai da rota,
  // não vira deal, não é re-sugerido). Só faz sentido em conta-alvo sem deal.
  const handleDismissContaAlvo = useCallback((client: Client, done?: () => void) => {
    Alert.alert(
      'Não interessa?',
      `Descartar "${getClientPrimaryName(client)}" como Conta Alvo? Ela some do mapa e não é sugerida de novo. Nenhum deal é criado no HubSpot.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: async () => {
            try {
              await dismissContaAlvo.mutateAsync(client.id);
              const stop = fieldOps.stops.find((s) => s.client_id === client.id);
              if (stop) { try { await fieldOps.removeStop.mutateAsync(stop); } catch { /* segue */ } }
              done?.();
            } catch (err: any) {
              Alert.alert('Erro', err?.message ?? 'Não foi possível descartar.');
            }
          },
        },
      ],
    );
  }, [dismissContaAlvo, fieldOps.stops, fieldOps.removeStop]);

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
            <Text style={sharedStyles.clientName} numberOfLines={1}>{primary}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Visitas: so mostra a partir da 2a (revisita) — na 1a o proprio
                status "lead visitado" ja comunica. */}
            {(item.visit_count ?? 0) > 1 && (
              <View style={styles.cardVisitBadge}>
                <IconText Icone={IconLocation} style={styles.cardVisitBadgeText} tone="onSurface">{item.visit_count}</IconText>
              </View>
            )}
            {meetingCount > 0 && (
              <View style={styles.cardMeetingBadge}>
                <IconText Icone={IconCalendar} style={styles.cardMeetingBadgeText} tone="onSurface">{meetingCount}</IconText>
              </View>
            )}
            <View style={[sharedStyles.statusBadge, { backgroundColor: color }]}>
              <Text style={sharedStyles.statusBadgeText}>{label}</Text>
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
        style={sharedStyles.stageAccordionHeader}
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
          <Text style={sharedStyles.stageAccordionTitle}>{item.title}</Text>
          <Text style={sharedStyles.stageAccordionMeta}>{item.count} leads</Text>
        </View>
        <Text style={sharedStyles.stageAccordionChevron}>{item.expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
    );
  }, [renderClientItem]);

  const renderCompactClient = (client: Client, index: number, actions?: React.ReactNode) => {
    const color = statusConfig[client.status]?.color || '#3b82f6';
    return (
      <View key={client.id} style={[styles.clientCard, { borderLeftColor: color }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardNameRow}>
            <Text style={sharedStyles.routePosition}>{index + 1}</Text>
            <Text style={sharedStyles.clientName} numberOfLines={1}>{getClientPrimaryName(client)}</Text>
          </View>
          <View style={[sharedStyles.statusBadge, { backgroundColor: color }]}>
            <Text style={sharedStyles.statusBadgeText}>{statusConfig[client.status]?.label || client.status}</Text>
          </View>
        </View>
        <Text style={styles.clientCity}>
          {[client.bairro, client.cidade, client.estado].filter(Boolean).join(' - ') || 'Localizacao nao informada'}
        </Text>
        {actions}
      </View>
    );
  };




  if (!isAuthenticated && !loading) {
    return <LoginScreen />;
  }

  // Spinner full-screen SO quando nao ha nada pra mostrar (boot). Depois que
  // existe lista (mesmo placeholder da area anterior), refetch roda por baixo
  // sem esconder o app — antes qualquer troca de areaCacheKey (vendedor andou
  // ~1km) trocava o mapa inteiro por "Carregando..." no meio do uso.
  // `jaCarregouAlgumaVez` é o que separa a abertura do app de uma troca de
  // área. Sem ele, arrastar o mapa pra uma região ainda não buscada trocaria
  // o app inteiro por um spinner — o carregamento de área tem que ser o aviso
  // discreto sobre o mapa, não uma tela cheia.
  if (loading || (isLoading && !jaCarregouAlgumaVez) || waitingForLocation) {
    return (
      <View style={styles.centered}>
        <Image source={require('./assets/icon.png')} style={{ width: 72, height: 72, marginBottom: 16, tintColor: '#C8131B', resizeMode: 'contain' }} />
        <ActivityIndicator size="large" color="var(--brand-text)" />
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
        <IconLocation width={56} height={56} fill={iconColors.muted} style={{ marginBottom: 16 }} />
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
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: '#222222' }]}>
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
            <TouchableOpacity onPress={exitNavigation} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <IconClose width={20} height={20} fill={iconColors.onBrand} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={navStyles.headerPillTitle}>Parada {currentStopIndex + 1} de {routeDisplayClients.length}</Text>
              {gpsUnstable && <IconText Icone={IconWarning} style={navStyles.headerPillWarning} tone="onSurface">Sinal de GPS instavel</IconText>}
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
          <TouchableOpacity style={navStyles.fab} onPress={showFullRouteInNav} accessibilityRole="button" accessibilityLabel="Buscar">
            <IconSearch width={20} height={20} fill={iconColors.onSurface} />
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
                {distLabel && <IconText Icone={IconLocation} style={navStyles.bottomCardMeta} tone="onSurface">{distLabel}</IconText>}
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
              <IconText Icone={IconCheck} style={navStyles.bottomCardButtonText} tone="onBrand">Finalizar visita</IconText>
            </TouchableOpacity>
            <View style={navStyles.bottomCardSecondaryRow}>
              {!isLast && (
                <TouchableOpacity
                  style={[navStyles.bottomCardSecondaryButton, { flex: 1 }]}
                  onPress={skipNavigationStop}
                >
                  <IconText Icone={IconUndo} style={navStyles.bottomCardSecondaryText} tone="onSurface">Pular</IconText>
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
                <IconText Icone={IconCar} style={[navStyles.bottomCardSecondaryText, noCoords && { opacity: 0.4 }]} tone="onSurface">Maps</IconText>
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
      slaDays={routeSlaDays}
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
      onDismissContaAlvo={isViewer ? undefined : () => handleDismissContaAlvo(selectedClient, () => setSelectedClient(null))}
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
      responsavelNome={
        selectedClient.vendedor_id_hubspot
          ? vendorById.get(selectedClient.vendedor_id_hubspot)?.full_name ?? null
          : null
      }
    />
  ) : null;

  // ── Controle do calor de visitas (M2) ─────────────────────────────────
  // O MESMO corpo serve os dois layouts: no desktop ele expande a linha do
  // switch dentro do painel de 352px (nada flutua sobre o mapa, que e' o dado
  // que o controle explica); no celular vira folha no rodape.
  const corpoCalor = (() => {
    // Linhas de 32px so' no desktop de verdade. Em tablet (768-1023) o alvo do
    // design system continua 48px, e o painel de 352px ja' existe la'.
    const compacto = layout.ehDesktop;
    const alturaLinha = compacto ? 32 : 48;

    const linhaVendedor = (
      id: string | null,
      nome: string,
      contagem: number,
    ) => {
      const ativo = heatSeller === id;
      return (
        <TouchableOpacity
          key={id ?? 'todos'}
          accessibilityRole="radio"
          accessibilityState={{ checked: ativo }}
          style={[styles.calorLinha, { height: alturaLinha }]}
          {...(compacto ? ds({ hover: 'surface2', trans: '1' }) : {})}
          onPress={() => setHeatSeller(id)}
        >
          <View style={[styles.calorRadio, ativo && styles.calorRadioAtivo]}>
            {ativo && <IconCheck width={12} height={12} fill="#FFFFFF" />}
          </View>
          <Text style={[styles.calorNome, ativo && styles.calorNomeAtivo]} numberOfLines={1}>
            {nome}
          </Text>
          <Text style={styles.calorContagem}>{contagem}</Text>
        </TouchableOpacity>
      );
    };

    return (
      <View style={{ gap: 12 }}>
        {/* a · Escala. Uma familia de cor: mais escuro = mais visita. */}
        <View>
          <View style={styles.calorEscalaBarra}>
            {HEAT_LEGEND_STOPS.map((c, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: c }} />
            ))}
          </View>
          <View style={styles.calorEscalaRotulos}>
            <Text style={styles.calorEscalaRotulo}>menos</Text>
            <Text style={styles.calorEscalaRotulo}>mais</Text>
          </View>
        </View>

        {/* b · Vendedores. Lista vertical: os 17 do time cabem rolando, o que a
            fila horizontal de chips nao permitia (mostrava tres). */}
        <View>
          <View style={styles.calorListaCabecalho}>
            <Text style={styles.calorListaTitulo}>POR VENDEDOR</Text>
            <Text style={styles.calorListaTotal}>
              {heatPoints.length} {heatPoints.length === 1 ? 'visita' : 'visitas'}
            </Text>
          </View>
          {heat.total === 0 && !heatLoading ? (
            <Text style={styles.heatEmpty}>
              {heatSeller ? 'Este vendedor não tem visitas com GPS.' : 'Nenhuma visita com GPS registrada.'}
            </Text>
          ) : null}
          <ScrollView
            style={{ maxHeight: compacto ? 180 : 240 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {linhaVendedor(null, 'Todos', heatPoints.length)}
            {heatSellers.map((v) => linhaVendedor(v.id, v.name, v.count))}
          </ScrollView>
        </View>

        {/* c · Exportacao: acao secundaria de consulta, nao CTA. Outline teal,
            o mesmo de "Baixar planilha" e "Exportar relatorio". */}
        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.calorExportar,
            compacto ? styles.calorExportarDesktop : styles.calorExportarMobile,
            (exportingHeat || heatLoading || heat.total === 0) && { opacity: 0.5 },
          ]}
          onPress={handleExportHeatmap}
          disabled={exportingHeat || heatLoading || heat.total === 0}
        >
          {exportingHeat ? (
            <ActivityIndicator size="small" color={iconColors.teal} />
          ) : (
            <>
              <IconDownload width={20} height={20} fill={iconColors.teal} />
              <Text style={styles.calorExportarTexto}>Exportar JSON</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  })();

  const conteudoMapa = (
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
          // Assentamento do mapa = hora de conferir se a área visível
          // saiu do que já foi carregado. Só aqui, e não no onRegionChange
          // (que dispara a cada quadro do arraste).
          setMapRegion({
            latitude: region.latitude,
            longitude: region.longitude,
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
          });
        }}
        showsBuildings={true}
        // Clustering: agrupa pinos próximos numa bolha com contador.
        //
        // maxZoom = nivel ATE o qual se agrupa; acima dele todo pino vira
        // elemento individual. Estava em 9, herdado do app nativo: como o
        // uso normal e' zoom 13+, na pratica o agrupamento nunca acontecia
        // e a tela desenhava um no de DOM por cliente. No nativo o pino era
        // barato; no navegador cada um custa ~6 nos, e ai' o mapa engasga.
        //
        // 14 mantem pino individual do zoom de rua pra baixo (que e' onde o
        // vendedor decide a visita) e agrupa no de bairro pra cima. Subir
        // este numero = mais pinos soltos e mais peso; baixar = mais bolhas
        // de contagem.
        radius={50}
        minPoints={3}
        maxZoom={14}
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
        {/* Camada de calor (gestor): um círculo translúcido por célula da
            grade, cor/raio conforme a densidade de visitas. Renderiza ANTES
            dos markers pra os pins ficarem por cima. Funciona em Apple e
            Google Maps (o <Heatmap> nativo só roda no Google). */}
        {heatOn && heat.cells.map((cell) => {
          const t = heatIntensity(cell.n, heat.max);
          return (
            <Circle
              // key por coordenada: células removidas no filtro por vendedor
              // desmontam de fato (com key por índice, o overlay nativo podia
              // ficar "preso" mostrando dado antigo).
              key={`heat-${cell.lat.toFixed(5)}-${cell.lon.toFixed(5)}`}
              center={{ latitude: cell.lat, longitude: cell.lon }}
              // Raio bem maior que a célula (180m) → as manchas se sobrepõem
              // num "borrão" de calor contínuo, visível já no zoom de cidade.
              radius={HEAT_CELL_M * (1.5 + 1.1 * t)}
              fillColor={heatColor(t, 0.4 + 0.4 * t)}
              strokeColor="rgba(0,0,0,0)"
              strokeWidth={0}
            />
          );
        })}
        {/* Pins normais somem enquanto o calor está ligado: aí o mapa mostra
            APENAS os lugares visitados (do vendedor filtrado ou de todos),
            sem os leads engolirem as manchas. Voltam ao desligar o 🔥. */}
        {!heatOn && filteredMapMarkers.map(client => (
          <MarkerWithReady
            key={client.id}
            client={client}
            coordinate={{
              latitude: client.latitude as number,
              longitude: client.longitude as number,
            }}
            // Conta Alvo (Rota do dia) tem cor própria (roxo) + badge 🎯 pra
            // destacar. Senão, cor = temperatura da etapa; lead sem etapa
            // conhecida (Backlog, sem etapa) cai na cor do status.
            color={
              client.conta_alvo_place_id
                ? CONTA_ALVO_COLOR
                : (stageTemperature(client.etapa)?.color ??
                   statusConfig[client.status]?.color ??
                   '#3b82f6')
            }
            meetingCount={upcomingByClient[client.id] ?? 0}
            isContaAlvo={!!client.conta_alvo_place_id}
            onPress={handleMarkerPress}
          />
        ))}
        {/* Markers da rota com numero da ordem — renderizam acima dos
            normais e ficam visiveis independente do filtro de status.
            Também somem no modo calor pra não poluir. */}
        {!heatOn && routeDisplayClients
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
            se a API falhou. Oculta no modo calor. */}
        {!heatOn && routeWaypoints.length >= 2 && (
          <Polyline
            coordinates={
              routeGeometry.data && routeGeometry.data.coordinates.length > 1
                ? routeGeometry.data.coordinates
                : routeWaypoints
            }
            strokeColor="#C8131B"
            strokeWidth={4}
            lineDashPattern={
              routeGeometry.data && routeGeometry.data.coordinates.length > 1
                ? undefined
                : [8, 4]
            }
          />
        )}
      </MapView>

      {/* Estado do carregamento por área. Fica sobre o mapa, sem capturar
          toque (pointerEvents none) pra não atrapalhar o arraste. */}
      {showOnlyMyArea && (viewportTooWide || isLoading) && (
        <View style={styles.areaStatusWrap} pointerEvents="none">
          <View style={styles.areaStatusPill}>
            {viewportTooWide ? (
              <IconText Icone={IconSearch} style={styles.areaStatusText} tone="onSurface">Aproxime para carregar os clientes desta região</IconText>
            ) : (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.areaStatusText}>Carregando esta região…</Text>
              </>
            )}
          </View>
        </View>
      )}

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
              <View style={[markerStyles.pin, { backgroundColor: '#C8131B' }]}>
                {/* Mesmo asset branco dos pinos do mapa: markerStyles.logo
                    deixou de ter tintColor, então o icon.png original
                    apareceria vermelho sobre o círculo vermelho. */}
                <Image source={require('./assets/pin-logo.png')} style={markerStyles.logo} fadeDuration={0} />
              </View>
              <View style={[markerStyles.arrow, { borderTopColor: '#C8131B' }]} />
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
          necessaria pra decifrar o mapa. Fica fora do modo de criacao.
          Some enquanto o mapa de calor está ligado (a legenda dele assume). */}
      {!creationMode && !heatOn && layout.ehLargo && (
        <View style={[styles.tempLegend, { bottom: baseInferior }, layout.ehLargo && styles.tempLegendaWeb]} pointerEvents="none">
          {[
            { c: TEMP_COLORS.hot, l: 'Quente' },
            { c: TEMP_COLORS.warm, l: 'Morno' },
            { c: TEMP_COLORS.cold, l: 'Frio' },
            { c: TEMP_COLORS.won, l: 'Fechado' },
            { c: TEMP_COLORS.lost, l: 'Perdido' },
            { c: CONTA_ALVO_COLOR, l: 'Conta Alvo' },
          ].map(item => (
            <View key={item.l} style={[styles.tempLegendRow, layout.ehLargo && styles.tempLegendaLinhaWeb]}>
              <View style={[styles.tempLegendDot, { backgroundColor: item.c }]} />
              {/* numberOfLines={1}: sem isto "🎯 Conta Alvo" quebrava em
                  duas linhas dentro da coluna e desalinhava a legenda. */}
              <Text style={styles.tempLegendLabel} numberOfLines={1}>{item.l}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Map buttons. Recenter e FAB somem enquanto o calor está ligado
          (o painel de calor ocupa a faixa de baixo). */}
      {userLocation && !creationMode && !heatOn && (
        <TouchableOpacity
          style={[styles.mapButton, { bottom: baseInferior, left: 16 }, layout.ehLargo && styles.mapaControleWeb]}
          onPress={centerOnUser}
         accessibilityRole="button" accessibilityLabel="Centralizar no meu local">
          {/* Cheio quando esta' seguindo o vendedor, vazado quando a
              camera esta' livre — mesma leitura que o 📍/🧭 dava. */}
          {isFollowingUser ? (
            <IconLocationFilled width={22} height={22} fill={iconColors.brand} />
          ) : (
            <IconLocation width={22} height={22} fill={iconColors.onSurface} />
          )}
        </TouchableOpacity>
      )}

      {/* Toggle do mapa de calor — só gestor. Fica acima do FAB (à direita).
          Quando ligado some (o painel embaixo, com seu ✕, é o controle de
          desligar) — assim não sobrepõe o painel. */}
      {canViewGestor && !creationMode && !heatOn && !layout.ehLargo && (
        <TouchableOpacity
          // Estilo proprio em vez de `{ left: undefined }` sobre o
          // mapButton: no react-native-web o estilo base vira classe CSS e
          // `undefined` nao emite regra nenhuma — ou seja, nao CANCELA o
          // `left: 16` da base. O botao ficava com left E right ao mesmo
          // tempo, ancorava a' esquerda e caia em cima da legenda de cores.
          style={[styles.mapButtonRight, { bottom: baseInferior + 66 }]}
          onPress={() => setHeatOn(true)}
        >
          <IconTrendingUp width={20} height={20} fill={iconColors.onSurface} />
        </TouchableOpacity>
      )}

      {/* FAB flutuante SO' NO DESKTOP. No celular quem cria lead e' o FAB
          central da barra inferior — manter os dois daria dois caminhos pra
          mesma acao, e o solto cobria o conteudo do mapa. */}
      {!creationMode && !isViewer && !heatOn && layout.ehLargo && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Adicionar lead"
          style={[styles.fab, { bottom: baseInferior }]}
          onPress={() => setShowCepStep(true)}
        >
          <IconPlus width={26} height={26} fill="#fff" />
        </TouchableOpacity>
      )}

      {/* Calor de visitas no CELULAR (M2): folha no rodape, nao cartao
          flutuante. No desktop o controle vive dentro do painel de 352px —
          la' a linha do switch expande, e nada cobre o mapa. */}
      {heatOn && !creationMode && !layout.ehLargo && (
        // Ancorada ACIMA da barra de navegacao (baseInferior = 90 + safe area),
        // nao no fundo da janela: em `bottom: 0` a barra cobria o "Exportar
        // JSON". Os 40px de padding embaixo continuam de reserva do FAB — que
        // aqui ate' some com o calor ligado, mas a folha nao depende disso.
        <View style={[styles.calorFolha, { bottom: baseInferior }]}>
          <View style={styles.calorFolhaAlca} />
          <View style={styles.calorFolhaCabecalho}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.calorFolhaTitulo}>Calor de visitas</Text>
              <Text style={styles.pmwCalorSub} numberOfLines={1}>
                {heatLoading
                  ? 'Carregando check-ins…'
                  : `${heat.total} ${heat.total === 1 ? 'visita' : 'visitas'}${heatCapped ? ' (amostra recente)' : ''}`}
              </Text>
            </View>
            {/* Aqui o X faz sentido: no celular nao ha' switch visivel. */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              style={styles.calorFolhaFechar}
              onPress={() => setHeatOn(false)}
            >
              <IconClose width={24} height={24} fill={iconColors.muted} />
            </TouchableOpacity>
          </View>
          {corpoCalor}
        </View>
      )}

      {creationMode && creationCenter && (
        <View style={[styles.creationBar, { bottom: baseInferior }]}>
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
  );

  // Painel de trabalho do mapa no web (352px): status, temperatura, calor e a
  // lista "nesta area". Substitui a busca/chips full-bleed do celular.
  // M4: o contador numerico vira lista de chips removiveis — o badge diz
  // QUANTOS, os chips dizem QUAIS. "Limpar tudo" NAO toca em showOnlyMyArea
  // (escopo de carregamento nao e' filtro).
  const rotuloVisita = (v: string): string =>
    v === 'never' ? 'Nunca visitado'
    : v === 'visited' ? 'Já visitado'
    : v === 'visited:7' ? 'Visitado há menos de 7 dias'
    : v === 'visited:30' ? 'Visitado há menos de 30 dias'
    : v === 'not_visited:30' ? 'Sem visita há 30+ dias'
    : v === 'not_visited:60' ? 'Sem visita há 60+ dias'
    : v === 'not_visited:90' ? 'Sem visita há 90+ dias'
    : v;
  const filtrosAtivos: Array<{ chave: string; rotulo: string; limpar: () => void }> = [
    searchQuery ? { chave: 'busca', rotulo: `Busca: ${searchQuery}`, limpar: () => setSearchQuery('') } : null,
    stageFilter ? { chave: 'etapa', rotulo: `Etapa: ${stageFilter}`, limpar: () => setStageFilter(null) } : null,
    stateFilter ? { chave: 'uf', rotulo: `UF: ${stateFilter}`, limpar: () => setStateFilter(null) } : null,
    visitFilter ? { chave: 'visita', rotulo: rotuloVisita(visitFilter), limpar: () => setVisitFilter(null) } : null,
    vendorFilterHubspotId !== null
      ? {
          chave: 'vendedor',
          rotulo:
            vendorFilterHubspotId === '__none__'
              ? 'Sem responsável'
              : vendorFilterHubspotId === myHubspotId
                ? 'Meus leads'
                : `Vendedor: ${vendorLabel(vendorFilterHubspotId)}`,
          limpar: () => setVendorFilterHubspotId(null),
        }
      : null,
    contaAlvoOnly ? { chave: 'alvo', rotulo: 'Conta Alvo', limpar: () => setContaAlvoOnly(false) } : null,
  ].filter(Boolean) as Array<{ chave: string; rotulo: string; limpar: () => void }>;

  const linhaFiltrosAtivos = filtrosAtivos.length > 0 && (
    <View style={styles.faChips}>
      {filtrosAtivos.map(f => (
        <View key={f.chave} style={styles.faChip}>
          <Text style={styles.faChipTexto} numberOfLines={1}>{f.rotulo}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Remover filtro ${f.rotulo}`}
            hitSlop={{ top: 16, bottom: 16, left: 8, right: 12 }}
            onPress={f.limpar}
          >
            <IconClose width={14} height={14} fill={iconColors.muted} />
          </TouchableOpacity>
        </View>
      ))}
      {filtrosAtivos.length >= 2 && (
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.faChip, { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red)' }]}
          onPress={() => filtrosAtivos.forEach(f => f.limpar())}
        >
          <Text style={[styles.faChipTexto, { color: 'var(--tint-red-text)' }]}>Limpar tudo</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const painelMapaWeb = (
    <View style={styles.pmwContainer}>
      {/* M4: escopo de CARREGAMENTO, separado dos filtros — decide o que a
          query busca, nao o que recorta. Fora do "Limpar tudo" de proposito. */}
      <View style={styles.pmwEscopo}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.pmwCalorTitulo}>Só minha área</Text>
          <Text style={styles.pmwCalorSub} numberOfLines={2}>
            {showOnlyMyArea
              ? 'Carrega apenas os leads da região visível no mapa.'
              : 'Buscando em todo o país. Pode ficar lento.'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Só minha área"
          accessibilityState={{ checked: showOnlyMyArea }}
          style={[
            styles.pmwSwitch,
            { backgroundColor: showOnlyMyArea ? '#C8131B' : 'var(--stroke-default)', alignItems: showOnlyMyArea ? 'flex-end' : 'flex-start' },
          ]}
          {...ds({ trans: '1' })}
          onPress={() => handleToggleArea(!showOnlyMyArea)}
        >
          <View style={styles.pmwSwitchDot} />
        </Pressable>
      </View>
      <View style={styles.pmwFiltros}>
        <View style={styles.pmwSegmentos}>
          {statusOptions.map((opt, i) => {
            const ativo = isViewer ? viewerStatuses.has(opt.value) : statusFilter === opt.value;
            const raio =
              i === 0
                ? { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }
                : i === statusOptions.length - 1
                  ? { borderTopRightRadius: 12, borderBottomRightRadius: 12, borderLeftWidth: 0 }
                  : { borderLeftWidth: 0 };
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                style={[styles.pmwSegmento, raio, ativo && styles.pmwSegmentoAtivo]}
                {...ds({ trans: '1' })}
                onPress={() => (isViewer ? toggleViewerStatus(opt.value) : setStatusFilter(opt.value))}
              >
                <Text style={[styles.pmwSegmentoTexto, ativo && styles.pmwSegmentoTextoAtivo]} numberOfLines={1}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ gap: 8 }}>
          <View style={styles.pmwTituloLinha}>
            <Text style={styles.pmwTitulo}>Temperatura da etapa</Text>
            {(tempFilter !== null || contaAlvoOnly) && (
              <Pressable accessibilityRole="button" onPress={() => { setTempFilter(null); setContaAlvoOnly(false); }}>
                <Text style={styles.pmwLimpar}>Limpar</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.pmwChips}>
            {[
              { rotulo: 'Quente', cor: TEMP_COLORS.hot },
              { rotulo: 'Morno', cor: TEMP_COLORS.warm },
              { rotulo: 'Frio', cor: TEMP_COLORS.cold },
              { rotulo: 'Fechado', cor: TEMP_COLORS.won },
              { rotulo: 'Perdido', cor: TEMP_COLORS.lost },
            ].map(c => {
              const ativo = tempFilter === c.rotulo;
              return (
                <Pressable
                  key={c.rotulo}
                  accessibilityRole="button"
                  accessibilityLabel={`Filtrar ${c.rotulo}`}
                  style={[styles.pmwChip, ativo && styles.pmwChipAtivo]}
                  {...ds({ trans: '1', hover: ativo ? 'tintred' : 'surface2' })}
                  onPress={() => setTempFilter(ativo ? null : c.rotulo)}
                >
                  <View style={[styles.pmwChipDot, { backgroundColor: c.cor }]} />
                  <Text style={styles.pmwChipTexto}>{c.rotulo}</Text>
                  <Text style={styles.pmwChipContagem}>{contagemTemp.porRotulo.get(c.rotulo) ?? 0}</Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filtrar Conta Alvo"
              style={[styles.pmwChip, contaAlvoOnly && styles.pmwChipAtivo]}
              {...ds({ trans: '1', hover: contaAlvoOnly ? 'tintred' : 'surface2' })}
              onPress={() => setContaAlvoOnly(v => !v)}
            >
              <View style={[styles.pmwChipDot, { backgroundColor: CONTA_ALVO_COLOR }]} />
              <Text style={styles.pmwChipTexto}>Conta Alvo</Text>
              <Text style={styles.pmwChipContagem}>{contagemTemp.contaAlvo}</Text>
            </Pressable>
          </View>
        </View>
        {canViewGestor && (
          // Ligado, a propria linha EXPANDE e mostra escala e vendedores. Nada
          // flutua sobre o mapa (o cartao antigo cobria o dado que explicava), e
          // nao ha' X: desligar e' o mesmo switch que ligou.
          <View style={styles.calorCaixa}>
            <View style={styles.pmwCalor}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.pmwCalorTitulo}>Calor de visitas</Text>
                <Text style={styles.pmwCalorSub} numberOfLines={1}>
                  {heatOn
                    ? heatLoading
                      ? 'Carregando check-ins…'
                      : `${heat.total} ${heat.total === 1 ? 'visita' : 'visitas'}${heatCapped ? ' (amostra recente)' : ''}`
                    : 'Densidade de check-ins com GPS'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Calor de visitas"
                accessibilityState={{ checked: heatOn }}
                style={[
                  styles.pmwSwitch,
                  { backgroundColor: heatOn ? '#C8131B' : 'var(--stroke-default)', alignItems: heatOn ? 'flex-end' : 'flex-start' },
                ]}
                {...ds({ trans: '1' })}
                onPress={() => setHeatOn(v => !v)}
              >
                <View style={styles.pmwSwitchDot} />
              </Pressable>
            </View>
            {heatOn && <View style={styles.calorCorpo}>{corpoCalor}</View>}
          </View>
        )}
      </View>
      {linhaFiltrosAtivos && <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{linhaFiltrosAtivos}</View>}
      <View style={styles.pmwListaCabecalho}>
        <Text style={styles.pmwListaTitulo}>{`Nesta área · ${filteredMapMarkers.length}`}</Text>
        <Text style={styles.pmwListaOrdem}>{userLocation ? 'por distância' : 'por nome'}</Text>
      </View>
      <ScrollView style={{ flex: 1 }}>
        {(() => {
          const linhas = filteredMapMarkers
            .map(c => ({
              c,
              d:
                userLocation && c.latitude !== null && c.longitude !== null
                  ? distanceMeters(userLocation.latitude, userLocation.longitude, c.latitude, c.longitude)
                  : null,
            }))
            .sort((a, b) =>
              a.d !== null && b.d !== null ? a.d - b.d : (a.c.nome || '').localeCompare(b.c.nome || ''),
            )
            .slice(0, 80);
          return linhas.map(({ c, d }) => {
            const temp = stageTemperature(c.etapa);
            const cor = c.conta_alvo_place_id ? CONTA_ALVO_COLOR : temp?.color ?? 'var(--stroke-default)';
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={c.nome ?? 'Lead'}
                style={styles.pmwLinha}
                {...ds({ hover: 'surface2', trans: '1' })}
                onPress={() => setSelectedClient(c)}
              >
                <View style={[styles.pmwLinhaBarra, { backgroundColor: cor }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.pmwLinhaNome} numberOfLines={1}>{c.nome}</Text>
                  <Text style={styles.pmwLinhaSub} numberOfLines={1}>
                    {[c.etapa, c.cidade].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </View>
                {d !== null && (
                  <Text style={styles.pmwLinhaDist}>
                    {d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1).replace('.', ',')} km`}
                  </Text>
                )}
              </Pressable>
            );
          });
        })()}
      </ScrollView>
    </View>
  );

  // ---- Lista (web): tabela plana com ordenacao e paginacao ----
  const POR_PAGINA = 50;
  const ordemTemperatura: Record<string, number> = { Quente: 0, Morno: 1, Frio: 2, Fechado: 3, Perdido: 4 };
  const linhasTabela = (() => {
    const dir = ordemDir === 'asc' ? 1 : -1;
    const valor = (c: Client): string | number => {
      switch (ordemColuna) {
        case 'etapa': return c.etapa ?? '';
        case 'temp': return ordemTemperatura[stageTemperature(c.etapa)?.label ?? ''] ?? 9;
        case 'cidade': return c.cidade ?? '';
        case 'visita': return c.visited_at ?? '';
        case 'reunioes': return meetingsByClient[c.id]?.length ?? 0;
        default: return c.nome ?? '';
      }
    };
    return [...filteredClients].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'pt-BR') * dir;
    });
  })();
  const tabelaOrdenada = agruparPorEtapa
    ? [...linhasTabela].sort((a, b) => (a.etapa ?? 'zz').localeCompare(b.etapa ?? 'zz', 'pt-BR'))
    : linhasTabela;
  const totalPaginas = Math.max(1, Math.ceil(tabelaOrdenada.length / POR_PAGINA));
  const paginaAtual = Math.min(paginaLista, totalPaginas - 1);
  const linhasDaPagina = tabelaOrdenada.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);

  const ordenarPor = (col: typeof ordemColuna) => {
    if (ordemColuna === col) setOrdemDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setOrdemColuna(col); setOrdemDir('asc'); }
  };

  // Exportacao client-side: CSV (separador ;) da selecao filtrada inteira.
  const baixarPlanilha = () => {
    if (typeof document === 'undefined') return;
    const cab = ['Nome', 'Contato', 'Telefone', 'Etapa', 'Temperatura', 'Status', 'Cidade', 'UF', 'Ultima visita', 'Visitas', 'Reunioes'];
    const linhas = linhasTabela.map(c => [
      c.nome, c.empresa, c.telefone, c.etapa, stageTemperature(c.etapa)?.label,
      c.status, c.cidade, c.estado,
      c.visited_at ? new Date(c.visited_at).toLocaleDateString('pt-BR') : '',
      c.visit_count, meetingsByClient[c.id]?.length ?? 0,
    ]);
    const csv = [cab, ...linhas]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cabecalhosTabela: Array<{ col: typeof ordemColuna | null; rotulo: string; estilo: object; soDesktop?: boolean; centro?: boolean }> = [
    { col: 'nome', rotulo: 'Restaurante', estilo: styles.ltwColRestaurante },
    { col: null, rotulo: 'Contato', estilo: styles.ltwColContato, soDesktop: true },
    { col: 'etapa', rotulo: 'Etapa', estilo: styles.ltwColEtapa },
    { col: 'temp', rotulo: 'Temperatura', estilo: styles.ltwColTemp, soDesktop: true },
    { col: 'cidade', rotulo: 'Cidade / UF', estilo: styles.ltwColCidade },
    { col: 'visita', rotulo: 'Última visita', estilo: styles.ltwColVisita, soDesktop: true },
    { col: 'reunioes', rotulo: 'Reuniões', estilo: styles.ltwColReunioes, soDesktop: true, centro: true },
  ];

  const listaTabelaWeb = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.ltwPagina}>
      <View style={styles.ltwFerramentas}>
        <View style={styles.pmwChips}>
          {[
            { rotulo: 'Todos', cor: 'var(--stroke-default)', ativo: tempFilter === null && !contaAlvoOnly, aoTocar: () => { setTempFilter(null); setContaAlvoOnly(false); }, n: linhasTabela.length },
            { rotulo: 'Quente', cor: TEMP_COLORS.hot, ativo: tempFilter === 'Quente', aoTocar: () => setTempFilter(tempFilter === 'Quente' ? null : 'Quente'), n: contagemTemp.porRotulo.get('Quente') ?? 0 },
            { rotulo: 'Morno', cor: TEMP_COLORS.warm, ativo: tempFilter === 'Morno', aoTocar: () => setTempFilter(tempFilter === 'Morno' ? null : 'Morno'), n: contagemTemp.porRotulo.get('Morno') ?? 0 },
            { rotulo: 'Frio', cor: TEMP_COLORS.cold, ativo: tempFilter === 'Frio', aoTocar: () => setTempFilter(tempFilter === 'Frio' ? null : 'Frio'), n: contagemTemp.porRotulo.get('Frio') ?? 0 },
            { rotulo: 'Conta Alvo', cor: CONTA_ALVO_COLOR, ativo: contaAlvoOnly, aoTocar: () => setContaAlvoOnly(v => !v), n: contagemTemp.contaAlvo },
            { rotulo: 'Agrupar por etapa', cor: 'var(--stroke-strong)', ativo: agruparPorEtapa, aoTocar: () => setAgruparPorEtapa(v => !v), n: null },
          ].map(chip => (
            <Pressable
              key={chip.rotulo}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar ${chip.rotulo}`}
              style={[styles.pmwChip, chip.ativo && styles.pmwChipAtivo]}
              {...ds({ trans: '1', hover: chip.ativo ? 'tintred' : 'surface2' })}
              onPress={chip.aoTocar}
            >
              <View style={[styles.pmwChipDot, { backgroundColor: chip.cor }]} />
              <Text style={styles.pmwChipTexto}>{chip.n === null ? chip.rotulo : `${chip.rotulo} · ${chip.n}`}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filtros"
            style={sharedStyles.ltwBotaoOutline}
            {...ds({ trans: '1', hover: 'surface2' })}
            onPress={() => setIsFiltersOpen(true)}
          >
            <IconFilterList width={24} height={24} fill={iconColors.muted} />
            <Text style={sharedStyles.ltwBotaoOutlineTexto}>Filtros</Text>
            {activeFilterCount > 0 && (
              <View style={styles.ltwBotaoBadge}>
                <Text style={styles.sbBadgeTexto}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Baixar planilha"
            style={[sharedStyles.ltwBotaoOutline, { borderColor: 'var(--teal-text)' }]}
            {...ds({ trans: '1', hover: 'surface2' })}
            onPress={baixarPlanilha}
          >
            <IconDownload width={24} height={24} fill={iconColors.teal} />
            <Text style={[sharedStyles.ltwBotaoOutlineTexto, { color: 'var(--teal-text)' }]}>Baixar planilha</Text>
          </Pressable>
        </View>
      </View>

      {linhaFiltrosAtivos && <View style={{ marginBottom: 16 }}>{linhaFiltrosAtivos}</View>}
      <View style={styles.ltwTabela}>
        <View style={styles.ltwCabecalho}>
          {cabecalhosTabela.filter(c => layout.ehDesktop || !c.soDesktop).map(c => (
            <Pressable
              key={c.rotulo}
              accessibilityRole={c.col ? 'button' : undefined}
              disabled={!c.col}
              style={[c.estilo, { flexDirection: 'row', alignItems: 'center', gap: 4 }, c.centro && { justifyContent: 'center' }]}
              onPress={c.col ? () => ordenarPor(c.col!) : undefined}
              {...({ 'aria-sort': c.col ? (ordemColuna === c.col ? (ordemDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined } as Record<string, unknown>)}
            >
              <Text style={styles.ltwCabecalhoTexto}>{c.rotulo}</Text>
              {c.col && ordemColuna === c.col && (
                ordemDir === 'asc'
                  ? <IconArrowUp width={12} height={12} fill={iconColors.muted} />
                  : <IconArrowDown width={12} height={12} fill={iconColors.muted} />
              )}
            </Pressable>
          ))}
          <View style={styles.ltwColSeta} />
        </View>
        {linhasDaPagina.length === 0 && (
          <View style={sharedStyles.emptyState}>
            <IconClipboardCheck width={40} height={40} fill={iconColors.muted} style={{ marginBottom: 12 }} />
            <Text style={sharedStyles.emptyStateText}>
              {searchTerm || stateFilter || stageFilter || tempFilter || visitFilter
                ? 'Nenhum cliente encontrado com esses filtros.'
                : `Nenhum ${statusConfig[statusFilter]?.label?.toLowerCase() ?? statusFilter} encontrado`}
            </Text>
          </View>
        )}
        {linhasDaPagina.map((c, idx) => {
          const temp = stageTemperature(c.etapa);
          const cabecalhoGrupo = agruparPorEtapa && (idx === 0 || (linhasDaPagina[idx - 1].etapa ?? '') !== (c.etapa ?? ''));
          const tint = tintDaEtapa(c.etapa, isDark);
          const corBarra = c.conta_alvo_place_id ? CONTA_ALVO_COLOR : temp?.color ?? 'var(--stroke-default)';
          const reunioes = meetingsByClient[c.id]?.length ?? 0;
          const dias = c.visited_at ? Math.floor((Date.now() - new Date(c.visited_at).getTime()) / 86400000) : null;
          return (
            <React.Fragment key={c.id}>
            {cabecalhoGrupo && (
              <View style={styles.ltwGrupoLinha}>
                <Text style={styles.ltwGrupoTexto}>
                  {c.etapa ?? 'Sem etapa'} · {tabelaOrdenada.filter(x => (x.etapa ?? '') === (c.etapa ?? '')).length}
                </Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={c.nome ?? 'Lead'}
              style={styles.ltwLinha}
              {...ds({ hover: 'surface2', trans: '1' })}
              onPress={() => setSelectedClient(c)}
            >
              <View style={[styles.ltwColRestaurante, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
                <View style={[styles.ltwBarraTemp, { backgroundColor: corBarra }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.ltwNome} numberOfLines={1}>{c.nome}</Text>
                  <Text style={styles.ltwSub} numberOfLines={1}>
                    {statusConfig[c.status]?.label ?? c.status}
                    {c.visit_count > 0 ? ` · ${c.visit_count} ${c.visit_count === 1 ? 'visita' : 'visitas'}` : ''}
                  </Text>
                </View>
              </View>
              {layout.ehDesktop && (
                <Text style={[styles.ltwColContato, styles.ltwCelula]} numberOfLines={1}>{c.empresa ?? c.telefone ?? '—'}</Text>
              )}
              <View style={styles.ltwColEtapa}>
                {c.etapa ? (
                  <View style={[styles.ltwBadgeEtapa, { backgroundColor: tint.bg }]}>
                    <Text style={[styles.ltwBadgeEtapaTexto, { color: tint.fg }]} numberOfLines={1}>{c.etapa}</Text>
                  </View>
                ) : (
                  <Text style={styles.ltwCelulaFraca}>—</Text>
                )}
              </View>
              {layout.ehDesktop && (
                <View style={[styles.ltwColTemp, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <View style={[styles.pmwChipDot, { backgroundColor: temp?.color ?? 'var(--stroke-default)' }]} />
                  <Text style={styles.ltwCelulaForte}>{temp?.label ?? '—'}</Text>
                </View>
              )}
              <Text style={[styles.ltwColCidade, styles.ltwCelula]} numberOfLines={1}>
                {[c.cidade, c.estado].filter(Boolean).join(' / ') || '—'}
              </Text>
              {layout.ehDesktop && (
                <Text
                  style={[
                    styles.ltwColVisita,
                    styles.ltwCelulaForte,
                    dias === null && { color: 'var(--text-disabled)' },
                    dias !== null && dias > 30 && { color: 'var(--tint-red-text)' },
                  ]}
                >
                  {c.visited_at
                    ? dias !== null && dias > 30
                      ? `há ${dias} dias`
                      : new Date(c.visited_at).toLocaleDateString('pt-BR')
                    : '—'}
                </Text>
              )}
              {layout.ehDesktop && (
                <Text style={[styles.ltwColReunioes, styles.ltwCelulaForte, { textAlign: 'center' }]}>{reunioes}</Text>
              )}
              <View style={styles.ltwColSeta}>
                <IconChevronRight width={20} height={20} fill={iconColors.muted} />
              </View>
            </Pressable>
            </React.Fragment>
          );
        })}
        <View style={styles.ltwRodape}>
          <Text style={styles.ltwRodapeTexto}>
            {`Mostrando ${linhasDaPagina.length} de ${linhasTabela.length} leads`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Página anterior"
              style={[styles.ltwPagBotao, paginaAtual === 0 && { opacity: 0.4 }]}
              disabled={paginaAtual === 0}
              onPress={() => setPaginaLista(p => Math.max(0, p - 1))}
            >
              <IconChevronLeft width={16} height={16} fill={iconColors.muted} />
            </Pressable>
            {Array.from({ length: totalPaginas }, (_, i) => i)
              .filter(i => Math.abs(i - paginaAtual) <= 2 || i === 0 || i === totalPaginas - 1)
              .map((i, idx, arr) => (
                <React.Fragment key={i}>
                  {idx > 0 && arr[idx - 1] !== i - 1 && <Text style={styles.ltwRodapeTexto}>…</Text>}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Página ${i + 1}`}
                    style={[styles.ltwPagBotao, i === paginaAtual && styles.ltwPagBotaoAtivo]}
                    onPress={() => setPaginaLista(i)}
                  >
                    <Text style={[styles.ltwPagTexto, i === paginaAtual && { color: '#FFFFFF' }]}>{i + 1}</Text>
                  </Pressable>
                </React.Fragment>
              ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Próxima página"
              style={[styles.ltwPagBotao, paginaAtual >= totalPaginas - 1 && { opacity: 0.4 }]}
              disabled={paginaAtual >= totalPaginas - 1}
              onPress={() => setPaginaLista(p => Math.min(totalPaginas - 1, p + 1))}
            >
              <IconChevronRight width={16} height={16} fill={iconColors.muted} />
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  // ---- Shell web (>= 768px): sidebar colapsavel + header neutro ----
  // Recriacao do handoff em design_handoff_desktop_web/. No celular (< 768)
  // nada disso monta: header vermelho + bottom nav seguem intactos.
  const mesAno = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const cabecalhoWeb = (() => {
    switch (tab) {
      case 'map':
        return { titulo: 'Mapa comercial', sub: `${filteredMapMarkers.length} leads na área visível` };
      case 'list':
        return { titulo: 'Leads', sub: `${filteredClients.length} resultados · ${activeFilterCount} ${activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'}` };
      case 'route':
        return { titulo: 'Rota do dia', sub: `${routeDisplayClients.length} ${routeDisplayClients.length === 1 ? 'parada' : 'paradas'}` };
      case 'agenda':
        return { titulo: 'Agenda', sub: 'Rotas, demos e follow-ups da semana' };
      case 'tasks':
        return { titulo: 'Tarefas', sub: `${visibleTasksCount} ${visibleTasksCount === 1 ? 'cobrança aberta' : 'cobranças abertas'} · escalonamento D2 → D5` };
      case 'gestor':
        return { titulo: 'Painel do gestor', sub: mesAno };
      case 'config':
        return { titulo: 'Configurações', sub: 'Conta, aparência e administração' };
      default:
        return { titulo: 'Meu desempenho', sub: profile?.full_name ? `${mesAno} · ${profile.full_name}` : mesAno };
    }
  })();

  const itensNavWeb: Array<{ aba: AppTab; rotulo: string; Icone: typeof IconLocation; badge?: number; visivel: boolean }> = [
    { aba: 'map', rotulo: 'Mapa', Icone: IconLocation, visivel: true },
    { aba: 'list', rotulo: 'Lista', Icone: IconSquareMenu, visivel: true },
    { aba: 'route', rotulo: 'Rota', Icone: IconCar, visivel: !isViewer },
    { aba: 'agenda', rotulo: 'Agenda', Icone: IconCalendar, visivel: !isViewer },
    { aba: 'tasks', rotulo: 'Tarefas', Icone: IconClipboardCheck, badge: visibleTasksCount, visivel: !isViewer },
    { aba: 'gestor', rotulo: 'Gestor', Icone: IconBarGraph, visivel: canViewGestor },
    { aba: 'meu', rotulo: 'Meu desempenho', Icone: IconTrendingUp, visivel: !canViewGestor && !isViewer },
  ];

  const iniciaisWeb = (profile?.full_name || profile?.email || '?')
    .trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  const sidebarWeb = (
    <View style={styles.sbContainer} {...ds({ sidebar: '1' })}>
      <View style={styles.sbTopo}>
        <Image source={{ uri: '/marca/takeat-icon.svg' }} style={styles.sbMarcaIcone} />
        <View style={styles.sbTopoTexto} {...ds({ rotulo: '1' })}>
          <Text style={styles.sbMarcaTitulo} numberOfLines={1}>Field Sales</Text>
          <Text style={styles.sbMarcaSub} numberOfLines={1}>Outbound</Text>
        </View>
      </View>
      <View style={styles.sbItens}>
        {itensNavWeb.filter(i => i.visivel).map(item => {
          const ativo = tab === item.aba;
          return (
            <Pressable
              key={item.aba}
              accessibilityRole="button"
              accessibilityLabel={item.rotulo}
              style={[styles.sbItem, ativo && styles.sbItemAtivo]}
              {...ds(ativo ? { trans: '1' } : { trans: '1', hover: 'surface2' })}
              onPress={() => setTab(item.aba)}
            >
              <View style={styles.sbItemIcone}>
                <item.Icone width={24} height={24} fill={ativo ? iconColors.tintRedText : iconColors.muted} />
              </View>
              <Text style={[styles.sbItemTexto, ativo && styles.sbItemTextoAtivo]} numberOfLines={1} {...ds({ rotulo: '1' })}>
                {item.rotulo}
              </Text>
              {item.badge ? (
                <View style={styles.sbBadge} {...ds({ navbadge: '1' })}>
                  <Text style={styles.sbBadgeTexto}>{item.badge > 99 ? '99+' : item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.sbRodape}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isDark ? 'Tema claro' : 'Tema escuro'}
          style={styles.sbItem}
          {...ds({ trans: '1', hover: 'surface2' })}
          onPress={() => setThemePref(isDark ? 'light' : 'dark')}
        >
          <View style={styles.sbItemIcone}>
            <IconLightBulb width={24} height={24} fill={iconColors.muted} />
          </View>
          <Text style={styles.sbItemTexto} numberOfLines={1} {...ds({ rotulo: '1' })}>
            {isDark ? 'Tema claro' : 'Tema escuro'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Configurações"
          style={[styles.sbItem, tab === 'config' && styles.sbItemAtivo]}
          {...ds({ trans: '1', hover: 'surface2' })}
          onPress={() => setTab('config')}
        >
          <View style={styles.sbItemIcone}>
            <IconSettings width={24} height={24} fill={tab === 'config' ? iconColors.tintRedText : iconColors.muted} />
          </View>
          <Text style={[styles.sbItemTexto, tab === 'config' && styles.sbItemTextoAtivo]} numberOfLines={1} {...ds({ rotulo: '1' })}>
            Configurações
          </Text>
        </Pressable>
        <View style={styles.sbUsuario}>
          <View style={styles.sbAvatar}>
            <Text style={styles.sbAvatarTexto}>{iniciaisWeb}</Text>
          </View>
          <View style={styles.sbUsuarioTextos} {...ds({ rotulo: '1' })}>
            <Text style={styles.sbUsuarioNome} numberOfLines={1}>{profile?.full_name || profile?.email}</Text>
            <Text style={styles.sbUsuarioPapel} numberOfLines={1}>
              {canViewGestor ? 'Gestor' : isViewer ? 'Visualização' : 'Vendedor'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sair"
            style={styles.sbSair}
            {...ds({ rotulo: '1', hover: 'surface2', trans: '1' })}
            onPress={logout}
          >
            <IconLogout width={20} height={20} fill={iconColors.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const headerWeb = (
    <View style={styles.hwContainer}>
      <View style={styles.hwTitulos}>
        <Text
          ref={tituloWebRef}
          style={styles.hwTitulo}
          numberOfLines={1}
          {...({ tabIndex: -1 } as Record<string, unknown>)}
        >
          {cabecalhoWeb.titulo}
        </Text>
        <Text style={styles.hwSubtitulo} numberOfLines={1}>{cabecalhoWeb.sub}</Text>
      </View>
      <View style={styles.hwAcoes}>
        {!isViewer && (
          <View style={styles.hwBusca} {...ds({ campo: '1' })}>
            <IconSearch width={20} height={20} fill={iconColors.muted} />
            <TextInput
              ref={webSearchRef}
              style={styles.hwBuscaInput}
              placeholder="Buscar lead, cidade ou contato"
              placeholderTextColor="var(--text-disabled)"
              value={searchQuery}
              onChangeText={(v) => {
                setSearchQuery(v);
                // Busca digitada fora de mapa/lista leva pra lista, onde o
                // resultado e' visivel — a query varre a base no servidor.
                if (v && tab !== 'map' && tab !== 'list') setTab('list');
              }}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Buscar lead, cidade ou contato"
            />
            {buscando ? (
              <ActivityIndicator size="small" color="#94a3b8" />
            ) : searchQuery.length > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setSearchQuery('')}>
                <IconClose width={14} height={14} fill={iconColors.muted} />
              </Pressable>
            ) : (
              <View style={styles.hwAtalho}>
                <Text style={styles.hwAtalhoTexto}>⌘K</Text>
              </View>
            )}
          </View>
        )}
        {!isViewer && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tarefas pendentes"
            style={styles.hwSino}
            {...ds({ hover: 'surface2', trans: '1' })}
            onPress={() => setTab('tasks')}
          >
            <IconBell width={20} height={20} fill={iconColors.muted} />
            {visibleTasksCount > 0 && <View style={styles.hwSinoDot} />}
          </Pressable>
        )}
        {!isViewer && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Novo lead"
            style={styles.hwCta}
            {...ds({ hover: 'darkred', trans: '1' })}
            onPress={() => setShowCepStep(true)}
          >
            <IconPlus width={20} height={20} fill="#FFFFFF" />
            <Text style={styles.hwCtaTexto}>Novo lead</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top },
        // No desktop a navegacao vira uma coluna FIXA a esquerda (ver
        // styles.bottomNav). Em vez de reestruturar a arvore — header,
        // conteudo e barra sao irmaos —, ela e' posicionada por cima e o
        // conteudo recua. Mudanca contida em dois estilos, sem tocar no JSX
        // de nenhuma tela.
        layout.ehLargo && { paddingLeft: LARGURA_LATERAL },
      ]}
    >
      <StatusBar style="light" />

      {/* Shell web: sidebar fixa + header neutro (>= 768px) */}
      {layout.ehLargo && sidebarWeb}
      {layout.ehLargo && headerWeb}

      {/* Header vermelho — so' no celular. No web o vermelho vira o CTA
          (handoff: "o vermelho sai do header"). */}
      {!layout.ehLargo && (
      <View style={[styles.header, isDark && styles.headerEscuro]}>
        {/* Esqueleto: fundo, padding e o avatar a' direita. A composicao do
            meio varia por tela e e' definida no prompt de cada uma.

            Sairam daqui o logo de 32px, o nome do vendedor e a engrenagem de
            44x44 — todos vao pro menu do perfil (M10).

            O avatar ainda NAO abre o menu, que so' nasce no M10: por ora ele
            leva pra tela de Configuracoes, onde "Sair" mora. Sem isso o app
            ficaria sem logout no celular, porque a engrenagem era o unico
            caminho (o outro setTab('config') vive na sidebar, que so' existe
            no web). No M10 troca-se uma linha. */}
        <View style={styles.headerLeft} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Perfil e configurações"
          style={styles.headerAvatar}
          onPress={() => setTab('config')}
        >
          <Text style={styles.headerAvatarTexto}>{iniciaisWeb}</Text>
        </TouchableOpacity>
      </View>
      )}

      {/* Viewer (somente leitura): sem busca nem filtros avancados, mas com
          chips de status em MULTI-selecao pra escolher ver leads, clientes ou
          ambos no mesmo mapa. Toque alterna cada status; nao da pra desmarcar
          todos (o mapa ficaria vazio). */}
      {isViewer && ehAbaDeLeads && !layout.ehLargo && (
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
                    sharedStyles.filterChip,
                    active && { backgroundColor: opt.color },
                  ]}
                  onPress={() => toggleViewerStatus(opt.value)}
                >
                  <View style={[sharedStyles.filterDot, { backgroundColor: opt.color }]} />
                  <Text style={[
                    sharedStyles.filterChipText,
                    active && sharedStyles.filterChipTextActive,
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
      {!isViewer && ehAbaDeLeads && !layout.ehLargo && (
        <>
          {/* Search bar: busca por nome, empresa, cidade ou bairro.
              Reflete em mapa, lista e contadores dos chips de status em tempo real. */}
          <View style={sharedStyles.searchBar}>
            <IconSearch width={18} height={18} fill={iconColors.muted} />
            <TextInput
              style={sharedStyles.searchInput}
              placeholder="Buscar por nome, empresa ou cidade"
              placeholderTextColor="var(--text-subtle)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              onSubmitEditing={Keyboard.dismiss}
            />
            {/* A busca varre a base inteira no servidor, não só a área
                carregada. Sem este indicador, procurar um cliente distante
                mostraria "nenhum encontrado" no intervalo até a resposta
                chegar — e o vendedor concluiria que ele não existe. */}
            {buscando && <ActivityIndicator size="small" color="#94a3b8" />}
            {searchQuery.length > 0 && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar" onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <IconClose width={15} height={15} fill={iconColors.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* M4, nivel 1 no celular: segmented de status + chips de
              temperatura sempre visiveis (substituem a legenda que cobria um
              quarto do mapa). Sem chip "Todos" de status: trazia ~2k pinos de
              uma vez e travava o app. */}
          <View style={styles.filterBar}>
            <View style={styles.segMobileLinha}>
              {statusOptions.map((opt, i) => {
                const ativo = statusFilter === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    accessibilityRole="button"
                    style={[
                      styles.segMobile,
                      i === 0 && { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
                      i === statusOptions.length - 1 && { borderTopRightRadius: 12, borderBottomRightRadius: 12 },
                      i > 0 && { borderLeftWidth: 0 },
                      ativo && { backgroundColor: '#C8131B', borderColor: '#C8131B' },
                    ]}
                    onPress={() => setStatusFilter(opt.value)}
                  >
                    <Text style={[styles.segMobileTexto, ativo && { color: '#FFFFFF' }]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {[
                { rotulo: 'Todos', cor: 'var(--stroke-default)', ativo: tempFilter === null && !contaAlvoOnly, aoTocar: () => { setTempFilter(null); setContaAlvoOnly(false); } },
                { rotulo: 'Quente', cor: TEMP_COLORS.hot, ativo: tempFilter === 'Quente', aoTocar: () => setTempFilter(tempFilter === 'Quente' ? null : 'Quente') },
                { rotulo: 'Morno', cor: TEMP_COLORS.warm, ativo: tempFilter === 'Morno', aoTocar: () => setTempFilter(tempFilter === 'Morno' ? null : 'Morno') },
                { rotulo: 'Frio', cor: TEMP_COLORS.cold, ativo: tempFilter === 'Frio', aoTocar: () => setTempFilter(tempFilter === 'Frio' ? null : 'Frio') },
                { rotulo: 'Fechado', cor: TEMP_COLORS.won, ativo: tempFilter === 'Fechado', aoTocar: () => setTempFilter(tempFilter === 'Fechado' ? null : 'Fechado') },
                { rotulo: 'Perdido', cor: TEMP_COLORS.lost, ativo: tempFilter === 'Perdido', aoTocar: () => setTempFilter(tempFilter === 'Perdido' ? null : 'Perdido') },
                { rotulo: 'Conta Alvo', cor: CONTA_ALVO_COLOR, ativo: contaAlvoOnly, aoTocar: () => setContaAlvoOnly(v => !v) },
              ].map(chip => (
                <TouchableOpacity
                  key={chip.rotulo}
                  accessibilityRole="button"
                  style={[styles.tempChipMobile, chip.ativo && styles.tempChipMobileAtivo]}
                  onPress={chip.aoTocar}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: chip.cor }} />
                  <Text style={[styles.tempChipMobileTexto, chip.ativo && { color: 'var(--tint-red-text)' }]}>{chip.rotulo}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {linhaFiltrosAtivos && <View style={{ paddingBottom: 8 }}>{linhaFiltrosAtivos}</View>}
            <View style={styles.filterBarRow}>
              {(availableStates.length > 0 || availableStages.length > 0) && (
                <TouchableOpacity
                  style={styles.filterIconButton}
                  onPress={() => { Keyboard.dismiss(); setIsFiltersOpen(true); }}
                >
                  {/* Antes era um funil desenhado a mao com tres <View> de
                      larguras decrescentes; agora e' o icone do UI Kit. */}
                  <IconFilterList width={20} height={20} fill="#fff" />
                  {activeFilterCount > 0 && (
                    <View style={styles.filterIconBadge}>
                      <Text style={styles.filterIconBadgeText}>{activeFilterCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <Text style={[styles.tempChipMobileTexto, { alignSelf: 'center' }]}>
                {`${filteredClients.length} ${filteredClients.length === 1 ? 'lead' : 'leads'} no recorte`}
              </Text>
            </View>
          </View>
        </>
      )}

      {tab === 'map' ? (
        layout.ehLargo ? (
          /* Web: painel de trabalho fixo de 352px + mapa. O conteudo do mapa
             e' o MESMO JSX do celular (conteudoMapa) — so' a composicao muda. */
          <View style={sharedStyles.mapaLinhaWeb}>
            {painelMapaWeb}
            <View style={sharedStyles.mapaAreaWeb}>{conteudoMapa}</View>
          </View>
        ) : (
          conteudoMapa
        )
      ) : tab === 'list' ? (
        layout.ehLargo ? (
          listaTabelaWeb
        ) : (
        <>
          <FlatList
            data={shouldGroupListByStage ? listRows : filteredClients}
            keyExtractor={(item: any) => item.key ?? item.id}
            // O FlatList NAO aceita mudar numColumns em voo — o React Native
            // lanca "Changing numColumns on the fly is not supported". A key
            // forca remontagem quando a janela cruza um breakpoint, que e'
            // raro (girar tablet, arrastar janela) e barato.
            key={`col-${colunasDaLista}`}
            numColumns={colunasDaLista}
            // Agrupado por etapa as linhas sao cabecalho E cliente misturados;
            // em grade o cabecalho viraria uma celula ao lado de um lead.
            // Por isso columnWrapper so' entra na lista plana.
            columnWrapperStyle={colunasDaLista > 1 ? { gap: 8 } : undefined}
            contentContainerStyle={[
              sharedStyles.listContent,
              // +24: o FAB central protrai 24px acima da barra e cairia em
              // cima do ultimo card — so' aparece ao rolar ate' o fim.
              { paddingBottom: 80 + 24 + insets.bottom },
              // Teto de largura: sem ele, um card ocupa 2.5 mil pixels pra
              // exibir um nome e um endereco.
              { maxWidth: layout.larguraMaxima, width: '100%', alignSelf: 'center' },
            ]}
            renderItem={shouldGroupListByStage ? (renderListRow as any) : (renderClientItem as any)}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              <View style={sharedStyles.emptyState}>
                <IconClipboardCheck width={40} height={40} fill={iconColors.muted} style={{ marginBottom: 12 }} />
                <Text style={sharedStyles.emptyStateText}>
                  {searchTerm || stateFilter || stageFilter || tempFilter || visitFilter
                    ? 'Nenhum cliente encontrado com esses filtros.'
                    : `Nenhum ${statusConfig[statusFilter]?.label?.toLowerCase() ?? statusFilter} encontrado`}
                </Text>
              </View>
            }
          />

        </>
        )
      ) : tab === 'route' ? (
        <RotaScreen
          conteudoMapa={conteudoMapa}
          clients={clients}
          fieldOps={fieldOps}
          routeStops={routeStops}
          routeDisplayClients={routeDisplayClients}
          routeStopClientIds={routeStopClientIds}
          geometriaDaRota={routeGeometry.data}
          geometriaCarregando={routeGeometry.isFetching}
          routeLeadCount={routeLeadCount}
          setRouteLeadCount={setRouteLeadCount}
          routeStatusSelection={routeStatusSelection}
          setRouteStatusSelection={setRouteStatusSelection}
          routeVendorFilterHubspotId={routeVendorFilterHubspotId}
          setRouteVendorFilterHubspotId={setRouteVendorFilterHubspotId}
          routeManualSearch={routeManualSearch}
          setRouteManualSearch={setRouteManualSearch}
          routeStartOverride={routeStartOverride}
          setRouteStartOverride={setRouteStartOverride}
          setRouteDraft={setRouteDraft}
          abrirEscolhaDePartida={() => setIsPickingRouteStart(true)}
          abrirEscolhaDeVendedor={() => setIsPickingRouteVendor(true)}
          isMonitoringRoute={isMonitoringRoute}
          isOptimizing={isOptimizing}
          lastProviderUsed={lastProviderUsed}
          isAdmin={isAdmin}
          myHubspotId={myHubspotId}
          generateDailyRoute={generateDailyRoute}
          startNavigation={startNavigation}
          viewRouteOnMap={viewRouteOnMap}
          addClientToRoute={addClientToRoute}
          openClientDetails={openClientDetails}
          vendorLabel={vendorLabel}
          nomeDoLead={getClientPrimaryName}
          statusConfig={statusConfig}
          statusOptions={statusOptions}
          irParaMapa={() => setTab('map')}
          metaVisitasDia={routeConfig.meta_visitas_dia}
          suggestRoute={suggestRoute}
        />
      ) : tab === 'tasks' ? (
        <TarefasScreen
          visibleTasks={visibleTasks}
          tasksActiveVendor={tasksActiveVendor}
          filtroSev={taskSevFilter}
          setFiltroSev={setTaskSevFilter}
          clients={clients}
          nomesTarefas={nomesTarefas}
          nomeDoLead={getClientPrimaryName}
          vendorLabel={vendorLabel}
          abrirLeadNoMapa={(c) => { setTab('map'); openClientDetails(c); }}
          abrirLeadPorId={openClientById}
          limparFiltroVendedor={() => setVendorFilterHubspotId(null)}
          agendarDemo={(c, task) =>
            setSchedulingFor({
              client: c,
              type: 'reuniao',
              tarefa: task
                ? {
                    id: task.id,
                    titulo: task.title.replace(/^(D\d+|SLA)\s+/i, ''),
                    severity: task.severity,
                    diasNaEtapa: typeof (task.meta as Record<string, unknown> | null)?.days_in_stage === 'number'
                      ? ((task.meta as Record<string, unknown>).days_in_stage as number)
                      : null,
                    etapa: typeof (task.meta as Record<string, unknown> | null)?.etapa === 'string'
                      ? ((task.meta as Record<string, unknown>).etapa as string)
                      : null,
                  }
                : undefined,
            })
          }
          abrirRegras={() => setIsTaskRulesOpen(true)}
          concluirTarefa={(vars) => resolveTask.mutate(vars)}
          abrirMenuDeConclusao={setCompletingTask}
          myHubspotId={myHubspotId}
        />
      ) : tab === 'gestor' ? (
        <GestorScreen enabled={canViewGestor && tab === 'gestor'} onOpenClient={openClientById} />
      ) : tab === 'config' ? (
        <ConfiguracoesScreen
          profile={profile}
          logout={logout}
          updatePassword={updatePassword}
          canViewGestor={canViewGestor}
          isAdmin={isAdmin}
          isViewer={isViewer}
          showOnlyMyArea={showOnlyMyArea}
          onToggleArea={handleToggleArea}
        />
      ) : tab === 'meu' ? (
        <MeuDesempenhoScreen
          enabled={tab === 'meu'}
          tarefasPendentes={visibleTasksCount}
          aoAbrirTarefas={() => setTab('tasks')}
        />
      ) : (
        <AgendaScreen
          clients={clients}
          meetings={meetings}
          routeStops={routeStops}
          nomesReunioes={nomesReunioes}
          openClientById={openClientById}
          openClientDetails={openClientDetails}
          vendorLabel={vendorLabel}
          canViewGestor={canViewGestor}
          isViewer={isViewer}
          confirmCancelMeeting={confirmCancelMeeting}
          reagendar={(v) => setSchedulingFor(v)}
          abrirRota={() => setTab('route')}
          nomeDoLead={getClientPrimaryName}
          fieldOps={fieldOps}
          vendorFilterHubspotId={vendorFilterHubspotId}
        />
      )}

      {selectedClientSheet}

      {/* Bottom Navigation */}
      {/* A assinatura "developed by RPA" cabe DENTRO da area segura — nao soma
          altura. Somar (era `insets.bottom + 16`) empilhava a faixa da
          assinatura em cima dos ~34px da barra de gestos do iPhone e criava um
          vazio branco grande embaixo das abas.
          Reserva-se espaco proprio so' quando o aparelho nao tem area segura
          suficiente pra abrigar o texto. */}
      {!layout.ehLargo && (
      <View style={[styles.bottomNav, { paddingBottom: navPaddingBottom }]}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.navItem}
          onPress={() => setTab('map')}
        >
          <NavIcon Icone={tab === 'map' ? IconLocationFilled : IconLocation} ativo={tab === 'map'} />
          <Text style={[styles.navItemText, tab === 'map' && styles.navItemTextActive]}>Mapa</Text>
        </TouchableOpacity>

        {isViewer ? (
          // Viewer fica so' com o Mapa — sem Rota, Agenda, Tarefas nem FAB.
          // O vao do meio some junto: sem FAB, ele seria um buraco.
          null
        ) : (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.navItem}
              onPress={() => setTab('route')}
            >
              <NavIcon Icone={IconCar} ativo={tab === 'route'} />
              <Text style={[styles.navItemText, tab === 'route' && styles.navItemTextActive]}>Rota</Text>
            </TouchableOpacity>

            {/* O vao que o FAB ocupa. E' um espacador, nao um alvo. */}
            <View style={styles.navVaoFab} />

            <TouchableOpacity
              accessibilityRole="button"
              style={styles.navItem}
              onPress={() => setTab('agenda')}
            >
              <NavIcon Icone={IconCalendar} ativo={tab === 'agenda'} />
              <Text style={[styles.navItemText, tab === 'agenda' && styles.navItemTextActive]}>Agenda</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              style={styles.navItem}
              onPress={() => setTab('tasks')}
            >
              {/* O badge pendura no ICONE, e nao no botao: ancorado no botao de
                  ~73px o `right` cai perto do centro e cobre a prancheta
                  inteira — e piora quando o numero vira "99+". */}
              <View style={styles.navIconeAncora}>
                <NavIcon Icone={IconClipboardCheck} ativo={tab === 'tasks'} />
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

            {/* FAB central. A borda de 4px em --surface e' o que o recorta da
                barra; sem ela ele encosta nas abas vizinhas. */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Adicionar lead"
              activeOpacity={0.94}
              style={styles.navFab}
              onPress={() => setShowCepStep(true)}
            >
              <IconPlus width={32} height={32} fill="#FFFFFF" />
            </TouchableOpacity>
          </>
        )}

        <Text style={[styles.brandMark, { bottom: brandMarkBottom }]} pointerEvents="none">
          developed by RPA
        </Text>
      </View>
      )}

      {/* Modal: escolher ponto de partida da rota (um cliente como base) */}
      <Modal
        visible={isPickingRouteStart}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPickingRouteStart(false)}
      >
        <View style={[styles.modalOverlay, layout.ehLargo && styles.modalOverlayWeb]}>
          <View style={[styles.taskRulesCard, layout.ehLargo && styles.modalCartaoMedioWeb, { maxHeight: '80%' }]}>
            <View style={styles.taskRulesHeader}>
              <Text style={styles.taskRulesTitle}>Partir de qual local?</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar"
                style={styles.taskRulesClose}
                onPress={() => setIsPickingRouteStart(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconClose width={16} height={16} fill={iconColors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.taskRulesIntro}>
              A rota vai começar deste ponto em vez da sua localização atual.
              Escolha um cliente/lead como ponto de partida.
            </Text>
            <TextInput
              style={sharedStyles.input}
              value={routeManualSearch}
              onChangeText={setRouteManualSearch}
              placeholder="Buscar por nome ou empresa..."
              placeholderTextColor="var(--text-subtle)"
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
        <View style={[styles.modalOverlay, layout.ehLargo && styles.modalOverlayWeb]}>
          <View style={[styles.taskRulesCard, layout.ehLargo && styles.modalCartaoMedioWeb]}>
            <View style={styles.taskRulesHeader}>
              <Text style={styles.taskRulesTitle}>Como as tarefas são geradas</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar"
                style={styles.taskRulesClose}
                onPress={() => setIsTaskRulesOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconClose width={16} height={16} fill={iconColors.muted} />
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
        <View style={[styles.modalOverlay, layout.ehLargo && styles.modalOverlayWeb]}>
          <View style={[styles.taskRulesCard, layout.ehLargo && styles.modalCartaoMedioWeb]}>
            {completingTask && (() => {
              const { task, client } = completingTask;
              return (
                <>
                  <View style={styles.taskRulesHeader}>
                    <Text style={styles.taskRulesTitle}>Concluir "{task.title}"</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar"
                      style={styles.taskRulesClose}
                      onPress={() => setCompletingTask(null)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <IconClose width={16} height={16} fill={iconColors.muted} />
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
                    <IconText Icone={IconArrowFoward} style={styles.taskDoneOptionText} tone="onBrand">Avançar etapa</IconText>
                    <Text style={styles.taskDoneOptionHint}>
                      Move o lead pra próxima etapa do funil e conclui a tarefa.
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.taskDoneOption, { backgroundColor: '#E03A41' }]}
                    onPress={() => {
                      setCompletingTask(null);
                      setChangingStageFor({ client, initialStageId: LOST_STAGE_ID, taskId: task.id });
                    }}
                  >
                    <IconText Icone={IconCloseCircle} style={styles.taskDoneOptionText} tone="onBrand">Mover p/ Perdido</IconText>
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
                    <IconText Icone={IconCheck} style={styles.taskDoneOptionText} tone="onBrand">Manter na etapa</IconText>
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


      {/* Modal de filtros: UF + etapa comercial. */}
      <Modal
        visible={isFiltersOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFiltersOpen(false)}
      >
        <View style={[styles.modalOverlay, layout.ehLargo && styles.modalOverlayWeb]}>
          {/* Backdrop separado pra fechar ao tocar fora — assim o sheet
              em cima fica num View puro, sem Pressable competindo com o
              gesto de scroll do ScrollView dentro. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => { setIsPickingVendor(false); setIsFiltersOpen(false); }}
          />
          <View style={[styles.filtersSheet, layout.ehLargo && styles.modalCartaoMedioWeb]}>
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
                    {vendorFilterHubspotId === null && <IconCheck width={16} height={16} fill={iconColors.brandText} />}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ufPickerRow}
                    onPress={() => { setVendorFilterHubspotId('__none__'); setIsPickingVendor(false); }}
                  >
                    <Text style={[styles.ufPickerRowText, vendorFilterHubspotId === '__none__' && styles.ufPickerRowTextActive]}>Sem vendedor associado</Text>
                    {vendorFilterHubspotId === '__none__' && <IconCheck width={16} height={16} fill={iconColors.brandText} />}
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
                        {selected && <IconCheck width={16} height={16} fill={iconColors.brandText} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Filtros</Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar" onPress={() => setIsFiltersOpen(false)}>
                    <IconClose width={20} height={20} fill={iconColors.muted} />
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
                      sharedStyles.dropdownButton,
                      vendorFilterHubspotId !== null && { borderColor: '#C8131B', backgroundColor: 'var(--tint-red)' },
                    ]}
                    onPress={() => setIsPickingVendor(true)}
                  >
                    <Text style={[
                      sharedStyles.dropdownButtonText,
                      vendorFilterHubspotId === null && { color: 'var(--text-muted)' },
                    ]}>
                      {vendorLabel(vendorFilterHubspotId)}
                    </Text>
                    <Text style={sharedStyles.dropdownChevron}>▾</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      sharedStyles.dropdownButton,
                      vendorFilterHubspotId !== null && { borderColor: '#C8131B', backgroundColor: 'var(--tint-red)' },
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
                      sharedStyles.dropdownButtonText,
                      vendorFilterHubspotId === null && { color: 'var(--text-muted)' },
                    ]}>
                      {vendorFilterHubspotId === myHubspotId ? 'Somente meus leads' : 'Todos os leads visiveis'}
                    </Text>
                    <Text style={[
                      sharedStyles.dropdownChevron,
                      vendorFilterHubspotId === myHubspotId && { color: 'var(--brand-text)' },
                    ]}>{vendorFilterHubspotId === myHubspotId ? '✓' : '○'}</Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.adminSectionTitle, { marginTop: 18 }]}>Temperatura</Text>
                <Text style={styles.passwordModalHint}>
                  Vem da etapa do lead — a mesma regra que pinta o pin no mapa.
                  Lead em etapa sem temperatura definida fica de fora do recorte.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {([
                    { label: null, texto: 'Sem filtro', cor: '#64748b', emoji: '' },
                    { label: 'Quente', texto: 'Quente', cor: TEMP_COLORS.hot },
                    { label: 'Morno', texto: 'Morno', cor: TEMP_COLORS.warm },
                    { label: 'Frio', texto: 'Frio', cor: TEMP_COLORS.cold },
                    { label: 'Fechado', texto: 'Fechado', cor: TEMP_COLORS.won },
                    { label: 'Perdido', texto: 'Perdido', cor: TEMP_COLORS.lost },
                  ] as { label: string | null; texto: string; cor: string; emoji: string }[]).map((op) => {
                    const selected = tempFilter === op.label;
                    return (
                      <TouchableOpacity
                        key={op.texto}
                        style={[
                          sharedStyles.filterChip,
                          { borderWidth: 1, borderColor: 'var(--border)', alignSelf: 'flex-start' },
                          selected && { backgroundColor: op.cor, borderColor: op.cor },
                        ]}
                        onPress={() => setTempFilter(op.label)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {op.cor && (
                            <View
                              style={{
                                width: 8, height: 8, borderRadius: 4,
                                backgroundColor: selected ? '#fff' : op.cor,
                              }}
                            />
                          )}
                          <Text style={[sharedStyles.filterChipText, selected && sharedStyles.filterChipTextActive]}>
                            {op.texto}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.adminSectionTitle, { marginTop: 18 }]}>Conta Alvo</Text>
                <Text style={styles.passwordModalHint}>
                  Só os leads trazidos pela Rota do dia (restaurantes nota ≥ 4,5 e +100 avaliações).
                  Ativar seleciona o status "Leads" pra os pins aparecerem no mapa.
                </Text>
                <TouchableOpacity
                  style={[
                    sharedStyles.filterChip,
                    { borderWidth: 1, borderColor: 'var(--border)', alignSelf: 'flex-start', marginTop: 4 },
                    contaAlvoOnly && { backgroundColor: '#C8131B', borderColor: '#C8131B' },
                  ]}
                  onPress={() => setContaAlvoOnly((v) => {
                    const next = !v;
                    // Conta-alvo tem status 'lead' — ligar o filtro pula pro chip
                    // Leads pra os pins não sumirem por causa de outro status ativo.
                    if (next && !isViewer) setStatusFilter('lead' as ClientStatus);
                    return next;
                  })}
                >
                  <IconText Icone={IconStar} style={[sharedStyles.filterChipText, contaAlvoOnly && sharedStyles.filterChipTextActive]} tone="onSurface">Só Conta Alvo</IconText>
                </TouchableOpacity>

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
                          sharedStyles.filterChip,
                          selected && { backgroundColor: '#C8131B', borderColor: '#C8131B' },
                          !selected && { borderWidth: 1, borderColor: 'var(--border)' },
                          { alignSelf: 'flex-start' },
                        ]}
                        onPress={() => setVisitFilter(v)}
                      >
                        <Text style={[sharedStyles.filterChipText, selected && sharedStyles.filterChipTextActive]}>
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
                          <Text style={{ fontSize: 11, fontWeight: '700', color: 'var(--brand-text)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
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

                {/* M4: fim do dropdown-dentro-de-modal — etapa e UF sao
                    listas INLINE. isPickingUf/isPickingStage morreram. */}
                <Text style={[styles.adminSectionTitle, { marginTop: 18 }]}>Etapa</Text>
                {availableStages.length === 0 ? (
                  <Text style={styles.passwordModalHint}>Sem etapas disponiveis.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {[null, ...availableStages].map(etapa => {
                      const ativo = stageFilter === etapa;
                      const cor = etapa ? STAGES.find(s => s.label === etapa)?.color ?? 'var(--stroke-default)' : null;
                      return (
                        <TouchableOpacity
                          key={etapa ?? '__todas'}
                          accessibilityRole="button"
                          style={[styles.filtroLinha, { minHeight: layout.ehDesktop ? 40 : 56, borderRadius: layout.ehDesktop ? 8 : 16 }, ativo && styles.filtroLinhaAtiva]}
                          onPress={() => setStageFilter(ativo ? null : etapa)}
                        >
                          {cor && <View style={[sharedStyles.filterDot, { backgroundColor: cor }]} />}
                          <Text style={[styles.filtroLinhaTexto, !layout.ehDesktop && { fontSize: 16, lineHeight: 24, letterSpacing: 0.15 }, ativo && { color: 'var(--tint-red-text)' }]} numberOfLines={1}>
                            {etapa ?? 'Todas as etapas'}
                          </Text>
                          {ativo && <IconCheck width={16} height={16} fill={iconColors.tintRedText} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <Text style={[styles.adminSectionTitle, { marginTop: 18 }]}>Estado</Text>
                {availableStates.length === 0 ? (
                  <Text style={styles.passwordModalHint}>Sem estados disponiveis.</Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {[null, ...availableStates].map(uf => {
                      const ativo = stateFilter === uf;
                      return (
                        <TouchableOpacity
                          key={uf ?? '__todos'}
                          accessibilityRole="button"
                          style={[styles.filtroLinha, { minHeight: layout.ehDesktop ? 40 : 48, borderRadius: layout.ehDesktop ? 8 : 16, paddingHorizontal: 14 }, ativo && styles.filtroLinhaAtiva]}
                          onPress={() => setStateFilter(ativo ? null : uf)}
                        >
                          <Text style={[styles.filtroLinhaTexto, ativo && { color: 'var(--tint-red-text)' }]}>{uf ?? 'Todos'}</Text>
                          {ativo && <IconCheck width={16} height={16} fill={iconColors.tintRedText} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                </ScrollView>

                <View style={styles.filtersFooter}>
                  <TouchableOpacity
                    style={styles.filtersSecondaryButton}
                    onPress={() => { setSearchQuery(''); setStateFilter(null); setStageFilter(null); setVendorFilterHubspotId(null); setVisitFilter(null); setTempFilter(null); setContaAlvoOnly(false); }}
                    disabled={activeFilterCount === 0}
                  >
                    <Text style={[styles.filtersSecondaryButtonText, activeFilterCount === 0 && { opacity: 0.4 }]}>Limpar tudo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[sharedStyles.submitButton, { flex: 1, marginTop: 0 }]} onPress={() => setIsFiltersOpen(false)}>
                    <Text style={sharedStyles.submitButtonText}>
                      {`Ver ${filteredClients.length} ${filteredClients.length === 1 ? 'lead' : 'leads'}`}
                    </Text>
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
        <Pressable style={[styles.modalOverlay, layout.ehLargo && styles.modalOverlayWeb]} onPress={() => setIsPickingRouteVendor(false)}>
          <Pressable style={[styles.filtersSheet, layout.ehLargo && styles.modalCartaoMedioWeb]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecione o vendedor</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar" onPress={() => setIsPickingRouteVendor(false)}>
                <IconClose width={20} height={20} fill={iconColors.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.ufPickerList} contentContainerStyle={{ paddingBottom: 12 }}>
              <TouchableOpacity
                style={styles.ufPickerRow}
                onPress={() => { setRouteVendorFilterHubspotId(null); setIsPickingRouteVendor(false); }}
              >
                <Text style={[styles.ufPickerRowText, routeVendorFilterHubspotId === null && styles.ufPickerRowTextActive]}>Todos os vendedores</Text>
                {routeVendorFilterHubspotId === null && <IconCheck width={16} height={16} fill={iconColors.brandText} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ufPickerRow}
                onPress={() => { setRouteVendorFilterHubspotId('__none__'); setIsPickingRouteVendor(false); }}
              >
                <Text style={[styles.ufPickerRowText, routeVendorFilterHubspotId === '__none__' && styles.ufPickerRowTextActive]}>Sem vendedor associado</Text>
                {routeVendorFilterHubspotId === '__none__' && <IconCheck width={16} height={16} fill={iconColors.brandText} />}
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
                    {selected && <IconCheck width={16} height={16} fill={iconColors.brandText} />}
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
          onCreateHubspotDeal={ensureHubspotDeal}
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
          tarefa={schedulingFor.tarefa}
          aoConcluirTarefa={(id) => resolveTask.mutate({ id, status: 'concluida' })}
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
            {/* Sem TouchableWithoutFeedback+Keyboard.dismiss por volta do conteudo: em navegador touch o wrapper vira responder do toque, cancela o click sintetico e o TextInput nunca recebe foco (nao dava pra digitar no PWA do celular). */}
            <View style={[styles.modalOverlay, layout.ehLargo && styles.modalOverlayWeb]}>
              <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }, layout.ehLargo && styles.modalCartaoWeb]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{editingClient ? 'Editar Cliente' : 'Novo Cadastro'}</Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar" onPress={() => { setIsFormOpen(false); resetForm(); setEditingClient(null); }}>
                    <IconClose width={20} height={20} fill={iconColors.muted} />
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
              <Text style={sharedStyles.fieldLabel}>Status</Text>
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
                <Text style={{ fontSize: 12, color: 'var(--brand-text)', marginTop: -4, marginBottom: 6 }}>
                  Cliente atual / ex-cliente nao pode voltar pra "lead".
                </Text>
              )}

              <Text style={sharedStyles.fieldLabel}>Informações</Text>
              <TextInput
                style={sharedStyles.input}
                placeholder="Nome do restaurante *"
                placeholderTextColor="var(--text-subtle)"
                value={form.empresa}
                onChangeText={v => setForm(s => ({ ...s, empresa: v }))}
              />
              <TextInput
                style={sharedStyles.input}
                placeholder="Nome do contato *"
                placeholderTextColor="var(--text-subtle)"
                value={form.nome}
                onChangeText={v => setForm(s => ({ ...s, nome: v }))}
              />
              <TextInput
                style={sharedStyles.input}
                placeholder="Telefone"
                placeholderTextColor="var(--text-subtle)"
                keyboardType="phone-pad"
                value={form.telefone}
                onChangeText={v => setForm(s => ({ ...s, telefone: v }))}
              />
              <TextInput
                style={sharedStyles.input}
                placeholder="Email"
                placeholderTextColor="var(--text-subtle)"
                keyboardType="email-address"
                autoCapitalize="none"
                value={form.email}
                onChangeText={v => setForm(s => ({ ...s, email: v }))}
              />

              <Text style={sharedStyles.fieldLabel}>Localização</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[sharedStyles.input, { flex: 1 }]}
                  placeholder="Cidade"
                  placeholderTextColor="var(--text-subtle)"
                  value={form.cidade}
                  onChangeText={v => setForm(s => ({ ...s, cidade: v }))}
                />
                <TextInput
                  style={[sharedStyles.input, { width: 80, marginLeft: 8 }]}
                  placeholder="UF"
                  placeholderTextColor="var(--text-subtle)"
                  maxLength={2}
                  autoCapitalize="characters"
                  value={form.estado}
                  onChangeText={v => setForm(s => ({ ...s, estado: v }))}
                />
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={[sharedStyles.input, { flex: 1 }]}
                  placeholder="Endereço (rua)"
                  placeholderTextColor="var(--text-subtle)"
                  value={form.endereco}
                  onChangeText={v => setForm(s => ({ ...s, endereco: v }))}
                />
                <TextInput
                  style={[sharedStyles.input, { width: 90, marginLeft: 8 }]}
                  placeholder="Número"
                  placeholderTextColor="var(--text-subtle)"
                  keyboardType="default"
                  value={form.numero}
                  onChangeText={v => setForm(s => ({ ...s, numero: v }))}
                />
              </View>
              <IconText Icone={IconWarning} style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: -4, marginBottom: 8 }} tone="onSurface">Confira o número — pode ter sido auto-preenchido pelo mapa e estar impreciso.</IconText>

              <Text style={sharedStyles.fieldLabel}>Observações</Text>
              <TextInput
                style={[sharedStyles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Anotações sobre este contato..."
                placeholderTextColor="var(--text-subtle)"
                multiline
                value={form.observacoes}
                onChangeText={v => setForm(s => ({ ...s, observacoes: v }))}
              />

              {/* Location summary if filled by CEP/coords */}
              {(form.latitude || form.longitude) && (
                <View style={styles.locationSummary}>
                  <IconText Icone={IconLocation} style={styles.locationSummaryText} tone="onSurface">Localização definida ({form.latitude}, {form.longitude})</IconText>
                </View>
              )}

              <View style={{ height: 16 }} />
                </ScrollView>
                <TouchableOpacity
                  style={[sharedStyles.submitButton, (!form.nome.trim() || isSaving) && { opacity: 0.5 }]}
                  onPress={editingClient ? saveEditClient : submitClient}
                  disabled={!form.nome.trim() || isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={sharedStyles.submitButtonText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ClientBottomSheet({
  client,
  insets,
  statusConfig,
  slaDays,
  meetings,
  coordCollision,
  onClose,
  onDelete,
  onEdit,
  onEditLocation,
  onMarkVisited,
  onDismissContaAlvo,
  onScheduleMeeting,
  onFollowUp,
  onChangeStage,
  onRescheduleMeeting,
  onCancelMeeting,
  isMarkingVisited,
  onAddToRoute,
  canWriteNotes = true,
  onSavePhone,
  responsavelNome,
}: {
  client: Client;
  insets: { bottom: number };
  statusConfig: Record<string, { label: string; color: string }>;
  slaDays?: SlaDays;
  meetings: ClientMeeting[];
  coordCollision: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onEditLocation?: () => void;
  onMarkVisited?: () => void;
  onDismissContaAlvo?: () => void;
  onScheduleMeeting?: () => void;
  onFollowUp?: () => void;
  onChangeStage?: () => void;
  onRescheduleMeeting?: (m: ClientMeeting) => void;
  onCancelMeeting?: (m: ClientMeeting) => void;
  isMarkingVisited: boolean;
  onAddToRoute?: () => void;
  canWriteNotes?: boolean;
  onSavePhone?: (telefone: string) => Promise<void>;
  /**
   * Nome do vendedor dono do lead. Vem de fora porque o `Client` so' guarda
   * `vendedor_id_hubspot` — o nome vive em `vendorById`, no App. Pode chegar
   * null: o RLS de `profiles` devolve so' o proprio perfil pra nao-gestor, e
   * ai' a linha simplesmente nao renderiza. NUNCA exibir o id cru.
   */
  responsavelNome?: string | null;
}) {
  const iconColors = useIconColors();
  const statusColor = statusConfig[client.status]?.color || '#3b82f6';
  const statusLabel = statusConfig[client.status]?.label || client.status;
  // Peek sheet de dois estagios no celular (prompt M1): abre no peek — o
  // mapa continua visivel e o vendedor sabe se o lead e' o da esquina ou o
  // de dois bairros. Arrastar pra cima (ou tocar a linha) expande; arrastar
  // pra baixo volta ao peek; de novo, fecha. Desktop abre completo direto.
  const [estagio, setEstagio] = useState<'peek' | 'cheia'>('peek');
  // M1d: timeline limitada a 6 — o painel passa de 1.800px e o rodape sai
  // do alcance com historico longo.
  const [historicoCompleto, setHistoricoCompleto] = useState(false);
  // Aba ativa do corpo (M1d). Volta pra Dados a cada lead: abrir um lead novo
  // na aba Agenda do anterior seria memoria de estado sem sentido pro vendedor.
  const [aba, setAba] = useState<'dados' | 'historico' | 'agenda'>('dados');
  useEffect(() => {
    setAba('dados');
  }, [client.id]);
  // O "por que?" do alerta de localizacao: em repouso a faixa diz uma linha.
  const [porQueLocal, setPorQueLocal] = useState(false);
  useEffect(() => {
    setEstagio('peek');
  }, [client.id]);

  const primaryName = getClientPrimaryName(client);
  const { user } = useAuth();

  // Separa reuniões de follow ups (linhas antigas sem type = 'reuniao').
  const sortByDate = (a: ClientMeeting, b: ClientMeeting) =>
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  const reunioes = meetings.filter(m => (m.type ?? 'reuniao') === 'reuniao').slice().sort(sortByDate);
  const followUps = meetings.filter(m => m.type === 'follow_up').slice().sort(sortByDate);

  // Chip visual de um agendamento (reunião ou follow up). O emoji distingue.
  // Recebe o COMPONENTE do icone, e nao um emoji. Emoji muda de desenho e de
  // largura em cada sistema — no Android o calendario e' outro traco, e a
  // linha desalinhava. O icone do UI Kit e' o mesmo em todo lugar e acompanha
  // a cor do tema.
  const renderMeetingChip = (m: ClientMeeting, Icone: typeof IconCalendar) => {
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
        <IconText Icone={Icone} size={14} style={styles.meetingChipDate} tone="muted">
          {label} • {durationLabel}{isPast ? ' (passada)' : ''}
        </IconText>
        {m.observacoes ? (
          <Text style={styles.meetingChipObs} numberOfLines={2}>{m.observacoes}</Text>
        ) : null}
        {!isPast && (onRescheduleMeeting || onCancelMeeting) && (
          <View style={styles.meetingChipActions}>
            {onRescheduleMeeting && (
              <TouchableOpacity
                style={sharedStyles.smallActionButton}
                onPress={() => onRescheduleMeeting(m)}
              >
                <Text style={sharedStyles.smallActionButtonText}>Reagendar</Text>
              </TouchableOpacity>
            )}
            {onCancelMeeting && (
              <TouchableOpacity
                style={[sharedStyles.smallActionButton, { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' }]}
                onPress={() => onCancelMeeting(m)}
              >
                <Text style={[sharedStyles.smallActionButtonText, { color: 'var(--tint-red-text)' }]}>Cancelar</Text>
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

    // Paletas do selo de uso do cliente. Ficam em objeto JS, e nao em
    // StyleSheet — por isso escaparam da tokenizacao automatica e eram o
    // ultimo ponto onde o tema escuro ainda pintava caixas claras.
    // `sub` fica literal de proposito: e' cor de MARCA/status (vermelho,
    // ambar, verde fortes), legivel nos dois temas.
    const VERMELHO = { bg: 'var(--tint-red)', border: 'var(--tint-red-border)', fg: 'var(--tint-red-text)', sub: '#C8131B' };
    const AMBAR = { bg: 'var(--tint-amber)', border: 'var(--tint-amber-border)', fg: 'var(--tint-amber-text)', sub: '#E09A1F' };
    const VERDE = { bg: 'var(--tint-green)', border: 'var(--tint-green-border)', fg: 'var(--tint-green-text)', sub: '#16a34a' };

    // Ex-cliente é quem está na etapa de Churn no HubSpot — NÃO quem tem data
    // de cancelamento. A data registra que houve um pedido: há clientes com
    // pedido de meses atrás que foram retidos e emitem comanda até hoje (56 na
    // primeira sincronização, o mais antigo de janeiro). Tratá-los como saída
    // pintaria de vermelho cliente saudável.
    const saiu = client.hs_situacao === 'churn';

    // Fora do churn, a cor é a recência da última comanda — e nenhuma comanda
    // é o pior caso, não ausência de informação.
    // `nivel` existe pra faixa de alertas do M1d saber POSICIONAR esta linha
    // (vermelho vai pro topo da faixa; ambar e verde vao depois da localizacao).
    // As constantes de tom sao locais, entao comparar por referencia de fora nao
    // daria — o nivel viaja junto. NAO recalcule o semaforo la' fora: `saiu`
    // (churn no HubSpot) e' um quarto estado que a regra de "dias desde a ultima
    // comanda" nao expressa, e reimplementar reintroduz o bug dos 56 retidos.
    const nivel: 'vermelho' | 'ambar' | 'verde' =
      saiu || dias === null || dias > 30 ? 'vermelho' : dias > 7 ? 'ambar' : 'verde';
    const tom = nivel === 'vermelho' ? VERMELHO : nivel === 'ambar' ? AMBAR : VERDE;

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
      ? `Última comanda: ${label(comanda)} • ${haQuanto(dias!)}`
      : 'Nenhuma comanda emitida';

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
      !saiu && cancelamento ? `Pediu cancelamento em ${label(cancelamento)}` : null,
    ].filter(Boolean) as string[];

    return {
      tom,
      nivel,
      titulo: saiu
        ? cancelamento
          ? `Cancelamento solicitado em ${label(cancelamento)}`
          : 'Ex-cliente (Churn no HubSpot)'
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

  // A forma do painel, o fechamento (X, fundo, Esc, voltar do sistema,
  // arraste) e a acessibilidade vivem no <Painel> — a casca unica do app
  // (M1b). Aqui fica so' o conteudo das faixas.
  const layout = useLayout();

  // ── Faixa de topo (M1c) ───────────────────────────────────────────────
  // Identificacao + as acoes principais, fixas: nao rolam com a ficha. No
  // desktop era reforma (o kicker e o X ja' existiam); no celular e' criacao
  // — a ficha cheia comecava no avatar, sem kicker e sem X.
  const faixaTopo = (() => {
    const temp = stageTemperature(client.etapa);
    const kicker = [
      temp ? `Lead ${temp.label}` : statusLabel,
      client.visit_count > 0 ? `${client.visit_count}ª visita` : 'sem visita',
    ].join(' · ');
    // Sublinha: contato · telefone. O contato so' aparece quando ha' empresa e
    // ela difere do nome — sem empresa, o titulo JA' e' o nome do contato e a
    // linha seria eco (decisao (d) do M1-DECISOES-2).
    const contato =
      client.empresa?.trim() && client.nome && client.nome !== client.empresa ? client.nome : null;
    const telefone = formatarTelefone(client.telefone);
    const sublinha = [contato, telefone].filter(Boolean).join(' · ');

    return (
      <View style={[styles.fichaTopo, layout.ehDesktop ? styles.fichaTopoDesktop : styles.fichaTopoMobile]}>
        <View style={styles.fichaTopoLinha}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.fichaKickerLinha}>
              {temp && (
                <View
                  style={[
                    styles.fichaKickerDot,
                    layout.ehDesktop ? null : styles.fichaKickerDotMobile,
                    { backgroundColor: temp.color },
                  ]}
                />
              )}
              <Text style={styles.fichaKicker} numberOfLines={1}>{kicker}</Text>
              <View style={[styles.fichaBadgeStatus, { backgroundColor: statusColor }]}>
                <Text style={[styles.fichaBadgeStatusTexto, { color: textoSobre(statusColor) }]}>
                  {statusLabel}
                </Text>
              </View>
              {/* "Aprox." e' icone, nao badge de texto: o detalhe completo ja'
                  esta' na faixa de alertas, e dizer duas vezes na mesma tela e'
                  ruido (M1-DECISOES-3 §2). */}
              {isApprox && (
                <IconLocation
                  width={16}
                  height={16}
                  fill="#FFB32F"
                  {...({ title: 'Localização aproximada' } as Record<string, unknown>)}
                />
              )}
            </View>
            <Text style={styles.fichaNome} numberOfLines={1}>{primaryName}</Text>
            {sublinha ? (
              <Text style={styles.fichaSublinha} numberOfLines={1}>{sublinha}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            style={layout.ehDesktop ? styles.fichaFecharDesktop : styles.fichaFecharMobile}
            {...(layout.ehDesktop ? ds({ hover: 'surface2', trans: '1' }) : {})}
            onPress={onClose}
          >
            <IconClose width={24} height={24} fill={iconColors.muted} />
          </TouchableOpacity>
        </View>

        {/* Desktop: tres acoes com rotulo flush-left. Celular: duas de 48px em
            grade, com rotulos CURTOS — "Mudar etapa" quebra em 390px. */}
        <View style={styles.fichaAcoes}>
          {onChangeStage && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Mudar etapa"
              style={layout.ehDesktop ? styles.drawerAcaoCheia : styles.fichaAcaoMobileCheia}
              {...(layout.ehDesktop ? ds({ hover: 'darkred', trans: '1' }) : {})}
              onPress={onChangeStage}
            >
              <IconTrendingUp width={24} height={24} fill="#FFFFFF" />
              <Text style={layout.ehDesktop ? styles.drawerAcaoCheiaTexto : styles.fichaAcaoMobileCheiaTexto}>
                {layout.ehDesktop ? 'Mudar etapa' : 'Etapa'}
              </Text>
            </TouchableOpacity>
          )}
          {onScheduleMeeting && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Agendar"
              style={layout.ehDesktop ? styles.drawerAcaoVazada : styles.fichaAcaoMobileVazada}
              {...(layout.ehDesktop ? ds({ hover: 'tintred', trans: '1' }) : {})}
              onPress={onScheduleMeeting}
            >
              <IconCalendar width={24} height={24} fill={iconColors.brandText} />
              <Text style={layout.ehDesktop ? styles.drawerAcaoVazadaTexto : styles.fichaAcaoMobileVazadaTexto}>
                Agendar
              </Text>
            </TouchableOpacity>
          )}
          {/* O "Mais" fica FORA do condicional das duas acoes: onChangeStage so'
              existe pra status 'lead', e num cliente o menu ficava inalcancavel. */}
          {layout.ehDesktop && (onEdit || onEditLocation || onAddToRoute || onDelete) && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Mais ações"
              style={styles.drawerAcaoMais}
              {...ds({ hover: 'surface2', trans: '1' })}
              onPress={() => {
                const botoes = [
                  onEdit && { text: 'Editar', onPress: onEdit },
                  onEditLocation && { text: 'Editar localização', onPress: onEditLocation },
                  onAddToRoute && { text: 'Adicionar à rota', onPress: onAddToRoute },
                  onDelete && { text: 'Excluir', style: 'destructive' as const, onPress: onDelete },
                  { text: 'Cancelar', style: 'cancel' as const },
                ].filter(Boolean) as Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }>;
                Alert.alert(primaryName, 'Mais ações', botoes);
              }}
            >
              <IconMenuCircles width={24} height={24} fill={iconColors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  })();

  // ── Aba Dados: par chave/valor (M1d) ──────────────────────────────────
  // Campo vazio NAO renderiza a linha: sete linhas de "—" nao sao dado.
  // `empilha` e' pro valor longo no celular (endereco, coordenadas) — chave em
  // cima, valor embaixo em 16/24/0.5, sem numberOfLines.
  const campo = (
    chave: string,
    Icone: typeof IconUser,
    presente: unknown,
    valor: React.ReactNode,
    opcoes?: { tabular?: boolean; empilha?: boolean },
  ) => {
    if (!presente) return null;
    const empilhado = !layout.ehDesktop && opcoes?.empilha;
    return (
      <View style={[styles.dadoLinha, empilhado && styles.dadoLinhaEmpilhada]}>
        <View style={styles.dadoChave}>
          <Icone width={16} height={16} fill={iconColors.faint} />
          <Text style={styles.dadoChaveTexto}>{chave}</Text>
        </View>
        <Text
          style={[
            empilhado ? styles.dadoValorEmpilhado : styles.dadoValor,
            opcoes?.tabular && styles.tabular,
          ]}
        >
          {valor}
        </Text>
      </View>
    );
  };

  // Contato so' vira campo quando ha' empresa e ela difere do nome — sem
  // empresa, o titulo do painel JA' e' o nome do contato.
  const contatoDoLead =
    client.empresa?.trim() && client.nome && client.nome !== client.empresa ? client.nome : null;

  // SLA aparece na aba Dados so' no estado "em dia". Estourado e ambar vao pra
  // faixa de alertas; `applies: false` nao tem o que informar em lugar nenhum.
  const slaEmDia = (() => {
    const s = slaStatus(client, slaDays);
    if (!s.applies || s.breach || s.ratio >= 0.7) return null;
    return `${s.diasParado}/${s.sla} dias parado`;
  })();

  // Telefone e' linha ESPECIAL: com onSavePhone e' campo editavel (grava pelo
  // mesmo updateClient do formulario, entao sincroniza HubSpot); sem ele
  // (viewer) volta a ser par chave/valor comum.
  // O campo ocupa a coluna do valor, mas o TEXTO fica a ESQUERDA dentro dele:
  // alinhado a direita, o caret corre enquanto se digita (M1-DECISOES-2 (g)).
  // Nada de Touchable em volta do TextInput — regra do CLAUDE.md.
  const linhaTelefone = onSavePhone ? (
    <View style={[styles.dadoLinha, !layout.ehDesktop && styles.dadoLinhaEmpilhada]}>
      <View style={styles.dadoChave}>
        <IconCall width={16} height={16} fill={iconColors.faint} />
        <Text style={styles.dadoChaveTexto}>Telefone</Text>
      </View>
      <View style={styles.telefoneCaixa}>
        <TextInput
          style={[styles.telefoneCampo, layout.ehDesktop ? styles.telefoneCampoDesktop : styles.telefoneCampoMobile]}
          value={phoneDraft}
          onChangeText={setPhoneDraft}
          placeholder="(00) 00000-0000"
          placeholderTextColor="var(--text-subtle)"
          keyboardType="phone-pad"
          editable={!savingPhone}
        />
        {phoneDirty && (
          <TouchableOpacity
            onPress={handleSavePhone}
            disabled={savingPhone}
            style={[styles.telefoneSalvar, layout.ehDesktop ? styles.telefoneSalvarDesktop : styles.telefoneSalvarMobile]}
          >
            {savingPhone ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.telefoneSalvarTexto}>Salvar</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  ) : (
    campo('Telefone', IconCall, client.telefone, formatarTelefone(client.telefone))
  );

  // ── Faixa de alertas (M1-MAPEAMENTO + decisoes 1 e 3) ─────────────────
  // Ordem POR TIPO, nao por severidade: quem perde dinheiro primeiro fica em
  // cima. O uso do produto aparece em DUAS posicoes conforme o tom — vermelho
  // antes do SLA, ambar/verde depois da localizacao.
  // Sem nenhum alerta, a faixa nao existe (nao renderiza caixa vazia).
  const faixaAlertas = (() => {
    const sla = slaStatus(client, slaDays);
    const slaNaFaixa = sla.applies && (sla.breach || sla.ratio >= 0.7);

    const linha = (
      chave: string,
      cor: string,
      fundo: string,
      corTexto: string,
      Icone: typeof IconWarning,
      principal: string,
      detalhes: React.ReactNode,
    ) => (
      <View
        key={chave}
        style={[
          styles.alerta,
          layout.ehDesktop ? styles.alertaDesktop : null,
          { borderLeftColor: cor, backgroundColor: fundo },
        ]}
      >
        <Icone width={20} height={20} fill={cor} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.alertaTexto, { color: corTexto }]}>{principal}</Text>
          {detalhes}
        </View>
      </View>
    );

    const usoLinha = (
      <>
        {uso?.linhas.map((l) => (
          <Text key={l} style={[styles.alertaDetalhe, { color: uso.tom.fg }]}>{l}</Text>
        ))}
        {uso?.rodape ? (
          <Text style={[styles.alertaDetalhe, { color: uso.tom.fg }]}>{uso.rodape}</Text>
        ) : null}
      </>
    );

    const linhas: React.ReactNode[] = [];

    // 1 · uso do produto no vermelho
    if (uso && uso.nivel === 'vermelho') {
      linhas.push(linha('uso', iconColors.tintRedText, 'var(--tint-red)', 'var(--tint-red-text)', IconBill, uso.titulo, usoLinha));
    }

    // 2 · SLA estourado, depois ambar
    if (slaNaFaixa) {
      const cor = sla.breach ? iconColors.tintRedText : '#FFB32F';
      const texto = sla.breach
        ? `SLA estourado — ${sla.diasParado} ${sla.diasParado === 1 ? 'dia' : 'dias'} parado (limite ${sla.sla})`
        : `${sla.diasParado}/${sla.sla} dias parado`;
      linhas.push(
        linha(
          'sla',
          cor,
          sla.breach ? 'var(--tint-red)' : 'var(--tint-amber)',
          sla.breach ? 'var(--tint-red-text)' : 'var(--tint-amber-text)',
          IconWarning,
          texto,
          null,
        ),
      );
    }

    // 3 · localizacao aproximada — colapsada. Em producao ocupava quatro linhas
    // pra dizer uma coisa; o detalhe fica atras do "por que?".
    if (isApprox) {
      linhas.push(
        linha(
          'geo',
          '#FFB32F',
          'var(--tint-amber)',
          'var(--tint-amber-text)',
          IconLocation,
          'Localização aproximada',
          <>
            {porQueLocal ? (
              <>
                <Text style={[styles.alertaDetalhe, { color: 'var(--tint-amber-text)' }]}>{sourceLabel}</Text>
                {approxReasons.map((r) => (
                  <Text key={r} style={[styles.alertaDetalhe, { color: 'var(--tint-amber-text)' }]}>• {r}</Text>
                ))}
              </>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              // A caixa visual e' de 24px (uma linha de 12/16 com 4 de folga);
              // o hitSlop leva o ALVO a 48, sem inchar a faixa.
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              onPress={() => setPorQueLocal((v) => !v)}
              style={styles.alertaPorQue}
            >
              <Text style={[styles.alertaPorQueTexto, { color: 'var(--tint-amber-text)' }]}>
                {porQueLocal ? 'ocultar' : 'por quê?'}
              </Text>
            </TouchableOpacity>
          </>,
        ),
      );
    }

    // 4 · uso do produto no ambar/verde
    if (uso && uso.nivel !== 'vermelho') {
      const cor = uso.nivel === 'ambar' ? '#FFB32F' : iconColors.tintGreenText;
      linhas.push(
        linha(
          'uso',
          cor,
          uso.nivel === 'ambar' ? 'var(--tint-amber)' : 'var(--tint-green)',
          uso.nivel === 'ambar' ? 'var(--tint-amber-text)' : 'var(--tint-green-text)',
          IconBill,
          uso.titulo,
          usoLinha,
        ),
      );
    }

    // 5 · visita realizada — confirmacao, nao urgencia: fecha a faixa.
    if (visitCount > 0) {
      linhas.push(
        linha(
          'visita',
          iconColors.tintGreenText,
          'var(--tint-green)',
          'var(--tint-green-text)',
          IconLocationFilled,
          `${visitCount} ${visitCount === 1 ? 'visita realizada' : 'visitas realizadas'}`,
          client.visited_at ? (
            <Text style={[styles.alertaDetalhe, { color: 'var(--tint-green-text)' }]}>
              Última: {new Date(client.visited_at).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          ) : null,
        ),
      );
    }

    if (linhas.length === 0) return null;
    return (
      <View style={[styles.faixaAlertas, layout.ehDesktop ? null : styles.faixaAlertasMobile]}>
        {linhas}
      </View>
    );
  })();

  // ── Barra de abas (M1-MAPEAMENTO) ─────────────────────────────────────
  // Gruda no topo do corpo: no celular a folha e' 92% e a aba Historico rola
  // varios viewports — sem grudar, trocar de aba obriga a rolar de volta.
  // Ela PRECISA pintar o proprio fundo: o wrapper sticky do RNW nao tem cor.
  const barraDeAbas = (() => {
    const abas: Array<{ id: 'dados' | 'historico' | 'agenda'; rotulo: string }> = [
      { id: 'dados', rotulo: 'Dados' },
      { id: 'historico', rotulo: `Histórico${timeline.length > 0 ? ` (${timeline.length})` : ''}` },
      {
        id: 'agenda',
        rotulo: `Agenda${reunioes.length + followUps.length > 0 ? ` (${reunioes.length + followUps.length})` : ''}`,
      },
    ];
    return (
      <View style={[styles.abasBarra, layout.ehDesktop ? styles.abasBarraDesktop : styles.abasBarraMobile]}>
        {abas.map((a) => {
          const ativa = aba === a.id;
          return (
            <TouchableOpacity
              key={a.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: ativa }}
              style={[
                styles.abaItem,
                layout.ehDesktop ? styles.abaItemDesktop : styles.abaItemMobile,
                ativa && styles.abaItemAtiva,
              ]}
              onPress={() => setAba(a.id)}
            >
              <Text style={[styles.abaTexto, ativa && styles.abaTextoAtiva]} numberOfLines={1}>
                {a.rotulo}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  })();

  return (
    <Painel
      visivel
      aoFechar={onClose}
      rotulo={primaryName}
      topo={faixaTopo}
      estagio={estagio}
      aoTrocarEstagio={setEstagio}
      estiloCorpo={layout.ehDesktop ? styles.corpoDesktop : styles.corpoMobile}
      estiloConteudoCorpo={{ paddingBottom: insets.bottom + 24 }}
      // A barra de abas e' o filho de indice 1 do corpo.
      indicesGrudados={[1]}
      // Estagio 1 (celular): peek — linha do lead + tres acoes de 48px.
      // O restante da ficha so' monta no estagio 2.
      peek={
            <View style={styles.peekCorpo}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Abrir ficha completa"
                style={styles.peekLinha}
                onPress={() => setEstagio('cheia')}
              >
                <View
                  style={[
                    styles.peekBarraTemp,
                    { backgroundColor: client.conta_alvo_place_id ? CONTA_ALVO_COLOR : stageTemperature(client.etapa)?.color ?? statusColor },
                  ]}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.peekNome} numberOfLines={1}>{primaryName}</Text>
                  <Text style={styles.peekSub} numberOfLines={1}>
                    {[client.etapa ?? statusLabel, client.visit_count > 0 ? `${client.visit_count}ª visita` : 'sem visita']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {stageTemperature(client.etapa) && (
                  <View style={[styles.peekBadge, { backgroundColor: 'var(--surface-2)' }]}>
                    <View style={[sharedStyles.filterDot, { backgroundColor: stageTemperature(client.etapa)!.color }]} />
                    <Text style={styles.peekBadgeTexto}>{stageTemperature(client.etapa)!.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {onMarkVisited && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[styles.peekCheckin, isMarkingVisited && { opacity: 0.6 }]}
                    disabled={isMarkingVisited}
                    onPress={onMarkVisited}
                  >
                    {isMarkingVisited ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <IconLocationFilled width={24} height={24} fill="#FFFFFF" />
                        <Text style={styles.peekCheckinTexto}>{client.visited_at ? 'Re-marcar' : 'Check-in'}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Navegar até o lead"
                  style={[styles.peekQuadrado, client.latitude === null && { opacity: 0.4 }]}
                  disabled={client.latitude === null}
                  onPress={() =>
                    openNavigation({
                      latitude: client.latitude as number,
                      longitude: client.longitude as number,
                      clientName: primaryName,
                      travelMode: 'driving',
                    })
                  }
                >
                  <IconCar width={24} height={24} fill={iconColors.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Ligar para o lead"
                  style={[styles.peekQuadrado, !client.telefone && { opacity: 0.4 }]}
                  disabled={!client.telefone}
                  onPress={() => client.telefone && Linking.openURL(`tel:${client.telefone.replace(/\D/g, '')}`)}
                >
                  <IconCall width={24} height={24} fill={iconColors.muted} />
                </TouchableOpacity>
              </View>
            </View>
      }
    >
      {/* Filhos do corpo como ARRAY EXPLICITO de tres posicoes: a barra de
          abas gruda pelo indice 1, e um `{cond && ...}` solto como irmao
          deslocaria esse indice em silencio conforme o lead tem ou nao
          alerta. Por isso a faixa vazia vira <View /> em vez de sumir. */}
      {[
        faixaAlertas ?? <View key="sem-alertas" />,
        barraDeAbas,
        <View key="conteudo" style={styles.abaConteudo}>

        {/* ─────────────────────────── ABA DADOS ─────────────────────────── */}
        {aba === 'dados' && (
          <>
{/* Conta Alvo: nota + avaliações do Google (via Serper) + "Não
              interessa". Só nos leads trazidos pela Rota do dia. */}
          {client.conta_alvo_place_id && (
            <View style={styles.contaAlvoBox}>
              <IconText Icone={IconStar} style={styles.contaAlvoBoxTitle} tone="onSurface">Conta Alvo</IconText>
              {client.conta_alvo_rating != null && (
                <Text style={styles.contaAlvoBoxText}>
                  {Number(client.conta_alvo_rating).toFixed(1)}★
                  {client.conta_alvo_reviews != null
                    ? ` · ${client.conta_alvo_reviews.toLocaleString('pt-BR')} avaliações`
                    : ''}
                  {' '}no Google
                </Text>
              )}
              {/* "Não interessa": só faz sentido enquanto não virou deal. */}
              {onDismissContaAlvo && !client.id_hubspot && (
                <TouchableOpacity style={styles.contaAlvoDismissBtn} onPress={onDismissContaAlvo}>
                  <IconText Icone={IconCloseCircle} style={styles.contaAlvoDismissText} tone="onSurface">Não interessa (descartar)</IconText>
                </TouchableOpacity>
              )}
            </View>
          )}

            {/* Observacao principal: card no topo da aba, nao paragrafo solto
                no meio do painel. */}
            {client.observacoes ? (
              <View style={[styles.cartaoDado, layout.ehDesktop ? styles.cartaoDadoDesktop : styles.cartaoDadoMobile]}>
                <Text style={styles.cartaoDadoTitulo}>OBSERVAÇÃO PRINCIPAL</Text>
                <Text style={styles.cartaoDadoTexto}>{client.observacoes}</Text>
              </View>
            ) : null}

            {/* Pares chave/valor. Campo vazio NAO renderiza a linha — sete
                linhas de "—" nao sao dado, sao ruido. */}
            <View style={styles.dadosGrade}>
              {campo('Contato', IconUser, contatoDoLead, contatoDoLead)}
              {linhaTelefone}
              {campo('Email', IconMail, client.email, client.email)}
              {campo('Etapa', IconTrendingUp, client.etapa, client.etapa)}
              {campo('SLA', IconClock, slaEmDia, slaEmDia, { tabular: true })}
              {campo(
                'Endereço',
                IconHome,
                client.endereco,
                `${client.endereco}${client.numero ? `, ${client.numero}` : ' (sem número)'}`,
                { empilha: true },
              )}
              {campo('Bairro', IconStore, client.bairro, client.bairro)}
              {campo(
                'Cidade / UF',
                IconLocation,
                client.cidade || client.estado,
                `${client.cidade || ''}${client.estado ? ` • ${client.estado}` : ''}`,
              )}
              {campo('CEP', IconMail, client.cep, client.cep, { tabular: true })}
              {campo(
                'Coordenadas',
                IconLocation,
                client.latitude !== null && client.longitude !== null,
                `${Number(client.latitude).toFixed(6)}, ${Number(client.longitude).toFixed(6)}`,
                { tabular: true, empilha: true },
              )}
              {campo('Empresa', IconStore, client.empresa, client.empresa)}
              {campo('Responsável', IconManager, responsavelNome, responsavelNome)}
              {campo('ID HubSpot', IconIdCard, client.id_hubspot, client.id_hubspot, { tabular: true })}
              {campo(
                'Criado / atualizado',
                IconClock,
                createdAt || updatedAt,
                `${createdAt ?? '—'}${updatedAt && updatedAt !== createdAt ? ` → ${updatedAt}` : ''}`,
              )}
            </View>

            {/* Caminho pro registro completo. E' o url_hubspot que manda, nao o
                id: lead pode ter id sem url, e link pra lugar nenhum e' pior
                que nenhum link. */}
            {client.url_hubspot ? (
              <TouchableOpacity
                accessibilityRole="link"
                style={styles.linhaLink}
                onPress={() => Linking.openURL(client.url_hubspot!).catch(() => Alert.alert('Erro', 'Não foi possível abrir o link.'))}
              >
                <IconExternalLink width={20} height={20} fill={iconColors.info} />
                <Text style={styles.linhaLinkTexto}>Abrir no HubSpot</Text>
              </TouchableOpacity>
            ) : null}

            {/* TEMPORARIO — estas nove acoes saem daqui: o check-in vai pro
                rodape fixo (M1e) e as outras oito viram itens do menu (M1c2).
                Ficam aqui, sem mudanca de estilo nem de copy, pra nenhuma
                funcionalidade sumir no meio do caminho. */}
            <View style={styles.acoesTemporarias}>
  {/* Acoes rapidas no topo: visita (acao mais usada em campo) e
                  editar — antes ficavam no fim do sheet, exigindo rolar tudo. */}
              {(onMarkVisited || onEdit) && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  {onMarkVisited && (
                    <TouchableOpacity
                      disabled={isMarkingVisited}
                      style={[styles.acaoPrimaria, { flex: 1 }, layout.ehDesktop && { backgroundColor: '#27A84C' }, isMarkingVisited && { opacity: 0.6 }]}
                      onPress={onMarkVisited}
                    >
                      {isMarkingVisited ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.acaoPrimariaTexto}>
                          {client.visited_at ? 'Re-marcar visita' : 'Marcar como visitado'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {onEdit && (
                    <TouchableOpacity
                      style={[styles.acaoSecundaria, { marginTop: 0, paddingHorizontal: 18 }]}
                      onPress={onEdit}
                    >
                      <IconText Icone={IconPencil} style={styles.acaoSecundariaTexto} tone="onSurface">Editar</IconText>
                    </TouchableOpacity>
                  )}
                </View>
              )}

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
                <Text style={[sharedStyles.fieldLabel, { marginBottom: 8 }]}>Traçar Rota</Text>
                {client.latitude && client.longitude && (
                  <View style={[styles.navigationRow, { marginBottom: 8 }]}>
                    <TouchableOpacity
                      style={[styles.navRouteButton, styles.navButtonDriving]}
                      onPress={() => {
                        openNavigation({ latitude: client.latitude as number, longitude: client.longitude as number, clientName: primaryName, travelMode: 'driving' });
                        onClose();
                      }}
                    >
                      <IconText Icone={IconCar} style={styles.navRouteButtonText} tone="onSurface">Carro</IconText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.navRouteButton, styles.navButtonWalking]}
                      onPress={() => {
                        openNavigation({ latitude: client.latitude as number, longitude: client.longitude as number, clientName: primaryName, travelMode: 'walking' });
                        onClose();
                      }}
                    >
                      <IconText Icone={IconUser} style={styles.navRouteButtonText} tone="onSurface">A pé</IconText>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.acaoSecundaria}
                  onPress={() => {
                    const addressParts = [client.endereco, client.numero, client.bairro, client.cidade, client.estado, client.cep]
                      .filter(Boolean)
                      .join(', ');
                    const query = addressParts ? `${addressParts}, Brasil` : primaryName;
                    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                    Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o Google Maps.'));
                  }}
                >
                  <IconText Icone={IconExternalLink} style={styles.acaoSecundariaTexto} tone="onSurface">Abrir no Google Maps</IconText>
                </TouchableOpacity>
                {(() => {
                  const waNum = toWhatsappNumber(client.telefone);
                  return (
                    <TouchableOpacity
                      style={[styles.acaoSecundaria, !waNum && { opacity: 0.5 }]}
                      disabled={!waNum}
                      onPress={() => openWhatsapp(client.telefone)}
                    >
                      <IconText Icone={IconWhatsapp} style={styles.acaoSecundariaTexto} tone="onSurface">
                        {waNum ? 'Abrir WhatsApp' : 'WhatsApp (sem telefone)'}
                      </IconText>
                    </TouchableOpacity>
                  );
                })()}
              </View>

  {/* Mover para etapa: admin-only durante testes. Dispara webhook change_stage.
                  Se o cliente não tiver id_hubspot, o modal alerta. */}
              {onChangeStage && (
                <TouchableOpacity
                  style={styles.changeStageButton}
                  onPress={onChangeStage}
                >
                  <IconText Icone={IconRefresh} style={styles.changeStageButtonText} tone="onSurface">Mover para etapa</IconText>
                </TouchableOpacity>
              )}

              {/* Marcar como visitado + Editar migraram pro TOPO do sheet
                  (acoes mais usadas em campo — sem precisar rolar ate aqui). */}

              {/* Actions */}
              {onEditLocation && (
                <TouchableOpacity
                  style={[styles.acaoSecundaria, { marginBottom: 8 }]}
                  onPress={onEditLocation}
                >
                  <IconText Icone={IconPencil} style={styles.acaoSecundariaTexto} tone="onSurface">Editar localização (mover pin)</IconText>
                </TouchableOpacity>
              )}
              {onDelete && (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
                    <Text style={styles.deleteButtonText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        )}

        {/* ────────────────────────── ABA HISTORICO ──────────────────────── */}
        {/* Timeline unificada: notas de campo + mudancas de etapa + reunioes +
            check-ins, mais recentes em cima. Mudancas de etapa sao imutaveis;
            notas mantem editar/apagar pro autor. O cabecalho saiu: o rotulo da
            aba ja' diz "Histórico (n)". */}
        {aba === 'historico' && (
          <View style={styles.notesSection}>
            {timeline.length === 0 ? (
              <Text style={styles.meetingsEmpty}>Sem histórico ainda.</Text>
            ) : (
              (historicoCompleto ? timeline : timeline.slice(0, 6)).map((entry) => {
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
                    <View key={`stage-${change.id}`} style={[styles.noteItem, styles.timelineLinha]}>
                      <View style={[styles.timelinePill, { backgroundColor: '#FFF1E0' }]}>
                        <IconTrendingUp width={16} height={16} fill="#8A4A0C" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.noteHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <IconText Icone={IconRefresh} size={13} style={styles.noteAuthor} tone="muted">
                            {authorLabel}
                          </IconText>
                          <Text style={styles.noteDate}>{when}</Text>
                        </View>
                      </View>
                      <Text style={[styles.noteBody, { fontWeight: '600' }]}>
                        Moveu etapa: {arrow}
                      </Text>
                      </View>
                    </View>
                  );
                }
                if (entry.kind === 'meeting') {
                  const m = entry.meeting;
                  const isFollowUp = m.type === 'follow_up';
                  const isPast = new Date(m.scheduled_at).getTime() < Date.now();
                  return (
                    <View key={`meeting-${m.id}`} style={[styles.noteItem, styles.timelineLinha]}>
                      <View style={[styles.timelinePill, { backgroundColor: '#F1EBFE' }]}>
                        <IconCalendar width={16} height={16} fill="#5B32C4" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.noteHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.noteAuthor} numberOfLines={1}>
                            {isFollowUp ? 'Follow up' : 'Reunião/demo'}
                            {isPast ? ' (realizada/passada)' : ' (agendada)'}
                          </Text>
                          <Text style={styles.noteDate}>{when}</Text>
                        </View>
                      </View>
                      {m.observacoes ? (
                        <Text style={styles.noteBody}>{m.observacoes}</Text>
                      ) : null}
                      </View>
                    </View>
                  );
                }
                if (entry.kind === 'visit') {
                  return (
                    <View key={`visit-${entry.createdAt}`} style={[styles.noteItem, styles.timelineLinha]}>
                      <View style={[styles.timelinePill, { backgroundColor: '#EAF7EE' }]}>
                        <IconLocationFilled width={16} height={16} fill="#167532" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.noteHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <IconText Icone={IconLocation} size={13} style={styles.noteAuthor} tone="muted">
                            Check-in de visita
                            {entry.visitNumber ? ` — ${entry.visitNumber}ª` : ''}
                          </IconText>
                          <Text style={styles.noteDate}>
                            {when}{entry.visitedByName ? ` • ${entry.visitedByName}` : ''}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.noteBody, { fontWeight: '600' }]}>
                        Cliente visitado no local
                      </Text>
                      </View>
                    </View>
                  );
                }
                const note = entry.note;
                const isMine = !!user?.id && note.created_by === user.id;
                const isEditing = editingNoteId === note.id;
                const wasEdited = new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 2000;
                const authorLabel = note.created_by_name || note.created_by_email || 'Autor desconhecido';
                return (
                  <View key={`note-${note.id}`} style={[styles.noteItem, styles.timelineLinha]}>
                    <View style={[styles.timelinePill, { backgroundColor: 'var(--surface-2)' }]}>
                      <IconPencil width={16} height={16} fill={iconColors.muted} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.noteHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <IconText Icone={IconUser} size={13} style={styles.noteAuthor} tone="muted">{authorLabel}</IconText>
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
                            <Text style={[styles.noteAction, { color: 'var(--brand-text)' }]}>Apagar</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {isEditing ? (
                      <>
                        <TextInput
                          style={[sharedStyles.input, { marginTop: 8, marginBottom: 0, minHeight: 60 }]}
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
                  </View>
                );
              })
            )}
            {timeline.length > 6 && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setHistoricoCompleto(v => !v)}
                style={{ paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: 'var(--info-text)' }}>
                  {historicoCompleto ? 'Mostrar menos' : `Ver histórico completo (${timeline.length})`}
                </Text>
              </TouchableOpacity>
            )}
            {canWriteNotes && (
              <>
                <TextInput
                  style={[sharedStyles.input, { marginTop: 8, minHeight: 64 }]}
                  placeholder="Adicionar nova nota..."
                  placeholderTextColor="var(--text-subtle)"
                  value={newNote}
                  onChangeText={setNewNote}
                  multiline
                  editable={!addNote.isPending}
                />
                <TouchableOpacity
                  style={[sharedStyles.submitButton, (!newNote.trim() || addNote.isPending) && { opacity: 0.5 }]}
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
                    <Text style={sharedStyles.submitButtonText}>Adicionar nota</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ─────────────────────────── ABA AGENDA ────────────────────────── */}
        {aba === 'agenda' && (
          <>
{/* Reuniões agendadas */}
          <View style={styles.meetingsSection}>
            <View style={styles.meetingsHeader}>
              <Text style={sharedStyles.fieldLabel}>
                Reuniões
              </Text>
            </View>
            {reunioes.length === 0 ? (
              <Text style={styles.meetingsEmpty}>Nenhuma reunião agendada.</Text>
            ) : (
              reunioes.map((m) => renderMeetingChip(m, IconCalendar))
            )}
            {/* Agendar reuniao: so de "Conversa com decisor" em diante no
                funil — antes disso a cadencia ainda nao pede demo. */}
            {onScheduleMeeting && canScheduleMeeting && (
              <TouchableOpacity
                style={styles.scheduleButton}
                onPress={onScheduleMeeting}
              >
                <IconText Icone={IconCalendar} style={styles.scheduleButtonText} tone="onSurface">Agendar reunião</IconText>
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
              <Text style={sharedStyles.fieldLabel}>
                Follow ups
              </Text>
            </View>
            {followUps.length === 0 ? (
              <Text style={styles.meetingsEmpty}>Nenhum follow up marcado.</Text>
            ) : (
              followUps.map((m) => renderMeetingChip(m, IconRefresh))
            )}
            {onFollowUp && (
              <TouchableOpacity
                style={styles.followUpButton}
                onPress={onFollowUp}
              >
                <IconText Icone={IconRefresh} style={styles.followUpButtonText} tone="onSurface">Marcar Follow Up</IconText>
              </TouchableOpacity>
            )}
          </View>
          </>
        )}

        </View>,
      ]}
    </Painel>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MainApp />
          {/* Host dos Alert.alert. Fica no topo da arvore e FORA do MainApp
              pra continuar montado mesmo quando a tela que disparou o alerta
              desmonta (ex.: erro ao salvar que fecha o modal). */}
          <AlertHost />
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
    backgroundColor: 'var(--surface)',
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
    backgroundColor: 'var(--surface)',
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
  bottomCardLabel: { color: 'var(--text-muted)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  bottomCardTitle: { color: 'var(--text)', fontSize: 19, fontWeight: '800', marginTop: 2 },
  bottomCardSubtitle: { color: 'var(--text-muted)', fontSize: 13, marginTop: 1 },
  bottomCardMetaRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  bottomCardMeta: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  bottomCardWarning: { fontSize: 12, color: 'var(--brand-text)', fontWeight: '700', marginTop: 6 },
  bottomCardActions: { gap: 8 },
  bottomCardButton: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  bottomCardButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  bottomCardSecondaryRow: { flexDirection: 'row', gap: 8 },
  bottomCardSecondaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
  },
  bottomCardSecondaryText: { color: 'var(--text)', fontSize: 14, fontWeight: '700' },
});

// Coluna de navegacao do desktop. 72px e' o rail compacto: icone + rotulo
// Details (8px/600 — o token do DS pra "nav module labels below icons",
// Desktop-only). 96px sobrava e roubava conteudo.
const LARGURA_LATERAL = 72;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'var(--surface)' },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#C8131B',
  },
  // No escuro o vermelho chapado no topo cansa e briga com a superficie.
  headerEscuro: { backgroundColor: 'var(--surface)' },
  headerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarTexto: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 32, height: 32, tintColor: '#fff', resizeMode: 'contain' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  logoutButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6 },
  logoutButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconButton: {
    // 44x44 em vez de 32x32, com TAMANHO REAL e nao hitSlop: testado no
    // navegador, o react-native-web ignora hitSlop no TouchableOpacity —
    // clique 5px fora da caixa nao dispara nada. Fica no canto superior, onde
    // o polegar ja' alcanca mal.
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: { fontSize: 16 },
  passwordModalHint: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 },
  // Atalho pro cockpit de gestão (/gestao). Vermelho da marca: é a ação
  // principal desta tela pra quem é gestor.
  // Seletor de tema (Automático / Claro / Escuro).
  adminSectionTitle: { fontSize: 12, fontWeight: '700', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  skipLocationButton: { marginTop: 18, paddingHorizontal: 16, paddingVertical: 10 },
  skipLocationButtonText: { color: 'var(--text-muted)', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: 'var(--text)', marginBottom: 8, textAlign: 'center' },
  permissionBody: { fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  permissionPrimaryButton: {
    backgroundColor: '#C8131B',
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
    borderColor: 'var(--border)',
  },
  permissionSecondaryButtonText: { color: 'var(--text-muted)', fontSize: 14, fontWeight: '600' },
  // Filter Bar
  filterBar: { backgroundColor: 'var(--surface)', borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)' },
  // paddingRight maior que o esquerdo de proposito: quando a lista chega ao
  // fim, o ultimo chip fica com ar em vez de colado na borda da tela (antes
  // parecia cortado/quebrado, nao rolavel).
  filterScroll: { paddingLeft: 12, paddingRight: 20, paddingVertical: 8, gap: 6 },
  filterChipActive: { backgroundColor: '#C8131B' },
  // Multi-select dos status na aba Rota (wrap, varios chips em ordem livre)
  // Resultado da busca manual: titulo + cidade + botao adicionar
  // Badge admin: indica qual roteador foi usado pra otimizar a ultima rota.
  // Card de stop da rota (com checkbox + linha de acoes)
  // Banner de monitoramento (gestor vendo a rota de outro vendedor).
  checkboxCheckmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  // Search bar (busca por nome) — fica acima dos chips de status.
  // O icone de busca virou SVG do UI Kit (dimensionado por props), entao este
  // estilo so' serve pros pontos que ainda usam o emoji 🔍 em <Text>.
  searchIcon: { fontSize: 14, color: 'var(--text-muted)' },
  // minHeight 40: com `padding: 0`, a caixa do <input> tinha 17px de altura —
  // medido na tela. O container tem padding, mas clicar no padding NAO foca o
  // campo (nao ha <label> associado), entao o alvo real de toque era a faixa
  // de 17px. Com 40 aqui + 8 de padding do container, a barra fica em 56.
  searchClear: { color: 'var(--text-muted)', fontSize: 14, paddingHorizontal: 4 },
  // Linha horizontal com o icone de filtros ancorado a esquerda + chips de status rolando.
  filterBarRow: { flexDirection: 'row', alignItems: 'center' },
  filterIconButton: {
    width: 40,
    height: 36,
    marginLeft: 8,
    borderRadius: 10,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconText: { fontSize: 18 },
  // Funil minimalista feito com 3 barrinhas afinando — sem dep nova.
  filterFunnel: { alignItems: 'center', gap: 3 },
  filterFunnelBar: { height: 2, borderRadius: 1, backgroundColor: 'var(--surface)' },
  filterIconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#C8131B',
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
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    marginTop: 'auto',
    maxHeight: '80%',
  },
  // Botao de dropdown (estilo "menu suspenso") que abre a lista de UFs.
  // Lista vertical do seletor de UF (modo "picker" dentro do mesmo sheet).
  ufPickerList: { maxHeight: 380, marginTop: 4 },
  ufPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border-soft)',
  },
  ufPickerRowText: { fontSize: 15, color: 'var(--text)' },
  ufPickerRowTextActive: { fontWeight: '800', color: 'var(--brand-text)' },
  ufPickerCheck: { fontSize: 16, fontWeight: '800', color: 'var(--brand-text)' },
  backButton: { color: 'var(--text-muted)', fontSize: 15, fontWeight: '600', width: 60 },
  filtersFooter: { flexDirection: 'row', gap: 10, marginTop: 20 },
  filtersSecondaryButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: 'var(--surface-2)' },
  filtersSecondaryButtonText: { color: 'var(--text)', fontSize: 15, fontWeight: '700' },
  // Loading
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)' },
  loadingText: { marginTop: 12, color: 'var(--text-muted)', fontSize: 15 },
  errorText: { color: 'var(--brand-text)', fontSize: 16 },
  // Map
  map: { flex: 1 },
  // Aviso do carregamento por área. No TOPO do mapa: embaixo ficam a legenda
  // de temperatura, o botao de localizacao e a barra de navegacao.
  areaStatusWrap: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  areaStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,23,42,0.88)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: '92%',
  },
  areaStatusText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  // Legenda de temperatura: fica ACIMA do botao de localizacao (que ocupa
  // left:16 / bottom:90+insets), por isso o offset extra de 56px.
  // Em DUAS COLUNAS: em pe' as 6 linhas comiam um terco da altura do mapa no
  // celular. Lado a lado a legenda ocupa metade da altura e continua legivel.
  tempLegend: {
    position: 'absolute',
    left: 16,
    marginBottom: 56,
    // 2 colunas de 104 + 10 de vao + 18 de padding. Os 104 sao ditados pelo
    // rotulo mais longo, "🎯 Conta Alvo": com menos, ele quebrava em duas
    // linhas e desalinhava a grade.
    maxWidth: 236,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'var(--surface-overlay)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
    rowGap: 4,
    columnGap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  // Largura fixa: e' o que garante exatamente 2 colunas dentro do maxWidth,
  // em vez de a quebra depender do comprimento de cada rotulo.
  tempLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 104 },
  tempLegendDot: { width: 10, height: 10, borderRadius: 5 },
  tempLegendLabel: { fontSize: 11, fontWeight: '700', color: 'var(--text)' },
  mapButton: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'var(--surface)',
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
  // Mesma pilula, ancorada a' DIREITA. Existe como estilo proprio porque
  // sobrescrever `left` com `undefined` nao funciona no react-native-web
  // (ver comentario no botao do mapa de calor).
  mapButtonRight: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'var(--surface)',
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
  // ===== Painel do mapa de calor (gestor) =====
  // ---- Calor de visitas (M2) ----
  // Desktop: a linha do switch dentro do painel de 352px vira caixa expansivel.
  calorCaixa: { borderRadius: 8, backgroundColor: 'var(--surface-2)', overflow: 'hidden' },
  calorCorpo: { paddingHorizontal: 12, paddingBottom: 12 },
  // Celular: folha no rodape. Os 40px de baixo nao sao decorativos — sao 16 de
  // respiro + os 24 que o FAB central invade acima da barra de navegacao. Sem
  // eles o circulo vermelho do FAB cai em cima do "Exportar JSON".
  calorFolha: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 40,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: 'var(--surface)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 8,
  },
  calorFolhaAlca: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'var(--stroke-default)',
    marginBottom: 12,
  },
  calorFolhaCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  calorFolhaTitulo: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: 'var(--text)' },
  calorFolhaFechar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Escala: uma familia de cor, quatro degraus interpolados em 24 passos.
  // A borda nao e' enfeite: o passo mais claro da rampa (#D6F2EC) da' 1,18:1
  // sobre --surface-2 no tema claro, e sem ela a barra parece comecar no meio.
  calorEscalaBarra: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  calorEscalaRotulos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  calorEscalaRotulo: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    color: 'var(--text-faint)',
  },
  calorListaCabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  calorListaTitulo: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  calorListaTotal: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    color: 'var(--text-faint)',
    fontVariant: ['tabular-nums'],
  },
  calorLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderRadius: 4 },
  // Circulo, e nao quadrado: `heatSeller` e' selecao unica (Todos ou UM), e uma
  // caixa de marcar prometeria escolher varios.
  calorRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'var(--stroke-strong)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calorRadioAtivo: { backgroundColor: '#C8131B', borderColor: '#C8131B' },
  calorNome: { flex: 1, fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '500', color: 'var(--text-muted)' },
  calorNomeAtivo: { fontWeight: '700', color: 'var(--tint-red-text)' },
  calorContagem: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    color: 'var(--text-faint)',
    fontVariant: ['tabular-nums'],
  },
  // Exportacao e' consulta, nao CTA: outline teal, o mesmo de "Baixar
  // planilha" e "Exportar relatorio". O vermelho e' do CTA primario do app.
  calorExportar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'var(--teal-text)',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  calorExportarDesktop: { height: 32, alignSelf: 'flex-start' },
  calorExportarMobile: { height: 48, alignSelf: 'stretch' },
  calorExportarTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--teal-text)' },
  heatEmpty: { fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic', marginBottom: 6 },
  fab: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#C8131B',
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
    backgroundColor: '#C8131B',
    borderWidth: 2, borderColor: '#fff',
  },
  creationBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'var(--surface)',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  creationBarTitle: { fontSize: 15, fontWeight: '700', color: 'var(--text)', marginBottom: 2 },
  creationBarHint: { fontSize: 12, color: 'var(--text-muted)' },
  creationBarCoords: { fontSize: 12, color: 'var(--text)', marginTop: 6, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  creationBarRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  creationBarCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: 'var(--surface-2)' },
  creationBarCancelText: { color: 'var(--text)', fontWeight: '700' },
  creationBarConfirm: { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#16a34a' },
  creationBarConfirmText: { color: '#fff', fontWeight: '700' },
  // Bottom Nav
  // Coluna lateral do desktop. `absolute` colada nas quatro bordas da esquerda:
  // ocupa a altura toda, inclusive ao lado do header, e devolve a base — que
  // num notebook e' o espaco vertical mais escasso.

  // ---- Shell web (handoff desktop): sidebar + header ----
  // A LARGURA da sidebar nao esta aqui de proposito: o CSS de
  // public/index.html ([data-sidebar]) da' 72px e expande pra 240 no hover
  // (>= 1024px). Os filhos tem largura fixa de 224 pra nao re-quebrar linha
  // durante a transicao — o overflow:hidden do container corta.
  sbContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: 'var(--surface)',
    borderRightWidth: 1,
    borderRightColor: 'var(--border)',
  },
  sbTopo: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
    width: 224,
  },
  // A marca e' RETRATO (273x343): a caixa tem que ter a mesma proporcao.
  // Em 28x28 o Image esticava/cortava — 28 de altura pede 22 de largura.
  // `contain` fica junto como garantia: se a arte mudar de proporcao, ela
  // encolhe pra caber em vez de vazar ou distorcer.
  sbMarcaIcone: { width: 22, height: 28, resizeMode: 'contain' },
  sbTopoTexto: { minWidth: 0 },
  sbMarcaTitulo: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '700', color: 'var(--text)' },
  sbMarcaSub: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '500', color: 'var(--text-faint)' },
  sbItens: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, gap: 2 },
  sbItem: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 16,
    width: 224,
  },
  sbItemAtivo: { backgroundColor: 'var(--tint-red)' },
  sbItemIcone: { width: 24, alignItems: 'center' },
  sbItemTexto: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
    fontWeight: '500',
    color: 'var(--text-muted)',
  },
  sbItemTextoAtivo: { fontWeight: '700', color: 'var(--tint-red-text)' },
  sbBadge: {
    position: 'absolute',
    top: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#C8131B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sbBadgeTexto: { fontSize: 11, lineHeight: 18, fontWeight: '700', color: '#FFFFFF' },
  sbRodape: {
    borderTopWidth: 1,
    borderTopColor: 'var(--border)',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 2,
  },
  sbUsuario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 224,
  },
  sbAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'var(--tint-red)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sbAvatarTexto: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: 'var(--tint-red-text)' },
  sbUsuarioTextos: { flex: 1, minWidth: 0 },
  sbUsuarioNome: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'var(--text)' },
  sbUsuarioPapel: { fontSize: 11, lineHeight: 16, fontWeight: '500', color: 'var(--text-faint)' },
  sbSair: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hwContainer: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 24,
    backgroundColor: 'var(--surface)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
    zIndex: 20,
  },
  hwTitulos: { flexDirection: 'row', alignItems: 'baseline', gap: 12, flexShrink: 1, minWidth: 0 },
  hwTitulo: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: 'var(--text)' },
  hwSubtitulo: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    fontWeight: '500',
    color: 'var(--text-faint)',
    flexShrink: 1,
  },
  hwAcoes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hwBusca: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--stroke-strong)',
    backgroundColor: 'var(--surface)',
    minWidth: 280,
  },
  hwBuscaInput: { flex: 1, fontSize: 14, lineHeight: 20, letterSpacing: 0.25, color: 'var(--text)' },
  hwAtalho: {
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  hwAtalhoTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-disabled)' },
  hwSino: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    backgroundColor: 'var(--surface)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hwSinoDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C8131B',
    borderWidth: 1.5,
    borderColor: 'var(--surface)',
  },
  hwCta: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#C8131B',
  },
  hwCtaTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: '#FFFFFF' },
  // ---- Mapa web: linha painel + mapa ----
  pmwContainer: {
    width: 352,
    backgroundColor: 'var(--surface)',
    borderRightWidth: 1,
    borderRightColor: 'var(--border)',
  },
  pmwEscopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  pmwFiltros: { padding: 16, gap: 16, borderBottomWidth: 1, borderBottomColor: 'var(--border)' },
  pmwSegmentos: { flexDirection: 'row' },
  pmwSegmento: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
  },
  pmwSegmentoAtivo: { backgroundColor: '#C8131B', borderColor: '#C8131B' },
  pmwSegmentoTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  pmwSegmentoTextoAtivo: { color: '#FFFFFF' },
  pmwTituloLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pmwTitulo: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
  },
  pmwLimpar: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--info-text)' },
  pmwChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pmwChip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    backgroundColor: 'var(--surface)',
  },
  pmwChipAtivo: { backgroundColor: 'var(--tint-red)', borderColor: '#C8131B' },
  pmwChipDot: { width: 10, height: 10, borderRadius: 5 },
  pmwChipTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  pmwChipContagem: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: 'var(--text-faint)' },
  pmwCalor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'var(--surface-2)',
  },
  pmwCalorTitulo: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)' },
  pmwCalorSub: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  pmwSwitch: { width: 44, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
  pmwSwitchDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  pmwListaCabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  pmwListaTitulo: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '700',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  pmwListaOrdem: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '500', color: 'var(--text-faint)' },
  pmwLinha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  pmwLinhaBarra: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 40 },
  pmwLinhaNome: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)' },
  pmwLinhaSub: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  pmwLinhaDist: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-faint)' },
  // Legenda de temperatura vira barra horizontal com wrap no web
  tempLegendaWeb: {
    bottom: 16,
    left: 16,
    marginBottom: 0,
    maxWidth: '92%',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    rowGap: 8,
    columnGap: 16,
    backgroundColor: 'var(--surface)',
  },
  tempLegendaLinhaWeb: { width: 'auto' },
  // Controle do mapa (recentrar) no topo direito, 40x40 raio 8
  mapaControleWeb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--border)',
    top: 16,
    right: 16,
    left: 'auto',
    bottom: 'auto',
  },
  // ---- Lista web (tabela) ----
  ltwPagina: { padding: 24, maxWidth: 1600, width: '100%', alignSelf: 'center' },
  ltwFerramentas: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  ltwBotaoBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#C8131B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ltwTabela: {
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  ltwCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'var(--surface-2)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--stroke-default)',
  },
  ltwCabecalhoTexto: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '700',
    color: 'var(--text-muted)',
  },
  ltwLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  ltwColRestaurante: { flexGrow: 2, flexShrink: 1, flexBasis: 240, minWidth: 0 },
  ltwColContato: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0 },
  ltwColEtapa: { width: 160 },
  ltwColTemp: { width: 120 },
  ltwColCidade: { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 },
  ltwColVisita: { width: 110 },
  ltwColReunioes: { width: 96 },
  ltwColSeta: { width: 48, alignItems: 'flex-end' },
  ltwBarraTemp: { width: 4, height: 32, borderRadius: 2 },
  ltwNome: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)' },
  ltwSub: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  ltwCelula: { fontSize: 14, lineHeight: 20, letterSpacing: 0.25, color: 'var(--text-muted)' },
  ltwCelulaForte: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  ltwCelulaFraca: { fontSize: 12, lineHeight: 16, color: 'var(--text-disabled)' },
  ltwBadgeEtapa: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    maxWidth: '100%',
  },
  ltwBadgeEtapaTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600' },
  ltwGrupoLinha: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'var(--surface-2)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  ltwGrupoTexto: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  ltwRodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  ltwRodapeTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  ltwPagBotao: {
    width: 32,
    height: 32,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ltwPagBotaoAtivo: { backgroundColor: '#C8131B', borderColor: '#C8131B' },
  ltwPagTexto: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'var(--text-muted)' },
  // ---- Rota web: rail de 420px a' direita do mapa ----
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
    // O FAB e' filho absoluto desta barra e protrai 24px acima dela.
    position: 'relative',
  },
  // Espacador do FAB: 72px de vao no meio das quatro abas.
  navVaoFab: { flex: 0, flexBasis: 72, width: 72 },
  // Ancora do badge. `position:relative` implicito no RN; o que importa e' o
  // badge pendurar no ICONE e nao no botao de ~73px.
  navIconeAncora: { position: 'relative' },
  navFab: {
    position: 'absolute',
    left: '50%',
    top: -24,
    transform: [{ translateX: -30 }],
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#C8131B',
    alignItems: 'center',
    justifyContent: 'center',
    // A borda em --surface e' o que recorta o FAB da barra.
    borderWidth: 4,
    borderColor: 'var(--surface)',
    // A unica sombra tingida da marca no app.
    shadowColor: '#C8131B',
    shadowOpacity: 0.32,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  // Sao ate 6 abas (Mapa/Lista/Rota/Agenda/Tarefas/Gestor). Num celular
  // estreito o rotulo de 11px encostava no do vizinho; icone e texto um ponto
  // menores, com folga horizontal, deixam os seis respirarem.
  navItem: {
    flex: 1,
    // 56: e' o controle mais tocado do app, com o polegar, em pe' na rua.
    minHeight: 56,
    paddingVertical: 8,
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: { fontSize: 17, marginBottom: 2 },
  navIconActive: {},
  // Badge de notificacao de tarefas pendentes, sobreposto no icone da aba.
  navBadge: {
    position: 'absolute',
    top: -6,
    right: -12,
    backgroundColor: '#C8131B',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'var(--surface)',
    boxSizing: 'content-box',
  },
  navBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  navItemText: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '500', color: 'var(--text-faint)' },
  // ===== Calendario da Agenda (so' desktop) =====
  brandMark: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '500',
    fontStyle: 'italic',
    letterSpacing: 0.5,
    color: 'var(--text-faint)',
  },
  navItemTextActive: { fontWeight: '700', color: '#C8131B' },
  // List
  // Card Mobile do DS: radius 16, padding 16, sombra shadow/01 (key-light 14%).
  clientCard: {
    backgroundColor: 'var(--surface)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: 'var(--border-soft)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  cardLogo: { width: 18, height: 18, resizeMode: 'contain', marginRight: 8 },
  clientContact: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  clientStage: { fontSize: 12, color: 'var(--brand-text)', fontWeight: '700', marginTop: 2 },
  cardMeetingBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'var(--tint-red)',
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  cardMeetingBadgeText: { color: 'var(--tint-red-text)', fontSize: 10, fontWeight: '700' },
  cardVisitBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'var(--tint-green)',
    borderWidth: 1,
    borderColor: 'var(--tint-green-border)',
  },
  cardVisitBadgeText: { color: 'var(--tint-green-text)', fontSize: 10, fontWeight: '700' },
  clientCity: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 },
  clientPhone: { fontSize: 13, color: 'var(--text)' },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--border)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentButtonActive: { backgroundColor: '#C8131B', borderColor: '#C8131B' },
  segmentButtonText: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)', textAlign: 'center' },
  segmentButtonTextActive: { color: '#fff' },
  // Uso do produto (HubSpot) — cores vem do estado, so' o layout fica aqui.
  // Caixa da Conta Alvo no sheet — roxo, combinando com o pin/badge.
  contaAlvoBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    backgroundColor: 'var(--tint-red)',
    borderColor: 'var(--tint-red-border)',
  },
  contaAlvoBoxTitle: { fontSize: 14, fontWeight: '800', color: 'var(--tint-red-text)' },
  contaAlvoBoxText: { fontSize: 13, fontWeight: '700', color: 'var(--tint-red-text)', marginTop: 3 },
  contaAlvoDismissBtn: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--tint-red-border)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  contaAlvoDismissText: { fontSize: 12, fontWeight: '800', color: 'var(--brand-text)' },
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
    color: 'var(--text)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  agendaSectionMeta: { fontSize: 12, color: 'var(--text-muted)', fontWeight: '600' },
  agendaWhen: { width: 56, alignItems: 'center' },
  agendaDate: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  agendaWeekday: { fontSize: 10, color: 'var(--text-subtle)', fontWeight: '600', textTransform: 'capitalize' },
  agendaTime: { fontSize: 14, fontWeight: '800', color: 'var(--brand-text)', marginTop: 2 },
  // Linha da timeline: trilho de horário à esquerda + card com barra colorida
  // pelo tipo do compromisso (demo / follow up / rota).
  // Cabecalho de dia da timeline — vermelho, caixa alta, o marcador visual
  // que separa "HOJE" de "AMANHÃ" sem o vendedor ter que ler data por item.
  // Pill de temperatura da etapa (Quente/Morno/Frio) — cor vem de TEMP_COLORS
  // com alpha em hex (1a = ~10% fundo, 59 = ~35% borda).
  // Tarefas
  // ===== Kanban de tarefas (so' desktop) =====
  // Densidade de QUADRO: o card compacta no web. No celular ele continua
  // grande porque e' lido a um braco de distancia, na rua.
  // Card da tarefa: lead como título, badge de urgência à direita.
  // Chips de urgência (contam e filtram) + cabeçalho de cada seção.
  // Chips de contagem+filtro — compartilhados por Tarefas (severidade) e
  // Agenda (tipo de compromisso).
  // Responsável + tag de vendedor desativado (sufixo "/ DESATIVADO" no nome).
  // Cabecalho da aba Tarefas com botao de info
  // Modal de regras
  taskRulesCard: {
    backgroundColor: 'var(--surface)',
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
  taskRulesTitle: { fontSize: 17, fontWeight: '800', color: 'var(--text)', flex: 1 },
  taskRulesClose: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface-2)',
  },
  taskRulesCloseText: { fontSize: 15, color: 'var(--text-muted)', fontWeight: '700' },
  taskRulesIntro: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 19, marginBottom: 12 },
  ruleCard: {
    backgroundColor: 'var(--bg)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  ruleTitle: { fontSize: 15, fontWeight: '800', color: 'var(--text)', marginBottom: 8 },
  ruleSectionLabel: {
    fontSize: 11, fontWeight: '800', color: 'var(--text-subtle)',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 3,
  },
  ruleText: { fontSize: 13, color: 'var(--text)', lineHeight: 19 },
  ruleLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ruleLevelBadge: {
    minWidth: 34, height: 24, borderRadius: 12, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  ruleLevelBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  ruleLevelText: { fontSize: 13, color: 'var(--text)', flex: 1, lineHeight: 18 },
  taskRulesDoneButton: {
    marginTop: 14,
    backgroundColor: '#C8131B',
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
  routeStartPick: {
    paddingVertical: 11, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)',
  },
  routeStartPickName: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  routeStartPickMeta: { fontSize: 12, color: 'var(--text-muted)', marginTop: 1 },
  metricCard: {
    backgroundColor: 'var(--surface)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  metricLabel: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  metricValue: { fontSize: 15, fontWeight: '900', color: 'var(--text)' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'var(--surface-3)', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#16a34a' },
  rankingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  warningText: { fontSize: 12, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 10, borderRadius: 8, marginTop: 10 },
  masterGrid: { gap: 8, marginTop: 8 },
  masterMetric: { fontSize: 13, fontWeight: '700', color: 'var(--text)', backgroundColor: 'var(--bg)', padding: 10, borderRadius: 8 },
  auditRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  auditAction: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  // Modal Form
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  // Web: modais viram cartao central (handoff, telas 10-12) em vez de sheet.
  modalOverlayWeb: { justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.32)' },
  // Cartao central menor (pickers, filtros, regras) — 520px.
  modalCartaoMedioWeb: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 25,
  },
  // Configuracoes no web: mesmos tokens do resto do handoff.
  modalCartaoWeb: {
    width: '100%',
    maxWidth: 720,
    borderRadius: 8,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 25,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: 'var(--text)' },
  closeButton: { fontSize: 22, color: 'var(--text-subtle)', padding: 4 },
  statusSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'var(--border)',
  },
  statusOptionText: { fontSize: 13, fontWeight: '600', color: 'var(--text-muted)' },
  inputRow: { flexDirection: 'row' },
  locationSummary: { backgroundColor: 'var(--tint-green)', borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: 'var(--tint-green-border)' },
  locationSummaryText: { fontSize: 12, color: '#16a34a', fontWeight: '500' },
  // A forma da folha/drawer, a alca e o overlay vivem no <Painel>
  // (src/components/Painel.tsx). Aqui fica so' o padding do corpo da ficha.
  corpoDesktop: { paddingHorizontal: 24 },
  corpoMobile: { paddingHorizontal: 16 },
  // ---- Peek sheet (prompt M1, celular) ----
  // M1d: item da timeline com pill de tipo (tints claras — superficies
  // proprias, o icone fica escuro nos dois temas).
  fichaAcaoMobileCheia: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#C8131B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fichaAcaoMobileCheiaTexto: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: '#FFFFFF' },
  fichaAcaoMobileVazada: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C8131B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fichaAcaoMobileVazadaTexto: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: 'var(--brand-text)' },
  timelineLinha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  timelinePill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  peekCorpo: {
    paddingHorizontal: 16,
    paddingTop: 4,
    // 16 + os 24 que o FAB central invade acima da barra (spec M1): sem a
    // reserva o circulo vermelho cai em cima do "Check-in".
    paddingBottom: 40,
    gap: 12,
  },
  peekLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  peekBarraTemp: { width: 4, alignSelf: 'stretch', minHeight: 44, borderRadius: 2 },
  peekNome: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: 'var(--text)' },
  peekSub: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  peekBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  peekBadgeTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  peekCheckin: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#27A84C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  peekCheckinTexto: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: '#FFFFFF' },
  peekQuadrado: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segMobileLinha: { flexDirection: 'row', paddingTop: 8 },
  segMobile: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    backgroundColor: 'var(--surface)',
  },
  segMobileTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  tempChipMobile: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    backgroundColor: 'var(--surface)',
  },
  tempChipMobileAtivo: { backgroundColor: 'var(--tint-red)', borderColor: '#C8131B' },
  tempChipMobileTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  faChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  faChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 14,
    backgroundColor: 'var(--surface-2)',
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  faChipTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)', maxWidth: 220 },
  filtroLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    backgroundColor: 'var(--surface)',
  },
  filtroLinhaAtiva: { backgroundColor: 'var(--tint-red)', borderColor: '#C8131B' },
  filtroLinhaTexto: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
    fontWeight: '600',
    color: 'var(--text-muted)',
  },
  drawerAcaoCheia: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#C8131B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
  },
  drawerAcaoCheiaTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: '#FFFFFF' },
  drawerAcaoVazada: {
    flex: 1,
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
  drawerAcaoVazadaTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--brand-text)' },
  drawerAcaoMais: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ---- Corpo em abas (M1d) ----
  abaConteudo: { paddingTop: 16 },
  // Cards de contexto (Conta Alvo, Observacao principal): ficam FORA do grid de
  // pares — sao bloco, nao dado.
  cartaoDado: { backgroundColor: 'var(--surface-2)', padding: 16, marginBottom: 16 },
  cartaoDadoDesktop: { borderRadius: 8 },
  cartaoDadoMobile: { borderRadius: 16 },
  cartaoDadoTitulo: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 8,
  },
  cartaoDadoTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.25, color: 'var(--text)' },
  dadosGrade: { marginBottom: 16 },
  dadoLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  // Valor longo no celular: chave em cima, valor embaixo, em corpo maior.
  dadoLinhaEmpilhada: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  dadoChave: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  dadoChaveTexto: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  dadoValor: { flexShrink: 1, fontSize: 14, lineHeight: 20, letterSpacing: 0.25, color: 'var(--text)', textAlign: 'right' },
  dadoValorEmpilhado: { fontSize: 16, lineHeight: 24, letterSpacing: 0.5, color: 'var(--text)' },
  tabular: { fontVariant: ['tabular-nums'] },
  // Linha de link que fecha a aba Dados. Alvo de 48px no celular.
  linhaLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginBottom: 16 },
  linhaLinkTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--info-text)' },
  // Telefone editavel: campo na coluna do valor, texto a ESQUERDA dentro dele.
  telefoneCaixa: { alignItems: 'flex-end', gap: 8 },
  telefoneCampo: {
    minWidth: 200,
    borderWidth: 1,
    borderColor: 'var(--stroke-strong)',
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    paddingHorizontal: 12,
  },
  telefoneCampoDesktop: { height: 40, borderRadius: 8, fontSize: 14, lineHeight: 20 },
  telefoneCampoMobile: { height: 48, borderRadius: 16, fontSize: 16, lineHeight: 24 },
  telefoneSalvar: { backgroundColor: '#C8131B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  telefoneSalvarDesktop: { height: 32, borderRadius: 8 },
  telefoneSalvarMobile: { height: 48, borderRadius: 12 },
  telefoneSalvarTexto: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600' },
  // TEMPORARIO: some quando o M1e levar o check-in pro rodape e o M1c2 levar as
  // outras oito acoes pro menu.
  acoesTemporarias: { marginTop: 8 },

  // ---- Faixa de alertas (M1d) ----
  // Faixas de largura total, NAO cards: sem sombra, sem borda em volta, sem
  // raio no celular. So' a regua esquerda de 3px carrega a cor.
  faixaAlertas: { gap: 1 },
  faixaAlertasMobile: { marginHorizontal: -16 },
  alerta: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderLeftWidth: 3 },
  alertaDesktop: { borderRadius: 8, marginTop: 16 },
  alertaTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.25, fontWeight: '600' },
  // O detalhe e' a mesma cor a 80% — em RNW nao ha' alfa sobre var().
  alertaDetalhe: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, opacity: 0.8, marginTop: 2 },
  alertaPorQue: { alignSelf: 'flex-start', paddingVertical: 4, minHeight: 24 },
  // Azul de link dentro de faixa ambar brigaria com o tom; o text button usa a
  // propria cor da faixa, com peso pra se distinguir do detalhe.
  alertaPorQueTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, fontWeight: '600', textDecorationLine: 'underline' },

  // ---- Barra de abas (M1d) ----
  // backgroundColor obrigatorio: o wrapper `position:sticky` que o RNW cria
  // nao tem fundo, e sem isto o conteudo rola por tras e aparece.
  // marginHorizontal -20 desfaz o paddingHorizontal:20 da scroller, pra borda
  // inferior encostar nas duas paredes do painel.
  abasBarra: {
    flexDirection: 'row',
    backgroundColor: 'var(--surface)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  abasBarraDesktop: { marginHorizontal: -24, paddingHorizontal: 24 },
  abasBarraMobile: { marginHorizontal: -16, paddingHorizontal: 16 },
  abaItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  abaItemDesktop: { height: 40 },
  abaItemMobile: { height: 48 },
  abaItemAtiva: { borderBottomColor: '#C8131B' },
  abaTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text-muted)' },
  abaTextoAtiva: { color: 'var(--tint-red-text)' },

  // ---- Faixa de topo da ficha do lead (M1c) ----
  // Padding 24 no desktop; 12/16/16 no celular — o extra embaixo compensa a
  // alca de arraste, que come o respiro de cima.
  fichaTopo: { borderBottomWidth: 1, borderBottomColor: 'var(--border)' },
  fichaTopoDesktop: { padding: 24 },
  fichaTopoMobile: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16 },
  fichaTopoLinha: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  fichaKickerLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  fichaKickerDot: { width: 10, height: 10, borderRadius: 5 },
  fichaKickerDotMobile: { width: 8, height: 8, borderRadius: 4 },
  fichaKicker: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  fichaBadgeStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  fichaBadgeStatusTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600' },
  fichaNome: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: 'var(--text)' },
  fichaSublinha: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  fichaFecharDesktop: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fichaFecharMobile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fichaAcoes: { flexDirection: 'row', gap: 8, marginTop: 16 },
  // Historico de notas: cada entrada vira card cronologico no bottom sheet.
  notesSection: { paddingTop: 12, borderTopWidth: 1, borderTopColor: 'var(--border-soft)', marginBottom: 16 },
  // Sem regua colorida a esquerda: o pill 32px do icone ja' carrega a cor do
  // tipo, e duas marcas pro mesmo dado e' redundancia (M1-MAPEAMENTO).
  noteItem: { paddingBottom: 16, marginTop: 8 },
  noteHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  noteAuthor: { fontSize: 12, fontWeight: '700', color: 'var(--text)', marginBottom: 1 },
  noteDate: { fontSize: 11, color: 'var(--text-muted)' },
  noteActions: { flexDirection: 'row', gap: 12 },
  noteAction: { fontSize: 12, fontWeight: '700', color: '#3b82f6' },
  noteDelete: { fontSize: 14, color: 'var(--text-subtle)', paddingHorizontal: 4 },
  noteBody: { fontSize: 14, color: 'var(--text)', lineHeight: 20 },
  // Modo edicao inline: botoes Cancelar/Salvar abaixo do textarea.
  noteEditActions: { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' },
  noteEditCancel: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'var(--surface-2)' },
  noteEditCancelText: { color: 'var(--text-muted)', fontWeight: '700', fontSize: 13 },
  noteEditSave: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#C8131B' },
  noteEditSaveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  navigationSection: { paddingTop: 12, borderTopWidth: 1, borderTopColor: 'var(--border-soft)', marginBottom: 16 },
  navigationRow: { flexDirection: 'row', gap: 10 },
  navRouteButton: { flex: 1, minHeight: 48, paddingVertical: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  // O icone e o rotulo ja' distinguem carro de a-pe'; borda colorida por modo
  // de transporte era vocabulario inventado fora da paleta.
  navButtonDriving: {},
  navButtonWalking: {},
  navRouteButtonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.15, color: 'var(--text)' },
  addRouteButton: {
    backgroundColor: '#222222',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  addRouteButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  meetingsSection: { paddingTop: 12, borderTopWidth: 1, borderTopColor: 'var(--border-soft)', marginBottom: 16 },
  meetingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meetingsEmpty: { fontSize: 12, color: 'var(--text-subtle)', marginBottom: 8 },
  meetingChip: {
    backgroundColor: 'var(--tint-red)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'var(--tint-red-border)',
  },
  meetingChipDate: { fontSize: 13, fontWeight: '700', color: 'var(--tint-red-text)' },
  meetingChipObs: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  meetingChipActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  // ===== Botoes do design system (components.md) =====
  // Mobile/Tablet: altura 48, radius 16, tipografia 16/600, icone 24.
  // "No maximo dois estilos por tela": Filled pro CTA, o resto neutro.
  acaoPrimaria: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#C8131B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  acaoPrimariaTexto: { color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.15 },
  acaoSecundaria: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  acaoSecundariaTexto: { color: 'var(--text)', fontSize: 16, fontWeight: '600', letterSpacing: 0.15 },
  scheduleButton: {
    minHeight: 48,
    backgroundColor: '#C8131B',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  scheduleButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.15 },
  followUpButton: {
    minHeight: 48,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  followUpButtonText: { color: 'var(--text)', fontSize: 16, fontWeight: '600', letterSpacing: 0.15 },
  changeStageButton: {
    minHeight: 48,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  changeStageButtonText: { color: 'var(--text)', fontSize: 16, fontWeight: '600', letterSpacing: 0.15 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 8 },
  deleteButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: 'var(--tint-red)', borderWidth: 1, borderColor: 'var(--tint-red-border)' },
  deleteButtonText: { fontSize: 14, fontWeight: '700', color: 'var(--brand-text)' },
  closeActionButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#C8131B' },
  closeActionButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
