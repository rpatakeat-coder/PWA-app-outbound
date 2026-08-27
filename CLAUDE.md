# Takeat Outbound — guia para agentes

Dois produtos num repositório, mesmo domínio, mesma sessão Supabase:

- **App de campo** (raiz): Expo + react-native-web. Vendedor na rua — mapa,
  rota, check-in. Servido em `/`.
- **Cockpit de gestão** (`gestao/`): Vite + React DOM puro. Só gestor. Servido
  em `/gestao`.

## Regras que não se negociam

1. **O celular não muda.** Todo layout novo é condicionado por
   `layout.ehDesktop` (hook `src/hooks/useLayout.ts`). O padrão consolidado:
   extrair os cartões de uma tela em constantes JSX e COMPOR diferente por
   largura — nunca duplicar JSX entre mobile e web.
2. **Design system é o da Takeat**, não invente token:
   `https://raw.githubusercontent.com/takeat-design/UIKIT/main/README.md`
   (leia `foundations.md` e `components.md`; o README manda e explica).
   Tokens no app: `public/index.html` (`:root`, claro e escuro). No cockpit:
   `gestao/src/estilos/tokens.css`. Dark = branco com opacidade, não hex.
3. **Cores de etapa/temperatura são DADO, não cromo** (`src/constants/stages.ts`)
   — pintam pins do mapa; não retematizar.
4. **Ícones do UI Kit** via `src/components/icons.tsx` (SVG não resolve
   `var()`; cor vem por prop). Zero emojis em UI.
5. **Poppins no web só funciona pelo override** em `public/index.html`
   (`#root div, #root span…`) — o RNW escreve a pilha do sistema em cada
   `<Text>`. Não remover.

## Armadilhas que já morderam

- **`clients` do app = só a área visível do mapa** (bounds). Qualquer feature
  que precise de nome/coordenada fora do viewport usa busca por id
  (`src/hooks/useNomesDeClientes.ts`; no cockpit `nomesPorId`/`coordenadasPorId`
  em `gestao/src/dados/`). Sintoma clássico: "Lead não encontrado".
- **PostgREST corta em 1000 linhas sem erro.** Paginação em
  `gestao/src/dados/paginar.ts` (`buscarTudo`). Não consultar tabela grande sem.
- **Hook dentro de callback derruba o app** (tela preta). ESLint só tem
  `react-hooks/rules-of-hooks` — rode `npm run lint`; não adicionar preset.
- **Datas: sempre Brasília** (`diaBRT`). `toISOString().slice(0,10)` vira o
  dia às 21h. Helpers testados em `gestao/src/dados/datas.ts`.
- **FlatList não muda `numColumns` em voo** — troque a `key`.
- **Nunca envolver `TextInput` em Touchable/Pressable** (inclusive o padrão
  nativo `TouchableWithoutFeedback onPress={Keyboard.dismiss}` em volta de
  formulário). Em navegador touch o wrapper vira responder, cancela o click
  sintético e o campo nunca recebe foco — no PWA do celular não dá pra
  digitar. Para fechar ao tocar fora, use `Pressable` de backdrop como
  IRMÃO (`StyleSheet.absoluteFill`) atrás do conteúdo, nunca envolvendo.

## Verificação (rodar antes de qualquer commit)

```
npx tsc --noEmit                      # raiz
cd gestao && npx tsc -b && npx vite build
npx tsx src/dados/datas.teste.ts      # em gestao/
npx tsx src/dados/regras.teste.ts
npm run lint                          # na raiz
npx expo export --platform web --output-dir /tmp/b  # build real do app
```

## Quem roda o quê

O usuário (Guilherme) opera produção: migrations via SQL Editor,
`supabase functions deploy`, `secrets set`. Agentes escrevem código e SQL,
mas não têm CLI do Supabase nem as chaves — entregar o comando pronto e dizer
o resultado esperado. Commits/push só quando ele pede; mensagens em português,
corpo explicando o porquê.

## Domínio (o que os números significam)

- `won_at` = data REAL de fechamento (vem do `closedate` do HubSpot via
  `hubspot-sync`). "Fechados no mês" nasce daí; quem fechou está em etapas
  fora de `ETAPAS_FUNIL` — não filtrar ganhos pela lista do funil.
- `dailies` = promessa DECLARADA pelo vendedor. Precedência no placar:
  promessa → paradas da rota → meta padrão. Realizado nunca é digitado
  (deriva de `client_visits`).
- Vendedor desativado = sufixo `/ DESATIVADO` no `full_name` (convenção lida
  em vários lugares). Revogar acesso = Edge Function `revogar-usuario`.
- RLS: gestor (`is_field_admin()`) lê/escreve rotas de todos; `dailies` só a
  própria pessoa escreve; `um_a_um` é só gestor.
