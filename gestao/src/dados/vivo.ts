// Repintura ao vivo — uma conta só, para as seis telas.
//
// POR QUE EXISTE
// Toda tela do cockpit carregava assim: `carregarX().then(setDados)` dentro de
// um `useEffect(..., [])`. Uma vez, no mount, e nunca mais. Quem deixasse a aba
// aberta enquanto um negocio mudava de etapa em outra aba ficava olhando um
// numero morto sem nenhum sinal disso — e agindo sobre ele.
//
// O criterio do pacote de replicacao (10-plano-de-replicacao.md, fase 5) e'
// explicito: "a tela repinta quando um negocio muda de etapa em outra aba".
//
// AS QUATRO REGRAS QUE ESTA PECA CARREGA
//
// 1. FALHA AO ATUALIZAR NAO APAGA O QUE JA' ESTA' NA TELA.
//    Armadilha 8 do pacote: "erro de rede virando zero — a barra desce e o
//    executivo ve pontos desaparecerem". Aqui a distincao e' estrutural: sem
//    dado anterior a falha vira `erro` (a tela mostra o estado de erro); COM
//    dado anterior ela vira `desatualizado` e o dado antigo continua no lugar,
//    rotulado. Nunca em branco, nunca zero.
//
// 2. NAO REPINTA POR CIMA DE QUEM ESTA' REGISTRANDO.
//    `pausado` trava a revalidacao enquanto ha' um drawer aberto com formulario.
//    Puxar o chao de alguem que esta' digitando a pauta de um 1:1 e' pior que
//    mostrar dado de um minuto atras.
//
// 3. COLAPSA.
//    Armadilha 7: "repintar sem colapsar — um gesto redesenhava a tela tres
//    vezes". Nunca ha' duas cargas em voo, resposta fora de ordem e' descartada
//    por numero de sequencia, e ha' um intervalo minimo entre tentativas
//    (alt-tab rapido dispara `focus` varias vezes).
//
// 4. A REGRA VIVE NUM LUGAR SO'.
//    Repetir esta politica em seis `.catch` era garantir que divergissem — o
//    pacote chama isso de "a mesma regra em dois lugares divergem sempre; a
//    unica duvida e' quando".
import { useCallback, useEffect, useRef, useState } from 'react';

/** Alt-tab dispara `focus` varias vezes; abaixo disso nao vale ir ao banco. */
export const INTERVALO_MINIMO_MS = 20_000;

/** Aba visivel e parada (cockpit na TV da sala) se atualiza sozinha. */
export const INTERVALO_DE_FUNDO_MS = 5 * 60_000;

/**
 * Decide se cabe revalidar AGORA. Pura de proposito: e' a unica parte com
 * regra de verdade, e assim da' pra testar sem montar React (`vivo.teste.ts`).
 *
 * `agoraMs` e' relogio de intervalo, nao data de negocio — nao passa pelo
 * `diaBRT`. Toda data que o usuario LE continua saindo de `dados/datas.ts`.
 */
export function devoRevalidar(estado: {
  agoraMs: number;
  ultimaMs: number | null;
  emVoo: boolean;
  pausado: boolean;
  minimoMs?: number;
}): boolean {
  if (estado.emVoo) return false;
  if (estado.pausado) return false;
  if (estado.ultimaMs == null) return true;
  return estado.agoraMs - estado.ultimaMs >= (estado.minimoMs ?? INTERVALO_MINIMO_MS);
}

export type Vivo<T> = {
  /** O ultimo dado bom. So' volta a `null` quando a `chave` muda. */
  dados: T | null;
  /** Falhou e NAO ha' dado anterior — a tela mostra o estado de erro. */
  erro: string | null;
  /** Falhou uma revalidacao, mas o dado da tela continua valido (e velho). */
  desatualizado: boolean;
  /**
   * Recarga pedida pela tela (depois de escrever, ou no botao "tentar de
   * novo"). Devolve promessa pra quem precisa segurar o estado de "ocupado"
   * ate' o dado novo chegar — soltar o botao antes disso mostra o numero
   * velho por um instante, e o usuario le' isso como "nao salvou".
   */
  recarregar: () => Promise<void>;
};

export function useVivo<T>(
  carregar: () => Promise<T>,
  opcoes: {
    /** Muda de valor = outro recorte: volta pro estado de carregando. */
    chave?: string;
    /** Enquanto true, nao revalida sozinho (drawer com formulario aberto). */
    pausado?: boolean;
    /** Chamado a cada dado novo — para a tela ressincronizar o que tem aberto. */
    aoReceber?: (dados: T) => void;
  } = {},
): Vivo<T> {
  const { chave = '', pausado = false, aoReceber } = opcoes;

  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [desatualizado, setDesatualizado] = useState(false);

  // Refs para o que muda a cada render sem dever reassinar os listeners.
  const carregarRef = useRef(carregar);
  const aoReceberRef = useRef(aoReceber);
  const pausadoRef = useRef(pausado);
  carregarRef.current = carregar;
  aoReceberRef.current = aoReceber;
  pausadoRef.current = pausado;

  const dadosRef = useRef<T | null>(null);
  const emVooRef = useRef(false);
  const ultimaRef = useRef<number | null>(null);
  const sequenciaRef = useRef(0);

  const rodar = useCallback(() => {
    emVooRef.current = true;
    const minha = ++sequenciaRef.current;
    return carregarRef.current()
      .then((novos) => {
        if (minha !== sequenciaRef.current) return; // chegou atrasada: ja' ha' outra
        dadosRef.current = novos;
        setDados(novos);
        setErro(null);
        setDesatualizado(false);
        aoReceberRef.current?.(novos);
      })
      .catch((e) => {
        if (minha !== sequenciaRef.current) return;
        const msg = (e as Error)?.message ?? String(e);
        // A distincao da regra 1, e o motivo inteiro desta peca existir.
        if (dadosRef.current == null) setErro(msg);
        else setDesatualizado(true);
      })
      .finally(() => {
        if (minha === sequenciaRef.current) emVooRef.current = false;
        ultimaRef.current = Date.now();
      });
  }, []);

  // Primeira carga, e recomeco quando a `chave` muda. Aqui `null` E' o certo:
  // trocar de dia na Rotas precisa mostrar "carregando", nao o dia anterior.
  useEffect(() => {
    dadosRef.current = null;
    ultimaRef.current = null;
    setDados(null);
    setErro(null);
    setDesatualizado(false);
    void rodar();
  }, [chave, rodar]);

  useEffect(() => {
    const talvez = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (
        !devoRevalidar({
          agoraMs: Date.now(),
          ultimaMs: ultimaRef.current,
          emVoo: emVooRef.current,
          pausado: pausadoRef.current,
        })
      )
        return;
      void rodar();
    };

    document.addEventListener('visibilitychange', talvez);
    window.addEventListener('focus', talvez);
    const id = window.setInterval(talvez, INTERVALO_DE_FUNDO_MS);
    return () => {
      document.removeEventListener('visibilitychange', talvez);
      window.removeEventListener('focus', talvez);
      window.clearInterval(id);
    };
  }, [rodar]);

  // Pedida pela tela: ignora o intervalo minimo (o gesto foi explicito), mas
  // ainda colapsa contra uma carga em voo.
  const recarregar = useCallback(() => {
    if (emVooRef.current) return Promise.resolve();
    return rodar();
  }, [rodar]);

  return { dados, erro, desatualizado, recarregar };
}
