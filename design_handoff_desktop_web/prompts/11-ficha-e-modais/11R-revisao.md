# 11R — Revisão: Ficha do lead e modais

**Arquivos:** `App.tsx`, `src/screens/ChangeStageModal.tsx`, `src/screens/ScheduleMeetingModal.tsx`, `src/screens/CEPStep.tsx`
**Referência:** `design_handoff_desktop_web/README.md`, seção *9. Ficha do lead (drawer)* · screenshot `design_handoff_desktop_web/screenshots/09-drawer-ficha-do-lead.png`

> **Duas fases. Não misture.**
>
> **Fase 1 — auditar.** Percorra a lista e responda item por item: **OK**, **FALTA** ou **DIVERGE** (cite o valor encontrado e o esperado). **Não edite nada nesta fase.** Termine com o resumo: quantos OK / FALTA / DIVERGE.
>
> **Fase 2 — corrigir.** Só depois de eu confirmar. Um por vez, do maior impacto visual para o menor.

## Checklist

1. **Drawer da ficha:** overlay `rgba(0,0,0,.32)`, painel 480px à direita, fundo `--surface`, sombra `-8px 0 16px rgba(0,0,0,.14)`.
2. Fecha no X, no overlay **e no Esc**. `role="dialog"`, `aria-modal="true"`, `aria-label`.
3. Transição 220ms ease-out (slide + fade do overlay).
4. Topo: dot 10px + kicker uppercase 11/16/0.5 peso 600 `--text-faint`; nome 18/24 peso 600; sublinha 12/16/0.4.
5. Ações: "Mudar etapa" Large filled + "Agendar" Large outline + `more_horiz` 40×40 raio 12.
6. Card "Uso do produto" com semáforo — verde ≤7 dias, âmbar 8–30, vermelho >30 ou nenhuma; rodapé "Sincronizado há N dias".
7. O card de uso só aparece para quem o `hubspot-usage-sync` alcança.
8. Pares chave/valor: `padding:10px 0`, borda inferior 1px `--border`, chave 12/16/0.5 peso 600 `--text-faint` à esquerda, valor 14/20/0.25 à direita.
9. Timeline: ícone em pill 32px com o tint do tipo + título 14/20/0.1 peso 600 sobre quando 12/16/0.4.
10. Rodapé: "Marcar visita (check-in GPS)" Large filled `#27A84C`, largura total, flush-left. Vira "Re-marcar visita" quando já houve check-in.
11. Validação de 200m e Task concluída no HubSpot **inalteradas**.
12. **Modal de etapa:** card 560px, `max-height:88vh`, `overflow-y:auto`, raio 8, sombra 05.
13. Opções de etapa: altura 48, raio 8, radio 20×20, selecionada com fundo `--tint-red` e borda `#C8131B`.
14. Destinos vindos de `APP_STAGE_IDS` com a regra de avanço (`FREE_ADVANCE_MAX_STAGE_ID`); Perdido sempre disponível.
15. Campos obrigatórios em bloco com **borda esquerda 3px `#CC8C1D`**, em `grid-template-columns:1fr 1fr` gap 16.
16. Campos e máscaras de `STAGE_FIELDS_BY_ID` **sem mudança de lógica** (cep, cnpj, currency, date, boolean, select multi).
17. Rodapé do modal: "Cancelar" Medium outline + "Confirmar mudança" Large filled.
18. **Modal de agendar:** card 640px, corpo em duas colunas `1fr 1fr` gap 24.
19. Calendar do kit: mês/ano **Poppins Bold 16 `#C8131B`**; dias da semana Bold 14 (domingo `--text-faint`); dia selecionado em **círculo** `#C8131B`.
20. Textarea de observações com **altura 120** (default desktop do kit).
21. Chips de horário: altura 32, raio 8, selecionado `--tint-red`/`--tint-red-text`.
22. **Modal de cadastro:** card 720px, stepper com pill 24px + régua 24×2px, campos em `1fr 1fr` com Restaurante em `span 2`.
23. Mapa de ajuste: pin no **centro do mapa**, não da tela (`mapLayout` preservado); caixa de status com coordenada `tabular-nums`.
24. Rodapé: "Cancelar" Text button + "Cadastrar e sincronizar" Large filled.
25. Todos os overlays fecham no Esc, na ordem inversa de abertura.
26. Nenhum hexadecimal fora dos literais permitidos; spacing na escala 8pt.

## Armadilhas conhecidas desta tela

- **Um segundo padrão de painel** — avisos, rota, ficha e perfil usam a mesma estrutura. Não inventar outro.
- **Esc não fecha** — o mais fácil de esquecer.
- **Campos obrigatórios em uma coluna** no desktop; Ag. Pagamento tem 13 campos.
- **Dia selecionado do calendário como retângulo** em vez de círculo.
- **Pin do cadastro no centro da tela** em vez do centro do mapa — salva coordenada errada.
- **Máscara de campo alterada** ao reestilizar o modal de etapa.

## Conferência visual

- `npm start`, abrir em **1440px** e comparar com o screenshot lado a lado
- Reduzir para **1024px** e **900px** — nada corta nem sobrepõe
- Alternar o tema e repetir no **escuro**
