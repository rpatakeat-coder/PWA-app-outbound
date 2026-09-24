-- 0088 — Agenda o negocio-vira-ponto a cada 15 minutos
--
-- Por quê: a primeira execução (24/09/2026) criou 69 pontos que faltavam no
-- mapa, conferidos no banco (todos com coordenada, nenhum id_hubspot
-- repetido). Sem agenda, o buraco volta: o time cria negócio pelo Planejamento
-- e direto no HubSpot todo dia. A cada 15 minutos a função olha os negócios
-- ativos do Field Sales e cria o ponto que faltar, com as mesmas travas
-- (sem localização inventada, sem pino duplicado, sem negócio de teste).
--
-- limite_geocode 20 por rodada: o grosso da localização vem do lead de
-- prospecção e do próprio negócio; o Google é para o que sobra, e o teto
-- impede uma rodada de estourar o tempo ou a cota.
--
-- Idempotente: remove o agendamento de mesmo nome antes de criar.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'negocio-vira-ponto-15min') then
    perform cron.unschedule('negocio-vira-ponto-15min');
  end if;
end $$;

select cron.schedule(
  'negocio-vira-ponto-15min',
  '*/15 * * * *',
  $$select public.invocar_negocio_vira_ponto(false, 20);$$
);
