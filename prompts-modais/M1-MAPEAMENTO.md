# M1 — Painel do lead: mapa do que existe e para onde vai

> **Rode este arquivo primeiro. Ele não edita código.**
>
> O painel em produção tem **muito mais** que o desenho de referência mostra. O desenho era uma simplificação; aplicá-lo literalmente **removeria funcionalidade**. Este arquivo lista tudo o que existe hoje e diz onde cada coisa vai no layout novo. Nada é descartado.

**Arquivo:** `App.tsx` (o painel aberto por `selectedClient`)

## O problema do painel atual

Não é falta de conteúdo — é falta de hierarquia. Em produção:

- **Onze botões de largura total**, empilhados, todos com o mesmo peso visual: Re-marcar visita, Editar, Abrir no HubSpot, Adicionar nota, Adicionar a rota de hoje, Carro, A pé, Abrir no Google Maps, Abrir WhatsApp, Agendar reunião, Marcar Follow Up, Mover para etapa, Editar localização, Remover. Quando tudo grita, nada é ouvido.
- **Sete cores de botão** sem sistema: vermelho, verde, laranja, salmão, preto, cinza, rosa. O laranja do HubSpot e o salmão da nota não existem no design system.
- **~2.000px de rolagem** para uma ficha. A ação mais frequente — check-in — está a 400px do topo; "Remover", a mais destrutiva, está no fim, com o mesmo peso de "Editar".
- **Três alertas competindo** no topo (SLA estourado, visita realizada, localização aproximada) antes de qualquer dado.
- No desktop é a mesma coluna estreita esticada.

## Inventário — tudo o que existe hoje

Confirme cada item no código e marque o que encontrar. **Se algo desta lista não existir, diga; se existir algo fora dela, acrescente.**

### Identificação
1. Kicker: dot da temperatura + "LEAD MORNO · 1ª VISITA"
2. Avatar circular com o ícone da marca
3. Nome da empresa
4. "Contato: {nome}"
5. Badge de status ("Lead")
6. Badge "≈ Aprox." (localização aproximada)
7. Botão X

### Ações do topo
8. "Mudar etapa" (filled vermelho)
9. "Agendar" (outline vermelho)
10. "⋮" (menu)

### Alertas
11. **SLA**: "SLA estourado — 50 dias parado (limite 4)" — faixa vermelha
12. **Visita**: "1 visita realizada / Última: {data}" — faixa verde
13. **Localização aproximada**: título + duas linhas de detalhe — faixa âmbar

### Visita
14. "Re-marcar visita" (filled verde)
15. "Editar" (outline)

### Dados — cada um com ícone
16. EMPRESA · 17. TELEFONE · 18. ENDEREÇO · 19. CIDADE / UF · 20. CEP · 21. COORDENADAS · 22. ETAPA · 23. ID HUBSPOT · 24. CRIADO / ATUALIZADO

> **Decisão do time:** se existir campo de **MRR** no painel, ele **sai**. Não migre para nenhuma aba. Os nove acima ficam, e o **contato** (item 4) entra como campo próprio além da sublinha.

### Integração
25. "Abrir no HubSpot ↗" (filled laranja)

### Notas
26. "OBSERVAÇÃO PRINCIPAL" + o texto
27. HISTÓRICO (n) — timeline com: ícone do tipo, **nome de quem fez**, data/hora, descrição, e régua colorida à esquerda
28. Campo "Adicionar nova nota..."
29. "Adicionar nota" (filled salmão)

### Rota
30. "Adicionar a rota de hoje" (filled preto)
31. "TRAÇAR ROTA" · "Carro" e "A pé" (outline, lado a lado)
32. "Abrir no Google Maps" (outline)
33. "Abrir WhatsApp" (outline)

### Reuniões
34. "REUNIÕES (n)" + card da reunião com data, duração, status e observação
35. "Agendar reunião" (filled vermelho)

### Follow-ups
36. "FOLLOW UPS" + "Nenhum follow up marcado."
37. "Marcar Follow Up" (outline)

### Ações finais
38. "Mover para etapa" (outline)
39. "Editar localização (mover pin)" (outline)
40. "Remover" (filled rosa)

## Para onde cada coisa vai

O painel passa a ter **quatro faixas**: topo fixo, alertas, corpo em abas, rodapé fixo.

### Topo fixo — identificação e as três ações principais

