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

/**
 * Cor de cada etapa do funil. E' DADO, e nao decoracao: a fonte e'
 * src/constants/stages.ts do app de campo, que pinta os pins do mapa com estas
 * mesmas cores. Vem copiada porque o cockpit e' um projeto Vite separado e nao
 * importa do app.
 *
 * Pintar toda barra de vermelho apagava a informacao de etapa e brigava com o
 * vermelho de "travados", que e' alerta. Aqui a cor diz QUAL etapa; o vermelho
 * dentro da barra diz QUANTO travou.
 */
const COR_DA_ETAPA: Record<string, string> = {
  'Prospecção': '#3b82f6',
  'Conversa com decisor': 'var(--violet-text)',
  'Demo/Proposta': '#FFB32F',
  'Negociação': '#f97316',
  'Ag. Pagamento': '#0ea5e9',
};

/**
 * Cartao de KPI em TRES linhas: rotulo, valor, qualificador.
 *
 * O valor e' SEMPRE --ink. Colorir o numero (39 vermelho, 1 verde) fazia a cor
 * competir com o proprio numero; quem carrega o julgamento e' o qualificador
 * embaixo. E com o qualificador em linha propria os cinco cartoes ficam da
 * mesma altura — colado no rotulo, o quinto quebrava em tres linhas e
 * desalinhava o numero.
 */
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
      {janela && (
        <div
          style={{
            fontSize: 12,
            lineHeight: '16px',
            letterSpacing: '0.4px',
            marginTop: 2,
            color: tom === 'alerta' ? 'var(--red)' : tom === 'bom' ? 'var(--green)' : 'var(--ter)',
          }}
        >
          {janela}
        </div>
      )}
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

