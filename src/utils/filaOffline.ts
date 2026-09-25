// Fila offline do campo (mapa novo, entrega 1).
//
// Toda escrita que falha por falta de sinal entra aqui, na ordem, com um ID
// idempotente (acaoId) gerado NO TOQUE. O banco guarda esse ID
// (client_visits.acao_id, 0102): subir a mesma ação duas vezes grava uma. A
// fila vive no IndexedDB, então sobrevive a fechar o app, e sobe sozinha quando
// a rede volta (evento `online`, a cada 30 s e ao abrir).
//
// Estados: "na_fila" (esperando sinal) e "falhou" (o servidor recusou; não
// tenta de novo sozinho, espera o vendedor tocar em Tentar). Só erro de REDE
// deixa o item na fila; erro de regra (longe demais, lead sumiu) vira "falhou"
// na hora, porque tentar de novo daria o mesmo erro.

export type TipoAcao = 'checkin';

export type ItemFila = {
  acaoId: string;
  tipo: TipoAcao;
  payload: Record<string, unknown>;
  rotulo: string; // o que aparece na lista da fila ("Check-in · Bar do Zé")
  criadoEm: string;
  tentativas: number;
  estado: 'na_fila' | 'falhou';
  erro?: string;
};

export type Executor = (item: ItemFila) => Promise<void>;

const BANCO = 'takeat-fila-offline';
const LOJA = 'acoes';

let memoria: ItemFila[] = []; // espelho em memória (e fallback sem IndexedDB)
let carregada = false;
const ouvintes = new Set<(itens: ItemFila[]) => void>();
const executores = new Map<TipoAcao, Executor>();
let subindo: Promise<number> | null = null;

export function novoAcaoId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // RFC 4122 v4 sem crypto.randomUUID (Safari antigo).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Sem sinal de verdade: o fetch nem chegou ao servidor. Mensagens do supabase-js
// e do navegador variam; o navigator.onLine=false decide quando existe.
export function ehErroDeRede(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
  return /failed to fetch|network ?error|networkerror|load failed|fetch failed|network request failed|timeout|aborted/.test(msg);
}

function abrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA, { keyPath: 'acaoId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function comLoja<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await abrir();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LOJA, modo);
      const req = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => { resolve(req ? (req.result as T) : undefined); db.close(); };
      tx.onerror = () => { resolve(undefined); db.close(); };
    } catch {
      resolve(undefined);
      db.close();
    }
  });
}

function avisar() {
  const copia = [...memoria];
  ouvintes.forEach((fn) => { try { fn(copia); } catch { /* ouvinte não derruba a fila */ } });
}

async function carregar() {
  if (carregada) return;
  carregada = true;
  const itens = await comLoja<ItemFila[]>('readonly', (l) => l.getAll());
  if (itens && itens.length) {
    const ja = new Set(memoria.map((i) => i.acaoId));
    memoria = [...memoria, ...itens.filter((i) => !ja.has(i.acaoId))]
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
    avisar();
  }
}

async function gravar(item: ItemFila) {
  const i = memoria.findIndex((x) => x.acaoId === item.acaoId);
  if (i >= 0) memoria[i] = item; else memoria.push(item);
  avisar();
  await comLoja('readwrite', (l) => l.put(item));
}

async function remover(acaoId: string) {
  memoria = memoria.filter((x) => x.acaoId !== acaoId);
  avisar();
  await comLoja('readwrite', (l) => l.delete(acaoId));
}

export function itensDaFila(): ItemFila[] {
  return [...memoria];
}

export function ouvirFila(fn: (itens: ItemFila[]) => void): () => void {
  ouvintes.add(fn);
  void carregar();
  fn([...memoria]);
  return () => { ouvintes.delete(fn); };
}

export function registrarExecutor(tipo: TipoAcao, fn: Executor): () => void {
  executores.set(tipo, fn);
  return () => { if (executores.get(tipo) === fn) executores.delete(tipo); };
}

export async function enfileirar(item: Omit<ItemFila, 'criadoEm' | 'tentativas' | 'estado'> & { criadoEm?: string }) {
  await carregar();
  if (memoria.some((x) => x.acaoId === item.acaoId)) return; // mesma ação não entra duas vezes
  await gravar({ ...item, criadoEm: item.criadoEm ?? new Date().toISOString(), tentativas: 0, estado: 'na_fila' });
}

export async function descartar(acaoId: string) {
  await remover(acaoId);
}

// Sobe o que está "na_fila", na ordem. Devolve quantos subiram. Um só por vez:
// chamadas simultâneas (evento online + intervalo) esperam a mesma promessa.
export function subirFila(incluirFalhas = false): Promise<number> {
  if (subindo) return subindo;
  subindo = (async () => {
    await carregar();
    let enviados = 0;
    for (const item of [...memoria]) {
      if (item.estado === 'falhou' && !incluirFalhas) continue;
      const exec = executores.get(item.tipo);
      if (!exec) continue;
      try {
        await exec(item);
        await remover(item.acaoId);
        enviados++;
      } catch (err) {
        if (ehErroDeRede(err)) {
          await gravar({ ...item, tentativas: item.tentativas + 1, estado: 'na_fila' });
          break; // sem sinal: o resto também não sobe agora, e a ordem se mantém
        }
        await gravar({ ...item, tentativas: item.tentativas + 1, estado: 'falhou', erro: String((err as { message?: string })?.message ?? err) });
      }
    }
    return enviados;
  })().finally(() => { subindo = null; });
  return subindo;
}
