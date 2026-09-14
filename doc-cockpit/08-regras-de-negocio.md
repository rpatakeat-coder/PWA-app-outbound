# 08 — Regras de negócio

> Estas regras foram calibradas contra dados reais de produção. Cada uma tem um defeito
> por trás. **Não alterar sem decisão explícita.**

## A lei zero: "não medido" ≠ zero

Vale em todo o sistema, em todas as camadas:

| situação | o certo | o errado |
|---|---|---|
| app de campo não reportou a fila | linha ausente em `fila_pwa` | gravar `pendentes: 0` |
| TAM da praça não foi obtido | `tam_fonte: 'nao_medido'`, `pct_tocado: null` | `tam: 0` |
| executivo sem `ownerId` no HubSpot | `{ semOwner: true, motivo }` | quatro zeros |
| HubSpot falhou ao medir o dia | 502, tela mantém o último número | barra descendo a zero |
| snapshot ausente | 503 com o motivo | tela de zeros |
| negócio sem último toque | fator sai da conta, nota marcada `parcial` | recência = 0 |
| grade da semana não lida | "não lida" | "dia vazio" |
| `decisor_alcancado` ausente | *desconhecido* | `nao` |

Motivo: zero silencioso **afirma que a pessoa não trabalhou**. É o pior erro que a
ferramenta pode induzir, porque acusa alguém na frente do time.

---

## Pipeline HubSpot — `916011864` (Field Sales)

| etapa | id | SLA (dias) | rank |
|---|---|---|---|
| Backlog | `1396007427` | — | — |
| **Prospecção** | `1395880469` | 5 | 1 |
| **Visita** | `1396005401` | 5 | 2 |
| **Conversa com Decisor** | `1395880470` | 4 | 3 |
| **Demo/Proposta** | `1395880471` | 3 | 4 |
| **Negociação** | `1395880472` | 7 | 5 |
| **Ag. Pagamento** | `1395880473` | 2 | 6 |
| Ganho | `1396006162` | — | — |
| Enviado Onboarding | `1396006163` | — | — |
| Perdido | `1396006164` | — | — |
| Reciclagem | `1398311191` | — | — |
| Conta Alvo | `1413529973` | — | — |

**"Em aberto" = negócio nas SEIS etapas abertas deste pipeline.** Nada mais. Essa
definição é a fonte da divergência documentada com o app de campo (115 vs 124) — se o
outro sistema usar outro recorte, o rótulo precisa dizer qual.

### Cortes de janela (deliberados, e cada um tem uma data)
```
CORTE_PERDIDO_ISO     = '2026-09-01'  # 1.811 perdidos já no CRM não descem
CORTE_GANHO_ISO       = '2026-09-07'  # 24 ganhos antigos ficam no HubSpot
CORTE_ONBOARDING_ISO  = '2026-09-02'  # 431 em Onboarding não viram 431 cards
```
Os cortes usam `hs_v2_date_entered_<etapa>` (quando **entrou** na etapa) — **não**
`closedate` (que marca outra coisa) nem `hs_lastmodifieddate` (que é "alguém mexeu" e
traria de volta um negócio de julho editado ontem).

A leitura de **motivo** de perda (90 dias) **não** usa esse corte: ali a pergunta é "por
que o time perde", e quanto mais histórico melhor.

### Regras de movimentação
- Negócio novo **só nasce em Backlog ou Prospecção**.
- Prospecção **exige** a propriedade "Origem do Lead".
- Cada etapa tem **propriedades obrigatórias** para entrar nela — e a entrada em Visita
  exige `nome_do_sistema` + `gargalo_operacional` (a qualificação).
- `gargalo_operacional` é **enumeração** no HubSpot; valor fora da lista volta como erro
  cru da API. Valores: `Fila` · `Falta de Garçom` · `Falta de Gestão` · `Sem fidelização` ·
  `Demora na divisão de contas` · `Estoque`.
