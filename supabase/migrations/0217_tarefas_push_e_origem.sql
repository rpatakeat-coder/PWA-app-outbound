-- 0217 · TAREFAS: A FILA VAI ATÉ O EXECUTIVO (17/10/2026)
--
-- Handoff "Tarefas do App" (sss.zip), aprovado pelo Julyan em 17/10: "isso quero o push, sim, sim,
-- vamos fazer o recomendado". O que o banco precisa:
--   · de onde veio cada "feito" (a fila, o Cheguei, a ligação ou o WhatsApp pelo app, um desfecho);
--   · a sequência de dias em que a fila zerou antes das 18h;
--   · as inscrições de web push de cada aparelho, o registro do que já foi mandado (no máximo 4 por
--     dia, nunca o mesmo negócio duas vezes) e o par de chaves VAPID, que só o servidor lê;
--   · as janelas da "hora das ligações";
--   · o robô que dispara os avisos às 08:30, 12:30, 17:30 e 18:05 (dias úteis; feriado e o limite
--     ficam na Edge push-fila).

-- 1. ORIGEM DO FEITO. O que já existe veio todo da fila.
alter table public.fila_feitas add column if not exists origem text not null default 'fila';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fila_feitas_origem_valida') then
    alter table public.fila_feitas add constraint fila_feitas_origem_valida
      check (origem in ('fila', 'cheguei', 'ligacao_app', 'whatsapp_app', 'desfecho'));
  end if;
end $$;

-- 1b. DE QUE SEÇÃO VEIO O FEITO: o "% que o gestor vê" conta só follow-up (Atrasados, Para hoje e
--     Combinados), sem o Sem próximo passo (P3). Linha antiga fica null e não entra na conta.
alter table public.fila_feitas add column if not exists secao text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fila_feitas_secao_valida') then
    alter table public.fila_feitas add constraint fila_feitas_secao_valida
      check (secao is null or secao in ('atrasados', 'hoje', 'combinado', 'sem_passo'));
  end if;
end $$;

-- 1c. A FILA DO DIA DE CADA UM: o que está aberto em cada seção, gravado pelo app a cada leitura
--     da fila e pelo robô do push. É o denominador do %: o cockpit do gestor não tem a fila de
--     cada executivo (ela sai do HubSpot por pessoa), e assim os dois lados leem o mesmo número.
create table if not exists public.fila_do_dia (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  atrasados int not null default 0,
  hoje int not null default 0,
  combinados int not null default 0,
  sem_passo int not null default 0,
  quentes int not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, dia)
);
alter table public.fila_do_dia enable row level security;
drop policy if exists fila_do_dia_le on public.fila_do_dia;
create policy fila_do_dia_le on public.fila_do_dia for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_field_admin()));
drop policy if exists fila_do_dia_grava on public.fila_do_dia;
create policy fila_do_dia_grava on public.fila_do_dia for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists fila_do_dia_atualiza on public.fila_do_dia;
create policy fila_do_dia_atualiza on public.fila_do_dia for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 1d. O % DOS FOLLOW-UPS DO DIA, uma conta só (o app, o push das 17:30 e o cockpit leem daqui):
--     feitos de follow-up ÷ (feitos de follow-up + o que segue aberto em Atrasados, Para hoje e
--     Combinados). Cada executivo vê a linha de todos (só números, sem nome): é a média do time,
--     como os TOTAIS do ranking que o Julyan autorizou em 03/10.
create or replace function public.percentual_followups(p_dia date default ((now() at time zone 'America/Sao_Paulo')::date))
returns table (user_id uuid, feitos int, abertos int, pct int)
language sql stable security definer set search_path = public, pg_temp as $$
  with feitos as (
    select f.user_id, count(*)::int n from public.fila_feitas f
     where f.dia = p_dia and f.estado <> 'desfeita' and f.secao in ('atrasados', 'hoje', 'combinado')
     group by f.user_id
  )
  select d.user_id, coalesce(f.n, 0), (d.atrasados + d.hoje + d.combinados),
         case when coalesce(f.n, 0) + d.atrasados + d.hoje + d.combinados = 0 then null
              else round(100.0 * coalesce(f.n, 0) / (coalesce(f.n, 0) + d.atrasados + d.hoje + d.combinados))::int end
    from public.fila_do_dia d left join feitos f on f.user_id = d.user_id
   where d.dia = p_dia and ((select auth.uid()) is not null or (select auth.role()) = 'service_role')
$$;
revoke execute on function public.percentual_followups(date) from public, anon;
grant execute on function public.percentual_followups(date) to authenticated;

