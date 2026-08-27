// Rotas — o gestor ve, edita e monta a rota de cada vendedor.
//
// A grade responde "quem tem plano pra este dia?"; o drawer edita a rota de
// UMA pessoa. Toda mudanca recarrega o quadro: sem estado otimista, porque o
// vendedor pode estar mexendo na mesma rota pelo app agora.
import { useEffect, useMemo, useState } from 'react';
import {
  carregarQuadro,
  garantirRota,
  adicionarParada,
  removerParada,
  trocarPosicao,
  buscarLeads,
  sugerirParadas,
  type QuadroDeRotas,
  type RotaDoVendedor,
  type LeadParaRota,
} from '../dados/rotas';
import { diaBRT, ehDiaUtil } from '../dados/datas';
import { Drawer } from '../componentes/Drawer';

function somaDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function rotuloDia(dia: string, hoje: string): string {
  if (dia === hoje) return 'hoje';
  if (dia === somaDias(hoje, 1)) return 'amanhã';
  const d = new Date(`${dia}T12:00:00Z`);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).replace('.', '');
}

const botaoSec = {
  border: '1px solid var(--line-btn)', background: 'var(--panel2)', borderRadius: 8,
  padding: '7px 12px', font: 'inherit', fontWeight: 700, fontSize: 13,
  cursor: 'pointer', color: 'var(--ink)',
} as const;

