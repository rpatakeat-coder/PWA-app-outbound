# M3 — Rota (prompt único)

**Arquivo:** `src/screens/RotaScreen.tsx` (+ `App.tsx` só para o que a tela recebe por props)
**Referência visual:** `design_handoff_mobile_pwa/Field Sales - Mobile PWA.dc.html` + `screenshots/03-rota.png`.
**Pergunta que a tela responde:** *qual é a próxima parada e como chego nela?* — a sequência é o objeto de trabalho; o mapa é orientação.

> Substitui `05a-header-e-mapa.md`, `05b-paradas.md` e `05R-revisao.md` — leia só este.
> `M0`, `M1` (casca) e `M2` (Mapa/Lista) já rodaram.
>
> Tarefa única: **só esta tela**. Se encontrar algo errado em outra, anote e siga.

**Tokens mobile ≠ desktop.** Input 48px raio **16** · botão 48px raio 12 tipo 16/600 · card raio **16** · maior tipo Title Medium **18/24** · spacing só até **24** (única exceção: `padding-bottom: 40px` da reserva do FAB) · alvo **48px** · raios só `4 · 12 · 16 · pill`.

---

## 1 · Header

`padding:12px 16px`, fundo do tema (`#C8131B` claro / `--surface` escuro).

- Kicker **"ROTA DE HOJE"** — 11/16, `letter-spacing:.12em`, peso 800, `rgba(255,255,255,.75)`, uppercase
- Data 18/24 peso 600
- Avatar 48px pill à direita (o do M1)

**Três KPIs** em linha, `margin-top:12px`, gap 12: cada um `padding:8px 12px`, raio 12, fundo `rgba(255,255,255,.14)` — valor 16/24 peso 700 `tabular-nums`, rótulo 11/16/0.5 peso 600 `rgba(255,255,255,.75)`.

**paradas · distância · em rota** — os três com valores reais do que a tela já calcula. Se um deles não existir, **diga qual e pare**; não crie consulta nova.

## 2 · Mapa em faixa

**`flex:0 0 180px`** — faixa, não tela cheia. Em rota o objeto de trabalho é a sequência de paradas; o mapa serve para orientar, não para explorar.

- Polyline `#C8131B` largura **4** (o desktop usa 5 — não copie), `round`
- **Geometria OSRM com o fallback tracejado preservados** — não mexa na fonte da rota
- Marcador da parada atual: 30×30 pill, borda 3px branca, número 12 peso 700 branco

## 3 · Lista de paradas

Scroll `padding:16px 16px 40px` (a reserva do FAB), coluna gap 12.

**Card:** `padding:16px`, raio **16**, fundo `--surface`, sombra 01, borda 1px — **`#C8131B` na parada atual**, `--border` nas outras.

**Índice** 32px pill, 14/32/0.1 peso 700:

| Estado | bg | fg |
|---|---|---|
Concluída | `#EAF7EE` | `#167532` |
Atual | `#C8131B` | branco |
Pendente | `--surface-2` | `--text-muted` |

**Nome** 16/24/0.15 peso 600, truncado com reticências, + **tag** opcional (`padding:2px 6px`, raio 4, 11/16/0.5 peso 600):

| Tag | bg | fg |
|---|---|---|
Visitado | `#EAF7EE` | `#167532` |
Agora | `--tint-red` | `--tint-red-text` |
SLA | `#FFF8EB` | `#99670F` |
Demo / Alvo | `#F1EBFE` | `#5B32C4` |

**Detalhe** 12/16/0.4 `--text-faint`: horário, cidade, motivo.

**Ações do card — o corte é por papel, não "tudo ou nada".** Hoje toda parada tem Subir, Descer, Remover e Abrir; o problema é ação demais em parada que não é a de agora, não a reordenação em si.

- **Parada atual:** **"Check-in"** (`flex:1`, altura 48, raio 12, `#27A84C`, texto 16/24/0.15 peso 600 branco, ícone `IconLocationFilled` 24px) + `navigation` 48×48 outline (`IconArrowFoward`). O check-in é o `handleMarkAsVisited` de verdade — com a validação de 200m — passado por **prop nova** (`onMarkVisited`). Ele **substitui o checkbox nesta parada** e, no sucesso, também chama o `toggleStopDone`: um estado de "feita", não dois.
- **Outras paradas:** o **checkbox fica**. É o caminho manual de corrigir a sequência (visitou antes, pulou, marcou errado) — sem GPS, e por isso não compete com o check-in: um é "estou aqui agora", o outro é "conserta a lista". Alvo de **48px por `padding`**, sem engordar o quadrado visual de 24.
- **Subir / Descer ficam no card**, discretos — reordenar é ação de rua e dois toques a mais custam caro em movimento.
- **Remover vai para o sheet** de configuração: é destrutivo. Alvo 40 lá dentro (ferramenta de configuração), não 48.
- **"Abrir" sai como botão** — o toque no card já abre o lead.

