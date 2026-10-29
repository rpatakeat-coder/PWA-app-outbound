# Handoff · App de rua otimizado (a espinha do dia + o mapa limpo)

Takeat Field Sales · 29/10/2026

Três pacotes, nesta ordem. Cada prompt tem as perguntas que o Claude Code responde antes de codar, o que não se mexe, o que construir em fases, as regras e o checklist de aceite.

1. **`PROMPT-CLAUDE-CODE-APP-DE-RUA.md`**: 6 abas → 3, o ciclo da porta, Hoje, Eu, cobrança do próximo passo.
2. **`PROMPT-CLAUDE-CODE-MAPA-LIMPO.md`**: o topo do mapa de 9 camadas para 4, a faixa da vez, Mapa | Lista, números das lentes. **Os pinos não mudam.**
3. **`PROMPT-CLAUDE-CODE-ORDEM-DA-PORTA.md`**: primeiro a porta, depois o desfecho (a ficha salva sem o E agora, que volta na saída pela faixa pendente); o Cheguei fica vermelho cheio sempre; as lentes voltam como fileira embaixo, entre localização e +.

```
PROMPT-CLAUDE-CODE-APP-DE-RUA.md     pacote 1
PROMPT-CLAUDE-CODE-MAPA-LIMPO.md     pacote 2
PROMPT-CLAUDE-CODE-ORDEM-DA-PORTA.md pacote 3
prancha/
  App de rua otimizado - Prancha.dc.html   pacote 1 · referência principal
  Espinha do dia - Prancha.dc.html         pacote 1 · abrir, fechar, estados da linha do dia
  Mapa limpo - Prancha.dc.html             pacote 2 · referência
  Ordem da porta - Prancha.dc.html         pacote 3 · referência
  support.js · mapa-base.svg · takeat-t-branco.png   necessários para abrir as pranchas
prints-ordem-da-porta/                pacote 3 · um PNG por celular (1a…4d), com legenda
ref/
  PEDIDO-dia-do-executivo.md         pedido do pacote 1
  PEDIDO-mapa-limpo.md               pedido do pacote 2
  PROMPT-anterior-AGENDA.md          pacote do qual este depende (não refazer)
  PROMPT-anterior-TAREFAS-POR-DIA.md pacote do qual este depende (não refazer)
  PLAYBOOK-gatilhos.md               gatilhos da Fala pronta e do "Se ele disser"
```

Abra as pranchas direto no navegador, com a pasta `prancha/` inteira. Cada celular tem um id (1a, 2c…) para referência.

Em uma frase: **o executivo não sai do mapa, então tudo vai até o mapa, e o mapa continua sendo um mapa.** Uma coisa principal por vez (a próxima porta e o Cheguei); o resto espera a vez num lugar fixo. Nada trava.
