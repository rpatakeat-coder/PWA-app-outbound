// Ponto unico dos icones do UI Kit da Takeat.
//
// Por que importar de 'takeat-design-system-ui-kit/icons/X' e nao da raiz do
// pacote: a raiz arrasta o indice inteiro, e varios componentes de la' trazem
// CSS do vanilla-extract junto. Os icones, isolados, sao SVG puro — sem tema,
// sem provider, sem CSS. Por isso NAO precisamos do <UiKitTheme> em volta do
// app; ele so' faz falta pros componentes visuais do kit (Button, Menu...).
//
// Sao componentes React DOM (<svg>), o que funciona dentro do
// react-native-web porque ele tambem renderiza DOM. Todos aceitam
// width/height/fill; `fill` no <svg> tinge o icone inteiro, ja' que em SVG
// essa propriedade e' herdada pelos paths.
import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../theme';

import { IconArrowBack } from 'takeat-design-system-ui-kit/icons/IconArrowBack';
import { IconArrowUp } from 'takeat-design-system-ui-kit/icons/IconArrowUp';
import { IconArrowDown } from 'takeat-design-system-ui-kit/icons/IconArrowDown';
import { IconCached } from 'takeat-design-system-ui-kit/icons/IconCached';
import { IconCall } from 'takeat-design-system-ui-kit/icons/IconCall';
import { IconCheckbox } from 'takeat-design-system-ui-kit/icons/IconCheckbox';
import { IconCheckboxChecked } from 'takeat-design-system-ui-kit/icons/IconCheckboxChecked';
import { IconCheckCircle } from 'takeat-design-system-ui-kit/icons/IconCheckCircle';
import { IconClock } from 'takeat-design-system-ui-kit/icons/IconClock';
import { IconEye } from 'takeat-design-system-ui-kit/icons/IconEye';
import { IconHome } from 'takeat-design-system-ui-kit/icons/IconHome';
import { IconMail } from 'takeat-design-system-ui-kit/icons/IconMail';
import { IconMedal } from 'takeat-design-system-ui-kit/icons/IconMedal';
import { IconStore } from 'takeat-design-system-ui-kit/icons/IconStore';
import { IconTrophy } from 'takeat-design-system-ui-kit/icons/IconTrophy';
import { IconUser } from 'takeat-design-system-ui-kit/icons/IconUser';
import { IconWhatsapp } from 'takeat-design-system-ui-kit/icons/IconWhatsapp';
import { IconCelebratingUser } from 'takeat-design-system-ui-kit/icons/IconCelebratingUser';
import { IconExternalLink } from 'takeat-design-system-ui-kit/icons/IconExternalLink';
import { IconBill } from 'takeat-design-system-ui-kit/icons/IconBill';
import { IconLock } from 'takeat-design-system-ui-kit/icons/IconLock';
import { IconWarning } from 'takeat-design-system-ui-kit/icons/IconWarning';
import { IconUndo } from 'takeat-design-system-ui-kit/icons/IconUndo';
import { IconArray } from 'takeat-design-system-ui-kit/icons/IconArray';
import { IconLightBulb } from 'takeat-design-system-ui-kit/icons/IconLightBulb';
import { IconBell } from 'takeat-design-system-ui-kit/icons/IconBell';
import { IconChevronDown } from 'takeat-design-system-ui-kit/icons/IconChevronDown';
import { IconChevronLeft } from 'takeat-design-system-ui-kit/icons/IconChevronLeft';
import { IconChevronRight } from 'takeat-design-system-ui-kit/icons/IconChevronRight';
import { IconLogout } from 'takeat-design-system-ui-kit/icons/IconLogout';
import { IconMenu } from 'takeat-design-system-ui-kit/icons/IconMenu';
import { IconMenuCircles } from 'takeat-design-system-ui-kit/icons/IconMenuCircles';
import { IconTrendingDown } from 'takeat-design-system-ui-kit/icons/IconTrendingDown';
import { IconRefresh } from 'takeat-design-system-ui-kit/icons/IconRefresh';
import { IconArrowFoward } from 'takeat-design-system-ui-kit/icons/IconArrowFoward';
import { IconPencil } from 'takeat-design-system-ui-kit/icons/IconPencil';
import { IconUserGroup } from 'takeat-design-system-ui-kit/icons/IconUserGroup';
import { IconCloseCircle } from 'takeat-design-system-ui-kit/icons/IconCloseCircle';
import { IconDownload } from 'takeat-design-system-ui-kit/icons/IconDownload';
import { IconStar } from 'takeat-design-system-ui-kit/icons/IconStar';
import { IconBarGraph } from 'takeat-design-system-ui-kit/icons/IconBarGraph';
import { IconCheck } from 'takeat-design-system-ui-kit/icons/IconCheck';
import { IconClose } from 'takeat-design-system-ui-kit/icons/IconClose';
import { IconCalendar } from 'takeat-design-system-ui-kit/icons/IconCalendar';
import { IconCar } from 'takeat-design-system-ui-kit/icons/IconCar';
import { IconClipboardCheck } from 'takeat-design-system-ui-kit/icons/IconClipboardCheck';
import { IconFilterList } from 'takeat-design-system-ui-kit/icons/IconFilterList';
import { IconLocation } from 'takeat-design-system-ui-kit/icons/IconLocation';
import { IconLocationFilled } from 'takeat-design-system-ui-kit/icons/IconLocationFilled';
import { IconPlus } from 'takeat-design-system-ui-kit/icons/IconPlus';
import { IconSearch } from 'takeat-design-system-ui-kit/icons/IconSearch';
import { IconSettings } from 'takeat-design-system-ui-kit/icons/IconSettings';
import { IconSquareMenu } from 'takeat-design-system-ui-kit/icons/IconSquareMenu';
import { IconTrendingUp } from 'takeat-design-system-ui-kit/icons/IconTrendingUp';
// M3c: existiam no kit, faltavam aqui. IconExpand/IconShrink sao o
// open_in_full/close_fullscreen do handoff; IconSparkle entra no lugar do
// `bolt` (que o kit nao tem) como marca do caminho automatico; IconUserAdd e'
// o person_add do card de adicionar lead.
import { IconExpand } from 'takeat-design-system-ui-kit/icons/IconExpand';
import { IconShrink } from 'takeat-design-system-ui-kit/icons/IconShrink';
import { IconSparkle } from 'takeat-design-system-ui-kit/icons/IconSparkle';
import { IconUserAdd } from 'takeat-design-system-ui-kit/icons/IconUserAdd';
// M1-DECISOES-2: existiam no kit, faltavam aqui. IconIdCard tira o emoji do
// ID HubSpot; IconTrash e' o 'delete' do menu; IconManager, o responsavel.
import { IconIdCard } from 'takeat-design-system-ui-kit/icons/IconIdCard';
import { IconManager } from 'takeat-design-system-ui-kit/icons/IconManager';
import { IconTrash } from 'takeat-design-system-ui-kit/icons/IconTrash';

