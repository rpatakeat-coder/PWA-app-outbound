// Daily — o placar da reuniao das 9h.
//
// Uma linha por executivo, na ordem em que a reuniao deve acontecer: EXCECAO
// PRIMEIRO (quem nao pontuou hoje encabeca), o resto por pontos. E' o roteiro
// literal do gestor, nao um relatorio pra ler depois.
//
// Regras do doc respeitadas:
//  - Um unico bloco escuro por tela (o banner).
//  - Detalhe (nivel 3) em drawer, nunca inline.
//  - Janela de tempo rotulada junto do numero.
//  - Sem dado, estado vazio honesto — nunca zero disfarcado de resultado.
import { useEffect, useMemo, useState } from 'react';
import { carregarDaily, type DadosDaily, type ExecutivoDaily, type DiaDoExecutivo } from '../dados/daily';
import { Drawer } from '../componentes/Drawer';
// Unico icone do cockpit hoje. Vem do design system, e nao de um emoji: o
// 🔥 muda de desenho em cada sistema (no Windows e' laranja chapado, no Mac
// tem degrade) e nao acompanha a cor do tema.
import { IconTrendingUp } from 'takeat-design-system-ui-kit/icons/IconTrendingUp';

const DIA_CURTO = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });

function rotuloDoDia(dia: string): string {
  return DIA_CURTO.format(new Date(`${dia}T12:00:00Z`)).replace('.', '').slice(0, 3);
}

/** Celula da semana: verde cumpriu, ambar parcial, tracejado o dia de hoje. */
function CelulaSemana({ d, hoje }: { d: DiaDoExecutivo; hoje: string }) {
  const ehHoje = d.dia === hoje;
  const cor =
    d.cumpriu == null
      ? 'var(--ter)'
      : d.cumpriu
        ? 'var(--green)'
        : d.visitas > 0
          ? 'var(--amber)'
          : 'var(--red)';
  return (
    <div
      style={{ textAlign: 'center', minWidth: 34 }}
      title={
        `${d.dia}: ${d.visitas} visitas` +
        (d.prometido != null
          ? d.medidoPor === 'promessa'
            ? ` de ${d.prometido} que ele prometeu`
            : ` de ${d.prometido} paradas planejadas`
          : d.medidoPor === 'meta'
            ? ' (medido pela meta padrão)'
            : '')
      }
    >
      <div style={{ fontSize: 10, color: 'var(--ter)', textTransform: 'lowercase' }}>
        {rotuloDoDia(d.dia)}
      </div>
      <div
        style={{
          marginTop: 2,
          height: 22,
          lineHeight: '20px',
          fontSize: 11,
          fontWeight: 800,
          color: cor,
          border: ehHoje ? '1px dashed var(--line-btn)' : '1px solid transparent',
          borderRadius: 5,
          background: ehHoje ? 'var(--sunk)' : undefined,
        }}
      >
        {d.cumpriu == null ? '·' : d.visitas}
      </div>
    </div>
  );
}

