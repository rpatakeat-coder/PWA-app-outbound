# 01 — Visão geral e arquitetura

## O que é o produto

**Cockpit de Field Sales da Takeat.** Não é um CRM: o CRM é o HubSpot. O Cockpit é a
camada de **planejamento, direção e gestão** em cima do HubSpot + Supabase. A execução
na rua acontece num app de campo separado (PWA/Expogo).

Ele responde, por perfil, a uma pergunta por tela:

**Gestor** (`role: manager`)
| tela | pergunta que ela responde |
|---|---|
| Time | "Onde eu ajo hoje?" |
| Daily | "Quem prometeu, quem cumpriu, quem está vazio?" |
| Semana (Resumo Semanal) | "O que mudou e o que eu faço?" |
| Pessoas (Desenvolvimento) | "Quem precisa de mim no 1:1?" |
| Rotas & Prospecção | "O que eu aprovo hoje? De onde vem o próximo lead?" |
| Playbook / Propostas | material de apoio |

**Executivo** (`role: rep`)
| tela | pergunta que ela responde |
|---|---|
| Hoje | "O que eu faço até as 9h?" |
| Minha Daily | "Cumpri o que prometi?" |
| Meu funil | "Onde estou presa?" |
| Planejamento / Agenda | "Minha semana está planejada?" |
| Prospecção (sub-aba) | "Quais contas eu ataco esta semana?" |
| Desenvolvimento | compromissos do 1:1 + PDI |
| Playbook / Propostas | material de apoio |

## Arquitetura em uma figura

```
                       ┌──────────────────────────────────┐
   HubSpot (CRM)  ───▶ │  scripts/fetch-hubspot.js (robô) │
   pipeline 916011864  │  roda 8x/dia via GitHub Actions  │
                       └───────────────┬──────────────────┘
                                       │ publica
                                       ▼
                       ┌──────────────────────────────────┐
                       │ Supabase: tabela cockpit_snapshot│  ← o "snapshot do CRM"
                       │ 6 chaves (hubspot, narrativas,   │
                       │ weekly-raw, resumo-semanal, …)   │
                       └───────────────┬──────────────────┘
                                       │ lê com service_role
                                       ▼
   navegador ──login──▶ ┌──────────────────────────────────┐
   (Supabase Auth)      │ /api/dados (Vercel serverless)   │
        │               │ valida sessão → descobre papel   │
        │               │ → monta DATA → filtra por papel  │
        │  DATA filtrado└───────────────┬──────────────────┘
        ▼                               │
   ┌──────────────────────────────┐     │
   │ public/index.html            │◀────┘
   │ (shell: login + UI, 0 dados) │
   │ hidrata DATA no navegador    │
   └──────┬───────────────────────┘
          │ escritas
          ▼
   /api/negocio-acao (porta única) ──▶ HubSpot
   Supabase direto (RLS) ────────────▶ dailies, planos, PDI, avisos…
```

## As cinco camadas

### 1. Fonte de verdade
- **HubSpot** — pipeline `916011864` ("Field Sales"). Funil, negócios, notas, tarefas,
  donos, valores. **Toda prova de execução vive aqui.**
- **Supabase** — tudo que o HubSpot não sabe: Daily (prometido/realizado), planos diário
  e semanal, PDI/1:1, comunicados, prospecção fria, playbook, pauta do líder.

### 2. Robôs (GitHub Actions)
Buscam do HubSpot, calculam, e **publicam no Supabase** (`cockpit_snapshot`).
Antes commitavam `data/*.json` no git — mudou porque cada commit gerava um deploy e o
teto de 100 deploys/dia da Vercel limitava a atualização. Ver `05`.

### 3. Backend (Vercel serverless, plano Hobby — teto de 12 funções)
12 arquivos em `api/`. A restrição de 12 funções é **estrutural**: por isso existe
`/api/negocio-acao` como porta única com campo `op`, e por isso `/api/dados` serve
também playbook, precificação e "realizado de hoje" via `?recurso=`.

### 4. Front-end
Um `public/index.html` gerado a partir de `template/cockpit.template.html` por
`scripts/build.js`. O template tem `{{DATA_JSON}}`, que o build substitui por um **DATA
casca** (placeholders vazios + config do Supabase). Nenhum dado do CRM é publicado.

### 5. Guardas e testes
46 suítes `scripts/testar-*.js` + 9 guardas `scripts/checar-*.js` + `check-scripts.js`
(que roda ~20 verificações estruturais). **O build morre se qualquer guarda reprovar.**

## Decisões de arquitetura que valem herdar

| decisão | por quê |
|---|---|
| HTML publicado sem dados | antes qualquer visitante via o CRM inteiro no "ver código-fonte" sem logar |
| Filtro por papel **no servidor** | esconder no navegador deixa o dado viajando na resposta |
| Snapshot numa tabela, não no git | commit = deploy; 100 deploys/dia era o teto da atualização |
| Porta única `/api/negocio-acao` | 12 funções era o teto; 5 rotas faziam a mesma forma |
| Conta em um lugar só (`lib/`) | a mesma regra em dois lugares divergiu em silêncio, mais de uma vez |
| "Não medido" ≠ zero | zero silencioso acusa alguém de não ter trabalhado |
| Procedência viaja na resposta | `procedencia: { fonte, motivo, chaves }` — dá para saber se produção está no Supabase ou no arquivo |

## Ambiente e variáveis

```
# Vercel (runtime das funções)
SUPABASE_URL              obrigatória
SUPABASE_ANON_KEY         obrigatória (validação de sessão)
SUPABASE_SERVICE_KEY      lê cockpit_snapshot (RLS sem policy) e escreve status
HUBSPOT_TOKEN             Private App token — NUNCA sai do servidor
HUBSPOT_APP_SECRET        valida assinatura do webhook do HubSpot
IMPORT_SECRET             autenticação server-to-server da importação de leads
CASADOSDADOS_TOKEN        fonte de empresas recém-abertas (CNPJ)
PWA_DEEP_LINK             opcional — liga a transição de ações para o app de campo
GITHUB_PAT                dispara workflow_dispatch a partir do webhook

# GitHub Actions (robôs)
HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY,
ANTHROPIC_API_KEY         resumo semanal escrito por IA
GOOGLE_PLACES_API_KEY     sourcing mensal (só existe aqui, não na Vercel)
CASADOSDADOS_TOKEN, IMPORT_SECRET, COCKPIT_URL
```

**Não existe `package.json`.** O projeto roda em Node puro, sem dependências npm —
decisão deliberada (a máquina de desenvolvimento não tinha npm). Se o projeto destino
tiver npm, isso deixa de ser restrição; mas note que várias guardas existem *porque*
não havia parser/minificador disponível.
