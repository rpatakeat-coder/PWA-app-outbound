# M1 — Decisões, rodada 3

> Responde os três pontos do `M1c`, aprova o `M1c2` e dá a regra que faltava para o badge de status. **Vale sobre os arquivos anteriores** onde houver conflito.

## 1 · Empilhamento: não empilhe. A especificação estava errada

Seu argumento vence, e o motivo é o que eu não sabia: **o `selectedClient` é um snapshot em estado, não uma query.** Reabrir o painel depois de mudar etapa mostraria o lead com a etapa antiga — pior que fechar, porque parece bug.

**Decisão:** mantenha `setSelectedClient(null)`. Um overlay por vez.

E o comportamento correto depois de confirmar a mudança de etapa é **não reabrir nada**: o mapa e a lista já refletem o novo estado, e é para lá que o vendedor volta. Se algum dia o painel passar a ler de query em vez de snapshot, aí o empilhamento vale a conversa — hoje, não.

Corrigido no `M1c`: a frase "no mobile os dois empilham sobre este painel; voltar reabre este" **sai**. Onde eu escrevi empilhamento em outro prompt (o `M1f` fala de estágios do peek, que é outra coisa), vale esta decisão.

## 2 · Badge de status: mantenha o fill sólido, com a regra de contraste

Você está certo em parar. Tint derivado de hex arbitrário é aposta — `client_statuses` é cadastrado pela interface, e ninguém garante que o hex tem luminância que aceite um tint legível.

**Decisão: fill sólido na cor cadastrada, e o texto escolhido por luminância.**

```
luminância relativa (WCAG) do statusColor
  > 0.45  →  texto #222222
  ≤ 0.45  →  texto #FFFFFF
```

É a única regra que funciona sem conhecer o hex de antemão, e resolve tanto o roxo escuro quanto o amarelo claro. Padding `4px 8px`, raio 4, 11/16/0.5 peso 600 — a mesma anatomia dos outros badges.

Se a função de luminância não existir no projeto, é curta o bastante para viver ao lado do badge; não crie utilitário novo se for usada só ali.

**"≈ Aprox." vira ícone**, como o mapeamento pede — esse é nosso, `#FFB32F`, e não tem risco de contraste: `IconLocation` 16px com `fill` âmbar, ao lado do kicker, com `title` explicando. O detalhe completo já está na faixa de alertas; um badge com texto é dizer duas vezes.

## 3 · Copy do kicker: a sua versão fica

"`· sem visita`" é melhor que omitir o segmento, e por duas razões que eu não pesei: **carrega informação** (nunca visitado é diferente de não sei) e **mantém peek e ficha dizendo a mesma coisa**. Minha regra otimizava por concisão e perdia um dado.

**Decisão: mantenha o que está no código.** E a regra geral do `M1-DECISOES-2` se aplica aqui — copy que existe vence copy que eu inventei, quando não há razão declarada para trocar.

## M1c2: aprovado

Sua razão 2 é a que decide: **tirar os seis botões do corpo agora significa mexer no corpo duas vezes**, e a segunda passada desfaz parte da primeira. O menu depende da estrutura de abas para saber de onde os itens saem.

**Ordem nova:** `M1d-corpo.md` → **`M1c2` (menu)** → `M1e` → `M1f` → `M1R`.

O menu entra depois do corpo, não antes. Quando chegar a hora, me diga e eu escrevo o `M1c2` — ou, se preferir, escreva você a partir da tabela de destinos do `M1-MAPEAMENTO` (os nove itens estão lá com ícone e ordem) e eu reviso.

Duas coisas para o `M1c2` carregar quando existir:

- **`IconTrash` na última linha**, separada por borda superior, rótulo e ícone em `--tint-red-text`.
- **A confirmação de remoção não muda** — só o gatilho migra. O `Alert` do app já é Modal próprio.

E registro o bug que você corrigiu de passagem: **o ⋮ desaparecia inteiro num cliente**, porque estava dentro de `onChangeStage || onScheduleMeeting` e `onChangeStage` só existe para `status === 'lead'`. Isso não estava em nenhum prompt. Boa.

## Sobre o teste da casca

28 verificações no Chrome real, cinco ciclos de `Esc`, `history.length` estável. É mais do que eu pedi.

A falha que você achou no próprio teste — medir a folha a 100ms, no meio da animação — vale como nota para os próximos: **espere o transform assentar, não um sleep fixo.** Qualquer medição de geometria durante entrada de overlay vai mentir.

## O "Modernist"

Ruído do meu lado — é um sistema visual anexado ao projeto de design, sem relação com este app. **Ignore.** O painel segue o UI Kit da Takeat, como todos os prompts descrevem.

## Segue

```
Leia prompts-modais/M1d-corpo.md e execute o que está descrito.
Não faça nada além do que o arquivo pede.
```

Um aviso sobre o `M1d`, na mesma linha dos dois do `M1c`: ele foi escrito antes de você me contar do card **Conta Alvo**, do card **Uso do produto**, dos campos **EMAIL** e **BAIRRO**, do **"Ver histórico completo"** e da **edição inline de nota do próprio autor**. Os seis estão nas decisões da rodada 1 com destino definido, mas **o texto do `M1d` não os menciona** — leia os dois arquivos juntos, e o das decisões vence.

Se a aba Dados sozinha ficar grande demais para uma passada, pare depois dela e me diga; Histórico e Agenda podem ser um `M1d2`.
