# 01b — Contraste no modo escuro

**Tela:** Base  ·  **Arquivo:** `vários (busca no repo)`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *Correção de contraste no modo escuro*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24 (32 e 40 são desktop, com uma exceção documentada). Não copie valor de desktop.

## Fazer

- Buscar por `#94090F`, `#167532`, `#1D9688`, `#018CCC`.
- **Classificar antes de mudar:** (a) cor de texto/ícone sobre superfície do tema → token (`--tint-red-text`, `--tint-green-text`, `--info-text`); (b) texto sobre fundo tonal claro (`#FAE8E9`, `#FFF8EB`, `#EAF7EE`) → **deixar**; (c) fundo ou régua decorativa → caso a caso.
- **Caso concreto que já apareceu:** a régua esquerda do card de tarefa usava a mesma variável do texto do badge. O badge tem fundo tonal claro (fica escuro nos dois temas), a régua fica sobre `--surface` (precisa do par claro no escuro: `#E5A1A4` para D5, `#FFD894` para D2). **São duas variáveis, não uma.**
- Confirmar no bloco escuro: `--tint-green-text: #77BD8B`, `--info-text: #66CFFF`, `--brand-text: #E5A1A4`.

## Não fazer

- Não troque as cores de temperatura do funil (`TEMP_COLORS`).

## Pronto quando

- [ ] você listou cada ocorrência com a classificação (a/b/c)
- [ ] nenhum dos quatro hexes sobrou como cor de texto sobre superfície do tema
- [ ] badge e régua do card de tarefa usam variáveis **diferentes**
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
