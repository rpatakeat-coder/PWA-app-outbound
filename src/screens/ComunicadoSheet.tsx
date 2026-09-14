// O recado do gestor, na frente de quem precisa saber.
//
// Sobe sozinha quando há recado publicado que esta pessoa ainda não confirmou.
// Fica sobre o mapa porque é ali que o vendedor abre o app — o card de
// desempenho é tela que ele abre de propósito, e recado precisa CHEGAR, não
// esperar ser procurado.
//
// "Entendi" grava a confirmação com o id DELE. O banco não aceita outro
// (`with check (leitor_id = auth.uid())`), então o número que o gestor vê no
// cockpit é sempre gente que realmente abriu isto.
//
// Não há como fechar sem confirmar, e é deliberado: um recado que se descarta
// com um toque fora vira um recado que ninguém leu e todo mundo "recebeu". Mas
// também não trava o app — se houver vários, eles vêm um a um, e a folha
// some quando acabam.
import { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from '../components/KeyboardAvoidingView';
import { useLayout } from '../hooks/useLayout';
import type { ComunicadoNaoLido } from '../hooks/useComunicados';

export function ComunicadoSheet({
  comunicado,
  restantes,
  aoConfirmar,
}: {
  comunicado: ComunicadoNaoLido;
  /** Quantos ainda vêm depois deste. Zero = é o último. */
  restantes: number;
  aoConfirmar: (id: string) => Promise<void> | void;
}) {
  const layout = useLayout();
  const [ocupado, setOcupado] = useState(false);

  const quando = new Date(comunicado.publicadoEm).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    // Sem `onRequestClose` que feche: a saída é confirmar. Ver o topo.
    <Modal visible animationType="slide" transparent>
      <View style={[estilos.fundo, layout.ehLargo && estilos.fundoWeb]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[estilos.folha, layout.ehLargo && estilos.folhaWeb]}
        >
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
            <Text style={estilos.etiqueta}>
              Recado da gestão
              {restantes > 0 ? ` · mais ${restantes} depois deste` : ''}
            </Text>
            <Text style={estilos.titulo}>{comunicado.titulo}</Text>
            <Text style={estilos.quando}>
              {comunicado.autor ? `${comunicado.autor} · ` : ''}
              {quando}
            </Text>

            <Text style={estilos.mensagem}>{comunicado.mensagem}</Text>

            <TouchableOpacity
              disabled={ocupado}
              onPress={async () => {
                setOcupado(true);
                try {
                  await aoConfirmar(comunicado.id);
                } finally {
                  setOcupado(false);
                }
              }}
              accessibilityRole="button"
              style={[estilos.botao, { minHeight: layout.alvo }, ocupado && { opacity: 0.5 }]}
            >
              <Text style={estilos.botaoTexto}>{ocupado ? 'Registrando…' : 'Entendi'}</Text>
            </TouchableOpacity>

            <Text style={estilos.rodape}>
              Ao tocar em “Entendi”, fica registrado que você leu. Ninguém marca isso por você.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  fundoWeb: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  folha: {
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '86%',
  },
  folhaWeb: { width: '100%', maxWidth: 520, borderRadius: 8, maxHeight: '80%' },
  etiqueta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'var(--brand-text)',
    marginBottom: 6,
  },
  titulo: { fontSize: 20, fontWeight: '700', color: 'var(--text)' },
  quando: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 4 },
  mensagem: {
    fontSize: 15,
    lineHeight: 22,
    color: 'var(--text)',
    marginTop: 16,
    marginBottom: 20,
  },
  botao: {
    backgroundColor: '#222222',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botaoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rodape: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 10, lineHeight: 16 },
});
