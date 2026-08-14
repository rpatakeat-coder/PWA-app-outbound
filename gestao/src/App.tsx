// Casca do cockpit: sessao, papel e navegacao.
//
// O cockpit e' ferramenta de GESTAO — so' gestor entra. Quem nao for cai numa
// tela que aponta o caminho certo (o app de campo), em vez de um 403 seco.
//
// NAVEGACAO POR HASH, e nao por estado em memoria. O doc lista como erro do
// original o `activateTab` incondicional no login: `onAuthStateChange` dispara
// mais de uma vez e atropelava a aba restaurada. Lendo do hash, a aba e' funcao
// da URL — recarregar cai no mesmo lugar, o botao voltar funciona, e nenhum
// evento de auth consegue mexer nisso. Aba desconhecida cai na home do papel.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Cockpit } from './telas/Cockpit';
import { Daily } from './telas/Daily';
import { Agenda } from './telas/Agenda';
import { Prospeccao } from './telas/Prospeccao';
import { Pessoas } from './telas/Pessoas';
import { Semana } from './telas/Semana';
import './estilos/tokens.css';

type Estado = 'carregando' | 'anonimo' | 'sem-permissao' | 'ok';

const ABAS = [
  { id: 'time', rotulo: 'Time', descricao: 'Onde eu ajo hoje?' },
  { id: 'daily', rotulo: 'Daily', descricao: 'Quem cumpriu, quem está vazio?' },
  { id: 'semana', rotulo: 'Semana', descricao: 'O que mudou e o que eu faço?' },
  { id: 'agenda', rotulo: 'Agenda', descricao: 'A semana está planejada?' },
  { id: 'prospeccao', rotulo: 'Prospecção', descricao: 'O que entra no topo do funil?' },
  { id: 'pessoas', rotulo: 'Pessoas', descricao: 'Quem precisa de mim no 1:1?' },
] as const;

type AbaId = (typeof ABAS)[number]['id'];

function abaDoHash(): AbaId {
  const id = window.location.hash.replace(/^#\/?/, '');
  return (ABAS.find((a) => a.id === id)?.id ?? 'time') as AbaId;
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="envoltorio">
      <div className="cartao">
        <strong>{titulo}</strong>
        <div style={{ color: 'var(--muted)', margin: '6px 0 12px' }}>{children}</div>
        <a href="/" style={{ color: 'var(--red)', fontWeight: 700 }}>
          Ir para o app →
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const [estado, setEstado] = useState<Estado>('carregando');
  const [nome, setNome] = useState('');
  const [aba, setAba] = useState<AbaId>(abaDoHash);

  useEffect(() => {
    const aoTrocarHash = () => setAba(abaDoHash());
    window.addEventListener('hashchange', aoTrocarHash);
    return () => window.removeEventListener('hashchange', aoTrocarHash);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return setEstado('anonimo');
      const { data: perfil } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .maybeSingle();
      setNome(perfil?.full_name ?? session.user.email ?? '');
      setEstado(perfil?.role === 'gestor' ? 'ok' : 'sem-permissao');
    })();
  }, []);

  if (estado === 'carregando') {
    return (
      <div className="envoltorio">
        <div className="cartao">Verificando sessão…</div>
      </div>
    );
  }

  if (estado === 'anonimo') {
    return (
      <Aviso titulo="Entre pelo app de campo primeiro.">
        A sessão é compartilhada: depois de entrar lá, volte aqui.
      </Aviso>
    );
  }

  if (estado === 'sem-permissao') {
    return (
      <Aviso titulo="Este painel é da gestão.">
        {nome}, seu dia acontece no app de campo — mapa, rota e visitas.
      </Aviso>
    );
  }

  return (
    <div className="envoltorio">
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          borderBottom: '1px solid var(--line)',
          marginBottom: 18,
        }}
      >
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          return (
            <a
              key={a.id}
              href={`#/${a.id}`}
              title={a.descricao}
              style={{
                padding: '10px 14px',
                fontWeight: 800,
                fontSize: 14,
                textDecoration: 'none',
                color: ativa ? 'var(--ink)' : 'var(--muted)',
                // A aba ativa se marca por uma regua na base, nao por fundo
                // inteiro: fundo colorido e' reservado pra acao e alerta.
                boxShadow: ativa ? 'inset 0 -2px 0 var(--red)' : undefined,
              }}
            >
              {a.rotulo}
            </a>
          );
        })}
        <span style={{ flex: 1 }} />
        <a
          href="/"
          style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: '10px 4px' }}
        >
          App de campo →
        </a>
      </nav>

      {aba === 'daily' && <Daily />}
      {aba === 'agenda' && <Agenda />}
      {aba === 'prospeccao' && <Prospeccao />}
      {aba === 'pessoas' && <Pessoas />}
      {aba === 'semana' && <Semana />}
      {aba === 'time' && <Cockpit />}
    </div>
  );
}
