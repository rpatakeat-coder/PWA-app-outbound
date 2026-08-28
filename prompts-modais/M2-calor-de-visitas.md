# M2 — Calor de visitas

**Arquivos:** `App.tsx` (o painel de controle do heatmap sobre o mapa), `src/hooks/useVisitsHeatmap.ts`
**Referência visual:** `design_handoff_desktop_web/screenshots/19-calor-de-visitas.png`

> Tarefa única: **só o controle do calor de visitas**. Não toque no mapa, nos pins, no clustering, nos filtros de temperatura nem no painel do lead.

## O que existe hoje

Um cartão flutuante sobre o mapa, com sombra, contendo:

1. Ícone de tendência + "Calor de visitas" em ~20px bold
2. "686 visitas" à direita
3. Botão **"JSON"** filled vermelho com ícone de download
4. Barra de gradiente **verde → amarelo → laranja → vermelho** entre os rótulos "menos" e "mais"
5. Botão **X** solto à direita da barra
6. Chips de vendedor: **"Todos (686)"** em laranja sólido, "Sandro Brito (159)", "Bruno Martins (145)"

## Cinco problemas

**1 · O gradiente empresta a semântica errada.** Verde→amarelo→laranja→vermelho é a escala de temperatura do funil, onde vermelho quer dizer "quente/urgente" e verde "frio". Aqui vermelho significa **muita visita**, que é bom, e verde significa pouca, que é ruim. **A mesma paleta dizendo o contrário do que diz em todo o resto do app.** Um vendedor que aprendeu que vermelho é lead quente lê o mapa de calor invertido.

**2 · Laranja não existe no design system.** O chip ativo e o ícone do título usam um laranja que não está no kit da Takeat. O mesmo laranja que sai do botão "Abrir no HubSpot".

**3 · O botão de exportação é filled vermelho.** Vermelho é o CTA primário do app — "Mudar etapa", "Novo lead", "Agendar reunião". Exportar JSON é ação secundária de consulta, e no kit as exportações são **outline teal `#1D9688`** (é o que "Baixar planilha" e "Exportar relatório" já usam).

**4 · Três vendedores, dezessete no time.** Os chips mostram três e não há onde ver o resto. Com 17 vendedores ativos, ou a fila rola horizontalmente (toque errado garantido) ou 14 pessoas ficam inacessíveis.

**5 · É um cartão flutuante sobre o mapa.** Cobre justamente o dado que ele explica. E o X fica solto no meio, em vez de junto do controle que abriu o painel.

## O que fazer

### Desktop — dentro do painel de 352px, não sobre o mapa

O painel do mapa **já tem** a linha "Calor de visitas" com o switch. Quando ligado, **a própria linha expande** e mostra a escala e a lista de vendedores. Nada flutua sobre o mapa, e o X desaparece — desligar é o mesmo switch que ligou.

Container: `border-radius:8px`, fundo `--surface-2`, `overflow:hidden`.

**Cabeçalho** (sempre visível, `padding:12px`, `justify-content:space-between`):
- "Calor de visitas" 14/20/0.1 peso 600 `--text`
- Sublinha 12/16/0.4 `--text-faint`: **"{n} visitas · 90 dias"** quando ligado, **"{n} check-ins · 90 dias"** quando desligado
- Switch 44×24 pill à direita, `flex:0 0 44px`: trilha `--stroke-default` → `#C8131B`, botão 20px branco com `0 1px 2px rgba(0,0,0,.3)`, `transition:all .16s`

**Corpo expandido** (`padding:0 12px 12px`, coluna gap 12), só quando ligado:

**a · Escala** — uma barra de 8px raio 4, **uma família de cor, quatro degraus**:

```css
background: linear-gradient(90deg, #D6F2EC 0%, #8FE0D5 33%, #3FBFAD 66%, #1D9688 100%);
```

Abaixo, "menos" e "mais" em 11/16/0.5 peso 600 `--text-faint`, nas duas pontas.

**Por que teal e não o arco-íris:** é a mesma família do heatmap do painel do gestor (`--surface-3` → `#8FE0D5` → `#1D9688`), então densidade de visita tem uma cor no app inteiro, e não colide com a temperatura do funil que os pins já usam. Mais escuro = mais visita, sem ambiguidade.

