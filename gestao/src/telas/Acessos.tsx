// Acessos — "quem entra no app, e consegue trabalhar?".
//
// Tres blocos, nesta ordem: AVISO, criar, lista.
//
// A primeira versao punha a lista inteira em cima, pra o gestor ver o estrago
// antes de criar mais uma conta. So' que sao 32 contas: o formulario — que e'
// o que ele veio fazer — nascia 1800px abaixo da dobra. O diagnostico virou
// uma faixa curta no topo, que nomeia quem esta' quebrado sem custar rolagem,
// e a lista completa ficou embaixo. A ordem NAO muda.
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
//
// ---------------------------------------------------------------------------
// G11c: o que mudou na APRESENTACAO (consultas, Edges e regras, nada)
// ---------------------------------------------------------------------------
//
// 1. A faixa vermelha deixou de ser paragrafo e virou lista com a acao de cada
//    caso. Mas as acoes so' prometem o que EXISTE — ver o bloco abaixo.
//
// 2. Conferir e Criar viraram dois passos numerados, e o passo 2 DIZ o que
//    falta quando esta' bloqueado. Antes eram dois botoes lado a lado, e o
//    segundo parecia desabilitado sem motivo.
//
// 3. A tabela de cinco colunas virou a mesma linha de pessoa das outras telas
//    de gente (`componentes/idioma.tsx`).
//
// ---------------------------------------------------------------------------
// O QUE O CONSERTO REALMENTE PODE FAZER (levantado antes de desenhar)
// ---------------------------------------------------------------------------
//
// Procurei todo mundo que escreve `profiles` nos dois produtos e nas Edges. Os
// unicos escritores sao: o insert de primeiro login (`AuthContext`), o
// `avatar_url` da foto de perfil, o upsert da Edge `criar-usuario` e o rename
// da `revogar-usuario`. NADA atualiza `id_hubspot` nem `sector` depois de
// criado.
//
// Entao, das tres acoes que o desenho pedia:
//   - "Corrigir cadastro" (preencher id_hubspot) -> NAO EXISTE em lugar nenhum
//   - "Trocar setor"                             -> NAO EXISTE em lugar nenhum
//   - "Marcar nao vendedor"                      -> existe, mas no APP DE CAMPO
//     (Configuracoes -> "Area do gestor"). Ate' 21/09/2026 ficava na aba
//     Gestor do app; a aba saiu quando o botao passou a levar pro cockpit, e
//     os cartoes que escreviam foram pra Configuracoes.
//
// As duas primeiras viraram acao que ABRE A EXPLICACAO do conserto, em vez de
// botao que promete gravar. Um botao que nao escreve e' pior que nenhum: a
// pessoa clica, nada acontece, e ela passa a desconfiar da tela inteira.
import { useEffect, useMemo, useState } from 'react';
import {
  carregarAcessos,
  conferirUsuario,
  criarUsuario,
  type ContaDeAcesso,
  type DadosDeAcesso,
  type RespostaCriacao,
} from '../dados/acessos';
import { Drawer } from '../componentes/Drawer';
import { Acao, Etiqueta, Faixa, LinhaDePessoa, Passo } from '../componentes/idioma';

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

/** Qual conserto cada conta quebrada pede.
 *
 *  `ondeSeFaz` e' o que separa promessa de explicacao: 'fora' abre o drawer
 *  com o passo a passo; 'campo' leva pro app, onde o ajuste existe. */
type Conserto = {
  rotulo: string;
  ondeSeFaz: 'fora' | 'campo';
};

function consertoDe(c: ContaDeAcesso): Conserto {
  // Quem nao e' mais de campo nao se conserta mudando cadastro: se conserta
  // saindo da curadoria — e isso arruma o ranking junto. E' a segunda saida que
  // a nota de rodape ja' explicava, agora nomeada por conta.
  if (c.setorSemLead) return { rotulo: 'Trocar setor', ondeSeFaz: 'fora' };
  return { rotulo: 'Corrigir cadastro', ondeSeFaz: 'fora' };
}

