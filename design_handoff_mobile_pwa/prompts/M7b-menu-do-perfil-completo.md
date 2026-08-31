# M7b — Menu do perfil (prompt único, mobile)

**Arquivos:** `App.tsx` — header ~L4263–4286 · `styles.headerIconButton` ~L7271 · `styles.logoutButton` / `logoutButtonText` ~L7268–7269 · `type AppTab` L236 · `isAdmin` / `canViewGestor` L749–750 · `isViewer` L753 · `logout` / `profile` do `useAuth()` L538 · modal `isPasswordModalOpen` ~L5150–5355
**Alvo visual:** `handoff-M7b/M7b - Menu do perfil.dc.html` — quadros **1a** (header fechado), **1b** (folha, gestor), **1c** (folha, vendedor), **1d** (folha, somente leitura). Abra no browser e bata o resultado contra eles.
**Referência escrita:** `handoff-M7/prompts/M7-perfil-e-config-completo.md` — este prompt **substitui a seção A e a seção C** daquele. A tela de Configurações (seção B) continua lá e **não entra aqui**.

> `M0`–`M8` já rodaram. **Só o menu do perfil e a limpeza do header.** Não redesenhe Configurações, mapa, lista, ficha, agenda nem tarefas. Se achar problema fora do escopo, anote e siga.

**Tokens mobile:** maior tipo **18/24** · item de lista `min-height:56` · botão 48 raio **12** · card/campo raio **16** · spacing ≤ **24** (+32 de rodapé de área segura) · alvo ≥ **48** · raios só `4 · 12 · 16 · pill`.

---

## O problema

Três coisas quebradas no mesmo lugar:

1. **Gestor e Meu desempenho não têm entrada no celular.** `AppTab` (L236) inclui `'gestor'` e `'meu'`, mas nada no app mobile chama `setTab('gestor')` ou `setTab('meu')` — as duas telas do M6 existem e são inalcançáveis.
2. **O header gasta dois controles permanentes** em coisas raras: a engrenagem que abre o modal `isPasswordModalOpen` e um botão de texto "Sair" que faz logout **sem confirmação**, a um toque de distância do dedo, ao lado da busca.
3. **O `arrow_back` de Gestor e Meu volta para o Mapa** por falta de aba de origem registrada.

O menu do perfil é o destino das três.

---

## Fase 1 · Inventário — sem editar nada

1. Confirmar o que o header renderiza à direita hoje, com a linha: engrenagem, "Sair", avatar (existe algum?) e para onde cada um leva.
2. Confirmar de onde vêm `profile.full_name`, `profile.email` e `profile.role` — e **quais valores `role` assume na prática** (`view`, gestor, vendedor: nomes exatos).
3. Dizer se existe alguma **exportação de dados de nível de app** ou se os dois exports que encontrei são por tela (heatmap ~L783, agenda ~L3717, ambos `canViewGestor`).
4. Confirmar que `logout` do `useAuth()` é a única saída e se hoje há qualquer confirmação antes dele.
5. Dizer se existe algum estado de aba anterior (`abaAnterior`, histórico, `useNavigation`) ou se o `arrow_back` de `gestor`/`meu` é fixo no Mapa.
6. Preencher:

| O desenho pede | Existe? | Onde / campo |
|---|---|---|
Iniciais do usuário | | |
Nome · papel · e-mail na folha | | |
`setTab('gestor')` | | |
`setTab('meu')` | | |
Exportar dados (nível app) | | |
Configurações (tela ou modal) | | |
Logout | | |

**Se um item não existir, diga qual e não o desenhe.** Não crie query, rota nem cálculo novo — omitir a linha é melhor que inventar dado.

Entregue a tabela **antes** da fase 2, na mesma resposta.

---

## Fase 2 · Aplicar

### A · O avatar no header (quadro 1a)

À direita do header, um único controle: **avatar 48×48 pill**, `rgba(255,255,255,.18)`, iniciais em 14/24/0.15 peso 700 branco. As iniciais vêm de `profile.full_name` (duas primeiras palavras); sem nome, a primeira letra do e-mail.

`accessibilityRole="button"`, `accessibilityLabel="Abrir menu do perfil"`. Presente nas **quatro telas com barra** (Mapa, Rota, Agenda, Tarefas).

**Saem no mesmo diff:** a engrenagem (`styles.headerIconButton`) e o botão "Sair" (`styles.logoutButton`). Não deixe dois caminhos. Se `isPasswordModalOpen` continuar sendo o modal de Configurações enquanto a tela do M7 não existir, **mantenha o estado** e chame-o pelo item "Configurações" do menu — o que sai é o botão do header, não a funcionalidade.

### B · A folha (quadros 1b · 1c · 1d)

Faça **este bloco antes** de remover o que quer que seja do header — caso contrário o app fica sem logout no meio do caminho.

