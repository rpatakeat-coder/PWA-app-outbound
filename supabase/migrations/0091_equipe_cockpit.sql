-- 0091 — A equipe do Cockpit dentro do APP, e UMA regra de "gestor do Cockpit"
--
-- Por quê: no Cockpit, quem entra e com que papel vinha de data/usuarios.json
-- (email, role manager|rep, ownerId, nome, rampStage, aComecar, fieldStatus).
-- No APP a identidade é profiles, mas o papel do Cockpit não é o mesmo que o do
-- app de campo: o Luiz Paulo é gestor no Cockpit e executivo (role 'user') no
-- app. Com as políticas das tabelas do Cockpit usando is_field_admin(), a tela
-- mostraria a ele dados de gestor e o banco o trataria como executivo.
--
-- equipe_cockpit substitui o usuarios.json: quem é da equipe, o papel NO
-- COCKPIT e os atributos de rampa. O dono no HubSpot NÃO é copiado para cá:
-- vem de profiles.id_hubspot, uma fonte só (as quatro fontes do time que
-- divergiam em silêncio foram exatamente o problema no Cockpit).
--
-- eh_gestor_cockpit() = gestor do app (is_field_admin) OU gestor ativo na
-- equipe_cockpit. As políticas das tabelas do Cockpit trocam is_field_admin()
-- por ela; as do app de campo (rotas, áudio do 1:1, metas, classificação)
-- ficam como estão.
--
-- Semeada com a lista do Cockpit em 25/09/2026 (e-mail do Julyan mapeado para
-- outbound@takeat.app). Wericles (89842507) entra inativo: saiu do time. A
-- conta de teste julyan.exec@takeat.app não existe no APP e não é criada.

create table if not exists public.equipe_cockpit (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  papel text not null check (papel in ('manager', 'rep')),
  ramp_stage text,
  a_comecar boolean not null default false,
  field_status text,
  ativo boolean not null default true,
  nota text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.eh_gestor_cockpit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_field_admin(), false)
      or exists (select 1 from public.equipe_cockpit e
                 where e.profile_id = auth.uid() and e.papel = 'manager' and e.ativo)
$$;
revoke all on function public.eh_gestor_cockpit() from public;
grant execute on function public.eh_gestor_cockpit() to authenticated, service_role;

alter table public.equipe_cockpit enable row level security;
drop policy if exists equipe_cockpit_select on public.equipe_cockpit;
create policy equipe_cockpit_select on public.equipe_cockpit
  for select to authenticated
  using (profile_id = auth.uid() or (select public.eh_gestor_cockpit()));
drop policy if exists equipe_cockpit_escrita on public.equipe_cockpit;
create policy equipe_cockpit_escrita on public.equipe_cockpit
  for all to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));

insert into public.equipe_cockpit (profile_id, papel, ramp_stage, ativo, nota)
select p.id, s.papel, s.ramp, s.ativo, s.nota
from (values
  ('outbound@takeat.app',            'manager', null,         true,  null),
  ('luizpaulo@takeat.app',           'manager', null,         true,  'Gestor no Cockpit; no app de campo é role user.'),
  ('bruno.takeat@gmail.com',         'rep',     'pleno',      true,  null),
  ('sandro.takeat@gmail.com',        'rep',     'pleno',      true,  null),
  ('kelly.takeat@gmail.com',         'rep',     'pleno',      true,  null),
  ('marco.takeat@gmail.com',         'rep',     'pleno',      true,  null),
  ('scaetano.takeat@gmail.com',      'rep',     'semana_2_3', true,  null),
  ('renatapessoa.takeat@gmail.com',  'rep',     'semana_2_3', true,  null),
  ('andregomes.takeat@gmail.com',    'rep',     'semana_2_3', true,  null),
  ('luizpimentel.takeat@gmail.com',  'rep',     'semana_2_3', true,  null),
  ('wandrade.takeat@gmail.com',      'rep',     'pleno',      false, 'Saiu do time (Julyan, 24/09/2026).')
) as s(email, papel, ramp, ativo, nota)
join public.profiles p on lower(p.email) = s.email
on conflict (profile_id) do nothing;

-- Troca is_field_admin() por eh_gestor_cockpit() nas políticas das tabelas do
-- Cockpit. Reescreve a expressão que o próprio Postgres guarda (pg_policies),
-- então o resto de cada política fica idêntico.
do $$
declare
  r record;
  v_using text;
  v_check text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where (coalesce(qual, '') like '%is_field_admin()%' or coalesce(with_check, '') like '%is_field_admin()%')
      and (
        (schemaname = 'public' and tablename in (
          'analise_individual_mensal', 'analise_individual_semanal', 'combinados_cumprimento',
          'combinados_semana', 'comunicados', 'comunicados_lidos', 'dailies', 'fila_pwa',
          'leads_prospeccao', 'modos_de_agir', 'pauta_do_lider', 'pdi_compromissos',
          'pdi_documentos', 'planos_diarios', 'planos_semanais', 'playbook_copias',
          'playbook_progresso', 'registros_rodada', 'sugestoes_planos', 'um_a_um'))
        or (schemaname = 'storage' and tablename = 'objects' and policyname in (
          'pdi_documentos_leitura', 'pdi_documentos_upload', 'comunicados_imagens_upload'))
      )
  loop
    v_using := replace(r.qual, 'is_field_admin()', 'eh_gestor_cockpit()');
    v_check := replace(r.with_check, 'is_field_admin()', 'eh_gestor_cockpit()');
    if v_using is not null and v_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
                     r.policyname, r.schemaname, r.tablename, v_using, v_check);
    elsif v_using is not null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, v_using);
    else
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, v_check);
    end if;
  end loop;
end $$;
