// Pino do mapa do executivo (prancha "Mapa do Executivo", Claude Design, 15/10/26). O nome do
// arquivo ficou para não mexer em quem importa.
//
// HTML puro dentro do conteúdo do AdvancedMarkerElement, e não Views do react-native-web: com
// centenas de pinos na tela é o DOM que pesa no celular.
//
// É a função pin() da prancha (a especificação executável), com uma diferença de propósito: cada
// tamanho tem +4 px. Em 26/09 o Julyan pediu os pinos maiores ("executivo de 40 anos, no sol, não
// enxerga") e os da prancha (22–26 px) são os que sumiam. A hierarquia é a da prancha:
//   próxima porta (halo vermelho) › selecionado › parada do plano › recém ≤ 30 d › lead Q › M/F ›
//   recém 31–90 d. O tamanho diz o PAPEL.
// Famílias: lead = círculo na cor da temperatura com a letra; recém-aberto = o ÚNICO losango, preto
// e branco (o vértice de baixo é a ponta), com os dias dentro; mais avaliado = roxo com a nota;
// cliente = verde com o T; ex-cliente = rosa com ↺.
// Modificadores: colega 55% e anel fino; sem dono, anel tracejado amarelo; aproximado, círculo
// tracejado em volta da coordenada; no máximo UM selo (cobrar › ↑ esperando sinal › ↓ em queda).
//
// Geometria: caixa de toque 48 × 56; a coordenada é a ponta, em (24, 54). Quem usa passa
// anchor={ANCORA_PINO_P2}.
import React from 'react';
import { Image } from 'react-native';

import { COR, type Pino } from '../utils/pinoP2';

const CAIXA_W = 48;
const CAIXA_H = 56;
const PONTA_Y = 54;
export const ANCORA_PINO_P2 = { x: 0.5, y: PONTA_Y / CAIXA_H };

/** +4 px em cada tamanho da prancha (ver o topo). */
const MAIS = 4;
const VERMELHO_ACAO = '#E51A31';

export type PapelPino = 'proxima' | 'plano' | 'lente';

type Props = {
  pino: Pino;
  papel: PapelPino;
  planoNumero?: number | null;
  visitado?: boolean;
  naFila?: boolean;
  selecionado?: boolean;
  /** O nome cabe sem cobrir outro nome (rotulosSemSobrepor). */
  rotulo?: boolean;
  /** Lado do nome: 'esq' quando à direita bateria em outro. */
  lado?: 'dir' | 'esq';
  /** Segunda linha do rótulo (dono às 15h · Demo, cobrar · 12 dias, aberto há 9 dias). */
  sinal?: string | null;
  /** Pilha: quantos pinos este representa. >1 vira o círculo escuro com o número. */
  pilhaN?: number;
  /** Cor do anel da pilha: a do membro mais prioritário. */
  pilhaCor?: string;
  /** Leque aberto: deslocamento do pino em relação ao ponto real. */
  leque?: { dx: number; dy: number } | null;
  /** Tema claro do mapa (modo sol): o losango e o rótulo invertem. */
  sol?: boolean;
  /** Mostra o círculo tracejado do "aproximado" (selecionado ou zoom de rua). */
  aproximadoVisivel?: boolean;
  /** Conta-alvo no Meu dia: pino pequeno e transparente, para estar no mapa sem poluir. */
  discreto?: boolean;
};

const LOGO = require('../../assets/takeat-t-branco.png');

type Desenho = {
  s: number; bg: string; fg: string; tx: string; fs: number; diam: boolean; bw: number; bst: 'solid' | 'dashed'; bc: string;
  op: number; logo: boolean; lw: number; halo: boolean; badge: { t: string; bg: string; fg: string } | null;
  /** Brilho em volta do recém-aberto (chama o olho sem crescer o pino). */
  brilho: boolean;
};