- CPF/CNPJ pontuado faz o HubSpot **recusar a passagem inteira** — enviar só dígitos.
  (E o RPA do Asaas recusa CNPJ inválido e avisa por WhatsApp horas depois.)

---

## Semáforo de saúde do funil

```
pct = leadsTravados / emAberto
< 15%  → 'ok'    "Funil saudável"
< 35%  → 'warn'  "Atenção"
>= 35% → 'crit'  "Funil travado"
```
O mesmo cálculo serve ao semáforo do time (gestor) e ao pessoal (executivo).
"Travado" = negócio aberto **acima do SLA da etapa em que está**.

---

## Temperatura do negócio — 0 a 100

Uma nota, calculada no robô (`lib/temperatura.js`), lida por **todas** as telas. A régua
está em `data/temperatura.json` — **mexer lá muda a régua no próximo sync, sem tocar em
código**.

```
nota = (Σ pesoᵢ × fatorᵢ) / (Σ pesoᵢ dos fatores usados) × 100

pesos: etapa 45 · valor 20 · recência 35

etapa    = (rank - 1) / (rankMax - 1)           # Prospecção 0 … Ag.Pagamento 1
valor    = min(mrr / 800, 1)                     # 800 = MRR do plano Enterprise
recência = max(0, 1 - dias / 14)                 # 1 no dia do toque, 0 aos 14 dias

faixas: >= 70 'quente' · >= 55 'morno' · abaixo 'frio'
```

Quatro decisões dentro disso:
1. **Sem toque registrado, a recência SAI da conta** e os pesos restantes são
   renormalizados; a nota volta com `parcial: true`. Zerar daria teto de 65 a todo negócio
   sem nota e faria a tela afirmar frieza que ninguém verificou.
2. **Recência conta dias corridos**, não úteis — o cliente não sabe que foi sábado.
3. **Valor usa MRR, não valor do contrato**: anual e mensal do mesmo cliente valem o mesmo
   por mês.
4. **A palavra deriva da nota.** Nunca manter as duas independentes — a tela mostraria
   "82°" ao lado de um selo "morno".

**Guarda ativa:** `STAGE_RANK` (código) e `temperatura.json` (config) descrevem a mesma
ordem. Divergir **derruba o sync** — falhar ali é barato (o robô roda a cada 2h e o
snapshot anterior continua no ar); ranking errado na TV da sala não é.

Etapa fora do funil (Backlog, Perdido, Reciclagem, Onboarding) volta **intacta**: negócio
perdido não tem temperatura, e dar 12° a ele encheria o ranking do gestor de coisa morta.

---

## Realizado do dia (`lib/realizado.js`) — uma conta, dois transportes

A mesma função serve o robô (3×/dia, grava em `dailies`) e a tela ao vivo
(`/api/dados?recurso=realizado-hoje`, a cada minuto). **Se fossem duas implementações, a
tela e a tabela responderiam a mesma pergunta de dois jeitos.**

As quatro medidas do dia:
```
visitas      → tarefas de visita do dia (por assunto/corpo), com dedupe
avanços      → entradas em Conversa com Decisor, Negociação, Ag. Pagamento
propostas    → entradas em Demo/Proposta
fechamentos  → entradas em Ganho
```

Regras de fuso: **tudo é dia de Brasília**. `inicioDoDiaBrasiliaMs`, `diaISOBrasilia`,
`horaBrasilia`. Há uma guarda (`checarHojeDaAgenda`) que reprova qualquer "hoje" saindo de
`new Date()` cru.

**Toda tarefa datada sem hora específica vai para 12:00 UTC (09:00 BRT)** —
`Date.UTC(ano, mes, dia, 12, 0, 0)`. Até 28/08 o vencimento era comparado por *instante*,
e toda tarefa datada para hoje desaparecia da tela às 09h01 — o dia útil inteiro. Corrigido
para comparação **por dia**.

**Deduplicação de visita:** mesma visita pode subir pelo Expogo e pelo app. O critério é
conservador — mesmo dono + mesmo dia + mesmo cliente normalizado — e a duplicidade é
**reportada na tela**, não escondida.

