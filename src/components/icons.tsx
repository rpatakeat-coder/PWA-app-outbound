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
import { View } from 'react-native';

import { useTheme } from '../theme';

import { IconBarGraph } from 'takeat-design-system-ui-kit/icons/IconBarGraph';
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
  IconBarGraph,
  IconCalendar,
  IconCar,
  IconClipboardCheck,
  IconFilterList,
  IconLocation,
  IconLocationFilled,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSquareMenu,
  IconTrendingUp,
};

type IconeSvg = (props: Record<string, unknown>) => React.JSX.Element;

/**
 * Cores de icone conforme o tema.
 *
 * Os icones recebem a cor por PROP (`fill` no <svg>), e `var(--token)` nao
 * resolve em atributo de apresentacao do SVG — so' em CSS. Entao, ao
 * contrario do resto do app, aqui o tema precisa ser lido em JavaScript.
 *
 * Valores da paleta da marca: preto #222222 / creme #FFFEF2.
 */
export function useIconColors() {
  const { isDark } = useTheme();
  return {
    /** Sobre cartao/superficie clara ou escura. */
    onSurface: isDark ? '#FFFEF2' : '#222222',
    /** Secundario: placeholder de busca, icone inativo. */
    muted: isDark ? '#8F887A' : '#6B6B6B',
    /** Sobre o vermelho da marca ou outro fundo forte. */
    onBrand: '#FFFFFF',
    /** Destaque (aba ativa, seguindo o usuario no mapa). */
    brand: '#C8131B',
  };
}

/**
 * Icone das abas da barra inferior.
 *
 * O <View> em volta existe pra reproduzir o espacamento que o <Text> do emoji
 * dava (o marginBottom do estilo navIcon) — sem ele o rotulo cola no icone.
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
