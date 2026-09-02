// Acessos — "quem entra no app, e consegue trabalhar?".
//
// Tres blocos, nesta ordem: AVISO, criar, lista.
//
// A primeira versao punha a lista inteira em cima, pra o gestor ver o estrago
// antes de criar mais uma conta. So' que sao 32 contas: o formulario — que e'
// o que ele veio fazer — nascia 1800px abaixo da dobra. O diagnostico virou
// uma faixa curta no topo, que nomeia quem esta' quebrado sem custar rolagem,
// e a lista completa ficou embaixo.
//
// Os dois defeitos que a faixa denuncia sao os que geraram chamado, e nenhum
// deles se parece com cadastro incompleto pra quem sofre:
//   sem id_hubspot  -> "meu nome nao aparece no placar"
//   setor sem lead  -> "o mapa nao carrega"
//
// CRIAR EXIGE CONFERIR ANTES. Nao e' cerimonia: o `dry_run` da Edge devolve o
// NOME do owner do HubSpot, e e' a unica chance de perceber que o id digitado
// e' de outra pessoa. Depois de criado, o sintoma so' aparece dias depois, em
// outra tela, como "vendedor sem carteira".
import { useEffect, useMemo, useState } from 'react';
import {
  carregarAcessos,
  conferirUsuario,
  criarUsuario,
  type ContaDeAcesso,
  type DadosDeAcesso,
  type RespostaCriacao,
} from '../dados/acessos';

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

const campo = {
  width: '100%',
  font: 'inherit',
  padding: '9px 11px',
  border: '1px solid var(--line-btn)',
  borderRadius: 8,
  background: 'var(--panel2)',
  color: 'var(--ink)',
} as const;

const botaoSec = {
  border: '1px solid var(--line-btn)',
  background: 'var(--panel2)',
  borderRadius: 8,
  padding: '9px 14px',
  font: 'inherit',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--ink)',
} as const;

const PAPEL: Record<string, string> = {
  user: 'Vendedor',
  gestor: 'Gestor',
  view: 'Somente leitura',
};

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>
      {children}
    </div>
  );
}

/** Faixa de aviso/erro. `tom` decide a cor; o texto sempre diz o que fazer. */
function Faixa({ tom, children }: { tom: 'erro' | 'aviso' | 'ok'; children: React.ReactNode }) {
  const cores = {
    erro: { fundo: 'var(--red-soft)', borda: 'var(--red)', texto: 'var(--red)' },
    aviso: { fundo: 'var(--amber-soft)', borda: 'var(--amber)', texto: 'var(--amber-ink)' },
    ok: { fundo: 'var(--green-soft)', borda: 'var(--green)', texto: 'var(--green)' },
  }[tom];
  return (
    <div
      style={{
        background: cores.fundo,
        border: `1px solid ${cores.borda}`,
        color: cores.texto,
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 13,
        lineHeight: '18px',
        marginTop: 12,
      }}
    >
      {children}
    </div>
  );
}

