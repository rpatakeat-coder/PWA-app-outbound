# O reparador de pinos roda todo dia e nunca chega nos pinos quebrados

Auditoria de 29/10/26, puxada por uma pergunta do Julyan diante do mapa:
*"que 27 clientes são esses? oxi"* — um círculo com 27 desenhado em cima do
Sambódromo, no Rio.

## O que são os 27

São **27 clientes Takeat ativos**, e o número não é do agrupador do mapa: é
exato. No centro do Rio (−22,9129 / −43,2003) há **50 pinos na mesma
coordenada**; 27 deles têm `status = 'cliente'`, e a lente aberta era a de
Clientes. Os outros 23 são 19 churns e 4 leads.

Eles estão espalhados por 23 bairros de verdade — Anil, Ipanema, Urca, Barra,
Campo Grande, São Cristóvão, Méier, Recreio, Paciência. Entre eles: Pappa Jack
LeMonde, O Camarão Nova América, Formigueiro Brasa e Lenha (Urca), Gellato
Churros, Restaurante Stambul, Salseiro (Ipanema). Nenhum tem `place_id` do
Google; todos vieram com `geo_source = 'hubspot'`, e **26 dos 27 têm rua e
número** no cadastro. O endereço existe; só a coordenada é que nunca foi
resolvida, e o geocodificador respondeu "centro da cidade" em vez de dizer que
não sabia.

Isso não é só do Rio. Na base inteira, pela regra da migration 0226 (pilha de
≥5 no mesmo ponto servindo ≥3 bairros ou ≥2 cidades):

    781  pinos em centróide de cidade        256 clientes · 184 leads
    679  têm rua e cidade no cadastro
    602  têm também CEP e número — elegíveis para o reparador
    439  têm rua + número não-genérico

## O reparador existe, roda, e não os alcança

`repair-client-geocodes` é uma edge function chamada pelo cron
`repair-client-geocodes-every-10-hours` (jobid 2, `active = true`), que usa
`public.invoke_geocode_repair_cron()` com trava de 10 horas e `limit: 25`.
Rodou hoje, 29/10, às 07:02 UTC.

**Nunca tentou 708 dos 781.** Dos 73 que tentou, 73 falharam com
`geocode_not_found`, cada um com `attempts = 1` — não é fila de reprocesso
girando em falso. O último reparo bem-sucedido foi em **16/09**; de lá para cá,
94 reparos no total e nenhum novo.

A causa está numa linha da seleção de candidatos:

```ts
let query = supabase.from('clients')
  .select('id,nome,endereco,numero,bairro,cidade,estado,cep,latitude,longitude,geo_source,geo_approximate')
  .not('latitude','is',null).not('longitude','is',null)
  .not('cep','is',null).not('numero','is',null)
  .limit(500);                       // <-- sem order by, e sem paginar
```

O filtro de pilha (`only_duplicates`) e o de já-tentados são aplicados **em
JavaScript, depois**, sobre essas 500 linhas. Só que há **7.119 linhas
elegíveis**. O teto pega 7% da base, sempre a mesma fatia arbitrária — o
PostgREST não promete ordem sem `order by`. Dos 602 empilhados elegíveis,
**33 caem dentro da janela**. Os outros 569 não são "os próximos da fila":
eles não estão na fila. O cron pode rodar por mais um ano sem vê-los.

O `offset` do corpo da requisição não resolve: ele é aplicado depois do
`.slice()`, sobre as mesmas 500.

## E quando alcança, o geocodificador é o fraco

A função usa **só Nominatim/OSM**. O `geocode` que está no repositório
(`supabase/functions/geocode/index.ts`) usa Google como fonte primária
justamente porque "tem os números das casas no Brasil", com Nominatim como
queda livre. O reparador — que é quem de fato escreve coordenada em `clients` —
ficou com a metade fraca.

Medido em 29/10 numa amostra aleatória de 20 dos empilhados, com a mesma
consulta estruturada e o mesmo critério de precisão da função:

    11 achados · 0 imprecisos · 9 não encontrados     (55%)

Aplicado aos 602 elegíveis, consertar a janela sozinha recuperaria da ordem de
**330 pinos, sem custo nenhum**. Os ~270 restantes dependeriam do Google.

**Ressalva que não medi:** "achou" aqui quer dizer que o Nominatim devolveu um
resultado que passa no teste de precisão da função — não que a coordenada
esteja certa. Dois dos 11 vieram como `place`, que é genérico. A função grava
`geo_approximate: false` em todo acerto, o que é exatamente o pecado que a 0226
corrigiu: afirmar precisão que ninguém conferiu. Se a janela for consertada, o
flag deveria seguir o tipo do acerto, não ser `false` fixo.

## Conserto proposto (NÃO aplicado)

Não publiquei nada disto. Mover pino de centenas de clientes de verdade é
decisão do Julyan, e a função não tem fonte no git para revisar antes.

1. **A janela.** Trocar o `.limit(500)` por varredura ordenada: `.order('id')`
   com `.range()` por páginas, juntando candidatos até fechar o lote. São 8
   requisições para as 7.119 linhas. Sem isso, nada mais adianta.
2. **O flag.** `geo_approximate` passa a refletir o tipo do acerto: `false` só
   para `building`, `shop`, `amenity` e afins; `true` para `place` e parentes.
3. **O Google.** Decisão do Julyan, porque custa. O volume é único, não
   recorrente: ~600 consultas na Geocoding API. Lembrar que a cobrança do
   projeto caiu em 07/10 e os cortes de Places seguem de pé.

## Seis funções que rodam sem fonte no git

Enquanto conferia, bati nisto — produção tem código que o repositório não tem:

    repair-client-geocodes     escreve latitude/longitude em clients
    cockpit-robo               escreve o snapshot do Cockpit
    receber-linhas-cockpit     escreve linhas vindas do Cockpit
    copiar-arquivos-cockpit
    copiar-leads-cockpit
    backfill-won-at

As outras 27 têm fonte. Não transcrevi nenhuma aqui de propósito: uma cópia
quase-igual no repositório é pior que cópia nenhuma, porque alguém publica a
partir dela. O caminho certo é `supabase functions download <slug>` — o CLI do
Supabase não está instalado nesta bancada.
