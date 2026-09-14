# 12 — Integração HubSpot

Pipeline **`916011864`** ("Field Sales"). Token: Private App com escopo de leitura e
escrita de deals, notas, tarefas e companies. **Ele nunca sai do servidor.**

## Etapas (ids reais)

```js
const STAGES = {
  backlog:      '1396007427',
  prospeccao:   '1395880469',
  visita:       '1396005401',
  diagnostico:  '1395880470',   // "Conversa com Decisor"
  demoProposta: '1395880471',
  negociacao:   '1395880472',
  agPagamento:  '1395880473',
  ganho1:       '1396006162',   // "Ganho"
  ganho2:       '1396006163',   // "Enviado Onboarding"
  perdido:      '1396006164',
  reciclagem:   '1398311191',
  contaAlvo:    '1413529973'
};
const OPEN_STAGES = [prospeccao, visita, diagnostico, demoProposta, negociacao, agPagamento];
```

## Propriedades obrigatórias por etapa de destino

| etapa de destino | exige |
|---|---|
| Prospecção | `origem_do_lead` |
| Visita | — |
| Conversa com Decisor | `celular`, `gargalo_operacional`, `nome_do_sistema` |
| Demo/Proposta | `valor_de_mrr`, `plano_apresentado`, `data_da_reuniao` |
| Negociação | `plano_apresentado`, `valor_de_mrr` |
| **Ag. Pagamento** | `dealname`, `email`, `cnpj_cpf`, `celular`, `cep`, `numero`, `pacote_contratado`, `adicional`, `tipo_de_pagamento`, `periodo_contratado`, `amount`, `mrr`, `deseja_criar_perfil_no_asaas_`, `qual_maior_desafio_`, `informacoes_sobre_o_maior_desafio` |
| Enviado Onboarding | — (confirmação de pagamento, não coleta) |
| Perdido | `motivo_do_perdido` |
| Reciclagem | — (resgate tem de ser 1 clique) |

Três decisões dentro disso, todas medidas:
- **`celular` saiu de Prospecção** e entrou em Decisor: 40 dos 85 negócios em Prospecção
  estavam sem celular (47%) — exigência cobrando dado que metade não tem. Em Decisor: 13
  negócios, **zero** sem celular.
- **Demo/Proposta passou a exigir valor**: dos 22 negócios na etapa, **um** tinha
  `valor_de_mrr`. Proposta sem valor não é proposta que se possa medir.
- **Ag. Pagamento mantém `amount` E `mrr` separados**, apesar da divergência conhecida
  (403 × 244,33; 349 × 299). Esses dois campos são o que o RPA/Asaas lê para gerar o link
  de pagamento. Consolidar foi tentado em 02/09 e **desfeito em 03/09**: três lugares para
  digitar o mesmo número são três lugares para errar, mas um lugar a menos do que a
  automação precisa é o negócio parado.

> **Guarda ativa:** `checarObrigatoriasEspelhadas()` compara a lista do servidor com
> `CAMPOS_POR_ETAPA` no cliente. Divergir reprova o build. A assimetria permitida é só
> uma: o servidor **tolera** valor que a tela não **oferece** (ver "Sem retorno" abaixo).
> O caso perigoso — tela oferecer o que o servidor recusa, travando a passagem na cara do
> executivo — continua sendo reprovado.

## Enumerações (whitelist de validação)

```js
origem_do_lead:  ['Rua','Indicação','Casa dos Dados','Instagram','Ads','GoogleMaps','Familia','Eventos']

gargalo_operacional: ['Fila','Falta de Garçom','Falta de Gestão','Sem fidelização',
                      'Demora na divisão de contas','Estoque']

plano_apresentado:   ['Básico (PDV + delivery)','Básico (PDV + mesa + delivery)',
                      'Inovação','Pro','Enterprise']

pacote_contratado:   ['Básico','Básico (delivery e balcão)','Inovação',
                      'Inovação (delivery e balcão)','Profissional',
                      'Profissional (delivery e balcão)','Enterprise',
                      'Enterprise (delivery e balcão)','Upsell','Produtos Personalizados',
                      'Básico (Delivery)','Básico (PDV Balcão)',
                      'Básico (Delivery + PDV Balcão)',
                      'Intermediário (Delivery + PDV Balcão + PDV Mesa)','Apenas Cardapio']

adicional:           ['Sem adicionais','Fiscal SN','Maquininha POS','Cashback','Tablet',
                      'IA Conversacional (TEKA)','Totem de Autoatendimento',
                      'Robô de Whatsapp','Multilojas','Campanhas Personalizadas',
                      'Fiscal LP / LR','IA de Fechamento','TEF','Precificação Dinâmica',
                      'Display ou Comandas','Dark Kitchen','Conciliação Bancária',
                      'Rota Inteligente']

tipo_de_pagamento:   ['À Vista','Crédito']
periodo_contratado:  ['Mensal','Trimestral','Semestral','Anual']
qual_maior_desafio_: ['Problemas com Atendimento','Gestão Financeira','Problemas de Gestão',
                      'Problemas em Fidelizar o Cliente','Gerenciar várias lojas',
                      'Controle fiscal','Operação','Suporte do sistema']

motivo_do_perdido:   ['Preço','Funcionalidade','Sem retorno','Reembolso',
                      'Não quer mudar de sistema','Outros']
```

