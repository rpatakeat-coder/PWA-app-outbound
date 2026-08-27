# 06d — Rodapé do rail e paradas no mapa

**Tela:** Rota  ·  **Arquivo:** `src/screens/RotaScreen.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *3. Rota do dia*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.

## Fazer

- Rodapé do rail: `padding:24px`, borda superior 1px `--border`, coluna gap 8.
- "Iniciar navegação" — Large filled: altura 40, raio 12, fundo `#C8131B`, texto branco 14/20/0.1 peso 600, ícone `navigation` 24px, gap 8, hover `#94090F`. **Rótulo flush-left**: `justify-content:flex-start; padding:0 16px`.
- "Otimizar paradas" — Large outline: borda 1px `#C8131B`, fundo transparente, texto `#C8131B`, ícone `route`, hover fundo `--tint-red`. Também flush-left.
- No mapa: polyline `#C8131B` largura **5**, `stroke-linecap`/`linejoin` round. Geometria real do OSRM quando disponível, reta tracejada `[8,4]` como fallback — **comportamento atual, não mexer**.
- Marcadores numerados: 36×36 pill, borda 3px branca, `0 4px 8px rgba(0,0,0,.14)`, número 14/20 peso 700 branco. Fundo `#167532` concluída, `#C8131B` atual, `--text-faint` pendente.

## Pronto quando

- [ ] os dois CTAs com rótulo flush-left
- [ ] polyline largura 5
- [ ] marcadores com as três cores de estado
- [ ] navegação e otimização funcionando
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
