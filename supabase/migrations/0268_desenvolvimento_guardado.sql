-- O QUADRO DE DESENVOLVIMENTO GUARDADO POR 10 MINUTOS (16/11/26, aplicada às 08:40 no meio do incidente)
--
-- Segunda 16/11, 08:00–08:45: o banco (plano gratuito, máquina Nano) ficou sem processador. Pedidos de
-- 20/10 min subiram para 3.303/10 min quando o aviso das 8h chegou e todos abriram o app; às 08:25 o
-- PostgREST chegou a responder 503 para tudo. Pego rodando: desenvolvimento_quadro, 2 chamadas de 14 s.
-- É a consulta que mais gasta desde abril (12% do tempo total; 1,4 s de processador por chamada) e o
-- app a refaz a cada sinal ao vivo (visita, ficha, foto, conquista, negócio) em TODOS os celulares.
--
-- Agora o resultado fica guardado por pessoa por 10 minutos. Quem chega junto espera a primeira conta
-- (trava consultiva) em vez de repetir. Resultado com 'erro' não é guardado.
-- Custo aceito: o quadro pode estar até 10 minutos atrasado.

create table if not exists public.desenvolvimento_guardado (
  pessoa uuid primary key,
  feito_em timestamptz not null default now(),
  conteudo jsonb not null
);
alter table public.desenvolvimento_guardado enable row level security;
revoke all on public.desenvolvimento_guardado from anon, authenticated;

create or replace function public.desenvolvimento_quadro(p_pessoa uuid default null, p_owner text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare v_eu uuid := (select auth.uid()); v_alvo uuid := p_pessoa; v_id uuid; v_c jsonb;
begin
  if v_eu is null then return jsonb_build_object('erro', 'sem sessão'); end if;
  if v_alvo is null and p_owner is not null then
    select p.id into v_alvo from public.profiles p where p.id_hubspot = p_owner order by p.id limit 1;
    if v_alvo is null then return jsonb_build_object('erro', 'pessoa sem perfil no app'); end if;
  end if;
  if v_alvo is not null and v_alvo <> v_eu and not coalesce((select public.eh_gestor_cockpit()), false) then
    return jsonb_build_object('erro', 'só o gestor vê outra pessoa');
  end if;
  v_id := coalesce(v_alvo, v_eu);
  select g.conteudo into v_c from public.desenvolvimento_guardado g where g.pessoa = v_id and g.feito_em > now() - interval '10 minutes';
  if found then return v_c; end if;
  perform pg_advisory_xact_lock(hashtextextended('desenvolvimento_quadro:' || v_id::text, 0));
  select g.conteudo into v_c from public.desenvolvimento_guardado g where g.pessoa = v_id and g.feito_em > now() - interval '10 minutes';
  if found then return v_c; end if;
  v_c := public._desenvolvimento_de(v_id);
  if v_c is not null and not (v_c ? 'erro') then
    insert into public.desenvolvimento_guardado (pessoa, feito_em, conteudo) values (v_id, now(), v_c)
    on conflict (pessoa) do update set feito_em = excluded.feito_em, conteudo = excluded.conteudo;
  end if;
  return v_c;
end;
$$;
