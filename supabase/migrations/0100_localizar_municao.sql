-- 0100 — Localizar a munição que nasceu sem coordenada
--
-- Por quê: a conta "de rua" que o executivo cadastra pelo Cockpit nasce só com
-- nome, bairro e cidade (pl6CriarLead) — sem endereço nem GPS. Sem coordenada não
-- há pin (0098), e sem pin a visita planejada não chega à rota do mapa (0099). Em
-- 25/09/2026, 7 das 28 visitas planejadas do dia estavam assim.
--
-- Como: a Edge Function localizar-municao busca "nome bairro cidade" no Google
-- Maps (Serper) e só grava quando nome E lugar batem. A fila vem daqui, com o que
-- está PLANEJADO primeiro (visita desta semana ou da próxima), e cada lead é
-- tentado de novo no máximo uma vez por semana — sem match hoje pode ter amanhã,
-- mas não a cada hora.
--
-- Mesmo padrão da 0087: segredo gerado no banco, guardado no cofre, conferido por
-- segredo_confere; nunca passa pelo chat nem pelo repositório.

alter table public.leads_prospeccao add column if not exists localizacao_tentada_em timestamptz;
alter table public.leads_prospeccao add column if not exists localizacao_origem text;

create or replace function public.municao_para_localizar(p_limite integer default 20)
returns table (id uuid, nome text, bairro text, cidade text, endereco text, planejado boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with segunda as (
    select date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date d
  ),
  planejados as (
    select distinct s.value ->> 'id' sid
    from public.planos_semanais p
    cross join generate_series(0, 4) g(i)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p.grade -> g.i) = 'array' then p.grade -> g.i else '[]'::jsonb end) s
    where p.data_segunda in ((select d from segunda), (select d from segunda) + 7)
      and jsonb_typeof(s.value) = 'object'
  )
  select l.id, l.nome, l.bairro, l.cidade, l.endereco,
         exists (select 1 from planejados x
                 where x.sid = 'n-' || l.id::text
                    or (l.hubspot_deal_id is not null and x.sid in ('c-' || l.hubspot_deal_id, 'r-' || l.hubspot_deal_id))) planejado
  from public.leads_prospeccao l
  where l.lat is null
    and nullif(trim(l.nome), '') is not null
    and nullif(trim(l.cidade), '') is not null
    and l.status in ('atribuido', 'na_rota', 'criado_hubspot')
    and (l.localizacao_tentada_em is null or l.localizacao_tentada_em < now() - interval '7 days')
  order by planejado desc, l.created_at desc
  limit greatest(1, least(50, p_limite));
$function$;

revoke all on function public.municao_para_localizar(integer) from public, anon, authenticated;
grant execute on function public.municao_para_localizar(integer) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'localizar_municao') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'localizar_municao',
      'Header x-cron-secret da Edge Function localizar-municao (0100)'
    );
  end if;
end $$;

create or replace function public.invocar_localizar_municao(
  p_dry_run boolean default false,
  p_limite integer default 20
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
  from vault.decrypted_secrets where name = 'localizar_municao'
  order by created_at desc limit 1;
  if v_segredo is null then
    raise exception 'segredo localizar_municao ausente no vault';
  end if;
  select net.http_post(
    url := 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/localizar-municao',
    body := jsonb_build_object('dry_run', p_dry_run, 'limite', p_limite),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    timeout_milliseconds := 120000
  ) into v_req;
  return v_req;
end;
$$;
revoke all on function public.invocar_localizar_municao(boolean, integer) from public, anon, authenticated;

-- O agendamento fica na 0101: primeiro a rodada de teste (dry_run), só depois o cron.
