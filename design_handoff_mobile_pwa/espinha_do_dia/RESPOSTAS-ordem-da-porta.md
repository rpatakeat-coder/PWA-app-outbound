# Respostas às 9 perguntas · A ordem da porta, e as lentes de volta

Claude Code → Julyan · 29/10/2026 · tudo medido no `main` de hoje.

**Resumo para quem tem 30 segundos:** oito respostas confirmam o que a prancha supôs. **Uma
muda o pacote, e para melhor:** a espera que separa "está na porta" de "esqueceu" **já existe no
código, em relógio** — `MIN_NA_PORTA = 20`. A detecção por GPS da seção 2 provavelmente **não
precisa ser construída**, e com ela some a pergunta de bateria que estava aberta desde o pacote
anterior.

---

## 1 · A regra que trava o Salvar

`rotuloSalvar(f)` em `src/utils/fichaDeRua.ts`:

```ts
if (!f.comoFoi) falta.push('como foi');
if (!f.proximo) falta.push('o próximo passo');
else if (f.proximo === 'reuniao' && f.diasReuniao === 0 && !f.horaReuniao) falta.push('a hora da reunião');
else if (f.proximo === 'reuniao' && f.diasReuniao == null) falta.push('o dia da reunião');
else if (ehVolta(f.proximo) && !f.dataVolta) falta.push('o dia da volta');
else if (f.proximo === 'sem_interesse' && !f.motivoPerdido) falta.push('o motivo');
...
if (!falta.length) return { pode: true, texto: 'Salvar' };
return { pode: false, texto: `Falta ${…}` };
```

**O que muda, e um detalhe que a prancha não cita:** tirar a linha do `proximo` não basta. Os
cinco `else if` abaixo dela são **dependentes dela** — hoje só rodam quando `proximo` existe,
porque estão no `else`. Virando `proximo` opcional, eles precisam deixar de ser `else if` e
virar checagens próprias, que só valem **quando ele escolheu alguma coisa**. Senão acontece o
pior dos dois mundos: ou o app passa a aceitar "Reunião" sem dia, ou volta a travar.

`comoFoi` continua obrigatório? A prancha diz "Salvar o que sei" e "o que ficar em branco volta
na saída", o que sugere que **os dois** ficam opcionais. É o que vou implementar, salvo sua
palavra em contrário — e aí a ficha pode salvar só o cadastro (telefone, decisor), que já é mais
do que se perde hoje quando ele fecha no ×.

## 2 · A ordem de gravação: o check-in já está salvo antes da ficha

**Confirmado, e é a base do pacote.** Em `handleMarkAsVisited`, o Cheguei grava a visita
(`client_visits`, com GPS, hora e foto de prova quando há) e **só depois** chama
`setFichaPendente({...})`. A ficha é uma tela que abre sobre um fato que já aconteceu.

Fechar no × só faz `setFichaPendente(null)`: **não desfaz nada**, porque não há nada para
desfazer. Hoje já é assim — o que se perde ao fechar no × é só o que ele teria digitado.

## 3 · A visita sem desfecho já existe, e é servidor

**Já existe, e não é um estado novo:** é o motivo `visita_sem_registro` da fila, o MESMO que o
Cockpit cobra. Em `supabase/functions/fila-tarefas/index.ts`:

```ts
const visitaHojeSemRegistro: Record<string, string> = {};
for (const v of visitasHoje) {
  const d = dealPorCliente.get(String(v.client_id));
  if (d && !comFichaHoje.has(d)) visitaHojeSemRegistro[d] = horaBRT(v.visited_at);
}
```

Ou seja: **visita de hoje cujo negócio não tem ficha hoje**. O app já lê isso (`filaNaTela`) e já
alimenta a linha do dia, com um comentário explícito de que dois números para o mesmo fato
fariam o gestor desconfiar dos dois.

**Consequência boa:** a faixa pendente não precisa de fonte nova. A conta já está pronta,
já é a mesma do Cockpit e já aparece no Fecha o dia e no número do gestor, como a seção 3 pede.

## 4 · A detecção de saída — **aqui o pacote muda**

**A detecção por GPS da seção 2 não existe.** Há `watchPositionAsync`, mas só para a navegação
até a porta; não há nada que meça "150 m da porta" nem "10 min parado em outro lugar".

**Mas quase tudo o que ela faria já está feito, em relógio.** Em `linhaDoDia.ts`:

```ts
export const MIN_NA_PORTA = 20;
...
const desdeAPorta = minutosEntre(e.semDesfecho.hora, horaBRT(agora));
const aindaLaDentro = desdeAPorta != null && desdeAPorta >= 0 && desdeAPorta < MIN_NA_PORTA;
if (aindaLaDentro) return montar({ estado: 'na_porta', tom: 'neutro', … });
…
return montar({ estado: 'pendente', tom: 'vermelho', … });
```

