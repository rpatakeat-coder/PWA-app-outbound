// A faixa da rua (02/10/2026). Julyan: "eu preciso que eles visitem, coloque sempre na aba
// hoje do executivo e no app deles pra gente ir pra rua". Fica fixa logo abaixo do topo do
// mapa, para o executivo, em dia útil: visitas de hoje contra a meta do dia e o botão que
// leva para a rua (a rota do dia; sem rota, o Montar meu dia).
//
// Os números são os mesmos da pílula da folha e do Hoje do Cockpit: visitas de
// meu_placar()/visitas_do_dia e a meta do dia (promessa da Daily, senão a meta da pessoa,
// senão a do time). Sem placar, a faixa mostra a meta e o botão — nunca um zero inventado.
// Vermelha se ainda não houve visita depois das 10h; verde quando a meta foi batida.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const ALTURA_FAIXA_RUA = 52;

type Props = {
  top: number;
  /** Tela larga (PC): a faixa fica no topo da área do mapa, sem cobrir o botão de localização. */
  largo?: boolean;
  feitas: number | null;
  meta: number;
  temRota: boolean;
  aoIr: () => void;
};

export function tomDaFaixa(feitas: number | null, meta: number, hora: number): 'ok' | 'alerta' | 'andando' {
  if (feitas != null && meta > 0 && feitas >= meta) return 'ok';
  if ((feitas == null || feitas === 0) && hora >= 10) return 'alerta';
  return 'andando';
}

const COR = { ok: '#22A06B', alerta: '#E5484D', andando: '#F5A524' } as const;

function horaBRT(): number {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }));
  return Number.isFinite(h) ? h : 12;
}

export default function FaixaDaRua({ top, largo, feitas, meta, temRota, aoIr }: Props) {
  const hora = horaBRT();
  const tom = tomDaFaixa(feitas, meta, hora);
  const faltam = feitas == null ? null : Math.max(0, meta - feitas);
  const titulo = feitas == null
    ? `Meta de hoje: ${meta} ${meta === 1 ? 'visita' : 'visitas'}`
    : faltam === 0
      ? `Meta batida: ${feitas} de ${meta}`
      : feitas === 0
        ? `Nenhuma visita ainda · meta ${meta}`
        : `Visitas hoje: ${feitas} de ${meta}`;
  const sub = feitas == null
    ? 'o placar não carregou — a meta vale'
    : faltam === 0
      ? 'cada porta a mais é funil da semana que vem'
      : `faltam ${faltam} ${faltam === 1 ? 'porta' : 'portas'}`;
  const rotulo = tom === 'ok' ? 'Ver rota' : temRota ? 'Ir pra rua' : 'Montar a rota';
  return (
    <View style={[s.faixa, largo && s.faixaLarga, { top, borderLeftColor: COR[tom] }]} accessibilityRole="summary">
      <View style={s.txt}>
        <Text style={[s.titulo, tom === 'alerta' && { color: '#FF8A8D' }]} numberOfLines={1}>{titulo}</Text>
        <Text style={s.sub} numberOfLines={1}>{sub}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={rotulo} onPress={aoIr}
        style={[s.botao, { backgroundColor: tom === 'ok' ? COR.ok : '#D30000' }]}>
        <Text style={s.botaoTexto} numberOfLines={1}>{rotulo} →</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  faixa: {
    position: 'absolute', left: 12, right: 12, height: ALTURA_FAIXA_RUA, zIndex: 29,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#2E333B', borderLeftWidth: 4,
    backgroundColor: 'rgba(20,22,26,.92)',
    // @ts-expect-error — só existe no web; o mesmo vidro do TopoCampo.
    backdropFilter: 'blur(12px)',
  },
  faixaLarga: { right: 72, maxWidth: 640 },
  txt: { flex: 1, minWidth: 0 },
  titulo: { color: '#F4F5F7', fontSize: 14, fontWeight: '700' },
  sub: { color: '#A4ABB6', fontSize: 11, marginTop: 1 },
  botao: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  botaoTexto: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
