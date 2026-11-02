# Mapa na rua · decisões (02/11/2026)

Handoff "Mapa na rua" (prancha `Mapa na rua - Prancha.dc.html`, prompt `PROMPT-CLAUDE-CODE-MAPA-NA-RUA.md`).
App de rua (PWA), aba Mapa, só no celular (`!layout.ehLargo`). O computador não muda.

O prompt pedia "responda as 7 e espere meu ok". Por pedido do dono, as respostas estão aqui e a
implementação seguiu sem esperar.

## 0. As 7 respostas (o estado ANTES desta branch)

1. **`pinoP2.ts`: famílias, tamanhos, selos.** O tipo `Familia` tem 6 valores: `lead`, `rec`
   (recém-aberto), `av` (mais avaliado), `cli` (cliente Takeat), `ex` (ex-cliente) e `alvo` (conta-alvo
   antiga/sem nota, que não entra em lente nenhuma; por isso a prancha fala em 5). Tamanhos em
   `desenhoDoPino` (PinoP2.tsx), todos com +4 px (pedido de 26/09): lead Q/M/F 26/24/22 → 30/28/26;
   recém ≤ 30 d 23, ≤ 60 d 20, até 90 d 18 (+4); mais avaliado/alvo 26; cliente e ex 24; parada do plano
   32 (feita 24); próxima porta 40 (+4 = 44; recém 30); aberto 44; pilha 32. **Selos:** 1 por pino, sem
   limite de distância e em qualquer zoom, nesta ordem: `cobrar` (texto, quando a etiqueta é "cobrar" =
   SLA da etapa estourado) › `↑` (lead na fila, esperando sinal) › `↓` (cliente em queda). Além do selo,
   o recém-aberto tinha o "brilho" limão e a idade dentro do losango (inclusive "90"). No print de 13:53
   eram ~12 selos.
2. **A rotina dos nomes (`rotulosSemSobrepor`, `MAX_NOMES = 8`).** Ordena por prioridade (aberto 0,
   próxima 1, plano 2, cobrar 3, recém ≤ 30 d 4, meu Q/M/F 5/6/7, recém > 30 d 8, resto 9; empate: mais
   perto do CENTRO DA TELA), projeta com a projeção linear da região, e aceita uma caixa fixa de
   122 × 30 px à direita (senão à esquerda) que não bata em outro NOME. Não conhecia a bolinha, as
   cabeças dos pinos, os botões, nem a altura da faixa da vez ou da fileira de lentes: a altura do mapa
   era um palpite (`janela - 250`). Só checava a borda lateral da tela.
