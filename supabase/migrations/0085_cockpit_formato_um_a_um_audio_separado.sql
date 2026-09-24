-- 0085 — Unificação do Cockpit: 1:1 no formato do Cockpit, áudio numa tabela só do gestor
--
-- Por quê: o Cockpit registra o 1:1 como owner_id + data + autor + resumo +
-- compromissos (jsonb), e o EXECUTIVO lê os próprios registros. O APP tinha
-- outro modelo (seller_id, pauta, combinado) com gravação e transcrição da
-- conversa, que são SÓ DO GESTOR (decisão escrita em transcrever-1a1).
--
-- As duas regras não cabem na mesma tabela: RLS esconde linha, não coluna. Se
-- a transcrição ficasse em um_a_um, o executivo que lê o próprio 1:1 leria a
-- transcrição junto. Por isso:
--   um_a_um            formato exato do Cockpit; lê o dono ou o gestor.
--   um_a_um_audio      as 6 colunas de gravação/transcrição do APP, uma linha
--                      por 1:1, só gestor. transcrever-1a1 passa a ler aqui.
--   um_a_um_documentos igual à 0064, só gestor, apontando para o novo um_a_um.
--
-- As tabelas estavam VAZIAS (0 registros, 0 documentos, 0 áudios no bucket
-- um-a-um, medido em 24/09/2026). A trava aborta se houver linha.
--
-- Reversível: formato anterior nas migrations 0062, 0063 e 0064.

do $$
declare n bigint;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'um_a_um' and column_name = 'seller_id') then
    select count(*) into n from public.um_a_um;
    if n > 0 then raise exception '0085 abortada: um_a_um tem % linha(s) no formato antigo', n; end if;
    if to_regclass('public.um_a_um_documentos') is not null then
      select count(*) into n from public.um_a_um_documentos;
      if n > 0 then raise exception '0085 abortada: um_a_um_documentos tem % linha(s)', n; end if;
    end if;
    drop table if exists public.um_a_um_documentos;
    drop table public.um_a_um;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- um_a_um — o registro da conversa, como no Cockpit
-- ---------------------------------------------------------------------------
create table if not exists public.um_a_um (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  data date not null default current_date,
  autor text not null,
  resumo text,
  compromissos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.um_a_um enable row level security;

drop policy if exists um_a_um_leitura on public.um_a_um;
create policy um_a_um_leitura on public.um_a_um
  for select to authenticated
  using (owner_id = (select public.meu_owner_hubspot()) or (select public.is_field_admin()));

drop policy if exists um_a_um_escrita on public.um_a_um;
create policy um_a_um_escrita on public.um_a_um
  for insert to authenticated
  with check ((select public.is_field_admin()));

-- O Cockpit não edita nem apaga 1:1; o gestor do APP podia. Mantido só para ele.
drop policy if exists um_a_um_update_gestor on public.um_a_um;
create policy um_a_um_update_gestor on public.um_a_um
  for update to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));

drop policy if exists um_a_um_delete_gestor on public.um_a_um;
create policy um_a_um_delete_gestor on public.um_a_um
  for delete to authenticated using ((select public.is_field_admin()));

-- ---------------------------------------------------------------------------
-- um_a_um_audio — gravação e transcrição, só gestor
-- ---------------------------------------------------------------------------
create table if not exists public.um_a_um_audio (
  registro_id uuid primary key references public.um_a_um(id) on delete cascade,
  audio_caminho text,
  audio_tipo text,
  audio_bytes bigint,
  transcricao text,
  transcricao_erro text,
  transcrito_em timestamptz,
  created_at timestamptz not null default now()
);

alter table public.um_a_um_audio enable row level security;

drop policy if exists um_a_um_audio_gestor on public.um_a_um_audio;
create policy um_a_um_audio_gestor on public.um_a_um_audio
  for all to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));

-- ---------------------------------------------------------------------------
-- um_a_um_documentos — anexos do 1:1, só gestor (igual à 0064)
-- ---------------------------------------------------------------------------
create table if not exists public.um_a_um_documentos (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.um_a_um(id) on delete cascade,
  caminho text not null,
  nome text not null,
  tipo text,
  bytes bigint,
  enviado_por uuid references auth.users(id) on delete set null,
  enviado_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists um_a_um_documentos_registro_idx
  on public.um_a_um_documentos (registro_id, created_at desc);

alter table public.um_a_um_documentos enable row level security;

drop policy if exists um_a_um_documentos_select on public.um_a_um_documentos;
create policy um_a_um_documentos_select on public.um_a_um_documentos
  for select to authenticated using ((select public.is_field_admin()));
drop policy if exists um_a_um_documentos_insert on public.um_a_um_documentos;
create policy um_a_um_documentos_insert on public.um_a_um_documentos
  for insert to authenticated with check ((select public.is_field_admin()));
drop policy if exists um_a_um_documentos_delete on public.um_a_um_documentos;
create policy um_a_um_documentos_delete on public.um_a_um_documentos
  for delete to authenticated using ((select public.is_field_admin()));
