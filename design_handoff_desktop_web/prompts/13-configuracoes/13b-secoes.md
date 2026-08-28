# 13b — As seis seções

**Tela:** Configurações  ·  **Arquivo:** `src/screens/ConfiguracoesScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *10. Configurações*
**Escopo:** só o visual — a lógica já está no lugar pelo 13a

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Cada seção é um `<section>` com um cabeçalho e um card. Cabeçalho: 12/16/0.5 peso 700 `--text-muted`, uppercase, `margin-bottom:16px`. Gap 32 entre seções.
- Casca de card: fundo `--surface`, borda 1px `--border`, raio 8, sombra `0 2px 4px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`.
- **1. CONTA** — card com `overflow:hidden` e linhas de leitura: `padding:12px 16px`, borda inferior 1px `--border`, `justify-content:space-between`. Chave 12/16/0.5 peso 600 `--text-faint` com `flex:0 0 auto; white-space:nowrap`; valor 14/20/0.25 `--text` à direita. Nome · E-mail · Papel · ID HubSpot. Última linha é uma nota 12/16/0.4 `--text-faint`: "Nome, e-mail e papel são definidos pelo administrador."
- **2. SENHA** — card `padding:24px`. Hint 12/16/0.4 `--text-faint` (**mantenha a copy atual**: "Digite uma nova senha. Mínimo de 6 caracteres."), `margin-bottom:16px`. Dois campos em `grid-template-columns:1fr 1fr` gap 16, `max-width:560px` — rótulo 14/20/0.1 peso 600 `--text-muted` `margin-bottom:8px`, caixa altura 40 raio 8 borda 1px `--stroke-strong`. CTA "Salvar nova senha" Large filled `#C8131B`, ícone `lock_reset`, `margin-top:16px`, flush-left.
- **3. APARÊNCIA** — card `padding:24px`. Rótulo "Tema" 14/20/0.1 peso 600 `--text-muted`; explicação 12/16/0.4 `--text-faint` ("Automático segue o aparelho. A escolha manual vence o aparelho e vale também no mapa."); segmented Automático / Claro / Escuro — altura 40, `padding:0 16px`, 12/16/0.5 peso 600, raio 12 **só nas pontas**, `max-width:360px`, selecionado `#C8131B`/branco, os outros com borda 1px `--stroke-default`.
- **4. ÁREA DO GESTOR** (só gestor) — dois cards-link em coluna gap 12, `padding:16px`, `display:flex; align-items:center; gap:16px`, hover `border-color:--stroke-strong`, `text-decoration:none`. Cada um: ícone em quadrado 40×40 raio 8 (o primeiro com fundo `--tint-red` e ícone `--tint-red-text`; o segundo `--surface-2`/`--text-muted`), título 14/20/0.1 peso 600 sobre descrição 12/16/0.4 `--text-faint`, e à direita `open_in_new` ou `chevron_right` 20px `--text-faint`. Os dois: "Abrir painel de gestão" e "Vendedores e usuários".
- **5. ADMINISTRAÇÃO** (só admin) — card `padding:24px` com **borda esquerda 3px `#CC8C1D`**. Título 14/20/0.1 peso 600 `--text`; explicação 12/16/0.4 `--text-faint` com `max-width:64ch` e `text-wrap:pretty`; botão "Forçar atualização" Large outline neutro (borda `--stroke-default`), ícone `refresh`, flush-left.
- **6. SOBRE** — card `overflow:hidden` com linhas de leitura iguais às de Conta: versão do app, build do service worker, última sincronização de uso — valores com `tabular-nums`. Abaixo, `padding:16px` com "Sair da conta" Large outline `#C8131B`, ícone `logout`, hover fundo `--tint-red`.
- Abaixo de 1024px: os dois campos de senha empilham em uma coluna; o resto já é coluna única.

## Não fazer

- Não reescreva as copies que já existem no app (hint da senha, hint do painel de gestão).
- Não use `#94090F` nem `#167532` como cor de texto — tokens.

## Pronto quando

- [ ] seis seções na ordem, com cabeçalho uppercase e card
- [ ] campos de senha em duas colunas no desktop, uma abaixo de 1024px
- [ ] segmented de tema com raio 12 só nas pontas
- [ ] seções de gestor e admin escondidas para quem não tem o papel
- [ ] todos os CTAs com rótulo flush-left
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