export function Rotas() {
  const hoje = diaBRT(new Date());
  const [dia, setDia] = useState(hoje);
  const [quadro, setQuadro] = useState<QuadroDeRotas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<RotaDoVendedor | null>(null);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<LeadParaRota[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = (d = dia) =>
    carregarQuadro(d)
      .then((q) => {
        setQuadro(q);
        // mantem o drawer sincronizado com o que acabou de vir do banco
        setAberta((atual) => (atual ? q.linhas.find((l) => l.membro.perfilId === atual.membro.perfilId) ?? null : null));
      })
      .catch((e) => setErro(e.message ?? String(e)));

  useEffect(() => { setQuadro(null); recarregar(dia); }, [dia]);

  // busca com atraso curto: digitou, esperou 300ms, buscou
  useEffect(() => {
    if (busca.trim().length < 2) { setAchados([]); return; }
    const t = setTimeout(() => buscarLeads(busca).then(setAchados), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const proximaPosicao = useMemo(
    () => (aberta ? Math.max(0, ...aberta.paradas.map((p) => p.posicao)) + 1 : 1),
    [aberta],
  );

  const executa = async (fn: () => Promise<string | null | void>) => {
    setOcupado(true); setAviso(null);
    const e = await fn();
    if (typeof e === 'string') setAviso(e);
    await recarregar();
    setOcupado(false);
  };

  const adicionar = (lead: LeadParaRota) =>
    executa(async () => {
      if (!aberta) return null;
      let rotaId = aberta.rota?.id;
      if (!rotaId) {
        const r = await garantirRota(aberta.membro.perfilId, dia);
        if ('erro' in r) return r.erro;
        rotaId = r.id;
      }
      const e = await adicionarParada(rotaId, lead.id, proximaPosicao);
      if (!e) { setBusca(''); setAchados([]); }
      return e;
    });

  const sugerir = () =>
    executa(async () => {
      if (!aberta) return null;
      if (!aberta.membro.ownerId) return 'Este vendedor não tem carteira no HubSpot para sugerir a partir dela.';
      const leads = await sugerirParadas(aberta.membro.ownerId, new Set(aberta.paradas.map((p) => p.clientId)));
      if (leads.length === 0) return 'Nenhum lead com coordenada sobrou na carteira dele.';
      let rotaId = aberta.rota?.id;
      if (!rotaId) {
        const r = await garantirRota(aberta.membro.perfilId, dia);
        if ('erro' in r) return r.erro;
        rotaId = r.id;
      }
      let pos = proximaPosicao;
      for (const l of leads) {
        const e = await adicionarParada(rotaId, l.id, pos++);
        if (e && !/já está/.test(e)) return e;
      }
      return null;
    });

  if (erro) {
    return (
      <div className="cartao" style={{ borderColor: 'var(--red)' }}>
        <strong>Não consegui carregar as rotas.</strong>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{erro}</div>
      </div>
    );
  }

  const comRota = quadro?.linhas.filter((l) => l.paradas.length > 0).length ?? 0;
  const total = quadro?.linhas.length ?? 0;

  return (
    <>
      <div style={{ background: 'var(--dark)', color: 'var(--dark-ink)', borderRadius: 14, padding: '20px 22px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>Rotas do time</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button style={botaoSec} onClick={() => setDia(somaDias(dia, -1))}>‹</button>
            <span style={{ fontWeight: 700, minWidth: 90, textAlign: 'center' }}>{rotuloDia(dia, hoje)}</span>
            <button style={botaoSec} onClick={() => setDia(somaDias(dia, 1))}>›</button>
            {dia !== hoje && <button style={botaoSec} onClick={() => setDia(hoje)}>hoje</button>}
          </div>
        </div>
        <div style={{ color: 'var(--dark-mut)', marginTop: 4 }}>
          {quadro == null
            ? 'Carregando…'
            : !ehDiaUtil(dia)
              ? 'Dia não útil — rota aqui é exceção, não cobrança.'
              : `${comRota} de ${total} com rota montada. Clique num vendedor para editar ou montar a dele.`}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {quadro?.linhas.map((l) => (
          <button
            key={l.membro.perfilId}
            onClick={() => { setAviso(null); setBusca(''); setAchados([]); setAberta(l); }}
            className="cartao"
            style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', padding: '13px 15px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 800 }}>{l.membro.nome}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: l.paradas.length ? 'var(--green)' : 'var(--ter)' }}>
                {l.paradas.length
                  ? `${l.paradas.filter((p) => p.status === 'done').length}/${l.paradas.length} feitas`
                  : 'sem rota'}
              </span>
            </div>
            {l.rota?.source === 'suggested' && l.paradas.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--amber-ink)', marginTop: 2 }}>montada pela gestão</div>
            )}
            <div style={{ marginTop: 8 }}>
              {l.paradas.slice(0, 4).map((p) => (
                <div key={p.id} style={{ fontSize: 12.5, color: p.status === 'done' ? 'var(--green)' : 'var(--muted)', padding: '2px 0' }}>
                  {p.posicao}. {p.nome}
                </div>
              ))}
              {l.paradas.length > 4 && (
                <div style={{ fontSize: 12, color: 'var(--ter)' }}>+ {l.paradas.length - 4} paradas</div>
              )}
              {l.paradas.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--ter)' }}>Montar rota →</div>
              )}
            </div>
          </button>
        ))}
      </div>

      <Drawer
        aberto={aberta != null}
        titulo={aberta ? `Rota · ${aberta.membro.nome}` : ''}
        subtitulo={`${rotuloDia(dia, hoje)} · ${aberta?.paradas.length ?? 0} paradas`}
        aoFechar={() => setAberta(null)}
      >
        {aberta && (
          <>
            {aviso && (
              <div style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
                {aviso}
              </div>
            )}

            {aberta.paradas.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--line-soft)' }}>
                <span style={{ width: 22, fontWeight: 800, color: 'var(--ter)', fontSize: 13 }}>{p.posicao}.</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: p.status === 'done' ? 'var(--green)' : 'var(--ink)' }}>
                  {p.nome}{p.status === 'done' ? ' ✓' : ''}
                </span>
                <button style={{ ...botaoSec, padding: '3px 9px' }} disabled={ocupado || i === 0}
                  onClick={() => executa(() => trocarPosicao(aberta.paradas[i], aberta.paradas[i - 1]))}>↑</button>
                <button style={{ ...botaoSec, padding: '3px 9px' }} disabled={ocupado || i === aberta.paradas.length - 1}
                  onClick={() => executa(() => trocarPosicao(aberta.paradas[i], aberta.paradas[i + 1]))}>↓</button>
                <button style={{ ...botaoSec, padding: '3px 9px', color: 'var(--red)' }} disabled={ocupado}
                  onClick={() => executa(() => removerParada(p.id))}>✕</button>
              </div>
            ))}
            {aberta.paradas.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>
                Sem rota para {rotuloDia(dia, hoje)}. Busque leads abaixo ou use a sugestão.
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar lead por nome ou empresa…"
                style={{ width: '100%', font: 'inherit', padding: '9px 11px', border: '1px solid var(--line-btn)', borderRadius: 8, background: 'var(--panel2)', color: 'var(--ink)' }}
              />
              {achados.map((a) => (
                <button key={a.id} disabled={ocupado} onClick={() => adicionar(a)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: '7px 2px', borderTop: '1px solid var(--line-soft)' }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>+ {a.nome}</span>
                  <span style={{ color: 'var(--ter)', fontSize: 12 }}> · {[a.etapa, a.cidade].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>

            <button disabled={ocupado} onClick={sugerir}
              style={{ ...botaoSec, width: '100%', marginTop: 14, padding: '11px 14px', background: 'var(--red)', color: '#fff', border: 'none' }}>
              {ocupado ? 'Trabalhando…' : 'Sugerir paradas da carteira dele'}
            </button>
            <div style={{ fontSize: 12, color: 'var(--ter)', marginTop: 8 }}>
              A sugestão prioriza etapa mais avançada e quem nunca foi visitado. A ordem é proposta
              comercial — o vendedor reordena no app, que otimiza por estradas de verdade. Para ele,
              esta rota aparece como “sugerida”.
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
