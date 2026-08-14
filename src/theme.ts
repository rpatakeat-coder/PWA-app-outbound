// Modo claro/escuro.
//
// A paleta em si vive em variaveis CSS (ver public/index.html). Este modulo so'
// decide QUAL paleta vale, escrevendo `data-theme` no <html>:
//
//   sem atributo  -> segue o aparelho (@media prefers-color-scheme)
//   data-theme="light" / "dark" -> escolha do vendedor, vence o aparelho
//
// Quase nada no app precisa saber o tema em JavaScript: trocar o atributo
// repinta tudo pelo CSS. As excecoes sao o mapa (o estilo vem do Google, nao
// do CSS) e os icones (recebem a cor por prop `fill`, onde var() nao resolve).
//
// O estado e' de MODULO, nao de componente. Antes cada `useTheme()` guardava o
// proprio useState: o seletor das configuracoes atualizava so' a instancia
// dele, e o mapa — que tem a sua — continuava no tema com que montou. Na
// pratica, trocar pra claro deixava a interface clara e o mapa escuro.
import { useCallback, useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
/** Tema efetivamente em vigor — o que o mapa e a barra de status precisam saber. */
export type ThemeResolved = 'light' | 'dark';

const CHAVE = 'takeat.theme';

function lerPref(): ThemePref {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(CHAVE);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function preferenciaDoAparelho(): ThemeResolved {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolver(pref: ThemePref): ThemeResolved {
  return pref === 'system' ? preferenciaDoAparelho() : pref;
}

// ---- Estado compartilhado ----
// O objeto so' e' recriado quando algo muda de fato: o useSyncExternalStore
// compara por identidade e entraria em loop de render com um objeto novo a
// cada leitura.
let estado: { pref: ThemePref; resolvido: ThemeResolved } = {
  pref: 'system',
  resolvido: 'light',
};
const ouvintes = new Set<() => void>();

function aplicarNoDocumento(pref: ThemePref) {
  if (typeof document === 'undefined') return;
  const raiz = document.documentElement;
  if (pref === 'system') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', pref);

  // A cor da barra de status do iOS/Android nao vem do CSS da pagina: e' lida
  // desta meta tag. Sem atualiza-la, o topo da tela destoa do resto.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolver(pref) === 'dark' ? '#17150F' : '#C8131B');
}

function publicar(pref: ThemePref, resolvido: ThemeResolved) {
  if (estado.pref === pref && estado.resolvido === resolvido) return;
  estado = { pref, resolvido };
  aplicarNoDocumento(pref);
  ouvintes.forEach((f) => f());
}

/**
 * Aplica a preferencia salva o mais cedo possivel.
 * Chamado no boot (index.js), antes do app montar, pra a tela nao piscar
 * clara antes de escurecer.
 */
export function initTheme(): void {
  const pref = lerPref();
  estado = { pref, resolvido: resolver(pref) };
  aplicarNoDocumento(pref);

  // Com a preferencia em "system", seguir o aparelho em tempo real: o iOS
  // alterna sozinho no horario agendado e o app tem que acompanhar sem
  // precisar ser reaberto. Registrado uma vez, no modulo — nao por componente.
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (estado.pref === 'system') publicar('system', preferenciaDoAparelho());
    });
  }
}

function inscrever(cb: () => void) {
  ouvintes.add(cb);
  return () => {
    ouvintes.delete(cb);
  };
}

const ler = () => estado;

/**
 * Estado do tema pra UI. Todas as chamadas compartilham o MESMO estado, entao
 * trocar o tema em um lugar re-renderiza todos os consumidores — inclusive o
 * mapa, que precisa ser recriado pra mudar de estilo.
 */
export function useTheme() {
  const snap = useSyncExternalStore(inscrever, ler, ler);

  const setPref = useCallback((novo: ThemePref) => {
    if (typeof localStorage !== 'undefined') {
      if (novo === 'system') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, novo);
    }
    publicar(novo, resolver(novo));
  }, []);

  return {
    pref: snap.pref,
    setPref,
    resolvido: snap.resolvido,
    isDark: snap.resolvido === 'dark',
  };
}