function Pilula({ e }: { e: ExecutivoDaily }) {
  const { hoje } = e;
  let texto: string;
  let fundo = 'var(--sunk)';
  let cor = 'var(--muted)';

  // O texto diz CONTRA O QUE estamos medindo. "Nao cumpriu a rota que montou"
  // e "ficou abaixo da meta padrao" sao conversas diferentes na reuniao.
  const alvo = hoje.prometido ?? e.metaVisitas;

  if (hoje.pontos === 0) {
    texto =
      hoje.prometido != null
        ? `0 de ${hoje.prometido} ${hoje.medidoPor === 'promessa' ? 'prometidas' : 'paradas'}`
        : 'sem registro hoje';
    fundo = 'var(--red-soft)';
    cor = 'var(--red)';
  } else if (alvo == null) {
    texto = 'sem rota e sem meta';
  } else if (hoje.cumpriu) {
    texto =
      hoje.medidoPor === 'promessa' ? 'palavra cumprida'
      : hoje.medidoPor === 'rota' ? 'rota cumprida'
      : 'meta batida';
    fundo = 'var(--green-soft)';
    cor = 'var(--green)';
  } else {
    texto =
      hoje.medidoPor === 'promessa'
        ? `${hoje.visitas} de ${alvo} prometidas`
        : hoje.medidoPor === 'rota'
          ? `${hoje.visitas} de ${alvo} paradas`
          : `${hoje.visitas}/${alvo} visitas`;
    fundo = 'var(--amber-soft)';
    cor = 'var(--amber-ink)';
  }
  return (
    <span
      style={{
        background: fundo,
        color: cor,
        borderRadius: 999,
        padding: '2px 9px',
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  );
}

/** Visitas contra o que a pessoa prometeu. O denominador so' aparece quando
 *  existe promessa — inventar "de 6" a partir da meta padrao faria parecer que
 *  ela combinou 6, quando ninguem combinou nada. */
function CelulaVisitas({ d }: { d: DiaDoExecutivo }) {
  return (
    <td style={{ textAlign: 'center' }}>
      <span
        style={{
          fontWeight: d.visitas ? 800 : 600,
          color: d.visitas ? 'var(--ink)' : 'var(--ter)',
        }}
      >
        {d.visitas || '–'}
      </span>
      {d.prometido != null && (
        <span style={{ color: 'var(--ter)', fontWeight: 700 }}> / {d.prometido}</span>
      )}
    </td>
  );
}

function Numero({ valor, peso }: { valor: number; peso?: boolean }) {
  return (
    <td
      style={{
        textAlign: 'center',
        fontWeight: valor ? 800 : 600,
        color: valor ? (peso ? 'var(--green)' : 'var(--ink)') : 'var(--ter)',
      }}
    >
      {valor || '–'}
    </td>
  );
}

function ListaNomes({ titulo, nomes }: { titulo: string; nomes: string[] }) {
  if (nomes.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 4 }}>
        {titulo} · {nomes.length}
      </div>
      {nomes.map((n, i) => (
        <div key={`${n}-${i}`} style={{ padding: '5px 0', borderTop: '1px solid var(--line-soft)' }}>
          {n}
        </div>
      ))}
    </div>
  );
}

