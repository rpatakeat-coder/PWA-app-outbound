# M4 — Agenda (prompt único)

**Arquivo:** `src/screens/AgendaScreen.tsx` (o `renderMeetingChip` é compartilhado com a ficha do lead — não mova)
**Referência visual:** `design_handoff_mobile_pwa/Field Sales - Mobile PWA.dc.html` + `screenshots/04-agenda.png`.
**Pergunta que a tela responde:** *o que eu tenho hoje, e a que horas?*

> Substitui `06a-tira-da-semana.md`, `06b-timeline-do-dia.md` e `06R-revisao.md` — leia só este.
> `M0`, `M1` (casca), `M2`/`M2b` (Mapa) e `M3` (Rota) já rodaram.
> **Não confundir com o `prompts-modais/M4-filtros.md`** — este é a Agenda.
>
> Tarefa única: **só esta tela**. Se encontrar algo errado em outra, anote e siga.

**Tokens mobile ≠ desktop.** Input 48px raio **16** · botão 48px raio 12 tipo 16/600 · card raio **16** · maior tipo Title Medium **18/24** · spacing só até **24** (única exceção: `padding-bottom: 40px` da reserva do FAB) · alvo **48px** · raios só `4 · 12 · 16 · pill`.

---

## 1 · Header e tira da semana

Header `padding:12px 16px`, fundo do tema: título **"Agenda"** 18/24 peso 600 + avatar 48px pill à direita.

**Tira da semana**, `margin-top:12px`, gap 6: sete botões `flex:1`, `min-height:48px`, raio 12, coluna centralizada gap 2 —

- dia da semana 11/16/0.5 peso 600, opacidade .8
- número 14/20/0.1 peso 700 `tabular-nums`
- **dot 4px** indicando se há compromisso naquele dia

**Hoje:** fundo `#fff`, texto `#C8131B`, dot `#C8131B` — no escuro, o par por opacidade (o mesmo do segmented do Mapa): fundo `rgba(255,255,255,.18)`, texto `--brand-text`, dot `--brand-text`.
**Outros:** fundo `rgba(255,255,255,.06)` no escuro / `rgba(255,255,255,.14)` no claro, texto branco, dot `rgba(255,255,255,.6)`.

> Sobre header escuro, o ativo precisa resolver **mais claro** que o inativo. Foi o defeito que apareceu no segmented do Mapa; não repita aqui.

**O calendário de 7 colunas do desktop não cabe em 390px** (os estilos `cal*` são desktop-only). A tira dá a visão da semana; o corpo mostra **um dia**. Estado novo: `diaSelecionado: Date`. Trocar o dia na tira troca o conteúdo do corpo — e só isso.

## 2 · Timeline do dia

Scroll `padding:16px 16px 40px` (a reserva do FAB), coluna gap 16.

Cada item é uma **linha de duas colunas**, gap 12:

- **Coluna de hora: 52px fixos** (`flex:0 0 52px`) — hora 14/20/0.1 peso 700 `--text` `tabular-nums` sobre duração 11/16/0.5 `--text-faint`. Fluida, as horas desalinham entre itens e a coluna deixa de se ler como régua.
- **Card** `flex:1`: `padding:16px`, raio **16**, fundo `--surface`, borda 1px `--border`, **borda esquerda 4px da cor do tipo**, sombra 01. Ícone 20px da cor do tipo + título 16/24/0.15 peso 600; sublinha 12/16/0.4 `--text-faint`.

**Três tipos, três cores, três ícones — nunca dois iguais:**

| Tipo | Cor | Ícone |
|---|---|---|
Rota | `#C8131B` | `IconCar` |
Demo | `#7c3aed` | `IconCalendar` |
Follow-up | `#01AFFF` | `IconCall` |

As três fontes continuam entrando no `allAgendaItems`: **`routeStops`, reuniões e follow-ups**. Não mexa na composição.

**Compromissos agendáveis** mostram, `margin-top:12px`, gap 8: **"Reagendar"** (altura 48, raio 12, fundo `--tint-red`, texto `--tint-red-text`) e **"Cancelar"** (altura 48, outline). 48px, não os 32 do desktop.

## 3 · Estados

- **Vazio:** copy original — **"Agenda vazia."** Ícone 40px `--text-faint`, `margin-bottom:12px`, texto 14/20/0.25 `--text-muted` centralizado.
- Cancelar/reagendar são otimistas: pinta na hora, reverte com aviso se falhar.
- **Sem swipe destrutivo** em item de agenda.

---

## Não fazer

- Não mova o `renderMeetingChip` — é usado pela Agenda **e** pela ficha do lead.
- Não porte os estilos `cal*` do desktop.
- Não mexa em `useMeetings` nem na composição do `allAgendaItems`.
- Não crie estado de dados novo. O único estado novo é `diaSelecionado`.

## Dois pontos herdados que se resolvem aqui

- **Reserva do scroll:** na Rota ela estava em 114px (`90 + 24 + insets`) e virou 40. Confira o mesmo nesta tela.
- **Overlays do mapa vazando:** o `renderMap` alimenta Mapa e Rota; se algum controle aparecer onde não deve, anote — a Agenda não tem mapa.

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Título 18/24 peso 600; avatar 48px.
2. Tira: sete botões `flex:1`, `min-height:48px`, raio 12, gap 6.
3. Dia 11/16/0.5 peso 600 + número 14/20/0.1 peso 700 `tabular-nums` + dot 4px.
4. Hoje destacado, e **no escuro o ativo resolve mais claro que o inativo**.
5. Trocar o dia na tira troca o conteúdo.
6. Coluna de hora com **52px fixos**; hora 14/20/0.1 peso 700 `tabular-nums`.
7. Card raio 16, sombra 01, borda esquerda 4px da cor do tipo.
8. Rota `#C8131B` / Demo `#7c3aed` / Follow-up `#01AFFF`, com ícones distintos.
9. As três fontes de dados aparecem.
10. "Reagendar" e "Cancelar" com 48px onde aplicável.
11. Scroll com `padding-bottom:40px`; rolando até o fim, o FAB não cobre botão.
12. Estado vazio com a copy original.
13. Nenhum hex fora dos literais permitidos; spacing ≤ 24 (+ a reserva de 40); raios só `4 · 12 · 16 · pill`; alvo ≥ 48.
14. `npm run typecheck` limpo.

Os controles desta tela na lista dos 23 abaixo de 48px — **`calNavBotao` / `calNavHoje`, 32px** — devem sair resolvidos (a tira substitui a navegação do calendário) ou ser declarados como desktop-only. Diga o que aconteceu.

**Conferir em 390 × 844**, comparar com `04-agenda.png`, **alternar o tema e repetir no escuro**.

## Ao terminar

Três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o campo, o ícone ou o estado que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