Nos **primeiros 20 minutos** depois do Cheguei, o estado é `na_porta`, neutro — que é
exatamente o "nenhuma faixa enquanto ele está na porta" do seu 1c. Passados 20, vira `pendente`,
que é exatamente a sua 2a.

**Minha recomendação: usar o relógio e não construir o GPS.** Custa zero bateria, já está no ar,
já tem suíte, e erra de um jeito previsível (cobra cedo demais quem passa 40 min numa porta,
cobra tarde demais quem passa 5). O GPS acertaria mais e custa bateria o dia inteiro — e a
pergunta 0.6 do pacote anterior, sobre esse custo, nunca foi respondida com medição.

Se você quiser precisão, o caminho barato é o **Cheguei na próxima**: quando ele dá check-in
noutro lugar, saiu da porta anterior por definição, sem ligar GPS nenhum. Isso eu construo.

**O que isso implica para a sua linha 2 da faixa** (`ficou N min na porta`): com o relógio, "N
min" é o tempo desde o check-in, não o tempo real na porta. O texto honesto seria **`visita das
HH:MM · apresentou? marcou?`** — que é o que a faixa já diz hoje. Preciso da sua palavra: mantém
o texto da prancha com a ressalva, ou troca?

## 5 · Onde a faixa decide a fila, e onde a pendente nasce

A fila está em `App.tsx`, desde a fase 2 do mapa limpo: só `pendente` ocupa a faixa; a hora das
ligações vira o `+1`; busca aberta esconde a faixa. Os outros oito estados da linha do dia
desceram para o kicker da folha.

**Quando a pendente nasce hoje:** não é no × nem no Salvar — é no **relógio**, 20 minutos depois
do check-in, desde que não haja ficha daquele negócio no dia (resposta 3). Ela some sozinha
quando a ficha é salva, porque a fila para de devolver aquele motivo.

## 6 · O tom de alerta claro já existe

**`--tint-red` e `--tint-red-text` existem** e já são usados: no chip "Limpar tudo", no botão de
confirmação destrutiva, e na própria faixa vermelha da linha do dia (`TOM.vermelho`). Também há
`--tint-red-border`. **Nada a criar.**

## 7 · O Cheguei em contorno

Está em `FolhaDoMapa.tsx` (`chegueiContorno` / `chegueiContornoTexto`), com a prop
`faixaVermelha` que o App passa. Foi escrito hoje de manhã, na fase 2 do mapa limpo. **Sai**, e
é um alívio: a regra nova ("o Cheguei é sempre vermelho cheio; quem desce de tom é a faixa") é
mais simples e mais coerente com o que o Julyan disse — o Cheguei não cede espaço a nada.

## 8 · As lentes

**A lente ativa vem de um estado só** (`lente`, em `App.tsx`), e tanto a `FolhaLentes` quanto a
fileira do desktop já leem dele. A fileira nova pode compartilhá-lo sem nenhum arranjo.

`FolhaLentes` hoje recebe **todas** as lentes (mudei na fase 1, senão "Meu dia" e
"Recém-abertos" ficariam inalcançáveis), mais os filtros rápidos, o `Limpar`, o contador da meta
de Recém-abertos e o Modo sol. **Nada nela precisa mudar**, como a seção 5 prevê.

`FileiraDeLentes.tsx` continua vivo e renderizado **só no desktop** — então "desktop sem
mudança" sai de graça.

## 9 · Os gestos: já estão do jeito que a fileira precisa

O app usa **`PanResponder` do react-native-web**, não uma lib de gesto. E a folha já declara:

```ts
onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
```

Ou seja, **a folha só assume o gesto quando ele é claramente vertical** — arrasto horizontal já
passa direto por ela hoje. Para a fileira basta o espelho dessa regra (`|dx| > |dy|`), e os dois
convivem sem disputa. O mapa é Google Maps e só reage a gesto que chega nele; com a fileira
capturando o horizontal, ele não recebe.

---

## O que eu preciso de você para começar

1. **`comoFoi` também fica opcional**, ou só o `proximo`? (resposta 1)
2. **Relógio ou GPS** para a saída? Minha recomendação é relógio + "Cheguei na próxima", e não
   construir o GPS. (resposta 4)
3. Se for relógio: **o texto da linha 2 da faixa** muda para `visita das HH:MM · apresentou?
   marcou?`, porque "ficou N min na porta" não seria verdade. (resposta 4)

Com esses três eu começo pela fase 1 (ficha + saída) e te mando os prints a 390 px nos dois
temas, lado a lado com os seus.
