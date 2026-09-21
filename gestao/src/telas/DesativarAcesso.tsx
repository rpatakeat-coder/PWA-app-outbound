// Desativar acesso — "quem sai, e quem fica com a carteira?".
//
// A Acessos cria conta e nao sabe encerrar nenhuma. Encerrar tem um efeito que
// ninguem ve acontecer: `clients.vendedor_id_hubspot` liga a carteira a pessoa
// pelo id do HubSpot, e desativar sem transferir deixa os leads apontando pra
// quem saiu. Eles nao vao pra um limbo visivel — somem do mapa e dos rankings
// de todo mundo. Ja' aconteceu 303 vezes nesta base, com seis pessoas.
//
// Quatro passos, nesta ordem: escolher -> ver o que ela tem -> passar a
// carteira -> confirmar digitando o e-mail.
//
// DUAS COISAS QUE ESTA TELA SE RECUSA A ESCONDER
//
// 1. Bloquear o login nao e' opcional. A Edge `revogar-usuario` bane E renomeia
//    numa chamada so' — nao ha' parametro pra separar, e o RLS impede o
//    navegador de escrever `profiles.full_name` de terceiro. Uma caixa de
//    selecao aqui ofereceria uma escolha que nao existe. Por isso o botao diz
//    o nome da pessoa e a lista acima dele enumera as tres escritas.
//
// 2. A transferencia no Supabase se desfaz sozinha. `hubspot-sync` L275
//    reescreve `vendedor_id_hubspot` com o owner do HubSpot na proxima mudanca
//    de etapa de CADA lead — a coluna e' cache, e isso e' posicao deliberada,
//    tomada depois do incidente de 29/07/2026. Por isso a faixa ambar nomeia o
//    mecanismo em vez de dizer "atencao", e sobrevive ao sucesso: e' a unica
//    parte que a tela nao consegue terminar.
//
// SOBRE OS PRONOMES: o desenho escreve "o e-mail dela", "ela nao entra mais",
// "ele agora tem 76". Aqui isso vira o NOME da pessoa. Nao da' pra saber o
// pronome de alguem pelo nome, e errar isso numa tela que fala sobre a pessoa
// pelas costas dela e' pior do que a frase ficar um grau menos fluida.
import { useEffect, useMemo, useState } from 'react';
import {
  carregarAcessos,
  carregarCarteiras,
  desativarAcesso,
  type ContaDeAcesso,
  type DadosDeAcesso,
  type ResultadoDesativacao,
} from '../dados/acessos';
import {
  Acao,
  Etiqueta,
  Faixa,
  LinhaDePessoa,
  Passo,
} from '../componentes/idioma';
import { IconSearch } from 'takeat-design-system-ui-kit/icons/IconSearch';
import { IconCheck } from 'takeat-design-system-ui-kit/icons/IconCheck';
import { IconClock } from 'takeat-design-system-ui-kit/icons/IconClock';
import { IconExternalLink } from 'takeat-design-system-ui-kit/icons/IconExternalLink';

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Mesmo portal de `hubspot-sync` (HUBSPOT_PORTAL_ID). O owner do HubSpot NAO
 *  tem pagina de registro — owner e' usuario, nao objeto de CRM — entao nao ha'
 *  URL construivel a partir do `id_hubspot`. O link leva a lista de negocios do
 *  portal, que e' onde a reatribuicao acontece de fato. */
const HUBSPOT_NEGOCIOS = 'https://app.hubspot.com/contacts/24373118/objects/0-3/views/all/list';

const PAPEL: Record<string, string> = {
  user: 'Vendedor',
  gestor: 'Gestor',
  view: 'Somente leitura',
};

const campo = {
  width: '100%',
  height: 38,
  font: 'inherit',
  fontSize: 13,
  padding: '0 11px',
  border: '1px solid var(--line-btn)',
  borderRadius: 8,
  background: 'var(--panel2)',
  color: 'var(--ink)',
  boxSizing: 'border-box' as const,
};

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

const cartao = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '16px 20px',
} as const;

const rotuloFato = {
  fontSize: 11.5,
  lineHeight: '16px',
  fontWeight: 700,
  letterSpacing: '0.5px',
  textTransform: 'uppercase' as const,
  color: 'var(--muted)',
};

