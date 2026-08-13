// Modo claro/escuro.
//
// A paleta em si vive em variaveis CSS (ver public/index.html). Este modulo so'
// decide QUAL paleta vale, escrevendo `data-theme` no <html>:
//
//   sem atributo  -> segue o aparelho (@media prefers-color-scheme)
//   data-theme="light" / "dark" -> escolha do vendedor, vence o aparelho
//
// Nao ha estado de cor no React: trocar o atributo repinta o app inteiro pelo
// CSS, sem re-render de arvore.
import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const CHAVE = 'takeat.theme';

/** Tema efetivamente em vigor — o que o mapa e a barra de status precisam saber. */
export type ThemeResolved = 'light' | 'dark';

function lerPref(): ThemePref {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(CHAVE);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function aplicar(pref: ThemePref) {
  if (typeof document === 'undefined') return;
  const raiz = document.documentElement;
  if (pref === 'system') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', pref);

  // A cor da barra de status do iOS/Android nao vem do CSS da pagina: e' lida
  // desta meta tag. Sem atualiza-la, o topo da tela fica claro num app escuro.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolver(pref) === 'dark' ? '#0b1220' : '#dc2626');
}

function preferenciaDoAparelho(): ThemeResolved {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolver(pref: ThemePref): ThemeResolved {
  return pref === 'system' ? preferenciaDoAparelho() : pref;
}

/**
 * Aplica a preferencia salva o mais cedo possivel.
 * Chamado no boot (index.js), antes do app montar, pra a tela nao piscar
 * clara antes de escurecer.
 */
export function initTheme(): void {
  aplicar(lerPref());
}

/**
 * Estado do tema pra UI. Devolve a preferencia (o que o botao mostra) e o tema
 * resolvido (o que o mapa e a barra de status usam).
 */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(lerPref);
  const [resolvido, setResolvido] = useState<ThemeResolved>(() => resolver(lerPref()));

  // Com a preferencia em "system", seguir o aparelho em tempo real: o iOS
  // alterna sozinho no horario agendado e o app tem que acompanhar sem
  // precisar ser reaberto.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const aoMudar = () => {
      if (lerPref() === 'system') {
        aplicar('system');
        setResolvido(preferenciaDoAparelho());
      }
    };
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  const setPref = (novo: ThemePref) => {
    if (typeof localStorage !== 'undefined') {
      if (novo === 'system') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, novo);
    }
    aplicar(novo);
    setPrefState(novo);
    setResolvido(resolver(novo));
  };

  return { pref, setPref, resolvido, isDark: resolvido === 'dark' };
}
