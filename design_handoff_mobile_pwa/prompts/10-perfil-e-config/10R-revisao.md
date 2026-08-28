# 10R — Revisão: Menu do perfil e Configurações

**Arquivos:** `App.tsx`, `src/screens/ConfiguracoesScreen.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *12. Menu do perfil (bottom sheet)* · screenshot `design_handoff_mobile_pwa/screenshots/13-dark-menu-do-perfil.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. Menu do perfil abre pelo avatar de 48px do header, em qualquer uma das quatro telas com barra.
2. Folha raio `16px 16px 0 0`, `padding:12px 16px 32px`, handle 36×4.
3. Identidade com avatar 48px `--tint-red`/`--tint-red-text`, nome 16/24/0.15 peso 600, papel e e-mail 12/16/0.4.
4. Cinco itens de `min-height:56px` com ícone 24px, rótulo 16/24/0.15 peso 500 e `chevron_right`.
5. "Painel do gestor" só para `role === 'gestor'`.
6. "Sair" com ícone e rótulo em `#C8131B`, e o logout funciona.
7. Configurações é sheet de **tela cheia**, com `arrow_back` que volta para o menu do perfil.
8. Cinco seções: Conta · Aparência · Senha · Área do gestor · Sobre (+ Administração se existir).
9. Cabeçalho de seção 12/16/0.5 peso 700 uppercase; card raio **16**.
10. **Linhas de Conta empilhadas** — chave 12/16/0.5 acima, valor 16/24/0.5 abaixo. Nada quebrando em duas linhas.
11. Segmented de tema com altura **48**, raio 12 só nas pontas.
12. **Trocar o tema aqui repinta a interface E o mapa** — o mapa lê o tema em JavaScript.
13. Campos de senha em **coluna**, altura 48 raio 16; CTA de largura total 48px.
14. Hint da senha com a **copy original**.
15. "Painel de gestão" é um `<a href>` real para `/gestao`, **não `window.open`**.
16. Forçar atualização preservado (se existia) e funcionando.
17. "Sair da conta" 48px outline `#C8131B` funcionando.
18. Engrenagem e "Sair" **saíram** do header; `isPasswordModalOpen` não é mais usado.
19. Seções de gestor/admin escondidas para quem não tem o papel — testar com os três papéis.
20. Rodapé com `padding-bottom:32px` (área segura).
21. Nenhum hexadecimal fora dos literais permitidos; spacing só até 24 (+32 do rodapé).

## Armadilhas conhecidas desta tela

- **Engrenagem mantida no header** junto com a tela nova — dois caminhos.
- **Linhas de Conta em duas colunas** — o valor quebra em 390px.
- **Seletor de tema sem efeito no mapa** — interface clara e mapa escuro. Esse bug já existiu no app.
- **`<a href>` do painel de gestão trocado por `window.open`.**
- **Forçar atualização descartado** ao mover o modal.
- **`arrow_back` das Configurações voltando para o Mapa** em vez do menu do perfil.
- **Segmented de tema com 40px** (valor do desktop).

## Conferência

- Abrir em **390 × 844** (DevTools, iPhone 14) e comparar com o screenshot
- Testar com o **polegar**: todo alvo tem 48px?
- Alternar o tema e repetir no **escuro**
- No PWA instalado: nada embaixo da barra de gestos