/** A função pin() da prancha, com +4 px. */
export function desenhoDoPino(p: Props): Desenho {
  const { pino, papel, planoNumero, visitado, naFila, selecionado, pilhaN = 1, pilhaCor, discreto = false } = p;
  /* o recém-aberto é limão neon nos dois temas (era preto e branco e sumia); o "oco" (61–90 dias)
     inverte: fundo escuro, borda e número limão */
  const rec = { bg: COR.rec, fg: COR.recTinta, bd: COR.recTinta, oco: '#121417' };
  let s = 24; let bg: string = pino.cor; let fg = '#FFFFFF'; let tx = pino.glifo; let fs = 11; let diam = false;
  let bw = 2.5; let bst: 'solid' | 'dashed' = 'solid'; let bc = '#FFFFFF'; let op = 1; let logo = false; let lw = 0; let halo = false;
  const f = pino.familia;
  if (f === 'lead') { s = pino.temp === 'Q' ? 26 : pino.temp === 'M' ? 24 : 22; fs = s >= 24 ? 11 : 10; }
  if (f === 'rec') {
    const d = pino.abertoHa ?? 0;
    diam = true; s = d <= 30 ? 23 : d <= 60 ? 20 : 18; bg = rec.bg; fg = rec.fg; bw = 2; bc = rec.bd; tx = String(d); fs = d <= 30 ? 12 : 11;
    if (d > 60) { bg = rec.oco; fg = rec.bg; bc = rec.bg; bw = 2.5; }
  }
  if (f === 'av' || f === 'alvo') { s = 26; tx = pino.nota != null ? pino.nota.toFixed(1).replace('.', ',') : ''; fs = 10; }
  if (f === 'cli') { s = 24; logo = true; lw = 13; tx = ''; }
  if (f === 'ex') { s = 24; tx = '↺'; fs = 13; }
  const feito = !!visitado;
  if (planoNumero) {
    s = feito ? 24 : 32; tx = feito ? '✓' : String(planoNumero); fs = feito ? 12 : 14; logo = false;
    if (f === 'rec') { s = feito ? 18 : 25; bg = rec.bg; fg = rec.fg; bc = rec.bd; bw = 2; fs = feito ? 11 : 13; }
  } else if (feito) {
    // visitado hoje fora do plano: o mesmo desenho da parada feita
    s = f === 'rec' ? 18 : 24; tx = '✓'; fs = f === 'rec' ? 11 : 12; logo = false;
    if (f === 'rec') { bg = rec.bg; fg = rec.fg; bc = rec.bd; bw = 2; }
  }
  if (feito) op = 0.5;
  if (papel === 'proxima') {
    s = 40; fs = 16; halo = true; op = 1;
    if (f === 'rec') { s = 30; bg = rec.bg; fg = rec.fg; bc = rec.bd; bw = 2; tx = planoNumero ? String(planoNumero) : String(pino.abertoHa ?? ''); fs = 15; }
  }
  if (selecionado) {
    s = 44; fs = planoNumero ? 16 : f === 'rec' ? 13 : 14; op = 1;
    if (f === 'rec') { s = 32; fs = 15; bg = rec.bg; fg = rec.fg; bc = rec.bd; bw = 2; }
    if (f === 'cli') lw = 22;
  }
  // cliente é carteira da empresa (pinoP2 o marca como colega quando não tem vendedor): não desbota
  // o recém-aberto não desbota (é o pino que tem de chamar o olho; o gestor vê os de todo o time)
  if (pino.dono === 'colega' && f !== 'cli' && f !== 'rec' && !selecionado && papel !== 'proxima') { op = Math.min(op, 0.55); bw = 1.5; s -= 2; }
  if (pino.dono === 'sem' && f !== 'cli') { bst = 'dashed'; bc = '#FACC15'; bw = 2.5; }
  if (pilhaN > 1) { s = 32; bg = '#111418'; bw = 3; bst = 'solid'; bc = pilhaCor ?? pino.cor; tx = String(pilhaN); fs = 13; logo = false; diam = false; fg = '#FFFFFF'; op = 1; }
  /* CONTA-ALVO DISCRETA (Julyan, 15/10/26: "as contas-alvo podem ficar mais transparentes, mas
     precisamos ter os pins, sem poluir"): bolinha de 16 px, sem número, a 40%. Ao tocar, no plano
     ou como próxima porta, volta ao pino inteiro. */
  const quieto = discreto && !planoNumero && !selecionado && papel !== 'proxima' && pilhaN <= 1;
  if (quieto) { s = 12; tx = ''; op = 0.4; bw = 1.5; bst = 'solid'; bc = '#FFFFFF'; logo = false; }
  const brilho = f === 'rec' && pilhaN <= 1 && !feito && !quieto;
  let badge: Desenho['badge'] = null;
  if (pilhaN <= 1 && !quieto) {
    if (pino.etiqueta?.texto === 'cobrar') badge = { t: 'cobrar', bg: '#111418', fg: '#FCD34D' };
    else if (naFila) badge = { t: '↑', bg: '#F59E0B', fg: '#111418' };
    else if (pino.queda) badge = { t: '↓', bg: '#F59E0B', fg: '#111418' };
  }
  return { s: s + MAIS, bg, fg, tx, fs, diam, bw, bst, bc, op, logo, lw, halo, badge, brilho };
}

