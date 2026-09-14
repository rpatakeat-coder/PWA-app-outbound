# Prompt para colar no outro Claude Code

> Copie o bloco abaixo inteiro e cole na primeira mensagem do Claude Code no projeto de
> destino, **depois** de ter copiado a pasta `docs-replicacao/` (e, idealmente, os
> arquivos de referência listados no fim) para lá.

---

```
Preciso replicar neste projeto as funcionalidades de um sistema existente: o Cockpit de
Field Sales da Takeat — uma camada de planejamento, direção e gestão sobre HubSpot +
Supabase, com dois perfis (gestor e executivo de vendas de campo).

A documentação completa está em `docs-replicacao/`. Comece assim:

1. Leia `docs-replicacao/00-LEIA-PRIMEIRO.md` e depois os arquivos 01 a 09, na ordem.
   Não pule — o 08 (regras de negócio) e o 09 (segurança) contêm regras calibradas
   contra dados reais de produção, e cada uma tem um defeito por trás.

2. Leia `docs-replicacao/10-plano-de-replicacao.md`. Ele é o roteiro, em 8 fases, com
   critério de pronto em cada uma.

3. Antes de escrever qualquer código, me responda:
   - o que você entendeu que o produto faz, em 5 linhas;
   - quais decisões precisa de mim (stack do front, se o HubSpot/Supabase são os mesmos
     ou novos, e se o escopo é tudo ou um subconjunto);
   - qual é a fase 0 concreta neste repositório, dado o que já existe aqui.

4. Depois da minha resposta, execute fase por fase. Ao fim de cada fase, pare e me
   mostre o critério de pronto atendido — não avance sem isso.

Cinco coisas que NÃO podem ser alteradas sem me perguntar:

- A lei "não medido ≠ zero": ausência de dado nunca vira 0 na tela. Zero silencioso
  afirma que uma pessoa não trabalhou, e isso é dito na frente do time dela.
- O corte por papel acontece NO SERVIDOR, antes de responder. Executivo nunca recebe
  carteira, funil, notas, gargalo, território ou meta de colega — só nome, fechados e
  pontos, para o ranking.
- Toda conta existe em UM lugar só (temperatura, realizado do dia, territórios,
  cadência). A mesma regra em dois lugares já divergiu em silêncio neste produto.
- Nenhum token de serviço (HubSpot, service_role) chega ao navegador, e o artefato
  público não contém nenhum dado do CRM.
- Todo número na tela é acompanhado da janela de tempo a que ele se refere.

Se algo na documentação divergir do que você achar mais elegante, me traga a divergência
antes de decidir por conta própria — várias escolhas que parecem estranhas são cicatriz
de defeito medido, e o motivo está escrito junto.
```

---

## O que enviar junto com este prompt

### Obrigatório
```
docs-replicacao/          (esta pasta inteira — 13 arquivos)
```

### Altamente recomendado (os arquivos que carregam as regras)
```
scripts/montar-dados.js              # montarDadosCompletos + filtrarParaPapel
lib/temperatura.js                   # a nota 0-100
lib/realizado.js                     # o realizado do dia
lib/acoes-negocio/mudar-etapa-negocio.js   # propriedades obrigatórias + enums
api/dados.js                         # a rota central
api/negocio-acao.js                  # a porta única
scripts/build.js                     # o build como portão

data/temperatura.json
data/cadencias.json
data/metas.json
data/usuarios.json                   # ⚠ contém e-mails — anonimizar se for outro time

supabase/migrations/                 # o schema inteiro
supabase/README.md
```

### Referência visual
```
README.md                            # o handoff de design (as 14 telas descritas)
*.html na raiz                       # os 14 protótipos navegáveis
public/assets/logo-takeat.png
```

> Os protótipos abrem no navegador e usam `support.js` local para renderizar.
> **`support.js` é runtime de protótipo — não replicar.**

### Opcional, e pesado
```
template/cockpit.template.html       # 3,9 MB — a implementação de referência inteira
scripts/fetch-hubspot.js             # 141 KB — o robô do CRM
scripts/check-scripts.js             # 119 KB — as ~20 guardas
scripts/testar-*.js                  # 46 suítes
```
Envie estes só se o outro projeto for **continuar** o mesmo produto. Para uma
reimplementação, a documentação + os arquivos recomendados bastam, e o template gigante
mais atrapalha que ajuda (o agente tende a copiar padrões de um monolito de 62k linhas).

## Gerar o pacote

```bash
node docs-replicacao/empacotar.js            # só docs + arquivos recomendados
node docs-replicacao/empacotar.js --completo # inclui template, robô e suítes
```

O pacote sai em `../cockpit-replicacao-<data>/`.
