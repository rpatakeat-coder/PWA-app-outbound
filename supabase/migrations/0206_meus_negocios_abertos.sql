-- 0206 · OS MEUS NEGÓCIOS ABERTOS NO HUBSPOT, PARA A CHECAGEM DE DUPLICADO (auditoria 16/10/2026)
--
-- A checagem de "já existe esta casa?" do cadastro de lead (src/utils/buscarLeadsParecidos.ts)
-- só olha a tabela clients. O negócio que nasce direto no HubSpot (Instagram, indicação, Inside)
-- só chega ao clients horas depois: o "Rustico Arte Ferro e Fogo" foi criado no HubSpot às 10:26,
-- chegou ao app às 19:04, e às 16:00 o executivo cadastrou o mesmo restaurante na rua — dois
-- negócios abertos, um em Negociação e outro em Visita.
--
-- Esta função devolve os negócios ABERTOS do próprio executivo (dono = o id_hubspot do perfil) que o
-- robô leu do HubSpot (cockpit_snapshot 'hubspot', reps.<dono>.abertos, de hora em hora). Só leitura,
-- só os do próprio dono; o app compara nome e distância como já faz com clients.
create or replace function public.meus_negocios_abertos()
returns table (deal_id text, nome text, etapa text, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select a->>'id', a->>'name', a->>'stage',
         case when a->>'lat' ~ '^-?[0-9]+([.][0-9]+)?$' then (a->>'lat')::double precision end,
         case when a->>'lng' ~ '^-?[0-9]+([.][0-9]+)?$' then (a->>'lng')::double precision end
    from public.cockpit_snapshot s,
         public.profiles p,
         jsonb_array_elements(coalesce(s.conteudo->'reps'->(p.id_hubspot)->'abertos', '[]'::jsonb)) a
   where s.chave = 'hubspot'
     and p.id = (select auth.uid())
     and p.id_hubspot is not null
   limit 2000;
$$;
revoke all on function public.meus_negocios_abertos() from public, anon;
grant execute on function public.meus_negocios_abertos() to authenticated;
