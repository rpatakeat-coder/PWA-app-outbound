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
// Modificadores: colega 55% e anel fino; sem dono, anel tracejado amarelo; aproximado, sem círculo (saiu em 04/11/26);
// no máximo UM selo (cobrar › ↑ esperando sinal › ↓ em queda).
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
  /** Sem uso desde 04/11/26: o círculo tracejado do "aproximado" saiu do mapa (pedido do Julyan). */
  aproximadoVisivel?: boolean;
  /** Conta-alvo no Meu dia: pino pequeno e transparente, para estar no mapa sem poluir. */
  discreto?: boolean;
  /* ── O MAPA NA RUA (prancha "Mapa na rua", 02/11/26), só no celular ──────────────────────
     Com `nivel`, o desenho é o da prancha: N1 = pino 40 com anel sólido de 52 px; N2 = o tamanho
     de hoje; N3 = 4 px menor, sem nome. Sem `nivel` (computador), o desenho de antes. */
  nivel?: 1 | 2 | 3 | null;
  /** O rótulo que niveisDoMapa conseguiu colocar (lado, nome e, no N1, a 2ª linha). */
  rotuloNaRua?: { lado: 'dir' | 'esq' | 'acima'; nome: string; linha2: string | null } | null;
  /** No máximo um selo, só de ação: ! cobrar, ↓ em queda. */
  seloNaRua?: '!' | '↓' | null;
  /** N1 sem plano (a porta sugerida): anel neutro na cor do texto, não vermelho. */
  sugestao?: boolean;
  /** Zoom afastado: o N1 fica pino inteiro, sem o anel. */
  semAnel?: boolean;
  /** O leque de outra pilha está aberto: o resto do mapa fica a 30%. */
  apagado?: boolean;
  /** id do pino no DOM (data-pino): a conferência na tela mede a cabeça e a ponta por ele. */
  idDom?: string;
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
  /* o recém-aberto é limão neon nos dois temas (era preto e branco e sumia) */
  const rec = { bg: COR.rec, fg: COR.recTinta, bd: COR.recTinta };
  let s = 24; let bg: string = pino.cor; let fg = '#FFFFFF'; let tx = pino.glifo; let fs = 11; let diam = false;
  let bw = 2.5; let bst: 'solid' | 'dashed' = 'solid'; let bc = '#FFFFFF'; let op = 1; let logo = false; let lw = 0; let halo = false;
  const f = pino.familia;
  if (f === 'lead') { s = pino.temp === 'Q' ? 26 : pino.temp === 'M' ? 24 : 22; fs = s >= 24 ? 11 : 10; }
  if (f === 'rec') {
    const d = pino.abertoHa ?? 0;
    diam = true; s = d <= 30 ? 23 : d <= 60 ? 20 : 18; bg = rec.bg; fg = rec.fg; bw = 2; bc = rec.bd; tx = String(d); fs = d <= 30 ? 12 : 11;
    /* o "oco" de 61–90 dias saiu (15/10/26): na rua quase todo recém-aberto tinha mais de 60 dias e
       o mapa voltava a ficar escuro; a idade fica no número e no tamanho */
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
    /* o círculo vermelho em volta da próxima porta saiu (Julyan, 15/10/26: "esse círculo tá feio";
       vermelho ainda lia como "quente"). A próxima porta fica maior e com o nome "próxima porta". */
    s = 40; fs = 16; op = 1;
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

/** Tamanho final do N1 (prancha "Mapa na rua": pino 40, anel 52). O recém-aberto segue losango. */
export const N1_CIRCULO = 40;
export const N1_LOSANGO = 30;
export const ANEL_N1 = 52;
/** Quanto o N3 é menor que o N2. */
export const MENOS_N3 = 4;

/**
 * O DESENHO NA RUA (prancha "Mapa na rua", 02/11/26). Parte do desenho de hoje (que já tem o +4
 * pedido em 26/09) e aplica os níveis:
 * - N1 = 40 (losango 30), cor e letra da família; o anel é desenhado à parte;
 * - N2 = o tamanho de hoje; N3 = 4 px menor (lead Q/M/F 26/24/22, cliente e mais avaliado 26,
 *   parada do plano 32, feito 24);
 * - recém-aberto por faixa: ≤ 30 d cheio com a idade (27, N3 25); 31–60 cheio sem número (22);
 *   61–90 só contorno, sem número (20). O "90" dentro do losango saiu: a idade exata vai para o
 *   cartão e para a Lista;
 * - nenhuma etiqueta além do selo (que vem pronto de niveisDoMapa) e nenhum brilho;
 * - pilha: o desenho do membro mais prioritário (a sombra e o contador são desenhados à parte).
 */
export function desenhoNaRua(p: Props): Desenho {
  const nivel = p.nivel ?? 3;
  const base = desenhoDoPino({ ...p, papel: nivel === 1 ? 'proxima' : p.papel === 'proxima' ? 'lente' : p.papel, pilhaN: 1 });
  const d: Desenho = { ...base, badge: null, brilho: false, halo: false };
  const f = p.pino.familia;
  if (p.selecionado || (base.op < 1 && base.s <= 16)) return d; // aberto: o tamanho do aberto; discreto: a bolinha
  const rec = f === 'rec' && !p.planoNumero && !p.visitado;
  if (nivel === 1) {
    d.s = f === 'rec' && !p.planoNumero ? N1_LOSANGO : N1_CIRCULO;
    return d;
  }
  if (rec) {
    const dias = p.pino.abertoHa ?? 0;
    d.diam = true; d.bw = 2; d.bst = 'solid'; d.bc = COR.recTinta; d.bg = COR.rec; d.fg = COR.recTinta; d.op = 1;
    if (dias <= 30) { d.s = 23 + MAIS - (nivel === 3 ? 2 : 0); d.tx = String(dias); d.fs = nivel === 3 ? 11 : 12; }
    else if (dias <= 60) { d.s = 18 + MAIS; d.tx = ''; }
    else {
      /* 61–90: só contorno. No escuro, borda limão sobre o fundo do mapa; no sol, a tinta escura
         sobre branco (o limão some no branco) — as cores já existem no pino */
      d.s = 16 + MAIS; d.tx = ''; d.bw = 2.5; d.bg = p.sol ? '#FFFFFF' : '#17191D'; d.bc = p.sol ? COR.recTinta : COR.rec;
    }
    return d;
  }
  if (nivel === 3) { d.s -= MENOS_N3; d.fs = Math.max(9, d.fs - 1); if (d.logo) d.lw = Math.max(9, d.lw - 3); }
  return d;
}

function PinoP2(props: Props) {
  if (props.nivel != null) return <PinoNaRua {...props} />;
  const { pino, selecionado, sinal, pilhaN = 1, leque = null, sol = false, rotulo = false, lado = 'dir' } = props;
  const d = desenhoDoPino(props);
  const hd = d.diam ? d.s * Math.SQRT1_2 : d.s / 2;
  // centro do desenho em relação à coordenada (a ponta)
  const cy = d.diam ? -hd - 1 : -7 - d.s / 2;
  const comNome = !leque && (selecionado || props.papel === 'proxima' || rotulo);
  const tipCor = d.bst === 'dashed' ? '#FFFFFF' : d.bc;
  const halo = 66 + MAIS;
  return (
    <div style={{ position: 'relative', width: CAIXA_W, height: CAIXA_H, cursor: 'pointer' }}>
      <div style={{ position: 'absolute', left: CAIXA_W / 2, top: PONTA_Y, width: 0, height: 0, zIndex: selecionado ? 5 : 2 }}>
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

/**
 * O PINO NA RUA (prancha "Mapa na rua", 02/11/26). Mesma caixa de toque (48 × 56, ponta em 24, 54)
 * — o alvo continua com 44+ pt mesmo no N3 —, com:
 * - o anel sólido de 52 px só no N1 (vermelho-ação no plano, cor do texto na sugestão);
 * - no máximo um selo (! ou ↓), no canto de cima;
 * - a pilha sem anel tracejado: o pino do membro mais prioritário, a sombra de um segundo pino a
 *   55% deslocada 5 px para cima e à direita, e o contador de 18 px no pé;
 * - o rótulo que niveisDoMapa colocou (o lado vem pronto e foi medido na tela);
 * - `data-pino`, `data-cabeca` e `data-ponta` para a conferência na tela medir o que o Google desenhou.
 */
function PinoNaRua(props: Props) {
  const { pino, selecionado, pilhaN = 1, leque = null, sol = false, nivel = 3, rotuloNaRua = null, seloNaRua = null, sugestao = false, semAnel = false, apagado = false, idDom } = props;
  const d = desenhoNaRua(props);
  const hd = d.diam ? d.s * Math.SQRT1_2 : d.s / 2;
  const cy = d.diam ? -hd - 1 : -7 - d.s / 2;
  const topo = cy - hd;
  const tipCor = d.bst === 'dashed' ? '#FFFFFF' : d.bc;
  const corTexto = sol ? '#111418' : '#F4F5F7';
  const pilha = pilhaN > 1 && !leque;
  const anel = nivel === 1 && !semAnel && !leque;
  const cabeca = (extra: React.CSSProperties, dataCabeca: boolean, conteudo: React.ReactNode) => (
    <div {...(dataCabeca ? { 'data-cabeca': '1' } : {})} style={{
      position: 'absolute', left: -d.s / 2, top: cy - d.s / 2, width: d.s, height: d.s, boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: d.diam ? 4 : '50%', background: d.bg, border: `${d.bw}px ${d.bst} ${d.bc}`, color: d.fg,
      fontWeight: 700, fontSize: d.fs, lineHeight: 1, letterSpacing: '-.02em', boxShadow: '0 2px 5px rgba(0,0,0,.4)',
      transform: d.diam ? 'rotate(45deg)' : undefined, ...extra,
    }}>{conteudo}</div>
  );
  return (
    <div data-pino={idDom} data-nivel={nivel} style={{ position: 'relative', width: CAIXA_W, height: CAIXA_H, cursor: 'pointer', opacity: apagado ? 0.3 : 1 }}>
      <div data-ponta="1" style={{ position: 'absolute', left: CAIXA_W / 2, top: PONTA_Y, width: 0, height: 0, zIndex: selecionado ? 5 : 2 }}>
        {leque && (
          <div style={{
            position: 'absolute', left: 0, top: 0, height: 2, background: sol ? 'rgba(17,20,24,.6)' : 'rgba(255,255,255,.7)', transformOrigin: '0 0',
            width: Math.hypot(leque.dx, leque.dy), transform: `rotate(${Math.atan2(leque.dy, leque.dx)}rad)`, pointerEvents: 'none',
          }} />
        )}
        <div style={{ position: 'absolute', left: leque?.dx ?? 0, top: leque?.dy ?? 0, width: 0, height: 0, opacity: d.op }}>
          {anel && (
            <div style={{
              position: 'absolute', left: -ANEL_N1 / 2, top: cy - ANEL_N1 / 2, width: ANEL_N1, height: ANEL_N1, boxSizing: 'border-box', borderRadius: '50%', pointerEvents: 'none',
              border: sugestao ? `2.5px solid ${corTexto}` : '3px solid var(--vermelho-acao)',
              background: sugestao ? 'rgba(140,140,140,.14)' : 'rgba(229,26,49,.14)',
            }} />
          )}
          {pilha && cabeca({ left: -d.s / 2 + 5, top: cy - d.s / 2 - 4, opacity: 0.55, border: '2px solid #FFFFFF' }, false, null)}
          {!d.diam && (
            <div style={{
              position: 'absolute', left: -5, top: -8, width: 0, height: 0,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `8px solid ${tipCor}`,
            }} />
          )}
          {cabeca({}, true, (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', transform: d.diam ? 'rotate(-45deg)' : undefined }}>
              {d.logo
                ? <Image source={LOGO} style={{ width: d.lw + MAIS / 2, height: Math.round((d.lw + MAIS / 2) * 288 / 227) }} resizeMode="contain" fadeDuration={0} accessibilityLabel="Takeat" />
                : d.tx}
            </span>
          ))}
          {pilha && (
            <div style={{
              position: 'absolute', left: hd - 8, top: cy, width: 18, height: 18, borderRadius: 9, boxSizing: 'border-box',
              background: '#111418', border: '1.5px solid #FFFFFF', color: '#FFFFFF', fontWeight: 700, fontSize: 10.5, lineHeight: '15px', textAlign: 'center',
            }}>{pilhaN > 99 ? '99+' : pilhaN}</div>
          )}
          {!!seloNaRua && !pilha && (
            <div style={{
              position: 'absolute', left: hd - 10, top: topo - 6, width: 18, height: 18, borderRadius: 9, boxSizing: 'border-box',
              background: seloNaRua === '!' ? '#111418' : '#F59E0B', color: seloNaRua === '!' ? '#FCD34D' : '#111418', border: '1.5px solid #FFFFFF',
              fontWeight: 800, fontSize: 11, lineHeight: '15px', textAlign: 'center',
            }}>{seloNaRua}</div>
          )}
          {rotuloNaRua && (
            <div data-rotulo={nivel} style={{
              position: 'absolute', display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap', pointerEvents: 'none', boxSizing: 'border-box',
              padding: '4px 10px', borderRadius: 10, boxShadow: '0 2px 5px rgba(0,0,0,.25)',
              background: sol ? 'rgba(255,255,255,.96)' : 'rgba(23,25,29,.94)', border: `1px solid ${sol ? '#D9D4CA' : 'rgba(255,255,255,.14)'}`,
              ...(rotuloNaRua.lado === 'acima'
                ? { left: 0, top: topo - 8, transform: 'translate(-50%, -100%)' }
                : rotuloNaRua.lado === 'esq'
                  ? { right: Math.round(hd + 7), top: cy, transform: 'translateY(-50%)' }
                  : { left: Math.round(hd + 7), top: cy, transform: 'translateY(-50%)' }),
            }}>
              <span style={{ fontWeight: 700, fontSize: nivel === 1 ? 14 : 13, lineHeight: 1.3, color: corTexto, maxWidth: nivel === 1 ? 200 : 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {rotuloNaRua.nome}
              </span>
              {!!rotuloNaRua.linha2 && (
                <span style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, color: sol ? '#414852' : 'rgba(255,255,255,.74)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {rotuloNaRua.linha2}
                </span>
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
