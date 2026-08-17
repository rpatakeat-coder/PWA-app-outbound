import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMinhaDaily } from '../hooks/useMinhaDaily';
import { Alert } from '../components/Alert';

// "Minha Daily" — a promessa do dia e o placar dela, pro proprio vendedor.
//
// POR QUE ELE PRECISA VER ISSO
// O placar existia so' no cockpit do gestor. Pontuacao e sequencia que so' o
// chefe enxerga nao sao jogo, sao vigilancia — e a Daily do documento de
// referencia e' um ritual gamificado que so' funciona se quem joga ve' o
// proprio placar.
//
// A PROMESSA E' DELE, E SO' DELE
// O gestor nao promete no lugar de ninguem (a RLS impede). Se pudesse, deixaria
// de ser palavra dada e viraria meta imposta com outro nome — e o placar
// mediria a coisa errada.

const ATALHOS = [4, 6, 8, 10];

function Celula({ d, ehHoje }: { d: { visitas: number; prometido: number | null; cumpriu: boolean | null }; ehHoje: boolean }) {
  const cor =
    d.cumpriu === null ? 'var(--text-faint)'
    : d.cumpriu ? 'var(--tint-green-text)'
    : d.visitas > 0 ? 'var(--tint-amber-text)'
    : 'var(--tint-red-text)';
  return (
    <View style={[styles.celula, ehHoje && styles.celulaHoje]}>
      <Text style={[styles.celulaNum, { color: cor }]}>
        {d.cumpriu === null ? '·' : d.visitas}
      </Text>
      {d.prometido != null && <Text style={styles.celulaDen}>/{d.prometido}</Text>}
    </View>
  );
}

