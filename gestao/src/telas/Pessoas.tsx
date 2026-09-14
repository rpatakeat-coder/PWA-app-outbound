// Pessoas — "quem precisa de mim no 1:1?".
//
// Ordenada por URGENCIA DE CONVERSA, nunca por desempenho. A diferenca importa:
// um ranking num painel de gestao vira cobranca publica, e o que esta tela
// precisa produzir e' uma conversa boa. Por isso cada pessoa aparece com o
// gargalo E com a boa pratica, e o roteiro so' traz item que tem numero por
// tras — pauta sem evidencia vira opiniao.
import { useEffect, useMemo, useState } from 'react';
import {
  carregarPessoas,
  registrar1a1,
  anexarAudio1a1,
  transcrever1a1,
  urlDoAudio,
  anexarDocumento1a1,
  urlDoDocumento,
  removerDocumento1a1,
  LIMITE_DOC_BYTES,
  type Registro1a1,
  type DocumentoDe1a1,
  type Pessoa,
  type Semaforo,
} from '../dados/pessoas';
import { useVivo } from '../dados/vivo';
import {
  carregarModosDaSemana,
  definirModoDeAgir,
  type Indisponivel,
  type ModoRegistrado,
} from '../dados/decisoes';
import { MODOS, modoSugerido, type ModoDeAgir } from '../dados/regras';
import {
  carregarPdi,
  criarPdi,
  validarCompromisso,
  devolverCompromisso,
  type Pdi,
  type PdiIndisponivel,
} from '../dados/pdi';
import { Drawer } from '../componentes/Drawer';
import { Frescor } from '../componentes/Frescor';
import { GravadorDeAudio } from '../componentes/GravadorDeAudio';

const DATA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const CORES: Record<Semaforo, { cor: string; fundo: string; rotulo: string }> = {
  critico: { cor: 'var(--red)', fundo: 'var(--red-soft)', rotulo: 'Preparar 1:1' },
  atencao: { cor: 'var(--amber-ink)', fundo: 'var(--amber-soft)', rotulo: 'Acompanhar' },
  ok: { cor: 'var(--green)', fundo: 'var(--green-soft)', rotulo: 'Em dia' },
  // Neutro de proposito: "nao medido" nao e' bom nem ruim, e pintar de verde
  // ou vermelho seria afirmar o que nao se sabe.
  nao_medido: { cor: 'var(--muted)', fundo: 'var(--panel2)', rotulo: 'Não medido' },
};

/** Numero que pode nao ter sido medido. `null` nunca vira 0 na tela. */
const med = (n: number | null, sufixo = '') => (n == null ? '—' : `${n}${sufixo}`);

function Metrica({ r, v, tom }: { r: string; v: string; tom?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{r}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: tom ?? 'var(--ink)' }}>{v}</div>
    </div>
  );
}

function Cartao({ p, aoAbrir }: { p: Pessoa; aoAbrir: () => void }) {
  const c = CORES[p.semaforo];
  return (
    <button
      onClick={aoAbrir}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: p.semaforo === 'critico' ? c.fundo : 'var(--panel)',
        border: `1px solid ${p.semaforo === 'critico' ? 'var(--red)' : 'var(--line)'}`,
        borderRadius: 10,
        padding: '13px 15px',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>{p.nome}</span>
        <span
          style={{
            color: c.cor,
            background: p.semaforo === 'critico' ? 'transparent' : c.fundo,
            borderRadius: 999,
            padding: p.semaforo === 'critico' ? 0 : '2px 9px',
            fontSize: 11,
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {c.rotulo} →
        </span>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
        <Metrica r="Carteira" v={med(p.carteira)} />
        <Metrica
          r="Travados"
          v={p.travadosPct != null ? `${p.travados} · ${p.travadosPct}%` : '–'}
          tom={p.semaforo === 'ok' ? undefined : c.cor}
        />
        <Metrica
          r="Visitas"
          v={p.metaNaJanela != null ? `${p.visitasNaJanela}/${p.metaNaJanela}` : String(p.visitasNaJanela)}
          tom={p.aderencia != null && p.aderencia < 70 ? 'var(--amber-ink)' : undefined}
        />
        <Metrica
          r="Fechou"
          v={med(p.fechadosNoMes)}
          tom={p.fechadosNoMes ? 'var(--green)' : undefined}
        />
      </div>

      {/* O motivo vem ANTES do gargalo: sem medicao nao ha' gargalo pra
          mostrar, e um traco sem explicacao vira "o sistema esta' quebrado"
          em vez de "falta um cadastro". */}
      {p.semOwner ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 9 }}>
          {p.motivoSemMedicao}
        </div>
      ) : p.gargalo && p.gargalo.travados > 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 9 }}>
          Gargalo em <strong style={{ color: 'var(--ink)' }}>{p.gargalo.etapa}</strong> ·{' '}
          {p.gargalo.travados} de {p.gargalo.total} passaram do prazo
        </div>
      ) : p.destaque ? (
        <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 9 }}>✓ {p.destaque}</div>
      ) : null}
    </button>
  );
}

