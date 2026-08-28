# Como aplicar isto com o Claude Code

O painel do lead — o que abre quando você clica num pin do mapa ou numa linha da lista.

## Não, jogar a pasta e mandar fazer não funciona

Já falhou aqui, três vezes, por três motivos diferentes:

**"Aplica esse design."** `App.tsx` tem 8.445 linhas. Ele lê o README de 60 KB, começa pelo que está à mão, e para antes de chegar no painel.

**Um prompt por tela.** Melhor, mas ainda grande: casca + topo + corpo + rodapé + estados + duas plataformas numa tarefa. Ele entrega 60% e declara pronto.

**Prompt de revisão para algo que não existe.** Foi o caso deste painel: o prompt dizia "reestilize o drawer para 480px" e o drawer **não existia** no código. Nada para reestilizar, zero diff, e a impressão de que o prompt não funcionou.

## O que funciona

### 1 · A pasta vai para dentro do repo

```
PWA-app-outbound/
├── App.tsx
├── src/
├── design_handoff_desktop_web/     ← precisa estar aqui também
├── design_handoff_mobile_pwa/      ← e aqui
└── prompts-modais/                 ← esta pasta
```

**As três.** Os prompts deste painel referenciam os screenshots dos outros dois pacotes (`design_handoff_desktop_web/screenshots/09-drawer-ficha-do-lead.png` e `design_handoff_mobile_pwa/screenshots/09-sheet-ficha-do-lead.png`) — sem elas, ele constrói sem referência visual.

Numa branch, se preferir:

```bash
git checkout -b painel-do-lead
git add prompts-modais design_handoff_desktop_web design_handoff_mobile_pwa
git commit -m "handoff: painel do lead"
```

### 2 · Um arquivo por sessão

Abra o Claude Code na raiz do repo e diga **só isto**:

```
Leia prompts-modais/M1a-inventario.md e execute o que está descrito.
Não faça nada além do que o arquivo pede.
```

Nada mais na mensagem. Sem "e depois faça o resto", sem "aplique todo o painel".

**Aponte o caminho em vez de colar o conteúdo.** Colado, o prompt perde os caminhos relativos e ele não acha os screenshots.

### 3 · A ordem importa aqui mais que no resto

| Ordem | Arquivo | Edita código? | Por quê nesta posição |
|---|---|---|---|
1 | `M1-MAPEAMENTO.md` | **não** | mapeia os 40 elementos do painel real para o layout novo |
2 | `M1-DECISOES.md` | **não** | responde as divergências que o mapeamento levantou |
2b | `M1-DECISOES-2.md` | **não** | fecha os pontos de implementação da segunda rodada |
2c | `M1-DECISOES-3.md` | **não** | fecha os pontos do M1c e reordena o menu para depois do corpo |
3 | `M1a-inventario.md` | **não** | confirma quais campos existem no tipo `Client` |
4 | `M1b-casca.md` | sim | cria o container que todos os outros preenchem |
5 | `M1c-topo-e-acoes.md` | sim | **só o topo** — o menu ⋮ virou `M1c2`, depois do corpo |
6 | `M1d-corpo.md` | sim | as três abas — a maior. Leia junto com as decisões: seis blocos não estão no texto dele |
6b | `M1c2` (a escrever) | sim | o menu ⋮ de nove itens |
7 | `M1e-rodape-checkin.md` | sim | |
8 | `M1f-peek-sheet-mobile.md` | sim | o peek **já existe** — só unifica a cor do check-in |
9 | `M1R-revisao.md` | **duas fases** | audita, você confirma, aí corrige |

**O `M1-MAPEAMENTO` é o mais importante da pasta.** O painel em produção tem **40 elementos** — alerta de SLA, aviso de localização aproximada, link do HubSpot, campo de nota, traçar rota (carro e a pé), Google Maps, WhatsApp, reuniões, follow-ups, remover — e o desenho de referência mostra uma versão simplificada. **Aplicar o desenho literalmente removeria funcionalidade.** O mapeamento lista os 40 e diz onde cada um vai; nada é descartado, só reorganizado.