/** O texto do sintoma. Palavra por palavra o que a tela ja' dizia — e' o
 *  chamado que o gestor vai receber, nao o nome do campo. */
function sintomaDe(c: ContaDeAcesso): string {
  return c.setorSemLead
    ? 'o setor não enxerga leads, então o mapa abre vazio'
    : 'sem ID do HubSpot, some dos rankings e fica sem carteira';
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
  // A conta cujo conserto o gestor pediu para ver. Drawer, e nao inline: e' a
  // regra 1 do doc de funcionalidades — detalhe operacional nao vira mural na
  // tela principal.
  const [consertando, setConsertando] = useState<ContaDeAcesso | null>(null);

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

  // A conferencia valida, com a assinatura ainda batendo.
  const conferenciaValida = conferencia?.ok === true && assinaturaConferida === assinatura;
  const problemasDaConferencia = conferenciaValida ? conferencia?.problemas ?? [] : [];

  /** O que falta pra destravar o passo 2. Uma frase, na ordem em que a pessoa
   *  resolve — dizer tudo de uma vez nao ajuda a dar o proximo passo. */
  const oQueFalta = (): string => {
    if (!preenchido) return 'Preencha os campos acima para poder conferir.';
    if (!conferencia) return 'Falta conferir o ID do HubSpot — é o passo 1.';
    if (!conferencia.ok) return 'A conferência não passou. Corrija e confira de novo.';
    if (assinaturaConferida !== assinatura)
      return 'Você mudou um campo depois de conferir. Confira de novo.';
    if (edgeAntiga) return 'A função criar-usuario em produção ainda é a antiga — veja abaixo.';
    if (problemasDaConferencia.length > 0) return 'A conferência encontrou problemas — veja acima.';
    return 'Confira antes: é o passo que mostra de quem é o ID do HubSpot.';
  };

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

          <div style={{ marginTop: 4 }}>
            {comProblema.map((c, i) => {
              const conserto = consertoDe(c);
              return (
                <LinhaDePessoa
                  key={c.id}
                  primeira={i === 0}
                  nome={c.nome}
                  tomDoAvatar="erro"
                  sublinha={`${c.setor ?? 'sem setor'} · ${sintomaDe(c)}`}
                  etiquetas={
                    c.semIdHubspot ? (
                      <Etiqueta tom="erro" texto="Sem carteira — some do placar" />
                    ) : (
                      <Etiqueta tom="aviso" texto="Setor sem lead — mapa vazio" />
                    )
                  }
                  acoes={
                    // NAO promete escrever: o conserto destes dois campos nao
                    // existe em tela nenhuma. A acao abre a explicacao.
                    <Acao onClick={() => setConsertando(c)}>{conserto.rotulo}</Acao>
                  }
                />
              );
            })}
          </div>

          {/* Duas saidas, e a segunda e' a que faltava: nem todo alarme se
              resolve mudando o setor. Quem saiu do campo tem que sair da
              curadoria — e isso conserta o ranking junto. */}
          <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10, opacity: 0.9 }}>
            Ou corrija o cadastro, ou marque a pessoa como <code>nao_vendedor</code> em{' '}
            <code>seller_classification</code> — quem saiu do campo também precisa sair do ranking.
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
          <Faixa tom="aviso" style={{ marginTop: 12 }}>
            O setor <strong>{setorEscolhido.nome}</strong> não enxerga leads. Se esta pessoa for
            vendedor de rua, ela vai abrir o mapa vazio — foi assim que a última perdeu duas semanas.
          </Faixa>
        )}

        {/* ---- os dois passos ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <Passo
            numero={1}
            titulo="Conferir"
            estado={conferido ? 'cumprido' : 'atual'}
            acao={
              <Acao
                tamanho="rodape"
                onClick={() => void aoConferir()}
                desabilitada={!preenchido || ocupado}
              >
                {ocupado && !resultado ? 'Conferindo…' : 'Conferir'}
              </Acao>
            }
          >
            {/* O resultado fica ESCRITO NO PASSO. Antes ficava numa faixa
                abaixo dos dois botoes, longe do que o produziu. */}
            {!conferencia && 'Mostra de quem é o ID do HubSpot antes de criar a conta.'}
            {conferencia && !conferencia.ok && (
              <span style={{ color: 'var(--red)' }}>{conferencia.erro}</span>
            )}
            {conferenciaValida && problemasDaConferencia.length === 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  {conferencia?.ownerNoHubspot
                    ? `O ID ${dadosDoForm.idHubspot} é de ${conferencia.ownerNoHubspot} no HubSpot — confira se é a mesma pessoa.`
                    : 'Conferido.'}
                </span>
                <Etiqueta tom="ok" texto="Pode criar" />
              </span>
            )}
            {problemasDaConferencia.length > 0 && (
              <span style={{ color: 'var(--red)' }}>
                {problemasDaConferencia.map((p, i) => (
                  <div key={i}>{p}</div>
                ))}
              </span>
            )}
          </Passo>

          <Passo
            numero={2}
            titulo="Criar acesso"
            estado={conferido ? 'atual' : 'bloqueado'}
            acao={
              <Acao
                tamanho="rodape"
                primaria={conferido}
                onClick={() => void aoCriar()}
                desabilitada={!conferido || ocupado}
              >
                {ocupado && conferido ? 'Criando…' : 'Criar acesso'}
              </Acao>
            }
          >
            {conferido ? 'Tudo conferido. Pode criar.' : oQueFalta()}
          </Passo>
        </div>

        {/* As faixas que sobrevivem inteiras, como o desenho pede. */}
        {conferenciaValida && conferencia?.aviso && (
          <Faixa tom="aviso" style={{ marginTop: 12 }}>
            {conferencia.aviso}
          </Faixa>
        )}

        {edgeAntiga && (
          <Faixa tom="erro" style={{ marginTop: 12 }}>
            A função <code>criar-usuario</code> em produção ainda é a versão antiga: ela ignora o
            setor, e a conta nasceria no default do banco — o mesmo defeito listado aí em cima. Rode{' '}
            <code>supabase functions deploy criar-usuario</code> antes de criar.
          </Faixa>
        )}

        {resultado && !resultado.ok && (
          <Faixa tom="erro" style={{ marginTop: 12 }}>
            {resultado.erro}
          </Faixa>
        )}

        {resultado?.ok && (
          <Faixa tom="ok" style={{ marginTop: 12 }}>
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

        <div style={{ marginTop: 10 }}>
          {visiveis.map((c, i) => {
            const problema = c.semIdHubspot || c.setorSemLead;
            return (
              <LinhaDePessoa
                key={c.id}
                primeira={i === 0}
                nome={c.nome}
                tomDoAvatar={problema ? 'erro' : 'neutro'}
                esmaecida={c.desativado}
                // Setor, papel e ID eram tres colunas; viram a sublinha, que e'
                // onde se le' de relance sem varrer a linha inteira.
                sublinha={[c.email, c.setor ?? '—', PAPEL[c.papel ?? ''] ?? '—', c.idHubspot ?? 'sem ID']
                  .filter(Boolean)
                  .join(' · ')}
                etiquetas={
                  <>
                    {c.desativado && <Etiqueta tom="neutro" texto="Desativado" />}
                    {/* Explica a AUSENCIA de alarme: sem isto, um vendedor em
                        setor sem lead que nao aparece na faixa vermelha parece
                        esquecimento. */}
                    {!c.desativado && c.papel === 'user' && c.classificacao === 'nao_vendedor' && (
                      <Etiqueta tom="neutro" texto="Não é de campo" />
                    )}
                    {c.semIdHubspot && <Etiqueta tom="erro" texto="Sem carteira — some do placar" />}
                    {c.setorSemLead && <Etiqueta tom="aviso" texto="Setor sem lead — mapa vazio" />}
                  </>
                }
                valor={
                  !problema && !c.desativado && c.criadoEm
                    ? `desde ${DATA.format(new Date(c.criadoEm))}`
                    : undefined
                }
                acoes={
                  c.desativado ? (
                    // A ponte pra tela vizinha: `/ DESATIVADO` no nome NAO
                    // revoga nada — quem revoga e' a Edge, e quem a chama e' a
                    // Desativar acesso.
                    <Acao href="#/desativar-acesso" titulo="A conta ainda entra no app">
                      Encerrar de verdade
                    </Acao>
                  ) : problema ? (
                    <Acao onClick={() => setConsertando(c)}>{consertoDe(c).rotulo}</Acao>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      </div>

      <DrawerDoConserto conta={consertando} aoFechar={() => setConsertando(null)} />
    </div>
  );
}

/** Como consertar, já que a tela não consegue consertar.
 *
 *  Este drawer existe porque o levantamento (ver o topo do arquivo) mostrou que
 *  nem `id_hubspot` nem `sector` têm escrita em lugar nenhum do sistema. Em vez
 *  de um botão que não faz nada, a ação entrega o passo a passo — e diz, com
 *  todas as letras, onde cada coisa se resolve. */
function DrawerDoConserto({
  conta,
  aoFechar,
}: {
  conta: ContaDeAcesso | null;
  aoFechar: () => void;
}) {
  if (!conta) return null;
  const porSetor = conta.setorSemLead;

  return (
    <Drawer
      aberto
      titulo={conta.nome}
      subtitulo={porSetor ? 'O setor não enxerga leads' : 'Sem ID do HubSpot'}
      aoFechar={aoFechar}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13.5, lineHeight: '20px', color: 'var(--ink)' }}>
        <Faixa tom={porSetor ? 'aviso' : 'erro'}>
          {sintomaDe(conta)}. É assim que a pessoa descreve o problema quando abre o chamado.
        </Faixa>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Este conserto não é feito por esta tela.
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Nada no app nem no cockpit altera{' '}
            <code>{porSetor ? 'profiles.sector' : 'profiles.id_hubspot'}</code> depois que a conta é
            criada. Não é esquecimento de tela: é que a escrita nunca existiu, e inventar um botão
            aqui seria prometer o que não acontece.
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Os dois caminhos</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', fontSize: 13 }}>
            {porSetor ? (
              <>
                <li style={{ marginBottom: 8 }}>
                  <strong style={{ color: 'var(--ink)' }}>Se {conta.nome} é de campo:</strong> mude o
                  setor para um que enxergue <code>lead</code>, ou libere <code>lead</code> para o
                  setor <code>{conta.setor ?? '—'}</code> em <code>sector_visibility</code>. Liberar
                  o setor inteiro vale para todo mundo que está nele — pense antes.
                </li>
                <li>
                  <strong style={{ color: 'var(--ink)' }}>Se saiu do campo:</strong> marque como{' '}
                  <code>nao_vendedor</code>. O alarme some e o ranking se corrige junto. Isso dá para
                  fazer <strong>no app de campo</strong>, em Configurações → “Área do gestor”.
                </li>
              </>
            ) : (
              <>
                <li style={{ marginBottom: 8 }}>
                  <strong style={{ color: 'var(--ink)' }}>Se {conta.nome} trabalha carteira:</strong>{' '}
                  pegue o ID do owner no HubSpot (Settings → Users &amp; Teams — é por pessoa, não
                  por setor) e grave em <code>profiles.id_hubspot</code>.
                </li>
                <li>
                  <strong style={{ color: 'var(--ink)' }}>Se não trabalha carteira:</strong> marque
                  como <code>nao_vendedor</code>, <strong>no app de campo</strong>, em
                  Configurações → “Área do gestor”. Cobrar o campo de quem não é de campo é alarme falso
                  permanente, que treina a ignorar a faixa inteira.
                </li>
              </>
            )}
          </ol>
        </div>

        <Faixa tom="neutro">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Para quem for direto ao banco</div>
          <code style={{ fontSize: 12, userSelect: 'all', wordBreak: 'break-all' }}>
            {porSetor
              ? `update profiles set sector='<SETOR QUE VÊ LEAD>' where id='${conta.id}';`
              : `update profiles set id_hubspot='<ID DO OWNER>' where id='${conta.id}';`}
          </code>
        </Faixa>
      </div>
    </Drawer>
  );
}
