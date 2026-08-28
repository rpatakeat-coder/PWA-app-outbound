# Como aplicar — cockpit de gestão

`/gestao/` é um app Vite **separado**, dentro do mesmo repo. Tem `package.json`, build e `tokens.css` próprios. O trabalho tem dois passos: a casca, e depois as sete telas, uma por vez.

## Antes de rodar

A pasta `design_handoff_desktop_web/` precisa estar no repo — o `G1` referencia a especificação da sidebar e do header que vive lá.

```
PWA-app-outbound/
├── gestao/                          ← o app a ser alterado
├── prompts-gestao/                  ← esta pasta
└── design_handoff_desktop_web/      ← a especificação da casca
```

## Ordem

| # | Arquivo | Tela | Pergunta que responde |
|---|---|---|---|
1 | `G1-casca-web.md` | **sidebar + header** | — |
2 | `G2-time.md` | Time | Onde eu ajo hoje? |
3 | `G3-daily.md` | Daily | Quem cumpriu, quem está vazio? |
4 | `G4-semana.md` | Semana | O que mudou e o que eu faço? |
5 | `G5-agenda.md` | Agenda | A semana está planejada? |
6 | `G6-rotas.md` | Rotas | Ver, editar e montar a rota |
7 | `G7-prospeccao.md` | Prospecção | O que entra no topo do funil? |
8 | `G8-pessoas.md` | Pessoas | Quem precisa de mim no 1:1? |

**O `G1` primeiro, sem exceção.** As sete telas assumem a sidebar e o header no lugar, e o raio de cartão em 8.

Depois do `G1`, a ordem entre `G2` e `G8` é livre — as telas são independentes. Mas **`G8` (Pessoas) tem 27 KB** e é a mais provável de precisar de duas passadas; deixe para quando tiver fôlego.

## Rodar

Um arquivo, uma sessão:

```
Leia prompts-gestao/G2-time.md e execute o que está descrito.
Não faça nada além do que o arquivo pede.
```

Nada mais na mensagem. Sem "e depois as outras".

**Aponte o caminho em vez de colar o conteúdo** — colado, o prompt perde a referência ao preview e aos outros arquivos.

## Cada prompt é autossuficiente

Os sete carregam a tabela de tokens dentro deles: cores nos dois temas, tipografia, espaçamento, raio, a anatomia do cartão e as cores de etapa do funil. Funcionam sem abrir o `tokens.css` nem o README.

## Conferir entre um e outro

```bash
cd gestao && npm run dev
```

- **1440px**, compare com o preview (`Cockpit de Gestão - Casca web.dc.html`, a aba correspondente)
- **1280px** — nada corta nem sobrepõe
- Alterne o tema pelo item no rodapé da sidebar e repita
- `npm run build` limpo
- Commit por prompt

## A terceira linha da resposta

Cada prompt termina pedindo três linhas: o que mudou, o que ficou fora do escopo, e **o que do preview não existe no código, nomeando o campo**.

Leia a terceira. O preview foi montado a partir dos títulos de seção que consegui ler no repo — `Cockpit.tsx`, `Prospeccao.tsx`, `Pessoas.tsx` e `Agenda.tsx` têm `.titulo-secao` literal. **Daily, Semana e Rotas montam o título em execução**, e ali a estrutura do preview é suposição minha.

Se o `G3`, o `G4` ou o `G6` responderem que o conteúdo real é outro, **isso é o prompt funcionando**. Me traga a resposta e eu ajusto o desenho, em vez de forçar o código a caber nele.

## O que não pode quebrar

- **A navegação por hash.** Os itens da sidebar são `<a href="#/{id}">`. Se virarem `onClick` + estado, recarregar volta para a Time e o voltar deixa de funcionar — bug já corrigido uma vez, com a história comentada no `App.tsx`.
- **As guardas de sessão e papel.** `carregando` / `anonimo` / `sem-permissao` continuam antes da casca, e as telas de aviso seguem sem sidebar.
- **Os nomes dos tokens.** `--panel`, `--ink`, `--line` e os outros são os que as sete telas usam. Só dois **valores** mudam, no `G1`: raio do cartão (12 → 8) e `--ter` (`#6b6b6b` → `#7A7A7A`).
- **O bootstrap do tema** no `gestao/index.html`, que roda antes do primeiro paint.
- **As consultas de dados.** Nenhum prompt muda `gestao/src/dados/`. Se um número do preview não existir lá, o prompt manda parar e dizer — não preencher.

## Quando algo dá errado

**"Não mudou nada."** O prompt provavelmente descreve algo já aplicado. Pergunte: *"esse arquivo pede para modificar algo que já existe ou para criar algo novo? o que você encontrou?"*

**"Fez metade."** Cite os itens do "Pronto quando" sem marcar e peça só eles. No `G8` isso é esperado.

**"Inventou número."** Confronte com `gestao/src/dados/`. A terceira linha da resposta deveria ter avisado.
