// Pino Takeat v4.1 "limpo" do app de campo (handoff §5). O nome do arquivo
// ficou para não mexer em quem importa.
//
// HTML puro dentro do conteúdo do AdvancedMarkerElement, e não Views do
// react-native-web: com centenas de pinos na tela é o DOM que pesa no celular.
//
// O tamanho diz o PAPEL do pino, não a temperatura:
//   próxima porta do plano 38 px (halo vermelho, nome + 1 sinal) ·
//   parada do plano 30 px (selo com o nº) · qualquer outro da lente 24 px
//   (sem selo, sem nome) · selecionado 42 px (halo branco + nome).
// Visitado hoje fica a 55% com ✓; fora da lente, 22%.
// No máximo UM selo, no canto superior direito, e ele depende da lente:
//   Meu dia: ✓ feito › nº do plano › ↑ na fila · Carteira: Q/M/F ·
//   Contas-alvo: ★ nota do Google. Nunca dois, nunca à esquerda.
//
// Geometria: caixa de toque 48 × 52; a coordenada é a ponta branca, em
// (24, 50). Quem usa passa anchor={ANCORA_PINO_P2}.
import React from 'react';
import { Image } from 'react-native';

import type { Lente } from '../utils/lentes';
import type { Pino } from '../utils/pinoP2';

const CAIXA_W = 48;
const CAIXA_H = 52;
const PONTA_Y = 50;
export const ANCORA_PINO_P2 = { x: 0.5, y: PONTA_Y / CAIXA_H };

export type PapelPino = 'proxima' | 'plano' | 'lente';

type Props = {
  pino: Pino;
  papel: PapelPino;
  lente: Lente;
  planoNumero?: number | null;
  visitado?: boolean;
  naFila?: boolean;
  selecionado?: boolean;
  /** Fora da lente atual (zoom de rua mostra todos inteiros): 22%. */
  foraDaLente?: boolean;
  /** Segunda linha do rótulo (dono às 15h › cobrar › ICP › dias sem toque). */
  sinal?: string | null;
  /** Pilha (C11): quantos pinos este representa. >1 mostra o número e "Nome +N". */
  pilhaN?: number;
  /** Leque aberto (C11): deslocamento do pino em relação ao ponto real. */
  leque?: { dx: number; dy: number } | null;
  /** Modo sol: rótulo em fundo branco; o disco não muda. */
  sol?: boolean;
};

const LOGO = require('../../assets/takeat-t-branco.png');

type Selo = { texto: string; fundo: string; tinta: string };

function seloDoPino(p: Props): Selo | null {
  const { pino, lente, planoNumero, visitado, naFila } = p;
  if (lente === 'carteira') {
    return pino.tipo === 'lead' && pino.temp && pino.temp !== 'X' && pino.temp !== '?'
      ? { texto: pino.glifo, fundo: '#111418', tinta: '#FFFFFF' } : null;
  }
  if (lente === 'alvo') {
    return pino.tipo === 'alvo' && pino.nota
      ? { texto: `★${pino.nota.toFixed(1).replace('.', ',')}`, fundo: '#111418', tinta: '#FACC15' } : null;
  }
  if (visitado) return { texto: '✓', fundo: '#16A34A', tinta: '#FFFFFF' };
  if (planoNumero) return { texto: String(planoNumero), fundo: '#FFFFFF', tinta: '#111418' };
  if (naFila) return { texto: '↑', fundo: '#F5A524', tinta: '#111418' };
  return null;
}

