// Rotas — o gestor ve, edita e monta a rota de cada vendedor.
//
// A grade responde "quem tem plano pra este dia?"; o drawer edita a rota de
// UMA pessoa. Toda mudanca recarrega o quadro: sem estado otimista, porque o
// vendedor pode estar mexendo na mesma rota pelo app agora.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SLOT_CABECALHO } from '../App';
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
import {
  carteiraNoMapa,
  coordenadasPorId,
  type PontoNoMapa,
} from '../dados/rotas';
import { carregarGoogleMaps, MAP_ID } from '../dados/mapa';
import { diaBRT, ehDiaUtil } from '../dados/datas';

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
  const [erroMapa, setErroMapa] = useState<string | null>(null);
  const mapaDivRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<any>(null);
  const marcadoresRef = useRef<any[]>([]);
  const linhaRef = useRef<any>(null);
  const ajustouEnquadreRef = useRef(false);

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

  // ===== O MAPA DO EDITOR ====================================================
  // Pin cinza = lead da carteira (clique ADICIONA a rota).
  // Pin vermelho numerado = parada da rota (clique REMOVE).
  // Linha vermelha liga as paradas na ordem — e' proposta comercial; quem
  // otimiza por estrada e' o app do vendedor.
  useEffect(() => {
    if (!aberta) {
      ajustouEnquadreRef.current = false;
      mapaRef.current = null;
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const gm = await carregarGoogleMaps();
        if (cancelado || !mapaDivRef.current) return;

        if (!mapaRef.current) {
          const escuro = document.documentElement.dataset.theme === 'dark' ||
            (document.documentElement.dataset.theme == null &&
             window.matchMedia('(prefers-color-scheme: dark)').matches);
          mapaRef.current = new gm.Map(mapaDivRef.current, {
            center: { lat: -20.32, lng: -40.34 },
            zoom: 11,
            mapId: MAP_ID,
            colorScheme: escuro ? 'DARK' : 'LIGHT',
            disableDefaultUI: true,
            zoomControl: true,
          });
        }
        const mapa = mapaRef.current;

        const [carteira, coordsParadas] = await Promise.all([
          aberta.membro.ownerId ? carteiraNoMapa(aberta.membro.ownerId) : Promise.resolve([] as PontoNoMapa[]),
          coordenadasPorId(aberta.paradas.map((par) => par.clientId)),
        ]);
        if (cancelado) return;

        // limpa a rodada anterior
        for (const m of marcadoresRef.current) m.map = null;
        marcadoresRef.current = [];
        linhaRef.current?.setMap(null);

        const naRota = new Map(aberta.paradas.map((par) => [par.clientId, par]));
        const { AdvancedMarkerElement } = await gm.importLibrary('marker');

        const pino = (cor: string, texto: string, borda: string) => {
          const el = document.createElement('div');
          el.style.cssText =
            `width:26px;height:26px;border-radius:50%;background:${cor};color:#fff;` +
            `display:flex;align-items:center;justify-content:center;font:700 12px Poppins,sans-serif;` +
            `border:2px solid ${borda};box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;`;
          el.textContent = texto;
          return el;
        };

        // paradas: vermelhas, numeradas, clique remove
        const pontosDaLinha: any[] = [];
        for (const par of aberta.paradas) {
          const c = coordsParadas.get(par.clientId);
          if (!c) continue;
          pontosDaLinha.push({ lat: c.lat, lng: c.lon });
          const m = new AdvancedMarkerElement({
            map: mapa,
            position: { lat: c.lat, lng: c.lon },
            content: pino('#C8131B', String(par.posicao), '#fff'),
            title: `${par.posicao}. ${par.nome} — clique para tirar da rota`,
            gmpClickable: true,
          });
          m.addListener('gmp-click', () => executa(() => removerParada(par.id)));
          marcadoresRef.current.push(m);
        }

        // carteira fora da rota: cinza, clique adiciona
        for (const ponto of carteira) {
          if (naRota.has(ponto.id)) continue;
          const m = new AdvancedMarkerElement({
            map: mapa,
            position: { lat: ponto.lat, lng: ponto.lon },
            content: pino('#7A7A7A', '+', 'rgba(255,255,255,.8)'),
            title: `${ponto.nome} (${ponto.etapa ?? 'sem etapa'}) — clique para adicionar`,
            gmpClickable: true,
          });
          m.addListener('gmp-click', () =>
            adicionar({ id: ponto.id, nome: ponto.nome, etapa: ponto.etapa, cidade: null }),
          );
          marcadoresRef.current.push(m);
        }

        linhaRef.current = new gm.Polyline({
          map: mapa,
          path: pontosDaLinha,
          strokeColor: '#C8131B',
          strokeOpacity: 0.7,
          strokeWeight: 3,
        });

        // enquadra UMA vez por vendedor — reenquadrar a cada clique faria o
        // mapa pular embaixo do mouse
        if (!ajustouEnquadreRef.current) {
          const todos = [...pontosDaLinha, ...carteira.map((pt) => ({ lat: pt.lat, lng: pt.lon }))];
          if (todos.length) {
            const b = new gm.LatLngBounds();
            todos.forEach((pt) => b.extend(pt));
            mapa.fitBounds(b, 48);
            ajustouEnquadreRef.current = true;
          }
        }
        setErroMapa(null);
      } catch (e: any) {
        if (!cancelado) setErroMapa(e?.message ?? String(e));
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta]);

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

  const slot = typeof document === 'undefined' ? null : document.getElementById(SLOT_CABECALHO);

  return (
    <>
      {/* O navegador de dia e' filtro global de periodo: por isso vive no
          cabecalho da casca, e nao dentro do banner da tela. O estado continua
          aqui — o portal so' muda onde ele aparece no DOM. */}
      {slot &&
        createPortal(
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button style={botaoSec} onClick={() => setDia(somaDias(dia, -1))} aria-label="Dia anterior">‹</button>
            <span style={{ fontWeight: 700, minWidth: 90, textAlign: 'center' }}>{rotuloDia(dia, hoje)}</span>
            <button style={botaoSec} onClick={() => setDia(somaDias(dia, 1))} aria-label="Próximo dia">›</button>
            {dia !== hoje && <button style={botaoSec} onClick={() => setDia(hoje)}>hoje</button>}
          </div>,
          slot,
        )}
      <div style={{ background: 'var(--dark)', color: 'var(--dark-ink)', borderRadius: 14, padding: '20px 22px', marginBottom: 18 }}>
        <div style={{ color: 'var(--dark-mut)', marginTop: 4 }}>
          {quadro == null
            ? 'Carregando…'
            : !ehDiaUtil(dia)
              ? 'Dia não útil — rota aqui é exceção, não cobrança.'
              : `${comRota} de ${total} com rota montada. Clique num vendedor para editar ou montar a dele.`}
        </div>
      </div>

      {aberta == null && (
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
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Montar rota →</div>
              )}
            </div>
          </button>
        ))}
      </div>

      )}

      {aberta != null && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <button style={botaoSec} onClick={() => setAberta(null)}>‹ Todos os vendedores</button>
            <span style={{ fontWeight: 800, fontSize: 16 }}>Rota · {aberta.membro.nome}</span>
            <span style={{ color: 'var(--ter)', fontSize: 13 }}>
              {rotuloDia(dia, hoje)} · {aberta.paradas.length} paradas
            </span>
          </div>

          {/* Mapa a esquerda, controles a direita: montar rota E' olhar o mapa.
              Pin cinza (+) adiciona; pin vermelho numerado remove; a linha
              liga as paradas na ordem proposta. */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {erroMapa ? (
                <div className="cartao" style={{ borderColor: 'var(--red)' }}>
                  <strong>O mapa não carregou.</strong>
                  <div style={{ color: 'var(--muted)', marginTop: 6, fontSize: 13 }}>{erroMapa}</div>
                </div>
              ) : (
                <div
                  ref={mapaDivRef}
                  style={{
                    // 64 do cabecalho + 24+24 de padding do envoltorio + o banner escuro.
                    height: 'calc(100vh - 300px)',
                    minHeight: 480,
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid var(--line)',
                  }}
                />
              )}
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                Cinza = carteira dele (clique adiciona) · vermelho numerado = parada (clique tira) ·
                a linha é a ordem proposta, não o trajeto por estradas.
              </div>
            </div>
            <div style={{ flex: '0 0 400px', overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
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
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {[a.etapa, a.cidade].filter(Boolean).join(' · ')}</span>
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
            </div>
          </div>
        </>
      )}

    </>
  );
}
