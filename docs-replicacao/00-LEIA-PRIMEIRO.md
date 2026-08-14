# Replicação do Cockpit Field Sales — Leia primeiro

Este pacote descreve **todo o sistema Cockpit Field Sales da Takeat**, para que outro
projeto (com Claude Code) consiga replicar as funcionalidades **exceto Rota/Mapa**.

## O que é o sistema, em uma frase

Um cockpit web de gestão de vendas de campo (field sales) que lê o **HubSpot** (funil,
SLA por etapa, ganhos, agenda) uma vez ao dia, guarda o "lado humano" no **Supabase**
(Daily prometido/realizado, PDI, 1:1, avisos, prospecção), usa a **API da Claude** para
escrever diagnósticos e planos de ação, e entrega **duas experiências distintas por papel**:
Gestor (comandar o dia do time) e Executivo (saber o que fazer às 8h30).

## O que tem nesta pasta

```
docs-replicacao/
├── 00 … 10 .md          ← a documentação (leia nesta ordem)
├── gerar-amostras.js    ← regera as amostras anonimizadas a partir de data/
├── referencia/          ← o código original, para consulta
│   ├── index.html       ← front-end inteiro (chaves já sanitizadas)
│   ├── scripts/ api/ workflows/
│   └── prototipos/      ← 13 telas hi-fi + handoff de design
└── amostras-dados/      ← formatos JSON anonimizados
```

## Como usar este pacote

1. Leia esta ordem: `01` → `02` → `03` → `04` → `05` → `06` → `07`.
2. `08-ESCOPO-SEM-ROTA.md` diz **exatamente o que NÃO replicar** (todo o módulo Rota/Mapa).
3. `09-ARQUIVOS-A-ENVIAR.md` é o **manifesto** do que está em `referencia/` e por quê.
4. `10-PLANO-DE-IMPLEMENTACAO.md` é o roteiro em fases para o Claude Code do outro projeto.

`referencia/` é **fonte de comportamento, não código para copiar literalmente** — adapte à
stack do projeto de destino.

## Índice

| Arquivo | Conteúdo |
|---|---|
| `01-ARQUITETURA.md` | Stack, deploy, fluxo de dados, segurança, papéis |
| `02-FUNCIONALIDADES.md` | Especificação tela por tela, dos dois papéis |
| `03-HUBSPOT.md` | Pipeline, etapas, SLA, propriedades, todas as consultas e o JSON gerado |
| `04-SUPABASE.md` | Todas as tabelas, colunas, buckets de storage, auth e RLS |
| `05-APIS-SERVERLESS.md` | Contrato de cada rota `/api/*` |
| `06-IA-E-AUTOMACOES.md` | Scripts de IA (Claude API), prompts, crons do GitHub Actions |
| `07-DESIGN-SYSTEM.md` | Tokens de cor/tipografia, componentes, padrões de interação |
| `08-ESCOPO-SEM-ROTA.md` | O que remover (Rota/Mapa) e o que fica no lugar |
| `09-ARQUIVOS-A-ENVIAR.md` | Manifesto de arquivos para copiar |
| `10-PLANO-DE-IMPLEMENTACAO.md` | Roteiro de implementação em 8 fases |

## Sobre os dados — o que já foi tratado

Os arquivos em `data/` do projeto original têm **dados reais de clientes, e-mails do time e
chaves**. Ao montar este pacote:

- `amostras-dados/` recebeu **amostras anonimizadas** (2–3 registros por lista): nomes de
  restaurante, vendedor e o **texto livre das notas do CRM** foram substituídos; endereços
  zerados; e-mails trocados por fictícios.
- `referencia/index.html` teve `supabase.url`, `supabase.anonKey` e `maptiler` substituídos
  por placeholders.
- `data/supabase-config.json` e `data/maptiler-config.json` **não entraram** — gere chaves
  novas no projeto de destino. Há um `supabase-config.EXEMPLO.json` só com o formato.

Uma ressalva: `referencia/` mantém os **nomes reais do time** onde eles fazem parte do código
(a constante `REPS` em `fetch-hubspot.js` e os dados de exemplo dos protótipos). Se o pacote
for sair da empresa, faça um `grep` pelos nomes antes de enviar.

Os schemas completos estão em `03-HUBSPOT.md` e `04-SUPABASE.md`, então as amostras bastam.
