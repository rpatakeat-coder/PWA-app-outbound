# M1a — Inventário do painel do lead (não edite nada)

**Arquivos:** `App.tsx`, `src/types/client.ts`, `src/hooks/useClientNotes.ts`, `src/hooks/useClientVisits.ts`

> **Nenhuma linha de código muda aqui.** Este passo existe porque um redesign anterior neste projeto assumiu métricas que não existiam no banco e foi aplicado com números inventados. Não repita.

## Fazer

1. Localizar no `App.tsx` o que abre quando `selectedClient` deixa de ser `null` (buscar por `selectedClient`). Listar:
   - o JSX/componente que o renderiza e o nome do estilo do container
   - **todas** as props que recebe
   - os campos que exibe hoje, na ordem, com o nome do estilo de cada um
   - as ações que oferece (botões, links, gestos) e o que cada uma chama

2. Ler `src/types/client.ts` e preencher — **com o nome real do campo**:

| Campo do design | Existe? | Nome no tipo |
|---|---|---|
Etapa | | |
Plano apresentado | | |
Endereço (rua + bairro) | | |
CEP | | |
Origem do lead | | |
Responsável (vendedor) | | |
Contagem de visitas | | |
Telefone | | |
Nome do contato | | |

3. **Uso do produto** — o design mostra "Última comanda há N dias", "Sincronizado há N dias · N comandas" e um semáforo. Buscar por `hubspot-usage-sync`, `hs_uso`, `comanda`. Dizer quais campos existem e a granularidade. **Se o dado de comandas não existir, pare e diga** — não invente.

4. **Timeline** — o design mostra check-in de visita, mudança de etapa, demo realizada e nota. Dizer a origem de cada um:
   - visitas: `useClientVisits`? quais campos?
   - mudanças de etapa: existe histórico? guarda motivo?
   - reuniões: `useMeetings` / `meetingsByClient`?
   - notas: `useClientNotes`?
   - **existe fonte unificada, ou é preciso juntar quatro listas e ordenar por data?**

5. **Check-in** — localizar `markAsVisited` e descrever: o raio de validação em metros, o que acontece com a Task no HubSpot, e o que a função retorna em sucesso e em erro.

6. Dizer se o painel hoje é o **mesmo componente** no mobile e no desktop, ou se há duas implementações.

## Pronto quando

- [ ] a lista do que existe hoje está completa e ordenada
- [ ] a tabela de campos está preenchida com os nomes reais
- [ ] as fontes da timeline estão identificadas uma por uma
- [ ] **se algum dado do design não existe, você disse qual e parou**
- [ ] nenhum arquivo foi modificado

## Ao terminar

Responda com as listas e a tabela. Os campos do design que não têm origem no código vão juntos no fim, sob "**Não existe — decidir com o designer**".