const KB = 1024;
function tamanho(bytes: number | null): string {
  if (!bytes) return '';
  return bytes >= KB * KB ? `${(bytes / KB / KB).toFixed(1)} MB` : `${Math.round(bytes / KB)} KB`;
}

/** Escolha dos documentos apresentados na conversa.
 *
 *  Os arquivos ficam SEGURADOS aqui ate' o registro ser salvo, porque o caminho
 *  no bucket leva o id da linha — que so' existe depois do insert. */
function SeletorDeDocumentos({
  escolhidos,
  aoMudar,
  desabilitado,
  aoAvisar,
}: {
  escolhidos: File[];
  aoMudar: (f: File[]) => void;
  desabilitado?: boolean;
  aoAvisar: (m: string) => void;
}) {
  const aoEscolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const novos = [...(e.target.files ?? [])];
    // Barra o arquivo grande AQUI, e nao depois de meio upload: o gestor
    // descobre na hora de escolher, com o nome do arquivo na frente.
    const grandes = novos.filter((f) => f.size > LIMITE_DOC_BYTES);
    if (grandes.length) {
      aoAvisar(`"${grandes[0].name}" passa de 25 MB e não pode ser anexado.`);
    }
    aoMudar([...escolhidos, ...novos.filter((f) => f.size <= LIMITE_DOC_BYTES)]);
    e.target.value = '';
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <label
        style={{
          display: 'inline-block',
          border: '1px solid var(--line-btn)',
          background: 'var(--panel2)',
          borderRadius: 8,
          padding: '9px 14px',
          font: 'inherit',
          fontWeight: 700,
          fontSize: 13,
          cursor: desabilitado ? 'default' : 'pointer',
          color: 'var(--ink)',
          opacity: desabilitado ? 0.5 : 1,
        }}
      >
        Anexar documento
        <input type="file" multiple onChange={aoEscolher} disabled={desabilitado} style={{ display: 'none' }} />
      </label>

      {escolhidos.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {escolhidos.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                fontSize: 13,
                padding: '5px 0',
                borderTop: i ? '1px solid var(--line-soft)' : undefined,
              }}
            >
              <span>
                {f.name} <span style={{ color: 'var(--ter)' }}>{tamanho(f.size)}</span>
              </span>
              <button
                onClick={() => aoMudar(escolhidos.filter((_, j) => j !== i))}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: 'var(--muted)', font: 'inherit', fontWeight: 800,
                }}
              >
                remover
              </button>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Sobem ao registrar. Ficam na mesma área privada do áudio.
          </div>
        </div>
      )}
    </div>
  );
}