**b · Lista de vendedores** — substitui os chips:
- Cabeçalho: "POR VENDEDOR" 11/16/0.5 peso 600 uppercase `--text-faint`, com "{n} no período" à direita (`tabular-nums`)
- Linha: `height:32px`, `padding:0 8px`, raio 4, `display:flex; align-items:center; gap:8px`, hover `--surface-3`
- Checkbox 16×16 raio 4, borda 1.5px — inativo `--stroke-strong` sem fundo, ativo `#C8131B` preenchido com `check` 12px branco
- Nome `flex:1` truncado, 12/16/0.5 — peso 500 `--text-muted` inativo, peso 700 `--tint-red-text` ativo
- Contagem à direita 12/16/0.5 peso 600 `--text-faint`, `tabular-nums`
- Primeira linha é **"Todos"** com a contagem total
- `max-height:180px; overflow-y:auto` — **todos os 17 cabem**, rolando na vertical, que é o eixo natural do painel

**c · Exportação** — "Exportar JSON" Small outline `#1D9688`, altura 32, raio 8, ícone `download` 20px, `align-self:flex-start`. O vermelho sai.

### Mobile — folha no rodapé

Não há painel lateral. O controle é uma folha ancorada no rodapé, acima da barra de navegação, com **`padding:16px 16px 40px`** — os 40px reservam os 24px que o FAB central invade acima da barra.

- Raio `16px 16px 0 0`, fundo `--surface`, sombra `0 -4px 16px rgba(0,0,0,.14)`
- Handle 36×4 raio 2 centralizado
- Cabeçalho: título 16/24/0.15 peso 600 + contagem, e o X em 48×48 raio 12 `--surface-2` à direita (aqui o X faz sentido — não há switch visível para desligar)
- Escala igual, com os rótulos em 11/16/0.5
- Vendedores: mesma lista, linhas de **48px** em vez de 32, `max-height:240px`
- "Exportar JSON" 48px outline `#1D9688`, largura total

## Preserve

- `useVisitsHeatmap` e a granularidade do dado — **não mexa na query**
- a camada de `<Circle>` sobre o mapa e a regra de que os pins somem com o calor ligado
- `heatSeller` / `heatSellers` e o fallback "Todos os vendedores" (`App.tsx:790`)
- o gate por papel: o calor é do gestor
- clustering, `animationEnabled={false}`, carregamento por área visível

## Não fazer

- Não use verde→amarelo→laranja→vermelho. É a paleta da temperatura do funil, e aqui ela significa o contrário.
- Não use laranja em lugar nenhum — não existe no kit.
- Não deixe a exportação em vermelho filled.
- Não mantenha o cartão flutuante no desktop: o painel de 352px já existe e não cobre o mapa.
- Não limite a lista a três vendedores.

## Pronto quando

- [ ] desktop: o controle vive **dentro do painel de 352px**, expandindo a linha do switch — nada flutua sobre o mapa
- [ ] mobile: folha no rodapé com `padding-bottom:40px`, e o FAB não cobre o "Exportar JSON"
- [ ] escala em **uma família de cor** (teal, quatro degraus), sem arco-íris
- [ ] **os 17 vendedores acessíveis**, rolando na vertical
- [ ] checkbox no lugar do chip; ativo em `#C8131B` com `check` branco
- [ ] "Exportar JSON" outline `#1D9688`
- [ ] nenhum laranja
- [ ] desligar pelo switch (desktop) ou pelo X (mobile)
- [ ] `useVisitsHeatmap`, a camada de `<Circle>` e o gate por papel inalterados
- [ ] alvos de 32px no desktop / **48px no mobile**
- [ ] modo escuro conferido
- [ ] `npm run typecheck` limpo

## Ao terminar

Três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor da especificação que não deu para aplicar e por quê**.

E como nas rodadas anteriores: se o código souber algo que esta especificação não sabe — outra granularidade no dado, outro gate, outro comportamento do `heatSeller` — **pare e pergunte** em vez de aplicar por cima.
