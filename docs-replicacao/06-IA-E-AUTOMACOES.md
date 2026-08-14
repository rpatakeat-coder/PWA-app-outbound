# 06 — Camada de IA e automações

## Princípio: a IA escreve texto, nunca número

Os três geradores recebem **números já calculados** e devolvem **prosa e priorização**.
Nenhum deles inventa métrica. O prompt diz explicitamente: *"Baseie-se SÓ nos números
abaixo — não invente dado que não foi dado."*

Modelo usado: **`claude-sonnet-4-6`** via `POST https://api.anthropic.com/v1/messages`.

> Incidente real que virou regra: em 04/08 alguém colocou `claude-sonnet-5` como model
> string. **Não é um identificador válido** — todas as chamadas passaram a falhar em silêncio,
> o gargalo congelou em 03/08, o resumo semanal reciclou o texto da semana anterior e 7 de 7
> análises individuais caíram em fallback. Ficou **4 dias invisível**. Por isso existe
> `_falhasIA` gravado no JSON de saída: diagnóstico sem precisar abrir o log do Actions.
>
> Ao replicar hoje, use o identificador atual e válido do modelo que você escolher, e
> **falhe alto**: registre a falha num campo que apareça na tela.

## Cliente da Claude — o padrão de robustez (copie inteiro)

```js
async function chamarClaude(prompt, maxTokens, tentativa = 1) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model: MODELO, max_tokens: maxTokens || 2500,
                           messages: [{ role: 'user', content: prompt }] })
  });

  // 429 (rate limit), 529 (overloaded) e 5xx merecem retry.
  // 4xx (modelo inválido, key errada) falha direto — repetir não muda nada.
  if ((res.status === 429 || res.status === 529 || res.status >= 500) && tentativa <= 4) {
    await sleep(1500 * tentativa);
    return chamarClaude(prompt, maxTokens, tentativa + 1);
  }
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const textBlock = data.content.find(b => b.type === 'text');
  if (!textBlock) {                       // retry: resposta sem bloco de texto
    if (tentativa <= 3) { await sleep(800 * tentativa); return chamarClaude(prompt, maxTokens, tentativa + 1); }
    throw new Error('Resposta sem bloco de texto após 3 tentativas.');
  }
  try {
    return JSON.parse(extrairJSON(textBlock.text));
  } catch (e) {                           // retry: JSON malformado/cortado
    if (tentativa <= 3) { await sleep(800 * tentativa); return chamarClaude(prompt, maxTokens, tentativa + 1); }
    console.error(`JSON malformado. Resposta bruta (500 chars): ${textBlock.text.slice(0, 500)}`);
    throw e;
  }
}

// Tolerante a preâmbulo e cerca de código, mesmo instruindo a não usar:
// pega do primeiro '{' ao último '}' em vez de confiar que o texto todo é o JSON.
function extrairJSON(texto) {
  const s = texto.replace(/```json|```/g, '').trim();
  const i = s.indexOf('{'), f = s.lastIndexOf('}');
  return (i === -1 || f === -1 || f < i) ? s : s.slice(i, f + 1);
}
```

Todos os prompts terminam com: *"Responda SOMENTE com um JSON válido, sem markdown, sem
` ``` `, no formato exato: {…}"* — e ainda assim o `extrairJSON` existe, porque o modelo às
vezes inclui preâmbulo.

---

## 1. `generate-daily-gargalo.js` — o diagnóstico do dia

**Quando**: toda rodada do `daily-refresh.yml`, logo depois do `fetch-hubspot.js`.
**Entrada**: `data/hubspot.json` (por executivo: abertos, distribuição por etapa, etapa
dominante e %, leads travados, ganhos da semana).
**Saída**: reescreve **só** `narrativas.reps[id].gargalo`, `.tag`, `.tagLabel`.
`max_tokens: 500`. Roda os executivos **em paralelo**.

O prompt inclui um **exemplo de estilo** (não de conteúdo), o que ancora o formato:

> `"<b>HubSpot (dado ao vivo, 27/07):</b> 36 negócios abertos, 67% ainda em Prospecção
> (24 de 36) — funil não avança, mesmo padrão dos últimos ciclos. Só 2 negócios chegaram em
> Ag. Pagamento — o gargalo é decisão, não geração."`

