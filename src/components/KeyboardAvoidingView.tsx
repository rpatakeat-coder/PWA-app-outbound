// KeyboardAvoidingView que REALMENTE funciona na web.
//
// O react-native-web exporta um componente com esse nome, mas ele e' um
// esqueleto: o metodo que deveria reagir ao teclado esta' vazio
//
//     onKeyboardChange(event) {}        <- react-native-web/.../KeyboardAvoidingView
//
// No app nativo isso nao aparecia; no PWA do iPhone, tocar num campo da
// metade de baixo da tela faz o teclado subir POR CIMA dele. Atinge cadastro
// de lead, CEP, agendamento, troca de etapa e notas — os fluxos que o
// vendedor usa em pe', na rua.
//
// Aqui a altura do teclado vem da API `visualViewport`, que e' a unica no
// navegador que enxerga o teclado virtual: quando ele abre, a viewport
// VISUAL encolhe enquanto a layout viewport (window.innerHeight) continua a
// mesma. A diferenca entre as duas e' exatamente a altura do teclado.
import React, { useEffect, useState } from 'react';
import { View, type ViewProps } from 'react-native';

export interface KeyboardAvoidingViewProps extends ViewProps {
  children?: React.ReactNode;
  /**
   * Aceito por compatibilidade com o componente do react-native e ignorado:
   * na web so' existe uma estrategia possivel (empurrar pelo padding). As
   * chamadas existentes passam `behavior={Platform.OS === 'ios' ? ...}`, que
   * na web caía em 'height' ou undefined — nenhum dos dois fazia nada.
   */
  behavior?: 'height' | 'position' | 'padding';
  /** Folga extra acima do teclado (ex.: barra de acoes fixa). */
  keyboardVerticalOffset?: number;
}

/**
 * Altura do teclado virtual, em px. 0 quando fechado.
 *
 * Exportado a' parte porque outras telas podem querer reagir ao teclado sem
 * envolver a arvore inteira num container.
 */
export function useKeyboardHeight(): number {
  const [altura, setAltura] = useState(0);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;

    const medir = () => {
      // `offsetTop` entra na conta porque o iOS tambem DESLOCA a viewport
      // visual quando o campo focado esta' perto do rodape — sem ele, a
      // altura calculada fica menor que o teclado de verdade.
      const oculto = window.innerHeight - vv.height - vv.offsetTop;
      // Ruido de barra de endereco some/aparece produz valores pequenos;
      // abaixo de 80px nao e' teclado.
      setAltura(oculto > 80 ? Math.round(oculto) : 0);
    };

    medir();
    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    return () => {
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
    };
  }, []);

  return altura;
}

export function KeyboardAvoidingView({
  children,
  style,
  keyboardVerticalOffset = 0,
  // `behavior` e' desestruturado so' pra NAO cair no ...rest e virar atributo
  // solto no DOM.
  behavior: _behavior,
  ...rest
}: KeyboardAvoidingViewProps) {
  const teclado = useKeyboardHeight();

  return (
    <View
      {...rest}
      style={[
        style,
        // paddingBottom em vez de height: preserva o flex de quem esta'
        // dentro (as telas usam flex:1 + ScrollView) e nao briga com a
        // area segura, que ja' entra pelo insets.bottom de cada tela.
        teclado > 0 && { paddingBottom: teclado + keyboardVerticalOffset },
      ]}
    >
      {children}
    </View>
  );
}
