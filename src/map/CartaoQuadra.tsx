// Resumo de quadra no mapa (prompt final, Parte A §5 "Densidade e zoom").
//
// Toma o lugar da pilha grande: em vez de um pino com "31", um cartão com a
// área, a composição e o melhor candidato. Mesmo desenho do pino (HTML puro,
// corpo escuro #14171C), para não brigar com ele no mapa escuro. A ponta de
// baixo fica na coordenada do amontoado: anchor { x: 0.5, y: 1 }.
import React from 'react';

import type { ResumoQuadra } from '../utils/quadra';

export const ANCORA_QUADRA = { x: 0.5, y: 1 };

export default function CartaoQuadra({ resumo, n }: { resumo: ResumoQuadra; n: number }) {
  return (
    <div
      role="button"
      aria-label={`${resumo.area}: ${resumo.composicao}. Abrir a lista da quadra`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', fontFamily: 'Poppins, system-ui, sans-serif' }}
    >
      <div
        style={{
          minWidth: 132, maxWidth: 200, padding: '6px 10px', borderRadius: 10,
          background: '#14171C', border: '1.5px solid rgba(255,255,255,.28)',
          boxShadow: '0 3px 8px rgba(0,0,0,.55)', color: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{resumo.area}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#C9CED6' }}>{n}</span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#C9CED6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{resumo.composicao}</div>
        {resumo.melhor && (
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#FDE68A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${resumo.melhor.texto} ›`}</div>
        )}
      </div>
      {/* ponta: a coordenada do amontoado */}
      <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid #14171C' }} />
    </div>
  );
}