### O que este script NUNCA toca, de propósito

- **`narrativas.reps[id].compromissos`** — são promessas de PDI combinadas ao vivo no 1:1,
  com checkbox de "cumprido". Só mudam quando o gestor pede.
- **`narrativas._atualizado_em`** — é a *versão* que o front usa para decidir quando resetar
  os checkboxes de PDI (`pdiStorageKey`). Se este script mexesse nela, o check-off de todo
  mundo resetaria **todo santo dia**.

Motivo de existir: antes, o gargalo ficava com "dado ao vivo, 27/07" grudado por semanas.
Pode repetir o mesmo texto se nada mudou — a ideia é nunca ficar parado numa data velha.

---

## 2. `generate-weekly-summary.js` — o resumo da semana (e do mês)

**Quando**: sexta 16h Brasília, depois do `fetch-weekly-comparison.js`.
**Entrada**: `data/weekly-raw.json` + `data/narrativas.json` + `stageMeta.labels` de
`data/hubspot.json`.
**Saída**: `data/resumo-semanal.json` + `data/historico-semanal-mes.json`
(+ `data/historico-mensal-time.json` no fechamento mensal).
`max_tokens: 2500`.

### Gera 2 tipos de texto

**(a) Resumo do TIME** — para o gestor:
```json
{ "resumoGeral": "2-4 frases em HTML simples (pode usar <b>)…",
  "comoAgir":    ["3 a 4 ações objetivas e priorizadas…"] }
```
Restrição crítica no prompt: *"fale só em nível de time/funil agregado. **Não cite nome de
executivo específico** nem avalie desempenho individual — essa análise é vista coletivamente
por todo o time; observações sobre uma pessoa devem ficar para uma conversa de PDI."*

**(b) Resumo INDIVIDUAL por executivo** — escrito **na segunda pessoa** ("você"), endereçado
a ele. Cada um só vê o seu (`porRep[ownerId].resumoIndividual` + `comoAgirIndividual`).

### Fechamento mensal

Na **última sexta do mês** (ou com `FORCE_MONTHLY_MESANO=AAAA-MM`), o script troca o prompt e
a janela: mês inteiro em vez de semana × semana anterior. **O formato de saída é idêntico**
(`resumoGeral` / `comoAgir` / `porRep`), então o front-end não muda nada — a troca é
transparente. O prompt mensal recebe o fechamento do mês anterior e é instruído a dizer
explicitamente se os mesmos pontos continuam em aberto, em vez de repetir as mesmas ações.

### Bug que vale conhecer

`r.ganhosSemana`, `r.fechadosNoMes`, `r.metaMensal`, `r.leadsTravados` **existem** em
`weekly-raw.json`, mas não eram copiados para o contexto do prompt — então
`promptIndividual()` recebia `undefined` e caía nos defaults (0, 0, meta 10). O texto
individual de **todo mundo** dizia "0 ganhos, 0 de 10 fechados", independentemente do número
real. Segundo bug: `etapaDominante` guardava o **ID bruto** do HubSpot, e a IA repetia
"etapa 1395880470" literalmente no texto. **Sempre traduza IDs para labels antes de mandar
ao modelo.**

---

## 3. `generate-individual-analysis.js` — coaching (só o gestor vê)

**Quando**: todo dia no `daily-refresh.yml` **e** na sexta no `weekly-summary.yml`.
**Saída**: Supabase — `analise_individual_semanal` e `analise_individual_mensal`.
`max_tokens: 1000`.

**Idempotente por design**: faz `DELETE where owner_id + semana_label` antes de inserir. É o
que permite rodar diariamente sem duplicar — a análise da semana corrente é reescrita a cada
dia com os números mais frescos.

Recebe como contexto a **análise da semana anterior** (`buscarUltimaSemana`) e o **mês
anterior** (`buscarMesAnterior`) para não repetir o mesmo diagnóstico.

