// Pino "Disco Takeat" do mapa novo (prompt final §6, direção final; substitui
// a "gota escura + anel" P2 — o nome do arquivo ficou para não mexer em quem
// importa).
//
// HTML puro dentro do conteúdo do AdvancedMarkerElement, e não Views do
// react-native-web: cada View vira vários nós com classes geradas, e com
// centenas de pinos na tela é o DOM que pesa no celular.
//
// Geometria: a caixa externa é a área de toque de 48 × 52 px e a coordenada
// do lead fica em (24, 50) — a ponta do triângulo embaixo do disco. Quem usa
// passa anchor={ANCORA_PINO_P2} para o <Marker>.
//
// Leitura do pino, uma camada por pergunta:
//   cor do disco = temperatura / tipo (legenda de hoje);
//   aro          = dono (branco = meu, fino = colega, tracejado amarelo = sem dono);
//   selo direito = UMA coisa: nº do plano › Q/M/F › ↺ › ★ nota;
//   selo esquerdo = ✓ visitado hoje · ↑ na fila (sem sinal).
// A logo é marca, não informação: nenhum estado depende dela.
import React from 'react';
import { Image } from 'react-native';

import type { Pino } from '../utils/pinoP2';

const CAIXA_W = 48;
const CAIXA_H = 52;
const PONTA_Y = 50; // y da coordenada dentro da caixa
export const ANCORA_PINO_P2 = { x: 0.5, y: PONTA_Y / CAIXA_H };

type Props = {
  pino: Pino;
  planoNumero?: number | null;
  visitado?: boolean;
  naFila?: boolean;
  selecionado?: boolean;
  /** Etiqueta com nome e tempo (a conta-alvo só tem na lente dela ou selecionada). */
  comEtiqueta?: boolean;
  /** Lente Contas-alvo: a conta-alvo volta a ter 34 px, com nome e nota. */
  nomeDeAlvo?: boolean;
  /** Lado do nome (prompt final C1): direita, ou esquerda quando não cabe. */
  ladoNome?: 'dir' | 'esq';
  /** Pilha (C11): quantos pinos este representa. >1 mostra o número e "Nome +N". */
  pilhaN?: number;
  /** Leque aberto (C11): deslocamento do pino em relação ao ponto real. */
  leque?: { dx: number; dy: number } | null;
  /** Modo sol: o disco não muda; só o aro ganha 1 px preto por fora. */
  sol?: boolean;
};

const LOGO = require('../../assets/takeat-t-branco.png');

const LETRA_COR: Record<string, string> = { Q: '#FCA5A5', M: '#FCD34D', F: '#7DD3FC', '?': '#E5E7EB' };

