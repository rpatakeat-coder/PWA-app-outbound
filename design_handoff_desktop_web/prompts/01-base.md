# Prompt 01 — Base: tokens, fonte e breakpoints

Cole este prompt inteiro no Claude Code, na raiz do repo `PWA-app-outbound`.
Rode **um prompt por vez** e confira o resultado antes de passar para o próximo.

**Contexto obrigatório**: leia `design_handoff_desktop_web/README.md` antes de editar — as seções *Design Tokens*, *Grid e chrome global* e a de tela específica citada abaixo. Todos os valores vêm de lá. Não invente cor, espaçamento, raio ou tamanho de tipo.

Tarefa pequena, faça inteira.

## 1. `public/index.html` — três tokens que faltam

No bloco `<style id="takeat-theme">`, adicionar ao `:root` claro:

```css
--stroke-default:#C6C6C6;
--stroke-strong:#7A7A7A;
--text-disabled:#C6C6C6;
```

E os pares escuros, junto dos outros `--d-*`, replicados nos **dois** seletores de tema escuro (o `@media (prefers-color-scheme: dark)` e o `:root[data-theme='dark']`) — o arquivo já segue esse padrão de declarar em `--d-*` e apontar nos dois:

```css
--d-stroke-default:rgba(255,255,255,.14);
--d-stroke-strong:rgba(255,255,255,.24);
--d-text-disabled:rgba(255,255,255,.28);
```

## 2. Correção de contraste no escuro

`#167532`, `#1D9688` e `#018CCC` são usados como cor de TEXTO e reprovam sobre a superfície escura. Nos dois seletores escuros, remapear:

```css
--tint-green-text: #77BD8B;   /* já existe assim — confirmar */
--info-text: #66CFFF;         /* já existe assim — confirmar */
```

E onde o código usa esses hexes soltos como cor de texto, trocar pelos tokens. Buscar no repo por `#167532`, `#1D9688`, `#018CCC`, `#94090F` e avaliar caso a caso: **se for cor de texto sobre superfície do tema, vira token; se for texto sobre fundo tonal claro (`#FAE8E9`, `#FFF8EB`, `#EAF7EE`), fica como está** — esses fundos não mudam com o tema.

## 3. Peso 700 da Poppins

No `<link>` do Google Fonts: `wght@400;500;600;800` → `wght@400;500;600;700;800`. O redesign usa 700 em títulos de página e nav ativa.

## 4. `src/hooks/useLayout.ts`

Os degraus continuam 768 / 1024. O que muda é o consumo: a sidebar colapsável e a tabela precisam saber se estão em tablet (768–1023) ou desktop (1024+). `ehDesktop` e `ehLargo` já entregam isso — **não precisa mudar o hook**, só confirmar que `alvo: ehDesktop ? 40 : 48` está lá.

Ler a seção *Responsive behavior* do README para o comportamento esperado em cada faixa.

## Pronto quando

- [ ] os três tokens resolvem nos dois temas (inspecionar no browser)
- [ ] nenhum `#167532`/`#1D9688`/`#018CCC`/`#94090F` sobrou como cor de texto sobre superfície do tema
- [ ] Poppins 700 carrega
- [ ] `npm run typecheck` limpo
