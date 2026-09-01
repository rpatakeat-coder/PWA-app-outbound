# M9 — Cadastro e CEP (prompt único, mobile)

**Arquivos:** `src/screens/CEPStep.tsx` (tela toda) · `App.tsx` — modal do formulário ~L5840–5998 · `<CEPStep>` ~L5812–5837 · `startMapCreation` ~L2142 · `submitClient` ~L2210–2250 · `resetForm` / estado inicial `cep` L218 · `pendingGeoApproximate` L544 · `statusOptions` no seletor ~L5862
**Alvo visual:** `handoff-M9/M9 - Cadastro e CEP.dc.html` — quadros **1a** CEP vazio · **1b** CEP resolvido · **1c** CEP não encontrado · **2a** cadastro/dados · **2b** cadastro/endereço · **2c** salvando e duplicado. Abra no browser e bata o resultado contra eles.

> `M0`–`M8` já rodaram. **Só o passo do CEP e o formulário de cadastro.** Não redesenhe mapa, lista, ficha do lead, agenda, tarefas nem o fluxo de edição de localização. Se achar problema fora do escopo, anote e siga.

**Tokens mobile:** maior tipo **18/24** · item de lista `min-height:56` · botão 48 raio **12** · card/campo raio **16** · spacing ≤ **24** (+32 de rodapé de área segura) · alvo ≥ **48** · raios só `4 · 12 · 16 · pill`.

---

## O problema

1. **O passo do CEP não mostra o que encontrou.** `onNext` despeja `endereco`, `cidade`, `estado`, `latitude`, `longitude` no form e abre o formulário — o vendedor descobre o endereço resolvido lá dentro, misturado com dez inputs. Se o geocoder errou a rua, ele só percebe depois de digitar tudo.
2. **`geoApproximate` é decidido sem o vendedor saber.** O flag vem do CEPStep, atravessa `pendingGeoApproximate` e vira `clients.geo_approximate` no submit (~L2225) sem nunca aparecer na tela. O único aviso é um texto de 11px no meio do formulário ("Confira o número — pode ter sido auto-preenchido pelo mapa").
3. **O formulário é uma pilha plana.** Status, empresa, contato, telefone, e-mail, cidade, UF, endereço, número, observações — dez `TextInput` iguais com o nome do campo **só no placeholder**, que desaparece no primeiro caractere. Cidade/UF/endereço já vieram do CEP e continuam abertos para edição livre.
4. **O seletor de status tem uma opção.** Na criação, `statusOptions.filter(opt => opt.value === 'lead')` renderiza um botão de escolha com um único valor possível.
5. **Erro de duplicado é um beco.** `23505` → `Alert.alert('Cliente já existe')` e o vendedor volta ao formulário cheio, sem caminho para o registro que já existe.

---

## Fase 1 · Inventário — sem editar nada

1. Leia `src/screens/CEPStep.tsx` inteira e descreva: quais estados ela tem, qual serviço de CEP ela chama (ViaCEP? Nominatim? os dois?), o que acontece em falha de rede, timeout e CEP inexistente, e **como exatamente `geoApproximate` é calculado**.
2. Diga se o campo **Número** já existe no CEPStep ou só no formulário — `onNext` passa `numero` (L5823), então ele vem de algum lugar.
3. Confirme a máscara de CEP: onde é aplicada e se aceita CEP sem hífen.
4. Confirme que `onPickOnMap` → `startMapCreation` (L2142) é o único caminho alternativo, e o que ele faz com o CEP já digitado.
5. Confirme os obrigatórios reais: o `disabled` do submit olha **só** `form.nome` (~L5990) mas o placeholder marca `empresa` com `*` também. Qual vale?
6. Diga se há validação de telefone ou e-mail em qualquer lugar do caminho, ou se vão crus pro banco.
7. Preencha:

| O desenho pede | Existe? | Onde / campo |
|---|---|---|
Endereço resolvido visível no passo 1 | | |
Campo Número no passo 1 | | |
Complemento | | |
Estado de erro por campo (borda + mensagem) | | |
`geoApproximate` visível na tela | | |
Rótulo permanente no campo | | |
Caminho para o cliente duplicado | | |

**Se um item não existir, diga qual e não o desenhe.** Complemento em particular: se não há coluna `complemento` em `clients`, **não crie o campo** — diga isso e siga sem ele.

