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

const DIA_CURTO = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });

function rotuloDoDia(dia: string): string {
  return DIA_CURTO.format(new Date(`${dia}T12:00:00Z`)).replace('.', '').slice(0, 3);
}

/**
 * Celula de um dia da semana.
 *
 * A cor le' o NUMERO contra a meta global, e nao o booleano `cumpriu`: zero e'
 * ausencia (--ter), pouco e' ambar, cumpriu e' verde. Vermelho fica reservado
 * pra ausencia de registro e prazo estourado, que e' o que ele significa no
 * resto do cockpit — pintar "3 de 6 visitas" de vermelho igualava quem
 * trabalhou pouco a quem nao registrou nada.
 *
 * `comRotulo` existe porque na TABELA os dias sao escritos uma vez so', no
 * cabecalho da coluna; no drawer nao ha' cabecalho, entao cada celula leva o seu.
 */
function CelulaSemana({
  d,
  hoje,
  meta,
  comRotulo = false,
}: {
  d: DiaDoExecutivo;
  hoje: string;
  meta: number;
  comRotulo?: boolean;
}) {
  const ehHoje = d.dia === hoje;
  const cor =
    d.visitas >= meta ? 'var(--green)' : d.visitas > 0 ? 'var(--amber-ink)' : 'var(--ter)';
  return (
    <div
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
      {comRotulo && (
        <div
          style={{
            fontSize: 11,
            lineHeight: '16px',
            letterSpacing: '0.5px',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--ter)',
            textAlign: 'center',
            marginBottom: 2,
          }}
        >
          {rotuloDoDia(d.dia)}
        </div>
      )}
      <div
        style={{
          height: 24,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          lineHeight: '16px',
          letterSpacing: '0.4px',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: cor,
          background: ehHoje ? 'var(--panel2)' : undefined,
        }}
      >
        {d.cumpriu == null && d.visitas === 0 ? '—' : d.visitas}
      </div>
    </div>
  );
}

/** Visitas contra o que a pessoa prometeu. O denominador so' aparece quando
 *  existe promessa — inventar "de 6" a partir da meta padrao faria parecer que
 *  ela combinou 6, quando ninguem combinou nada. E' aqui que a distincao
 *  promessa/rota/meta sobrevive, agora que a pilula de status saiu. */
function CelulaVisitas({ d }: { d: DiaDoExecutivo }) {
  return (
    <td
      style={{
        ...celulaNumero,
        color: d.visitas ? 'var(--muted)' : 'var(--ter)',
      }}
      title={
        d.prometido != null
          ? d.medidoPor === 'promessa'
            ? `${d.visitas} de ${d.prometido} que ele prometeu`
            : `${d.visitas} de ${d.prometido} paradas planejadas`
          : d.medidoPor === 'meta'
            ? 'medido pela meta padrão'
            : undefined
      }
    >
      {d.visitas || '—'}
      {d.prometido != null && <span style={{ color: 'var(--ter)' }}> / {d.prometido}</span>}
    </td>
  );
}

/** Numero da tabela. Ausencia e' travessao em --ter; zero de verdade tambem. */
const celulaNumero: React.CSSProperties = {
  textAlign: 'right',
  paddingLeft: 12,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 600,
  color: 'var(--muted)',
  padding: '8px 0',
  borderBottom: '1px solid var(--line-soft)',
};

function Numero({ valor }: { valor: number }) {
  return (
    <td style={{ ...celulaNumero, color: valor ? 'var(--muted)' : 'var(--ter)' }}>
      {valor || '—'}
    </td>
  );
}

