# M3 — Overlay do compromisso na Agenda

**Arquivos:** `src/screens/AgendaScreen.tsx`, `src/screens/ScheduleMeetingModal.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md` §*3. Agenda* e §*10. Agendar* · `design_handoff_desktop_web/README.md` §*4. Agenda* e §*13. Agendar (modal)*

> Tarefa única: **só este overlay**. Não mexa na tela que o abre, nem em outro modal. Se encontrar algo errado fora do escopo, anote e siga.
>
> **Este prompt cobre as duas plataformas.** Os valores são diferentes — aplique o bloco da plataforma que você está editando e não copie valor de uma para a outra:
>
> | | Mobile (< 1024px) | Desktop (≥ 1024px) |
> |---|---|---|
> | Input | 48px, raio **16** | 40px, raio 8 |
> | Botão | 48px, raio 12, tipo 16/600 | 40px, raio 12, tipo 14/600 |
> | Card / painel | raio **16** | raio 8 |
> | Maior tipo | 18/24 | 22/28 |
> | Spacing | até 24 | até 40 |
> | Alvo | **48px** | 40px |
> | Forma | bottom sheet ou tela cheia | drawer 480px ou modal centrado |

## O que existe hoje

Tocar um item da agenda abre a ficha do lead. Não há como reagendar nem cancelar sem sair da tela, achar o lead e recomeçar. Três tipos de item convivem na agenda — **Rota**, **Demo** e **Follow-up** — e nem todos podem ser reagendados.

## O overlay: um sheet de detalhe do compromisso

Aberto ao tocar/clicar no item. **Não é a ficha do lead** — é o compromisso.

- **Mobile**: bottom sheet, `max-height:92%`, raio `16px 16px 0 0`, fundo `--surface`, handle 36×4 centralizado. Fecha no arraste para baixo, no overlay, no X e no voltar do sistema.
- **Desktop**: o **drawer padrão de 480px** à direita — o mesmo componente da ficha do lead. Não invente um modal centrado só para isso.

**Topo** (borda inferior 1px `--border`):

- Faixa de tipo: quadrado 10px raio 2 na cor do tipo + rótulo do tipo 11/16/0.5 peso 600 uppercase `--text-faint`. **Rota `#C8131B` · Demo `#7c3aed` · Follow-up `#01AFFF`** — as mesmas cores do item na agenda, para o overlay ser reconhecidamente a continuação do que foi tocado.
- Título do compromisso: 18/24 peso 600 `--text`.
- Sublinha 12/16/0.4 `--text-faint`: data, hora, duração e local ou canal.
- X em 48×48 raio 12 `--surface-2` (mobile) ou 40×40 raio 8 hover `--surface-2` (desktop).

**Corpo** — gap 16 (mobile) / 24 (desktop):

- Lead vinculado, em linha tocável que **abre a ficha do lead**: barra de temperatura 4px + nome 16/24/0.15 peso 600 (mobile) ou 14/20/0.1 peso 600 (desktop) + `chevron_right`. É o único caminho entre os dois overlays — e ele empilha, não substitui.
- Observações do compromisso, se houver: `padding:16px`, raio 16 (mobile) / 8 (desktop), fundo `--surface-2`, texto 14/20/0.25 `--text-muted`.
- Para item de **Rota**: em vez de observações, a lista resumida das paradas, com o índice em pill 28px e o nome truncado.

**Ações** — dependem do tipo. Este é o ponto que mais erra:

| Tipo | Ações |
|---|---|
| **Demo** e **Follow-up** | "Reagendar" (tonal `--tint-red`/`--tint-red-text`) + "Cancelar" (outline neutro) |
| **Rota** | "Abrir rota do dia" (filled `#C8131B`) — **não** reagendar nem cancelar |

- Rota não é um compromisso agendável: é a sequência do dia, montada de `routeStops`. Oferecer "Reagendar" nela é uma ação sem destino.
- "Reagendar" abre o **mesmo `ScheduleMeetingModal`** já preenchido com o lead, o tipo e a duração atuais — não um formulário novo.
- "Cancelar" pede confirmação em um segundo passo (o `.dialog` do sistema, não um `confirm()` do browser) e informa que o evento sai do HubSpot e do Google Calendar.
- Mobile: ações de 48px em coluna gap 8, no rodapé fixo com `padding:16px 16px 32px`. Desktop: 40px em linha gap 8 no rodapé de `padding:24px`, rótulos flush-left.

## Nas duas

- As três fontes da agenda continuam entrando: `routeStops`, reuniões e follow-ups. **O overlay lê o item, não refaz a query.**
- Reagendar e cancelar mantêm o fluxo atual de HubSpot e Google Calendar — **payload inalterado**.
- Tint do tipo no fundo do card do item: `#FAE8E9` (Rota) · `#F1EBFE` (Demo) · `#E6F7FF` (Follow-up) no claro; `--surface-2` no escuro.

## Armadilhas

- **"Reagendar" oferecido em item de Rota** — ação sem destino.
- **Item abrindo a ficha do lead direto**, sem o detalhe do compromisso: continua impossível reagendar de dentro da agenda.
- **Um modal centrado no desktop** em vez do drawer padrão de 480px.
- **Formulário de reagendamento em branco** em vez do `ScheduleMeetingModal` pré-preenchido.
- **`confirm()` do browser** no cancelamento.
- **Cor do tipo divergindo** entre o item na agenda e o overlay — quebra a continuidade do toque.
- **Follow-up e Demo com a mesma cor** — são `#01AFFF` e `#7c3aed`.

## Pronto quando

- [ ] o overlay é o detalhe do **compromisso**, não a ficha do lead
- [ ] faixa de tipo com a mesma cor do item tocado na agenda
- [ ] **Rota não oferece reagendar nem cancelar** — oferece "Abrir rota do dia"
- [ ] "Reagendar" abre o `ScheduleMeetingModal` pré-preenchido
- [ ] cancelamento com confirmação no `.dialog` do sistema, não `confirm()`
- [ ] a linha do lead abre a ficha empilhada, sem substituir o overlay
- [ ] desktop usa o drawer padrão de 480px
- [ ] payloads de HubSpot e Google Calendar inalterados
- [ ] fecha no X/voltar, no overlay e no `Esc` (desktop) ou no voltar do sistema (mobile)
- [ ] `role="dialog"`, `aria-modal="true"`, `aria-label`
- [ ] nenhum hexadecimal fora dos literais permitidos (temperatura do funil, tints de etapa/estado/SLA, marca)
- [ ] modo escuro conferido
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor da referência que não deu para aplicar e por quê**.