### Compromissos automáticos, com rede de segurança

Este script também atualiza `narrativas.reps[id].compromissos` — **e é o único que pode**:

```
Se a IA devolveu compromissos novos  → usa os novos.
Se devolveu lista vazia              → mantém os existentes automaticamente
                                       (a IA às vezes acha que "nada mudou").
Se a IA falhou                       → NÃO mexe em nada.
```

Sem a rede de segurança do meio, a automação travaria para sempre nesse caso.

`narrativas._atualizado_em` avança **uma vez por rodada semanal** (não por pessoa) e **só se
algum compromisso realmente mudou**. É esperado e correto que isso resete o check-off de todo
mundo toda sexta: compromisso novo da semana, check novo.

---

## GitHub Actions

### `daily-refresh.yml` — 3× ao dia

```yaml
schedule:
  - cron: '59 2 * * *'      # 23:59 Brasília — FECHA O DIA
  - cron: '59 11 * * *'     # 08:59 Brasília — 1 min antes da Daily das 9h
  - cron: '0 18 * * 1-5'    # 15:00 Brasília, dias úteis — meio da tarde
workflow_dispatch: {}
permissions: { contents: write, issues: write }
```

Racional de cada horário:
- **23:59** — expediente acabou; captura o realizado quase completo e já deixa o gargalo do
  dia gerado.
- **08:59** — refresca em cima da hora da Daily. `fetch-hubspot.js` grava **hoje E ontem** a
  cada execução, então esta rodada também **refecha o dia anterior**, como segurança caso a
  das 23:59 tenha falhado.
- **15:00** — a maior parte das visitas da manhã já foi registrada, mas ainda dá tempo de agir
  no resto do dia. Só seg–sex: ninguém em campo no fim de semana.

Passos, em ordem: `fetch-hubspot` → `generate-daily-gargalo` → `generate-individual-analysis`
→ `fetch-weekly-comparison` → `fetch-clientes-ativos` → `prewarm-osm` **[ROTA]** →
`build.js` → commit + push.

### `weekly-summary.yml` — sexta 16h

```yaml
schedule: [ { cron: '0 19 * * 5' } ]
workflow_dispatch:
  inputs:
    force_monthly_mesano:   # AAAA-MM, força o fechamento mensal para teste
```

`fetch-weekly-comparison` (pulado no teste forçado) → `generate-weekly-summary` →
`generate-individual-analysis` → `build.js` → commit + push.

### `backfill-dailies.yml` — só `workflow_dispatch`

Recalcula os últimos 7 dias direto do HubSpot e regrava na tabela `dailies`. Rodar uma vez
quando o cron ficou dias quebrado.

---

## Padrões de operação dos workflows (copie)

### Push resiliente com rebase

O checkout foi feito no início do job. Se alguém commitou no `main` enquanto o robô rodava, o
push é rejeitado por não ser fast-forward — e a atualização do dia se perderia:

```bash
for tentativa in 1 2 3; do
  if git push; then echo "Push OK."; exit 0; fi
  git fetch origin main && git rebase origin/main
done
echo "Não consegui enviar mesmo após 3 tentativas"; exit 1
```

### `git add` tolerante a arquivo inexistente

`git add` num caminho que não existe **falha o comando inteiro** (quebrou um run real com
"pathspec did not match any files"). Arquivos que só nascem depois do primeiro fechamento
mensal precisam de guarda:

```bash
for f in data/historico-semanal-mes.json data/historico-mensal-time.json; do
  [ -f "$f" ] && git add "$f"
done
```

### Falha abre Issue

```yaml
- name: Avisar sobre falha (abre Issue)
  if: failure()
  uses: actions/github-script@v7
```
Sem isso ninguém percebe que o robô parou até alguém reclamar de número velho.

### `continue-on-error` onde a fonte é instável

O passo do OSM usa `continue-on-error: true` — a Overpass é um serviço público mantido por
voluntários e cai sozinha. Não é motivo para deixar o cockpit inteiro sem atualizar.