/** Iniciais do avatar: no maximo duas letras — o mesmo da tabela da Time. */
function iniciaisDe(nome: string): string {
  return (nome || '?')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** KPI em tres linhas: rotulo, valor, qualificador. O valor e' SEMPRE --ink —
 *  a cor vive no qualificador, nunca no numero. */
function Kpi({
  rotulo,
  valor,
  qualificador,
  tom,
}: {
  rotulo: string;
  valor: string;
  qualificador: string;
  tom?: 'alerta';
}) {
  return (
    <div className="cartao">
      <div
        style={{
          fontSize: 12,
          lineHeight: '16px',
          letterSpacing: '0.5px',
          fontWeight: 600,
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        {rotulo}
      </div>
      <div
        style={{
          fontSize: 28,
          lineHeight: '36px',
          fontWeight: 700,
          marginTop: 8,
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </div>
      <div
        style={{
          fontSize: 12,
          lineHeight: '16px',
          letterSpacing: '0.4px',
          marginTop: 2,
          color: tom === 'alerta' ? 'var(--red)' : 'var(--ter)',
        }}
      >
        {qualificador}
      </div>
    </div>
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

  // Meta do time: soma da meta EFETIVA de quem tem meta. Quem o gestor marcou
  // como "sem meta" fica de fora — `metaVisitas` e' null justamente porque nao
  // ha' "bateu" pra essa pessoa, e soma-la cobraria quem ele isentou.
  const metaDoTime = executivos.reduce((soma, e) => soma + (e.metaVisitas ?? 0), 0);

  const semRegistroLista = executivos.filter((e) => e.hoje.pontos === 0);
  const comRegistroLista = executivos.filter((e) => e.hoje.pontos > 0);
  const diaDaSemana = new Date(`${hoje}T12:00:00Z`)
    .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .replace('.', '');

  const colunas = ['Visitas', 'Avanços', 'Propostas', 'Fechou', 'Pontos', 'Seq.'];
  const larguras = [64, 72, 80, 64, 64, 56];

  const cabecalhoDeColuna: React.CSSProperties = {
    fontSize: 11,
    lineHeight: '16px',
    letterSpacing: '0.5px',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: 'var(--ter)',
    paddingBottom: 8,
    paddingLeft: 12,
    borderBottom: '1px solid var(--line)',
  };

  /** Rotulo de grupo: filete de 1px ocupando o resto da largura. Agrupar por
   *  titulo, e nao tingir a linha inteira de vermelho — fundo colorido e'
   *  reservado pra acao e alerta, e quinze linhas tingidas viram ruido. */
  const rotuloDeGrupo = (texto: string, quantos: number, cor: string) => (
    <tr>
      <td colSpan={8} style={{ padding: '12px 0 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              fontSize: 11,
              lineHeight: '16px',
              letterSpacing: '0.5px',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: cor,
              whiteSpace: 'nowrap',
            }}
          >
            {texto} · {quantos}
          </span>
          <span style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
        </div>
      </td>
    </tr>
  );

  const linha = (e: ExecutivoDaily) => (
    <tr key={e.perfilId} onClick={() => setAberto(e)} style={{ cursor: 'pointer' }}>
      <td style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              flex: '0 0 28px',
              width: 28,
              height: 28,
              borderRadius: 9999,
              background: 'var(--panel2)',
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              lineHeight: '16px',
              letterSpacing: '0.5px',
              fontWeight: 700,
            }}
          >
            {iniciaisDe(e.nome)}
          </span>
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 14,
              lineHeight: '20px',
              letterSpacing: '0.1px',
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            {e.nome}
          </span>
        </div>
      </td>
      <CelulaVisitas d={e.hoje} />
      <Numero valor={e.hoje.avancos} />
      <Numero valor={e.hoje.propostas} />
      <Numero valor={e.hoje.fechamentos} />
      <Numero valor={e.hoje.pontos} />
      <td
        style={{
          ...celulaNumero,
          color: e.sequencia ? 'var(--muted)' : 'var(--ter)',
        }}
      >
        {e.sequencia == null ? '—' : e.sequencia}
      </td>
      <td style={{ padding: '8px 0 8px 12px', borderBottom: '1px solid var(--line-soft)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 32px)',
            gap: 4,
            justifyContent: 'end',
          }}
        >
          {e.semana.map((d) => (
            <CelulaSemana key={d.dia} d={d} hoje={hoje} meta={dados.metaGlobal} />
          ))}
        </div>
      </td>
    </tr>
  );

  return (
    <>
      {/* Faixa de destaque. --ink sobre --bg inverte sozinho no tema escuro; a
          parte forte e' peso 700 na MESMA cor, sem segunda tinta. */}
      <div
        style={{
          background: 'var(--ink)',
          color: 'var(--bg)',
          borderRadius: 8,
          padding: '14px 20px',
          marginBottom: 16,
          fontSize: 14,
          lineHeight: '20px',
          letterSpacing: '0.25px',
        }}
      >
        {!dados.ehDiaUtil ? (
          'Hoje não é dia útil. O placar abaixo está zerado por isso — não é falta de registro.'
        ) : semRegistro > 0 ? (
          <>
            <strong style={{ fontWeight: 700 }}>
              {semRegistro} de {executivos.length} sem nenhum registro hoje
            </strong>{' '}
            — o time soma {totais.visitas} visitas e {totais.fechamentos} fechamentos.
          </>
        ) : (
          <>
            Todo mundo com registro hoje. {totais.visitas} visitas, {totais.avancos} avanços,{' '}
            {totais.propostas} propostas, {totais.fechamentos} fechamentos.
          </>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Kpi
          rotulo="Sem registro"
          valor={String(semRegistro)}
          qualificador={`de ${executivos.length} executivos`}
          tom={semRegistro > 0 ? 'alerta' : undefined}
        />
        <Kpi
          rotulo="Visitas"
          valor={String(totais.visitas)}
          qualificador={metaDoTime > 0 ? `meta do time: ${metaDoTime}/dia` : 'sem meta no time'}
          tom={metaDoTime > 0 && totais.visitas < metaDoTime ? 'alerta' : undefined}
        />
        <Kpi rotulo="Fechamentos" valor={String(totais.fechamentos)} qualificador="hoje" />
      </div>

      <section className="cartao">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h2 className="titulo-secao" style={{ margin: 0 }}>
            Placar de hoje
          </h2>
          <span
            style={{
              fontSize: 12,
              lineHeight: '16px',
              letterSpacing: '0.4px',
              color: 'var(--ter)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {new Date(`${hoje}T12:00:00Z`).toLocaleDateString('pt-BR')} · {diaDaSemana}
          </span>
        </div>

        {executivos.length === 0 ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>
            Nenhum executivo ativo cadastrado.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col />
              {larguras.map((l, i) => (
                <col key={i} style={{ width: l }} />
              ))}
              <col style={{ width: 176 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...cabecalhoDeColuna, textAlign: 'left', paddingLeft: 0 }}>Executivo</th>
                {colunas.map((c) => (
                  <th key={c} style={{ ...cabecalhoDeColuna, textAlign: 'right' }}>
                    {c}
                  </th>
                ))}
                {/* No lugar de um rotulo "Semana", os cinco dias — escritos uma
                    vez so'. Repetidos linha a linha eram 75 rotulos na tela. */}
                <th style={cabecalhoDeColuna}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 32px)',
                      gap: 4,
                      justifyContent: 'end',
                    }}
                  >
                    {(executivos[0]?.semana ?? []).map((d) => (
                      <span
                        key={d.dia}
                        style={{
                          textAlign: 'center',
                          color: d.dia === hoje ? 'var(--ink)' : 'var(--ter)',
                        }}
                      >
                        {rotuloDoDia(d.dia)}
                      </span>
                    ))}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {semRegistroLista.length > 0 &&
                rotuloDeGrupo('Sem registro hoje', semRegistroLista.length, 'var(--red)')}
              {semRegistroLista.map(linha)}
              {comRegistroLista.length > 0 &&
                rotuloDeGrupo('Com registro', comRegistroLista.length, 'var(--ter)')}
              {comRegistroLista.map(linha)}
            </tbody>
          </table>
        )}

        {/* Nota de rodape, sem fundo e sem borda: a faixa cinza que ficava entre
            os KPIs e o cartao virava um terceiro bloco competindo com eles. */}
        <div
          style={{
            fontSize: 12,
            lineHeight: '16px',
            letterSpacing: '0.4px',
            color: 'var(--ter)',
            marginTop: 12,
          }}
        >
          Sem meta individual, o executivo cai na meta global de {dados.metaGlobal} visitas/dia.
          Metas por vendedor ficam no app de campo.
          {dados.comRotaHoje > 0 &&
            ` ${dados.comRotaHoje} de ${executivos.length} montaram Rota do dia e estão sendo medidos contra a própria promessa.`}
          {dados.semMeta > 0 &&
            ` ${dados.semMeta} ${dados.semMeta === 1 ? 'pessoa está marcada' : 'pessoas estão marcadas'} como “sem meta”.`}
        </div>

        <div
          style={{
            fontSize: 12,
            lineHeight: '16px',
            letterSpacing: '0.4px',
            color: 'var(--ter)',
            marginTop: 8,
          }}
        >
          Pontos: visita 10 · avanço 25 · proposta 40 · fechamento 100. Tudo derivado do que foi
          registrado no app — ninguém digita nada aqui.
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
                  <CelulaSemana key={d.dia} d={d} hoje={hoje} meta={dados.metaGlobal} comRotulo />
                ))}
              </div>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
