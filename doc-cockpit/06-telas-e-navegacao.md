# 06 — Telas, navegação e comportamento

## As 12 views

Todas vivem no mesmo documento; a ativa recebe `.active`. `activateTab(viewId)` troca a
classe, marca o botão da nav (`aria-current="page"`), rola para o topo e **move o foco
para o título da view** (acessibilidade: o leitor de tela anuncia a aba).

| id da view | rótulo gestor | rótulo executivo | render principal |
|---|---|---|---|
| `viewCockpit` | **Time** | — (oculta) | `renderFunilBarras` + `renderLeadsPrioritarios` + `tl5Iniciar` |
| `viewDaily` | **Daily** | **Minha Daily** | `renderDaily` |
| `viewResumo` | **Resumo Semanal** | Semana | `sm9Iniciar` / `renderSemana` |
| `viewPDIs` | **Pessoas** | **Desenvolvimento** | `renderPDIs` |
| `viewRotas` | **Rotas & Prospecção** | — (oculta) | `renderRotas` / `rt7Iniciar` |
| `viewAgenda` | Agenda | **Planejamento / Rota & Agenda** | `renderAgenda` / `renderPlanejamento6a` |
| `viewMeuPainel` | — (oculta) | **Hoje** | `renderMeuPainel` |
| `viewMeuFunil` | — (oculta) | **Meu funil** | `renderMeuFunil` |
| `viewPrecificacao` | Propostas | Propostas | `renderPrecificacao` |
| `viewPlaybook` | Playbook | Playbook | `renderPlaybook` |
| `viewLeadsPraca` | (aposentada) | (aposentada) | `renderProspeccaoNova` |
| `viewOnboarding` | — | boas-vindas de quem ainda não tem funil | — |

## Navegação por papel — `aplicarVisaoPorPapel()`

```js
const souRep      = sessaoAtual.role === 'rep';
const souGestor   = sessaoAtual.role === 'manager';
const emOnboarding = souRep && !!sessaoAtual.aComecar;

document.body.classList.toggle('exec-v3', souRep);  // identidade visual do executivo
```

| botão | gestor | executivo |
|---|---|---|
| Hoje (`tabBtnMeuPainel`) | oculto | visível — vira "Onboarding" se `aComecar` |
| Meu funil | oculto | visível, exceto em onboarding |
| Time (`tabBtnCockpit`) | visível | **oculto** — o executivo abre em Hoje, nunca no coletivo |
| Daily | "Daily" | "Minha Daily" |
| Rotas | "Rotas & Prospecção" | oculto — ver a rota dos colegas não é papel dele |
| Prospecção (`tabBtnLeadsPraca`) | oculto (virou parte de Rotas) | oculto (virou sub-aba da Rota & Agenda) |
| Desenvolvimento | "Pessoas" | "Desenvolvimento" |

### O portão de onboarding
Executivo com `aComecar: true` só abre **Hoje** (virando boas-vindas) e **Playbook**.
Motivo: sem negócio no funil, Meu Funil/Daily/Agenda mostrariam tudo zerado — ou pior,
divisão por zero. **O portão fica mesmo com ninguém nele hoje**: o próximo contratado
entra exatamente nesse estado. O que não pode voltar é o placeholder `pendente_*`
sobreviver ao `ownerId` real — foi isso que deixou alguém olhando tela vazia.

## Os três níveis por tela (regra inegociável de produto)

1. **Nível 1** — decisão imediata, acima da dobra (900px).
2. **Nível 2** — aprofundamento, no scroll.
3. **Nível 3** — detalhe operacional, **SEMPRE em drawer de 480px da direita, nunca inline**.

Nenhuma tela mostra os três simultaneamente. Nenhum dado foi removido ao redesenhar — o
que saiu da tela foi para drawer ou expansão.

## Os dois drawers canônicos

