-- LEITURAS PESADAS GUARDADAS POR 2–3 MINUTOS (16/11/26)
--
-- Depois do incidente das 8h (ver 0268 e 0269). O Cockpit abre com ~20 leituras em paralelo e o app
-- chama mapa_contexto a cada abertura (654 ms de processador: ele desmonta o snapshot de 2,9 MB toda
-- vez). Na máquina Nano, abrir, recarregar ou tentar de novo refaz a conta inteira.
--
-- Cada função abaixo vira "_calc_<nome>" (a conta, sem mudança) e ganha uma casca com o MESMO nome
-- e os MESMOS argumentos, que devolve o que já foi calculado se tiver menos de 2 minutos (3 no
-- mapa_contexto). A chave é a pessoa (auth.uid) + os argumentos: ninguém recebe a leitura de outro.
-- No mapa_contexto a chave é só "do time" ou "de fora", porque é o único pedaço que muda por pessoa.
-- Resultado com 'erro' ou nulo não é guardado.
--
-- Custo aceito: o gestor pode ver o plano e os quadros com até 2 minutos de atraso.
-- Ficaram de fora de propósito: meu_placar (o executivo quer ver o x/6 subir na hora),
-- habilidade_quadro e ranking_executivo (são chamadas por outras funções).
-- Idempotente: função que já tem "_calc_" é pulada.

create table if not exists public.leitura_guardada (
  chave text primary key,
  feito_em timestamptz not null default now(),
  conteudo jsonb not null
);
alter table public.leitura_guardada enable row level security;
revoke all on public.leitura_guardada from anon, authenticated;

do $do$
declare
  r record;
  v_nomes text;
  v_chave text;
  v_quem text;
  v_ttl text;
begin
  for r in
    select p.proname,
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_identity_arguments(p.oid) as ident,
           coalesce(p.proargnames, '{}'::text[]) as nomes,
           p.pronargs as n
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any (array['mapa_contexto', 'planejamento_do_time', 'gestor_v4_leituras', 'combinados_quadro',
                                  'disputa_quadro', 'vendas_do_mes', 'placar_da_semana', 'ranking_gestor'])
  loop
    continue when exists (select 1 from pg_proc x where x.pronamespace = 'public'::regnamespace and x.proname = '_calc_' || r.proname);
    v_nomes := array_to_string(r.nomes[1:r.n], ', ');
    v_chave := case when r.n = 0 then quote_literal('-') else format('md5(row(%s)::text)', v_nomes) end;
    v_quem := case when r.proname = 'mapa_contexto'
      then $q$case when public.is_field_admin() or exists (select 1 from public.equipe_cockpit e where e.profile_id = auth.uid() and e.ativo) then 'time' else 'fora' end$q$
      else $q$coalesce(auth.uid()::text, '-')$q$ end;
    v_ttl := case when r.proname = 'mapa_contexto' then '3 minutes' else '2 minutes' end;

    execute format('alter function public.%I(%s) rename to %I', r.proname, r.ident, '_calc_' || r.proname);
    execute format($f$
      create function public.%1$I(%2$s) returns jsonb
      language plpgsql volatile security definer set search_path = public
      as $w$
      declare v_k text; v_c jsonb;
      begin
        v_k := %3$L || ':' || %4$s || ':' || %5$s;
        select g.conteudo into v_c from public.leitura_guardada g where g.chave = v_k and g.feito_em > now() - interval %6$L;
        if found then return v_c; end if;
        v_c := public.%7$I(%8$s);
        if v_c is not null and not (jsonb_typeof(v_c) = 'object' and v_c ? 'erro') then
          insert into public.leitura_guardada (chave, feito_em, conteudo) values (v_k, now(), v_c)
          on conflict (chave) do update set feito_em = excluded.feito_em, conteudo = excluded.conteudo;
        end if;
        return v_c;
      end;
      $w$
    $f$, r.proname, r.args, r.proname, v_quem, v_chave, v_ttl, '_calc_' || r.proname, v_nomes);
    execute format('revoke all on function public.%I(%s) from public, anon', r.proname, r.ident);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', r.proname, r.ident);
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', '_calc_' || r.proname, r.ident);
  end loop;
end
$do$;
