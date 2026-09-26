// Anel da área (handoff v4.1 §5 "Densidade e escala"). Toma o lugar do
// amontoado: um anel de 46 px com a proporção de cada cor (conic-gradient)
// e o número no miolo de 34 px. Tocar abre a quadra na folha de baixo, com
// área, composição e o melhor candidato primeiro — o mapa fica limpo.
// Centro do anel na coordenada do amontoado: anchor { x: 0.5, y: 0.5 }.
import React from 'react';

import type { ResumoQuadra } from '../utils/quadra';

export const ANCORA_QUADRA = { x: 0.5, y: 0.5 };

// Ordem fixa das fatias: a mesma da legenda, para o anel ler igual em todo lugar.
const ORDEM = ['#E23B3B', '#F5A524', '#0EA5E9', '#16A34A', '#EC4899', '#8B5CF6', '#4B5563', '#6B7280'];

export function gradienteDoAnel(cores: string[]): string {
  const total = cores.length || 1;
  const cont = new Map<string, number>();
  for (const c of cores) cont.set(c, (cont.get(c) ?? 0) + 1);
  const chaves = [...cont.keys()].sort((a, b) => {
    const ia = ORDEM.indexOf(a); const ib = ORDEM.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  let acc = 0;
  const partes = chaves.map((c) => {
    const ini = (acc / total) * 360;
    acc += cont.get(c) ?? 0;
    return `${c} ${ini.toFixed(1)}deg ${((acc / total) * 360).toFixed(1)}deg`;
  });
  return `conic-gradient(${partes.join(',')})`;
}

export default function CartaoQuadra({ resumo, n, cores }: { resumo: ResumoQuadra; n: number; cores: string[] }) {
  return (
    <div
      role="button"
      aria-label={`${resumo.area}: ${n} pinos, ${resumo.composicao}. Abrir a lista da área`}
      style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      <div style={{
        width: 46, height: 46, borderRadius: '50%', background: gradienteDoAnel(cores),
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.5)',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: '#14171C',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Poppins, system-ui, sans-serif', fontWeight: 800, fontSize: n > 99 ? 11 : 13, color: '#FFFFFF',
        }}>{n}</div>
      </div>
    </div>
  );
}
