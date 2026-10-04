// Barreira de uma aba só (04/10/2026). A BarreiraDeErro do index.js troca o app INTEIRO
// por uma tela de erro: um defeito numa tela nova derrubaria Mapa, Rota e Agenda junto.
// Esta segura o erro dentro da aba — ela mostra o que quebrou, com "Tentar de novo", e o
// resto do app segue funcionando. Mesma decisão da barreira global: a mensagem técnica
// aparece (app de campo não tem devtools), num bloco discreto embaixo da instrução.
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

type Props = { nome: string; children: ReactNode };
type Estado = { erro: Error | null };

export class BarreiraDaAba extends Component<Props, Estado> {
  state: Estado = { erro: null };
  static getDerivedStateFromError(erro: Error): Estado { return { erro }; }
  componentDidCatch(erro: Error, info: ErrorInfo) { console.error(`[${this.props.nome}] quebrou`, erro, info.componentStack); }
  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    return (
      <View style={{ flex: 1, padding: 24, gap: 12, justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: 'var(--text)' }}>{`A aba ${this.props.nome} falhou`}</Text>
        <Text style={{ fontSize: 14, color: 'var(--text-muted)' }}>As outras abas seguem funcionando. Mande um print desta tela para a gestão.</Text>
        <Pressable accessibilityRole="button" onPress={() => this.setState({ erro: null })}
          style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: 'var(--text)' }}>Tentar de novo</Text>
        </Pressable>
        <Text style={{ fontSize: 11, color: 'var(--text-faint)' }} selectable>{String(erro.message ?? erro)}</Text>
      </View>
    );
  }
}
