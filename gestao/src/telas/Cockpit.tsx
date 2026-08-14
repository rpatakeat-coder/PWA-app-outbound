// Cockpit do gestor — a home dele.
//
// Responde "onde eu ajo hoje?" (02-FUNCIONALIDADES.md). Nesta primeira fatia
// vertical entram os tres blocos que sustentam a resposta: faixa de KPIs,
// funil por etapa com gargalo, e a lista por executivo.
//
// Regras do doc respeitadas aqui:
//  - Nivel 1 acima da dobra: KPI + funil + quem esta' travado.
//  - Um unico bloco escuro por tela (o banner).
//  - Vermelho so' pra acao e alerta; estado usa pill, nunca fundo inteiro.
//  - Janela de tempo sempre rotulada junto do numero.
//  - Numero nunca chumbado: sem dado, estado vazio honesto.
import { useEffect, useState } from 'react';
import { carregarCockpit, type DadosCockpit } from '../dados/cockpit';

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
        {janela && (
          <span style={{ color: 'var(--ter)', fontWeight: 600 }}> · {janela}</span>
        )}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          marginTop: 4,
          color:
            tom === 'alerta' ? 'var(--red)' : tom === 'bom' ? 'var(--green)' : 'var(--ink)',
        }}
      >
        {valor}
      </div>
    </div>
  );
}

export function Cockpit() {
  const [dados, setDados] = useState<DadosCockpit | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    carregarCockpit().then(setDados).catch((e) => setErro(e.message ?? String(e)));
  }, []);

  if (erro) {
    return (
      <div className="envoltorio">
        <div className="cartao" style={{ borderColor: 'var(--red)' }}>
          <strong>Não consegui carregar os dados.</strong>
          <div style={{ color: 'var(--muted)', marginTop: 6 }}>{erro}</div>
        </div>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="envoltorio">
        <div className="cartao">Carregando o time…</div>
      </div>
    );
  }

  const { kpis, funil, executivos } = dados;
  const maiorEtapa = Math.max(...funil.map((f) => f.total), 1);
  // O gargalo e' a etapa com mais travados — e' onde a acao do gestor rende
  // mais. Empate desempata pelo volume.
  const gargalo = [...funil].sort((a, b) => b.travados - a.travados || b.total - a.total)[0];

  return (
    <div className="envoltorio">
      {/* Unico bloco escuro da tela */}
      <div
        style={{
          background: 'var(--dark)',
          color: 'var(--dark-ink)',
          borderRadius: 14,
          padding: '20px 22px',
          marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800 }}>Time</div>
        <div style={{ color: 'var(--dark-mut)', marginTop: 4 }}>
          {kpis.travados > 0 ? (
            <>
              <strong style={{ color: 'var(--dark-ink)' }}>
                {kpis.travados} leads acima do SLA
              </strong>{' '}
              — o gargalo está em <strong style={{ color: 'var(--dark-ink)' }}>
                {gargalo?.etapa}
              </strong>
              , com {gargalo?.travados} parados.
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
          rotulo="Meta do time"
          // Sem meta cadastrada mostramos travessão, nao zero: zero leria como
          // "a meta e' zero" em vez de "ninguem definiu meta".
          valor={kpis.metaDoTime != null ? String(kpis.metaDoTime) : '—'}
          janela={kpis.metaDoTime == null ? 'sem meta definida' : 'mês'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18 }}>
        <section className="cartao">
          <h2 className="titulo-secao">Funil por etapa</h2>
          {funil.map((f) => (
            <div key={f.etapa} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  {f.etapa}
                  {f.sla && (
                    <span style={{ color: 'var(--ter)', fontWeight: 600 }}> · SLA {f.sla}d</span>
                  )}
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
            </div>
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
                marginTop: 4,
              }}
            >
              Gargalo em <strong>{gargalo.etapa}</strong>: {gargalo.travados} de {gargalo.total}{' '}
              passaram do prazo de {gargalo.sla} dias.
            </div>
          )}
        </section>

        <section className="cartao">
          <h2 className="titulo-secao">Por executivo</h2>
          {executivos.length === 0 && (
            <div style={{ color: 'var(--muted)' }}>
              Nenhum executivo com carteira e perfil vinculado ao HubSpot.
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th style={{ padding: '6px 0', fontWeight: 700 }}>Executivo</th>
                <th style={{ fontWeight: 700 }}>Abertos</th>
                <th style={{ fontWeight: 700 }}>Travados</th>
                <th style={{ fontWeight: 700 }}>Fechados</th>
              </tr>
            </thead>
            <tbody>
              {executivos.map((e) => (
                <tr key={e.ownerId} style={{ borderTop: '1px solid var(--line-soft)' }}>
                  <td style={{ padding: '8px 0', fontWeight: 700 }}>{e.nome}</td>
                  <td>{e.abertos}</td>
                  <td style={{ color: e.travados ? 'var(--red)' : 'var(--muted)', fontWeight: 700 }}>
                    {e.travados}
                  </td>
                  <td>{e.fechadosNoMes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div style={{ color: 'var(--ter)', fontSize: 12, marginTop: 16 }}>
        Dados lidos do Supabase ao vivo ·{' '}
        {dados.atualizadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>
    </div>
  );
}
