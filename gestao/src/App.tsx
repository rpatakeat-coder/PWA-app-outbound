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
import { Rotas } from './telas/Rotas';
// Icones oficiais do kit. Named import, um arquivo por icone: o pacote NAO tem
// export default nem barril em './icons' — o README e o llms.txt do proprio kit
// erram os dois, e o import default volta undefined.
// Cuidado com o nome torto: IconArrowFoward, com um 'r' so'.
import { IconUserGroup } from 'takeat-design-system-ui-kit/icons/IconUserGroup';
import { IconCalendarCheck } from 'takeat-design-system-ui-kit/icons/IconCalendarCheck';
import { IconCalendar } from 'takeat-design-system-ui-kit/icons/IconCalendar';
import { IconSchedule } from 'takeat-design-system-ui-kit/icons/IconSchedule';
import { IconCar } from 'takeat-design-system-ui-kit/icons/IconCar';
import { IconSearch } from 'takeat-design-system-ui-kit/icons/IconSearch';
import { IconIdCard } from 'takeat-design-system-ui-kit/icons/IconIdCard';
import { IconArrowFoward } from 'takeat-design-system-ui-kit/icons/IconArrowFoward';
import { IconLightBulb } from 'takeat-design-system-ui-kit/icons/IconLightBulb';
// A marca vem do kit como COMPONENTE, e nao de /marca/takeat-icon.svg: aquele
// arquivo mora no public/ do app de campo, e o caminho absoluto so' resolve em
// producao, onde os dois produtos dividem o dominio. No dev do cockpit dava 404.
import { IconTakeatFilled } from 'takeat-design-system-ui-kit/icons/IconTakeatFilled';
import './estilos/tokens.css';

type Estado = 'carregando' | 'anonimo' | 'sem-permissao' | 'ok';

/** Onde a tela ativa pinta seu filtro global de periodo/vendedor. */
export const SLOT_CABECALHO = 'cabecalho-acoes';

/**
 * Tema — a mesma chave do app de campo (`takeat.theme`), porque os dois vivem
 * no mesmo dominio e dividem o localStorage. O bootstrap que le' essa chave
 * antes do primeiro paint esta' no index.html; aqui fica so' a troca.
 *
 * 'system' e' representado pela AUSENCIA da chave, igual ao src/theme.ts do app
 * — por isso trocar grava sempre um valor explicito.
 */
const CHAVE_TEMA = 'takeat.theme';

