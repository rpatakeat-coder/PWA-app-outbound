# 10 — Plano de replicação

Roteiro em 8 fases. Cada uma tem **entregável** e **critério de pronto**. Não avance sem
o critério: as fases posteriores assumem as anteriores.

> **Antes de começar, decida três coisas** e registre a decisão:
> 1. **Stack do front** — o original é HTML/CSS/JS vanilla num arquivo. Qualquer framework
>    serve; o que precisa sobreviver é o contrato `DATA` e o comportamento das telas.
> 2. **Mesmo HubSpot/Supabase ou novos?** Se forem novos, os ids de pipeline e etapa mudam
>    e `data/*.json` precisa ser re-derivado do CRM de destino.
> 3. **Escopo** — replicar tudo ou um subconjunto. Se for subconjunto, corte por **tela
>    inteira**, nunca por "metade de uma regra".

---

## Fase 0 — Fundação (meio dia)

**Entregável**
- Repositório com `api/`, `lib/`, `scripts/`, `data/`, `supabase/migrations/`, front.
- Projeto Supabase criado; projeto Vercel (ou equivalente) ligado ao repositório.
- Todas as variáveis de ambiente de `01-visao-geral-e-arquitetura.md` configuradas.

**Critério de pronto:** uma rota `GET /api/ping` responde em produção e `SUPABASE_URL`
está legível de dentro dela.

---

## Fase 1 — Banco e identidade (1 dia)

**Entregável**
- Todas as migrations de `supabase/migrations/` aplicadas, na ordem, começando pelo
  baseline. Registrar cada uma em `APLICADAS.txt`.
- `mapa_usuarios` populada; `data/usuarios.json` idêntico a ela.
- Supabase Auth configurado (e-mail/senha + reset).

**Critério de pronto**
```sql
-- logado como um rep, esta consulta devolve SÓ as linhas dele
select * from dailies;
-- logado como rep, esta devolve ZERO linhas
select * from cockpit_snapshot;
```

**Cuidado:** aplicar o baseline **antes** de qualquer outra migration — várias posteriores
fazem `alter policy`, que é erro se a policy não existir.

---

## Fase 2 — O robô do CRM (2–3 dias) · *a fase mais cara*

**Entregável**
- `lib/temperatura.js` + `data/temperatura.json`
- `lib/realizado.js`
- `lib/territorios.js` + `data/territorios.json`
- `scripts/fetch-hubspot.js` produzindo a chave `hubspot` completa
- `lib/publicar-snapshot.js` escrevendo em `cockpit_snapshot` **e** `snapshot_farol`
- Workflow com cron

**Critério de pronto**
- `select chave, bytes, atualizado_em from cockpit_snapshot` mostra `hubspot` com centenas
  de KB.
- A soma de "em aberto" por executivo **fecha com o total do time**. Se não fechar, pare
  aqui — esse é o defeito que corrói a confiança em todas as telas.
- A guarda `STAGE_RANK × temperatura.json` está ativa e derruba o sync se divergirem.

**Ordem sugerida dentro da fase:** KPIs e funil → leads por etapa → temperatura →
travados/quentes → vendas do mês (as três medidas) → agenda → histórico e motivos de perda.

---

## Fase 3 — `/api/dados` e o corte por papel (1–2 dias)

**Entregável**
- `scripts/montar-dados.js` com `montarDadosCompletos()` e `filtrarParaPapel()`
- `api/dados.js` com validação de sessão, cache por assinatura e `?recurso=`
- `removerNulosRecursivo`

**Critério de pronto**
- Logado como gestor: o payload tem `reps` com gargalo e clientes.
- Logado como rep: `grep` no payload **não acha** nenhum nome de cliente de colega,
  nenhum `snapshotReps` de outro, nenhum `territorio` de outro.
- Sem snapshot → **503 com motivo**, nunca 200 com zeros.
- `procedencia.fonte` diz corretamente `supabase` / `misto` / `arquivo`.

**Escreva a suíte deste corte antes de seguir.** É a única fase cujo defeito é invisível
na tela.

---

## Fase 4 — Shell, login e hidratação (1–2 dias)

**Entregável**
- Build que gera o artefato público **sem nenhum dado do CRM** (placeholders com o tipo
  certo).
- Tela de login com os três formulários (entrar / reset / nova senha).
- `aplicarSessao()` → `aplicarVisaoPorPapel()` → `mostrarApp()`.
- Assinatura de `snapshot_farol` via Realtime, com a trava de "não interromper quem está
  registrando".

**Critério de pronto**
- Abrir o código-fonte da página **sem logar** e não achar funil, MRR nem nome de cliente.
- Publicar uma mudança no snapshot e ver a tela repintar **sem F5**.
- 401 do servidor derruba a sessão e mostra a pill âmbar "sua sessão terminou".

---