-- 2. DIAS ZERADOS: um por executivo e dia, gravado pelo app quando a fila zera antes das 18h.
create table if not exists public.dias_zerados (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  zerou_em timestamptz not null default now(),
  primary key (user_id, dia)
);
alter table public.dias_zerados enable row level security;
drop policy if exists dias_zerados_le on public.dias_zerados;
create policy dias_zerados_le on public.dias_zerados for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_field_admin()));
drop policy if exists dias_zerados_grava on public.dias_zerados;
create policy dias_zerados_grava on public.dias_zerados for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 3. INSCRIÇÕES DE PUSH: uma por aparelho. O app inscreve e desinscreve as suas; a Edge lê todas.
create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  plataforma text,
  criado_em timestamptz not null default now(),
  ultimo_ok_em timestamptz,
  falhas int not null default 0
);
create index if not exists push_inscricoes_user_idx on public.push_inscricoes (user_id);
alter table public.push_inscricoes enable row level security;
drop policy if exists push_inscricoes_le on public.push_inscricoes;
create policy push_inscricoes_le on public.push_inscricoes for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists push_inscricoes_grava on public.push_inscricoes;
create policy push_inscricoes_grava on public.push_inscricoes for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists push_inscricoes_apaga on public.push_inscricoes;
create policy push_inscricoes_apaga on public.push_inscricoes for delete to authenticated
  using (user_id = (select auth.uid()));

-- 4. O QUE JÁ FOI MANDADO: o limite de 4 por dia e "nunca o mesmo negócio duas vezes no dia".
--    Só a Edge (service_role) escreve e lê: RLS ligada e nenhuma política.
create table if not exists public.push_enviados (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  tipo text not null,
  ref text not null default '',
  enviado_em timestamptz not null default now(),
  primary key (user_id, dia, tipo, ref)
);
alter table public.push_enviados enable row level security;

-- 5. AS CHAVES VAPID: geradas pela própria Edge na primeira chamada; a privada nunca sai do servidor.
create table if not exists public.push_chaves (
  id int primary key default 1 check (id = 1),
  publica text not null,
  privada_jwk jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.push_chaves enable row level security;

-- 6. A HORA DAS LIGAÇÕES (P1): duas janelas de 15 min, no horário de Brasília.
insert into public.cockpit_config (chave, conteudo, origem)
values ('janelas_ligacao', '{"janelas": ["12:30", "17:30"], "minutos": 15, "fuso": "America/Sao_Paulo"}'::jsonb, '0217')
on conflict (chave) do nothing;
-- o robô nasce DESLIGADO: só liga depois do ensaio (dry_run) e do primeiro aviso conferido no
-- celular do Julyan. "so_para" restringe o envio a uma lista de profiles enquanto se testa.
insert into public.cockpit_config (chave, conteudo, origem)
values ('push_fila', '{"ligado": false, "so_para": []}'::jsonb, '0217')
on conflict (chave) do nothing;

-- 7. O ROBÔ. O segredo nasce aqui dentro e só o banco e a Edge o leem.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'push_fila') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_fila');
  end if;
end $$;

create or replace function public.invocar_push_fila(p_momento text, p_dry_run boolean default false)
returns bigint
language plpgsql security definer set search_path = public, vault, net
as $$
declare v_segredo text; v_req bigint;
begin
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'push_fila' order by created_at desc limit 1;
  if v_segredo is null then raise exception 'segredo push_fila ausente no vault'; end if;
  select net.http_post(
    url := 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/push-fila?forceFunctionRegion=us-west-2',
    body := jsonb_build_object('op', 'rodar', 'momento', p_momento, 'dry_run', p_dry_run),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    timeout_milliseconds := 120000
  ) into v_req;
  return v_req;
end $$;
revoke execute on function public.invocar_push_fila(text, boolean) from public, anon, authenticated;

-- 08:30, 12:30, 17:30 e 18:05 de Brasília (UTC-3), de segunda a sexta. Feriado: a Edge decide.
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('push-fila-0830', 'push-fila-1230', 'push-fila-1730', 'push-fila-1805');
  perform cron.schedule('push-fila-0830', '30 11 * * 1-5', $c$select public.invocar_push_fila('0830')$c$);
  perform cron.schedule('push-fila-1230', '30 15 * * 1-5', $c$select public.invocar_push_fila('1230')$c$);
  perform cron.schedule('push-fila-1730', '30 20 * * 1-5', $c$select public.invocar_push_fila('1730')$c$);
  perform cron.schedule('push-fila-1805', '5 21 * * 1-5', $c$select public.invocar_push_fila('1805')$c$);
end $$;
