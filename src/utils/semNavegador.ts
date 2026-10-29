// UM NAVEGADOR DE MENTIRA, SÓ PARA AS SUÍTES RODAREM (28/10/26).
//
// O DEFEITO QUE ISTO CONSERTA. Três suítes — comissao, fichaNoBanco e preparo — passavam em
// TODAS as suas checagens e mesmo assim davam saída de erro. O motivo não estava nelas: o
// módulo que elas testam importa, lá no fundo, `integrations/supabase/client.ts`; o cliente
// sobe o GoTrue, que chama AsyncStorage, que no web é `window.localStorage` — e no `tsx`, que
// roda em Node, não existe `window`. A pilha estourava DEPOIS dos "OK" já impressos, de forma
// assíncrona, e o processo saía com código 1.
//
// POR QUE ISSO É PIOR DO QUE PARECE. Uma suíte que sempre termina em vermelho não é uma suíte:
// quem roda não consegue distinguir "o comissionamento quebrou" de "o barulho de sempre". Eram
// três guardas apagadas em silêncio, e uma delas cobre a CONTA DO VARIÁVEL — dinheiro na mão
// de oito pessoas.
//
// COMO USAR. Primeira linha de import do arquivo de teste, antes de qualquer outro:
//
//     import './semNavegador';
//
// A ordem importa: o ESM avalia os imports na ordem em que aparecem, e é isso que garante que
// o `window` exista antes de o cliente do Supabase ser construído.
//
// O QUE ELE NÃO É. Não é um navegador, e não deve virar um. Guarda em memória, perde tudo ao
// sair, e só existe para o módulo carregar. Teste que PRECISE de localStorage de verdade está
// testando a coisa errada — o valor a conferir é o da função pura, não o da gaveta.

type Gaveta = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  clear(): void;
  key(i: number): string | null;
  readonly length: number;
};

function gavetaEmMemoria(): Gaveta {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}

const g = globalThis as unknown as {
  window?: Record<string, unknown>;
  localStorage?: Gaveta;
  document?: Record<string, unknown>;
};

if (typeof g.window === 'undefined') {
  const gaveta = gavetaEmMemoria();
  /* `addEventListener` vazio porque o cliente do Supabase assina `visibilitychange` para
     revalidar a sessão; sem ele o módulo estoura na construção, não no uso. */
  g.window = {
    localStorage: gaveta,
    sessionStorage: gavetaEmMemoria(),
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: 'http://teste.local/', origin: 'http://teste.local' },
  };
  g.localStorage = gaveta;
}
if (typeof g.document === 'undefined') {
  g.document = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
}

export {};