---

## Cadência (`data/cadencias.json`)

Régua de toques por situação. **Configuração, não código** — o template lê de
`DATA.cadencias`. Exemplo (`primeiro_contato`):

```
toque 1 · D+0  · visita   · Visita ou abordagem inicial
toque 2 · D+1  · ligação  · Ligar retomando o contexto da visita
toque 3 · D+3  · whatsapp · Enviar caso/vídeo ligado à dor encontrada
toque 4 · D+5  · visita   · Nova tentativa com o decisor ou demonstração
toque 5 · D+7  · ligação  · Pedir decisão sobre continuidade
toque 6 · D+10 · whatsapp · Última tentativa ativa
```

`dia` = D+n contado **a partir do último toque registrado**. Cada cadência tem também
condições de `encerramento`. No shell público `cadencias` é `null`, e o front trata `null`
como "régua não configurada" — **nunca cai numa régua inventada em código**.

---

## As TRÊS metas (`data/metas.json`)

```
clientes → negócios que chegaram a GANHO no mês (pagamento efetuado)
mrr      → a mensalidade do plano (valor_de_mrr)
receita  → o valor TOTAL do plano negociado (amount), preenchido na passagem
           para Enviado Onboarding
```

**MRR e receita não se somam e não se misturam.** Para um plano anual de R$ 800/mês, são
R$ 800 de MRR e R$ 9.600 de receita.

Há **dois patamares** de meta, por pessoa — não uma meta única de 10 por cabeça. Mudar a
meta de alguém é mudar o número no JSON e abrir um PR; não se mexe em código.

### Mês de competência
O CRM só tem `closedate`. Quando uma venda "foi do mês passado, o boleto compensou na
virada", isso está registrado **negócio por negócio, com motivo**, em `metas.json`. A
venda ajustada **sai** do mês e o ajuste **viaja no payload** (`vendasMes.ajustadas`) para
a tela poder dizer que houve — divergir do CRM em silêncio seria pior que o número errado.

---

## Desfecho de visita — o formato `DESFECHO_VISITA v1`

O parser (`tpDesfechoDaNota`) lê a nota do negócio. Formato obrigatório:

```
DESFECHO_VISITA v1
cliente: Bar do Zé
ocorrido_em: 2026-08-27T17:30:00.000Z
canal: visita
desfecho: decisor_ausente
pessoa: Marcos
papel: Gerente
decisor_alcancado: nao
dor: taxa de marketplace come a margem do delivery
objecao:
interesse: cardápio digital + comanda
observacao: dono aparece só depois das 19h
proximo_passo: ligacao | 2026-08-28 | Ligar pedindo o decisor pelo nome
cadencia: acesso_decisor #2
origem: pwa
```

Regras do parser:
- primeira linha **exatamente** `DESFECHO_VISITA v1`;
- uma chave por linha, `chave: valor`, snake_case sem acento;
- **chave vazia é melhor que chave ausente**;
- `proximo_passo: <canal> | <AAAA-MM-DD> | <ação>`;
- `decisor_alcancado`: **só `sim` vale como verdadeiro**. Ausente ou vazio é
  *desconhecido*. **Nunca mandar `nao` para dizer "não sei"** — transforma "não tenho
  registro" em "não alcançou", que é uma afirmação diferente sobre o trabalho da pessoa;
- versão desconhecida (`v2`) faz marcar `requer_revisao` em vez de reinterpretar em
  silêncio.

---

## Dias úteis, semana e fuso

- Semana começa na **segunda** (`data_segunda` é a chave de tudo que é semanal).
- `diasUteisDaSemana`, `proximoDiaUtil`, `nearestBusinessDay`, `addBusinessDays` — a rua
  não acontece no fim de semana, e datar a "1ª visita" para sábado foi defeito real.
- Toda data de tela é **Brasília**; toda data gravada é **ISO/UTC**.