Entregue a tabela **antes** da fase 2, na mesma resposta.

---

## Fase 2 · Aplicar

### A · Passo 1 — CEP (quadros 1a · 1b · 1c)

Folha ancorada embaixo: raio `16px 16px 0 0`, `padding` lateral 16, rodapé `16 16 32`, handle 36×4 raio 2 `--stroke-default`. Header: título **"Onde fica o restaurante?"** 18/24/0.15 peso 600 + sublinha **"Passo 1 de 2"** 12/16/0.4 `--text-faint` + `close` 20px à direita (chama `onCancel`).

**Campo (o padrão de campo de todo o M9):** `min-height:56px`, raio 16, fundo `--surface-nested`, borda 1px `--border`; **rótulo permanente** 11/16/0.5 `--text-faint` na primeira linha, valor 16/24/0.15 peso 500 `--text` na segunda. Foco: borda `--stroke-strong`. Erro: borda `#C8131B` + mensagem 12/18 abaixo. Placeholder-como-rótulo sai de vez.

- **1a — vazio:** campo CEP com teclado numérico e máscara `00000-000`. CTA **"Buscar CEP"** desabilitado (fundo `--surface-sunken`, texto `--text-disabled`) até oito dígitos. Abaixo do campo, **"Selecionar no mapa"** com ícone `map`, alvo 48px, em `--tint-red-text` — chama `onPickOnMap`, sem mudança de comportamento.
- **1b — resolvido:** o CEP ganha `check` em `--success`. Abaixo, o **cartão de endereço**: raio 16, fundo `--surface-nested`, ícone `location_on` 24px, kicker "ENDEREÇO ENCONTRADO" 11/16/1 peso 700 em `--success`, rua 16/24 peso 600, "bairro · cidade · UF" 12/18/0.4 `--text-secondary`; rodapé separado por borda 1px com **"Não é aqui? Selecione no mapa."**. Depois dele, **Número** (flex 2) e Complemento (flex 3, **só se a fase 1 confirmou a coluna**). CTA **"Continuar"** em `--brand` com `arrow_forward`.
- **1c — não encontrado:** campo com borda `#C8131B` e `error`, faixa de aviso raio 12 fundo `--tint-warn` texto `--warn` 12/18. **Mesmo layout para os três casos** — CEP inexistente, sem rede, timeout —, só o texto muda; diga na resposta qual texto usou para cada. O CTA vira **"Selecionar no mapa"** em `--brand` com nota 12/18 centralizada abaixo. O CEP digitado **permanece no campo**.

**Sem número, o CTA continua ativo** e o lead segue como aproximado — não bloqueie o fluxo. `geoApproximate` continua vindo do mesmo cálculo que a fase 1 documentou; **não mude a regra**, só a exiba.

### B · Passo 2 — Cadastro (quadros 2a · 2b · 2c)

Mesma folha, mesmo padrão de campo. Header **"Novo lead"** + "Passo 2 de 2" + **`arrow_back` 24px à esquerda**, que volta ao passo 1 **com o CEP e o endereço já resolvidos** — não recomece a busca.

- **Status:** o seletor sai. No lugar, pill 32px raio pill fundo `--brand` texto branco 12/16/0.4 peso 600 **"Lead"** + nota 12/18 `--text-faint` "Todo cadastro novo entra como lead". **Na edição, o seletor continua exatamente como está** — incluindo o guard de `cliente`/`churn`. Não toque nele.
- **Seções** 11/16/1 peso 700 uppercase `--text-faint`, `margin:16px 0 8px`: **Restaurante** · **Contato** · **Endereço** · **Observações**.
- **Campos:** Nome do restaurante * · Nome do contato * · Telefone · E-mail · Anotações. `keyboardType` e `autoCapitalize` como hoje.
- **Endereço** não é input: é o mesmo cartão do 1b, kicker **"VINDO DO CEP"**, linha 1 "rua, número", linha 2 "CEP · cidade · UF", rodapé **"Editar endereço"** — que abre os campos de cidade/UF/rua/número, ainda ligados ao mesmo `form`. Editar endereço **zera `pendingGeoApproximate`** (é o que os outros fluxos já fazem, ~L2225).
- **Sem número:** o cartão vira `--warn`, ícone `my_location`, kicker **"LOCALIZAÇÃO APROXIMADA"**, linha 2 termina em "sem número" (quadro 2c). O texto de 11px de hoje sai — este cartão o substitui.
- **CTA "Salvar lead"** 48px raio 12, largura cheia. Ativo quando **restaurante e contato** estão preenchidos — se a fase 1 confirmou que o `disabled` só olha `nome`, **corrija para os dois** e diga isso. Nota 12/18 centralizada "Restaurante e contato são obrigatórios" enquanto desabilitado.
- **Salvando:** rótulo **"Salvando…"** + spinner, fundo `--brand` mantido, texto a 70%. Não troque o botão por um `ActivityIndicator` sozinho.
- **Duplicado (`23505`):** em vez do `Alert` seco, faixa de aviso `--tint-warn` dentro da folha: "Já existe um cliente com esse nome nesta localização." **Se der para abrir a ficha do registro existente, ofereça** — senão mantenha só a mensagem e diga na resposta por que não deu (provavelmente o erro do Postgres não devolve o id).