function PinoP2(props: Props) {
  const { pino, papel, selecionado, foraDaLente, visitado, sinal, pilhaN = 1, leque = null, sol = false } = props;
  const emPilha = pilhaN > 1;
  const d = selecionado ? 42 : papel === 'proxima' ? 38 : papel === 'plano' ? 30 : 24;
  const semDono = pino.dono === 'sem' && pino.tipo !== 'alvo';
  const aro = semDono ? '2.5px dashed #FACC15' : '2.5px solid #FFFFFF';
  const halo = selecionado
    ? '0 0 0 6px rgba(255,255,255,.35),'
    : papel === 'proxima' ? '0 0 0 5px rgba(229,26,49,.45),' : '';
  const opacidade = foraDaLente && !selecionado ? 0.22 : visitado && !selecionado ? 0.55 : 1;
  const selo = emPilha ? null : seloDoPino(props);
  const comNome = !leque && (selecionado || papel === 'proxima');
  const topoDisco = -8 - d; // ponta de 8 px + disco
  const logoW = Math.round(d * 0.56);

  return (
    <div style={{ position: 'relative', width: CAIXA_W, height: CAIXA_H, cursor: 'pointer' }}>
      <div style={{ position: 'absolute', left: CAIXA_W / 2, top: PONTA_Y, width: 0, height: 0, zIndex: selecionado ? 5 : 2 }}>
        {pino.aproximado && selecionado && (
          <div style={{
            position: 'absolute', left: -30, top: -30, width: 60, height: 60, boxSizing: 'border-box',
            borderRadius: '50%', background: 'rgba(250,204,21,.10)', border: '1.5px dashed rgba(250,204,21,.8)',
            pointerEvents: 'none',
          }} />
        )}
        {leque && (
          <div style={{
            position: 'absolute', left: 0, top: 0, height: 1.5, background: 'rgba(255,255,255,.7)', transformOrigin: '0 0',
            width: Math.hypot(leque.dx, leque.dy), transform: `rotate(${Math.atan2(leque.dy, leque.dx)}rad)`, pointerEvents: 'none',
          }} />
        )}
        <div style={{ position: 'absolute', left: leque?.dx ?? 0, top: leque?.dy ?? 0, width: 0, height: 0, opacity: opacidade }}>
          {/* ponta branca 10 × 8: o vértice é a coordenada */}
          <div style={{
            position: 'absolute', left: -5, top: -8, width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `8px solid ${semDono ? '#FACC15' : '#FFFFFF'}`,
          }} />
          <div style={{
            position: 'absolute', left: -d / 2, top: topoDisco, width: d, height: d, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', background: pino.cor, border: aro,
            boxShadow: `${halo}0 2px 6px rgba(0,0,0,.5)${sol ? ',0 0 0 1px #000' : ''}`,
          }}>
            {emPilha
              ? <span style={{ fontWeight: 800, fontSize: 13, lineHeight: 1, color: '#fff' }}>{pilhaN}</span>
              : <Image source={LOGO} style={{ width: logoW, height: Math.round(logoW * 288 / 227) }} resizeMode="contain" fadeDuration={0} accessibilityLabel="Takeat" />}
          </div>
          {selo && (
            <div style={{
              position: 'absolute', left: d / 2 - 8, top: topoDisco - 5, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box',
              borderRadius: 9, background: selo.fundo, color: selo.tinta, border: '1.5px solid #fff',
              fontWeight: 700, fontSize: 10.5, lineHeight: '15px', textAlign: 'center', whiteSpace: 'nowrap',
            }}>{selo.texto}</div>
          )}
          {comNome && (
            <div style={{
              position: 'absolute', left: d / 2 + 8, top: topoDisco + d / 2 - (sinal ? 17 : 10),
              display: 'flex', flexDirection: 'column', gap: 1, whiteSpace: 'nowrap', pointerEvents: 'none',
              padding: '3px 7px', borderRadius: 7,
              background: sol ? 'rgba(255,255,255,.95)' : 'rgba(10,12,15,.82)',
            }}>
              <span style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.25, color: sol ? '#111418' : '#FFFFFF' }}>
                {emPilha ? `${pino.nome} +${pilhaN - 1}` : pino.nome}
              </span>
              {!!sinal && (
                <span style={{ fontWeight: 600, fontSize: 11, lineHeight: 1.2, color: sol ? '#92400E' : '#FCD34D' }}>{sinal}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(PinoP2);

// Sinal do rótulo, na prioridade do handoff §5: dono às 15h › cobrar › ICP ›
// dias sem toque, mais "decisor ?". Hoje o app sabe o "cobrar" e o tempo sem
// toque; horário do dono, ICP e decisor entram com a colheita nova (fase 5).
export function sinalDoPino(p: Pino): string | null {
  const t = p.etiqueta?.texto ?? '';
  if (t === 'cobrar') return 'cobrar · SLA estourado';
  const m = t.match(/^(\d+)d parado$/);
  if (m) return `${m[1]} dias sem toque`;
  return null;
}