/** Documentos de um 1:1 ja' registrado. */
function ListaDeDocumentos({
  docs,
  aoBaixar,
  aoRemover,
}: {
  docs: DocumentoDe1a1[];
  aoBaixar: (d: DocumentoDe1a1) => void;
  aoRemover: (id: string) => void;
}) {
  if (docs.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      {docs.map((d) => (
        <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12 }}>
          <button
            onClick={() => aoBaixar(d)}
            style={{
              border: 'none', background: 'none', padding: 0, cursor: 'pointer',
              font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--red)',
              textAlign: 'left',
            }}
          >
            ↓ {d.nome}
          </button>
          <span style={{ color: 'var(--ter)' }}>{tamanho(d.bytes)}</span>
          <button
            onClick={() => aoRemover(d.id)}
            title="Tira o documento deste 1:1. O arquivo continua guardado."
            style={{
              border: 'none', background: 'none', padding: 0, cursor: 'pointer',
              font: 'inherit', fontSize: 12, color: 'var(--muted)',
            }}
          >
            remover
          </button>
        </div>
      ))}
    </div>
  );
}

/** Audio e transcricao de um 1:1 ja' registrado.
 *
 *  A transcricao vem RECOLHIDA. Uma conversa de 40 minutos vira um paredao de
 *  texto, e o que o gestor rele' antes do proximo 1:1 e' o "combinado", nao o
 *  verbatim — o texto completo fica a um clique pra quando ele precisar
 *  procurar o que foi dito. */
function ItemDeAudio({
  r,
  ocupado,
  aoOuvir,
  aoTranscrever,
}: {
  r: Registro1a1;
  ocupado: boolean;
  aoOuvir: (caminho: string) => void;
  aoTranscrever: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (!r.audioCaminho && !r.transcricao && !r.transcricaoErro) return null;

  const link = {
    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
    font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--red)',
  } as const;

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {r.audioCaminho && (
          <button onClick={() => aoOuvir(r.audioCaminho!)} style={link}>
            ▶ Ouvir
            {r.audioBytes ? ` · ${(r.audioBytes / 1024 / 1024).toFixed(1)} MB` : ''}
          </button>
        )}
        {r.transcricao && (
          <button onClick={() => setAberto((v) => !v)} style={link}>
            {aberto ? 'Esconder transcrição' : 'Ver transcrição'}
          </button>
        )}
        {r.audioCaminho && !r.transcricao && (
          <button onClick={() => aoTranscrever(r.id)} disabled={ocupado} style={link}>
            {ocupado ? 'Transcrevendo…' : 'Transcrever'}
          </button>
        )}
      </div>

      {r.transcricaoErro && !r.transcricao && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
          {r.transcricaoErro}
        </div>
      )}

      {aberto && r.transcricao && (
        <div
          style={{
            marginTop: 6,
            background: 'var(--sunk)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {r.transcricao}
        </div>
      )}
    </div>
  );
}

