# M1 — Decisões sobre o mapeamento

> Respostas às quatro divergências levantadas no `M1-MAPEAMENTO.md`, mais as pendências que apareceram no inventário. **Leia este arquivo antes do `M1b-casca.md`.** Onde este arquivo contradiz o mapeamento, **este vence**.

O inventário estava certo em tudo que corrigiu. O painel de hoje é mais rico do que o mapeamento supunha, e três das quatro divergências são erros meus. Ponto por ponto.

## 1 · SLA com três estados — aceito a sua proposta

Você está certo: eu tratei o SLA como binário e ele tem três estados que informam coisas diferentes.

**Decisão, exatamente como você propôs:**

| Estado | Onde |
|---|---|
Estourado (breach) | faixa de alertas, régua `#C8131B`, fundo `#FAE8E9`, texto `--tint-red-text` |
≥ 70% do limite | faixa de alertas, régua `#FFB32F`, fundo `#FFF8EB`, texto `#99670F` |
Em dia | **sai da faixa** e vira linha na aba Dados: chave "SLA", valor "3/7 dias parado" |

A faixa passa a significar **só urgência** — é o que faz ela ser lida. O dado sobrevive nos três casos, e no estado saudável ele fica onde se procura dado, não onde se procura problema.

Na linha da aba Dados, o valor em `--text` normal com `tabular-nums`. Sem cor: "em dia" não precisa de verde para ser entendido.

## 2 · Telefone editável — aceito, e obrigado por barrar

Você está certo, e eu não sabia que ali havia escrita no HubSpot. Tratar como par chave/valor mataria a edição inline. Uma perda de função disfarçada de melhoria visual.

**Decisão:** o telefone é uma **linha especial** da aba Dados, alinhada ao mesmo grid das outras, com o campo no lugar do valor.

- Chave "TELEFONE" à esquerda, com o `IconCall`, igual às outras: 12/16/0.5 peso 600 `--text-faint`.
- No lugar do valor, o `TextInput`: altura 40 raio 8 (desktop) / 48 raio 16 (mobile), borda 1px `--stroke-strong`, fundo `--surface`, texto 14/20/0.25 (desktop) / 16/24/0.5 (mobile), `text-align:right` para casar com a coluna dos outros valores.
- **Botão "Salvar" só aparece quando o campo está sujo** — Small filled `#C8131B` (32px) no desktop, 48px no mobile, abaixo do campo. Em repouso a linha parece um dado como os outros; ao tocar, revela a ação.
- Foco: `outline: 2px solid #016999; outline-offset: 2px`.
- **Sem `Touchable` envolvendo o `TextInput`** — regra do `CLAUDE.md`, e ela vale aqui.
- As bordas `#2563eb` / `#e2e8f0` e o verde `#16a34a` do Salvar saem: borda `--stroke-strong` em repouso, `#016999` no foco, e o Salvar em `#C8131B`.

## 3 · Uso do produto na faixa de alertas — aceito

Se o código já documenta que é a primeira coisa a ver ao abrir um cliente, ele fica no topo. Eu não conhecia esse card.

**Decisão:** quarta linha da faixa, com a régua no tom que ele já calcula. **Ordem da faixa, de cima para baixo:**

1. **Uso do produto** — quando o tom é vermelho (sem comanda recente, ou cancelamento pedido)
2. **SLA** — estourado, depois âmbar
3. **Localização aproximada**
4. **Uso do produto** — quando o tom é âmbar ou verde
5. **Visita realizada**

O critério: **quem perde dinheiro primeiro fica no topo.** Cliente em cancelamento vem antes de SLA de prospecção; SLA estourado vem antes de aviso de geolocalização; "visita realizada" é confirmação, não urgência, e fecha a faixa.

Se você achar essa ordem difícil de implementar por causa de como o tom é calculado, uma faixa com **ordenação por severidade** (vermelho → âmbar → verde, independente do tipo) resolve o mesmo problema com menos código. Aceito as duas.

## 4 · Rodapé fixo vs. peek — os dois ficam, e a copy é a sua

**O botão em dois lugares é intencional.** São dois momentos: no peek o vendedor está na rua olhando o mapa e faz check-in sem ler nada; na ficha cheia ele leu o histórico e decide. Mesma ação, dois níveis de contexto. Não é duplicação a remover.

**A copy é a que já existe.** "Marcar como visitado" e "Re-marcar visita" são do app; o "Marcar visita (GPS)" foi invenção minha e está errado. **Mantenha o que está no código.** Isso vale para toda copy que eu tenha reescrito sem motivo — se o mapeamento propõe um rótulo diferente do que existe e não há razão declarada, o do código vence.

**A cor unifica em `#27A84C`** nos dois lugares e nas duas plataformas. Hoje o mobile usa `#C8131B` na ficha cheia e verde no peek — a mesma ação em duas cores é o defeito real ali.

## Pendências do inventário — decididas

### Ícones que não existem

**Mantenha os improvisos.** Não desenhe ícone novo, não use emoji.

