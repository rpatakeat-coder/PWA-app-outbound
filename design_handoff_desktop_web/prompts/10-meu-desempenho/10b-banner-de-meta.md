# 10b — Banner de meta

**Tela:** Meu desempenho  ·  **Arquivo:** `src/screens/MeuDesempenhoScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *7. Meu desempenho*
**Escopo:** só o primeiro bloco

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Container da tela: `padding:24px`, coluna gap 24, `max-width:1200px`.
- Banner: `padding:24px`, raio 8, fundo `#C8131B`, texto branco. `display:flex; justify-content:space-between; align-items:center; gap:24px; flex-wrap:wrap`.
- Esquerda: kicker "META DE {MÊS}" (11/16, `letter-spacing:.12em`, peso 800, `rgba(255,255,255,.75)`, uppercase); título 28/36 peso 700 ("8 de 12 fechamentos"), `margin-top:4px`; sublinha 14/20/0.25 peso 500 `rgba(255,255,255,.85)` com o que falta e o ritmo.
- Direita: dois blocos, gap 32. Cada um com número 28/36 peso 700 `tabular-nums` e sublabel 11/16/0.5 peso 600 `rgba(255,255,255,.75)` — **% da meta** e **MRR novo**.
- **Este é o único bloco vermelho chapado da superfície desktop.** É a pergunta que a aba responde. Não replique o padrão em outra tela.
- Números reais dos hooks. Se "ritmo" não existir (10a), omita a frase em vez de inventar cálculo.

## Pronto quando

- [ ] banner com kicker, título, sublinha e dois números à direita
- [ ] valores reais, sem número fixo
- [ ] texto branco legível nos dois temas (o fundo é vermelho fixo)
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
