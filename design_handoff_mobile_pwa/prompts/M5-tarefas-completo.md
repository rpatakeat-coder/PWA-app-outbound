# M5 — Tarefas (prompt único)

**Arquivo:** `src/screens/TarefasScreen.tsx` (+ `App.tsx` só para o header, se a tira/faixa do header morar na casca, como na Rota e na Agenda)
**Referência visual:** `design_handoff_mobile_pwa/Field Sales - Mobile PWA.dc.html` + `screenshots/05-tarefas.png` e `15-dark-tarefas.png`.
**Pergunta que a tela responde:** *o que venceu e o que vence hoje?*

> Substitui `07a-abas-e-agrupamento.md`, `07b-card.md` e `07R-revisao.md` — leia só este.
> `M0`, `M1` (casca), `M2`/`M2b` (Mapa), `M3` (Rota) e `M4` (Agenda) já rodaram.
>
> Tarefa única: **só esta tela**. Se encontrar algo errado em outra, anote e siga.

**Tokens mobile ≠ desktop.** Input 48px raio **16** · botão 48px raio 12 tipo 16/600 · card raio **16** · maior tipo Title Medium **18/24** · spacing só até **24** (única exceção: `padding-bottom: 40px` da reserva do FAB) · alvo **48px** · raios só `4 · 12 · 16 · pill`.

---

## 1 · Header

`padding:12px 16px`, fundo do tema: **"Tarefas"** 18/24 peso 600 + sublinha **"`{n}` atrasadas · `{n}` para hoje"** 12/16/0.4 `rgba(255,255,255,.8)`; avatar 48px pill à direita.

O modal **"Como as tarefas são geradas"** vira **botão de ajuda no header** (48×48, `rgba(255,255,255,.18)`, raio 12) — hoje é o `taskRulesClose` de 30px e o `taskInfoButton` de 30px, ambos abaixo do alvo mínimo.

## 2 · Abas de estado — não kanban

Faixa `padding:12px 16px`, fundo `--surface`, borda inferior 1px `--border`, gap 8. Três botões `flex:1`, altura 40, raio 12 **só nas pontas**, texto 12/16/0.5 peso 600:

**Atrasadas · Hoje · Próximas**, cada uma **com a contagem no rótulo**.

- Ativo: `#C8131B` / branco
- Inativo: `--surface-2` / `--text-muted`

> Aqui a faixa fica sobre `--surface` (não sobre o header vermelho), então o par `#C8131B`/branco funciona nos dois temas — é diferente do segmented do Mapa e da tira da Agenda, que vivem sobre o header. Não copie o par de opacidade daqueles.

**O kanban de três colunas do desktop não serve** (`kanban*`): rolagem horizontal em app de campo é toque errado garantido. As colunas viram abas.

**Agrupamento vem de `src/utils/sla.ts` + vencimento** (passado / hoje / futuro). **Não invente critério.** Se o campo não existir como esperado, **pare e relate**.

**`visibleTasks` e `tasksActiveVendor` não mudam** — e **o badge da barra tem de mostrar o mesmo número de antes**. Badge com número diferente é sinal de que o recorte por papel mudou: é a regressão mais séria desta tela.

## 3 · Card de tarefa

Scroll `padding:16px 16px 40px` (a reserva do FAB — hoje está em 114px nesta tela, corrija), coluna gap 12.

Card: `padding:16px`, raio **16**, fundo `--surface`, borda 1px `--border`, **borda esquerda 4px na cor do SLA**, sombra 01.

- **Lead** 16/24/0.15 peso 600 + **badge de SLA** à direita (`padding:4px 8px`, raio 4, 11/16/0.5 peso 600)
- **Tarefa** 14/20/0.25 `--text-muted`, `margin-top:6px`
- **Prazo** `margin-top:8px`: `IconClock` 16px + texto 12/16/0.5 peso 600 — **vencido usa `--tint-red-text`** (`#94090F` claro / `#E5A1A4` escuro); no prazo usa `--text-faint`

**Badge e régua são variáveis DIFERENTES** — o erro que já custou retrabalho:

| SLA | Badge (bg / fg, nos dois temas) | Régua esquerda — claro | Régua — escuro |
|---|---|---|---|
D5 | `#FAE8E9` / `#94090F` | `#94090F` | **`#E5A1A4`** |
D2 | `#FFF8EB` / `#99670F` | `#99670F` | **`#FFD894`** |
— | `--surface-2` / `--text-faint` | `--border` | `--border` |

O badge tem fundo tonal claro (superfície própria, não herda o tema), então o texto fica escuro sempre. A régua fica **sobre `--surface`**: no escuro precisa do par claro, senão vira vinho sobre quase-preto e desaparece.

**Ações** `margin-top:16px`, gap 8: **"Agendar"** (`flex:1`, altura **48**, raio 12, `#C8131B`, texto 16/24/0.15 peso 600 branco) + **concluir** (48×48, raio 12, borda 1px `--stroke-default`, `IconCheck` 24px).

**Conclusão é toggle otimista:** pinta na hora, persiste em seguida, reverte com aviso se falhar. Nunca tela de erro.

## 4 · Estados

- **Vazio:** copy original — **"Nenhuma tarefa pendente."** / "Nenhuma `{status}` encontrada". Ícone 40px `--text-faint`, `margin-bottom:12px`, texto 14/20/0.25 `--text-muted` centralizado.
- **Sem swipe destrutivo.** Concluir é ação explícita.

---

## Não fazer

- Não mexa em `src/utils/sla.ts` nem em `useClientTasks`.
- Não altere `visibleTasks` / `tasksActiveVendor`.
- Não porte os estilos `kanban*`.
- Não use o par de opacidade do segmented do Mapa nesta faixa de abas.
- Não crie estado de dados novo. O único estado novo é `tabTarefa: 'atrasadas' | 'hoje' | 'proximas'`.

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Três abas `flex:1` altura 40, raio 12 nas pontas, com contagem no rótulo.
2. Ativo `#C8131B`/branco; inativo `--surface-2`/`--text-muted`.
3. Agrupamento vindo de `sla.ts` / vencimento.
4. `visibleTasks` / `tasksActiveVendor` intactos.
5. **Badge da barra inferior com o mesmo número de antes** (diga o número antes e depois).
6. Card raio 16, padding 16, sombra 01, borda esquerda 4px na cor do SLA.
7. Badge de SLA com os três pares.
8. **Régua no escuro `#E5A1A4` (D5) / `#FFD894` (D2)** — variável diferente da do badge.
9. Prazo vencido em `--tint-red-text`, legível no escuro.
10. "Agendar" `flex:1` altura 48; concluir 48×48.
11. Conclusão otimista, com reversão.
12. Modal de regras alcançável por botão de 48px no header.
13. Scroll com `padding-bottom:40px`; rolando até o fim, o FAB não cobre o "Agendar" do último card.
14. Copy do estado vazio preservada.
15. Nenhum hex fora dos literais permitidos; spacing ≤ 24 (+ a reserva de 40); raios só `4 · 12 · 16 · pill`; alvo ≥ 48.
16. `npm run typecheck` limpo.

Os controles desta tela na lista dos 23 abaixo de 48px — **`taskRulesClose` 30, `taskInfoButton` 30, `faChip` 28** — devem sair resolvidos ou declarados desktop-only. Diga o que aconteceu com cada um.

**Conferir em 390 × 844**, comparar com `05-tarefas.png` e `15-dark-tarefas.png`, **alternar o tema e repetir no escuro** — é onde a régua e o prazo vencido falham.

## Ao terminar

Três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o campo, o ícone ou o estado que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
