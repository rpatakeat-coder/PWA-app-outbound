# 09d — Sheet de tela cheia em 3 passos

**Tela:** Cadastro + CEP  ·  **Arquivo:** `src/screens/CEPStep.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *11. Cadastro de lead + CEP (sheet de tela cheia)*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Aberto pelo **FAB central**.
- Header `padding:12px 16px` fundo do tema: `close` 48×48 raio 12 + "Novo lead" 18/24 peso 600. Abaixo, **barra de progresso de 3 segmentos** (`flex:1` cada, altura 4, raio 2 — `#fff` concluído, `rgba(255,255,255,.3)` pendente) e a linha "Passo 1 de 3 · CEP e endereço" 11/16/0.5 peso 600 `rgba(255,255,255,.8)`.
- **No mobile o stepper é progresso real**, não decoração: os três passos são telas em sequência. A navegação de 3 passos já existe no `CEPStep.tsx` — **manter**.
- Corpo coluna única gap 16, campos altura **48** raio **16**: `CEP` (ícone `search`, info "Busca endereço e coordenada automaticamente") · `Número` · `Restaurante` · `Telefone`.
- **Mapa de ajuste do pin**: altura 200, raio 16, borda 1px `--border`. Pin fixo no **centro do mapa, não da tela** — o `mapLayout` atual já calcula isso; manter. Caixa de status `left:12px; right:12px; bottom:12px`, `padding:8px 12px`, raio 12, fundo `--surface`, sombra 01: "Arraste o mapa para ajustar o pin" 12/16/0.5 peso 600 + coordenada `tabular-nums` 11/16/0.5 `--text-faint`.
- Rodapé fixo `padding:16px 16px 32px`: "Continuar" altura 48 raio 12 `#C8131B` largura total.

## Pronto quando

- [ ] barra de progresso de 3 segmentos
- [ ] campos de 48px raio 16
- [ ] **pin no centro do mapa, não da tela**
- [ ] navegação de 3 passos preservada
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