/** Iniciais pro avatar da linha: no maximo duas letras. */
function iniciaisDe(nome: string): string {
  return (nome || '?')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function LinhaExecutivo({ exec, aoAbrir }: { exec: Executivo; aoAbrir: () => void }) {
  const numero = (valor: number | null, cor: string) => (
    <td
      style={{
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 14,
        lineHeight: '20px',
        fontWeight: 600,
        color: cor,
        padding: '8px 0',
        borderBottom: '1px solid var(--line-soft)',
      }}
    >
      {valor ?? '—'}
    </td>
  );
  return (
    <tr onClick={aoAbrir} style={{ cursor: 'pointer' }}>
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
            {iniciaisDe(exec.nome)}
          </span>
          {/* Nome truncado: sem isto um nome longo empurra as tres colunas de
              numero e a grade deixa de alinhar entre as linhas. */}
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
            {exec.nome}
          </span>
        </div>
      </td>
      {numero(exec.abertos, exec.abertos ? 'var(--muted)' : 'var(--ter)')}
      {numero(exec.travados, exec.travados ? 'var(--red)' : 'var(--ter)')}
      {numero(exec.meta, exec.meta ? 'var(--muted)' : 'var(--ter)')}
    </tr>
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
  const [mostrarSemAtividade, setMostrarSemAtividade] = useState(false);

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
  // Quem nao tem lead aberto nao ajuda a decidir onde agir; fica atras do botao.
  const comAtividade = executivos.filter((e) => e.abertos > 0);
  const semAtividade = executivos.filter((e) => e.abertos === 0);
  const visiveis = mostrarSemAtividade ? executivos : comAtividade;
  const maiorEtapa = Math.max(...funil.map((f) => f.total), 1);
  const gargalo = [...funil].sort((a, b) => b.travados - a.travados || b.total - a.total)[0];

  return (
    <>
      {/* Faixa de destaque. --ink sobre --bg: os dois tokens se invertem
          sozinhos no tema escuro, entao a faixa vira clara com texto escuro sem
          precisar de par proprio. A parte forte e' peso 700 na MESMA cor — cor
          diferente aqui competiria com o vermelho dos alertas. */}
      <div
        style={{
          background: 'var(--ink)',
          color: 'var(--bg)',
          borderRadius: 8,
          padding: '14px 20px',
          marginBottom: 18,
          fontSize: 14,
          lineHeight: '20px',
          letterSpacing: '0.25px',
        }}
      >
        {kpis.travados > 0 ? (
          <>
            <strong style={{ fontWeight: 700 }}>{kpis.travados} leads acima do SLA</strong> — o
            gargalo está em <strong style={{ fontWeight: 700 }}>{gargalo?.etapa}</strong>, com{' '}
            {gargalo?.travados} parados.
          </>
        ) : (
          'Nenhum lead acima do SLA agora. O funil está em dia.'
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: 16,
          alignItems: 'stretch',
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

      {/* align-items:start pra o cartao do funil nao esticar ate' a altura do
          vizinho — o vao vazio embaixo da nota do gargalo era isso. */}
      <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 20, alignItems: 'start' }}>
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
                padding: '0 0 10px',
                cursor: f.total ? 'pointer' : 'default',
                font: 'inherit',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                {/* Rotulo de eixo, nao titulo: 12/600 --muted. Em 14/700 --ink
                    ele competia com o numero que a barra existe pra mostrar. */}
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: '16px',
                    letterSpacing: '0.5px',
                    fontWeight: 600,
                    color: 'var(--muted)',
                  }}
                >
                  {f.etapa}
                  {f.sla && <span style={{ color: 'var(--ter)', fontWeight: 500 }}> · SLA {f.sla}d</span>}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: '16px',
                    letterSpacing: '0.5px',
                    fontWeight: 600,
                    color: 'var(--ter)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.total}
                  {f.travados > 0 && (
                    <span style={{ color: 'var(--red)' }}> · {f.travados} travados</span>
                  )}
                </span>
              </div>
              <div
                style={{ height: 20, background: 'var(--sunk)', borderRadius: 4, overflow: 'hidden' }}
              >
                {/* O preenchimento e' a cor da ETAPA; o bloco vermelho no fim
                    dele e' a parcela travada. justify-content:flex-end encosta o
                    bloco na ponta da barra, que e' onde a leitura procura. */}
                <div
                  style={{
                    height: '100%',
                    width: `${(f.total / maiorEtapa) * 100}%`,
                    minWidth: f.total ? 4 : 0,
                    background: COR_DA_ETAPA[f.etapa] ?? 'var(--muted)',
                    borderRadius: 4,
                    display: 'flex',
                    justifyContent: 'flex-end',
                  }}
                >
                  {f.travados > 0 && (
                    <div
                      style={{
                        width: `${(f.travados / f.total) * 100}%`,
                        background: 'var(--red)',
                        borderRadius: '0 4px 4px 0',
                      }}
                    />
                  )}
                </div>
              </div>
            </button>
          ))}
          {gargalo && gargalo.travados > 0 && (
            <div
              style={{
                background: 'var(--amber-soft)',
                color: 'var(--amber-ink)',
                borderRadius: 4,
                padding: '10px 12px',
                marginTop: 12,
                fontSize: 14,
                lineHeight: '20px',
                letterSpacing: '0.25px',
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
            <>
              {/* `table-layout: fixed` da' as colunas de 88px que o desenho pede
                  sem trocar a tabela por divs — o cabecalho continua sendo
                  <th>, e o nome longo trunca em vez de empurrar os numeros. */}
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                }}
              >
                <colgroup>
                  <col />
                  <col style={{ width: 88 }} />
                  <col style={{ width: 88 }} />
                  <col style={{ width: 88 }} />
                </colgroup>
                <thead>
                  <tr>
                    {['Executivo', 'Abertos', 'Travados', 'Meta/dia'].map((c, i) => (
                      <th
                        key={c}
                        style={{
                          fontSize: 11,
                          lineHeight: '16px',
                          letterSpacing: '0.5px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color: 'var(--ter)',
                          textAlign: i === 0 ? 'left' : 'right',
                          paddingBottom: 8,
                          borderBottom: '1px solid var(--line)',
                        }}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((e) => (
                    <LinhaExecutivo key={e.ownerId} exec={e} aoAbrir={() => setExecAberto(e)} />
                  ))}
                </tbody>
              </table>

              {/* Sete executivos com atividade e oito linhas zeradas faziam a
                  tabela passar do rodape da janela — o gestor rolava por nada. */}
              {semAtividade.length > 0 && (
                <button
                  onClick={() => setMostrarSemAtividade((v) => !v)}
                  style={{
                    marginTop: 12,
                    height: 32,
                    padding: '0 12px',
                    border: '1px solid var(--line-btn)',
                    borderRadius: 4,
                    background: 'var(--panel)',
                    color: 'var(--muted)',
                    fontSize: 12,
                    lineHeight: '16px',
                    letterSpacing: '0.5px',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {mostrarSemAtividade
                    ? 'Ocultar sem atividade'
                    : `Mostrar ${semAtividade.length} sem atividade`}
                </button>
              )}
            </>
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
