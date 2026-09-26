-- 0110 · Motor das contas-alvo (prompt final, Parte A §8.1)
--
-- Por quê (objetivo: o executivo vender mais): 2.734 contas-alvo no mapa e
-- nenhuma conferência depois que entram. Restaurante que fechou continua
-- virando parada da rota e visita perdida. O motor confere cada conta-alvo no
-- Google uma vez por mês — aberta / fechada, nota, avaliações — e o card avisa
-- ("Motor (DD/MM): sumiu do Google"), para a rota não mandar ninguém a porta
-- fechada. Julyan aprovou o custo das consultas (26/09).
--
-- Duas bases: 1.249 contas-alvo têm place_id do Google (ChIJ…) e se conferem
-- direto; 1.486 vieram da munição ("municao:…") e o motor acha o lugar pelo
-- nome + endereço perto do pino (só aceita o achado a até 150 m), guardando o
-- place_id achado à parte — conta_alvo_place_id segue sendo a chave de
-- deduplicação da munição e não se mexe.
--
-- Regras do prompt: não recria descartado (só confere quem não foi
-- descartado) e não sobrescreve o que a rua preencheu — o motor só escreve as
-- colunas motor_* e a nota/avaliações da conta-alvo, que são dele.
--
-- O agendamento entra em migration própria, depois do teste com dado real.
-- Idempotente.

alter table public.clients
  add column if not exists motor_conferido_em timestamptz,
  add column if not exists motor_status text,
  add column if not exists motor_google_place_id text,
  add column if not exists motor_detalhe text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_motor_status_check') then
    alter table public.clients add constraint clients_motor_status_check
      check (motor_status is null or motor_status in ('ok', 'sumiu_google', 'fechado_temporario', 'nao_achado'));
  end if;
end $$;

comment on column public.clients.motor_status is
  'Motor mensal das contas-alvo (0110): ok | sumiu_google (fechado de vez) | fechado_temporario | nao_achado (a busca não achou o lugar perto do pino).';

create index if not exists clients_motor_fila_idx
  on public.clients (motor_conferido_em nulls first)
  where conta_alvo_place_id is not null;

-- Segredo do header x-cron-secret, gerado dentro do cofre (mesmo padrão da 0087).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'motor_contas_alvo') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'motor_contas_alvo',
      'Header x-cron-secret da Edge Function motor-contas-alvo (0110)'
    );
  end if;
end $$;

create or replace function public.invocar_motor_contas_alvo(
  p_dry_run boolean default false,
  p_limite integer default 120
)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_segredo text;
  v_req bigint;
begin
  select decrypted_secret into v_segredo
  from vault.decrypted_secrets where name = 'motor_contas_alvo'
  order by created_at desc limit 1;
  if v_segredo is null then
    raise exception 'segredo motor_contas_alvo ausente no vault';
  end if;

  select net.http_post(
    url := 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/motor-contas-alvo',
    body := jsonb_build_object('dry_run', p_dry_run, 'limite', p_limite),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    timeout_milliseconds := 140000
  ) into v_req;
  return v_req;
end;
$$;

revoke all on function public.invocar_motor_contas_alvo(boolean, integer) from public, anon, authenticated;