function PinoP2({ pino, planoNumero, visitado, naFila, selecionado, comEtiqueta = true, nomeDeAlvo = false, ladoNome = 'dir', pilhaN = 1, leque = null, sol = false }: Props) {
  const emPilha = pilhaN > 1;
  const alvo = pino.tipo === 'alvo';
  const d = selecionado ? 42 : alvo && !nomeDeAlvo ? 26 : 34;

  // Aro = dono. Conta-alvo não tem dono: aro fino branco a 85%.
  const aro = alvo
    ? { largura: 1.5, estilo: 'solid', cor: 'rgba(255,255,255,.85)' }
    : pino.dono === 'sem'
      ? { largura: 2.5, estilo: 'dashed', cor: '#FACC15' }
      : pino.dono === 'colega'
        ? { largura: 1.5, estilo: 'solid', cor: 'rgba(255,255,255,.75)' }
        : { largura: 2.5, estilo: 'solid', cor: '#FFFFFF' };
  const opacidade = pino.dono === 'colega' && !alvo ? Math.min(pino.opacidade, 0.85) : pino.opacidade;

  // Selo direito: uma coisa só, nesta prioridade.
  const letra = pino.tipo === 'lead' && pino.temp && pino.temp !== 'X' ? pino.glifo : '';
  const selo: { texto: string; fundo: string; tinta: string; aro: boolean } | null = planoNumero
    ? { texto: String(planoNumero), fundo: '#FFFFFF', tinta: '#111111', aro: false }
    : letra
      ? { texto: letra, fundo: '#14171C', tinta: LETRA_COR[pino.temp ?? '?'] ?? '#E5E7EB', aro: true }
      : pino.tipo === 'ex'
        ? { texto: '↺', fundo: '#14171C', tinta: '#F9A8D4', aro: true }
        : alvo && pino.nota
          ? { texto: `★${pino.nota.toFixed(1).replace('.', ',')}`, fundo: '#14171C', tinta: '#FDE68A', aro: true }
          : null;

  const mostraEtiqueta = !leque && comEtiqueta && (!alvo || selecionado || nomeDeAlvo || emPilha);
  // C1: o tempo só aparece se decide algo — hoje, cobrar ou mais de 7 dias.
  const t = pino.etiqueta?.texto ?? '';
  const mostraTempo = !!pino.etiqueta && (t === 'hoje' || t === 'cobrar' || t.includes('parado'));
  const esq = ladoNome === 'esq';

  // Tudo abaixo é posicionado a partir da ponta (0,0 = coordenada do lead).
  const topoDisco = -7 - d; // ponta de 7 px + disco
  const logoW = Math.round(d * 0.56);

  return (
    <div style={{ position: 'relative', width: CAIXA_W, height: CAIXA_H, cursor: 'pointer' }}>
      <div style={{ position: 'absolute', left: CAIXA_W / 2, top: PONTA_Y, width: 0, height: 0, zIndex: selecionado ? 5 : 2 }}>
        {pino.aproximado && (
          <div style={{
            position: 'absolute', left: -30, top: -30, width: 60, height: 60, boxSizing: 'border-box',
            borderRadius: '50%', background: 'rgba(250,204,21,.10)', border: '1.5px dashed rgba(250,204,21,.8)',
            pointerEvents: 'none',
          }} />
        )}
        {leque && (
          // linha fina do ponto real até a ponta do pino no leque
          <div style={{
            position: 'absolute', left: 0, top: 0, height: 1.5, background: 'rgba(255,255,255,.7)', transformOrigin: '0 0',
            width: Math.hypot(leque.dx, leque.dy), transform: `rotate(${Math.atan2(leque.dy, leque.dx)}rad)`, pointerEvents: 'none',
          }} />
        )}
        <div style={{ position: 'absolute', left: leque?.dx ?? 0, top: leque?.dy ?? 0, width: 0, height: 0, opacity: opacidade }}>
          {/* ponta: triângulo 10 × 7 na cor do aro; o vértice é a coordenada */}
          <div style={{
            position: 'absolute', left: -5, top: -7, width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${aro.cor}`,
            filter: sol ? 'drop-shadow(0 0 0.5px #000)' : undefined,
          }} />
          {/* disco */}
          <div style={{
            position: 'absolute', left: -d / 2, top: topoDisco, width: d, height: d, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', background: pino.cor, border: `${aro.largura}px ${aro.estilo} ${aro.cor}`,
            boxShadow: (selecionado ? '0 0 0 5px rgba(255,255,255,.3),0 2px 6px rgba(0,0,0,.5)' : '0 2px 6px rgba(0,0,0,.5)')
              + (sol ? ',0 0 0 1px #000' : ''),
          }}>
            {emPilha
              ? <span style={{ fontWeight: 900, fontSize: 14, lineHeight: 1, color: '#fff' }}>{pilhaN}</span>
              : <Image source={LOGO} style={{ width: logoW, height: Math.round(logoW * 288 / 227) }} resizeMode="contain" fadeDuration={0} accessibilityLabel="Takeat" />}
          </div>
          {selo && (
            <div style={{
              position: 'absolute', left: d / 2 - 9, top: topoDisco - 5, minWidth: 17, height: 17, padding: '0 4px', boxSizing: 'border-box',
              borderRadius: 9, background: selo.fundo, color: selo.tinta, border: selo.aro ? '1.5px solid #fff' : 'none',
              fontWeight: 900, fontSize: 10, lineHeight: selo.aro ? '14px' : '17px', textAlign: 'center', whiteSpace: 'nowrap',
              boxShadow: '0 1px 3px rgba(0,0,0,.6)',
            }}>{selo.texto}</div>
          )}
          {(visitado || naFila) && (
            <div style={{
              position: 'absolute', left: -d / 2 - 8, top: topoDisco - 5, width: 17, height: 17, boxSizing: 'border-box', borderRadius: '50%',
              background: naFila ? '#121417' : '#16A34A', border: naFila ? '2px dashed #F59E0B' : '2px solid #fff',
              color: '#fff', fontWeight: 800, fontSize: 9, lineHeight: '13px', textAlign: 'center',
            }}>{naFila ? '↑' : '✓'}</div>
          )}
          {mostraEtiqueta && (
            <div style={{
              position: 'absolute', ...(esq ? { right: d / 2 + 6, alignItems: 'flex-end' } : { left: d / 2 + 6 }), top: topoDisco + d / 2 - 12,
              display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              <span style={{ fontWeight: 800, fontSize: 11, lineHeight: 1.1, color: sol ? '#111' : '#fff', textShadow: sol ? '0 0 2px #fff,0 0 4px #fff,0 0 6px #fff' : '0 1px 2px #000,0 0 5px #000' }}>{emPilha ? `${pino.nome} +${pilhaN - 1}` : pino.nome}</span>
              {mostraTempo && pino.etiqueta && (
                <span style={{
                  alignSelf: esq ? 'flex-end' : 'flex-start', fontWeight: 800, fontSize: 9.5, lineHeight: 1, padding: '2px 5px', borderRadius: 4,
                  background: pino.etiqueta.fundo, color: pino.etiqueta.tinta,
                }}>{pino.etiqueta.texto}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(PinoP2);