Rode-o e **leia a resposta com atenção** antes de seguir. Se você discordar de algum destino, é mais barato discutir ali que refazer depois.

**O `M1-DECISOES` fecha essa conversa.** O mapeamento devolve divergências — coisas que o desenho não sabia sobre o código. As decisões respondem uma a uma e **valem sobre o mapeamento** onde houver conflito. Rode-o em seguida, também sem editar código, e confirme os quatro pontos que ele deixa em aberto antes do `M1b`.

**O `M1a` também não pode ser pulado.** O design mostra "Plano apresentado", "MRR: R$ 590,00" e "348 comandas" — eu inventei esses campos ao desenhar. Se não existirem no tipo `Client`, o `M1a` manda ele **parar e dizer**, em vez de preencher com placeholder. Foi exatamente esse passo que faltou no painel do gestor, e o resultado foi uma tela cheia de número falso.

**O `M1b` antes de tudo o mais.** Ele cria (ou reaproveita) o componente de painel que vai servir também para avisos, configuração de rota, perfil e os drill-downs do gestor. Se você fizer o conteúdo primeiro, ele improvisa um container e depois há dois padrões de painel no app.

### 4 · Ler a resposta antes de seguir

Todo prompt termina pedindo três linhas: **o que mudou**, **o que ficou fora do escopo**, e **o que da especificação não deu para aplicar e por quê**.

**A terceira é a que importa.** Neste painel especificamente, espere ver ali coisas como "o campo `plano_apresentado` não existe no tipo `Client`" ou "não há histórico de mudança de etapa com motivo". Isso é o prompt funcionando, não falhando.

### 5 · Conferir nas duas plataformas

```bash
npm run typecheck
npm start
```

- **1440px** → compare com `design_handoff_desktop_web/screenshots/09-drawer-ficha-do-lead.png`
- **390 × 844** (DevTools, iPhone 14) → compare com `design_handoff_mobile_pwa/screenshots/09-sheet-ficha-do-lead.png`
- Alterne o tema e repita nos dois
- No mobile, teste com o **polegar**: todo alvo tem 48px?

Depois do `M1e`, instale como PWA e confirme que o botão de check-in não fica sob a barra de gestos.

### 6 · Commit por prompt

```bash
git add -A && git commit -m "painel do lead: casca (M1b)"
```

### O prompt de revisão é diferente

```
Leia prompts-modais/M1R-revisao.md e execute APENAS a Fase 1.
Não edite nenhum arquivo.
```

Ele responde 42 itens com OK / FALTA / DIVERGE. Você lê, decide, e só então:

```
Corrija os itens 5, 13 e 23 da Fase 1. Um por vez.
```

Auditar e corrigir na mesma sessão faz ele corrigir o que achou primeiro e parar no meio.

## Quando algo dá errado

**"Não mudou nada."** Foi o que aconteceu com a versão anterior deste prompt. Pergunte: *"esse arquivo pede para modificar algo que já existe ou para criar algo novo? o que você encontrou no código?"* Se ele disser que já estava aplicado, confira na tela — provavelmente não estava.

**"Fez metade."** Cite os itens do "Pronto quando" que ficaram sem marcar e peça só eles.

**"Inventou campo."** Rode o `M1a` e confronte a tabela com o que está na tela.

**"Quebrou o mapa."** O `M1f` mexe no que acontece ao tocar um pin. Se o clustering ou o carregamento por área quebrou, `git checkout` e rode de novo com: *"não altere o MapView, o clustering nem o carregamento por área visível — só o que abre ao tocar o pin."*

## O que nunca deve entrar no diff

- a validação de distância do check-in (o raio em metros) e a Task concluída no HubSpot
- clustering do mapa (`radius 50`, `minPoints 3`, `maxZoom 14`, `animationEnabled={false}`) e o carregamento por área visível
- `src/constants/stages.ts` — etapas, `TEMP_COLORS`, `stageTemperature`
- `navPaddingBottom` / a leitura de `insets` — é o que mantém o rodapé acima da barra de gestos
- service worker, `useForceReload`, `vercel.json`
