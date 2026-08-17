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

export {
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
  IconExternalLink,
  IconEye,
  IconFilterList,
  IconHome,
  IconLocation,
  IconLocationFilled,
  IconLock,
  IconMail,
  IconMedal,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconSquareMenu,
  IconStar,
  IconStore,
  IconTrendingUp,
  IconTrophy,
  IconUndo,
  IconUser,
  IconUserGroup,
  IconWarning,
  IconWhatsapp,
};

type IconeSvg = (props: Record<string, unknown>) => React.JSX.Element;

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
