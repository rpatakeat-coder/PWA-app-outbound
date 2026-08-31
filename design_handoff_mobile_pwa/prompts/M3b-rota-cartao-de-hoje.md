# M3b — Rota: cartão "Rota de hoje" quebrado em 390px

**Arquivo:** `App.tsx` — `cartaoLista`, ~L2944–3015 (`styles.panelHeaderRow`, `styles.secondaryButton`)
**Evidência:** print em 390×844 — "Rota / de / hoje", "5 leads planejad / os", "Via / OSRM / (ORS / estava / fora)".
**Alvo visual:** `design_handoff_mobile_pwa/M3b - Cartao Rota de hoje.dc.html` — quadro **1b** (o cartão) e **1c** (ele no lugar, com header, mapa, sequência e barra). O 1a reproduz o estado atual, para comparação.

> Ajuste pontual, não redesign. `M0`–`M6` já rodaram; o M3 não pegou este cartão. **Não toque em outra região da tela nem em outro arquivo.**

**Tokens mobile:** botão 48px raio 12 · card raio 16 · spacing ≤ 24 · alvo ≥ 48 · maior tipo 18/24.

## A causa

`panelHeaderRow` é `flexDirection:'row'`: o bloco de texto (`flex:1`) disputa a linha com um grupo de três `secondaryButton` de largura natural. Os botões não encolhem, a coluna de texto é comprimida **abaixo do min-content** e cada palavra vira uma linha. Em desktop a linha cabe, então o bug só existe no celular.

## Fazer

1. **Empilhar no mobile.** `panelHeaderRow` passa a `flexDirection: layout.ehDesktop ? 'row' : 'column'`, `alignItems: layout.ehDesktop ? 'flex-start' : 'stretch'`, gap **12**. Não mexa no comportamento desktop.
2. **Coluna de texto:** além de `flex:1`, adicionar **`minWidth:0`** — sem isso o bug volta em qualquer variação de largura. Título "Rota de hoje" 16/24/0.15 peso 600; sublinha 12/16/0.4 `--text-faint`, em **uma linha** com as três métricas separadas por `·`.
3. **Grupo de ações vira faixa própria** abaixo do texto, largura total: `flexDirection:'row'`, gap **8**, cada botão `flex:1`, altura **48**, raio 12, `justifyContent:'center'`, rótulo 14/20/0.1 peso 600 e **`numberOfLines={1}`**. Some `flexWrap` — com três botões de `flex:1` não há o que envolver. No desktop mantenha o grupo à direita como está hoje.
4. **"Limpar" vira botão de ícone.** Os três com rótulo não cabem em 390px: "Navegar" e "Ver no mapa" ficam com `flex:1` e "Limpar" passa a ícone `delete` 48×48 (`flex:0 0 48px`) no fim da faixa, tonal `--tint-red` com borda `--tint-red` e ícone `--tint-red-text`, `accessibilityLabel="Limpar rota"`. Já está decidido — não escolha outra saída.
5. **Badge do provedor** (`providerBadge`, só admin): `alignSelf:'flex-start'`, `flexShrink:0`, texto `numberOfLines={1}`, `margin-top:8`. Ele não pode empurrar nem ser empurrado.
6. **Cores dos botões vêm da paleta existente:** "Navegar" segue `#16a34a` (o verde de "Fechado" em `stages.ts`), "Ver no mapa" `#C8131B`, "Limpar" tonal `--tint-red`/`--tint-red-border` com texto `--tint-red-text`. Não invente cor nova; só garanta que o texto de "Limpar" está no token, não em hex.
7. **O cartão está sendo cortado pela barra inferior** no print. Confirme a reserva de scroll do M3 (40) no container da Rota e que o último cartão termina acima da nav + FAB. Se estiver faltando, aplique.

## Não fazer

- Não mude a lógica de `startNavigation`, `viewRouteOnMap` nem o `Alert` de limpar.
- Não reescreva as copies.
- Não altere o layout desktop deste cartão.
- Não mexa na engrenagem do header — ela sai no M7.

## Pronto quando

- [ ] em **390×844**, "Rota de hoje" em **uma linha**; a sublinha em uma ou duas, nunca palavra por palavra
- [ ] badge do provedor em uma linha
- [ ] três ações em faixa de largura total, 48px de altura, rótulos sem quebra
- [ ] `minWidth:0` na coluna de texto
- [ ] nada do cartão embaixo da nav ou do FAB
- [ ] desktop inalterado (comparar antes/depois)
- [ ] repetir no **tema escuro**
- [ ] `npm run typecheck` limpo

## Ao terminar

Três linhas: **o que mudou** · **se o resultado bate com o quadro 1b do DC** · **outros cartões da Rota com o mesmo `panelHeaderRow` em risco** — se houver, liste sem corrigir; eu decido o escopo.