| Item | Tratamento |
|---|---|
1 | Kicker: dot 10px de `TEMP_COLORS` + texto 11/16/0.5 peso 600 `--text-faint` uppercase |
2 | **Sai.** O avatar com o ícone da marca não identifica *este* lead — é o mesmo em todos. Ganha 48px de altura |
3 | Nome 18/24 peso 600 `--text`, truncado |
4 | Junto do telefone na sublinha: "Julio · (21) 2580-5773" 12/16/0.4 `--text-faint`. **E também como campo próprio** na aba Dados |
5 | Badge de status ao lado do kicker: `padding:4px 8px` raio 4, 11/16/0.5 peso 600, tint do status |
6 | **Vira ícone**, não badge: `` `location_off` `` 16px `#FFB32F` ao lado do kicker, com `title` explicando. O detalhe completo fica no alerta (item 13) |
7 | X 40×40 raio 8 (desktop) / 48×48 raio 12 `--surface-2` (mobile) |
8 | Large filled `#C8131B`, `flex:1`, ícone `trending_up` |
9 | Large outline `#C8131B`, `flex:1`, ícone `event` |
10 | 40×40 raio 12 outline, ícone `more_horiz`. **Recebe os itens 38, 39 e 40** |

### Faixa de alertas — logo abaixo do topo, antes do corpo

Os três viram uma faixa compacta, **ordenada por urgência**, cada um em uma linha de `padding:12px 16px` com **régua esquerda de 3px** e ícone 20px:

| Alerta | Régua / ícone | Fundo | Texto |
|---|---|---|---|
11 · SLA estourado | `#C8131B` / `warning` | `#FAE8E9` | `--tint-red-text` |
13 · Localização aproximada | `#FFB32F` / `location_off` | `#FFF8EB` | `#99670F` |
12 · Visita realizada | `#167532` / `where_to_vote` | `#EAF7EE` | `#167532` |

- Texto principal 14/20/0.25 peso 600; detalhe 12/16/0.4 na mesma cor a 80% de opacidade.
- **O alerta de localização colapsa**: mostra só a primeira linha, com as duas linhas de detalhe atrás de um "por quê?" (text button). Em produção ele ocupa quatro linhas para dizer uma coisa.
- Sem alerta, a faixa não existe.
- **Nenhum dos três é card com sombra** — são faixas de largura total, sem raio no mobile, raio 8 no desktop.

### Corpo — três abas

O conteúdo atual são cinco blocos que ninguém lê inteiros. Viram abas: **Dados · Histórico (n) · Reuniões (n)**.

Abas: altura 40 (desktop) / 48 (mobile), `flex:1`, borda inferior 2px — ativa `#C8131B` com texto `--tint-red-text` peso 600, inativa transparente com `--text-muted`. Contagem no rótulo.

**Aba DADOS**
- Itens 16–24 como pares chave/valor: `padding:10px 0` (desktop) / `12px 0` (mobile), borda inferior 1px `--border`. Chave 12/16/0.5 peso 600 `--text-faint` com o ícone 16px que já existe hoje; valor 14/20/0.25 `--text` à direita.
- **Mantenha os ícones** — são o que faz nove linhas serem varríveis.
- No mobile, valor longo (endereço, coordenadas) empilha: chave acima, valor abaixo em 16/24/0.5.
- COORDENADAS e ID HUBSPOT com `tabular-nums`.
- **Item 25 (Abrir no HubSpot) permanece** — é decisão do time, e é o caminho para o registro completo. Vira uma **linha de link no fim da aba**: ícone `open_in_new` 20px + "Abrir no HubSpot" 14/20/0.1 peso 600 `#018CCC`, com alvo de 48px no mobile. **Só o laranja sai** (não existe no design system); o link fica.
- **Item 4 (contato) entra também como campo** — "Contato" e "Telefone" abrem a lista de dados, antes de Etapa. Continuam na sublinha do topo, mas ali é identificação; aqui é dado copiável.
- **MRR: se existir, remova.** Decisão do time.
- **Item 26 (observação principal)** vai para o topo desta aba, em card `--surface-2` `padding:16px` raio 8/16, com cabeçalho "OBSERVAÇÃO PRINCIPAL" 12/16/0.5 peso 700 uppercase.

