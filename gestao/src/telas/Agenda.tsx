// Agenda — a semana do time, em matriz.
//
// Responde "a semana esta' planejada?". Uma linha por executivo, uma coluna por
// dia util da semana CIVIL. A celula diz de relance se aquele dia tem plano.
//
// Por que matriz e nao grade de horas: ver o cabecalho de dados/agenda.ts. Em
// time de rua o plano e' a ROTA, nao o bloco de horario — uma grade de horas
// ficaria 90% vazia e leria como "ninguem planejou", que e' o contrario da
// verdade.
//
// Regras do doc respeitadas:
//  - Um unico bloco escuro por tela (o banner).
//  - Detalhe em drawer, nunca inline.
//  - Hoje-vazio recebe tracejado vermelho (o unico buraco acionavel agora).
//  - Dia passado nao vira alarme: cobrar plano de terca passada nao muda nada.
import { useEffect, useState } from 'react';
import { carregarAgenda, type DadosAgenda, type DiaDaAgenda, type LinhaAgenda } from '../dados/agenda';
import { Drawer } from '../componentes/Drawer';

const SEMANA_CURTA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const HORA = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function rotulo(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  return {
    semana: SEMANA_CURTA.format(d).replace('.', '').slice(0, 3),
    numero: dia.slice(8, 10),
  };
}

/** Heatmap do doc: verde escuro 3+, verde claro 1-2, cinza vazio,
 *  hoje-vazio tracejado vermelho. */
function Celula({ d, aoAbrir }: { d: DiaDaAgenda; aoAbrir: () => void }) {
  const paradas = d.rota?.paradas ?? 0;
  const total = paradas + d.reunioes;
  const vazio = total === 0;

  let fundo = 'var(--sunk)';
  let cor = 'var(--ter)';
  if (total >= 3) {
    fundo = 'var(--green)';
    cor = '#fff';
  } else if (total > 0) {
    fundo = 'var(--green-soft)';
    cor = 'var(--green)';
  }

  const alarme = vazio && d.ehHoje;

  return (
    <button
      onClick={aoAbrir}
      disabled={vazio}
      title={
        vazio
          ? `${d.dia}: sem plano`
          : `${d.dia}: ${paradas} paradas${d.reunioes ? `, ${d.reunioes} reunião(ões)` : ''}`
      }
      style={{
        width: '100%',
        height: 38,
        border: alarme ? '1.5px dashed var(--red)' : '1px solid var(--line-soft)',
        borderRadius: 7,
        background: alarme ? 'var(--red-soft)' : fundo,
        color: alarme ? 'var(--red)' : cor,
        font: 'inherit',
        fontWeight: 800,
        fontSize: 12,
        cursor: vazio ? 'default' : 'pointer',
        // Dia passado sem plano nao e' alarme, so' historico: desbota.
        opacity: d.ehPassado && vazio ? 0.45 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
      }}
    >
      {vazio ? (alarme ? 'hoje' : '–') : paradas > 0 ? paradas : ''}
      {d.reunioes > 0 && <span style={{ fontSize: 10, fontWeight: 700 }}>◆{d.reunioes}</span>}
    </button>
  );
}

