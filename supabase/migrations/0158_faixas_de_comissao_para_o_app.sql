-- Fase 0 das abas do app (handoff 04/10/2026, docs/12 §6 e §11): o Meu desempenho calcula o
-- variável e "quanto vale a próxima venda". A tabela mora em cockpit_config (chave
-- comissionamento), que o executivo não lê (RLS sem política). Esta função entrega SÓ as
-- faixas e o modelo — nada de outro registro da cockpit_config, nada de remuneração fixa
-- (que nem existe lá). Só leitura; mudar a tabela continua sendo mudar a configuração.
create or replace function public.faixas_comissao()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'modelo', c.conteudo->>'modelo',
    'moeda',  c.conteudo->>'moeda',
    'faixas', c.conteudo->'faixas',
    'atualizadoEm', c.conteudo->>'atualizadoEm'
  )
  from cockpit_config c
  where c.chave = 'comissionamento'
    and (select auth.uid()) is not null;
$$;

revoke all on function public.faixas_comissao() from public, anon;
grant execute on function public.faixas_comissao() to authenticated;
