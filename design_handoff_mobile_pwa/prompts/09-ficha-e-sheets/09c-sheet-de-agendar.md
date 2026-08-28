# 09c — Sheet de tela cheia

**Tela:** Agendar  ·  **Arquivo:** `src/screens/ScheduleMeetingModal.tsx`
**Referência:** `design_handoff_mobile_pwa/README.md`, seção *10. Agendar (sheet de tela cheia)*

> Tarefa única. Não toque em outra região da tela nem em outro arquivo. Se encontrar algo errado fora do escopo, **anote e siga** — há um prompt de revisão no fim da sequência.
>
> **Tokens mobile são diferentes dos de desktop.** Input 48px raio 16; botão 48px raio 12; card raio 16; maior tipo é Title Medium 18/24; spacing só até 24. Não copie valor de desktop.

## Fazer

- Mesma casca do sheet de etapa: header com `arrow_back` + "Agendar" 18/24 peso 600 e `{lead}` na sublinha.
- Corpo em **coluna única** gap 16 (o desktop usa duas colunas; aqui não cabe).
- Segmented **Demo / Follow up**: dois botões `flex:1`, altura **48**, raio 12 nas pontas, 16/24/0.15 peso 600. Ativo `#C8131B`/branco.
- **Calendar do kit**: card borda 1px `--border`, raio 12, fundo `--surface`. Cabeçalho `padding:12px 16px` borda inferior 1px: setas 40×40 + "Agosto 2026" **Poppins Bold 16 `#C8131B`**. Dias da semana Poppins Bold 14 — domingo `--text-faint`, resto `--text-muted`. Células Poppins Medium 14, **altura 40**, `tabular-nums`; fora do mês `--text-disabled`; **selecionada em círculo** (raio 50%) `#C8131B`/branco.
- **Horário**: rótulo 14/20/0.1 peso 600; chips altura **48**, `padding:0 20px`, raio 12, borda 1px, 16/24/0.15 peso 600 `tabular-nums`, `flex-wrap`. Selecionado `--tint-red`/borda `#C8131B`/texto `--tint-red-text`.
- **Observações**: textarea altura **140** (o default mobile do kit; o desktop usa 120), `padding:12px 16px`, raio 16, borda 1px `--stroke-strong`.
- Rodapé fixo: "Agendar demo · `{data}`, `{hora}`" altura 48 raio 12 `#C8131B` largura total. O CTA repete a escolha — confirmação sem voltar a conferir.
- Cria Meeting no HubSpot e evento no Google Calendar — **fluxo inalterado**.

## Pronto quando

- [ ] coluna única
- [ ] calendar com mês em Bold 16 `#C8131B` e dia selecionado em círculo
- [ ] chips de horário com 48px
- [ ] textarea de 140px
- [ ] CTA repetindo data e hora
- [ ] todo alvo tocável com **no mínimo 48px**
- [ ] `npm run typecheck` limpo

## Ao terminar

Responda em três linhas: **o que mudou**, **o que ficou fora do escopo e você anotou**, e **qualquer valor do README que não deu para aplicar e por quê**.
