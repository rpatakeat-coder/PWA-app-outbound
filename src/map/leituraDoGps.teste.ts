// Rode com:  npx tsx src/map/leituraDoGps.teste.ts
import { escolherLeitura, leituraRecente, publicarLeitura, RESERVA_ERRO_M, RESERVA_IDADE_MS } from './leituraDoGps';

let ok = 0; const falhas: string[] = [];
const checar = (nome: string, cond: boolean) => { if (cond) ok++; else falhas.push(nome); };
const L = (accuracy: number, em = Date.now()) => ({ latitude: -22.9, longitude: -43.3, accuracy, em });

checar('sem amostra e com o mapa lendo: vale a do mapa (não existe "GPS não respondeu")', escolherLeitura(null, L(12))?.accuracy === 12);
checar('sem amostra e sem mapa: nada', escolherLeitura(null, null) === null);
checar('amostra ruim (±200 m, pela rede) e mapa bom: vale a do mapa', escolherLeitura(L(200), L(8))?.accuracy === 8);
checar('amostra boa e mapa pior: vale a amostra', escolherLeitura(L(6), L(40))?.accuracy === 6);
const a = L(10);
checar('empate fica com a amostra (a mais nova)', escolherLeitura(a, L(10)) === a);
checar('margem zero ou inválida não é leitura', escolherLeitura(L(0), L(30))?.accuracy === 30 && escolherLeitura(L(Number.NaN), null) === null);
publicarLeitura(L(60));
checar('a reserva aceita o mapa com até ±100 m', leituraRecente(RESERVA_IDADE_MS, RESERVA_ERRO_M)?.accuracy === 60);
publicarLeitura(L(150));
checar('pior que ±100 m não serve de reserva (a régua da prova)', leituraRecente(RESERVA_IDADE_MS, RESERVA_ERRO_M) === null);
publicarLeitura(L(10, Date.now() - 16000));
checar('leitura do mapa com mais de 15 s não serve de reserva', leituraRecente(RESERVA_IDADE_MS, RESERVA_ERRO_M) === null);

console.log(falhas.length ? 'FALHOU:\n  ' + falhas.join('\n  ') : ok + ' conferências passaram');
process.exit(falhas.length ? 1 : 0);
