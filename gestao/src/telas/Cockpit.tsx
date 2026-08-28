// Cockpit do gestor — a home dele.
//
// Responde "onde eu ajo hoje?" (02-FUNCIONALIDADES.md). Os numeros dizem ONDE
// doi; os dois cliques dizem EM QUEM agir: barra do funil abre os leads
// daquela etapa, linha do executivo abre o dossie dele.
//
// Regras do doc respeitadas:
//  - Nivel 1 acima da dobra; nivel 3 (detalhe) sempre em drawer, nunca inline.
//  - Um unico bloco escuro por tela (o banner).
//  - Vermelho so' pra acao e alerta; estado usa cor no texto, nao fundo inteiro.
//  - Janela de tempo sempre rotulada junto do numero.
//  - Numero nunca chumbado: sem dado, estado vazio honesto.
import { useEffect, useMemo, useState } from 'react';
import { carregarCockpit, type DadosCockpit, type Executivo, type LeadAberto } from '../dados/cockpit';
import { Drawer } from '../componentes/Drawer';

function Kpi({
  rotulo,
  valor,
  janela,
  tom,
}: {
  rotulo: string;
  valor: string;
  janela?: string;
  tom?: 'alerta' | 'bom';
}) {
  return (
    <div className="cartao" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>
        {rotulo}
        {janela && <span style={{ color: 'var(--ter)', fontWeight: 600 }}> · {janela}</span>}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          marginTop: 4,
          color: tom === 'alerta' ? 'var(--red)' : tom === 'bom' ? 'var(--green)' : 'var(--ink)',
        }}
      >
        {valor}
      </div>
    </div>
  );
}

/** Selo de SLA. Acima de 200% o doc pede destaque proprio: "2x o prazo". */
function SeloSla({ lead }: { lead: LeadAberto }) {
  if (lead.slaRatio == null) return <span style={{ color: 'var(--ter)' }}>sem histórico</span>;
  if (!lead.travado) {
    return <span style={{ color: 'var(--green)' }}>{lead.diasNaEtapa}d · no prazo</span>;
  }
  return (
    <span style={{ color: 'var(--red)', fontWeight: 700 }}>
      {lead.diasNaEtapa}d {lead.slaRatio >= 200 ? '· 2× o prazo' : `· ${lead.slaRatio}% do SLA`}
    </span>
  );
}

