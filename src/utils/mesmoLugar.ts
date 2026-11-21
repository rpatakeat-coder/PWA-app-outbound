// O PINO QUE É PROVA DE LUGAR. A comparação de nomes que morava aqui ("Deu Bo" × "Deu BO", 05/10/26)
// servia à busca do Google perto do plano, que saiu em 20/11/26.

import { pinoConfirmado } from './precisaoDoPino';

/**
 * Pino que veio do GPS de alguém (cadastro na rua ou check-in) — esse é prova de lugar, e o
 * Cheguei longe dele não oferece "Estou na porta".
 * Auditoria 02/11/26: a conta-alvo do Google nascia com geo_source 'coords' e passava por pino
 * confirmado (bloqueava o "Estou na porta" com o executivo na porta). O servidor passa a gravar
 * 'google_place'; aceita os dois: 'google_place' nunca é confirmado, e 'coords' com place_id do
 * Google (conta-alvo de antes da troca) também não.
 */
// 02/11/26 (auditoria do pino): SÓ 'checkin' é confirmado. 'coords' era também o pino da mira no
// mapa (Posicionar, Mover pino, cadastro de longe) — 53 dos 70 pinos a mais de 100 m de um GPS bom
// eram 'coords', e o "Estou na porta" do Cheguei não os corrigia. A régua mora em precisaoDoPino.ts
// (a 0247 leva a mesma regra para o servidor; antes dela, a RPC ainda recusa corrigir 'coords').
export const pinoDeGps = (c: { geo_source?: string | null; geo_approximate?: boolean | null; conta_alvo_place_id?: string | null }) =>
  pinoConfirmado(c);
