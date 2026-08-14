// Alert compativel com o do react-native — que o react-native-web NAO
// implementa (chamar Alert.alert na web e' no-op silencioso).
//
// Sao 129 chamadas espalhadas por 14 arquivos, varias com botoes de
// confirmacao/destrutivos que decidem fluxo (dispensar Conta Alvo, excluir
// lead, sair da rota). Manter a assinatura identica significa que nenhum
// desses 129 pontos precisa mudar: so troca o import.
//
// Por que nao window.confirm: ele bloqueia a thread, nao aceita mais de dois
// botoes, nao tem estilo destrutivo e alguns navegadores mobile o suprimem em
// PWA instalado. Aqui e' um Modal do proprio app.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
}

interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

// Fila em vez de um slot unico: ha fluxos que disparam um segundo alerta no
// onPress do primeiro (ex.: confirmar exclusao -> avisar erro). Com um slot
// so, o segundo sobrescreveria o primeiro antes de ele fechar.
let queue: AlertRequest[] = [];
let notify: (() => void) | null = null;
let nextId = 1;

function emit() {
  notify?.();
}

export const Alert = {
  /**
   * Mesma assinatura do react-native. Sem `buttons`, mostra um "OK".
   */
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    queue.push({
      id: nextId++,
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
    });
    emit();
  },
};

/**
 * Precisa estar montado uma vez, no topo da arvore (App.tsx). Sem ele as
 * chamadas entram na fila e nada aparece.
 */
export function AlertHost() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    notify = () => forceRender((n) => n + 1);
    return () => {
      notify = null;
    };
  }, []);

  const current = queue[0];
  if (!current) return null;

  const dismiss = (button: AlertButton) => {
    queue = queue.slice(1);
    forceRender((n) => n + 1);
    // onPress depois de tirar da fila: se ele abrir outro alerta, o novo
    // entra numa fila ja limpa e aparece em seguida.
    button.onPress?.();
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      // Sem isso, Esc/voltar do navegador fecharia o modal deixando o item na
      // fila — o alerta reapareceria no proximo render.
      onRequestClose={() => {
        const cancel = current.buttons.find((b) => b.style === 'cancel');
        dismiss(cancel ?? current.buttons[current.buttons.length - 1]);
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{current.title}</Text>
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}

          <View style={[styles.buttonRow, current.buttons.length > 2 && styles.buttonColumn]}>
            {current.buttons.map((button, i) => (
              <Pressable
                key={i}
                onPress={() => dismiss(button)}
                style={({ pressed }) => [
                  styles.button,
                  current.buttons.length > 2 && styles.buttonFull,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === 'cancel' && styles.buttonTextCancel,
                    button.style === 'destructive' && styles.buttonTextDestructive,
                  ]}
                >
                  {button.text ?? 'OK'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'var(--surface)',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: { fontSize: 17, fontWeight: '800', color: 'var(--text)' },
  message: { fontSize: 14, color: 'var(--text-muted)', marginTop: 8, lineHeight: 20 },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20,
  },
  // 3+ botoes empilham: lado a lado eles ficariam estreitos demais pra ler.
  buttonColumn: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  buttonFull: { alignItems: 'center' },
  buttonPressed: { backgroundColor: 'var(--surface-2)' },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  buttonTextCancel: { color: 'var(--text-muted)' },
  buttonTextDestructive: { color: '#C8131B' },
});