3. **Onde nasce a 2ª linha.** `sinalDoPino` (PinoP2.tsx), a partir de `pino.etiqueta` ("cobrar · prazo
   da etapa estourou", "N dias sem toque") e de `pino.abertoHa` ("aberto há N dias"); a próxima porta
   ganhava "próxima porta · …". Ela aparecia em todo pino com nome (`rotulo`) e no aberto.
4. **Pilha, leque e halo.** `pilhasNaTela` junta corpos a menos de 24 px; a pilha virava um círculo
   escuro de 36 px com o número e anel SÓLIDO na cor do líder; ≥ 6 vira a quadra (`CartaoQuadra`, anel
   cônico). Até 8 abre em leque (`posicoesDoLeque`), mais aproxima. **O "anel tracejado" do print não
   era da pilha:** era o círculo do *aproximado* (90 px, tracejado) que o PinoP2 desenhava em todo pino
   com coordenada aproximada no zoom de rua — inclusive na próxima porta e no líder da pilha. O halo
   vermelho do PinoP2 estava desligado desde 15/10 (`halo = false`); o "halo grande" era esse círculo
   + o `Circle` de 250 m da microrrota em volta da próxima porta. A bolinha azul é um
   AdvancedMarker com `zIndex 9999` (MapView.tsx); os pinos vão até 2000, então ela já ficava por cima
   dos pinos, mas os círculos de 90 px e os rótulos a rodeavam.
5. **Estilos do Google.** O mapa nasce com `mapId` (`GOOGLE_MAP_ID`, loader.ts) + `colorScheme`
   (claro/escuro do mesmo Map ID) e `renderingType RASTER`. Não há `styles` no código — com `mapId` o
   Google ignora `styles`. Nada ligado por zoom no código: os POIs são o que o estilo em nuvem do Map ID
   manda. `clickableIcons` só liga quando a tela trata o toque (lugar do Google).
6. **Limiares de zoom.** Rua: `latitudeDelta ≤ 0,025` (`ZOOM_RUA_LAT_DELTA`, App.tsx). Afastado:
   `> 0,05` (`DELTA_AFASTADO`, lentes.ts). Bairro: entre os dois. Placas de bairro até 0,6. No bairro,
   acima de 40 pinos inteiros, o resto vira ponto (`LIMITE_PINOS_INTEIROS`).
7. **A Lista do alternador.** Recebia `linhasDaLista` = lente + filtro sobre `itensMapaNovo`, que é a
   área CARREGADA (bounds com folga), não o trecho visível. Grupos: "NO PLANO" e "FORA DO PLANO, PERTO".

## 1. O que foi feito

- **`src/utils/niveisDoMapa.ts`** (puro, testado): `niveisDoMapa(pinos, { zoom, modo, posicao,
  faixaSegura, fonte, obstaculos, motivoN1, medir }) → { n1, n2[], n3[], rotulosDescartados, selos,
  nivel }`, `selosDaCena`, `escolherN1`, `rankN2`. A colisão é a da prancha (função `place`).
  `niveisDoMapa.teste.ts` reconstrói as cenas 1a, 2a, 3a, 4a, 4c e 8d da prancha na geometria dos
  celulares de 360/390/412/430 e confere nome a nome com a linha cinza de cada celular (o script da
  prancha foi rodado para tirar o gabarito).
- **Conferência na tela** (`src/map/conferenciaNaTela.ts` + App): a fila não depende da tela, mas o
  lugar do rótulo sim. Depois que o Google desenha, a conferência mede cada pino (`data-pino`,
  `data-cabeca`, `data-ponta`), a bolinha (`data-bolinha`), a faixa segura pelas barras de verdade
  (`data-faixa-topo`: busca, faixa da vez/placar/feriado, pendência, hora das ligações;
  `data-faixa-baixo`: fileira de lentes, folha, pílula recolhida, cartão da pilha) e os botões
  (`data-obstaculo-mapa`), e roda `niveisDoMapa` com a geometria real (a mesma estratégia das placas,
  que resolve os ~18 px do Google). A medida já inclui a área segura do iPhone, a barra de gestos e a
  fonte do sistema (o texto é medido numa régua escondida com a mesma fonte). O resultado só vira
  estado quando muda; roda a cada parada do mapa e quando as barras mudam.
- **Desenho** (`PinoNaRua` em PinoP2.tsx): N1 = 40 px + anel sólido de 52 px (vermelho-ação no plano;
  2,5 px na cor do texto + cinza 14% na sugestão); N2 = tamanho de hoje; N3 = 4 px menor; losango por
  faixa; no máximo um selo (`!` `#111418`/`#FCD34D`, `↓` `#F59E0B`), só a até 400 m, nunca no N1, nenhum
  no feriado, só no zoom de rua; pilha = pino do líder + sombra a 55% (+5, −4) + contador 18 px; o
  círculo do aproximado só no pino aberto; leque com nome nos membros e o resto a 30%. Ordem: N3 (≤ 700)
  < N2 (900) < N1 (1200) < aberto/leque < bolinha (9999).
- **Modos**: `plano` (há parada pendente), `sem_plano` (N1 = porta sugerida, a mesma `portaSugerida`
  que já desenhava a próxima porta sem plano; a 2ª opção dela conta como "proposta" no N2), `feriado`
  (`!ehDiaUtil(hoje)` e nenhuma parada pendente: sem N1, sem selo, N2 só recém ≤ 30 d), `lente_recem`
  (lente Recém-abertos).
- **Zoom**: rua = N1/N2/N3; bairro = todos no tamanho N3, sem selo, só a próxima com nome e distância;
  afastado = placas + pontos (como já era), o N1 pino inteiro sem anel e sem nome.
- **Linha pontilhada** da bolinha até o N1 sem plano (com plano, o trajeto do plano já sai da bolinha
  e passa nela). O anel de 250 m da microrrota saiu do celular.
- **Cartão do pino** (CardLeadNovo, só celular, `naRua`): kicker com família/temperatura e, à direita,
  "240 m · 3 min a pé"; O QUE COBRA (N dias sem toque + último contato; prazo da etapa; passo vencido +
  "era para"; cobrança; queda), POR QUE AGORA (CNPJ aberto em dd/mm/aaaa + faixa), PRÓXIMO PASSO,
  PARA ENTRAR (o de sempre); botões Ir · Pôr no plano · Cheguei, e a fileira de contato (Ligar,
  WhatsApp, É meu/+ Telefone, …). Kicker do recém: "RECÉM-ABERTO · 12 DIAS".
- **Cartão da pilha** (`CartaoDaPilha.tsx`): endereço do ponto, uma linha por membro com o motivo e
  Abrir, "Cheguei aqui" pergunta em qual. Pilha na borda: o leque centraliza o mapa nela.
- **Lista** (FolhaLista + listaDoMapa): recorte = lente + filtro + trecho visível (a próxima porta entra
  mesmo fora); grupos A PRÓXIMA · PEDEM AÇÃO PERTO (os mesmos ids do N2 medido) · O RESTO NESTE TRECHO;
  linha com marcador igual ao pino, por que visitar (cobrar em âmbar), próximo passo, distância +
  minutos, Cheguei (próxima) ou Ir. Contagem congelada com a hora (já existia).
- **Eventos**: `mapa_render`, `pino_toque`, `pilha_abrir`, `alternador`, `lista_linha_toque`.

## 2. Decisões e divergências da prancha

1. **Tamanhos: mantive o +4 px de 26/09.** A prancha desenha os pinos nos tamanhos de antes do +4
   (lead N3 22/20/18). Apliquei a regra relativa — N2 = o tamanho de hoje, N3 = 4 px menor (lead
   26/24/22, cliente/avaliado 26, plano 32, feita 24) — porque o +4 foi pedido explicitamente ("no sol
   não enxerga") e a prancha não o revoga. **O N1 segue a prancha literal: pino 40 e anel 52.** Para
   ficar 100% literal é trocar `MAIS` para 0 em PinoP2.tsx. Losango no mesmo critério: 27 (N3 25),
   22, 20.
2. **Sem plano, o N1 é a porta sugerida (`portaSugerida`)**, não a 1ª da proposta do "Montar o dia": a
   proposta só é calculada ao confirmar (`montarDiaComMicrorrotas` consulta o banco). A porta sugerida é
   a função que o app já usa para "a próxima porta quando não há plano". A 2ª opção dela entra como
   "proposta" no N2.
3. **Feriado = sem expediente (`ehDiaUtil`)**, o que inclui fim de semana, como no Hoje v3. Com parada
   pendente no feriado, vale o modo plano (ele está trabalhando).
4. **Rótulo do N1 que não cabe na faixa não é desenhado** (conta em `rotulos_descartados`). A prancha
   faz o mesmo (4a a 360 px); a próxima porta continua na folha e o anel continua no mapa.
5. **Leque**: os nomes dos membros não passam pela colisão; para não saírem da tela, o leque centraliza o
   mapa na pilha quando ela está fora do miolo (essa parada não fecha o leque).
6. **Selo `↑` (lead na fila, esperando sinal) saiu do mapa** (a prancha só admite `!` e `↓`); continua
   no cartão (o pino na fila) e na aba Tarefas.
7. **Pilha grande (≥ 6, a quadra com anel cônico) continua como estava**; a prancha só desenha pilhas de
   2. A regra nova (sombra + contador) vale para as pilhas abaixo da quadra.
8. **`mapa_render.n2_nomes` é a contagem**, não os nomes (o evento não precisa carregar nomes de
   restaurante). Vai também `n1`, `n1_rotulo`, `largura` e `fonte` (escala medida).
9. **Contorno do recém 61–90 no sol**: borda `#111418` (a tinta do losango) sobre branco, em vez do
   verde-oliva da prancha — para não criar cor literal nova; no escuro, borda limão sobre o fundo.
10. **POIs do Google (pendência do dono):** com `mapId` o Google ignora `styles`, então o código não
    consegue desligar POI por zoom. É configuração do **estilo em nuvem do Map ID** (Google Cloud
    Console → Map Styles → o estilo ligado a `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID`, nas variantes clara e
    escura): *Points of interest → Business, Medical, School, Place of worship, Government, Sports
    complex*: visibilidade **off** em todos os zooms; *Park*: rótulo de texto on a partir do zoom 15
    (rua), off abaixo; *Transit → Station*: on a partir do 15; *Road labels*: on. Abaixo do zoom 15
    (bairro e afastado): todos os POIs off. O lugar do Google continua pela busca. Nada disso foi
    feito por mim (é console do Google).
11. Fonte a 130%: validada pelo teste unitário (8d) e pela régua de texto no DOM; não consegui simular
    a escala de fonte do Android no navegador do harness.

## 3. Hoje no mapa → onde fica

| No print de 13:53 | No mapa agora | O resto vai para |
|---|---|---|
| Pino por família (logo verde, roxo, losango, lead por cor) | Fica, em todos os níveis | — |
| Letra Q/M/F e número da parada | Fica | — |
| Nomes (até 8) | 1 (N1) + até 3 (N2) | Cartão do pino e Lista (todos, com nome) |
| 2ª linha "aberto há 81 dias" | Forma do losango; número só ≤ 30 d | Kicker do cartão ("RECÉM-ABERTO · 81 DIAS"), POR QUE AGORA (data do CNPJ e faixa) e linha da Lista ("Recém-aberto há 81 dias") |
| 2ª linha "88 dias sem toque" / "cobrar" | Selo `!` (≤ 400 m) | Cartão, O QUE COBRA (dias sem toque + último contato, prazo, passo vencido) e linha da Lista (em âmbar) |
| "90" dentro do losango | Sai (61–90 = contorno) | Cartão e Lista, idade exata |
| Selo `↓` em queda | Fica, se ≤ 400 m e zoom de rua | Longe: cartão (O QUE COBRA) e Lista ("Cliente em queda · motivo") |
| Selo `↑` (na fila) | Sai | Cartão e aba Tarefas |
| Selos sem limite (~12) | 1 por pino, só de ação, ≤ 400 m | Cartão |
| "+1" no nome | Contador 18 px no pé do pino; "Nome +1" só se a pilha for N2 | Leque (com nomes) e cartão da pilha |
| Círculo escuro da pilha com anel | Pino do líder + sombra de um segundo | — |
| Círculo tracejado de 90 px (aproximado) | Só no pino aberto | Cartão ("Posição aproximada…") e Lista ("~" na distância) |
| Anel de 250 m da microrrota | Sai (celular) | O N2 (até 400 m) e o grupo PEDEM AÇÃO PERTO da Lista |
| "próxima porta · …" | Anel sólido de 52 px + "120 m · motivo" | Folha (como hoje) |
| Bolinha azul | Camada mais alta, zona livre de 24 px | — |
| Brilho limão do recém | Sai | — |
| POIs do Google (Clínica SAMP, Atacado) | Configuração do Map ID (pendência acima) | Busca |

## 4. Eventos para a migração

O CHECK de `eventos_do_mapa.tipo` hoje aceita: `'primeiro_toque','fala_aberta','halo_sugerido',
'halo_aceito','referencia_tocada','se_ele_disser_aberto','plano_proposto','plano_confirmado',
'plano_ignorado'`. Acrescentar: **`'mapa_render','pino_toque','pilha_abrir','alternador','lista_linha_toque'`**.
Até lá o insert é recusado e o app engole (o código 23514 não desliga os outros eventos).

- `mapa_render {zoom, modo, n2_nomes, n3_pinos, rotulos_descartados, n1, n1_rotulo, largura, fonte}` — por cena nova, no máximo a cada 5 s
- `pino_toque {nivel, familia, zoom}`
- `pilha_abrir {n}`
- `alternador {para: 'lista' | 'mapa'}`
- `lista_linha_toque {grupo: 'proxima' | 'perto' | 'resto'}`
