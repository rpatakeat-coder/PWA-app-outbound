# Como aplicar este redesign com o Claude Code

## Por que em prompts separados

`App.tsx` tem **8.445 linhas / 383 KB**. Três das telas (Rota, Agenda, Tarefas) são funções de render dentro dele, de 200 a 600 linhas cada. Pedir "aplique o README" numa única conversa faz o Claude Code editar o que está à mão — casca, header, mapa, lista — e parar antes das telas grandes.

Cada arquivo desta pasta é uma tarefa **fechada e independente**, dimensionada para uma sessão. Rode na ordem, uma por vez, e confira antes de seguir.

## Ordem

Estes prompts cobrem o que **ainda não foi aplicado** — a base, o refactor que destrava, e as cinco telas que falharam nas tentativas anteriores.

| Prompt | Tela | Onde |
|---|---|---|
`01-base.md` | tokens, contraste no escuro, fonte, breakpoints | `public/index.html`, `src/hooks/useLayout.ts` |
`02-extrair-telas.md` | **refactor sem mudança visual — rode antes dos 06/07/08** | `App.tsx` → `src/screens/` |
`06-rota.md` | Rota | `src/screens/RotaScreen.tsx` |
`07-agenda.md` | Agenda | `src/screens/AgendaScreen.tsx` |
`08-tarefas.md` | Tarefas | `src/screens/TarefasScreen.tsx` |
`09-gestor.md` | Painel do gestor | `src/screens/GestorScreen.tsx` |
`10-meu-desempenho.md` | Meu desempenho | `src/screens/MeuDesempenhoScreen.tsx` |

Casca (sidebar + header), Mapa, Lista, Ficha, modais e Login já saíram nas tentativas anteriores — as seções correspondentes do `README.md` seguem valendo como referência. Se você recomeçar do zero e quiser prompts fechados para essas também, peça.

**O prompt 02 é o que destrava os cinco que falharam.** Ele não muda nada visualmente: só tira Rota, Agenda e Tarefas do `App.tsx` e põe em arquivos próprios. Depois disso cada uma cabe numa sessão e os prompts 06–08 funcionam.

Se você já tentou aplicar e ficou meio-feito, rode `git status` e decida: ou continue de onde parou, ou `git checkout` e comece pelo 01.

## Como conferir cada tela

1. `npm start` e abra a tela no navegador em 1440px de largura
2. Compare com o screenshot correspondente em `design_handoff_desktop_web/screenshots/`
3. Alterne o tema e confira o escuro
4. `npm run typecheck`
