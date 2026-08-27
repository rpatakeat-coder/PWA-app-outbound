import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],

  // Servido em /gestao do mesmo dominio do PWA de campo. Mesmo dominio e' o
  // que faz a sessao do Supabase ser compartilhada entre os dois: ela vive no
  // localStorage, que e' por origem — quem entra no app de campo ja' chega
  // autenticado aqui, e vice-versa.
  base: '/gestao/',

  // O cockpit reusa as MESMAS variaveis do app de campo (EXPO_PUBLIC_*): a
  // chave do Google Maps ja' esta configurada na Vercel uma vez so'. Sem este
  // prefixo o Vite so' exporia VITE_* e o mapa da aba Rotas nao carregaria.
  envPrefix: ['VITE_', 'EXPO_PUBLIC_'],

  resolve: {
    alias: {
      // O design system publica dist/index.css mas NAO o declara no campo
      // `exports` do package.json (54 entradas, nenhuma de CSS). O Vite
      // respeita o `exports` e recusa o import direto; o alias aponta pro
      // arquivo real. Remover quando o kit publicar `"./styles.css"`.
      'takeat-kit/estilos.css': path.resolve(
        __dirname,
        'node_modules/takeat-design-system-ui-kit/dist/index.css',
      ),
    },
  },

  build: {
    outDir: 'dist',
    // O PWA de campo tem service worker com cache de longa duracao nos
    // assets com hash. Manter o padrao de nomes evita colisao entre os dois
    // builds quando forem servidos do mesmo dominio.
    assetsDir: 'assets',
  },
});
