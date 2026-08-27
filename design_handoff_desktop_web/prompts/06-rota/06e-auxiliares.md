# 06e — Onde ficam os cards auxiliares

**Tela:** Rota  ·  **Arquivo:** `src/screens/RotaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *3. Rota do dia*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Hoje a tela empilha, acima da lista: **"Rota personalizada"**, **"Adicionar lead manualmente"**, `RouteConfigCard`, `RouteHistorySection`, `MinhaDailyCard`, `DismissedContaAlvoCard`. No rail de 420px eles empurram a sequência do dia para fora da tela.
- Regra: **a sequência do dia é o que ocupa o rail.** Tudo isso vai para um botão de configuração no topo do rail, abrindo o **drawer padrão de 480px** — o mesmo componente da ficha do lead. Não crie um segundo padrão de painel.
- Se preferir outra solução (segunda aba no rail, por exemplo), pode — desde que a regra acima valha e o padrão de painel seja único.
- **Nenhum deles pode desaparecer.** Todos continuam alcançáveis em no máximo dois cliques.

## Pronto quando

- [ ] os seis continuam alcançáveis e funcionando
- [ ] a lista de paradas é o elemento dominante do rail
- [ ] o painel usado é o mesmo padrão da ficha do lead
- [ ] você listou onde cada um dos seis foi parar
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