### O caso "Sem retorno" — a assimetria deliberada
Medido nos 981 perdidos de 90 dias: `Outros` 42% + `Sem retorno` 30% = **72% de motivos
que não são decisão do cliente**. "Sem retorno" é a **ausência** de decisão e pertence a
`motivo_saida_cadencia` (propriedade que já existe e estava vazia nos 5.218 negócios).

Decisão: **a tela deixou de oferecer, o servidor continua aceitando.** A whitelist do
servidor é validação — remover o valor dali faria a rota **recusar** qualquer escrita que
o trouxesse, e o Cockpit não é o único escritor (o PWA move etapa pela mesma porta).
Os 293 negócios que já têm o motivo continuam com ele.

**Regra geral: remover opção do seletor é seguro; inventar opção não é.**

## Higienização antes de escrever

- **CPF/CNPJ e CEP vão só com dígitos.** O HubSpot recusa a passagem inteira quando
  chegam pontuados (medido). O RPA do Asaas recusa CNPJ inválido e avisa por WhatsApp
  horas depois — ou seja, o erro aparece *depois* de o negócio ter passado.
- **Telefone com DDI, só dígitos** (`5551999887766`).
- Validação de CPF/CNPJ acontece **no cliente e no servidor** (`cpfEhValido`,
  `cnpjEhValido`, `conferirCpfCnpj`).

## Leitura: as propriedades que o robô busca

Além das acima: `dealstage`, `pipeline`, `hubspot_owner_id`, `createdate`,
`closedate`, `hs_lastmodifieddate`, `notes_last_updated`, `amount`, `valor_de_mrr`,
`mrr`, `nome_do_sistema`, `gargalo_operacional`, `data_da_reuniao`,
`motivo_do_perdido`, `motivo_saida_cadencia`, e os `hs_v2_date_entered_<etapa>` de cada
etapa que precisa de data de entrada.

## Objetos associados

| objeto | uso |
|---|---|
| **notes** | o histórico de toques (`touchpointsDoLead`, `tpDesfechoDaNota`). O bloco `DESFECHO_VISITA v1` vive no corpo da nota |
| **tasks** | o próximo passo e a visita da rota. `hs_task_subject`, `hs_task_body`, `hs_task_status`, `hs_timestamp`, `hs_task_completion_date` |
| **companies** | prospecção fria cria Company **antes** do Deal |

### Como uma tarefa vira "visita"
`ehTarefaDeVisita(props)` olha assunto **e** corpo. `nomeDoAssunto()` extrai o cliente de
padrões como `Visita - <cliente>`, `Revisita: <cliente>`, `Reunião — <cliente>`.

## Escritas: o que vale, e a convenção de hora

Toda escrita passa por `lib/hubspot-deal-guard.js`, que confere **pipeline e dono** antes
de gravar.

**Toda tarefa datada sem hora específica vai para 12:00 UTC = 09:00 BRT.**
```js
Date.UTC(ano, mes, dia, 12, 0, 0)
```
Quem integrar precisa usar a mesma convenção. Motivo: até 28/08 o Cockpit comparava
vencimento por *instante*, e toda tarefa datada para hoje sumia da tela às 09h01 — o dia
útil inteiro. Corrigido para comparação **por dia**, mas hora diferente sem aviso faz o
comportamento voltar a ser sensível a fuso.

## Webhook

`POST /api/hubspot-webhook`
1. valida `X-HubSpot-Signature-v3` com `HUBSPOT_APP_SECRET` (401 se não confere ou se o
   timestamp expirou);
2. pega lock em `webhook_cooldown` (mínimo de N minutos entre disparos — existiu um
   cooldown de 20 min quando o snapshot ainda era commitado e cada rodada gerava deploy);
3. dispara `workflow_dispatch` do robô via `GITHUB_PAT`;
4. **sempre responde 200**, com `{ disparado: true|false, motivo }`.

**Zero lógica de negócio.** Ele só aciona o mesmo robô que já roda por cron — para não
existirem duas implementações do "como calcular o funil".

## Eventos que o app de campo deveria mandar (lacunas conhecidas)

Documentado em `docs/pwa-para-cockpit.md`. Em ordem de valor:

1. **`qualificar_negocio`** — `nome_do_sistema` + `gargalo_operacional` no fecho da visita.
   Medido: 49 de 51 negócios em Visita sem nenhum dos dois. São **a** qualificação em
   foodservice: definem o pitch e o argumento para pedir o decisor.
2. **Nota com o bloco `DESFECHO_VISITA v1`** — o parser já existe e nunca recebeu nada; o
   desfecho fica `null` e a cadência cai na régua genérica da etapa.
3. **`criar_proximo_passo`** — próximo passo do executivo como **tarefa no HubSpot**.
   Existem duas filas concorrentes: 88 pendências no app × 16 tarefas datadas no HubSpot
   no time todo. O Cockpit mede *tarefa no HubSpot*, então a tela parece dizer que a
   pessoa não trabalhou.

### O que **nunca** mandar
- Visita **sem `deal_id`** — vira "visita não confirmada" e fica fora do ciclo fechado.
- **`decisor_alcancado: nao` como "não sei"** — transforma "não tenho registro" em "não
  alcançou".
- **Tarefa auto-gerada** como tarefa do HubSpot — enche o CRM de item que ninguém prometeu.
- **Visita duplicada "para garantir"** — a deduplicação existe, mas **reporta** a
  duplicidade na tela, e isso vira dúvida sobre o número.