function temaEscuroAgora(): boolean {
  const explicito = document.documentElement.getAttribute('data-theme');
  if (explicito === 'dark') return true;
  if (explicito === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// `descricao` e' a PERGUNTA que a tela responde. Vivia no `title` do link e so'
// aparecia no hover; agora e' a sublinha do cabecalho. Nao reescrever.
// `teto`: tabela pede 1600, leitura pede 1200 — texto com medida de 1500px vira
// linha de 250 caracteres, que ninguem le' sem perder a linha.
const ABAS = [
  { id: 'time', rotulo: 'Time', descricao: 'Onde eu ajo hoje?', Icone: IconUserGroup, teto: 1200 },
  { id: 'daily', rotulo: 'Daily', descricao: 'Quem cumpriu, quem está vazio?', Icone: IconCalendarCheck, teto: 1600 },
  { id: 'semana', rotulo: 'Semana', descricao: 'O que mudou e o que eu faço?', Icone: IconCalendar, teto: 1200 },
  { id: 'agenda', rotulo: 'Agenda', descricao: 'A semana está planejada?', Icone: IconSchedule, teto: 1200 },
  { id: 'rotas', rotulo: 'Rotas', descricao: 'Ver, editar e montar a rota de cada vendedor', Icone: IconCar, teto: 1600 },
  { id: 'prospeccao', rotulo: 'Prospecção', descricao: 'O que entra no topo do funil?', Icone: IconSearch, teto: 1200 },
  { id: 'pessoas', rotulo: 'Pessoas', descricao: 'Quem precisa de mim no 1:1?', Icone: IconIdCard, teto: 1200 },
] as const;

type AbaId = (typeof ABAS)[number]['id'];

function abaDoHash(): AbaId {
  const id = window.location.hash.replace(/^#\/?/, '');
  return (ABAS.find((a) => a.id === id)?.id ?? 'time') as AbaId;
}

// As telas de guarda aparecem ANTES de haver navegacao — nao recebem casca.
function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="envoltorio envoltorio--aviso">
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
  const [escuro, setEscuro] = useState(temaEscuroAgora);

  const trocarTema = (novo: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', novo);
    try {
      localStorage.setItem(CHAVE_TEMA, novo);
    } catch {
      // localStorage bloqueado (aba anonima): o tema vale so' nesta sessao.
    }
    setEscuro(novo === 'dark');
  };

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
      <div className="envoltorio envoltorio--aviso">
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

  const abaAtual = ABAS.find((a) => a.id === aba)!;
  const iniciais = (nome || '?')
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      {/*
        Sidebar identica a' do app de campo. Aqui o hover e' CSS de verdade
        (.sidebar:hover), e nao o truque de data-* que o app precisa porque o
        react-native-web nao escreve :hover num StyleSheet.

        Os itens continuam <a href="#/{id}"> de proposito: e' o que faz
        recarregar cair na mesma aba e o botao voltar funcionar. Trocar por
        onClick + estado desfaz a correcao de bug que o comentario do topo
        deste arquivo explica.
      */}
      <nav className="sidebar" aria-label="Navegação do cockpit">
        <div className="sidebar__topo">
          {/* Filled, e nao IconTakeat: o outline do kit e' a marca VAZADA, e a
              do app de campo e' solida — lado a lado pareceriam duas marcas.
              22x28 e' a proporcao real (viewBox 359.94x455.49); forcar 28x28
              deixaria 3px de vazio de cada lado dentro do slot. */}
          <span className="sidebar__marca">
            <IconTakeatFilled width={22} height={28} fill="var(--red)" />
          </span>
          <div className="sidebar__rotulo">
            <div className="sidebar__marca-titulo">Gestão</div>
            <div className="sidebar__marca-sub">Cockpit</div>
          </div>
        </div>

        <div className="sidebar__itens">
          {ABAS.map((a) => {
            const ativa = a.id === aba;
            return (
              <a
                key={a.id}
                href={`#/${a.id}`}
                title={a.descricao}
                aria-current={ativa ? 'page' : undefined}
                className={`sidebar__item${ativa ? ' sidebar__item--ativo' : ''}`}
              >
                <span className="sidebar__icone">
                  <a.Icone width={24} height={24} fill={ativa ? 'var(--red)' : 'var(--muted)'} />
                </span>
                <span className="sidebar__rotulo">{a.rotulo}</span>
              </a>
            );
          })}
        </div>

        <div className="sidebar__rodape">
          <a href="/" title="App de campo" className="sidebar__item">
            <span className="sidebar__icone">
              <IconArrowFoward width={24} height={24} fill="var(--muted)" />
            </span>
            <span className="sidebar__rotulo">App de campo</span>
          </a>
          <button
            type="button"
            title={escuro ? 'Tema claro' : 'Tema escuro'}
            className="sidebar__item"
            onClick={() => trocarTema(escuro ? 'light' : 'dark')}
          >
            <span className="sidebar__icone">
              <IconLightBulb width={24} height={24} fill="var(--muted)" />
            </span>
            <span className="sidebar__rotulo">{escuro ? 'Tema claro' : 'Tema escuro'}</span>
          </button>
          <div className="sidebar__usuario">
            <div className="sidebar__avatar">{iniciais}</div>
            <div className="sidebar__rotulo" style={{ flex: 1, minWidth: 0 }}>
              <div className="sidebar__usuario-nome">{nome}</div>
              <div className="sidebar__usuario-papel">Gestor</div>
            </div>
          </div>
        </div>
      </nav>

      <div className="conteudo">
        <header className="cabecalho">
          <div className="cabecalho__esquerda">
            <h1 className="cabecalho__titulo">{abaAtual.rotulo}</h1>
            <span className="cabecalho__pergunta">{abaAtual.descricao}</span>
          </div>
          {/*
            Slot da direita. A tela que tem filtro global de periodo ou de
            vendedor pinta aqui por portal (Rotas faz isso com o navegador de
            dia); as outras deixam vazio — nao inventar botao pra preencher.

            Portal, e nao JSX por estado: guardar um no' de React em useState e
            atualiza-lo a cada mudanca do filtro pede um efeito que dispara a
            cada render e e' facil de virar laco. Com portal o controle continua
            sendo filho da tela que o controla, e so' aparece em outro lugar da
            arvore do DOM.
          */}
          <div id={SLOT_CABECALHO} />
        </header>

        <div className="envoltorio" style={{ ['--teto' as string]: `${abaAtual.teto}px` }}>
          {aba === 'daily' && <Daily />}
          {aba === 'agenda' && <Agenda />}
          {aba === 'rotas' && <Rotas />}
          {aba === 'prospeccao' && <Prospeccao />}
          {aba === 'pessoas' && <Pessoas />}
          {aba === 'semana' && <Semana />}
          {aba === 'time' && <Cockpit />}
        </div>
      </div>
    </>
  );
}