export function Agenda() {
  const [dados, setDados] = useState<DadosAgenda | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [celula, setCelula] = useState<{ linha: LinhaAgenda; dia: DiaDaAgenda } | null>(null);

  useEffect(() => {
    carregarAgenda().then(setDados).catch((e) => setErro(e.message ?? String(e)));
  }, []);

  if (erro) {
    return (
      <div className="cartao" style={{ borderColor: 'var(--red)' }}>
        <strong>Não consegui carregar a agenda.</strong>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{erro}</div>
      </div>
    );
  }
  if (!dados) return <div className="cartao">Carregando a semana…</div>;

  const { semana, linhas, reunioes, semRotaHoje, totais, hoje } = dados;
  const buracosDaqui = linhas.reduce((s, l) => s + l.buracosDaqui, 0);
  const reunioesDaCelula = celula
    ? reunioes.filter((r) => r.perfilId === celula.linha.perfilId && r.dia === celula.dia.dia)
    : [];

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
          {semRotaHoje.length > 0 ? (
            <>
              <strong style={{ color: 'var(--dark-ink)' }}>
                {semRotaHoje.length} sem plano hoje
              </strong>{' '}
              — {semRotaHoje.slice(0, 3).join(', ')}
              {semRotaHoje.length > 3 && ` e mais ${semRotaHoje.length - 3}`}. A semana tem{' '}
              {totais.paradas} paradas e {totais.reunioes} reuniões.
            </>
          ) : linhas.length === 0 ? (
            'Nenhum executivo ativo para montar a semana.'
          ) : (
            <>
              Todo mundo com plano hoje. A semana tem {totais.paradas} paradas em{' '}
              {totais.rotas} rotas e {totais.reunioes} reuniões marcadas.
            </>
          )}
        </div>
      </div>

      <section className="cartao" style={{ marginBottom: 18 }}>
        <h2 className="titulo-secao">
          Semana de {semana[0].slice(8, 10)}/{semana[0].slice(5, 7)} a{' '}
          {semana[4].slice(8, 10)}/{semana[4].slice(5, 7)} · rota do dia
          {buracosDaqui > 0 && (
            <span style={{ color: 'var(--red)', textTransform: 'none', letterSpacing: 0 }}>
              {' '}
              · {buracosDaqui} {buracosDaqui === 1 ? 'dia' : 'dias'} sem plano daqui até sexta
            </span>
          )}
        </h2>

        {linhas.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>Nenhum executivo ativo cadastrado.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px 8px 0', fontWeight: 700 }}>
                    Executivo
                  </th>
                  {semana.map((dia) => {
                    const r = rotulo(dia);
                    const eHoje = dia === hoje;
                    return (
                      <th
                        key={dia}
                        style={{
                          padding: '0 3px 8px',
                          fontWeight: 700,
                          minWidth: 54,
                          color: eHoje ? 'var(--ink)' : 'var(--muted)',
                        }}
                      >
                        <div style={{ fontSize: 11, textTransform: 'lowercase' }}>{r.semana}</div>
                        <div style={{ fontSize: 12 }}>{r.numero}</div>
                      </th>
                    );
                  })}
                  <th style={{ fontWeight: 700, textAlign: 'center', paddingBottom: 8 }}>Semana</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.perfilId} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '6px 8px 6px 0', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {l.nome}
                      {l.buracosDaqui > 0 && (
                        <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 6 }}>
                          {l.buracosDaqui} sem plano
                        </span>
                      )}
                    </td>
                    {l.dias.map((d) => (
                      <td key={d.dia} style={{ padding: '3px' }}>
                        <Celula d={d} aoAbrir={() => setCelula({ linha: l, dia: d })} />
                      </td>
                    ))}
                    <td
                      style={{
                        textAlign: 'center',
                        fontWeight: 800,
                        color: l.totalParadas ? 'var(--ink)' : 'var(--ter)',
                      }}
                    >
                      {l.totalParadas || '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
          O número é de paradas planejadas na rota do dia; ◆ marca reuniões com hora. Célula
          tracejada é hoje sem plano nenhum — o único buraco que ainda dá para preencher.
        </div>
      </section>

      <section className="cartao">
        <h2 className="titulo-secao">Reuniões da semana · {reunioes.length}</h2>
        {reunioes.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>
            Nenhuma reunião marcada nesta semana. Em time de rua isso é comum — a maior parte da
            visita não tem hora —, mas demo e proposta costumam ter.
          </div>
        ) : (
          <div>
            {reunioes.map((r) => {
              const dono = linhas.find((l) => l.perfilId === r.perfilId);
              const rot = rotulo(r.dia);
              return (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'baseline',
                    padding: '8px 0',
                    borderTop: '1px solid var(--line-soft)',
                    opacity: r.dia < hoje ? 0.55 : 1,
                  }}
                >
                  <div
                    style={{
                      minWidth: 62,
                      fontWeight: 800,
                      fontSize: 12,
                      color: r.dia === hoje ? 'var(--red)' : 'var(--muted)',
                    }}
                  >
                    {rot.semana} {HORA.format(new Date(r.quando))}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{r.leadNome}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {dono?.nome ?? 'sem dono'}
                      {r.status !== 'agendada' && ` · ${r.status}`}
                      {r.emCimaDaHora && (
                        <span style={{ color: 'var(--amber-ink)' }}> · marcada no mesmo dia</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
        Semana civil (segunda a sexta), horário de Brasília ·{' '}
        {dados.atualizadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>

      <Drawer
        aberto={celula != null}
        titulo={celula ? celula.linha.nome : ''}
        subtitulo={
          celula
            ? `${rotulo(celula.dia.dia).semana} ${celula.dia.dia.slice(8, 10)}/${celula.dia.dia.slice(5, 7)}` +
              (celula.dia.rota
                ? ` · ${celula.dia.rota.paradas} paradas · ${celula.dia.rota.feitas} feitas`
                : ' · sem rota')
            : ''
        }
        aoFechar={() => setCelula(null)}
      >
        {celula && (
          <>
            {celula.dia.rota && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>
                  Rota do dia · {celula.dia.rota.status}
                </div>
                <div style={{ height: 22, background: 'var(--sunk)', borderRadius: 6 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(celula.dia.rota.feitas / celula.dia.rota.paradas) * 100}%`,
                      minWidth: celula.dia.rota.feitas ? 4 : 0,
                      background: 'var(--green)',
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {celula.dia.rota.feitas} de {celula.dia.rota.paradas} paradas concluídas.
                </div>
              </div>
            )}

            {reunioesDaCelula.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 4 }}>
                  Reuniões · {reunioesDaCelula.length}
                </div>
                {reunioesDaCelula.map((r) => (
                  <div key={r.id} style={{ padding: '6px 0', borderTop: '1px solid var(--line-soft)' }}>
                    <strong>{HORA.format(new Date(r.quando))}</strong> · {r.leadNome}
                  </div>
                ))}
              </div>
            )}

            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 18 }}>
              A lista de paradas por nome fica no app de campo — é lá que a rota é montada e
              reordenada.
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
