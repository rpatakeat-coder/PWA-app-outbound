-- 0114 · Foto da visita (handoff App de Campo v4.1, decisão 16; 26/09/2026)
--
-- O executivo tira a foto da fachada/cardápio no registro da visita. Ela vai
-- comprimida no celular (≤ 1600 px, ~300 KB) para um bucket PRIVADO e fica
-- registrada em fotos_visita, que o Cockpit lê para a galeria por executivo
-- (aba Pessoas) — evidência da visita no 1:1 e insumo de estratégia.
--
-- Acesso: quem tirou vê e grava as próprias; gestor (is_field_admin ou
-- eh_gestor_cockpit) vê todas. Ninguém apaga pelo app.
-- Caminho no bucket: <owner_id>/<AAAA-MM-DD>/<deal_id|client_id>-<HHMMSS>.jpg

insert into storage.buckets (id, name, public)
values ('fotos-visita', 'fotos-visita', false)
on conflict (id) do nothing;

create table if not exists public.fotos_visita (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  deal_id text,
  owner_id text,
  caminho text not null unique,
  lat numeric,
  lng numeric,
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists fotos_visita_owner_dia on public.fotos_visita (owner_id, criado_em desc);
create index if not exists fotos_visita_deal on public.fotos_visita (deal_id);

alter table public.fotos_visita enable row level security;

drop policy if exists fotos_visita_le on public.fotos_visita;
create policy fotos_visita_le on public.fotos_visita for select to authenticated
  using (criado_por = auth.uid() or public.is_field_admin() or public.eh_gestor_cockpit());

drop policy if exists fotos_visita_grava on public.fotos_visita;
create policy fotos_visita_grava on public.fotos_visita for insert to authenticated
  with check (criado_por = auth.uid());

-- Storage: gravar só no próprio bucket; ler as próprias (dono do objeto) ou, gestor, todas.
drop policy if exists fotos_visita_obj_grava on storage.objects;
create policy fotos_visita_obj_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-visita');

drop policy if exists fotos_visita_obj_le on storage.objects;
create policy fotos_visita_obj_le on storage.objects for select to authenticated
  using (bucket_id = 'fotos-visita' and (owner = auth.uid() or public.is_field_admin() or public.eh_gestor_cockpit()));