export function Daily() {
  const [dados, setDados] = useState<DadosDaily | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<ExecutivoDaily | null>(null);

  useEffect(() => {
    carregarDaily().then(setDados).catch((e) => setErro(e.message ?? String(e)));
  }, []);

  const semRegistro = useMemo(
    () => dados?.executivos.filter((e) => e.hoje.pontos === 0).length ?? 0,
    [dados],
  );

  if (erro) {
    return (
      <div className="cartao" style={{ borderColor: 'var(--red)' }}>
        <strong>Não consegui carregar a Daily.</strong>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{erro}</div>
      </div>
    );
  }
  if (!dados) return <div className="cartao">Carregando o placar…</div>;

  const { executivos, totais, hoje } = dados;

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
          {!dados.ehDiaUtil ? (
            <>
              Hoje não é dia útil. O placar abaixo está zerado por isso — não é falta de
              registro.
            </>
          ) : semRegistro > 0 ? (
            <>
              <strong style={{ color: 'var(--dark-ink)' }}>
                {semRegistro} de {executivos.length} sem nenhum registro hoje
              </strong>{' '}
              — estão no topo da lista. O time soma {totais.visitas} visitas e{' '}
              {totais.fechamentos} fechamentos.
            </>
          ) : (
            <>
              Todo mundo com registro hoje. {totais.visitas} visitas, {totais.avancos} avanços,{' '}
              {totais.propostas} propostas, {totais.fechamentos} fechamentos.
            </>
          )}
        </div>
      </div>

      {/* Nota de contexto, nao alarme. A meta global e' uma configuracao valida
          — o gestor ja' a definiu em Config Rota do dia. Tratar isso como
          pendencia mandaria ele cadastrar o que ja' esta' cadastrado. */}
      {(dados.comMetaPropria === 0 || dados.semMeta > 0 || dados.comRotaHoje > 0) && (
        <div
          style={{
            background: 'var(--sunk)',
            color: 'var(--muted)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '9px 12px',
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {dados.comRotaHoje > 0 && (
            <>
              <strong style={{ color: 'var(--ink)' }}>
                {dados.comRotaHoje} de {dados.executivos.length}
              </strong>{' '}
              montaram Rota do dia e estão sendo medidos contra a própria promessa.{' '}
            </>
          )}
          {dados.comMetaPropria === 0 && (
            <>
              O resto cai na meta global de{' '}
              <strong style={{ color: 'var(--ink)' }}>{dados.metaGlobal} visitas/dia</strong>. Metas
              individuais são opcionais e ficam no app de campo, em Metas por vendedor.
            </>
          )}
          {dados.comMetaPropria === 0 && dados.semMeta > 0 && ' '}
          {dados.semMeta > 0 && (
            <>
              <strong style={{ color: 'var(--ink)' }}>{dados.semMeta}</strong>{' '}
              {dados.semMeta === 1 ? 'pessoa está marcada' : 'pessoas estão marcadas'} como “sem
              meta”, então {dados.semMeta === 1 ? 'ela aparece' : 'elas aparecem'} no placar sem
              sequência e sem selo.
            </>
          )}
        </div>
      )}

      <section className="cartao">
        <h2 className="titulo-secao">
          Placar de hoje · {new Date(`${hoje}T12:00:00Z`).toLocaleDateString('pt-BR')}
        </h2>

        {executivos.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>Nenhum executivo ativo cadastrado.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 0', fontWeight: 700 }}>Executivo</th>
                  <th
                    style={{ fontWeight: 700, textAlign: 'center' }}
                    title="Check-ins com GPS / paradas planejadas na rota do dia"
                  >
                    Visitas
                  </th>
                  <th style={{ fontWeight: 700, textAlign: 'center' }} title="Subiram de etapa no funil">
                    Avanços
                  </th>
                  <th style={{ fontWeight: 700, textAlign: 'center' }} title="Chegaram em Demo/Proposta">
                    Propostas
                  </th>
                  <th style={{ fontWeight: 700, textAlign: 'center' }} title="Data real de fechamento">
                    Fechou
                  </th>
                  <th style={{ fontWeight: 700, textAlign: 'center' }}>Pontos</th>
                  <th style={{ fontWeight: 700, textAlign: 'center' }} title="Dias úteis seguidos cumprindo o combinado (a rota que montou, ou a meta padrão), até ontem">
                    Seq.
                  </th>
                  <th style={{ fontWeight: 700, textAlign: 'center' }}>Semana</th>
                  <th style={{ fontWeight: 700 }} />
                </tr>
              </thead>
              <tbody>
                {executivos.map((e) => (
                  <tr
                    key={e.perfilId}
                    onClick={() => setAberto(e)}
                    style={{
                      borderTop: '1px solid var(--line-soft)',
                      cursor: 'pointer',
                      // Pendente com fundo vermelho-claro, como o doc pede.
                      background: e.hoje.pontos === 0 ? 'var(--red-soft)' : undefined,
                    }}
                  >
                    <td style={{ padding: '9px 0', fontWeight: 700 }}>{e.nome}</td>
                    <CelulaVisitas d={e.hoje} />
                    <Numero valor={e.hoje.avancos} />
                    <Numero valor={e.hoje.propostas} />
                    <Numero valor={e.hoje.fechamentos} peso />
                    <td style={{ textAlign: 'center', fontWeight: 800 }}>{e.hoje.pontos || '–'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {e.sequencia == null ? (
                        <span style={{ color: 'var(--ter)' }}>–</span>
                      ) : e.sequencia > 0 ? (
                        <span
                          style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                        >
                          <IconTrendingUp width={12} height={12} fill="var(--amber-ink)" />
                          {e.sequencia}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ter)' }}>0</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                        {e.semana.map((d) => (
                          <CelulaSemana key={d.dia} d={d} hoje={hoje} />
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Pilula e={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
          Pontos: visita 10 · avanço 25 · proposta 40 · fechamento 100. Tudo derivado do que foi
          registrado no app — ninguém digita nada aqui. Quando há “/ N” nas visitas, N são as
          paradas que a pessoa planejou na Rota do dia: aí o placar cobra a promessa dela, não a
          meta padrão.
        </div>
      </section>

      <Drawer
        aberto={aberto != null}
        titulo={aberto?.nome ?? ''}
        subtitulo={
          aberto
            ? `${aberto.hoje.pontos} pontos hoje${
                aberto.metaVisitas != null ? ` · meta ${aberto.metaVisitas} visitas/dia` : ' · sem meta'
              }`
            : ''
        }
        aoFechar={() => setAberto(null)}
      >
        {aberto && (
          <>
            {aberto.hoje.pontos === 0 && (
              <div
                style={{
                  background: 'var(--red-soft)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 14,
                  fontSize: 13,
                }}
              >
                Nenhum registro hoje. Antes de cobrar, vale olhar a semana: se os outros dias
                estão cheios, é o registro que falhou, não o dia.
              </div>
            )}

            <ListaNomes titulo="Fechou" nomes={aberto.execucao.fechamentos} />
            <ListaNomes titulo="Propostas" nomes={aberto.execucao.propostas} />
            <ListaNomes titulo="Avanços" nomes={aberto.execucao.avancos} />
            <ListaNomes titulo="Visitas" nomes={aberto.execucao.visitas} />

            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>
                Últimos 5 dias úteis · visitas
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {aberto.semana.map((d) => (
                  <CelulaSemana key={d.dia} d={d} hoje={hoje} />
                ))}
              </div>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