## 4 · Auxiliares — mover, não descartar

Três auxiliares empilham nesta tela e enterram a sequência: **"Rota do dia"**, **"Rota personalizada"** e **"Adicionar lead manualmente"**. Eles **não podem desaparecer**: vão para um **botão de configuração no header** (48×48, `rgba(255,255,255,.18)`, raio 12, `IconSettings`) que abre um **sheet de tela cheia** com a mesma casca dos outros sheets — header com `arrow_back` + título, corpo rolável `padding:16px`, seções em coluna gap 24. O **Remover** de parada entra ali como seção "Reordenar / remover paradas".

**`MinhaDailyCard` fica na tela**, acima da sequência: é resumo do dia, não configuração.

**`RouteConfigCard`, `RouteHistorySection` e `DismissedContaAlvoCard` vivem no `GestorScreen.tsx` — não toque neles.** Movê-los para cá deixaria o Gestor sem substituto.

**Declare na resposta onde cada auxiliar foi.**

## 5 · Estados

- **Vazio:** copy original mantida. Ícone 40px `--text-faint`, `margin-bottom:12px`, mensagem 14/20/0.25 `--text-muted` centralizada.
- **Check-in** mantém a validação de distância de 200m e a Task concluída no HubSpot — comportamento atual, inalterado.
- Ação de rede (check-in) é **otimista**: pinta na hora, reverte com aviso se falhar. Não tela de erro.
- **Sem swipe destrutivo** em card de parada.

## Sobre `drag_indicator`

Se a reordenação de paradas usar handle de arraste, `drag_indicator` **não existe** em `icons.tsx` e não tem equivalente. Nesse caso use os controles de mover que a tela já tiver (setas / ações explícitas) e **liste a ausência** — não desenhe SVG novo.

---

## Não fazer

- Não mexa na geometria OSRM, no fallback tracejado nem no `useRouteHistory`.
- Não mexa na validação de 200m do check-in nem no sync do HubSpot.
- Não descarte nenhum dos seis auxiliares.
- Não copie a largura 5 da polyline do desktop.
- Não redesenhe o `renderCompactClient` além do necessário para esta tela — se ele for compartilhado, anote.
- Não crie estado de dados novo.

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Kicker uppercase 11/16 `.12em` peso 800; data 18/24 peso 600; avatar 48px.
2. Três KPIs em `rgba(255,255,255,.14)`, valor 16/24 peso 700 `tabular-nums`, com dados reais.
3. Mapa em faixa de **180px**.
4. Polyline `#C8131B` largura **4**; geometria OSRM e fallback tracejado preservados.
5. Marcador da parada atual 30×30, borda 3px branca.
6. Card raio 16, padding 16, sombra 01; borda `#C8131B` só na atual.
7. Índice 32px pill com as três cores de estado.
8. Nome 16/24/0.15 peso 600 truncado; detalhe 12/16/0.4.
9. Tags com o tint certo: Visitado, Agora, SLA, Demo, Alvo.
10. Parada atual com "Check-in" (GPS, 200m) + `navigation` e **sem checkbox**; outras paradas com checkbox, Subir e Descer; Remover no sheet; "Abrir" removido.
11. Check-in `flex:1` altura 48 `#27A84C`.
12. Scroll com `padding-bottom:40px`; rolando até o fim, o FAB não cobre nenhum botão.
13. Os três auxiliares da tela alcançáveis pelo sheet, com destino declarado; `MinhaDailyCard` na tela; os três do Gestor intocados.
14. Estado vazio com a copy original.
15. Nenhum hex fora dos literais permitidos; spacing ≤ 24 (+ a reserva de 40); raios só `4 · 12 · 16 · pill`; alvo ≥ 48.
16. `npm run typecheck` limpo.

Os controles desta tela que estavam na lista dos 23 abaixo de 48px: **aba/remover 32** resolve indo para o sheet (alvo 40 lá dentro); **checkbox 24** sobe para alvo 48 por `padding`. Diga o que aconteceu com cada um.

**Conferir em 390 × 844**, comparar com `03-rota.png`, **alternar o tema e repetir no escuro**.

## Ao terminar

Três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o campo, o ícone ou o destino que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