function PinoP2(props: Props) {
  const { pino, selecionado, sinal, pilhaN = 1, leque = null, sol = false, rotulo = false, lado = 'dir', aproximadoVisivel = false } = props;
  const d = desenhoDoPino(props);
  const hd = d.diam ? d.s * Math.SQRT1_2 : d.s / 2;
  // centro do desenho em relação à coordenada (a ponta)
  const cy = d.diam ? -hd - 1 : -7 - d.s / 2;
  const comNome = !leque && (selecionado || props.papel === 'proxima' || rotulo);
  const tipCor = d.bst === 'dashed' ? '#FFFFFF' : d.bc;
  const halo = 66 + MAIS;
  const aprox = 90;
  return (
    <div style={{ position: 'relative', width: CAIXA_W, height: CAIXA_H, cursor: 'pointer' }}>
      <div style={{ position: 'absolute', left: CAIXA_W / 2, top: PONTA_Y, width: 0, height: 0, zIndex: selecionado ? 5 : 2 }}>
        {pino.aproximado && (aproximadoVisivel || selecionado) && !leque && (
          <div style={{
            position: 'absolute', left: -aprox / 2, top: -aprox / 2, width: aprox, height: aprox, boxSizing: 'border-box',
            borderRadius: '50%', background: 'rgba(140,140,140,.16)', border: `2px dashed ${sol ? '#111418' : '#F4F5F7'}`, pointerEvents: 'none',
          }} />
        )}
        {leque && (
          <div style={{
            position: 'absolute', left: 0, top: 0, height: 1.5, background: sol ? 'rgba(17,20,24,.6)' : 'rgba(255,255,255,.7)', transformOrigin: '0 0',
            width: Math.hypot(leque.dx, leque.dy), transform: `rotate(${Math.atan2(leque.dy, leque.dx)}rad)`, pointerEvents: 'none',
          }} />
        )}
        <div style={{ position: 'absolute', left: leque?.dx ?? 0, top: leque?.dy ?? 0, width: 0, height: 0, opacity: d.op }}>
          {d.halo && (
            <div style={{
              position: 'absolute', left: -halo / 2, top: cy - halo / 2, width: halo, height: halo, boxSizing: 'border-box',
              borderRadius: '50%', border: `3px solid ${VERMELHO_ACAO}`, background: 'rgba(229,26,49,.16)', pointerEvents: 'none',
            }} />
          )}
          {!d.diam && (
            <div style={{
              position: 'absolute', left: -5, top: -8, width: 0, height: 0,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `8px solid ${tipCor}`,
            }} />
          )}
          <div style={{
            position: 'absolute', left: -d.s / 2, top: cy - d.s / 2, width: d.s, height: d.s, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: d.diam ? 4 : '50%', background: d.bg, border: `${d.bw}px ${d.bst} ${d.bc}`, color: d.fg,
            fontWeight: 700, fontSize: d.fs, lineHeight: 1, letterSpacing: '-.02em',
            boxShadow: d.brilho ? '0 0 0 4px rgba(200,243,29,.35), 0 0 14px rgba(200,243,29,.55), 0 2px 5px rgba(0,0,0,.4)' : '0 2px 5px rgba(0,0,0,.4)',
            transform: d.diam ? 'rotate(45deg)' : undefined,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', transform: d.diam ? 'rotate(-45deg)' : undefined }}>
              {d.logo
                ? <Image source={LOGO} style={{ width: d.lw + MAIS / 2, height: Math.round((d.lw + MAIS / 2) * 288 / 227) }} resizeMode="contain" fadeDuration={0} accessibilityLabel="Takeat" />
                : d.tx}
            </span>
          </div>
          {d.badge && (
            <div style={{
              position: 'absolute', left: hd - 9, top: cy - hd - 8, height: 18, padding: '0 6px', boxSizing: 'border-box',
              borderRadius: 9, background: d.badge.bg, color: d.badge.fg, border: '1.5px solid #FFFFFF',
              fontWeight: 700, fontSize: 11, lineHeight: '15px', whiteSpace: 'nowrap',
            }}>{d.badge.t}</div>
          )}
          {comNome && (
            <div style={{
              position: 'absolute', top: cy - (sinal ? 19 : 11), ...(lado === 'esq' ? { right: Math.round(hd + 6) } : { left: Math.round(hd + 6) }),
              display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap', pointerEvents: 'none',
              padding: '3px 9px', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,.25)',
              background: sol ? 'rgba(255,255,255,.96)' : 'rgba(23,25,29,.94)', border: `1px solid ${sol ? '#D9D4CA' : 'rgba(255,255,255,.14)'}`,
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25, color: sol ? '#111418' : '#F4F5F7' }}>
                {pilhaN > 1 ? `${pino.nome} +${pilhaN - 1}` : pino.nome}
              </span>
              {!!sinal && (
                <span style={{ fontWeight: 600, fontSize: 11.5, lineHeight: 1.25, color: sol ? '#414852' : 'rgba(255,255,255,.74)' }}>{sinal}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(PinoP2);

/** A segunda linha do rótulo: cobrar › dias sem toque (lead), "aberto há N dias" (recém-aberto). */
export function sinalDoPino(p: Pino): string | null {
  if (p.familia === 'rec' && p.abertoHa != null) return p.abertoHa === 0 ? 'abriu hoje' : `aberto há ${p.abertoHa} ${p.abertoHa === 1 ? 'dia' : 'dias'}`;
  const t = p.etiqueta?.texto ?? '';
  if (t === 'cobrar') return 'cobrar · prazo da etapa estourou';
  const m = t.match(/^(\d+)d parado$/);
  if (m) return `${m[1]} dias sem toque`;
  return null;
}
