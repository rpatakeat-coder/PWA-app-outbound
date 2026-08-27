# 09c — Funil comercial

**Tela:** Gestor  ·  **Arquivo:** `src/screens/GestorScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *6. Painel do gestor*
**Escopo:** só o bloco do funil — o rail à direita é o 09d

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Bloco em `grid-template-columns:8fr 4fr; gap:24px; align-items:start`. O funil é a coluna de 8fr; o rail (09d) é a de 4fr.
- Card do funil: `padding:24px`, fundo `--surface`, borda 1px `--border`, raio 8, sombra 02. Título "Funil comercial · {mês}" 16/24/0.15 peso 700 `--text`, `margin-bottom:16px`.
- Uma barra por etapa, coluna gap 12. Acima da barra: rótulo da etapa (12/16/0.5, peso 600, `--text-muted`) à esquerda e "{n} · {pct}" (12/16/0.5, peso 600, `--text-faint`, `tabular-nums`) à direita, `margin-bottom:4px`.
- Barra: **altura 22px**, raio 4, trilha `--surface-3`, preenchimento na cor da etapa com raio 4.
- **Cores das etapas** (de `STAGE_COLOR_BY_ID` / `stages.ts`, não invente): Prospecção `#0ea5e9` · Visita `#14b8a6` · Conversa com decisor `#8B5CF6` · Demo/Proposta `#FFB32F` · Negociação `#f97316` · Ag. Pagamento `#C8131B` · Negócio Fechado `#16a34a` · Enviado Onboarding `#10b981`.
- Clique na etapa abre o modal com os leads daquela etapa. **Se isso já existe, preserve; se não, relate — não implemente agora.**

## Pronto quando

- [ ] barras de 22px com trilha `--surface-3`
- [ ] cores vindas de `stages.ts`
- [ ] contagem e percentual com `tabular-nums`
- [ ] clique na etapa preservado ou relatado
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