### Dossiê do executivo (gestor)
Header escuro com avatar/nome/praça/abertos/meta + badge · blocos **GARGALO** (red-soft) e
**BOA PRÁTICA** (green-soft) · travados com SLA · compromissos do 1:1 · rodapé com
"Preparar 1:1 →" (vermelho) e "Cobrar Daily" (outline).

### Ficha do lead
**Um componente só**, reutilizado em quentes, travados, funil, prospecção e nos dois
perfis (o gestor ganha o botão "cobrar executivo"). Contém: nome, etapa + SLA, mini-trilha
do funil, última nota do HubSpot, contato/endereço, histórico de toques, ações
Avançar / ＋rota / Registrar motivo, e "Abrir no HubSpot ↗".

**Comportamento comum:** overlay `rgba(26,22,19,.32)`, fecham no ✕, no overlay e no Esc,
transição 220ms ease-out (slide + fade).

## Redesenho e invalidação

```js
desenharViewSeNecessario(viewId, fn, sempre)  // desenha uma vez; `sempre:true` força
```

Mudar a etapa de um negócio muda o que **seis telas** mostram. O mapa:

```js
const TELAS_QUE_MOSTRAM_NEGOCIO = {
  viewMeuFunil:  'renderMeuFunil',
  viewDaily:     'renderDaily',
  viewAgenda:    'renderAgenda',
  viewMeuPainel: 'renderMeuPainel',
  viewCockpit:   'renderTimeLider',
  viewRotas:     'renderRotas',
  viewResumo:    'renderSemana'
};
```

`repintarOndeONegocioAparece()`:
- remove as **outras** views do `Set` de desenhadas **na hora** (custa nada) — se a pessoa
  trocar de aba no mesmo instante, a aba nova já nasce redesenhada;
- repinta a view **ativa** num `setTimeout(…, 0)`, que **colapsa as várias chamadas do
  mesmo gesto numa só** (um clique disparava três repinturas e uma piscada).

As funções são buscadas **por nome em `window`**, não guardadas no mapa: o mapa é
declarado no topo e vários renders são declarados centenas de linhas abaixo — guardar a
referência ali gravaria `undefined`.

**Falha de pintura não derruba a escrita.** Todo `fn()` vai em `try/catch` — um TypeError
da ficha já cancelou uma gravação no HubSpot antes de ela sair.

## Escrita otimista

O padrão em todo o produto:

1. a tela muda **agora** (linha vira ✓, contador anda, card sai da coluna);
2. a escrita sai para o HubSpot/Supabase em seguida;
3. se o servidor recusar, **a tela volta** e diz o motivo.

Complementos:
- `ler-etapa` existe para confirmar a etapa atual antes de afirmar erro — houve caso real
  de "falha ao falar com o HubSpot" sobre um negócio que **estava** gravado.
- O botão nunca fica travado dizendo "Gravando…" por dezenas de segundos.
- Desfazer devolve a linha à fila **na tela**; ele **não** apaga nota nem tarefa do CRM.

## Fluxo de sessão

```
público  → loginGate (#loginForm | #resetForm | #novaSenhaForm)
           ↓ Supabase Auth (e-mail = o mesmo do HubSpot)
sessão   → GET /api/dados com Bearer token
           ↓ { sessao, procedencia, dados }
hidrata  → aplicarSessao() → aplicarVisaoPorPapel() → mostrarApp()
           ↓
runtime  → assina snapshot_farol (Realtime) → repinta quando a versão muda
```

- A tela de login publica **apenas** dois inteiros (tamanho do time) e o dia da semana.
  Nenhum número de funil, nenhum MRR, nenhum nome de cliente — testável abrindo o
  código-fonte sem logar.
- `signOut()` sem argumento é **global** no supabase-js: apaga a sessão do usuário em
  todos os dispositivos. Usar o escopo local onde a intenção é só esta aba.
- Sessão expirada vira uma pill âmbar acima do formulário ("sua sessão terminou — entre de
  novo"), não uma linha de erro no meio das outras: quem chega ali foi expulso por tempo,
  não errou a senha, e a diferença muda o que a pessoa faz em seguida.
