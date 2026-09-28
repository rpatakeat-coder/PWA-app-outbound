// "Meu dia em números" (handoff v4.1 §6.12; 28/09/2026, Julyan: "tem que ter quantas
// visitas com checkin… 6 visitas alinhados, tem que ter cor latente, e a semana pelo
// menos 30 visitas, quantas demos, quantos clientes ganhos").
//
// No topo, o que se cobra: visitas com check-in hoje (x de 6, uma casa por visita, em
// vermelho até bater e verde quando bate) e a semana (x de 30 = meta do dia × 5), com
// demos e clientes ganhos. Os ganhos são o número do Cockpit (robô do HubSpot, via
// meu_placar). Embaixo continua o que já existia: reuniões, Daily, sequência e a
// próxima porta. O painel completo segue no Cockpit.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import { IconClose, useIconColors } from '../components/icons';
import type { MeuDia } from '../hooks/useMeuDia';

type Props = {
  visivel: boolean;
  aoFechar: () => void;
  dados: MeuDia | undefined;
  carregando: boolean;
  metaPadrao: number;
  portasNaMicrorrota: number;
  proxima: { nome: string } | null;
  aoIrProxima: () => void;
};

const VERMELHO = '#E51A31';
const VERDE = '#16A34A';

/** Uma casa por visita da meta: "6 visitas alinhadas". Passou da meta, as casas extras entram. */
function Casas({ feito, meta }: { feito: number; meta: number }) {
  const total = Math.max(meta, Math.min(feito, 12));
  const bateu = feito >= meta;
  return (
    <View style={s.casas} accessibilityLabel={`${feito} de ${meta} visitas`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.casa, i < feito && { backgroundColor: bateu ? VERDE : VERMELHO }, i >= meta && s.casaExtra]} />
      ))}
    </View>
  );
}

function Trilho({ feito, meta }: { feito: number; meta: number }) {
  const pct = meta > 0 ? Math.min(1, feito / meta) : 0;
  return (
    <View style={s.trilho}>
      <View style={[s.preenchido, { width: `${pct * 100}%`, backgroundColor: pct >= 1 ? VERDE : VERMELHO }]} />
    </View>
  );
}

