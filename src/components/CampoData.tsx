// Campo de data que abre o CALENDÁRIO do aparelho (29/09/2026, Julyan: "data de reunião
// você pode selecionar, abrindo o calendário").
//
// O TextInput do react-native-web descarta `type="date"`: o campo abria o teclado e
// pedia "AAAA-MM-DD" digitado. No navegador (o app é um PWA) este componente é um
// <input type="date"> de verdade — no iPhone e no Android abre o seletor nativo — e o
// valor sai no mesmo formato AAAA-MM-DD que o servidor espera. Fora da web, cai no
// TextInput com a máscara.
import React from 'react';
import { Platform, TextInput, type TextStyle } from 'react-native';
import { useTheme } from '../theme';

type Props = {
  valor: string;
  aoMudar: (v: string) => void;
  rotulo: string;
  /** Dia mais cedo aceito (AAAA-MM-DD), por exemplo hoje para reunião. */
  minimo?: string;
  estilo?: TextStyle;
};

export function CampoData({ valor, aoMudar, rotulo, minimo, estilo }: Props) {
  const { isDark } = useTheme();
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'date',
      value: valor,
      min: minimo,
      'aria-label': rotulo,
      onChange: (e: { target: { value: string } }) => aoMudar(e.target.value),
      style: {
        minHeight: 48, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)',
        padding: '0 12px', fontSize: 16, color: 'var(--text)', fontFamily: 'inherit', width: '100%',
        boxSizing: 'border-box', colorScheme: isDark ? 'dark' : 'light',
        // o iPhone deixa o campo vazio com altura zero sem isto
        WebkitAppearance: 'none', display: 'block', textAlign: 'left',
      },
    });
  }
  return (
    <TextInput
      style={estilo}
      value={valor}
      onChangeText={aoMudar}
      placeholder="AAAA-MM-DD"
      placeholderTextColor="#8B919C"
      accessibilityLabel={rotulo}
    />
  );
}
