// ESLint com UMA regra só: `react-hooks/rules-of-hooks`.
//
// POR QUE EXISTE, E POR QUE E' SO' ISSO
// Em 14/08/2026 um `useIconColors()` foi parar dentro de um `useMemo`, atras de
// um `return` condicional. Resultado em campo: ao abrir alguns leads — os que
// tinham dado de uso do HubSpot — a contagem de hooks mudava entre renders, o
// React derrubava a arvore inteira, e o vendedor via TELA PRETA (o `body` no
// tema escuro). Sem barreira de erro, sem mensagem, sem log. Levou uma
// investigacao inteira pra achar uma linha.
//
// Esta regra pega essa classe toda em tempo de build, e o custo dela e' zero:
// ou o codigo esta' certo, ou nao compila o lint.
//
// O escopo e' minimo DE PROPOSITO. Ligar um preset completo num App.tsx de 8
// mil linhas geraria centenas de avisos de estilo que ninguem vai ler, e um
// lint que todo mundo ignora nao protege de nada. `exhaustive-deps` fica
// desligado pelo mesmo motivo: e' util, mas ruidoso, e diluiria o unico aviso
// que aqui significa "isso vai quebrar em producao".
//
// Rodar:  npm run lint
import parser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'gestao/dist/**',
      'gestao/node_modules/**',
      '.expo/**',
      'web-build/**',
      'supabase/functions/**', // Deno, com outro runtime e outras globais
    ],
  },
  {
    // Inclui .js/.jsx: o index.js monta a arvore e tem JSX, e a regra de hooks
    // vale igual la'. Sem isso o parser padrao do ESLint engasga no `<`.
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    // Os `eslint-disable` de exhaustive-deps espalhados pelo codigo apontam pra
    // uma regra que NAO esta ligada aqui. Sem isto, o lint reclamaria deles e
    // reintroduziria o ruido que este arquivo existe pra evitar.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
