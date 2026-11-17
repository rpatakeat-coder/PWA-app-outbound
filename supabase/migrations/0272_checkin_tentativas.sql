-- 0272 · CADA RECUSA DO "CHEGUEI" FICA REGISTRADA (17/11/26)
--
-- Julyan: "não posso mais ter erros de GPS quando o executivo estiver na frente da porta".
-- client_visits só guarda a visita que entrou. A tentativa que o app recusou ("GPS não respondeu",
-- "Você está longe do pino", "GPS impreciso") não ficava em lugar nenhum: quem desistiu ou tentou
-- de novo era invisível, e não dava para dizer quem trava, em qual mensagem e em qual restaurante.
--
-- Uma linha por aviso do Cheguei, com a resposta que a pessoa deu. Só o app escreve (pela função);
-- só o gestor lê. Nenhuma regra de prova muda: isto é medição.

create table if not exists public.checkin_tentativas (
  id            bigint generated always as identity primary key,
  criado_em     timestamptz not null default now(),
  pessoa        uuid not null,
  client_id     uuid,
  aviso         text not null,
  resposta      text,
  distancia_m   numeric,
  precisao_m    numeric,
  lat           double precision,
  lng           double precision,
  pino_origem   text,
  pino_aproximado boolean
);
create index if not exists checkin_tentativas_criado_em_idx on public.checkin_tentativas (criado_em desc);

alter table public.checkin_tentativas enable row level security;
drop policy if exists checkin_tentativas_gestor_le on public.checkin_tentativas;
create policy checkin_tentativas_gestor_le on public.checkin_tentativas
  for select to authenticated using ((select public.is_field_admin()));
revoke all on public.checkin_tentativas from anon, authenticated;
grant select on public.checkin_tentativas to authenticated;

create or replace function public.registrar_tentativa_checkin(
  p_client_id uuid, p_aviso text, p_resposta text default null,
  p_distancia_m numeric default null, p_precisao_m numeric default null,
  p_lat double precision default null, p_lng double precision default null,
  p_pino_origem text default null, p_pino_aproximado boolean default null
) returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.checkin_tentativas (pessoa, client_id, aviso, resposta, distancia_m, precisao_m, lat, lng, pino_origem, pino_aproximado)
  select (select auth.uid()), p_client_id, left(p_aviso, 60), left(p_resposta, 30),
         case when p_distancia_m between 0 and 50000000 then round(p_distancia_m) end,
         case when p_precisao_m between 0 and 1000000 then round(p_precisao_m) end,
         p_lat, p_lng, left(p_pino_origem, 30), p_pino_aproximado
   where (select auth.uid()) is not null and coalesce(p_aviso, '') <> '';
$$;
-- no Supabase, função nova no schema public nasce executável por anon: tirar de anon pelo nome
revoke all on function public.registrar_tentativa_checkin(uuid, text, text, numeric, numeric, double precision, double precision, text, boolean) from public, anon;
grant execute on function public.registrar_tentativa_checkin(uuid, text, text, numeric, numeric, double precision, double precision, text, boolean) to authenticated;
