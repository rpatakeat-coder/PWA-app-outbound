# 09a — Bottom sheet da ficha

**Tela:** Ficha do lead  ·  **Arquivo:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *8. Ficha do lead (bottom sheet)*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- **Um único padrão de painel no sistema.** Não invente um segundo jeito de abrir painel.
- Overlay `rgba(0,0,0,.4)`; folha ancorada no rodapé, `max-height:92%`, raio `16px 16px 0 0`, fundo `--surface`.
- Fecha no X, no overlay, **no arraste para baixo** e no botão de voltar do sistema. `role="dialog"`, `aria-modal="true"`, `aria-label`.
- Topo `padding:12px 16px 16px`, borda inferior 1px `--border`: handle 36×4 raio 2 centralizado `margin-bottom:16px`; dot 8px da temperatura + kicker "`{TEMPERATURA}` · `{n}`ª VISITA" (11/16/0.5, 600, `--text-faint`, uppercase); nome 18/24 peso 600; sublinha contato · telefone 12/16/0.4. X em 48×48 raio 12 fundo `--surface-2`.
- Corpo `flex:1; overflow-y:auto; padding:16px`, gap 16.
- **Duas ações em grade** `1fr 1fr` gap 8: "Etapa" (altura 48, raio 12, `#C8131B`, ícone `trending_up`) e "Agendar" (altura 48 outline `#C8131B`, ícone `event`). **Rótulos curtos** — em 390px "Mudar etapa" quebraria.
- "Uso do produto": `padding:16px`, raio 16, fundo `--surface-2` — cabeçalho 12/16/0.5 peso 700 uppercase; dot de semáforo 10px + texto 14/20/0.25. Verde ≤7 dias, âmbar 8–30, vermelho >30 ou nenhuma. Só aparece para quem o `hubspot-usage-sync` alcança.
- Pares chave/valor: `padding:12px 0`, borda inferior 1px `--border`, chave 12/16/0.5 peso 600 `--text-faint`, valor 14/20/0.25 `--text` à direita.
- Timeline: ícone em pill 32px com o tint do tipo + título 14/20/0.1 peso 600 sobre quando 12/16/0.4.
- Rodapé fixo `padding:16px`, borda superior 1px `--border`: "Marcar visita (GPS)" altura 48 raio 12 `#27A84C` largura total, ícone `where_to_vote`. Vira "Re-marcar visita" quando já houve check-in.
- Validação de 200m e Task concluída no HubSpot **inalteradas**.

## Pronto quando

- [ ] fecha nas quatro formas, incluindo o voltar do sistema
- [ ] ações "Etapa" e "Agendar" com rótulo curto e 48px
- [ ] semáforo de uso com os três estados
- [ ] rodapé fixo com o check-in
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