function ListaDeLeads({ leads }: { leads: LeadAberto[] }) {
  if (leads.length === 0) {
    return <div style={{ color: 'var(--muted)' }}>Nenhum lead aqui.</div>;
  }
  // Travado primeiro, e dentro deles o que esta' ha' mais tempo parado: e' a
  // ordem em que o gestor deve atacar.
  const ordenados = [...leads].sort(
    (a, b) => Number(b.travado) - Number(a.travado) || (b.slaRatio ?? 0) - (a.slaRatio ?? 0),
  );
  return (
    <div>
      {ordenados.map((l) => (
        <div
          key={l.id}
          style={{
            padding: '10px 0',
            borderTop: '1px solid var(--line-soft)',
            borderLeft: l.travado ? '3px solid var(--red)' : undefined,
            paddingLeft: l.travado ? 10 : 0,
          }}
        >
          <div style={{ fontWeight: 700 }}>{l.empresa?.trim() || l.nome}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {l.etapa} · <SeloSla lead={l} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Cockpit() {
  const [dados, setDados] = useState<DadosCockpit | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [etapaAberta, setEtapaAberta] = useState<string | null>(null);
  const [execAberto, setExecAberto] = useState<Executivo | null>(null);
  const [semDonoAberto, setSemDonoAberto] = useState(false);

  useEffect(() => {
    carregarCockpit().then(setDados).catch((e) => setErro(e.message ?? String(e)));
  }, []);

  const leadsDaEtapa = useMemo(
    () => (etapaAberta && dados ? dados.leads.filter((l) => l.etapa === etapaAberta) : []),
    [etapaAberta, dados],
  );
  const leadsDoExec = useMemo(
    () => (execAberto && dados ? dados.leads.filter((l) => l.vendedorId === execAberto.ownerId) : []),
    [execAberto, dados],
  );

  if (erro) {
    return (
      <div className="cartao" style={{ borderColor: 'var(--red)' }}>
        <strong>Não consegui carregar os dados.</strong>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{erro}</div>
      </div>
    );
  }
  if (!dados) {
    return <div className="cartao">Carregando o time…</div>;
  }

  const { kpis, funil, executivos } = dados;
  const maiorEtapa = Math.max(...funil.map((f) => f.total), 1);
  const gargalo = [...funil].sort((a, b) => b.travados - a.travados || b.total - a.total)[0];

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
          {kpis.travados > 0 ? (
            <>
              <strong style={{ color: 'var(--dark-ink)' }}>{kpis.travados} leads acima do SLA</strong>{' '}
              — o gargalo está em{' '}
              <strong style={{ color: 'var(--dark-ink)' }}>{gargalo?.etapa}</strong>, com{' '}
              {gargalo?.travados} parados.
            </>
          ) : (
            'Nenhum lead acima do SLA agora. O funil está em dia.'
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <Kpi rotulo="Em aberto" valor={String(kpis.emAberto)} janela="funil" />
        <Kpi
          rotulo="Travados"
          valor={String(kpis.travados)}
          janela="acima do SLA"
          tom={kpis.travados > 0 ? 'alerta' : 'bom'}
        />
        <Kpi
          rotulo="Fechados"
          valor={kpis.fechadosNoMes != null ? String(kpis.fechadosNoMes) : '—'}
          janela={kpis.fechadosNoMes == null ? 'sem registro de ganho' : 'mês'}
          tom={kpis.fechadosNoMes ? 'bom' : undefined}
        />
        <Kpi
          rotulo="Taxa de avanço"
          valor={kpis.taxaAvancoSemana != null ? `${kpis.taxaAvancoSemana}%` : '—'}
          janela="7 dias"
        />
        <Kpi
          // Rotulo fiel ao que a tabela guarda: meta de VISITAS POR DIA
          // (seller_visit_goals.meta_visitas_dia). Nao e' meta de fechamento —
          // chamar de "meta" seco daria a entender outra coisa.
          rotulo="Meta de visitas"
          valor={kpis.metaVisitasDia != null ? String(kpis.metaVisitasDia) : '—'}
          janela={kpis.metaVisitasDia == null ? 'sem meta definida' : 'soma do time · por dia'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18 }}>
        <section className="cartao">
          <h2 className="titulo-secao">Funil por etapa</h2>
          {funil.map((f) => (
            <button
              key={f.etapa}
              onClick={() => setEtapaAberta(f.etapa)}
              disabled={f.total === 0}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                padding: '0 0 12px',
                cursor: f.total ? 'pointer' : 'default',
                font: 'inherit',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>
                  {f.etapa}
                  {f.sla && <span style={{ color: 'var(--ter)', fontWeight: 600 }}> · SLA {f.sla}d</span>}
                </span>
                <span style={{ color: 'var(--muted)' }}>
                  {f.total}
                  {f.travados > 0 && (
                    <strong style={{ color: 'var(--red)' }}> · {f.travados} travados</strong>
                  )}
                </span>
              </div>
              <div style={{ height: 22, background: 'var(--sunk)', borderRadius: 6 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(f.total / maiorEtapa) * 100}%`,
                    minWidth: f.total ? 4 : 0,
                    background: f.travados ? 'var(--red)' : 'var(--green)',
                    borderRadius: 6,
                  }}
                />
              </div>
            </button>
          ))}
          {gargalo && gargalo.travados > 0 && (
            <div
              style={{
                background: 'var(--amber-soft)',
                color: 'var(--amber-ink)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 13,
              }}
            >
              Gargalo em <strong>{gargalo.etapa}</strong>: {gargalo.travados} de {gargalo.total}{' '}
              passaram do prazo de {gargalo.sla} dias.
            </div>
          )}
        </section>

        <section className="cartao">
          <h2 className="titulo-secao">Por executivo</h2>
          {executivos.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>
              Nenhum executivo com carteira e perfil vinculado ao HubSpot.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 0', fontWeight: 700 }}>Executivo</th>
                  <th style={{ fontWeight: 700 }}>Abertos</th>
                  <th style={{ fontWeight: 700 }}>Travados</th>
                  <th style={{ fontWeight: 700 }}>Meta/dia</th>
                </tr>
              </thead>
              <tbody>
                {executivos.map((e) => (
                  <tr
                    key={e.ownerId}
                    onClick={() => setExecAberto(e)}
                    style={{ borderTop: '1px solid var(--line-soft)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '8px 0', fontWeight: 700 }}>{e.nome}</td>
                    <td>{e.abertos}</td>
                    <td style={{ color: e.travados ? 'var(--red)' : 'var(--muted)', fontWeight: 700 }}>
                      {e.travados}
                    </td>
                    <td style={{ color: e.meta == null ? 'var(--ter)' : undefined }}>
                      {e.meta ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Sem esta linha, somar a coluna "Abertos" nao bate com o KPI "Em
              aberto" — e o pior: ninguem vai atras desses leads, porque eles
              nao aparecem na carteira de ninguem. */}
          {dados.semDonoAtivo.total > 0 && (
            <button
              onClick={() => setSemDonoAberto(true)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginTop: 12,
                background: 'var(--amber-soft)',
                color: 'var(--amber-ink)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '9px 12px',
                fontSize: 13,
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              <strong>{dados.semDonoAtivo.total} leads sem dono ativo</strong> — carteira de quem
              foi desativado. Contam no “Em aberto” acima e não aparecem em nenhuma linha desta
              tabela. Ver quais →
            </button>
          )}
        </section>
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
        Dados lidos do Supabase ao vivo ·{' '}
        {dados.atualizadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>

      <Drawer
        aberto={etapaAberta != null}
        titulo={etapaAberta ?? ''}
        subtitulo={`${leadsDaEtapa.length} leads · ${leadsDaEtapa.filter((l) => l.travado).length} acima do SLA`}
        aoFechar={() => setEtapaAberta(null)}
      >
        <ListaDeLeads leads={leadsDaEtapa} />
      </Drawer>

      <Drawer
        aberto={execAberto != null}
        titulo={execAberto?.nome ?? ''}
        subtitulo={
          execAberto
            ? `${execAberto.abertos} abertos · ${execAberto.travados} travados${
                execAberto.meta != null ? ` · meta ${execAberto.meta} visitas/dia` : ''
              }`
            : ''
        }
        aoFechar={() => setExecAberto(null)}
      >
        {execAberto && execAberto.travados > 0 && (
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
            Comece pelos <strong>{execAberto.travados} travados</strong> — estão listados primeiro.
          </div>
        )}
        <ListaDeLeads leads={leadsDoExec} />
      </Drawer>

      <Drawer
        aberto={semDonoAberto}
        titulo="Leads sem dono ativo"
        subtitulo={`${dados.semDonoAtivo.total} leads · ${dados.semDonoAtivo.leads.filter((l) => l.travado).length} acima do SLA`}
        aoFechar={() => setSemDonoAberto(false)}
      >
        <div
          style={{
            background: 'var(--amber-soft)',
            color: 'var(--amber-ink)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          São leads cujo dono no HubSpot está desativado. Enquanto o dono não mudar lá, eles
          continuam invisíveis na carteira de todo mundo — inclusive na rota do dia.
        </div>
        <ListaDeLeads leads={dados.semDonoAtivo.leads} />
      </Drawer>
    </>
  );
}