| Precisa | Use |
|---|---|
`location_off` | `IconLocation` com `fill` em `#FFB32F` — a cor carrega o sentido |
`add_road` | `IconCar` |
`directions_walk` | o `IconUser` que já está lá |
`map` | `IconExternalLink` que já está lá |
`delete` | **sem ícone**, só o rótulo em `--tint-red-text` — é a última linha do menu, separada por borda; não precisa de reforço |
`edit_location` | `IconPencil` que já está lá |

**ID HubSpot** (o emoji 🆔): se não houver ícone neutro em `icons.tsx`, **deixe a linha sem ícone**. Uma linha sem ícone entre linhas com ícone é menos ruído que um emoji num sistema que não usa emoji. Se achar algo como `IconTag`, `IconHash` ou `IconId`, use e me diga qual.

**Ícone de ETAPA**: o `IconUndo` atual não tem relação com etapa. Troque por `IconTrendingUp`, que é o mesmo da ação "Mudar etapa" — o ícone passa a significar a mesma coisa nos dois lugares.

### Os sete itens fora da lista

Todos aceitos onde você propôs:

- **Peek sheet** — intocado. As quatro faixas descrevem só o estágio `cheia`. Confirmado.
- **Card Conta Alvo** (nota e avaliações do Google + "Não interessa") — aba Dados, acima da Observação principal. Você está certo: não é urgência, é contexto.
- **Uso do produto** — faixa de alertas, conforme o ponto 3.
- **EMAIL** e **BAIRRO** — aba Dados, na sequência dos outros campos.
- **"Ver histórico completo (n)" / "Mostrar menos"** — mantido no fim da lista da aba Histórico.
- **Editar / apagar nota do próprio autor** (`isMine`, edição inline) — dentro do item da timeline. **Não remova.**
- **Alça de arraste (mobile)** — acima do topo fixo.

### Coisas que eu errei no diagnóstico

Registrado, para o prompt de implementação não perseguir fantasma:

- **Não existe salmão.** "Adicionar nota" já é `#C8131B`.
- **"Remover" não é rosa** — é `var(--tint-red)` com texto `--brand-text`, que é o tint do sistema. **A cor está correta**; muda só o formato, de botão de largura total para item de menu.
- **A confirmação de remoção já está correta** — o `Alert` do app é Modal próprio, não `confirm()`. Só migra o gatilho.
- **Não são sete cores**, são duas fora do sistema: o laranja `#ff7a59` e o preto `#222222`. Essas duas saem.
- **MRR não existe** em lugar nenhum do painel. Nada a remover.
- **Nove itens de menu, seis eram largura total.** Sua contagem está certa.

### Ordem da aba Dados

Com os campos que apareceram no inventário:

1. Card **Conta Alvo** (quando houver)
2. Card **Observação principal** (quando houver)
3. **CONTATO** (condicional, como já é — sem empresa, não repete)
4. **TELEFONE** (linha especial, editável)
5. **EMAIL**
6. **ETAPA**
7. **SLA** (só no estado "em dia")
8. **ENDEREÇO** · **BAIRRO** · **CIDADE / UF** · **CEP**
9. **COORDENADAS** (`tabular-nums`)
10. **EMPRESA**
11. **RESPONSÁVEL**
12. **ID HUBSPOT** (`tabular-nums`)
13. **CRIADO / ATUALIZADO**
14. Linha de link **"Abrir no HubSpot"** — `#018CCC`, `open_in_new`/`IconExternalLink`, alvo de 48px no mobile

O critério: o que o vendedor usa para **agir** (contato, telefone, etapa) antes do que ele usa para **localizar** (endereço), antes do que é **registro** (empresa, id, datas).

**EMPRESA depois do endereço** porque o nome da empresa já é o título do painel — repetido no topo da lista é redundância; no fim, é confirmação de cadastro.

## Hexes crus que saem

Todos que você listou, trocados por token:

| Sai | Entra |
|---|---|
`#fefce8` (fundo âmbar do geo) | `#FFF8EB` |
`#92400e` (texto âmbar) | `#99670F` |
`#f0fdf4` (fundo verde) | `#EAF7EE` |
`#166534` (texto verde) | `#167532` no claro, `--tint-green-text` quando for cor de texto sobre superfície do tema |
`#2563eb` (borda do telefone) | `--stroke-strong`, foco `#016999` |
`#e2e8f0` | `--border` |
`#16a34a` (Salvar do telefone) | `#C8131B` |
`#3b82f6` (régua da timeline) | régua sai |
`#ff7a59` (HubSpot) | link `#018CCC` |
`#222222` (adicionar à rota) | item de menu, sem cor própria |

Os que quebravam no escuro eram os quatro primeiros — e é por isso que a faixa de alertas tem que usar os tints do sistema, que já têm par escuro.

## O que fazer agora

Nada de código ainda. Responda:

1. Confirme que aceita as decisões 1–4 como estão, ou aponte onde ainda discorda.
2. Diga se prefere a **ordem por tipo** ou a **ordem por severidade** na faixa de alertas (ponto 3).
3. Diga se achou algum ícone neutro em `icons.tsx` para o ID HubSpot.
4. Aponte qualquer coisa na **ordem da aba Dados** que atrapalhe a implementação — por exemplo, se algum campo depende de outro para renderizar.

Depois disso: `M1b-casca.md`.