## Fase 5 — As telas, por ordem de valor (o grosso do trabalho)

Construa **uma tela por vez, ponta a ponta**. A ordem é por valor entregue:

| # | tela | por que nesta ordem |
|---|---|---|
| 1 | **Hoje** (executivo) | é a tela que define o dia de 6 pessoas; valida o contrato `DATA` inteiro |
| 2 | **Time** (gestor) | valida o recorte de gestor e as contas agregadas |
| 3 | **Meu funil** (kanban) | valida escrita otimista e mudança de etapa |
| 4 | **Daily** (os dois papéis) | valida prometido × realizado, o par mais delicado |
| 5 | **Planejamento / Rota & Agenda** | valida `planos_semanais`, grade 5×7 e mapa |
| 6 | **Semana** (gestor) | depende do robô de IA da fase 6 |
| 7 | **Pessoas / Desenvolvimento** | PDI e 1:1 espelhados entre os dois papéis |
| 8 | **Rotas & Prospecção** | depende dos coletores da fase 6 |
| 9 | **Playbook / Propostas** | conteúdo, menor acoplamento |

**Critério de pronto de cada tela**
- Os três níveis respeitados (decisão / aprofundamento / drawer) — nunca os três juntos.
- Todo número tem janela rotulada ao lado.
- Nenhum estado vazio renderiza `0` quando o certo é "não medido".
- Todo `cursor:pointer` faz algo (há uma auditoria de clique para isso).
- A tela repinta quando um negócio muda de etapa em outra aba.

---

## Fase 6 — Automações de apoio (2–3 dias)

- `generate-weekly-summary.js` (IA) → `narrativas` + `resumo-semanal` +
  `analise_individual_*`
- `fetch-weekly-comparison.js` → `weekly-raw`
- `radar-semanal.js` → `radar_pracas` + `noticias_setor`
- `backfill-casa-dos-dados.js` e `backfill-google-places.js` → `leads_prospeccao`
- `api/hubspot-webhook.js` com assinatura + cooldown

**Critério de pronto:** `narrativas.reps` existe com uma linha por executivo — sem isso a
fase 3 devolve 503 e nada funciona.

---

## Fase 7 — Escritas e integrações (2 dias)

- `/api/negocio-acao` com os 6 `op`
- `/api/criar-negocio`, `/api/criar-empresa-prospeccao`, `/api/desfazer-negocio`
- `/api/importar-leads`, `/api/buscar-leads`
- `/api/restaurantes-proximos`, `/api/novidades-mercado`
- `/api/fila-pwa`
- Interceptador de `PWA_DEEP_LINK` (se houver app de campo)

**Critério de pronto**
- `op` inválido devolve 400 **com a lista das aceitas**.
- Escrita recusada pelo HubSpot **volta a tela** e diz o motivo.
- Executivo não consegue criar negócio para outro dono (403 comprovado por teste).

---

## Fase 8 — Guardas e testes

Porte as guardas na ordem de valor:

| guarda | o que evita |
|---|---|
| sintaxe dos scripts inline | tela em branco atrás do login |
| variável CSS sem declaração no alcance | número invisível no hero |
| classe usada em seletor sem markup que a gere | CSS morto e fiação quebrada |
| destino de navegação que não existe | clique morto |
| função chamada e não declarada | erro em runtime |
| breakpoint fora da escala | layout fora do sistema |
| piso de toque 38px sem par de 44px em mobile | alvo pequeno demais na rua |
| "hoje" saindo de `new Date()` cru | bug de fuso |
| zero inventado na tela do gestor | acusar alguém que trabalhou |
| migrations não versionadas | banco divergir do repositório em silêncio |

**Critério de pronto:** o build roda as guardas e **sai com código ≠ 0** se qualquer uma
reprovar. Uma guarda que não acha o próprio alvo deve **reprovar**, nunca passar em branco
— guarda que perdeu o alvo é guarda morta.

---

## Armadilhas que já custaram caro (leia antes de codar)

1. **`||` com zero.** `h.metaMensal || 10` transformou meta 0 em meta 10. Use `!= null`.
2. **Spread cego no filtro por papel.** Três vazamentos nasceram assim.
3. **`var(--x)` sem fallback e sem definição** — morre em silêncio.
4. **Comparar vencimento por instante, não por dia** — some a tarefa do dia às 09h01.
5. **`signOut()` sem escopo** — derruba a sessão da pessoa em todos os dispositivos.
6. **Guardar o DATA montado em cache** — cria um segundo lugar onde o recorte por papel
   pode divergir. Cacheie as **fontes**, nunca o resultado filtrado.
7. **Repintar sem colapsar** — um gesto redesenhava a tela três vezes.
8. **Erro de rede virando zero** — a barra desce e o executivo vê pontos desaparecerem.
9. **Regra escrita em dois lugares** — divergem sempre; a única dúvida é quando.
