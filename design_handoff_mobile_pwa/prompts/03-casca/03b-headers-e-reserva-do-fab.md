# 03b — Headers de tela e a reserva de 40px

**Tela:** Casca  ·  **Arquivo:** `App.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *Header de tela*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Header de tela: fundo `#C8131B` no claro e **`--surface` no escuro** (o vermelho chapado no topo briga com a superfície escura). `padding:12px 16px`. Faz parte da coluna da tela, não é sticky separado.
- **Avatar 48px pill** (`rgba(255,255,255,.18)`, iniciais 14/20/0.1 peso 700 branco) **sempre** no canto superior direito, abrindo o menu do perfil.
- **Remover do header**: o logo de 32px, o nome do vendedor, o botão de engrenagem 44×44 e o botão "Sair". Vão para o menu do perfil (prompt 10).
- **A reserva do FAB — vale para todas as quatro telas com barra.** O FAB protrai 24px acima da borda da barra. Todo conteúdo que encosta no rodapé precisa de `padding-bottom: 40px` (16 + 24): o peek sheet do mapa e os scrolls de Lista, Rota, Agenda e Tarefas. **Sem isso o círculo vermelho cai em cima do CTA do último card.**
- Telas sem barra (Gestor, Meu desempenho, Login) e os sheets, que têm rodapé fixo próprio, seguem com 16px.

## Pronto quando

- [ ] header vermelho no claro e `--surface` no escuro
- [ ] avatar de 48px no canto, abrindo o menu do perfil
- [ ] logo, nome, engrenagem e "Sair" saíram do header
- [ ] **nas quatro telas com barra, o FAB não cobre nenhum botão** — role até o fim de cada lista e confira
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
