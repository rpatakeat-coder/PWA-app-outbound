-- 0087 — Todo negócio ativo do Field Sales tem um ponto no mapa
--
-- Por quê: medido em 24/09/2026, 283 dos 564 negócios ativos do pipeline Field
-- Sales (916011864) não existiam em `clients`, então o executivo não os via no
-- mapa. O ponto só nascia pelo app, pelo webhook do RPA ou pela conta-alvo; o
-- negócio criado pelo Planejamento do Cockpit ou direto no HubSpot não passava
-- por nenhum deles. A Edge Function negocio-vira-ponto olha o HubSpot (só
-- leitura) e cria o ponto que falta — ver o cabeçalho dela para as regras de
-- localização e de duplicado.
--
-- Esta migration prepara a chamada segura, no mesmo padrão do reparo de
-- geocode (invoke_geocode_repair_cron):
--   - o segredo nasce DENTRO do cofre (vault), gerado pelo próprio banco;
--     não aparece em código, chat nem repositório;
--   - segredo_confere(nome, valor) é o que a função de borda usa para validar
--     o header x-cron-secret; só o service_role executa;
--   - invocar_negocio_vira_ponto(dry_run, limite_geocode) faz o POST com o
--     segredo; só o dono do banco (pg_cron) executa.
-- O agendamento (pg_cron) entra na 0088, depois da primeira execução conferida.

create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'negocio_vira_ponto') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'negocio_vira_ponto',
      'Header x-cron-secret da Edge Function negocio-vira-ponto (0087)'
    );
  end if;
end $$;

create or replace function public.segredo_confere(p_nome text, p_valor text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select coalesce(p_valor, '') <> ''
     and exists (select 1 from vault.decrypted_secrets
                 where name = p_nome and decrypted_secret = p_valor)
$$;

revoke all on function public.segredo_confere(text, text) from public, anon, authenticated;
grant execute on function public.segredo_confere(text, text) to service_role;

create or replace function public.invocar_negocio_vira_ponto(
  p_dry_run boolean default false,
  p_limite_geocode integer default 60
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
  from vault.decrypted_secrets where name = 'negocio_vira_ponto'
  order by created_at desc limit 1;
  if v_segredo is null then
    raise exception 'segredo negocio_vira_ponto ausente no vault';
  end if;

  select net.http_post(
    url := 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/negocio-vira-ponto',
    body := jsonb_build_object('dry_run', p_dry_run, 'limite_geocode', p_limite_geocode),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    timeout_milliseconds := 290000
  ) into v_req;
  return v_req;
end;
$$;

revoke all on function public.invocar_negocio_vira_ponto(boolean, integer) from public, anon, authenticated;