- Overlay `rgba(0,0,0,.4)` cobrindo a tela; toque fora fecha. Backdrop em `Pressable` **separado** da folha (o mesmo padrão do sheet de filtros, ~L5365: um `Pressable` em `StyleSheet.absoluteFill` atrás de um `View` puro), senão a Pressability compete com o gesto.
- Folha ancorada embaixo: raio `16px 16px 0 0`, fundo `--surface`, `padding:12px 16px 32px` — os 32 são a área segura, respeite `insets` como o resto do app faz.
- **Handle** 36×4 raio 2, `--stroke-default`, centralizado, `margin-bottom:16px`.
- **Identidade:** avatar 48px pill `--tint-red` / `--tint-red-text`, iniciais 16/48/0.15 peso 700 · nome 16/24/0.15 peso 600 `--text` · sublinha "`{papel}` · `{email}`" 12/16/0.4 `--text-faint`. Nome e sublinha em **uma linha cada, com ellipsis** — nada de quebra em 390px. `padding-bottom:16px`, borda inferior 1px `--border`.
- **Item:** `min-height:56px`, `padding:0 4px`, borda inferior 1px `--border`, `flex-direction:row; align-items:center; gap:16px` — ícone 24px + rótulo 16/24/0.15 peso 500 + `chevron_right` 24px `--text-disabled`. Alvo é a linha inteira.
- **Ordem, sempre esta:** Painel do gestor · Meu desempenho · Exportar dados · Configurações · Sair.
- **Sair** é o último, ícone e rótulo `#C8131B`, e o trailing é `logout` em vez do chevron. **Peça confirmação** (`Alert.alert` "Sair da conta?" / Cancelar · Sair) — hoje o logout dispara a um toque, sem rede.

**Papel decide a lista, não o estado desabilitado:**

| Item | Condição |
|---|---|
Painel do gestor | `canViewGestor` |
Meu desempenho | `!isViewer` |
Exportar dados | só se a fase 1 achou export de nível de app — **senão omita o item** |
Configurações | todos |
Sair | todos |

Quadro **1c** é a folha do vendedor (três itens), **1d** a do `isViewer` (dois). A folha encurta; não há item cinza.

O menu **esconde**; os `useEffect` de redirecionamento por papel (L~843) continuam sendo a rede. Não os toque.

### C · A volta que faltava

- **Painel do gestor** chama `setTab('gestor')`; **Meu desempenho** chama `setTab('meu')`. Fecha a folha antes de navegar.
- Ao entrar em `gestor` ou `meu` **pelo menu**, guarde a aba de origem e faça o `arrow_back` dessas telas voltar para ela. Se um `abaAnterior` no state for o caminho mais limpo, faça e declare na resposta. **Sem isso o M6 continua caindo no Mapa.**
- Não mexa em `LARGURA_LATERAL` nem no layout desktop da navegação: no desktop a barra é coluna fixa e o header é o mesmo componente — confira que o avatar não colide com nada em 1440px, mas **não reestruture**.

### D · Estados

- **Sem `profile` carregado:** avatar com o mesmo diâmetro e fundo, sem iniciais; a folha não abre.
- **Nome ausente:** sublinha vira só o e-mail, sem " · " solto.
- **Papel desconhecido:** mostre o valor cru de `role` em vez de string inventada — e diga na resposta que ele apareceu.

---

## Não mexer

- `logout`, `updatePassword` e o `<a href>` de `/gestao` (só mudam de lugar, se mudarem)
- os `useEffect` de redirecionamento por papel (`isViewer`, `canViewGestor`)
- `navPaddingBottom` / a leitura de `insets` — é o que mantém a folha acima da barra de gestos
- o conteúdo do modal de Configurações: este prompt não redesenha nenhuma seção dele
- clustering do mapa, carregamento por área visível, `src/constants/stages.ts`
- service worker, `useForceReload`, `vercel.json`

## Auditoria final — responda item por item

**OK / FALTA / DIVERGE**, citando valor encontrado e esperado:

1. Avatar 48px pill no header das quatro telas com barra; iniciais de `profile`; `accessibilityLabel` presente.
2. Engrenagem e botão "Sair" **não existem mais** no header; nenhum estilo órfão sobrou.
3. Folha raio `16px 16px 0 0`, `padding:12px 16px 32px`, handle 36×4, overlay `rgba(0,0,0,.4)`, toque fora fecha.
4. Backdrop em `Pressable` separado da folha.
5. Identidade: avatar 48px `--tint-red`/`--tint-red-text`, nome 16/24/0.15 peso 600, sublinha 12/16/0.4, uma linha cada com ellipsis.
6. Itens `min-height:56px`, gap 16, ícone 24px, rótulo 16/24/0.15 peso 500, `chevron_right` 24px; alvo é a linha.
7. Ordem dos itens exata; **Sair** por último em `#C8131B` com `logout` no trailing.
8. **Logout pede confirmação** e funciona.
9. Papel controla a lista: gestor 5, vendedor 3, viewer 2 — **testado nos três**; nenhum item desabilitado.
10. "Exportar dados" só aparece se existir export de nível de app; senão foi omitido e você disse isso.
11. **`setTab('gestor')` e `setTab('meu')` são chamados daqui** — as duas telas do M6 têm entrada no celular.
12. **`arrow_back` de Gestor e Meu volta para a aba de origem**, não para o Mapa.
13. "Configurações" abre o que existe hoje (tela do M7 ou o modal), sem duplicar caminho.
14. Sem `profile`: avatar neutro, folha não abre. Sem nome: sublinha só com e-mail.
15. Nenhum hex fora dos literais permitidos; spacing ≤ 24 (+32 do rodapé); maior tipo 18/24; raios só `4 · 12 · 16 · pill`; alvo ≥ 48.
16. Desktop (1440px) sem colisão e sem reestruturação.
17. `npm run typecheck` limpo.

**Conferir em 390×844**, comparar com os quadros 1a–1d do DC, **alternar o tema e repetir no escuro**, e no PWA instalado checar que a folha não fica sob a barra de gestos.

## Ao terminar

A tabela da fase 1, depois três linhas: **o que mudou** · **o que ficou fora do escopo e você anotou** · **o que não deu para aplicar, nomeando o campo ou a função que falta** — mais a auditoria.

Se o código souber algo que esta especificação não sabe, **pare e pergunte** em vez de aplicar por cima.
