# Decisões do Hoje v3 (app primeiro, Cockpit espelho)

Handoff `design_handoff_hoje_v3` (01/11/2026). O README do handoff é a fonte da verdade; aqui ficam as
escolhas feitas onde ele não decidia, ou onde o código existente mandou de outro jeito. O mesmo arquivo
está nos dois repositórios (cockpit-unificado e PWA-app-outbound).

## Etapa 1 · as funções e a paridade

1. **Uma montagem, duas línguas, uma fixture.** O dia do executivo (`diaDoExecutivo`) existe em TS
   (`supabase/functions/_compartilhado/hojeV3.ts`, app) e em JS (`HJ3` no gv2-js do Cockpit). As duas
   suítes (`src/utils/hojeV3.teste.ts` e `scripts/testar-hoje-v3.js`) formatam a mesma fixture e comparam
   com a mesma saída esperada, byte a byte quando o app está ao lado. É o padrão do Desenvolvimento v2.
2. **"Sem próximo passo" não ganhou uma terceira regra.** No app, a conta da aba Tarefas (passo vencido +
   nunca marcado, Ag. Pagamento fora) saiu da tela para `semProximoPassoDaFila`, e a tela, a folha da manhã
   e o push das 8h passaram a chamá-la. No Cockpit continua `GV2.semProximoPasso` (Planejamento v3). A
   paridade é provada com negócios e tarefas de verdade: no app pela `montarFila` (a regra da Edge
   fila-tarefas), no Cockpit pela regra da montagem (`proximo_passo` = tarefa, reunião ou dia no plano de
   hoje em diante). Os dois acham os mesmos 5 negócios dos 12 da fixture.
3. **A sugestão "Pôr em …" é a do Planejamento v3.** O app não tinha a regra; `sugestoes` em `hojeV3.ts`
   é a porta linha a linha de `PLV3.sugestoes`, e a suíte do Cockpit roda a ORIGINAL sobre a mesma fixture.
4. **Pontos na pílula e no placar são da semana, não "de hoje".** O README pede "37 pts hoje" e "faltam 10
   para passar o 2º". O único placar que existe (e que paga os R$ 250) é o da semana
   (`desenvolvimento_quadro().semana`), e "faltam N" compara totais da semana. Misturar pontos de hoje com a
   distância da semana daria uma conta que não fecha; ficou "37 pts na semana · faltam 10 para passar o 2º".
   Nenhuma regra de ponto mudou.
5. **"+3 pts" só quando o placar vai contar.** O toast pós-Cheguei recebe os pontos de fora: com prova e
   1ª visita ao restaurante na semana, +3; repetida na semana, "Check-in com prova" sem número (o placar
   conta cada restaurante uma vez por semana). Sem prova: "não conta ponto".
6. **Marcas sem símbolo.** As marcas da lista do plano (com prova, sem prova, não visitada) vão como
   `ok`/`av`/`x` no modelo e viram ícone SVG na tela: o caractere de check cai na faixa que a guarda de
   emoji das suítes vigia.
7. **A fila por dinheiro também é uma só.** Os "3 primeiros" da folha da manhã saem de `ordemPorDinheiro`
   (porta do `PLV3.ordemPorDinheiro`), e a paridade inclui a ordem.

## Etapas 2 a 5 · o dia no app

8. **A folha da manhã reaproveita a mecânica da FolhaPlanoDoDia** (a mesma chave `plano-do-dia-AAAA-MM-DD`
   por aparelho, a mesma 1ª abertura do mapa), mas sobe só até as 10h (antes: até as 19h) e só em dia
   útil. O push das 8h (`?hoje=manha`) abre a folha se ela ainda não subiu hoje; se já subiu, o toque
   leva ao mapa (no máximo 1 folha por momento por dia).
9. **"Pôr em …" no app = tarefa no HubSpot e depois a parada.** A ordem é a do handoff: primeiro
   `negocioAcao` (op nota / proximo-passo, tipo visita, a porta única de sempre); só com o HubSpot aceito
   a parada entra no plano daquele dia por `porNoPlano` sem hora (que, sem hora, não manda um segundo
   passo ao HubSpot). Os chips de 1 toque (toast, fecho, pendências de ontem) usam o mesmo corpo, tipo
   follow-up ("Ligar").
10. **A sugestão de dia no app olha os 5 dias úteis a partir de hoje.** O Planejamento olha a semana do
    plano (seg–sex); o app não tem a grade do Cockpit nem o bairro escolhido no Planejamento
    (`planos_semanais.regioes`), então o bairro do dia é o mais comum entre as paradas daquele dia
    (`field_route_stops` → `clients.bairro`) e nenhum dia tem bairro "escolhido". A regra (quentes
    primeiro, mesmo bairro, até 3 por dia, sem endereço nunca) é a mesma.
11. **A ficha "como foi" não mudou.** O README pede 3 opções de resultado e 4 chips de dia na ficha; a
    ficha que existe já tem o resultado e o próximo passo (com mais opções, ligadas a etapa e reunião), e
    redesenhá-la arriscaria o que ela grava no HubSpot e no Cockpit. O que entrou foi o depois: ao fechar a
    ficha salva, "Passo em sex 13 · salvo no HubSpot" (2,6 s) ou "{nome} ficou sem próximo passo" com os
    chips amanhã · sex 13 · seg 16 · depois. "Sem interesse" é decisão e não pede passo.
12. **A pílula-placar mora na faixa da vez.** O topo do mapa tem uma posição só ("Mapa limpo", 29/10): a
    pendência (Cheguei sem Como foi) e a hora das ligações têm verbo e prazo e ganham dela; quando a faixa
    está livre, a pílula aparece. O toque abre o Meu desempenho (origem pílula).
13. **O fecho não sobe mais sozinho às 18h.** Com o Hoje v3 ligado, a folha antiga que subia quando o app
    voltava para a frente depois das 18h não sobe: o fecho vem do push das 18h (`?hoje=fecho`) ou do
    "fechar o dia" que a pílula ganha depois das 17h, para quem tem porta feita e ainda não fechou.
14. **A sequência do toast pós-Cheguei** é a de `desenvolvimento_quadro()` (na rua), com +1 quando é a 1ª
    visita com prova do dia. É texto de comemoração; o número oficial continua no Meu desempenho.
15. **Volta ao anterior no app:** `localStorage['hoje-v2'] = '1'` (a mesma chave do Cockpit) devolve a
    FolhaPlanoDoDia, a FolhaFechoDoDia antiga (que volta a subir às 18h) e tira a pílula e os toasts.