export {
  IconArray,
  IconLightBulb,
  IconBell,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconLogout,
  IconMenu,
  IconMenuCircles,
  IconTrendingDown,
  IconArrowBack,
  IconArrowDown,
  IconArrowFoward,
  IconArrowUp,
  IconBarGraph,
  IconBill,
  IconCached,
  IconCalendar,
  IconCall,
  IconCar,
  IconCelebratingUser,
  IconCheck,
  IconCheckCircle,
  IconCheckbox,
  IconCheckboxChecked,
  IconClipboardCheck,
  IconClock,
  IconClose,
  IconCloseCircle,
  IconDownload,
  IconExpand,
  IconExternalLink,
  IconEye,
  IconFilterList,
  IconHome,
  IconIdCard,
  IconLocation,
  IconLocationFilled,
  IconLock,
  IconMail,
  IconManager,
  IconMedal,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShrink,
  IconSparkle,
  IconSquareMenu,
  IconStar,
  IconStore,
  IconTrash,
  IconTrendingUp,
  IconTrophy,
  IconUndo,
  IconUser,
  IconUserAdd,
  IconUserGroup,
  IconWarning,
  IconWhatsapp,
};

type IconeSvg = (props: Record<string, unknown>) => React.JSX.Element;

// Livro aberto da aba Playbook (prompt final §B2). O kit não tem ícone de
// livro; mesmo contrato dos dele: 24x24, cor pelo `fill`.
export function IconBook({ width = 24, height = 24, fill = 'currentColor' }: { width?: number; height?: number; fill?: string }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
      <path d="M12 6.4C10.3 5.2 8 4.5 5.5 4.5c-1.2 0-2.3.2-3.3.5a.9.9 0 0 0-.7.9v12.2c0 .6.6 1 1.2.8.9-.3 1.8-.4 2.8-.4 2.3 0 4.4.7 5.9 1.9.2.2.4.2.6.2s.4 0 .6-.2c1.5-1.2 3.6-1.9 5.9-1.9 1 0 1.9.1 2.8.4.6.2 1.2-.2 1.2-.8V5.9a.9.9 0 0 0-.7-.9c-1-.3-2.1-.5-3.3-.5-2.5 0-4.8.7-6.5 1.9Zm-1 11.1c-1.6-.8-3.5-1.3-5.5-1.3-.8 0-1.6.1-2.3.2V6.6c.7-.2 1.5-.3 2.3-.3 2 0 3.9.6 5.5 1.7v9.5Zm9.8-1.1c-.7-.1-1.5-.2-2.3-.2-2 0-3.9.5-5.5 1.3V8c1.6-1.1 3.5-1.7 5.5-1.7.8 0 1.6.1 2.3.3v9.8Z" />
    </svg>
  );
}

/* Desenvolvimento v2 (01/11/26): o kit não tem chama, raio, alvo nem escudo — os quatro ícones das
   medalhas que faltavam. Mesmo contrato do IconBook (24x24, cor por prop), em traço de 2 como os do
   protótipo do handoff. */