export function Pessoas() {
  const [aberta, setAberta] = useState<Pessoa | null>(null);
  const [pauta, setPauta] = useState('');
  const [combinado, setCombinado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [transcrevendo, setTranscrevendo] = useState<string | null>(null);

  // Pausado com o dossie aberto: ali dentro ha' textarea de pauta, gravacao de
  // audio e anexos. Repintar por baixo de quem esta' escrevendo o 1:1 e' pior
  // que mostrar dado de um minuto atras.
  const { dados, erro, desatualizado, recarregar } = useVivo(carregarPessoas, {
    pausado: aberta != null,
  });

  // O que o gestor decidiu nesta semana. Fica FORA do `useVivo` de proposito:
  // `modos_de_agir` pode nem existir ainda (as migrations 20260914 sao
  // aplicadas fora deste codigo), e uma tabela ausente nao pode derrubar a
  // tela inteira de Pessoas — ela e' util sem isto.
  const [modos, setModos] = useState<Record<string, ModoRegistrado> | Indisponivel | null>(null);
  useEffect(() => {
    carregarModosDaSemana().then(setModos).catch(() => setModos(null));
  }, []);
  const modosIndisponiveis =
    modos != null && 'indisponivel' in modos ? (modos as Indisponivel).motivo : null;
  const modoDe = (perfilId: string): ModoRegistrado | null =>
    modos && !('indisponivel' in modos) ? modos[perfilId] ?? null : null;

  // PDI da pessoa aberta. Carrega ao abrir o dossiê — é por pessoa, não faz
  // sentido buscar os onze de uma vez para mostrar um.
  const [pdi, setPdi] = useState<Pdi | null | PdiIndisponivel>(null);
  const [carregandoPdi, setCarregandoPdi] = useState(false);
  const [novoPdi, setNovoPdi] = useState('');
  const relerPdi = async (perfilId: string) => {
    setCarregandoPdi(true);
    try {
      setPdi(await carregarPdi(perfilId));
    } catch {
      setPdi(null);
    } finally {
      setCarregandoPdi(false);
    }
  };
  useEffect(() => {
    if (!aberta) {
      setPdi(null);
      setNovoPdi('');
      return;
    }
    void relerPdi(aberta.perfilId);
  }, [aberta]);

  const escolherModo = async (modo: ModoDeAgir) => {
    if (!aberta) return;
    const sugerido = modoSugerido(aberta);
    const anterior = modos;
    // Otimista: o chip acende na hora. Se o banco recusar, volta e diz por que.
    setModos((m) =>
      m && !('indisponivel' in m)
        ? { ...m, [aberta.perfilId]: { modo, sugeridoNaEpoca: sugerido } }
        : m,
    );
    const r = await definirModoDeAgir({ perfilId: aberta.perfilId, modo, sugerido });
    if (!r.ok) {
      setModos(anterior);
      setAviso(r.erro ?? 'Não consegui salvar o modo de agir.');
    }
  };

  const historico = useMemo(
    () => (aberta && dados?.registros ? dados.registros.filter((r) => r.perfilId === aberta.perfilId) : []),
    [aberta, dados],
  );

  const salvar = async () => {
    if (!aberta || (!pauta.trim() && !combinado.trim() && !audio && docs.length === 0)) return;
    setSalvando(true);
    setAviso(null);
    const r = await registrar1a1({ perfilId: aberta.perfilId, pauta, combinado });
    if (!r.ok || !r.id) {
      setSalvando(false);
      setAviso(
        /relation .* does not exist|schema cache/i.test(r.erro ?? '')
          ? 'A tabela um_a_um ainda não existe. Rode a migration 20260814_um_a_um.sql.'
          : `Não consegui salvar: ${r.erro}`,
      );
      return;
    }

    // Documentos primeiro: sao rapidos e independentes da transcricao. Falha
    // aqui nao aborta o resto — o 1:1 escrito ja' esta' salvo.
    const falhasDoc: string[] = [];
    for (const d of docs) {
      setAviso(`Enviando ${d.name}…`);
      const up = await anexarDocumento1a1(r.id, aberta.perfilId, d);
      if (!up.ok) falhasDoc.push(up.erro ?? d.name);
    }

    // O registro nasce primeiro e o audio e' anexado depois, porque o caminho
    // no bucket leva o id da linha. Se o upload falhar, o 1:1 escrito NAO se
    // perde — some so' o audio, e a mensagem diz isso.
    if (audio) {
      setAviso('Enviando o áudio…');
      const up = await anexarAudio1a1(r.id, aberta.perfilId, audio);
      if (!up.ok) {
        setSalvando(false);
        setAviso(
          /bucket|not found/i.test(up.erro ?? '')
            ? 'O 1:1 foi salvo, mas o áudio não subiu: falta rodar a migration 20260814_um_a_um_audio.sql.'
            : `O 1:1 foi salvo, mas o áudio não subiu: ${up.erro}`,
        );
        setPauta(''); setCombinado(''); setAudio(null);
        recarregar();
        return;
      }
      setAviso('Transcrevendo…');
      const t = await transcrever1a1(r.id);
      if (!t.ok) {
        setAviso(
          t.configuravel
            ? 'Salvo com áudio. A transcrição não está ligada: falta o secret OPENAI_API_KEY e o deploy da função transcrever-1a1.'
            : `Salvo com áudio, mas a transcrição falhou: ${t.erro}`,
        );
      } else {
        setAviso('Registrado, com áudio e transcrição.');
      }
    } else {
      setAviso('Registrado.');
    }

    if (falhasDoc.length) {
      setAviso(
        /relation .* does not exist|schema cache/i.test(falhasDoc.join(' '))
          ? 'Salvo, mas os documentos não subiram: falta rodar a migration 20260814_um_a_um_documentos.sql.'
          : `Salvo, mas ${falhasDoc.length} documento(s) falharam: ${falhasDoc[0]}`,
      );
    }

    setSalvando(false);
    setPauta('');
    setCombinado('');
    setAudio(null);
    setDocs([]);
    recarregar();
  };

  const baixarDoc = async (d: DocumentoDe1a1) => {
    const url = await urlDoDocumento(d.caminho, d.nome);
    if (url) window.open(url, '_blank', 'noopener');
    else setAviso('Não consegui gerar o link do documento.');
  };

  const removerDoc = async (id: string) => {
    const r = await removerDocumento1a1(id);
    if (!r.ok) setAviso(`Não consegui remover: ${r.erro}`);
    recarregar();
  };

  /** Retentar a transcricao de um registro que ja' existe. */
  const retranscrever = async (id: string) => {
    setTranscrevendo(id);
    const t = await transcrever1a1(id);
    setTranscrevendo(null);
    if (!t.ok) setAviso(`Transcrição falhou: ${t.erro}`);
    recarregar();
  };

  const ouvir = async (caminho: string) => {
    const url = await urlDoAudio(caminho);
    if (url) window.open(url, '_blank', 'noopener');
    else setAviso('Não consegui gerar o link do áudio.');
  };

  if (erro) {
    return (
      <div className="cartao" style={{ borderColor: 'var(--red)' }}>
        <strong>Não consegui carregar as pessoas.</strong>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{erro}</div>
      </div>
    );
  }
  if (!dados) return <div className="cartao">Lendo a operação de cada um…</div>;

  const { pessoas, janelaDias } = dados;
  const criticos = pessoas.filter((p) => p.semaforo === 'critico');
  const emDia = pessoas.filter((p) => p.semaforo === 'ok' && p.roteiro.length === 0);
  const resto = pessoas.filter((p) => !criticos.includes(p) && !emDia.includes(p));

  return (
    <>
      <div
        style={{
          background: 'var(--dark)',
          color: 'var(--dark-ink)',
          borderRadius: 14,
          padding: '20px 22px',
          marginBottom: 18,
        }}
      >
        <div style={{ color: 'var(--dark-mut)', marginTop: 4 }}>
          {pessoas.length === 0 ? (
            'Nenhum executivo ativo cadastrado.'
          ) : criticos.length > 0 ? (
            <>
              <strong style={{ color: 'var(--dark-ink)' }}>
                {criticos.length} {criticos.length === 1 ? 'pessoa precisa' : 'pessoas precisam'} de
                1:1 esta semana
              </strong>{' '}
              — carteira com 35% ou mais acima do SLA, ou sem registro de campo. Leitura dos
              últimos {janelaDias} dias úteis.
            </>
          ) : (
            <>
              Ninguém em estado crítico. {emDia.length} de {pessoas.length} sem nenhum ponto de
              atenção nos últimos {janelaDias} dias úteis.
            </>
          )}
        </div>
      </div>

      {criticos.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2 className="titulo-secao">Conversar primeiro</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>
            {criticos.map((p) => (
              <Cartao key={p.perfilId} p={p} aoAbrir={() => setAberta(p)} />
            ))}
          </div>
        </section>
      )}

      {resto.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2 className="titulo-secao">Acompanhar</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>
            {resto.map((p) => (
              <Cartao key={p.perfilId} p={p} aoAbrir={() => setAberta(p)} />
            ))}
          </div>
        </section>
      )}

      {emDia.length > 0 && (
        <section className="cartao">
          <h2 className="titulo-secao">Em dia · {emDia.length}</h2>
          {emDia.map((p) => (
            <div
              key={p.perfilId}
              onClick={() => setAberta(p)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px 0',
                borderTop: '1px solid var(--line-soft)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: 700 }}>{p.nome}</span>
              <span style={{ fontSize: 12, color: 'var(--green)' }}>
                {p.destaque ?? (p.carteira == null ? 'sem medição' : `${p.carteira} em carteira`)}
              </span>
            </div>
          ))}
        </section>
      )}

      <Frescor
        atualizadoEm={dados.atualizadoEm}
        desatualizado={desatualizado}
        aoTentarDeNovo={recarregar}
        prefixo="Semáforo por percentual da carteira acima do SLA: abaixo de 15% em dia, 15–35% atenção, 35%+ crítico"
      />

      <Drawer
        aberto={aberta != null}
        titulo={aberta?.nome ?? ''}
        subtitulo={
          aberta
            ? `${med(aberta.carteira)} em carteira · ${med(aberta.travados)} travados` +
              (aberta.aderencia != null ? ` · ${aberta.aderencia}% da meta de visitas` : '')
            : ''
        }
        aoFechar={() => {
          setAberta(null);
          setAviso(null);
        }}
      >
        {aberta && (
          <>
            {/* O que eu vou FAZER com essa pessoa nesta semana. Vem antes do
                roteiro de propósito: o roteiro é insumo da conversa, isto é a
                decisão — e o cockpit inteiro existia sem lugar para ela. */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>
                Meu modo de agir nesta semana
              </div>

              {modosIndisponiveis ? (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{modosIndisponiveis}</div>
              ) : (
                (() => {
                  const registrado = modoDe(aberta.perfilId);
                  const sugerido = modoSugerido(aberta);
                  return (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {MODOS.map((m) => {
                          const ativo = registrado?.modo === m.valor;
                          const ehSugerido = sugerido === m.valor;
                          return (
                            <button
                              key={m.valor}
                              onClick={() => escolherModo(m.valor)}
                              title={m.explica}
                              style={{
                                border: `1.5px solid ${ativo ? 'var(--red)' : 'var(--line-btn)'}`,
                                background: ativo ? 'var(--red-soft)' : 'transparent',
                                color: ativo ? 'var(--red)' : 'var(--ink)',
                                borderRadius: 16,
                                padding: '6px 12px',
                                font: 'inherit',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {m.rotulo}
                              {ehSugerido && !ativo ? (
                                <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
                                  {' '}· sugerido
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--ter)', marginTop: 8, lineHeight: '16px' }}>
                        {sugerido == null
                          ? 'Sem base para sugerir: esta pessoa não tem carteira medida. Escolher aqui continua valendo.'
                          : registrado && registrado.sugeridoNaEpoca && registrado.modo !== registrado.sugeridoNaEpoca
                            ? `O sistema sugeria "${MODOS.find((m) => m.valor === registrado.sugeridoNaEpoca)?.rotulo}". A discordância fica registrada — é assim que dá para saber se o semáforo está calibrado.`
                            : MODOS.find((m) => m.valor === sugerido)?.explica}
                      </div>
                    </>
                  );
                })()
              )}
            </div>

            {/* O PDI. O gestor escreve o plano e VALIDA ou DEVOLVE; quem marca
                "feito" é a própria pessoa, no app de campo. Não há botão aqui
                para marcar por ela, e isso é garantido no banco: a função
                `pdi_marcar_feito` filtra por `seller_id = auth.uid()`. */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>
                Plano de desenvolvimento
              </div>

              {carregandoPdi ? (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Carregando…</div>
              ) : pdi && 'indisponivel' in pdi ? (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{pdi.motivo}</div>
              ) : pdi == null ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                    Ainda não há plano. Escreva um compromisso por linha — eles aparecem no app
                    dela, para marcar conforme fizer.
                  </div>
                  <textarea
                    value={novoPdi}
                    onChange={(e) => setNovoPdi(e.target.value)}
                    placeholder={'Levar o pitch de fila para 3 visitas\nFechar a rota da semana até segunda 9h'}
                    style={{
                      width: '100%',
                      minHeight: 78,
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      font: 'inherit',
                      fontSize: 14,
                      color: 'var(--ink)',
                      background: 'var(--panel)',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                    }}
                  />
                  <button
                    disabled={!novoPdi.trim()}
                    onClick={async () => {
                      const r = await criarPdi({
                        perfilId: aberta.perfilId,
                        titulo: `Plano de ${aberta.nome}`,
                        compromissos: novoPdi.split('\n'),
                      });
                      if (!r.ok) {
                        setAviso(r.erro ?? 'Não consegui criar o plano.');
                        return;
                      }
                      setNovoPdi('');
                      await relerPdi(aberta.perfilId);
                    }}
                    style={{
                      marginTop: 8,
                      border: '1px solid var(--line-btn)',
                      background: 'transparent',
                      color: 'var(--ink)',
                      borderRadius: 6,
                      padding: '7px 12px',
                      font: 'inherit',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: novoPdi.trim() ? 'pointer' : 'default',
                      opacity: novoPdi.trim() ? 1 : 0.5,
                    }}
                  >
                    Criar o plano
                  </button>
                </>
              ) : (
                <>
                  {pdi.compromissos.length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      O plano existe, mas está sem compromissos.
                    </div>
                  )}
                  {pdi.compromissos.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        borderLeft: `3px solid ${
                          c.estado === 'validado'
                            ? 'var(--green)'
                            : c.estado === 'devolvido'
                              ? 'var(--red)'
                              : c.estado === 'feito'
                                ? 'var(--amber)'
                                : 'var(--line)'
                        }`,
                        paddingLeft: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontSize: 14, color: 'var(--ink)' }}>{c.texto}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {c.estado === 'aberto'
                          ? 'ela ainda não marcou'
                          : c.estado === 'feito'
                            ? 'ela marcou como feito — falta você olhar'
                            : c.estado === 'validado'
                              ? 'validado por você'
                              : `devolvido: ${c.devolvidoMotivo}`}
                      </div>
                      {/* Só faz sentido julgar o que ela marcou. Validar algo
                          que ninguém fez seria dar por cumprido no escuro. */}
                      {c.estado === 'feito' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            onClick={async () => {
                              await validarCompromisso(c.id);
                              await relerPdi(aberta.perfilId);
                            }}
                            style={{
                              border: '1px solid var(--line-btn)',
                              background: 'transparent',
                              color: 'var(--ink)',
                              borderRadius: 14,
                              padding: '4px 10px',
                              font: 'inherit',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Validar
                          </button>
                          <button
                            onClick={async () => {
                              const motivo = window.prompt(
                                'O que precisa ser refeito? (devolver sem motivo não ajuda)',
                              );
                              if (motivo == null) return;
                              const r = await devolverCompromisso(c.id, motivo);
                              if (!r.ok) {
                                setAviso(r.erro ?? 'Não consegui devolver.');
                                return;
                              }
                              await relerPdi(aberta.perfilId);
                            }}
                            style={{
                              border: '1px solid var(--red)',
                              background: 'transparent',
                              color: 'var(--red)',
                              borderRadius: 14,
                              padding: '4px 10px',
                              font: 'inherit',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Devolver
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>
                Roteiro sugerido
              </div>
              {aberta.roteiro.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  Nenhum ponto de atenção com evidência numérica. Vale usar o 1:1 para ouvir em
                  vez de cobrar — {aberta.destaque ? `e reconhecer: ${aberta.destaque}.` : 'a operação está limpa.'}
                </div>
              ) : (
                aberta.roteiro.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      borderLeft: '3px solid var(--red)',
                      paddingLeft: 11,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{item.tema}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {item.evidencia}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 5 }}>“{item.pergunta}”</div>
                  </div>
                ))
              )}
            </div>

            {aberta.destaque && aberta.roteiro.length > 0 && (
              <div
                style={{
                  background: 'var(--green-soft)',
                  color: 'var(--green)',
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 13,
                  marginBottom: 18,
                }}
              >
                Comece pelo que funcionou: {aberta.destaque}.
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>
                Registrar este 1:1
              </div>
              {dados.registros == null ? (
                <div
                  style={{
                    background: 'var(--sunk)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: 'var(--muted)',
                  }}
                >
                  O histórico de 1:1 precisa da migration{' '}
                  <strong style={{ color: 'var(--ink)' }}>20260814_um_a_um.sql</strong>. O resto
                  desta tela funciona sem ela.
                </div>
              ) : (
                <>
                  <textarea
                    value={pauta}
                    onChange={(e) => setPauta(e.target.value)}
                    placeholder="O que foi conversado"
                    rows={3}
                    style={{
                      width: '100%',
                      font: 'inherit',
                      padding: '8px 10px',
                      border: '1px solid var(--line-btn)',
                      borderRadius: 8,
                      background: 'var(--panel2)',
                      color: 'var(--ink)',
                      resize: 'vertical',
                      marginBottom: 8,
                    }}
                  />
                  <textarea
                    value={combinado}
                    onChange={(e) => setCombinado(e.target.value)}
                    placeholder="O que ficou combinado — é o que você cobra na próxima"
                    rows={2}
                    style={{
                      width: '100%',
                      font: 'inherit',
                      padding: '8px 10px',
                      border: '1px solid var(--line-btn)',
                      borderRadius: 8,
                      background: 'var(--panel2)',
                      color: 'var(--ink)',
                      resize: 'vertical',
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ marginBottom: 10 }}>
                    <GravadorDeAudio aoConcluir={setAudio} desabilitado={salvando} />
                    {audio && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 13,
                          background: 'var(--green-soft)',
                          color: 'var(--green)',
                          borderRadius: 8,
                          padding: '8px 10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <span>
                          Áudio pronto · {(audio.size / 1024 / 1024).toFixed(1)} MB. Ele sobe e é
                          transcrito ao registrar.
                        </span>
                        <button
                          onClick={() => setAudio(null)}
                          style={{
                            border: 'none', background: 'none', cursor: 'pointer',
                            color: 'var(--green)', font: 'inherit', fontWeight: 800,
                          }}
                        >
                          remover
                        </button>
                      </div>
                    )}
                  </div>

                  <SeletorDeDocumentos
                    escolhidos={docs}
                    aoMudar={setDocs}
                    desabilitado={salvando}
                    aoAvisar={setAviso}
                  />

                  <button
                    onClick={salvar}
                    disabled={salvando || (!pauta.trim() && !combinado.trim() && !audio && docs.length === 0)}
                    style={{
                      border: 'none',
                      background: 'var(--red)',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '10px 16px',
                      font: 'inherit',
                      fontWeight: 800,
                      cursor: salvando ? 'default' : 'pointer',
                      opacity: !pauta.trim() && !combinado.trim() && !audio && docs.length === 0 ? 0.5 : 1,
                    }}
                  >
                    {salvando ? 'Salvando…' : 'Registrar'}
                  </button>
                  {aviso && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{aviso}</div>
                  )}
                </>
              )}
            </div>

            {historico.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>
                  Conversas anteriores · {historico.length}
                </div>
                {historico.map((r) => (
                  <div key={r.id} style={{ padding: '9px 0', borderTop: '1px solid var(--line-soft)' }}>
                    <div style={{ fontSize: 12, color: 'var(--ter)' }}>
                      {DATA.format(new Date(r.data))}
                      {r.autorNome && ` · ${r.autorNome}`}
                    </div>
                    {r.pauta && <div style={{ marginTop: 3 }}>{r.pauta}</div>}
                    {r.combinado && (
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Combinado:</strong> {r.combinado}
                      </div>
                    )}
                    <ListaDeDocumentos
                      docs={r.documentos}
                      aoBaixar={baixarDoc}
                      aoRemover={removerDoc}
                    />
                    <ItemDeAudio
                      r={r}
                      ocupado={transcrevendo === r.id}
                      aoOuvir={ouvir}
                      aoTranscrever={retranscrever}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
