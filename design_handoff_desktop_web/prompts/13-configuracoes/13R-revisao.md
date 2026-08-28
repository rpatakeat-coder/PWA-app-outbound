# 13R — Revisão: Configurações

**Arquivos:** `src/screens/ConfiguracoesScreen.tsx`, `App.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *10. Configurações* · screenshots `design_handoff_desktop_web/screenshots/13-configuracoes-conta-senha.png`, `14-configuracoes-aparencia-gestor.png`, `15-configuracoes-admin-sobre.png`, `16-dark-configuracoes.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Existe item "Configurações" na sidebar, com engrenagem, entre "Meu desempenho" e o rodapé.
2. A engrenagem e o botão "Sair" **saíram do header**.
3. `isPasswordModalOpen` e `styles.passwordModalCard` não são mais usados.
4. Container `padding:24px`, gap 32, `max-width:880px`.
5. Seis seções na ordem: Conta · Senha · Aparência · Área do gestor · Administração · Sobre.
6. Cabeçalho de seção 12/16/0.5 peso 700 `--text-muted` uppercase, `margin-bottom:16px`.
7. Casca de card: `--surface`, borda 1px `--border`, raio 8, sombra 02.
8. Conta: linhas `padding:12px 16px`, chave com `white-space:nowrap` (não quebra em duas linhas), valor à direita.
9. Nota "Nome, e-mail e papel são definidos pelo administrador." presente.
10. Senha: hint com a **copy original** ("Digite uma nova senha. Mínimo de 6 caracteres.").
11. Dois campos de senha em `1fr 1fr` gap 16 com `max-width:560px`.
12. "Salvar nova senha" Large filled com ícone `lock_reset`, flush-left, e **`updatePassword` funcionando**.
13. Aparência: segmented de 3 com raio 12 só nas pontas, `max-width:360px`, selecionado `#C8131B`.
14. Trocar o tema aqui repinta a interface **e o mapa** (o mapa lê o tema em JS, não em CSS).
15. Área do gestor: dois cards-link, ícone em quadrado 40×40 raio 8, hover em `border-color`.
16. "Abrir painel de gestão" continua sendo um `<a href>` real para `/gestao` — **não `window.open`**.
17. Administração: card com borda esquerda 3px `#CC8C1D`; "Forçar atualização" funciona (`app_force_reload.triggered_at`).
18. Sobre: linhas de leitura com `tabular-nums`; "Sair da conta" Large outline `#C8131B` com `logout`, e o logout funciona.
19. Seções de gestor e admin escondidas para quem não tem o papel — testar com os três papéis.
20. Abaixo de 1024px os campos de senha empilham.
21. Nenhum hexadecimal fora dos literais permitidos; spacing na escala 8pt.
22. Modo escuro conferido nas seis seções.

## Armadilhas conhecidas desta tela

- **Engrenagem mantida no header** junto com a tela nova — dois caminhos para a mesma coisa.
- **`<a href>` do painel de gestão trocado por `window.open`** — o comentário no código explica por que é link de verdade.
- **Copy do hint da senha reescrita.**
- **Chave da linha de leitura quebrando em duas linhas** ("E-mail", "ID HubSpot") por falta de `white-space:nowrap`.
- **Seletor de tema sem efeito no mapa** — o mapa recebe o tema por JS; se ele não re-renderiza, a interface fica clara e o mapa escuro. Esse bug já existiu no app.
- **Seções de admin visíveis para vendedor.**

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com os screenshots
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
