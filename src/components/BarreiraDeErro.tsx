// Barreira de erro: transforma tela preta em mensagem legivel.
//
// POR QUE EXISTE
// Em 14/08/2026 um hook mal posicionado derrubava a arvore do React ao abrir
// certos leads. Sem barreira, o React desmonta tudo e sobra o `body` — que no
// tema escuro e' #17150F. O vendedor via TELA PRETA, sem mensagem, sem log e
// sem nada pra reportar. Achar a causa exigiu uma investigacao inteira a partir
// de "fica preto as vezes".
//
// Com esta tela, o mesmo crash vira um print que ele manda no grupo e a causa
// aparece em um minuto.
//
// TRES DECISOES:
//
// 1. A MENSAGEM DO ERRO APARECE NA TELA. E' feio, e e' de proposito: um app de
//    campo nao tem devtools, e "algo deu errado" sem detalhe nao ajuda ninguem.
//    O texto tecnico fica num bloco discreto, embaixo da instrucao humana.
//
// 2. NAO USA react-native-web. Se o que quebrou foi o proprio RNW (ou o tema),
//    renderizar RNW aqui quebraria a barreira junto. HTML e estilo inline
//    sobrevivem a qualquer coisa que nao seja o navegador em si.
//
// 3. CORES LITERAIS, nao var(--...). Pelo mesmo motivo: se o CSS de tema nao
//    tiver carregado, `var(--surface)` vira transparente e a tela de erro fica
//    invisivel — reproduzindo exatamente o problema que ela existe pra evitar.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Estado {
  erro: Error | null;
  pilha: string | null;
}

export class BarreiraDeErro extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { erro: null, pilha: null };

  static getDerivedStateFromError(erro: Error): Partial<Estado> {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // Vai pro console tambem: quando alguem consegue plugar o celular no
    // desktop, a pilha completa esta' la'.
    console.error('[app] crash na renderizacao', erro, info.componentStack);
    this.setState({ pilha: info.componentStack ?? null });
  }

  render() {
    const { erro, pilha } = this.state;
    if (!erro) return this.props.children;

    // O trecho mais util da pilha e' o topo: o componente que quebrou.
    const trecho = (pilha ?? '').split('\n').filter(Boolean).slice(0, 4).join('\n');

    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#FFFEF2',
          color: '#222222',
          padding: '32px 20px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            O app travou nesta tela.
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.6, color: '#6B6B6B', marginBottom: 20 }}>
            Não é problema da sua internet nem do seu celular. Toque em recarregar para
            continuar trabalhando — nada do que você registrou foi perdido.
          </div>

          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#C8131B',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '14px 22px',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
              // 48px de alvo: o mesmo minimo do resto do app, e aqui importa
              // mais — a pessoa esta' na rua, com pressa e irritada.
              minHeight: 48,
            }}
          >
            Recarregar
          </button>

          <div style={{ fontSize: 13, color: '#6B6B6B', margin: '24px 0 8px' }}>
            Se acontecer de novo, mande um print desta parte para quem cuida do app:
          </div>
          <pre
            style={{
              background: '#F9F4E4',
              border: '1px solid #F0E6CC',
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              lineHeight: 1.5,
              color: '#8A5A00',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {erro.message}
            {trecho ? `\n${trecho}` : ''}
          </pre>
        </div>
      </div>
    );
  }
}