function IconeTraco({ d, width = 24, height = 24, fill = 'currentColor' }: { d: string; width?: number; height?: number; fill?: string }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={fill} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
type PropsIcone = { width?: number; height?: number; fill?: string };
export const IconFlame = (p: PropsIcone) => <IconeTraco {...p} d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />;
export const IconZap = (p: PropsIcone) => <IconeTraco {...p} d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />;
export const IconTarget = (p: PropsIcone) => <IconeTraco {...p} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />;
export const IconShieldCheck = (p: PropsIcone) => <IconeTraco {...p} d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4" />;

/**
 * Cores de icone conforme o tema.
 *
 * Os icones recebem a cor por PROP (`fill` no <svg>), e `var(--token)` nao
 * resolve em atributo de apresentacao do SVG — so' em CSS. Entao, ao
 * contrario do resto do app, aqui o tema precisa ser lido em JavaScript.
 *
 * Valores do design system oficial: neutral.500 #222222 no claro,
 * neutral.50 #F6F6F6 no escuro.
 */
export function useIconColors() {
  const { isDark } = useTheme();
  return {
    /** Sobre cartao/superficie clara ou escura. Mesmo par do token --text. */
    onSurface: isDark ? '#F6F6F6' : '#222222',
    /** Secundario: placeholder de busca, icone inativo. Par do --text-muted. */
    muted: isDark ? '#C6C6C6' : '#545454',
    /** Sobre o vermelho da marca ou outro fundo forte. */
    onBrand: '#FFFFFF',
    /** Destaque (aba ativa, seguindo o usuario no mapa). */
    brand: '#C8131B',
    /**
     * Vermelho da marca com contraste suficiente pra TEXTO/icone sobre fundo
     * escuro. O #C8131B da' 2.64 contra a superficie escura — ilegivel. Mesmo
     * par do token --brand-text (primary.red.200 no escuro, .500 no claro).
     */
    brandText: isDark ? '#E5A1A4' : '#C8131B',
    /** Mesmo par do token --tint-red-text: titulos das secoes do Gestor. */
    tintRedText: isDark ? '#E5A1A4' : '#94090F',
    /**
     * Par do token --tint-green-text. O #167532 da' 2,47:1 sobre o tint verde
     * escuro (#14301D) — abaixo dos 3:1 de elemento grafico.
     */
    tintGreenText: isDark ? '#77BD8B' : '#167532',
    /** Par do token --tint-amber-text: avisos (localizacao aproximada). */
    tintAmberText: isDark ? '#FFD894' : '#99670F',
    /** Par do token --text-faint: icones de campo/metadado. */
    faint: isDark ? 'rgba(255,255,255,0.42)' : '#7A7A7A',
    /** Par do token --text-disabled: o chevron de fim de linha, que e' pista
     *  de affordance e nao conteudo. */
    disabled: isDark ? 'rgba(255,255,255,0.28)' : '#C6C6C6',
    /** Par do token --teal-text: exportacoes ("Baixar planilha"). */
    teal: isDark ? '#5FD3C6' : '#1D9688',
    /** Par do token --info-text: links e acoes informativas. */
    info: isDark ? '#66CFFF' : '#016999',
  };
}

/**
 * Icone + texto na mesma linha.
 *
 * Existe pra substituir os emojis que ficavam DENTRO do texto ("🚗 Maps",
 * "👥 Vendedores & usuarios"). Trocar cada um na mao viraria uma <View> de
 * linha por chamada, com alinhamento e gap repetidos — e cada repeticao e'
 * uma chance de desalinhar uma tela.
 *
 * O `tone` resolve a cor do icone pelo tema: o <Text> ao lado usa var(--x) do
 * CSS, mas o <svg> precisa de valor concreto em JavaScript.
 */
export function IconText({
  Icone,
  children,
  style,
  size = 16,
  tone = 'onSurface',
}: {
  Icone: IconeSvg;
  children: React.ReactNode;
  style?: any;
  size?: number;
  tone?: 'onSurface' | 'muted' | 'onBrand' | 'brand' | 'brandText' | 'tintRedText';
}) {
  const cores = useIconColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
      <Icone width={size} height={size} fill={cores[tone]} />
      <Text style={style}>{children}</Text>
    </View>
  );
}

/**
 * Icone das abas da barra inferior.
 *
 * O <View> em volta reproduz o espacamento que o <Text> do emoji dava (o
 * marginBottom do estilo navIcon) — sem ele o rotulo cola no icone.
 */
export function NavIcon({
  Icone,
  ativo,
  size = 20,
}: {
  Icone: IconeSvg;
  ativo: boolean;
  size?: number;
}) {
  const cores = useIconColors();
  return (
    <View style={{ marginBottom: 2 }}>
      <Icone width={size} height={size} fill={ativo ? cores.brand : cores.muted} />
    </View>
  );
}