function Etiqueta({ tom, texto }: { tom: 'erro' | 'aviso' | 'neutro'; texto: string }) {
  const cores = {
    erro: { fundo: 'var(--red-soft)', texto: 'var(--red)' },
    aviso: { fundo: 'var(--amber-soft)', texto: 'var(--amber-ink)' },
    neutro: { fundo: 'var(--panel2)', texto: 'var(--muted)' },
  }[tom];
  return (
    <span
      style={{
        background: cores.fundo,
        color: cores.texto,
        borderRadius: 999,
        padding: '2px 9px',
        fontSize: 11.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  );
}

function LinhaDeConta({ c }: { c: ContaDeAcesso }) {
  const problema = c.semIdHubspot || c.setorSemLead;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(200px, 2fr) minmax(160px, 1.4fr) 130px 120px 1fr',
        gap: 12,
        alignItems: 'center',
        padding: '11px 0',
        borderTop: '1px solid var(--line-soft)',
        opacity: c.desativado ? 0.55 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{c.nome}</div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {c.email}
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink)' }}>{c.setor ?? '—'}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{PAPEL[c.papel ?? ''] ?? '—'}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
        {c.idHubspot ?? '—'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {c.desativado && <Etiqueta tom="neutro" texto="Desativado" />}
        {/* O texto diz o SINTOMA, nao o campo: "sem id_hubspot" nao ajuda
            ninguem a reconhecer o chamado que vai receber. */}
        {c.semIdHubspot && <Etiqueta tom="erro" texto="Sem carteira — some do placar" />}
        {c.setorSemLead && <Etiqueta tom="aviso" texto="Setor sem lead — mapa vazio" />}
        {!problema && !c.desativado && c.criadoEm && (
          <span style={{ fontSize: 12, color: 'var(--ter)' }}>
            desde {DATA.format(new Date(c.criadoEm))}
          </span>
        )}
      </div>
    </div>
  );
}

export function Acessos() {
  const [dados, setDados] = useState<DadosDeAcesso | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [idHubspot, setIdHubspot] = useState('');
  const [setor, setSetor] = useState('');
  const [senha, setSenha] = useState('');

  const [ocupado, setOcupado] = useState(false);
  const [conferencia, setConferencia] = useState<RespostaCriacao | null>(null);
  const [resultado, setResultado] = useState<RespostaCriacao | null>(null);
  const [copiado, setCopiado] = useState(false);
  // Desativados escondidos por padrao: sao 9 de 32, nao pedem acao nenhuma, e
  // empurravam pra fora da tela justamente as contas que pedem.
  const [verDesativados, setVerDesativados] = useState(false);

  async function recarregar() {
    try {
      setDados(await carregarAcessos());
      setErroCarga(null);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void recarregar();
  }, []);

  // Primeiro setor que enxerga lead — o cadastro mais comum e' vendedor de rua,
  // e o default do BANCO e' justamente o que produziu o mapa vazio.
  useEffect(() => {
    if (!setor && dados?.setores.length) {
      setSetor((dados.setores.find((s) => s.veLead) ?? dados.setores[0]).nome);
    }
  }, [dados, setor]);

  const dadosDoForm = { nome: nome.trim(), email: email.trim(), idHubspot: idHubspot.trim(), setor, senha };
  // Assinatura do que foi conferido. Mudar QUALQUER campo invalida a
  // conferencia: sem isto daria pra conferir um id e criar com outro, que e'
  // exatamente o erro que o passo existe pra impedir.
  const assinatura = `${dadosDoForm.nome}|${dadosDoForm.email}|${dadosDoForm.idHubspot}|${dadosDoForm.setor}`;
  const [assinaturaConferida, setAssinaturaConferida] = useState('');
  // Bloqueia criar enquanto a Edge em producao for a antiga: criar por ela
  // produz exatamente a conta quebrada que a faixa vermelha acima denuncia.
  const edgeAntiga = conferencia?.ok === true && conferencia.edgeGravaSetor === false;
  const conferido =
    conferencia?.podeCriar === true && assinaturaConferida === assinatura && !edgeAntiga;

  const preenchido =
    dadosDoForm.nome.length >= 2 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dadosDoForm.email) &&
    dadosDoForm.idHubspot.length > 0 &&
    !!dadosDoForm.setor &&
    (senha === '' || senha.length >= 8);

  const setorEscolhido = dados?.setores.find((s) => s.nome === setor);

  const comProblema = useMemo(
    () => (dados?.contas ?? []).filter((c) => c.semIdHubspot || c.setorSemLead),
    [dados],
  );
  const desativados = useMemo(() => (dados?.contas ?? []).filter((c) => c.desativado), [dados]);
  const visiveis = useMemo(
    () => (dados?.contas ?? []).filter((c) => verDesativados || !c.desativado),
    [dados, verDesativados],
  );

  async function aoConferir() {
    setOcupado(true);
    setResultado(null);
    const r = await conferirUsuario(dadosDoForm);
    setConferencia(r);
    setAssinaturaConferida(assinatura);
    setOcupado(false);
  }

  async function aoCriar() {
    setOcupado(true);
    const r = await criarUsuario(dadosDoForm);
    setResultado(r);
    setOcupado(false);
    if (r.ok) {
      setConferencia(null);
      setAssinaturaConferida('');
      setNome('');
      setEmail('');
      setIdHubspot('');
      setSenha('');
      void recarregar();
    }
  }

  if (erroCarga) {
    return (
      <div className="cartao">
        <Faixa tom="erro">Não consegui carregar as contas: {erroCarga}</Faixa>
      </div>
    );
  }

  if (!dados) return <div style={{ color: 'var(--muted)' }}>Carregando…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ---- o diagnóstico, curto, antes de tudo ---- */}
      {/* A lista completa tem 30+ linhas. Ela continua embaixo, mas quem esta'
          quebrado precisa ser nomeado ANTES do formulario — senao o gestor cria
          a proxima conta sem nunca ter visto as que ja' nao funcionam. */}
      {comProblema.length > 0 && (
        <div
          style={{
            background: 'var(--red-soft)',
            border: '1px solid var(--red)',
            borderRadius: 8,
            padding: '12px 14px',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 13.5 }}>
            {comProblema.length === 1
              ? '1 conta não consegue trabalhar hoje'
              : `${comProblema.length} contas não conseguem trabalhar hoje`}
          </div>
          <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 6, lineHeight: '19px' }}>
            {comProblema.map((c) => (
              <div key={c.id}>
                <strong>{c.nome}</strong> ({c.setor ?? 'sem setor'}) —{' '}
                {c.setorSemLead
                  ? 'o setor não enxerga leads, então o mapa abre vazio'
                  : 'sem ID do HubSpot, some dos rankings e fica sem carteira'}
                .
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- criar ---- */}
      <div className="cartao">
        <div className="titulo-secao">Criar acesso</div>
        <div style={{ fontSize: 12.5, color: 'var(--ter)', marginTop: 6, lineHeight: '17px' }}>
          Cria sempre <strong>vendedor</strong>. Promover alguém a gestor não passa por aqui de
          propósito: uma rota HTTP capaz de escolher o papel seria caminho de escalonamento de
          privilégio. Para promover, altere <code>profiles.role</code> — permissão que já é só de
          gestor.
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginTop: 16,
          }}
        >
          <label>
            <Rotulo>Nome completo</Rotulo>
            <input style={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria Silva" />
          </label>
          <label>
            <Rotulo>E-mail</Rotulo>
            <input
              style={campo}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@takeat.app"
            />
          </label>
          <label>
            <Rotulo>ID HubSpot (owner)</Rotulo>
            <input
              style={campo}
              value={idHubspot}
              onChange={(e) => setIdHubspot(e.target.value)}
              placeholder="12345678"
              inputMode="numeric"
            />
            <div style={{ fontSize: 11.5, color: 'var(--ter)', marginTop: 4 }}>
              HubSpot → Settings → Users &amp; Teams. É por pessoa, não por setor.
            </div>
          </label>
          <label>
            <Rotulo>Setor</Rotulo>
            <select style={campo} value={setor} onChange={(e) => setSetor(e.target.value)}>
              {dados.setores.map((s) => (
                <option key={s.nome} value={s.nome}>
                  {s.nome}
                  {s.veLead ? '' : ' — não vê leads'}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: 'var(--ter)', marginTop: 4 }}>
              {setorEscolhido
                ? `Vê: ${setorEscolhido.status.join(', ')}.`
                : 'Decide o que a pessoa enxerga no mapa.'}
            </div>
          </label>
          <label>
            <Rotulo>Senha (opcional)</Rotulo>
            <input
              style={campo}
              type="text"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="deixe vazio para gerar uma"
            />
            <div style={{ fontSize: 11.5, color: 'var(--ter)', marginTop: 4 }}>
              Vazia: uma temporária forte é gerada e mostrada uma única vez.
            </div>
          </label>
        </div>

        {setorEscolhido && !setorEscolhido.veLead && (
          <Faixa tom="aviso">
            O setor <strong>{setorEscolhido.nome}</strong> não enxerga leads. Se esta pessoa for
            vendedor de rua, ela vai abrir o mapa vazio — foi assim que a última perdeu duas semanas.
          </Faixa>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={botaoSec} disabled={!preenchido || ocupado} onClick={aoConferir}>
            {ocupado && !resultado ? 'Conferindo…' : 'Conferir'}
          </button>
          <button
            style={{
              ...botaoSec,
              background: conferido ? 'var(--red)' : 'var(--panel2)',
              color: conferido ? '#fff' : 'var(--muted)',
              border: conferido ? 'none' : '1px solid var(--line-btn)',
              cursor: conferido && !ocupado ? 'pointer' : 'not-allowed',
            }}
            disabled={!conferido || ocupado}
            onClick={aoCriar}
          >
            {ocupado && conferido ? 'Criando…' : 'Criar acesso'}
          </button>
          {!conferido && (
            <span style={{ fontSize: 12, color: 'var(--ter)' }}>
              Confira antes: é o passo que mostra de quem é o ID do HubSpot.
            </span>
          )}
        </div>

        {conferencia && !conferencia.ok && <Faixa tom="erro">{conferencia.erro}</Faixa>}

        {conferencia?.ok && assinaturaConferida === assinatura && (
          <>
            {(conferencia.problemas ?? []).length > 0 ? (
              <Faixa tom="erro">
                {conferencia.problemas!.map((p, i) => (
                  <div key={i}>{p}</div>
                ))}
              </Faixa>
            ) : (
              <Faixa tom="ok">
                Pode criar.
                {conferencia.ownerNoHubspot
                  ? ` O ID ${dadosDoForm.idHubspot} é de ${conferencia.ownerNoHubspot} no HubSpot — confira se é a mesma pessoa.`
                  : ''}
              </Faixa>
            )}
            {conferencia.aviso && <Faixa tom="aviso">{conferencia.aviso}</Faixa>}
            {edgeAntiga && (
              <Faixa tom="erro">
                A função <code>criar-usuario</code> em produção ainda é a versão antiga: ela ignora
                o setor, e a conta nasceria no default do banco — o mesmo defeito listado aí em
                cima. Rode <code>supabase functions deploy criar-usuario</code> antes de criar.
              </Faixa>
            )}
          </>
        )}

        {resultado && !resultado.ok && <Faixa tom="erro">{resultado.erro}</Faixa>}

        {resultado?.ok && (
          <Faixa tom="ok">
            {resultado.jaExistia ? (
              <>Essa conta já existia; nada foi alterado.</>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>Acesso criado.</div>
                {resultado.senha && (
                  <div style={{ marginTop: 8 }}>
                    {/* A senha nao fica guardada em lugar nenhum legivel — o
                        banco so' tem o hash. Some ao recarregar a pagina. */}
                    Senha temporária, mostrada só agora:{' '}
                    <code
                      style={{
                        background: 'var(--panel2)',
                        color: 'var(--ink)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 14,
                        userSelect: 'all',
                      }}
                    >
                      {resultado.senha}
                    </code>{' '}
                    <button
                      style={{ ...botaoSec, padding: '4px 10px', fontSize: 12 }}
                      onClick={() => {
                        void navigator.clipboard?.writeText(resultado.senha!);
                        setCopiado(true);
                      }}
                    >
                      {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                    <div style={{ marginTop: 6 }}>
                      Ela não é recuperável depois. Entregue agora e peça a troca no primeiro acesso.
                    </div>
                  </div>
                )}
                {resultado.aviso && <div style={{ marginTop: 8 }}>{resultado.aviso}</div>}
              </>
            )}
          </Faixa>
        )}
      </div>

      {/* ---- a lista inteira, embaixo ---- */}
      <div className="cartao">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div className="titulo-secao">
            Contas com acesso ({dados.contas.length - desativados.length} ativas
            {desativados.length > 0 ? ` · ${desativados.length} desativadas` : ''})
          </div>
          {desativados.length > 0 && (
            <button
              style={{ ...botaoSec, padding: '5px 11px', fontSize: 12 }}
              onClick={() => setVerDesativados((v) => !v)}
            >
              {verDesativados ? 'Ocultar desativadas' : 'Mostrar desativadas'}
            </button>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ter)', marginTop: 6, lineHeight: '17px' }}>
          Ordenada por atenção, não por nome: quem está quebrado aparece primeiro. Desativada é
          quem tem <code>/ DESATIVADO</code> no nome — a conta continua existindo, e revogar acesso
          de verdade é a Edge <code>revogar-usuario</code>.
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 2fr) minmax(160px, 1.4fr) 130px 120px 1fr',
            gap: 12,
            marginTop: 14,
            fontSize: 11.5,
            fontWeight: 700,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          <div>Pessoa</div>
          <div>Setor</div>
          <div>Papel</div>
          <div>ID HubSpot</div>
          <div style={{ textAlign: 'right' }}>Situação</div>
        </div>
        {visiveis.map((c) => (
          <LinhaDeConta key={c.id} c={c} />
        ))}
      </div>

    </div>
  );
}
