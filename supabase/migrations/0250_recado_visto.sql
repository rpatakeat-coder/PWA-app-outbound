-- 0250 · O RECADO DO GESTOR GANHA A HORA EM QUE FOI VISTO (Julyan, 04/11/26)
--
-- "Chamar", "Cobrar o plano" e "Cobrar os 3" gravam em sugestoes_planos, que abre sozinho na tela
-- inicial do app até o executivo tocar em "Entendi". Até aqui o "Entendi" ficava só no aparelho
-- (localStorage) e o gestor cobrava sem saber se a pessoa viu. Agora o app chama
-- marcar_recado_visto() e o Cockpit mostra "visto HH:MM" ou "não viu ainda".
--
-- Escrita mínima: uma coluna nula e uma função. O executivo não ganha UPDATE na tabela; a função só
-- carimba recados DELE (owner_id = meu_owner_hubspot()), só uma vez (visto_em is null) e só a hora.

alter table public.sugestoes_planos add column if not exists visto_em timestamptz;

create or replace function public.marcar_recado_visto(p_ids uuid[])
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with u as (
    update public.sugestoes_planos
       set visto_em = now()
     where id = any (p_ids)
       and visto_em is null
       and owner_id = public.meu_owner_hubspot()
    returning 1
  )
  select count(*)::int from u
$$;

-- no Supabase, criar função no schema public devolve execute para anon: tirar de todos e dar só a quem entrou
revoke all on function public.marcar_recado_visto(uuid[]) from public;
revoke all on function public.marcar_recado_visto(uuid[]) from anon;
grant execute on function public.marcar_recado_visto(uuid[]) to authenticated;
