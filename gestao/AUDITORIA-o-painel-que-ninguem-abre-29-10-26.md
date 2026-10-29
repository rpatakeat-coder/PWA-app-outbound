# O painel React do /gestao não é compilado desde 19/10 — e a Documentação foi junto

Auditoria de 29/10/26, dentro da revisão completa que o Julyan pediu.

## O que está no ar em /gestao

O HTML servido em `https://fieldtakeat.vercel.app/gestao/` é **o template do
Cockpit**, gerado por `scripts/importar-cockpit.cjs` a partir de
`cockpit-unificado`. Tem 4 MB e declara 14 abas: Cockpit, Meu painel, Meu
funil, Daily, Agenda, Rotas, Raio X, Playbook, PDIs, Onboarding, Precificação,
Resumo, Leads por praça, Sistema.

## O que NÃO está no ar

`gestao/src/**` — o app React/Vite — **não é compilado por ninguém**.
`scripts/build-web.js` roda exatamente dois passos: `npx expo export` e a cópia
de `gestao/public/` para `dist/gestao`. Não há chamada ao Vite em lugar nenhum
do build. O próprio comentário do script conta a história:

> O build do Vite em gestao/ servia só três telas que o Cockpit não tinha —
> Acessos, Desativar acesso e Documentação — em /gestao/painel-antigo.html.
> [...] saiu. Agora /gestao é só o HTML do Cockpit.

Sobram, sem leitor:

    gestao/src/telas/Documentacao.tsx       1.020
    gestao/src/telas/DesativarAcesso.tsx      690
    gestao/src/telas/Acessos.tsx              689
    gestao/src/componentes/idioma.tsx         380
    gestao/src/dados/acessos.ts               345
    gestao/src/App.tsx                        296
    gestao/src/dados/documentacao.ts          168
    gestao/src/componentes/Drawer.tsx         108
    gestao/src/dados/documentacaoVivo.ts       82
    gestao/src/supabase.ts                     36
    gestao/src/main.tsx                         8
                                            -----
                                            3.963  + tokens.css

Mais `gestao/index.html`, `vite.config.ts`, `package.json`,
`package-lock.json` e os três tsconfigs. E `documentacao.teste.ts`, que é uma
das suítes verdes guardando o que não roda.

`gestao/public/cockpit/` **fica** — é literalmente o que /gestao serve.

## O que isso custou de verdade: a Documentação sumiu

Acessos e Desativar acesso continuam existindo: o Cockpit tem a aba Acessos
(conferido no HTML servido hoje). **Documentação não.** Zero ocorrências de
"Documenta" nas 4 MB da página.

Então não é só código parado. É uma tela inteira — a que explica o sistema
lendo a configuração viva do banco (`client_statuses`, `sector_visibility`,
`stage_sla`, `profiles`, `clients`) e responde pergunta por IA através da edge
function `documentacao-chat`, que segue **ACTIVE** em produção — e que ninguém
consegue abrir desde 19/10. Não foi desligada; ficou sem porta.

## A decisão é do Julyan, por isso não apaguei

Duas saídas, e elas se excluem:

1. **A Documentação volta.** Vira aba do Cockpit, como Acessos virou. Aí o que
   se aproveita é `documentacao.ts` (o conteúdo) e `documentacaoVivo.ts` (as
   consultas); o resto do Vite some do mesmo jeito.
2. **A Documentação morreu de propósito.** Aí sai tudo: `gestao/src`,
   `gestao/index.html`, `vite.config.ts`, os tsconfigs, o `package.json` e o
   `package-lock.json` do subprojeto, e a edge function `documentacao-chat`
   deve ser desligada — função ativa sem chamador é porta destrancada.

O que eu não faço sozinho é escolher. Jogar fora a ÚNICA implementação de uma
tela é diferente de jogar fora uma cópia; e a função de IA no ar é superfície
que existe de verdade, não detalhe de arrumação.
