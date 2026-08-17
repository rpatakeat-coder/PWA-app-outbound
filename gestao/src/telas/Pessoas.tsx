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
  type Registro1a1,
  type DadosPessoas,
  type Pessoa,
  type Semaforo,
} from '../dados/pessoas';
import { Drawer } from '../componentes/Drawer';
import { GravadorDeAudio } from '../componentes/GravadorDeAudio';

const DATA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const CORES: Record<Semaforo, { cor: string; fundo: string; rotulo: string }> = {
  critico: { cor: 'var(--red)', fundo: 'var(--red-soft)', rotulo: 'Preparar 1:1' },
  atencao: { cor: 'var(--amber-ink)', fundo: 'var(--amber-soft)', rotulo: 'Acompanhar' },
  ok: { cor: 'var(--green)', fundo: 'var(--green-soft)', rotulo: 'Em dia' },
};

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
        <Metrica r="Carteira" v={String(p.carteira)} />
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
          v={String(p.fechadosNoMes)}
          tom={p.fechadosNoMes ? 'var(--green)' : undefined}
        />
      </div>

      {p.gargalo && p.gargalo.travados > 0 ? (
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
  const [dados, setDados] = useState<DadosPessoas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Pessoa | null>(null);
  const [pauta, setPauta] = useState('');
  const [combinado, setCombinado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [transcrevendo, setTranscrevendo] = useState<string | null>(null);

  const recarregar = () =>
    carregarPessoas()
      .then(setDados)
      .catch((e) => setErro(e.message ?? String(e)));

  useEffect(() => {
    recarregar();
  }, []);

  const historico = useMemo(
    () => (aberta && dados?.registros ? dados.registros.filter((r) => r.perfilId === aberta.perfilId) : []),
    [aberta, dados],
  );

  const salvar = async () => {
    if (!aberta || (!pauta.trim() && !combinado.trim() && !audio)) return;
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

    setSalvando(false);
    setPauta('');
    setCombinado('');
    setAudio(null);
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
        <div style={{ fontSize: 20, fontWeight: 800 }}>Pessoas</div>
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
                {p.destaque ?? `${p.carteira} em carteira`}
              </span>
            </div>
          ))}
        </section>
      )}

      <div style={{ color: 'var(--ter)', fontSize: 12, marginTop: 16 }}>
        Semáforo por percentual da carteira acima do SLA: abaixo de 15% em dia, 15–35% atenção,
        35%+ crítico ·{' '}
        {dados.atualizadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>

      <Drawer
        aberto={aberta != null}
        titulo={aberta?.nome ?? ''}
        subtitulo={
          aberta
            ? `${aberta.carteira} em carteira · ${aberta.travados} travados` +
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

                  <button
                    onClick={salvar}
                    disabled={salvando || (!pauta.trim() && !combinado.trim() && !audio)}
                    style={{
                      border: 'none',
                      background: 'var(--red)',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '10px 16px',
                      font: 'inherit',
                      fontWeight: 800,
                      cursor: salvando ? 'default' : 'pointer',
                      opacity: !pauta.trim() && !combinado.trim() && !audio ? 0.5 : 1,
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
