-- ============================================================================
-- resumos_ia — a prosa gerada por IA, e o rastro de quando ela falha
-- ============================================================================
--
-- A regra que organiza esta tabela inteira (06-IA-E-AUTOMACOES.md):
--   NUMERO VEM DO BANCO. IA ESCREVE TEXTO. Nunca o contrario.
-- Nada aqui e' metrica. E' narrativa sobre metrica que ja' foi calculada.
--
-- POR QUE A COLUNA `falha` EXISTE
-- O doc conta um incidente: alguem trocou a string do modelo por uma invalida,
-- TODAS as chamadas passaram a falhar em silencio, e o sistema seguiu exibindo
-- o texto da semana anterior como se fosse novo. Ficou 4 dias invisivel.
--
-- Por isso a falha e' gravada como LINHA, no mesmo lugar do sucesso, e a tela
-- le' as duas. Texto velho sem aviso e' pior que tela vazia: tela vazia o
-- gestor percebe; texto velho ele acredita.
--
-- `gerado_em` existe pra tela poder rotular a IDADE do texto — outra regra do
-- doc: rotule a idade do dado e avise quando estiver velho.
-- ============================================================================

create table if not exists public.resumos_ia (
  id            uuid primary key default gen_random_uuid(),
  -- Que tipo de leitura e' esta. Aberto de proposito: quando entrar analise
  -- individual ou fechamento mensal, nao precisa de migration nova.
  tipo          text not null,
  -- A janela que o texto descreve. Guardada junto porque o texto so' faz
  -- sentido com o periodo do lado — "subiu 20%" sem janela nao e' informacao.
  janela_inicio date not null,
  janela_fim    date not null,
  texto         text,
  -- Os numeros exatos que foram enviados no prompt. Guardados pra auditoria:
  -- quando o texto parecer errado, da' pra conferir se a IA alucinou ou se o
  -- numero que ela recebeu e' que estava errado.
  numeros       jsonb,
  modelo        text,
  -- NULL em sucesso; a mensagem do erro quando a geracao falhou.
  falha         text,
  gerado_por    uuid references auth.users(id) on delete set null,
  gerado_em     timestamptz not null default now()
);

-- A tela le' sempre "o mais recente deste tipo", inclusive quando o mais
-- recente e' uma falha.
create index if not exists resumos_ia_tipo_idx
  on public.resumos_ia (tipo, gerado_em desc);

alter table public.resumos_ia enable row level security;

-- Leitura: so' gestor. O texto comenta o desempenho do time nominalmente.
drop policy if exists resumos_ia_select on public.resumos_ia;
create policy resumos_ia_select on public.resumos_ia
  for select to authenticated using ((select public.is_field_admin()));

-- Escrita: NINGUEM pelo cliente. Quem grava e' a edge function com service
-- role, que e' a unica que viu os numeros de verdade. Sem policy de insert,
-- um usuario nao consegue plantar texto que parece ter vindo da IA.

comment on table public.resumos_ia is
  'Prosa gerada por IA sobre numeros ja calculados. Escrita SO pela edge function resumo-semanal (service role). Linha com `falha` preenchida = geracao quebrou; a tela mostra o erro em vez de reciclar texto velho.';
