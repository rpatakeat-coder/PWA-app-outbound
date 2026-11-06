-- 0255 · O RELACIONAMENTO DE UM EXECUTIVO, PARA O GESTOR (06/11/26)
--
-- Julyan: mostrar no Cockpit quem pediu indicação e quem não respondeu (a pergunta da 0254).
-- Uma pessoa por chamada (a página da pessoa no Pessoas, como o desenvolvimento_quadro), 30
-- dias, nunca antes de 06/11/26 12:00 BRT: antes disso a pergunta não existia, e a visita
-- antiga contaria como "não respondeu" sem ter tido a chance.
--
-- "Visita a cliente" = visita com check-in num pino que hoje é cliente (clients.status). Sem
-- linha em visitas_relacionamento = não respondeu. Só gestor (ou a própria pessoa) lê.

create or replace function public.relacionamento_do_executivo(p_owner text, p_dias integer default 30)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_pessoa uuid; v_desde timestamptz; v jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('erro', 'sem sessão'); end if;
  select p.id into v_pessoa from public.profiles p where p.id_hubspot = p_owner limit 1;
  if v_pessoa is null then return jsonb_build_object('erro', 'pessoa sem cadastro no app'); end if;
  if not (public.is_field_admin() or public.eh_gestor_cockpit() or v_pessoa = auth.uid()) then
    return jsonb_build_object('erro', 'só o gestor vê');
  end if;
  v_desde := greatest(now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 90))), timestamptz '2026-11-06 15:00:00+00');
  with vis as (
    select cv.id, cv.visited_at, coalesce(nullif(btrim(c.empresa), ''), c.nome) as cliente
      from public.client_visits cv
      join public.clients c on c.id = cv.client_id
     where cv.visited_by = v_pessoa and cv.visited_at >= v_desde and c.status = 'cliente'
  ), r as (
    select vis.*, vr.resposta, vr.indicado_nome, vr.indicado_telefone
      from vis left join public.visitas_relacionamento vr on vr.visita_id = vis.id
  )
  select jsonb_build_object(
    'desde', v_desde,
    'visitas', count(*),
    'indicou', count(*) filter (where resposta = 'indicou'),
    'nao_indicou', count(*) filter (where resposta = 'nao_indicou'),
    'nao_pediu', count(*) filter (where resposta = 'nao_pediu'),
    'sem_resposta', count(*) filter (where resposta is null),
    'indicacoes', coalesce(jsonb_agg(jsonb_build_object('cliente', cliente, 'nome', indicado_nome, 'telefone', indicado_telefone, 'em', visited_at)
                     order by visited_at desc) filter (where resposta = 'indicou'), '[]'::jsonb),
    'sem_resposta_lista', coalesce(jsonb_agg(jsonb_build_object('cliente', cliente, 'em', visited_at)
                     order by visited_at desc) filter (where resposta is null), '[]'::jsonb)
  ) into v from r;
  return v;
end;
$function$;

revoke all on function public.relacionamento_do_executivo(text, integer) from public, anon;
grant execute on function public.relacionamento_do_executivo(text, integer) to authenticated;