function Fato({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <div style={rotuloFato}>{rotulo}</div>
      <div
        style={{
          fontSize: 14,
          lineHeight: '20px',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: alerta ? 'var(--red)' : 'var(--ink)',
          marginTop: 2,
        }}
      >
        {valor}
      </div>
    </div>
  );
}

function Consequencia({ texto, pendente }: { texto: string; pendente?: boolean }) {
  const cor = pendente ? 'var(--amber-ink)' : 'var(--green)';
  const Glifo = pendente ? IconClock : IconCheck;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ flex: '0 0 16px', marginTop: 2 }}>
        <Glifo width={16} height={16} fill={cor} />
      </span>
      <span style={{ fontSize: 13, lineHeight: '19px', color: 'var(--ink)' }}>{texto}</span>
    </div>
  );
}

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] || n;

/** "1 lead" / "63 leads". Oito frases desta tela citam a contagem, e "1 leads"
 *  em qualquer uma delas denuncia que o numero foi colado sem ninguem ler. */
const leads = (n: number) => `${n} ${n === 1 ? 'lead' : 'leads'}`;

export function DesativarAcesso() {
  const [dados, setDados] = useState<DadosDeAcesso | null>(null);
  const [carteiras, setCarteiras] = useState<Map<string, number> | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [destino, setDestino] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [ocupado, setOcupado] = useState(false);

  /** O que aconteceu, preservado depois que a lista perde a linha. O painel NAO
   *  esvazia no sucesso: a pendencia do HubSpot continua aberta e precisa ficar
   *  na tela. */
  const [feito, setFeito] = useState<{
    conta: ContaDeAcesso;
    resultado: ResultadoDesativacao;
    destinoNome: string | null;
    destinoTotal: number | null;
  } | null>(null);

  async function recarregar() {
    try {
      const [d, c] = await Promise.all([carregarAcessos(), carregarCarteiras()]);
      setDados(d);
      setCarteiras(c);
      setErroCarga(null);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void recarregar();
  }, []);

  const carteiraDe = (c: ContaDeAcesso) => (c.idHubspot ? carteiras?.get(c.idHubspot) ?? 0 : 0);

  // So' contas ATIVAS, ordem ALFABETICA. Diferente da Acessos, que ordena por
  // atencao: ali o gestor faz triagem, aqui procura uma pessoa especifica.
  const ativas = useMemo(
    () =>
      (dados?.contas ?? [])
        .filter((c) => !c.desativado)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [dados],
  );

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return ativas;
    return ativas.filter(
      (c) => c.nome.toLowerCase().includes(t) || c.email.toLowerCase().includes(t),
    );
  }, [ativas, busca]);

  const selecionado = ativas.find((c) => c.id === selecionadoId) ?? null;
  const carteira = selecionado ? carteiraDe(selecionado) : 0;

  // Destinos: vendedor ativo, com id_hubspot, que ainda e' de campo. A propria
  // pessoa fora da lista.
  const destinos = useMemo(
    () =>
      ativas.filter(
        (c) =>
          c.id !== selecionadoId &&
          c.papel === 'user' &&
          !!c.idHubspot &&
          c.classificacao !== 'nao_vendedor',
      ),
    [ativas, selecionadoId],
  );

  const emailBate =
    !!selecionado &&
    confirmacao.trim().toLowerCase() === selecionado.email.trim().toLowerCase();
  const precisaDestino = carteira > 0;
  const podeDesativar = !!selecionado && emailBate && (!precisaDestino || !!destino) && !ocupado;

  const destinoEscolhido = destinos.find((d) => d.idHubspot === destino) ?? null;

  /** O que falta pro passo 3. Uma frase, na ORDEM em que se resolve — listar
   *  as duas pendências juntas não ajuda a dar o próximo passo. */
  const oQueFaltaParaEncerrar = (): string => {
    if (precisaDestino && !destino) return 'Falta escolher quem fica com a carteira — é o passo 1.';
    if (!emailBate) return 'Digite o e-mail no passo 2 para habilitar.';
    return 'Irreversível por esta tela.';
  };

  function escolher(c: ContaDeAcesso) {
    setSelecionadoId(c.id);
    setDestino('');
    setConfirmacao('');
    setFeito(null);
  }

  function cancelar() {
    setSelecionadoId(null);
    setDestino('');
    setConfirmacao('');
    setFeito(null);
  }

  async function aoDesativar() {
    if (!selecionado) return;
    setOcupado(true);
    const alvo = destinos.find((d) => d.idHubspot === destino) ?? null;
    const r = await desativarAcesso({
      perfilId: selecionado.id,
      ownerDe: selecionado.idHubspot,
      ownerPara: precisaDestino ? destino : null,
    });
    setFeito({
      conta: selecionado,
      resultado: r,
      destinoNome: alvo?.nome ?? null,
      destinoTotal: alvo ? carteiraDe(alvo) + r.leadsMovidos : null,
    });
    setOcupado(false);
    setSelecionadoId(null);
    setDestino('');
    setConfirmacao('');
    void recarregar();
  }

  if (erroCarga) {
    return (
      <Faixa tom="erro" titulo="Não consegui carregar as contas.">
        {erroCarga}
      </Faixa>
    );
  }
  if (!dados || !carteiras) return <div style={{ color: 'var(--muted)' }}>Carregando…</div>;

  // Quem o painel da direita descreve: a seleção, ou o que acabou de acontecer.
  const emFoco = selecionado ?? feito?.conta ?? null;

  const cabecaLista = busca.trim()
    ? `${filtradas.length} de ${ativas.length} · busca "${busca.trim()}"`
    : `${ativas.length} contas ativas · carteira à direita`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ================= A FAIXA DO TOPO =================
          O handoff pedia aqui um aviso de que `/ DESATIVADO` no nome nao impede
          o login, "porque a Edge `revogar-usuario` esta' citada no codigo e nada
          a chama".
          ISSO NAO E' MAIS VERDADE, e o proprio handoff manda trocar a faixa
          pelo que o codigo faz em vez de deixar o aviso desatualizado:
          `desativarAcesso` CHAMA a Edge, e ela bane o login com `ban_duration`
          de 100 anos E renomeia, numa chamada so'.
          O que sobra pra dizer aqui e' o que continua sendo verdade e ninguem
          ve' acontecer: sao TRES escritas, em ordem, e a primeira falha para
          tudo. Ambar e nao vermelho porque nao ha' defeito — ha' consequencia. */}
      <Faixa
        tom="aviso"
        titulo="Encerrar aqui faz três coisas, e não tem desfazer por esta tela."
      >
        Na ordem: a carteira passa para quem você escolher, o login é bloqueado
        na hora (a Edge <code>revogar-usuario</code> bane e marca{' '}
        <code>/ DESATIVADO</code> numa chamada só) e a pessoa sai do filtro de
        vendedor do app de campo. Se a primeira falhar, nada depois acontece — e
        a carteira continua inteira com quem ainda tem acesso.
      </Faixa>

      <div style={{ display: 'grid', gridTemplateColumns: '420px minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
      {/* ================= LISTA ================= */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 11, top: 10, pointerEvents: 'none' }}>
            <IconSearch width={18} height={18} fill="var(--ter)" />
          </span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pessoa"
            style={{ ...campo, padding: '0 11px 0 37px' }}
          />
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <div
            style={{
              ...rotuloFato,
              background: 'var(--panel2)',
              padding: '9px 14px',
              borderBottom: '1px solid var(--line-soft)',
            }}
          >
            {cabecaLista}
          </div>
          <div style={{ padding: '0 14px' }}>
            {filtradas.map((c, idx) => {
              const sel = c.id === selecionadoId;
              const n = carteiraDe(c);
              return (
                <LinhaDePessoa
                  key={c.id}
                  primeira={idx === 0}
                  nome={c.nome}
                  // `setor · papel · desde {data}` — o e-mail saiu daqui porque
                  // ele e' o que se DIGITA na confirmacao, e te-lo a' vista ao
                  // lado do campo transforma a trava numa copia.
                  sublinha={[
                    c.setor ?? 'sem setor',
                    PAPEL[c.papel ?? ''] ?? '—',
                    c.criadoEm ? `desde ${DATA.format(new Date(c.criadoEm))}` : 'sem data',
                  ].join(' · ')}
                  etiquetas={
                    <>
                      {c.papel === 'user' && c.classificacao === 'nao_vendedor' && (
                        <Etiqueta tom="neutro" texto="Não é de campo" />
                      )}
                      {c.setorSemLead && <Etiqueta tom="aviso" texto="Setor sem lead" />}
                      {/* A carteira e' ETIQUETA, e nao numero solto: ela e' o
                          que decide se esta linha precisa de destino. Zero vira
                          "Sem transferir" em neutro — dizer "0 leads" faria o
                          olho procurar o problema que nao existe. */}
                      {n > 0 ? (
                        <Etiqueta tom="aviso" texto={leads(n)} />
                      ) : (
                        <Etiqueta tom="neutro" texto="Sem transferir" />
                      )}
                    </>
                  }
                  acoes={
                    <Acao primaria={sel} onClick={() => escolher(c)}>
                      {sel ? 'Selecionado' : 'Encerrar'}
                    </Acao>
                  }
                />
              );
            })}
          </div>
          {filtradas.length === 0 && (
            <div style={{ padding: '14px', fontSize: 13, color: 'var(--muted)' }}>
              Ninguém com esse nome ou e-mail entre as contas ativas.
            </div>
          )}
        </div>
      </div>

      {/* ================= PAINEL ================= */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!emFoco ? (
          /* 1a — nada escolhido. Sem formulario em branco esperando. */
          <div style={cartao}>
            <div style={{ fontSize: 15, lineHeight: '22px', fontWeight: 700, color: 'var(--ink)' }}>
              Escolha quem está saindo
            </div>
            <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--ter)', marginTop: 6 }}>
              A lista mostra as contas ativas e quantos leads cada uma tem em mão. Contas já
              desativadas não aparecem aqui — para elas o caminho é a Acessos.
            </div>
          </div>
        ) : (
          <>
            {/* ---- 1. identidade e fatos ---- */}
            <div style={cartao}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 18, lineHeight: '24px', fontWeight: 700, color: 'var(--ink)' }}>
                  {emFoco.nome}
                </div>
                {feito && <Etiqueta tom="neutro" texto="Desativada" />}
                {!feito && emFoco.setorSemLead && <Etiqueta tom="aviso" texto="Setor sem lead" />}
              </div>
              <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--muted)', marginTop: 2 }}>
                {emFoco.email} ·{' '}
                {feito
                  ? 'desativada agora'
                  : emFoco.criadoEm
                    ? `desde ${DATA.format(new Date(emFoco.criadoEm))}`
                    : 'sem data de criação'}
              </div>
              <div style={{ height: 1, background: 'var(--line-soft)', margin: '14px 0' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                <Fato rotulo="Setor" valor={emFoco.setor ?? '—'} />
                <Fato rotulo="Papel" valor={PAPEL[emFoco.papel ?? ''] ?? '—'} />
                <Fato rotulo="ID HubSpot" valor={emFoco.idHubspot ?? '—'} />
                <Fato
                  rotulo="Carteira"
                  valor={
                    feito
                      ? leads(Math.max(0, carteiraDe(emFoco)))
                      : carteira > 0
                        ? leads(carteira)
                        : 'nenhum lead'
                  }
                  alerta={!feito && carteira > 0}
                />
              </div>
            </div>

            {/* ---- 2. carteira ---- */}
            {feito ? (
              <div style={cartao}>
                <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 700, color: 'var(--ink)' }}>
                  {feito.resultado.leadsMovidos > 0
                    ? `${leads(feito.resultado.leadsMovidos)} ${feito.resultado.leadsMovidos === 1 ? 'passou' : 'passaram'} para ${feito.destinoNome}`
                    : 'Nada foi transferido'}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: '17px', color: 'var(--ter)', marginTop: 4 }}>
                  {feito.resultado.leadsMovidos > 0
                    ? `Agora são ${feito.destinoTotal} no Supabase. O histórico de cada lead continua atribuído a ${feito.conta.nome}.`
                    : `Nenhum lead apontava para ${feito.conta.nome}.`}
                </div>
              </div>
            ) : (
              <div style={cartao}>
                {/* A NOTA DO PAINEL, com o nome da coluna: o efeito que ninguem
                    ve' acontecer e' exatamente este, e "some da carteira" sem
                    dizer de onde nao da' pra conferir depois. */}
                <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--ter)' }}>
                  {precisaDestino ? (
                    <>
                      {leads(carteira)} {carteira === 1 ? 'aponta' : 'apontam'} para o id do HubSpot
                      {' '}de {primeiroNome(emFoco.nome)} em <code>clients.vendedor_id_hubspot</code>.
                      Sem transferir, {carteira === 1 ? 'ele some' : 'somem'} da carteira de todo
                      mundo — inclusive da rota do dia.
                    </>
                  ) : (
                    <>
                      Nenhum lead aponta para {primeiroNome(emFoco.nome)} em{' '}
                      <code>clients.vendedor_id_hubspot</code>, então não há carteira a passar.
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  {/* ---- PASSO 1 · destino ---- */}
                  <Passo
                    numero={1}
                    titulo={
                      precisaDestino
                        ? 'Escolher quem fica com a carteira'
                        : 'Sem carteira a transferir'
                    }
                    // Carteira zero: o passo nasce CUMPRIDO. Deixar um campo
                    // cinza esperando escolha seria pedir uma decisao que nao
                    // existe.
                    estado={!precisaDestino || destino ? 'cumprido' : 'atual'}
                  >
                    {!precisaDestino ? (
                      `${emFoco.nome} não tem leads em mão.`
                    ) : (
                      <>
                        <select
                          value={destino}
                          onChange={(e) => setDestino(e.target.value)}
                          style={{ ...campo, marginTop: 6 }}
                        >
                          <option value="">Escolha quem assume…</option>
                          {destinos.map((d) => (
                            // O SALDO ANTES E DEPOIS na propria opcao: passar
                            // 128 leads pra quem ja' tem 451 e' uma decisao, e
                            // sem o "depois" ela vira autocomplete.
                            <option key={d.id} value={d.idHubspot!}>
                              {d.nome} · {carteiraDe(d)} hoje → {carteiraDe(d) + carteira} depois
                            </option>
                          ))}
                        </select>
                        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {destinoEscolhido ? (
                            <>
                              <span>
                                {destinoEscolhido.nome} · {carteiraDe(destinoEscolhido)} hoje →{' '}
                                {carteiraDe(destinoEscolhido) + carteira} depois
                              </span>
                              <Etiqueta tom="ok" texto="Escolhido" />
                            </>
                          ) : (
                            <span>Só vendedores ativos com ID do HubSpot aparecem aqui.</span>
                          )}
                        </div>
                      </>
                    )}
                  </Passo>

{/* ---- faixa âmbar: entre a carteira e a confirmação (1b) ---- */}
                  {!feito && precisaDestino && (
                    <Faixa
                      tom="aviso"
                      titulo="A transferência no Supabase não é definitiva."
                      acao={
                        <a
                          href={HUBSPOT_NEGOCIOS}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            color: 'var(--amber-ink)',
                            fontSize: 12.5,
                            fontWeight: 700,
                          }}
                        >
                          <IconExternalLink width={16} height={16} fill="var(--amber-ink)" />
                          Reatribuir no HubSpot
                        </a>
                      }
                    >
                      Quem manda no dono é o HubSpot: na próxima mudança de etapa de cada lead, o{' '}
                      <code>hubspot-sync</code> reescreve <code>vendedor_id_hubspot</code> com o owner
                      de lá. Troque o dono no HubSpot também, senão {carteira === 1 ? 'ele volta' : `os ${carteira} voltam`} para{' '}
                      {primeiroNome(emFoco.nome)} um a um.
                    </Faixa>
                  )}

                  {/* ---- PASSO 2 · o e-mail, DEPOIS do destino ---- */}
                  <Passo
                    numero={2}
                    titulo="Confirmar digitando o e-mail"
                    estado={emailBate ? 'cumprido' : !precisaDestino || destino ? 'atual' : 'bloqueado'}
                  >
                    <div>Digite {emFoco.email} — a lista tem nomes parecidos.</div>
                    <input
                      value={confirmacao}
                      onChange={(e) => setConfirmacao(e.target.value)}
                      placeholder={emFoco.email}
                      autoComplete="off"
                      style={{
                        ...campo,
                        marginTop: 6,
                        border: `1px solid ${emailBate ? 'var(--green)' : 'var(--line-btn)'}`,
                      }}
                    />
                  </Passo>

                  {/* ---- PASSO 3 · encerrar ---- */}
                  <Passo
                    numero={3}
                    titulo="Encerrar acesso"
                    estado={podeDesativar ? 'atual' : 'bloqueado'}
                    acao={
                      <Acao
                        tamanho="rodape"
                        primaria={podeDesativar}
                        desabilitada={!podeDesativar}
                        onClick={() => void aoDesativar()}
                      >
                        {ocupado ? 'Desativando…' : `Encerrar acesso de ${primeiroNome(emFoco.nome)}`}
                      </Acao>
                    }
                  >
                    {podeDesativar ? 'Irreversível por esta tela.' : oQueFaltaParaEncerrar()}
                  </Passo>
                </div>

                <div style={{ height: 1, background: 'var(--line-soft)', margin: '14px 0' }} />
                <div style={rotuloFato}>O que vai acontecer</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {precisaDestino && (
                    <Consequencia
                      texto={`${leads(carteira)} ${carteira === 1 ? 'passa' : 'passam'} para ${
                        destinoEscolhido?.nome ?? 'quem você escolher'
                      } no Supabase`}
                    />
                  )}
                  <Consequencia texto={`O login é bloqueado na hora — ${primeiroNome(emFoco.nome)} não entra mais`} />
                  <Consequencia texto={'O nome ganha "/ DESATIVADO" e sai dos rankings'} />
                  {precisaDestino ? (
                    <Consequencia
                      pendente
                      texto="Falta trocar o dono no HubSpot: sem isso o dono volta na próxima mudança de etapa de cada lead"
                    />
                  ) : (
                    <Consequencia texto={`Nada a transferir: nenhum lead aponta para ${primeiroNome(emFoco.nome)}`} />
                  )}
                </div>

                <div style={{ marginTop: 14 }}>
                  <button style={botaoSec} onClick={cancelar} disabled={ocupado}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* ---- 3. confirmação, ou o resultado ---- */}
            {feito ? (
              <>
                {feito.resultado.ok ? (
                  <Faixa tom="ok" titulo="Login bloqueado e nome marcado.">
                    {feito.conta.nome} não entra mais e saiu dos rankings — inclusive do filtro de
                    vendedor do app de campo, porque <code>seller_classification</code> virou{' '}
                    <code>nao_vendedor</code> junto. Este caminho não tem desfazer; se voltar, a
                    Acessos cria de novo.
                  </Faixa>
                ) : feito.resultado.etapa === 'classificacao' ? (
                  <>
                    <Faixa tom="ok" titulo="Login bloqueado e nome marcado.">
                      {feito.conta.nome} não entra mais e saiu dos rankings do cockpit. Este caminho
                      não tem desfazer.
                    </Faixa>
                    <Faixa tom="aviso" titulo="Faltou só tirar do filtro do app de campo.">
                      A escrita em <code>seller_classification</code> falhou ({feito.resultado.erro}
                      ). Sem ela, <code>useAllSellers</code> continua listando {feito.conta.nome} —
                      ele inclui desativados de propósito e só filtra <code>nao_vendedor</code>.
                      Rode: <code>update seller_classification set status='nao_vendedor' where
                      seller_id='{feito.conta.id}'</code>
                    </Faixa>
                  </>
                ) : (
                  <Faixa
                    tom="erro"
                    titulo={
                      feito.resultado.etapa === 'transferencia'
                        ? 'A transferência falhou — nada mais foi feito.'
                        : 'A revogação falhou.'
                    }
                  >
                    {feito.resultado.erro}
                    {feito.resultado.etapa === 'transferencia'
                      ? ' A carteira continua inteira com quem ainda tem acesso; ninguém ficou sem dono.'
                      : ` ${leads(feito.resultado.leadsMovidos)} já ${feito.resultado.leadsMovidos === 1 ? 'passou' : 'passaram'} para ${feito.destinoNome}, mas o acesso continua ativo.`}
                  </Faixa>
                )}
                {/* A pendencia do HubSpot sobrevive ao sucesso, e vem DEPOIS do
                    que deu certo: e' a unica parte que a tela nao termina. */}
                {feito.resultado.leadsMovidos > 0 && (
                  <Faixa
                    tom="aviso"
                    titulo={`${leads(feito.resultado.leadsMovidos)} ${feito.resultado.leadsMovidos === 1 ? 'ainda está' : 'ainda estão'} no nome de ${feito.conta.nome} no HubSpot.`}
                    acao
                  >
                    Enquanto o owner de lá não mudar, cada lead volta para {feito.conta.nome} na
                    próxima mudança de etapa. Esta é a única parte que a tela não consegue terminar.
                  </Faixa>
                )}
                <div>
                  <button style={botaoSec} onClick={cancelar}>
                    Fechar
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