**Aba HISTÓRICO**
- Item 27, mantendo tudo o que já mostra: **nome de quem fez** (é a informação que responde "quem moveu essa etapa" e não pode sair), tipo, data/hora, descrição.
- Ícone em pill 32px com o tint do tipo: mudança de etapa `#FFF1E0`/`#8A4A0C` · nota `--surface-2`/`--text-muted` · reunião `#F1EBFE`/`#5B32C4` · check-in `#EAF7EE`/`#167532`.
- **A régua colorida à esquerda de cada item sai** — o pill do ícone já carrega a cor; duas marcas para o mesmo dado é redundância.
- Autor 12/16/0.5 peso 600 `--text-muted` + data 12/16/0.4 `--text-faint` na mesma linha; descrição 14/20/0.25 `--text` abaixo.
- Itens 28 e 29 (adicionar nota) ficam **no fim da aba**, não no meio do painel: campo de 48px raio 16 (mobile) / 40px raio 8 (desktop) + botão "Adicionar nota" **Large filled `#C8131B`**. O salmão sai.

**Aba REUNIÕES**
- Item 34: card por reunião, `padding:16px`, raio 8/16, borda 1px `--border`, **borda esquerda 3px** na cor do estado — passada `--text-faint`, futura `#7c3aed`, cancelada `#475569`. Data e duração 14/20/0.1 peso 600; observação 12/16/0.4 `--text-faint`.
- Item 35 "Agendar reunião" → Large filled `#C8131B` no fim da aba.
- Itens 36 e 37 (follow-ups) **entram nesta aba**, em seção própria com cabeçalho "FOLLOW UPS": ou a lista, ou "Nenhum follow up marcado." 14/20/0.25 `--text-muted`, mais "Marcar Follow Up" Large outline.
- A aba passa a se chamar **"Agenda (n)"**, somando reuniões e follow-ups na contagem.

### Rodapé fixo — a ação do momento

Só **uma** ação, sempre visível, sem rolar:

- **Item 14**: "Re-marcar visita" (ou "Marcar visita (GPS)" se nunca houve check-in) — Large filled `#27A84C`, largura total, ícone `where_to_vote`.
- **Item 15 ("Editar")** vai para o menu ⋮.

### Menu ⋮ — o que era botão de largura total

Lista de linhas de 56px (mobile) / 40px (desktop), ícone 20px + rótulo:

| Item | Ícone |
|---|---|
15 · Editar lead | `edit` |
30 · Adicionar à rota de hoje | `add_road` |
31 · Traçar rota: Carro | `directions_car` |
31 · Traçar rota: A pé | `directions_walk` |
32 · Abrir no Google Maps | `map` |
33 · Abrir WhatsApp | `chat` |
38 · Mover para etapa | `trending_up` |
39 · Editar localização (mover pin) | `edit_location` |
40 · **Remover** | `delete`, rótulo e ícone em `--tint-red-text`, separado por borda superior 1px `--border` |

**"Remover" pede confirmação** em um segundo passo — o `.dialog` do sistema, nunca `confirm()` do browser. Em produção é um botão de largura total ao lado de "Editar localização"; um toque errado apaga o lead.

**Carro / A pé**: se hoje são dois botões que escolhem o modal de rota, mantenha os dois como itens; a ação continua a mesma (`openNavigation` com o modo).

### Desktop — o que muda além dos tamanhos

Drawer de 480px à direita, `height:100vh`. As quatro faixas iguais. Duas diferenças:

- A faixa de alertas usa raio 8 e `margin:16px 24px 0`, não largura total.
- O menu ⋮ é um popover ancorado ao botão, não uma lista no fim do corpo.

## O que NÃO pode acontecer

- **Nenhum dos 40 itens desaparecer.** Reorganizar, sim; remover, não. As exceções são o item 2 (avatar genérico) e a régua colorida do histórico — as duas justificadas acima, e nenhuma delas é funcionalidade.
- Não mexa em: validação de distância do check-in, Task no HubSpot, `openNavigation`, o link do HubSpot, a criação de nota, `stages.ts`, clustering do mapa.
- Não invente campo. Os nove dados listados existem — se algum não existir no tipo `Client`, diga qual.
- **Três decisões do time, não negociáveis:** o **link do HubSpot fica**; o **contato** aparece na sublinha *e* como campo; o **MRR sai** do painel.

## Pronto quando

- [ ] você confirmou os 40 itens no código e listou o que encontrou fora da lista
- [ ] para cada item, você disse **onde ele vai** no layout novo
- [ ] você apontou qual ação hoje é botão de largura total e passa a ser item de menu (são nove)
- [ ] você listou as cores que saem por não existirem no design system (laranja do HubSpot, salmão da nota, preto da rota, rosa do remover)
- [ ] **nenhum arquivo foi modificado**

## Ao terminar

Responda com a tabela item → destino. Se discordar de algum destino, diga qual e por quê **antes** de qualquer edição — é mais barato discutir agora que refazer depois.
