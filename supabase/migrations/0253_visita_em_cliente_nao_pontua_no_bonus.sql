-- 0253 (05/11/26) · VISITA EM CLIENTE NÃO VALE PONTO NO RANKING SEMANAL (BÔNUS)
--
-- Julyan: "visitas em clientes e etc não contam pro bônus semanal, mas conta nas visitas deles em
-- geral". O ranking semanal (pontos_da_semana: venda 100, demo 25, visita 3) contava toda visita com
-- prova, inclusive a quem já é cliente. A régua da visita em si (_visitas_com_prova, o "1 de 6", o
-- placar de visitas) NÃO muda.
--
-- "Já era cliente" é decidido pelo que a visita gravou NO MOMENTO (client_visits.etapa_anterior), não
-- pelo status de hoje: a visita que fechou a venda (etapa de venda na hora) continua valendo, mesmo o
-- restaurante sendo cliente agora.
--   · não vale: etapa na visita Ganho / Enviado Onboarding / Onboarding, ou pino sem etapa de quem é
--     cliente ou ganho_fs (o pino "Cliente Takeat");
--   · vale: qualquer etapa de venda, e ex-cliente (reconquista é venda de novo).

create or replace function public.visita_vale_bonus(p_etapa text, p_status text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select not (
    coalesce(p_etapa, '') in ('Ganho', 'Enviado Onboarding', 'Onboarding')
    or (nullif(btrim(coalesce(p_etapa, '')), '') is null and coalesce(p_status, '') in ('cliente', 'ganho_fs'))
  )
$function$;
revoke all on function public.visita_vale_bonus(text, text) from public, anon;
grant execute on function public.visita_vale_bonus(text, text) to authenticated, service_role;

do $mig$
declare d text;
  de text := '    select v.visited_by as pessoa, min(v.dia) as dia, v.client_id
      from sem, public._visitas_com_prova(sem.seg, sem.sex, null) v
     where v.provada
     group by 1, 3';
  para text := '    select v.visited_by as pessoa, min(v.dia) as dia, v.client_id
      from sem, public._visitas_com_prova(sem.seg, sem.sex, null) v
      join public.client_visits cv on cv.id = v.visit_id
      left join public.clients c on c.id = v.client_id
     where v.provada
       and public.visita_vale_bonus(cv.etapa_anterior, c.status) -- 0253: visita em cliente não pontua
     group by 1, 3';
begin
  select pg_get_functiondef('public.pontos_da_semana(date)'::regprocedure) into d;
  if position('visita_vale_bonus' in d) > 0 then raise notice '0253: já aplicada'; return; end if;
  if position(de in d) = 0 then raise exception '0253: pontos_da_semana mudou; revisar à mão'; end if;
  execute replace(d, de, para);
end
$mig$;
