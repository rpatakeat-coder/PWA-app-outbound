// Prospeccao — "o que esta' entrando no topo do funil, e o que esta' sendo
// jogado fora?".
//
// Ver o cabecalho de dados/prospeccao.ts pra por que esta tela NAO tem fila de
// aprovacao (o doc tem; este app nao aprova nada — quem cura e' o vendedor em
// campo, depois do fato).
//
// O bloco mais importante daqui e' o do DESCARTE. Ele e' a unica coisa nesta
// tela que o gestor nao consegue ver em lugar nenhum hoje: o vendedor descarta
// pelo app e a conta some, sem deixar rastro visivel pra gestao.
import { useEffect, useMemo, useState } from 'react';
import { carregarProspeccao, type DadosProspeccao, type ContaAlvo } from '../dados/prospeccao';
import { Drawer } from '../componentes/Drawer';

const DATA_CURTA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function pct(parte: number, todo: number): string {
  if (!todo) return '–';
  return `${Math.round((parte / todo) * 100)}%`;
}

function LinhaConta({ c }: { c: ContaAlvo }) {
  return (
    <div style={{ padding: '9px 0', borderTop: '1px solid var(--line-soft)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontWeight: 700 }}>{c.nome}</span>
        <span style={{ color: 'var(--ter)', fontSize: 12, whiteSpace: 'nowrap' }}>
          {c.avaliacoes != null ? `${c.avaliacoes} aval.` : 'sem avaliações'}
          {c.rating != null && ` · ${c.rating}★`}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
        {[c.bairro, c.cidade].filter(Boolean).join(', ') || 'sem endereço'}
        {c.etapa && ` · ${c.etapa}`}
        {c.dispensada && c.dispensadaPor && (
          <span style={{ color: 'var(--red)' }}>
            {' '}
            · dispensada por {c.dispensadaPor}
            {c.dispensadaEm && ` em ${DATA_CURTA.format(new Date(c.dispensadaEm))}`}
          </span>
        )}
      </div>
    </div>
  );
}

export function Prospeccao() {
  const [dados, setDados] = useState<DadosProspeccao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [praca, setPraca] = useState<string | null>(null);
  const [verDispensadas, setVerDispensadas] = useState(false);

  useEffect(() => {
    carregarProspeccao().then(setDados).catch((e) => setErro(e.message ?? String(e)));
  }, []);

  const contasDaPraca = useMemo(() => {
    if (!dados || !praca) return [];
    return dados.contas
      .filter((c) => ((c.cidade || '').trim() || (c.bairro || '').trim() || 'sem praça') === praca)
      .sort((a, b) => (b.avaliacoes ?? 0) - (a.avaliacoes ?? 0) || a.nome.localeCompare(b.nome));
  }, [dados, praca]);

  if (erro) {
    return (
      <div className="cartao" style={{ borderColor: 'var(--red)' }}>
        <strong>Não consegui carregar a prospecção.</strong>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{erro}</div>
      </div>
    );
  }
  if (!dados) return <div className="cartao">Carregando o topo do funil…</div>;

  const { funil, pracas, regua, barradasSoPelaNota, dispensadas, porQuemDispensou } = dados;
  const maior = Math.max(...funil.map((f) => f.total), 1);
  const viraram = funil.find((f) => f.rotulo === 'Viraram lead')?.total ?? 0;
  const noMapa = dados.materializadas;

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
          {noMapa === 0 ? (
            <>
              Nenhuma conta-alvo materializada ainda. As {dados.descobertas} descobertas estão em
              estoque — elas só entram no mapa quando a Rota do dia as puxa.
            </>
          ) : (
            <>
              <strong style={{ color: 'var(--dark-ink)' }}>
                {viraram} de {noMapa} contas-alvo viraram lead
              </strong>{' '}
              ({pct(viraram, noMapa)}). {dispensadas.length} foram dispensadas em campo
              {dados.novasNaSemana > 0 && ` · ${dados.novasNaSemana} descobertas nesta semana`}.
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <section className="cartao">
          <h2 className="titulo-secao">Do estoque à venda</h2>
          {funil.map((f) => (
            <div key={f.rotulo} style={{ paddingBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>{f.rotulo}</span>
                <span style={{ color: 'var(--muted)' }}>
                  {f.total.toLocaleString('pt-BR')}
                  {f.rotulo !== 'Descobertas' && (
                    <span style={{ color: 'var(--ter)' }}> · {pct(f.total, maior)}</span>
                  )}
                </span>
              </div>
              <div style={{ height: 18, background: 'var(--sunk)', borderRadius: 5 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(f.total / maior) * 100}%`,
                    minWidth: f.total ? 3 : 0,
                    background: f.rotulo === 'Ganhas' ? 'var(--green)' : 'var(--ink)',
                    opacity: f.rotulo === 'Ganhas' ? 1 : 0.7,
                    borderRadius: 5,
                  }}
                />
              </div>
            </div>
          ))}
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            “Viraram lead” exclui quem ainda está em Prospecção ou Visita: estar no mapa não é o
            mesmo que ter conversado com o dono.
          </div>
        </section>

        <section className="cartao">
          <h2 className="titulo-secao">A régua de hoje</h2>
          {!regua ? (
            <div style={{ color: 'var(--muted)' }}>
              Nenhuma configuração de rota encontrada (route_config vazia).
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 18, marginBottom: 12 }}>
                {[
                  { r: 'Raio', v: `${regua.raioKm} km` },
                  { r: 'Nota mín.', v: `${regua.notaMin}★` },
                  { r: 'Avaliações mín.', v: String(regua.avaliacoesMin) },
                ].map((x) => (
                  <div key={x.r}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{x.r}</div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{x.v}</div>
                  </div>
                ))}
              </div>

              {/* O custo da regua, medido. Nao mudo a configuracao pelo cockpit
                  — ela e' do gestor —, mas o numero deixa a escolha informada. */}
              <div
                style={{
                  background: 'var(--amber-soft)',
                  color: 'var(--amber-ink)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                }}
              >
                <strong>{barradasSoPelaNota.toLocaleString('pt-BR')}</strong> contas têm{' '}
                {regua.avaliacoesMin}+ avaliações mas são descartadas <strong>só pela nota</strong>.
                <div style={{ marginTop: 6 }}>
                  O documento de referência trata volume de avaliações como o único corte de
                  potencial, e a nota como contexto — a premissa é que restaurante com muita
                  avaliação e nota baixa costuma ser quem mais precisa de operação. A régua atual
                  faz o contrário. Não é bug; é uma escolha, e ela custa esse número. Muda em
                  Config Rota do dia, no app de campo.
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="cartao" style={{ marginBottom: 18 }}>
        <h2 className="titulo-secao">Por praça</h2>
        {pracas.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>Nenhuma conta-alvo no mapa ainda.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th style={{ padding: '6px 0', fontWeight: 700 }}>Praça</th>
                <th style={{ fontWeight: 700, textAlign: 'center' }}>No mapa</th>
                <th style={{ fontWeight: 700, textAlign: 'center' }}>Visitadas</th>
                <th style={{ fontWeight: 700, textAlign: 'center' }}>Viraram lead</th>
                <th style={{ fontWeight: 700, textAlign: 'center' }}>Ganhas</th>
                <th style={{ fontWeight: 700, textAlign: 'center' }}>Dispensadas</th>
                <th style={{ fontWeight: 700, textAlign: 'center' }}>Conversão</th>
              </tr>
            </thead>
            <tbody>
              {pracas.map((p) => (
                <tr
                  key={p.nome}
                  onClick={() => setPraca(p.nome)}
                  style={{ borderTop: '1px solid var(--line-soft)', cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px 0', fontWeight: 700 }}>{p.nome}</td>
                  <td style={{ textAlign: 'center' }}>{p.total}</td>
                  <td style={{ textAlign: 'center' }}>{p.visitadas || '–'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{p.viraramLead || '–'}</td>
                  <td style={{ textAlign: 'center', color: p.ganhas ? 'var(--green)' : 'var(--ter)', fontWeight: 700 }}>
                    {p.ganhas || '–'}
                  </td>
                  <td style={{ textAlign: 'center', color: p.dispensadas ? 'var(--red)' : 'var(--ter)' }}>
                    {p.dispensadas || '–'}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {pct(p.viraramLead, p.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="cartao">
        <h2 className="titulo-secao">Descarte em campo · {dispensadas.length}</h2>
        {dispensadas.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>
            Nenhuma conta-alvo foi dispensada. Vale saber: quando o vendedor marca “não
            interessa”, o lugar some do mapa dele e não é sugerido de novo.
          </div>
        ) : (
          <>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 10 }}>
              Quando o vendedor marca “não interessa”, a conta some do mapa e não volta a ser
              sugerida. É a única decisão de prospecção que acontece sem passar por você.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {porQuemDispensou.map((q) => (
                <span
                  key={q.nome}
                  style={{
                    background: 'var(--sunk)',
                    border: '1px solid var(--line)',
                    borderRadius: 999,
                    padding: '3px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {q.nome} · {q.total}
                </span>
              ))}
            </div>
            <button
              onClick={() => setVerDispensadas(true)}
              style={{
                border: '1px solid var(--line-btn)',
                background: 'var(--panel2)',
                borderRadius: 8,
                padding: '9px 14px',
                font: 'inherit',
                fontWeight: 700,
                cursor: 'pointer',
                color: 'var(--ink)',
              }}
            >
              Ver as {dispensadas.length} dispensadas →
            </button>
          </>
        )}
      </section>

      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
        Descobertas vêm do Google via Serper; entram no mapa pela Rota do dia ·{' '}
        {dados.atualizadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>

      <Drawer
        aberto={praca != null}
        titulo={praca ?? ''}
        subtitulo={`${contasDaPraca.length} contas-alvo · ordenadas por avaliações`}
        aoFechar={() => setPraca(null)}
      >
        {contasDaPraca.map((c) => (
          <LinhaConta key={c.id} c={c} />
        ))}
      </Drawer>

      <Drawer
        aberto={verDispensadas}
        titulo="Dispensadas em campo"
        subtitulo={`${dispensadas.length} contas · mais recentes primeiro`}
        aoFechar={() => setVerDispensadas(false)}
      >
        {[...dispensadas]
          .sort((a, b) => (b.dispensadaEm ?? '').localeCompare(a.dispensadaEm ?? ''))
          .map((c) => (
            <LinhaConta key={c.id} c={c} />
          ))}
      </Drawer>
    </>
  );
}
