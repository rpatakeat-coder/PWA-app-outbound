// Pino "gota escura + anel" (mapa novo, entrega 2; prancha §6, direção P2).
//
// HTML puro dentro do conteúdo do AdvancedMarkerElement, e não Views do
// react-native-web: cada View vira vários nós com classes geradas, e com
// centenas de pinos na tela é o DOM que pesa no celular. Aqui são ~6 nós por
// pino, com estilo inline copiado do protótipo da prancha.
//
// Geometria: a caixa externa é a área de toque de 44 × 48 px e a coordenada
// do lead fica em (22, 44) — o ponto vermelho da ponta. Quem usa passa
// anchor={{ x: 0.5, y: 44 / 48 }} para o <Marker>.
import React from 'react';
import { Image } from 'react-native';

import type { Pino } from '../utils/pinoP2';

export const ANCORA_PINO_P2 = { x: 0.5, y: 44 / 48 };

type Props = {
  pino: Pino;
  planoNumero?: number | null;
  visitado?: boolean;
  naFila?: boolean;
  selecionado?: boolean;
  /** Etiqueta com nome e tempo (a prancha esconde na conta-alvo fora da lente dela). */
  comEtiqueta?: boolean;
  /** Na lente Contas-alvo a conta-alvo também ganha nome (fora dela, só selecionada). */
  nomeDeAlvo?: boolean;
  /** Lado do nome (prompt final C1): direita, ou esquerda quando não cabe. */
  ladoNome?: 'dir' | 'esq';
};

const LOGO = require('../../assets/pin-logo.png');

function PinoP2({ pino, planoNumero, visitado, naFila, selecionado, comEtiqueta = true, nomeDeAlvo = false, ladoNome = 'dir' }: Props) {
  const pequeno = pino.tipo === 'alvo';
  const w = pequeno ? 26 : 32;
  const anel = pino.dono === 'sem'
    ? '3px dashed #FACC15'
    : `${pino.dono === 'colega' ? 2 : 3}px solid ${pino.cor}`;
  const topoSelo = -w * 1.2 - 12;
  const mostraEtiqueta = comEtiqueta && (!pequeno || selecionado || nomeDeAlvo);
  // C1: o tempo só aparece se decide algo — hoje, cobrar ou mais de 7 dias.
  const t = pino.etiqueta?.texto ?? '';
  const mostraTempo = !!pino.etiqueta && (t === 'hoje' || t === 'cobrar' || t.includes('parado'));
  const esq = ladoNome === 'esq';

  return (
    <div style={{ position: 'relative', width: 44, height: 48, cursor: 'pointer' }}>
      {/* ponto da coordenada */}
      <div style={{ position: 'absolute', left: 22, top: 44, width: 0, height: 0, zIndex: selecionado ? 5 : 2 }}>
        {pino.aproximado && (
          <div style={{
            position: 'absolute', left: -30, top: -50, width: 60, height: 60, boxSizing: 'border-box',
            borderRadius: '50%', background: 'rgba(250,204,21,.10)', border: '1.5px dashed rgba(250,204,21,.75)',
            pointerEvents: 'none',
          }} />
        )}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `scale(${selecionado ? 1.25 : 1})`, transformOrigin: '0 0' }}>
          <div style={{
            position: 'absolute', left: -w / 2, top: -w * 1.2, width: w, height: w, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: pequeno ? 'rgba(20,23,28,.85)' : '#14171C', border: anel,
            borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', opacity: pino.opacidade,
            boxShadow: selecionado ? '0 0 0 5px rgba(255,255,255,.35),0 3px 10px rgba(0,0,0,.6)' : '0 3px 8px rgba(0,0,0,.55)',
          }}>
            <div style={{ transform: 'rotate(45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {pino.logo
                ? <Image source={LOGO} style={{ width: 14, height: 18 }} resizeMode="contain" fadeDuration={0} accessibilityLabel="Cliente Takeat" />
                : !!pino.glifo && <span style={{ fontWeight: 900, fontSize: 15, lineHeight: 1, color: pino.cor }}>{pino.glifo}</span>}
            </div>
          </div>
          <div style={{ position: 'absolute', left: -3, top: -3, width: 6, height: 6, borderRadius: '50%', background: '#E51A31', boxShadow: '0 0 0 2px #0E1116' }} />
          {!!planoNumero && (
            <div style={{
              position: 'absolute', left: 6, top: topoSelo, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box',
              borderRadius: 9, background: '#fff', color: '#111', fontWeight: 800, fontSize: 11, lineHeight: '18px',
              textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.6)',
            }}>{planoNumero}</div>
          )}
          {(visitado || naFila) && (
            <div style={{
              position: 'absolute', left: -22, top: topoSelo, width: 17, height: 17, boxSizing: 'border-box', borderRadius: '50%',
              background: naFila ? '#121417' : '#16A34A', border: naFila ? '2px dashed #F59E0B' : '2px solid #121417',
              color: '#fff', fontWeight: 800, fontSize: 9, lineHeight: '13px', textAlign: 'center',
            }}>{naFila ? '↑' : '✓'}</div>
          )}
          {mostraEtiqueta && (
            <div style={{
              position: 'absolute', ...(esq ? { right: 18, alignItems: 'flex-end' } : { left: 18 }), top: -w * 1.2 + 2, display: 'flex', flexDirection: 'column', gap: 2,
              whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              <span style={{ fontWeight: 800, fontSize: 11, lineHeight: 1.1, color: '#fff', textShadow: '0 1px 2px #000,0 0 5px #000' }}>{pino.nome}</span>
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