export default function FolhaMeuDia({ visivel, aoFechar, dados, carregando, metaPadrao, portasNaMicrorrota, proxima, aoIrProxima }: Props) {
  const meta = dados?.prometido?.visitas && dados.prometido.visitas > 0 ? dados.prometido.visitas : metaPadrao;
  const metaSemana = metaPadrao * 5;
  const feitas = dados?.visitasHoje ?? 0;
  const bateu = !!dados && feitas >= meta;
  const faltam = dados ? Math.max(0, meta - feitas) : null;
  const frase = faltam == null ? null
    : faltam === 0 ? `Meta de visitas batida. ${portasNaMicrorrota ? `Ainda há ${portasNaMicrorrota} portas boas na microrrota.` : 'Siga para a próxima porta.'}`
    : `Faltam ${faltam} ${faltam === 1 ? 'visita' : 'visitas'}. ${portasNaMicrorrota ? `Tem ${portasNaMicrorrota} ${portasNaMicrorrota === 1 ? 'porta boa' : 'portas boas'} na sua microrrota agora.` : 'Abra a lente Meu dia para achar a próxima porta.'}`;
  const p = dados?.prometido;
  const sem = dados?.semana ?? null;
  const cores = useIconColors();
  const semanaBateu = !!sem && sem.visitas >= metaSemana;
  return (
    <Painel visivel={visivel} aoFechar={aoFechar} rotulo="Meu dia em números" topo={
      <View style={s.topo}>
        <Text style={s.titulo}>Meu dia</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fechar}>
          <IconClose width={20} height={20} fill={cores.muted} />
        </Pressable>
      </View>
    }>
      <View style={s.corpo}>
        {carregando || !dados ? <ActivityIndicator /> : (
          <>
            {/* HOJE: o número que se cobra, grande e com cor */}
            <View style={[s.hero, bateu ? s.heroVerde : s.heroVermelho]}>
              <Text style={[s.heroRotulo, { color: bateu ? 'var(--tint-green-text)' : 'var(--tint-red-text)' }]}>
                {`VISITAS COM CHECK-IN HOJE · ${p?.visitas ? 'PROMETIDO NA DAILY' : 'META DO DIA'}`}
              </Text>
              <View style={s.heroLinha}>
                <Text style={[s.heroNum, { color: bateu ? VERDE : VERMELHO }]}>{feitas}</Text>
                <Text style={s.heroDe}>{`de ${meta}`}</Text>
              </View>
              <Casas feito={feitas} meta={meta} />
              {!!frase && <Text style={s.frase}>{frase}</Text>}
            </View>

            {/* SEMANA: visitas × meta da semana, demos e ganhos */}
            {sem ? (
              <View style={s.semana}>
                <View style={s.semanaTopo}>
                  <Text style={s.secao}>SEMANA</Text>
                  <Text style={[s.semanaNum, { color: semanaBateu ? VERDE : 'var(--text)' }]}>
                    {`${sem.visitas}`}<Text style={s.semanaDe}>{` / ${metaSemana} visitas`}</Text>
                  </Text>
                </View>
                <Trilho feito={sem.visitas} meta={metaSemana} />
                <View style={s.blocos}>
                  <View style={s.bloco}>
                    <Text style={s.blocoNum}>{sem.demos}</Text>
                    <Text style={s.blocoRotulo}>{sem.demos === 1 ? 'demo marcada' : 'demos marcadas'}</Text>
                  </View>
                  <View style={[s.bloco, (sem.ganhos ?? 0) > 0 && s.blocoGanho]}>
                    <Text style={[s.blocoNum, (sem.ganhos ?? 0) > 0 && { color: VERDE }]}>{sem.ganhos ?? '—'}</Text>
                    <Text style={s.blocoRotulo}>{sem.ganhos === 1 ? 'cliente ganho' : 'clientes ganhos'}</Text>
                    {sem.ganhosMes != null && (
                      <Text style={s.blocoSub}>{`${sem.ganhosMes}${sem.metaMes ? ` de ${sem.metaMes}` : ''} no mês`}</Text>
                    )}
                  </View>
                </View>
                {sem.ganhosNomes.length > 0 && (
                  <Text style={s.nomes} numberOfLines={2}>{sem.ganhosNomes.join(' · ')}</Text>
                )}
              </View>
            ) : (
              <Text style={s.aviso}>Não consegui ler os números da semana agora. Puxe o Meu dia de novo em instantes.</Text>
            )}

            <View style={s.linha}>
              <Text style={s.linhaRotulo}>Reuniões</Text>
              <Text style={s.linhaValor}>{`${dados.reunioesMarcadasHoje} marcadas hoje · ${dados.reunioesParaHoje} na agenda de hoje`}</Text>
            </View>
            <View style={s.linha}>
              <Text style={s.linhaRotulo}>Daily</Text>
              <Text style={s.linhaValor}>
                {p ? [p.visitas ? `${p.visitas} visitas` : null, p.avancos ? `${p.avancos} avanços` : null, p.propostas ? `${p.propostas} propostas` : null].filter(Boolean).join(' · ') || 'prometido sem números'
                  : 'ainda não fechada no Cockpit hoje'}
              </Text>
            </View>
            <View style={s.linha}>
              <Text style={s.linhaRotulo}>Sequência</Text>
              <Text style={s.linhaValor}>{dados.sequenciaDias ? `${dados.sequenciaDias} ${dados.sequenciaDias === 1 ? 'dia com rua' : 'dias seguidos com rua'}` : 'comece hoje'}</Text>
            </View>
            {proxima && (
              <Pressable accessibilityRole="button" onPress={() => { aoFechar(); aoIrProxima(); }} style={s.botao}>
                <Text style={s.botaoTexto} numberOfLines={1}>{`Ir para a próxima porta · ${proxima.nome}`}</Text>
              </Pressable>
            )}
            <Text style={s.nota}>Ganhos: o mesmo número do Cockpit, atualizado pelo HubSpot a cada 2 h. O painel completo fica no Cockpit.</Text>
          </>
        )}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  titulo: { flex: 1, fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  corpo: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  hero: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  heroVermelho: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  heroVerde: { backgroundColor: 'var(--tint-green)', borderColor: 'var(--tint-green-border)' },
  heroRotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  heroLinha: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroNum: { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  heroDe: { fontSize: 18, fontWeight: '700', color: 'var(--text-muted)' },
  casas: { flexDirection: 'row', gap: 6 },
  casa: { flex: 1, height: 12, borderRadius: 4, backgroundColor: 'var(--surface-2)' },
  casaExtra: { opacity: 0.7 },
  frase: { fontSize: 14, fontWeight: '600', color: 'var(--text)', lineHeight: 20 },
  semana: { gap: 10, borderRadius: 16, borderWidth: 1, borderColor: 'var(--border-soft)', padding: 16 },
  semanaTopo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  secao: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: 'var(--text-muted)' },
  semanaNum: { fontSize: 24, fontWeight: '800' },
  semanaDe: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  trilho: { height: 10, borderRadius: 5, backgroundColor: 'var(--surface-2)', overflow: 'hidden' },
  preenchido: { height: 10, borderRadius: 5 },
  blocos: { flexDirection: 'row', gap: 10 },
  bloco: { flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: 'var(--surface-2)', paddingVertical: 12, paddingHorizontal: 12, gap: 2 },
  blocoGanho: { backgroundColor: 'var(--tint-green)' },
  blocoNum: { fontSize: 28, fontWeight: '800', color: 'var(--text)' },
  blocoRotulo: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  blocoSub: { fontSize: 12, color: 'var(--text-muted)' },
  nomes: { fontSize: 12, color: 'var(--tint-green-text)', fontWeight: '600' },
  aviso: { fontSize: 13, color: 'var(--tint-red-text)' },
  linha: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  linhaRotulo: { width: 86, fontSize: 13, color: 'var(--text-muted)' },
  linhaValor: { flex: 1, fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  botao: { height: 56, borderRadius: 16, backgroundColor: VERMELHO, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botaoTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  nota: { fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' },
});
