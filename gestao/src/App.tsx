// Casca do cockpit: sessao, papel e a tela.
//
// O cockpit e' ferramenta de GESTAO — so' gestor entra. Quem nao for cai numa
// tela que aponta o caminho certo (o app de campo), em vez de um 403 seco.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Cockpit } from './telas/Cockpit';
import './estilos/tokens.css';

type Estado = 'carregando' | 'anonimo' | 'sem-permissao' | 'ok';

export default function App() {
  const [estado, setEstado] = useState<Estado>('carregando');
  const [nome, setNome] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setEstado('anonimo');
      const { data: perfil } = await supabase
        .from('profiles').select('full_name, role').eq('id', session.user.id).maybeSingle();
      setNome(perfil?.full_name ?? session.user.email ?? '');
      setEstado(perfil?.role === 'gestor' ? 'ok' : 'sem-permissao');
    })();
  }, []);

  if (estado === 'carregando') return <div className="envoltorio"><div className="cartao">Verificando sessão…</div></div>;

  if (estado === 'anonimo') return (
    <div className="envoltorio"><div className="cartao">
      <strong>Entre pelo app de campo primeiro.</strong>
      <div style={{ color: 'var(--muted)', margin: '6px 0 12px' }}>
        A sessão é compartilhada: depois de entrar lá, volte aqui.
      </div>
      <a href="/" style={{ color: 'var(--red)', fontWeight: 700 }}>Ir para o app →</a>
    </div></div>
  );

  if (estado === 'sem-permissao') return (
    <div className="envoltorio"><div className="cartao">
      <strong>Este painel é da gestão.</strong>
      <div style={{ color: 'var(--muted)', margin: '6px 0 12px' }}>
        {nome}, seu dia acontece no app de campo — mapa, rota e visitas.
      </div>
      <a href="/" style={{ color: 'var(--red)', fontWeight: 700 }}>Ir para o app →</a>
    </div></div>
  );

  return <Cockpit />;
}
