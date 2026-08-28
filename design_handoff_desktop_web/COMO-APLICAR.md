# Como aplicar isto com o Claude Code

Escrito depois de três tentativas que falharam. Cada falha tinha uma causa diferente e evitável.

## O que não funciona

**Jogar a pasta no repo e dizer "aplica esse design".** Foi a primeira tentativa. O Claude Code lê o README de 60 KB, começa pelo que está à mão — a casca, o header, o mapa — e para antes das telas grandes. `App.tsx` tem 8.445 linhas; três telas são funções de 200 a 600 linhas dentro dele. Não cabe numa sessão.

**Mandar um prompt por tela.** Segunda tentativa. Melhor, mas ainda grande: uma tela inteira tem casca + conteúdo + estados + responsivo, e ele entrega os primeiros 60% e declara pronto.

**Prompt de revisão para tela que não existe.** Terceira. O prompt dizia "reestilize o drawer para 480px" e o drawer não existia no código — nada para reestilizar, zero diff, e a impressão de que o prompt não funcionou.

## O que funciona

### 1 · A pasta vai para dentro do repo

```
PWA-app-outbound/
├── App.tsx
├── src/
└── design_handoff_desktop_web/     ← a pasta inteira, aqui
    ├── README.md
    ├── screenshots/
    ├── prompts/
    └── Field Sales - Desktop.dc.html
```

Precisa estar **no repo**, não anexada ao chat: os prompts referenciam `design_handoff_desktop_web/README.md` e os screenshots por caminho relativo, e o Claude Code lê arquivo do projeto, não anexo de conversa.

Commite numa branch separada se preferir não sujar a `main`:

```bash
git checkout -b redesign-desktop
git add design_handoff_desktop_web
git commit -m "handoff: design desktop"
```

### 2 · Um prompt por sessão

Abra o Claude Code na raiz do repo e diga **exatamente isto**, trocando o caminho:

```
Leia design_handoff_desktop_web/prompts/09-gestor/09a-LEIA-o-que-mudou.md
e execute o que está descrito. Não faça nada além do que o arquivo pede.
```

Nada mais na mensagem. Sem "e depois faça o resto", sem "aplique todo o design". Uma frase, um arquivo.

**Por que apontar o arquivo em vez de colar o conteúdo:** colado, o prompt perde os caminhos relativos — ele não acha o README nem os screenshots. Lido do disco, acha.

### 3 · Ler a resposta antes de seguir

Todo prompt termina pedindo três linhas: **o que mudou**, **o que ficou fora do escopo**, e **o que da especificação não deu para aplicar e por quê**.

**A terceira linha é a que importa.** É onde aparece "o campo X não existe no tipo" ou "esse número não vem do hook". Se ela vier vazia em toda tarefa, desconfie: ou o design casou perfeitamente com o código (raro), ou ele preencheu com valor inventado.

### 4 · Conferir na tela, não no diff

```bash
npm run typecheck   # antes de qualquer coisa
npm start
```

Abra a tela em **1440px**, compare com o screenshot em `screenshots/`. Depois **1024px** e **900px**. Depois alterne o tema e repita — o modo escuro é onde os problemas de contraste aparecem.

### 5 · Commit por prompt

```bash
git add -A && git commit -m "gestor: composição da base (09b)"
```

Um commit por prompt. Quando algo quebrar três tarefas depois, você volta uma, não onze.

## A sequência do gestor

| Ordem | Arquivo | Edita código? |
|---|---|---|
1 | `09a-LEIA-o-que-mudou.md` | **não** — só leitura e relatório |
2 | `09b-snapshot.md` | sim |
3 | `09c-atividade.md` | sim |
4 | `09d-ranking.md` | sim — a maior |
5 | `09e-rail.md` | sim |
6 | `09f-drill-down.md` | sim |
7 | `09R-revisao.md` | **duas fases** — audita, você confirma, aí corrige |

**O `09a` não pode ser pulado.** Ele lê o `useGestorMetrics.ts` e responde quais métricas existem de fato. A primeira versão deste design assumiu funil por etapa, heatmap, MRR e taxa de conversão — **nada disso existe no banco**. Sem o 09a, o Claude Code enche a tela de números inventados.

### O prompt de revisão é diferente

O `09R` trabalha em duas fases e **isso precisa ser respeitado**:

```
Leia design_handoff_desktop_web/prompts/09-gestor/09R-revisao.md
e execute APENAS a Fase 1. Não edite nenhum arquivo.
```

Ele responde 33 itens com OK / FALTA / DIVERGE. Você lê, decide o que vale corrigir, e só então:

```
Corrija os itens 4, 11 e 19 da Fase 1. Um por vez.
```

Se você deixar ele auditar e corrigir na mesma sessão, ele corrige o que achou primeiro e para no meio.

## Quando algo dá errado

**"Não mudou nada."** O prompt provavelmente descreve algo que já está aplicado, ou descreve como revisão algo que precisa ser construído. Pergunte: *"esse arquivo pede para modificar algo que já existe ou para criar algo novo? o que você encontrou no código?"*

**"Fez metade."** A tarefa era grande demais. Peça a segunda metade explicitamente, citando os itens do "Pronto quando" que ficaram sem marcar.

**"Inventou número."** Rode o prompt de inventário da tela (`09a` no gestor, `M1a` no painel do lead) e confronte.

**"Quebrou outra tela."** Todo prompt diz "não toque em outro arquivo". Se o diff pegou arquivo fora do escopo, `git checkout` nele e rode de novo com: *"o escopo é apenas `<arquivo>`. Reverta qualquer alteração fora dele."*

## O que nunca deve entrar no diff

Está listado em cada prompt, mas vale ter à mão. Se aparecer, é regressão:

- `queryKey` do `useGestorMetrics` — sem ela estável, o React Query entra em refetch infinito nos presets relativos. O bug já aconteceu e está comentado no hook
- o filtro de contas RPA (`HIDDEN_SELLER_PATTERN`) e a ordenação — os dois vivem no hook, não no componente
- `exportReport` e a edge `export-report` — valida por lista fixa de e-mails, não por `role`
- clustering do mapa e o carregamento por área visível
- `src/constants/stages.ts`
- service worker, `useForceReload`, `vercel.json`
