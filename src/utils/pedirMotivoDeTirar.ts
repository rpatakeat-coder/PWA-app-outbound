// A pergunta "por que saiu do plano", num toque (15/11/26). As regras estão em motivoDeTirar.ts.
import { Alert } from '../components/Alert';
import { TEXTO_DA_PERGUNTA, botoesDaPergunta, tituloDaPergunta, type MotivoPerguntado, type PedidoDeMotivo } from './motivoDeTirar';

/**
 * Devolve o motivo, ou null se a pessoa desistiu (quem chama não tira nada).
 * Usa o Alert do app, que abre por cima de qualquer folha.
 */
export function pedirMotivoDeTirar(p: PedidoDeMotivo): Promise<MotivoPerguntado | null> {
  return new Promise((resolve) => {
    /* o Alert empilha de baixo para cima (column-reverse) quando há mais de dois botões: invertendo aqui,
       os motivos aparecem na ordem certa e o Cancelar fica por último */
    Alert.alert(tituloDaPergunta(p.nome, p.quantas ?? 1), TEXTO_DA_PERGUNTA, [...botoesDaPergunta(p, resolve)].reverse());
  });
}