### C · O que não muda de contrato

- `onNext({ cep, endereco, numero, cidade, estado, latitude, longitude, geoApproximate })` — mesmos campos, mesmos tipos. **Não renomeie nada.**
- `onCancel`, `onPickOnMap`, `startMapCreation`, `pendingGeoApproximate` → `clients.geo_approximate`.
- `status: 'lead'` na criação; o trigger `guard_client_status_transition` segue mandando.
- `submitClient`, `saveEditClient` e o tratamento de `23505` — só a apresentação do erro muda.

---

## Não mexer

- o cálculo de `geoApproximate` e a detecção de colisão de coordenadas (~L2047, ~L6197)
- o seletor de status na **edição** e o guard de `cliente`/`churn`
- `OutboundCadastroScreen` — é outro fluxo, mesmo parecendo o mesmo formulário
- `reverseGeocode` e o fluxo de pin no mapa (`creationMode`, `creationCenter`)
- clustering do mapa, carregamento por área visível, `src/constants/stages.ts`
- service worker, `useForceReload`, `vercel.json`

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Passo 1 com título, "Passo 1 de 2" e `close` ligado a `onCancel`.
2. Campo padrão: `min-height:56`, raio 16, **rótulo permanente** 11/16 + valor 16/24 peso 500. Nenhum campo do M9 usa placeholder como nome.
3. CTA "Buscar CEP" desabilitado até oito dígitos; máscara `00000-000`.
4. **O endereço resolvido aparece no passo 1**, no cartão, antes de avançar.
5. Número (e Complemento, se existe coluna) no passo 1; sem número o CTA continua ativo.
6. Erro: borda `#C8131B` + faixa `--tint-warn`; CEP digitado preservado; **três textos distintos** para inexistente / sem rede / timeout, e você listou os três.
7. Passo 2 com `arrow_back` que volta ao passo 1 **sem perder o CEP resolvido**.
8. Seletor de status **substituído por pill na criação**; **inalterado na edição**, guard incluído.
9. Quatro seções na ordem: Restaurante · Contato · Endereço · Observações.
10. Endereço como cartão com "Editar endereço"; editar **zera `pendingGeoApproximate`**.
11. Sem número: cartão em `--warn` com "Localização aproximada"; o texto de 11px de hoje foi removido.
12. CTA ativo só com restaurante **e** contato; você disse se corrigiu o `disabled`.
13. Salvando mantém rótulo + spinner. Duplicado aparece dentro da folha.
14. **`onNext` com os mesmos oito campos**; `geoApproximate` calculado pela mesma regra de antes.
15. `geo_approximate` chega no banco igual — teste um lead com número e um sem, e confira a coluna.
16. Nenhum hex fora dos literais permitidos; spacing ≤ 24 (+32); maior tipo 18/24; raios só `4 · 12 · 16 · pill`; alvo ≥ 48.
17. Teclado aberto não cobre o CTA (`KeyboardAvoidingView` continua fazendo seu trabalho nos dois passos).
18. `npm run typecheck` limpo.

**Conferir em 390×844**, comparar com os quadros 1a–2c, **alternar o tema e repetir no escuro**, e testar o caminho completo duas vezes: com CEP válido + número, e com CEP que falha → mapa.

## Ao terminar

A tabela da fase 1, depois três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o campo ou a coluna que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe — em especial sobre `geoApproximate` e o serviço de CEP —, **pare e pergunte** em vez de aplicar por cima.