export function MinhaDailyCard({ enabled }: { enabled: boolean }) {
  const { daily, isLoading, prometer, anotar } = useMinhaDaily(enabled);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState<string | null>(null);

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="var(--brand-text)" />
      </View>
    );
  }
  if (!daily) return null;
  // Quem o gestor marcou como "nao e' vendedor" nao ve' o cartao: pedir
  // promessa de visita pra quem nao faz campo e' ruido, e a curadoria pra isso
  // ja' existe (seller_classification).
  if (!daily.souDeCampo) return null;

  const { hoje, semana, sequencia } = daily;
  const prometido = hoje.prometido;
  const faltam = prometido != null ? Math.max(0, prometido - hoje.visitas) : 0;

  const salvar = (n: number) => {
    prometer.mutate(n, {
      onError: (e: any) =>
        Alert.alert(
          'Não consegui salvar',
          /relation .* does not exist|schema cache/i.test(e?.message ?? '')
            ? 'A tabela de promessas ainda não foi criada no banco.'
            : e?.message ?? 'Tente de novo.',
        ),
    });
    setEditando(false);
    setValor('');
  };

  return (
    <View style={styles.card}>
      <View style={styles.topo}>
        <Text style={styles.titulo}>Minha Daily</Text>
        {sequencia > 0 && <Text style={styles.sequencia}>🔥 {sequencia} dias seguidos</Text>}
      </View>

      {prometido == null || editando ? (
        <>
          <Text style={styles.pergunta}>
            {prometido == null ? 'Quantas visitas você faz hoje?' : 'Mudar a promessa de hoje'}
          </Text>
          <View style={styles.atalhos}>
            {ATALHOS.map((n) => (
              <TouchableOpacity key={n} style={styles.atalho} onPress={() => salvar(n)}>
                <Text style={styles.atalhoTexto}>{n}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.entrada}
              value={valor}
              onChangeText={(t) => setValor(t.replace(/[^0-9]/g, '').slice(0, 2))}
              placeholder="outro"
              placeholderTextColor="var(--text-faint)"
              keyboardType="number-pad"
              onSubmitEditing={() => valor && salvar(Number(valor))}
            />
            {!!valor && (
              <TouchableOpacity style={styles.confirmar} onPress={() => salvar(Number(valor))}>
                <Text style={styles.confirmarTexto}>OK</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.rodape}>
            É a sua palavra do dia. O feito vem sozinho dos seus check-ins.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.placar}>
            <Text style={styles.feito}>{hoje.visitas}</Text>
            <Text style={styles.de}>de {prometido}</Text>
            <TouchableOpacity onPress={() => setEditando(true)} style={styles.mudar}>
              <Text style={styles.mudarTexto}>mudar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.barra}>
            <View
              style={[
                styles.barraCheia,
                {
                  width: `${Math.min(100, (hoje.visitas / Math.max(1, prometido)) * 100)}%`,
                  backgroundColor: hoje.cumpriu ? 'var(--tint-green-text)' : 'var(--brand-text)',
                },
              ]}
            />
          </View>

          <Text style={styles.estado}>
            {hoje.cumpriu
              ? sequencia > 0
                ? `Palavra cumprida. Sequência em ${sequencia + 1} dias.`
                : 'Palavra cumprida hoje.'
              : `Faltam ${faltam} ${faltam === 1 ? 'visita' : 'visitas'}.`}
          </Text>
        </>
      )}

      <View style={styles.semana}>
        {semana.map((d) => (
          <Celula key={d.dia} d={d} ehHoje={d.dia === hoje.dia} />
        ))}
      </View>

      <TextInput
        style={styles.nota}
        value={nota ?? daily.notaDeHoje ?? ''}
        onChangeText={setNota}
        onBlur={() => nota != null && anotar.mutate(nota)}
        placeholder="O que travou ou o que rendeu hoje?"
        placeholderTextColor="var(--text-faint)"
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'var(--surface)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--border)',
    padding: 16,
    marginBottom: 16,
  },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titulo: { fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  sequencia: { fontSize: 13, fontWeight: '800', color: 'var(--tint-amber-text)' },

  pergunta: { fontSize: 15, color: 'var(--text)', marginBottom: 10, fontWeight: '600' },
  atalhos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  atalho: {
    minWidth: 48, minHeight: 48, paddingHorizontal: 14,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: 'var(--border)',
    backgroundColor: 'var(--surface-2)',
  },
  atalhoTexto: { fontSize: 17, fontWeight: '800', color: 'var(--text)' },
  entrada: {
    minWidth: 72, minHeight: 48, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: 'var(--border)',
    backgroundColor: 'var(--surface-2)', color: 'var(--text)', fontSize: 15,
  },
  confirmar: {
    minHeight: 48, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, backgroundColor: 'var(--brand-text)',
  },
  confirmarTexto: { color: '#fff', fontWeight: '800', fontSize: 15 },
  rodape: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 8 },

  placar: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  feito: { fontSize: 34, fontWeight: '800', color: 'var(--text)' },
  de: { fontSize: 16, color: 'var(--text-muted)' },
  mudar: { marginLeft: 'auto', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  mudarTexto: { fontSize: 13, fontWeight: '700', color: 'var(--brand-text)' },

  barra: { height: 10, borderRadius: 5, backgroundColor: 'var(--surface-3)', marginTop: 8, overflow: 'hidden' },
  barraCheia: { height: '100%', borderRadius: 5 },
  estado: { fontSize: 13, color: 'var(--text-muted)', marginTop: 8 },

  semana: { flexDirection: 'row', gap: 6, marginTop: 14 },
  celula: {
    flex: 1, alignItems: 'center', paddingVertical: 6,
    borderRadius: 8, backgroundColor: 'var(--surface-2)',
  },
  celulaHoje: { borderWidth: 1, borderColor: 'var(--border)', borderStyle: 'dashed' },
  celulaNum: { fontSize: 15, fontWeight: '800' },
  celulaDen: { fontSize: 10, color: 'var(--text-faint)' },

  nota: {
    marginTop: 14, minHeight: 60, padding: 10,
    borderRadius: 10, borderWidth: 1, borderColor: 'var(--border)',
    backgroundColor: 'var(--surface-2)', color: 'var(--text)', fontSize: 14,
    textAlignVertical: 'top',
  },
});
