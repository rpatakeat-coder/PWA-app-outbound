# 09b — Sheet de tela cheia

**Tela:** Mudança de etapa  ·  **Arquivo:** `src/screens/ChangeStageModal.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *9. Mudança de etapa (sheet de tela cheia)*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- **Tela cheia, não folha parcial**: é formulário longo, e folha parcial com teclado aberto sobra ~200px úteis.
- Overlay opaco `--bg`, coluna cheia. Header `padding:12px 16px` fundo do tema: `arrow_back` 48×48 raio 12 `rgba(255,255,255,.18)` + título "Mudar etapa" 18/24 peso 600 e sublinha "`{lead}` · hoje em `{etapa}`" 12/16/0.4.
- Corpo `flex:1; overflow-y:auto; padding:16px`, gap 16.
- Opções em coluna gap 8: `min-height:56px`, `padding:0 16px`, raio **16**, borda 1px. Radio **24×24** (borda 2px, dot 12px). Rótulo 16/24/0.15 peso 600 `flex:1`. Dot da cor da etapa 10px à direita. Selecionada: fundo `--tint-red`, borda `#C8131B`, radio e dot `#C8131B`, texto `--tint-red-text`.
- Destinos de `APP_STAGE_IDS` filtrado pela regra de avanço (`FREE_ADVANCE_MAX_STAGE_ID`); Perdido sempre disponível.
- Campos obrigatórios: bloco `padding:16px`, raio 16, fundo `--surface`, **borda esquerda 4px `#CC8C1D`**. Cabeçalho "OBRIGATÓRIO EM {ETAPA}" 12/16/0.5 peso 700 uppercase. Campos em **coluna única** gap 16: rótulo 14/20/0.1 peso 600, caixa altura **48** raio **16** borda 1px `--stroke-strong`, placeholder 16/24/0.5 `--text-disabled`, `expand_more` 24px nos selects.
- Campos e máscaras de `STAGE_FIELDS_BY_ID` — **sem mudança de lógica** (cep, cnpj, currency, date, boolean, select multi).
- Rodapé fixo `padding:16px 16px 32px` (o extra é a área segura), borda superior 1px `--border`, fundo `--surface`: "Confirmar mudança" altura 48 raio 12 `#C8131B` largura total.
- `KeyboardAvoidingView` (já existe em `src/components/`) **obrigatório**: o rodapé sobe com o teclado.

## Pronto quando

- [ ] tela cheia com `arrow_back`
- [ ] opções de 56px com radio de 24px
- [ ] campos de 48px raio 16 em coluna única
- [ ] máscaras inalteradas
- [ ] o rodapé sobe com o teclado
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
