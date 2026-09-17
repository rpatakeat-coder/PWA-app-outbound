-- ============================================================================
-- planos_semanais — a INTENCAO da semana (e por que nao e' uma grade 5x7)
-- ============================================================================
--
-- Vem de doc-cockpit/03-banco-supabase.md, e aqui ela chega DIFERENTE do
-- pacote. Vale explicar, porque e' a unica divergencia deliberada de schema
-- desta leva.
--
-- O pacote define `grade` como matriz 5x7 (5 dias uteis x 7 faixas de hora),
-- onde cada celula tem id de lead, `'__b'` (bloqueado) ou null. Este
-- repositorio JA' TEM o dia do vendedor resolvido: `field_routes` +
-- `field_route_stops`, com `posicao` ordenada, que o app otimiza por estrada
-- de verdade e que alimenta `client_visits`.
--
-- Adotar a grade de horas criaria DUAS respostas para "o que essa pessoa faz
-- quinta-feira" — a matriz e a rota — e o proprio pacote diz que a mesma regra
-- em dois lugares diverge sempre; a unica duvida e' quando.
--
-- A DIVISAO ADOTADA:
--   planos_semanais  = INTENCAO  (que regiao em cada dia, que leads pretendo)
--   field_routes     = FATO      (a rota do dia, que o vendedor percorre)
-- O plano MATERIALIZA em rota; nunca reporta o que aconteceu. Por isso aqui
-- nao ha' coluna de realizado, e por isso `leads_por_dia` e' uma LISTA por dia
-- e nao uma matriz por hora: hora prometida e' precisao que a operacao nao
-- tem — o vendedor reordena na rua, e o proprio app reordena por estrada.
--
-- Se um dia a operacao passar a trabalhar por hora marcada, a grade volta a
-- fazer sentido e esta tabela e' o lugar dela.
-- ============================================================================

create table if not exists public.planos_semanais (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references public.profiles(id) on delete cascade,
  -- Segunda-feira em Brasilia. Mesma chave de tudo que e' semanal.
  data_segunda date not null,

  -- Uma regiao por dia util: { "seg": "Centro", "ter": "Zona Sul", ... }.
  -- Esta parte do pacote entra inteira — nao conflita com nada e e' o que
  -- torna a semana planejavel (a rua se organiza por regiao, nao por hora).
  regioes      jsonb not null default '{}'::jsonb,

  -- Leads pretendidos por dia util: { "seg": ["<uuid>", ...], ... }.
  -- LISTA, nao matriz de hora. Ver o comentario do topo.
  leads_por_dia jsonb not null default '{}'::jsonb,

  -- Dias em que a pessoa nao vai pra rua (folga, treinamento, feriado):
  -- ["qua"]. Bloqueio e' DADO, nao ausencia — sem ele, um dia vazio parece
  -- falta de plano quando na verdade e' plano de nao ir.
  dias_bloqueados jsonb not null default '[]'::jsonb,

  -- Quando o vendedor fechou o plano. Null = ainda esta' montando, e a tela
  -- precisa saber a diferenca entre "nao planejou" e "planejou e nao fechou".
  fechado_em   timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (seller_id, data_segunda)
);

create index if not exists planos_semanais_semana_idx
  on public.planos_semanais (data_segunda desc, seller_id);

alter table public.planos_semanais enable row level security;

-- O plano e' da pessoa: ela escreve o proprio. O gestor le' todos (planejar e'
-- o assunto do 1:1) mas NAO escreve — plano que o gestor preenche nao e' plano
-- do vendedor, e' ordem de servico. Quando o gestor quiser propor, isso e'
-- outra coisa, com nome proprio (sugestao), e nao existe ainda.
drop policy if exists planos_semanais_select on public.planos_semanais;
create policy planos_semanais_select on public.planos_semanais
  for select to authenticated
  using (seller_id = auth.uid() or (select public.is_field_admin()));

drop policy if exists planos_semanais_insert on public.planos_semanais;
create policy planos_semanais_insert on public.planos_semanais
  for insert to authenticated with check (seller_id = auth.uid());

drop policy if exists planos_semanais_update on public.planos_semanais;
create policy planos_semanais_update on public.planos_semanais
  for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());

comment on table public.planos_semanais is
  'A INTENCAO da semana do vendedor (regiao por dia + leads pretendidos). O FATO e field_routes. Divergencia deliberada do doc de replicacao: lista por dia, nao grade 5x7 de horas — ver o comentario da migration.';
