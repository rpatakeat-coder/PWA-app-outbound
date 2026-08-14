// Drawer de 480px pela direita.
//
// E' o "nivel 3" do doc (02-FUNCIONALIDADES.md, regra 1): detalhe operacional
// mora SEMPRE em drawer, nunca inline. A regra existe pra a tela principal nao
// virar um mural — o gestor abre, resolve, fecha, e o contexto dele continua
// atras.
//
// Fecha no X, no fundo e no Esc — os tres caminhos que o doc pede.
import { useEffect, type ReactNode } from 'react';

export function Drawer({
  aberto,
  titulo,
  subtitulo,
  aoFechar,
  children,
}: {
  aberto: boolean;
  titulo: string;
  subtitulo?: string;
  aoFechar: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    // Trava o scroll do fundo: sem isso, rolar dentro do drawer arrasta a
    // pagina inteira junto quando a lista chega ao fim.
    const scrollAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = scrollAnterior;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <>
      <div
        onClick={aoFechar}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(26,22,19,0.35)',
          zIndex: 40,
        }}
      />
      <aside
        role="dialog"
        aria-label={titulo}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(480px, 100vw)',
          background: 'var(--panel)',
          borderLeft: '1px solid var(--line)',
          zIndex: 41,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 24px rgba(26,22,19,0.10)',
        }}
      >
        <header
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{titulo}</div>
            {subtitulo && (
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{subtitulo}</div>
            )}
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              color: 'var(--muted)',
              // 44px de alvo: mesma regra de toque que vale no app de campo.
              width: 44,
              height: 44,
            }}
          >
            ✕
          </button>
        </header>
        <div style={{ padding: '12px 18px 32px', overflowY: 'auto' }}>{children}</div>
      </aside>
    </>
  );
}
