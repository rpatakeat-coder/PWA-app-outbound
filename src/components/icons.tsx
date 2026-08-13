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
  return (
    <View style={{ marginBottom: 2 }}>
      <Icone width={size} height={size} fill={ativo ? '#dc2626' : '#94a3b8'} />
    </View>
  );
}
