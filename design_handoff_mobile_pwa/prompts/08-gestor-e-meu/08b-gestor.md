# 08b — Versão mobile condensada

**Tela:** Painel do gestor  ·  **Arquivo:** `src/screens/GestorScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *5. Painel do gestor (mobile)*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- **Alcançado pelo menu do perfil**, não por aba. Por isso precisa de volta explícita: header com `arrow_back` 48×48 raio 12 `rgba(255,255,255,.18)` + título 18/24 peso 600 e sublinha 12/16/0.4.
- Corpo `padding:16px`, coluna gap 16. **Sem bottom nav nesta tela** — logo, `padding-bottom` de 16, não 40.
- **KPIs 2×2**: `grid-template-columns:1fr 1fr` gap 12. Card `padding:16px`, raio **16**, borda 1px `--border`, sombra 01: rótulo 12/16/0.5 peso 600 `--text-faint`, valor **18/24 peso 700** (não 28/36, que é desktop) `tabular-nums`, delta 11/16/0.5 peso 600 na cor do sinal (`--tint-green-text` / `--tint-red-text`).
- **Funil**: card `padding:16px` raio 16. Por etapa: rótulo 12/16/0.5 peso 600 + contagem à direita `--text-faint` `tabular-nums`; barra de **18px** de altura (o desktop usa 22), raio 4, trilha `--surface-3`, preenchimento na cor da etapa vinda de `stages.ts`.
- **Time**: card raio 16. Linha `padding:10px 0`, borda inferior 1px `--border`: avatar 32px pill `--surface-2`/`--text-muted` com iniciais, nome 14/20/0.1 peso 600 truncado sobre "`{n}` visitas · `{n}` fechados" 11/16/0.5 `--text-faint`, badge de meta à direita (`#EAF7EE`/`#167532` no alvo, `#FFF8EB`/`#99670F` abaixo).
- **A tabela de 7 colunas do desktop não cabe.** Cada vendedor é uma linha de duas alturas com as duas métricas que importam e a meta. Se houver drill-down, preserve.
- Cards auxiliares do 08a: dar destino (bloco no fim ou dentro do drill-down) e declarar. **Nenhum desaparece.**

## Não fazer

- Não invente métrica; use o que o 08a confirmou.

## Pronto quando

- [ ] KPIs 2×2 com valor 18/24 peso 700
- [ ] funil com barra de 18px e cores de `stages.ts`
- [ ] time em linhas de duas alturas
- [ ] auxiliares com destino declarado
- [ ] delta usando tokens, não hexes
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
