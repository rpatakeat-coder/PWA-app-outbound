# M2 — Overlay de agendamento a partir de uma tarefa

**Arquivos:** `src/screens/TarefasScreen.tsx`, `src/screens/ScheduleMeetingModal.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md` §*4. Tarefas* e §*10. Agendar* · `design_handoff_desktop_web/README.md` §*5. Tarefas (kanban)* e §*13. Agendar (modal)*

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

O botão "Agendar" do card de tarefa abre o mesmo modal de agendamento da ficha do lead, sem nenhum contexto da tarefa. O vendedor perde de vista o SLA que está vencendo e a razão pela qual aquela tarefa existe.

## O que muda

**O modal é o mesmo componente** (`ScheduleMeetingModal`) — não crie um segundo. O que se acrescenta é uma **faixa de contexto da tarefa** no topo, quando ele é aberto a partir do card de tarefa.

Faixa de contexto (logo abaixo do header do modal/sheet):

- **Mobile**: `padding:16px`, raio **16**, fundo `--surface-2`, **borda esquerda 4px na cor do SLA**.
- **Desktop**: `padding:16px`, raio 8, fundo `--surface-2`, **borda esquerda 3px na cor do SLA**.
- Conteúdo: badge de SLA (`padding:4px 8px`, raio 4, 11/16/0.5 peso 600) — **D5** `#FAE8E9`/`#94090F` · **D2** `#FFF8EB`/`#99670F` · **—** `--surface-2`/`--text-faint` — seguido da descrição da tarefa (14/20/0.25 `--text-muted` no desktop, 14/20/0.25 no mobile) e, embaixo, o prazo com `schedule` 16px + texto 12/16/0.5 peso 600.
- **Prazo vencido usa `--tint-red-text`**, não `#94090F` direto: `#94090F` dá ~2,6:1 sobre superfície escura e fica ilegível.
- **Atenção:** a cor do texto do badge e a da régua esquerda são **variáveis diferentes**. O badge tem fundo tonal claro nos dois temas, então o texto fica escuro sempre. A régua fica sobre `--surface`: no escuro precisa do par claro — `#E5A1A4` (D5) e `#FFD894` (D2). Usar a mesma variável nos dois faz a régua desaparecer no escuro. Isso já aconteceu neste projeto.

Ao confirmar o agendamento a partir daqui, a tarefa correspondente é **concluída de forma otimista**: pinta na hora, persiste em seguida, reverte se falhar. O card sai da coluna "Atrasadas"/"Hoje" sem recarregar a tela.

## Forma do overlay

- **Mobile — sheet de tela cheia.** Overlay opaco `--bg`; header `padding:12px 16px` com `arrow_back` 48×48 raio 12 `rgba(255,255,255,.18)` + "Agendar" 18/24 peso 600 e `{lead}` na sublinha 12/16/0.4. Corpo em **coluna única** gap 16. Rodapé fixo `padding:16px 16px 32px` (o extra é a área segura) com o CTA de largura total, 48px, raio 12. `KeyboardAvoidingView` obrigatório — o rodapé sobe com o teclado.
  - O `arrow_back` volta **para a lista de tarefas**, não para a ficha do lead.
- **Desktop — modal centrado de 640px.** Overlay `rgba(0,0,0,.32)`, raio 8, sombra `0 10px 25px rgba(0,0,0,.14), 0 0 8px rgba(0,0,0,.2)`. Corpo em **duas colunas** `1fr 1fr` gap 24. Rodapé `justify-content:flex-end` gap 8: "Cancelar" (Medium outline, 32px) + CTA (Large filled, 40px).

## Conteúdo do agendamento (igual nas duas, só os tamanhos mudam)

- Segmented **Demo / Follow up**: raio 12 só nas pontas, ativo `#C8131B`/branco. 48px no mobile, 40px no desktop.
- **Calendar do kit**: mês/ano e setas em **Poppins Bold 16 `#C8131B`**; dias da semana Bold 14 (domingo `--text-faint`); célula de dia Medium 14 com `tabular-nums`; fora do mês `--text-disabled`; **dia selecionado em círculo** (raio 50%) `#C8131B`/branco — nunca retângulo.
- Chips de horário: raio 12, borda 1px, `tabular-nums`; selecionado `--tint-red` / borda `#C8131B` / texto `--tint-red-text`. 48px no mobile, 32px no desktop.
- Textarea de observações: raio 16 e altura **140** no mobile; raio 8 e altura **120** no desktop.
- CTA repete a escolha: "Agendar demo · `{data}`, `{hora}`" — confirmação sem voltar a conferir.
- Cria Meeting no HubSpot e evento no Google Calendar — **fluxo inalterado**.

## Armadilhas

- **Um segundo modal de agendamento** só para tarefas. É o mesmo componente com uma faixa a mais.
- **Badge e régua com a mesma variável** — régua invisível no escuro.
- **Prazo vencido com `#94090F`** em vez do token.
- **Tarefa não concluída** ao agendar — o card fica na coluna "Atrasadas" depois de resolvido.
- **`arrow_back` voltando para a ficha do lead** em vez da lista de tarefas.
- **Dia selecionado como retângulo.**
- **Sem `KeyboardAvoidingView`** no mobile — o CTA fica atrás do teclado.

## Pronto quando

- [ ] é o mesmo `ScheduleMeetingModal`, com a faixa de contexto da tarefa
- [ ] badge de SLA e régua esquerda usando variáveis **diferentes**, ambos legíveis no escuro
- [ ] prazo vencido em `--tint-red-text`
- [ ] agendar conclui a tarefa de forma otimista e o card sai da coluna
- [ ] mobile: tela cheia, coluna única, rodapé sobe com o teclado
- [ ] desktop: modal de 640px em duas colunas
- [ ] dia selecionado em círculo; CTA repetindo data e hora
- [ ] fecha no X/voltar, no overlay e no `Esc` (desktop) ou no voltar do sistema (mobile)
- [ ] `role="dialog"`, `aria-modal="true"`, `aria-label`
- [ ] nenhum hexadecimal fora dos literais permitidos (temperatura do funil, tints de etapa/estado/SLA, marca)
- [ ] modo escuro conferido
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor da referência que não deu para aplicar e por quê**.
