# Pacote de replicação — Cockpit Field Sales Takeat

> **Para quem é este pacote:** para um agente (Claude Code) que vai **replicar as
> funcionalidades deste sistema em outro projeto**. Ele descreve o que o sistema faz,
> como cada parte funciona, quais são os contratos entre elas e em que ordem construir.

## Como usar este pacote

1. **Leia na ordem** os arquivos `01` → `09`. Eles vão do geral ao específico.
2. **Depois** abra `10-plano-de-replicacao.md` — é o roteiro executável, por fases,
   com critério de pronto em cada uma.
3. Use `11-inventario-de-arquivos.md` como mapa: quando precisar do detalhe exato de
   alguma regra, ele diz em qual arquivo do projeto original ela vive.

## Regra de ouro ao replicar

O sistema original é um **HTML monolítico de 62 mil linhas** (`template/cockpit.template.html`)
com ~955 funções em JavaScript vanilla, mais 12 funções serverless e ~20 scripts Node.
Isso **não é o alvo a copiar**. O que deve ser replicado é:

- o **modelo de dados** (contrato `DATA`),
- as **regras de negócio** (SLA, temperatura, cadência, metas, filtro por papel),
- os **contratos de API**,
- o **schema do banco + RLS**,
- e o **comportamento das telas**.

A tecnologia de front-end do destino é livre (React/Next, Vue, o que for). O que **não**
pode mudar sem decisão explícita são as regras dos arquivos `08-regras-de-negocio.md` e
`09-seguranca-e-papeis.md` — elas foram calibradas contra dados reais e cada uma tem um
defeito de produção por trás.

## Índice

| arquivo | conteúdo |
|---|---|
| `01-visao-geral-e-arquitetura.md` | o que é o produto, quem usa, como as peças se ligam |
| `02-modelo-de-dados.md` | o contrato `DATA` completo, fontes e snapshot |
| `03-banco-supabase.md` | 30 tabelas, colunas, RLS, política de segurança |
| `04-api-endpoints.md` | as 12 funções serverless, contratos de entrada/saída |
| `05-robos-e-automacoes.md` | crons, robô do HubSpot, IA semanal, coletores |
| `06-telas-e-navegacao.md` | as 12 views, nav por papel, mapa de render |
| `07-design-system.md` | tokens, tipografia, componentes, regras visuais |
| `08-regras-de-negocio.md` | pipeline, SLA, temperatura, cadência, metas, desfecho |
| `09-seguranca-e-papeis.md` | gestor × executivo, fail-closed, o que nunca vaza |
| `10-plano-de-replicacao.md` | roteiro por fases, com critério de pronto |
| `11-inventario-de-arquivos.md` | arquivo por arquivo do projeto original |
| `12-integracao-hubspot.md` | ids de pipeline/etapa/propriedade, escrita e leitura |
| `PROMPT-PARA-O-OUTRO-CLAUDE.md` | **o bloco pronto para colar** no Claude Code do destino + o que enviar junto |
| `empacotar.js` | gera a pasta a enviar (`node docs-replicacao/empacotar.js [--completo]`) |

## Enviando para o outro projeto

```bash
node docs-replicacao/empacotar.js              # docs + arquivos que carregam as regras
node docs-replicacao/empacotar.js --completo   # + template, robô do HubSpot e suítes
```

Depois, cole no Claude Code do destino o bloco de `PROMPT-PARA-O-OUTRO-CLAUDE.md`.

## Três avisos que evitam retrabalho

1. **Nada de dado do CRM no HTML publicado.** O arquivo servido é uma casca; os dados
   chegam depois do login, já filtrados por papel no servidor. Ver `09`.
2. **Ausência de dado nunca vira zero na tela.** "Não medido" é um estado com nome
   próprio em todo o sistema. Zero silencioso é a classe de defeito mais cara aqui —
   ele acusa alguém de não ter trabalhado. Ver `08`.
3. **Toda conta existe em um lugar só.** Temperatura, realizado do dia, territórios e
   cadência viraram bibliotecas compartilhadas justamente porque duplicar a regra
   produziu números divergentes na mesma tela. Ver `11`.
