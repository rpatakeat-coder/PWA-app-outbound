-- 0248 · TERRITÓRIO v3 DO GESTOR: o motor de prospecção da praça (design_handoff_territorio_v3, 02/11/26)
--
-- O Cockpit do gestor ganhou a Território v3 (cockpit-unificado, branch feat/territorio-v3). A regra que manda em
-- tudo aqui: NADA É GRAVADO NO PLANO DO EXECUTIVO SEM ELE CONFIRMAR. O gestor não escreve em planos_semanais nem
-- marca 'na_rota': ele cria SUGESTÕES. O Planejamento v3 do Cockpit (PLV3.sugestoes, o mesmo motor de sempre, pelo
-- bairro do dia que o executivo escolheu) mostra as sugestões vivas na grade dele com o selo RECÉM-ABERTO; só o
-- "Pôr" do executivo grava a grade. A sugestão vale até a sexta da semana (vale_ate) e, sem confirmação, VOLTA PARA
-- O MOTOR sozinha: quem lê filtra vale_ate >= hoje. Sem cron.
--
-- O Cockpit funciona sem esta migration (avisar, não travar): sem as tabelas e as funções ele mostra os números e
-- uma nota discreta, e não grava nada.
--
--   1. A MEDIÇÃO. aberturas_de_tela aceita a tela 'territorio' (só o gestor grava) e as ações do gestor nela
--      ('definiu_carga', 'pos_no_plano', 'redistribuiu', 'deixou_sair', 'deu_dono'). registrar_abertura MANTÉM a
--      assinatura (p_tela, p_origem, p_acao default null) e todas as telas de hoje.
--   2. A CARGA. territorio_carga: uma linha por gestor (1 a 12 recém-abertos por executivo, por semana). Lida
--      pelo próprio gestor; escrita só por definir_carga_territorio (security definer, eh_gestor_cockpit()).
--   3. AS SUGESTÕES. territorio_sugestoes: (lead, dono, origem, semana, vale_ate, confirmada_em). O gestor vê
--      todas; o executivo, as dele. Ninguém escreve direto: sugerir_no_plano (gestor), retirar_sugestoes_territorio
--      (gestor, só as pendentes) e confirmar_sugestao_territorio (o executivo, depois que o Pôr dele gravou a grade).
--      A sugestão "confirmada" também é reconhecida pelo Cockpit quando o lead aparece na grade da semana ou ganha
--      negócio, então o anúncio do executivo é só uma anotação, não a condição.
--   4. O RESGATE.
--      · redistribuir_recem_abertos(p_leads, p_para): troca o responsavel_owner_id quando o destino é outro (o pino
--        segue sozinho pelo gatilho municao_lead_mudou → municao_sincronizar_pino, que troca o
--        vendedor_id_hubspot do pino sem negócio) e cria a sugestão (origem 'resgate') no plano de quem roda lá;
--      · deixar_sair_recem_abertos(p_leads): a MESMA marca da expirar_recem_abertos das 06:40 (status 'expirado',
--        status_antes_de_expirar, expirado_em; o pino sem negócio e sem visita é arquivado), só para os escolhidos
--        e só para quem já está vencendo (76+ dias de abertura), sem visita e sem negócio.
--   5. DAR DONO. dar_dono_bairro(p_bairro, p_municipio, p_uf, p_rep): move o bairro no território oficial
--      (cockpit_config 'territorios', o mesmo que o roteador lê) para a área do executivo, SÓ se nenhum executivo
--      ativo cobre o bairro hoje (tira de '_sem_dono' e de quem tem ativo = false); antes guarda uma cópia inteira em
--      outra chave. Os recém-abertos pendentes daquele bairro passam a ser dele ('atribuido') e entram como sugestão
--      (origem 'dono_novo') na PRÓXIMA semana dele.
--
-- Nada aqui lê ou escreve no HubSpot. NÃO APLICADA: entra pelo fluxo de migrations de sempre.

-- ── 0 · as datas de Brasília e a chave de nome (sem a extensão unaccent) ──────────────────────────────────────
create or replace function public._territorio_hoje()
 returns date language sql stable set search_path = public as
$$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- a semana do plano: de segunda a sexta; no sábado e no domingo já é a próxima (a grade vira na sexta)
create or replace function public._territorio_semana(p_dia date)
 returns date language sql immutable as
$$ select case when extract(isodow from p_dia) in (6, 7) then (date_trunc('week', p_dia + 7))::date else (date_trunc('week', p_dia))::date end $$;

create or replace function public._territorio_chave(p text)
 returns text language sql immutable as
$$ select trim(regexp_replace(regexp_replace(lower(translate(coalesce(p, ''),
     'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
     '\s*\(.*\)\s*$', ''), '\s+', ' ', 'g')) $$;

-- ── 1 · a medição ───────────────────────────────────────────────────────────────────────────────────────────────
alter table public.aberturas_de_tela drop constraint if exists aberturas_de_tela_tela_check;
alter table public.aberturas_de_tela add constraint aberturas_de_tela_tela_check
  check (tela in ('meu_desempenho', 'desenvolvimento', 'folha_manha', 'toast_pos_visita', 'fecho_dia', 'hoje_cockpit', 'pessoas', 'pessoa', 'territorio'));
alter table public.aberturas_de_tela drop constraint if exists aberturas_de_tela_acao_check;
alter table public.aberturas_de_tela add constraint aberturas_de_tela_acao_check
  check (acao is null or acao in ('vista', 'ir_para_rua', 'depois', 'fechada_sem_acao', 'passo_marcado', 'marcou_passo', 'ignorou',
    'aberto', 'fechado', 'fechado_com_pendencia', 'definiu_carga', 'pos_no_plano', 'redistribuiu', 'deixou_sair', 'deu_dono'));

create or replace function public.registrar_abertura(p_tela text, p_origem text, p_acao text default null)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.aberturas_de_tela (pessoa, tela, origem, acao, alvo)
  select (select auth.uid()),
         case when p_tela like 'pessoa:%' then 'pessoa' else p_tela end,
         p_origem, p_acao,
         case when p_tela like 'pessoa:%' then split_part(p_tela, ':', 2) end
   where (select auth.uid()) is not null
     and (p_tela in ('meu_desempenho', 'desenvolvimento', 'folha_manha', 'toast_pos_visita', 'fecho_dia', 'hoje_cockpit', 'pessoas')
          or (p_tela ~ '^pessoa:[0-9A-Za-z_-]{1,40}$' and (select public.eh_gestor_cockpit()))
          or (p_tela = 'territorio' and (select public.eh_gestor_cockpit())))
     and p_origem in ('toast', 'pilula', 'push_seg', 'push_sex', 'menu', 'selo_menu', 'app', 'push_08', 'push_18', 'placa', 'mapa', 'link')
     and (p_acao is null or p_acao in ('vista', 'ir_para_rua', 'depois', 'fechada_sem_acao', 'passo_marcado', 'marcou_passo', 'ignorou',
       'aberto', 'fechado', 'fechado_com_pendencia', 'definiu_carga', 'pos_no_plano', 'redistribuiu', 'deixou_sair', 'deu_dono'));
$function$;

-- ── 2 · a carga por gestor ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.territorio_carga (
  gestor uuid primary key references auth.users (id) on delete cascade,
  carga integer not null check (carga between 1 and 12),
  atualizado_em timestamptz not null default now()
);
comment on table public.territorio_carga is
  'Território v3 (0248): recém-abertos por executivo, por semana, que cada gestor decidiu. Escrita só por definir_carga_territorio.';
alter table public.territorio_carga enable row level security;
drop policy if exists territorio_carga_select on public.territorio_carga;
create policy territorio_carga_select on public.territorio_carga for select to authenticated
  using (gestor = (select auth.uid()) and (select public.eh_gestor_cockpit()));

create or replace function public.definir_carga_territorio(p_carga integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor define a carga' using errcode = '42501'; end if;
  if p_carga is null or p_carga < 1 or p_carga > 12 then raise exception 'a carga vai de 1 a 12' using errcode = '22023'; end if;
  insert into public.territorio_carga (gestor, carga, atualizado_em) values (auth.uid(), p_carga, now())
  on conflict (gestor) do update set carga = excluded.carga, atualizado_em = now();
  return p_carga;
end;
$function$;

-- ── 3 · as sugestões ────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.territorio_sugestoes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads_prospeccao (id) on delete cascade,
  owner_id text not null,
  origem text not null check (origem in ('carga', 'gestor', 'resgate', 'dono_novo')),
  semana date not null,
  vale_ate date not null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  confirmada_em timestamptz,
  unique (lead_id, semana)
);
comment on table public.territorio_sugestoes is
  'Território v3 (0248): recém-abertos que o gestor sugeriu para o plano da semana. Não é a grade: o executivo confirma no Planejamento. Sem confirmação até vale_ate (a sexta), a sugestão deixa de valer e o lead volta à ordem normal do motor.';
create index if not exists territorio_sugestoes_dono on public.territorio_sugestoes (owner_id, vale_ate);
alter table public.territorio_sugestoes enable row level security;
drop policy if exists territorio_sugestoes_select on public.territorio_sugestoes;
create policy territorio_sugestoes_select on public.territorio_sugestoes for select to authenticated
  using ((select public.eh_gestor_cockpit()) or owner_id = (select public.meu_owner_hubspot()));

-- o executivo ativo dono de um id do HubSpot (o mesmo critério do pino da munição)
create or replace function public._territorio_ativo(p_owner text)
 returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
                  where e.ativo and not e.so_acesso and p.id_hubspot = p_owner) $$;

-- o miolo: cria a sugestão dos leads (com dono ativo, ainda livres, sem negócio) para a semana dada
create or replace function public._territorio_sugerir(p_leads uuid[], p_origem text, p_semana date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v integer := 0;
begin
  insert into public.territorio_sugestoes (lead_id, owner_id, origem, semana, vale_ate, criado_por)
  select lp.id, lp.responsavel_owner_id, p_origem, p_semana, p_semana + 4, auth.uid()
    from public.leads_prospeccao lp
   where lp.id = any(p_leads)
     and lp.status = 'atribuido'
     and nullif(trim(coalesce(lp.hubspot_deal_id, '')), '') is null
     and public._territorio_ativo(lp.responsavel_owner_id)
  on conflict (lead_id, semana) do nothing;
  get diagnostics v = row_count;
  return v;
end;
$function$;

create or replace function public.sugerir_no_plano(p_leads uuid[], p_origem text default 'carga')
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor sugere no plano' using errcode = '42501'; end if;
  if p_origem not in ('carga', 'gestor') then raise exception 'origem inválida' using errcode = '22023'; end if;
  return public._territorio_sugerir(p_leads, p_origem, public._territorio_semana(public._territorio_hoje()));
end;
$function$;

create or replace function public.retirar_sugestoes_territorio(p_semana date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v integer := 0;
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor retira sugestões' using errcode = '42501'; end if;
  delete from public.territorio_sugestoes where semana = p_semana and confirmada_em is null;
  get diagnostics v = row_count;
  return v;
end;
$function$;

create or replace function public.confirmar_sugestao_territorio(p_lead uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v integer := 0;
begin
  update public.territorio_sugestoes
     set confirmada_em = now()
   where lead_id = p_lead and owner_id = public.meu_owner_hubspot() and confirmada_em is null and vale_ate >= public._territorio_hoje();
  get diagnostics v = row_count;
  return v;
end;
$function$;

-- ── 4 · o resgate ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.redistribuir_recem_abertos(p_leads uuid[], p_para text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ids uuid[];
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor redistribui' using errcode = '42501'; end if;
  if not public._territorio_ativo(p_para) then raise exception 'o destino não é um executivo ativo' using errcode = '22023'; end if;
  -- só recém-aberto da Casa dos Dados, ainda livre, sem negócio e sem visita no pino (a régua da expiração)
  select coalesce(array_agg(lp.id), '{}') into v_ids
    from public.leads_prospeccao lp
   where lp.id = any(p_leads)
     and lp.status in ('pendente', 'atribuido')
     and lp.fonte ilike '%casa dos dados%'
     and nullif(trim(coalesce(lp.hubspot_deal_id, '')), '') is null
     and not exists (select 1 from public.clients c where c.lead_prospeccao_id = lp.id
                      and (nullif(trim(coalesce(c.id_hubspot, '')), '') is not null
                           or exists (select 1 from public.client_visits cv where cv.client_id = c.id)));
  -- o dono muda só quando é outro; o pino segue pelo gatilho municao_lead_mudou
  update public.leads_prospeccao
     set responsavel_owner_id = p_para, status = 'atribuido', updated_at = now()
   where id = any(v_ids) and (responsavel_owner_id is distinct from p_para or status <> 'atribuido');
  -- sugestão de outra pessoa para estes leads sai; a nova entra no plano de quem roda lá
  delete from public.territorio_sugestoes where lead_id = any(v_ids) and owner_id <> p_para and confirmada_em is null;
  perform public._territorio_sugerir(v_ids, 'resgate', public._territorio_semana(public._territorio_hoje()));
  return coalesce(array_length(v_ids, 1), 0);
end;
$function$;

create or replace function public.deixar_sair_recem_abertos(p_leads uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids uuid[];
  v_leads integer := 0;
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor deixa sair' using errcode = '42501'; end if;
  -- a mesma seleção da expirar_recem_abertos, com 76 dias (vencendo) em vez de 90, e só os escolhidos
  select coalesce(array_agg(lp.id), '{}') into v_ids
    from public.leads_prospeccao lp
   where lp.id = any(p_leads)
     and lp.status in ('atribuido', 'pendente')
     and lp.fonte ilike '%casa dos dados%'
     and lp.data_abertura is not null
     and lp.data_abertura < now() - interval '76 days'
     and nullif(trim(coalesce(lp.hubspot_deal_id, '')), '') is null
     and not exists (
       select 1 from public.clients c
        where c.lead_prospeccao_id = lp.id
          and (nullif(trim(coalesce(c.id_hubspot, '')), '') is not null
               or exists (select 1 from public.client_visits v where v.client_id = c.id)));

  update public.leads_prospeccao
     set status_antes_de_expirar = status, status = 'expirado', expirado_em = now(), updated_at = now()
   where id = any(v_ids);
  get diagnostics v_leads = row_count;

  update public.clients c
     set is_archived = true,
         tags = case when 'expirado_90d' = any(coalesce(c.tags, '{}')) then c.tags else array_append(coalesce(c.tags, '{}'), 'expirado_90d') end,
         updated_at = now()
   where c.lead_prospeccao_id = any(v_ids)
     and not coalesce(c.is_archived, false)
     and nullif(trim(coalesce(c.id_hubspot, '')), '') is null
     and not exists (select 1 from public.client_visits v where v.client_id = c.id);

  delete from public.territorio_sugestoes where lead_id = any(v_ids) and confirmada_em is null;
  return v_leads;
end;
$function$;

-- ── 5 · dar dono a um bairro sem dono ───────────────────────────────────────────────────────────────────────────
create or replace function public.dar_dono_bairro(p_bairro text, p_municipio text, p_uf text, p_rep text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_conf jsonb;
  v_terrs jsonb := '[]'::jsonb;
  v_sem jsonb := '[]'::jsonb;
  v_t jsonb;
  v_a jsonb;
  v_areas jsonb;
  v_bairros jsonb;
  v_achou_rep boolean := false;
  v_achou_area boolean;
  v_kb text := public._territorio_chave(p_bairro);
  v_km text := public._territorio_chave(p_municipio);
  v_kr text := public._territorio_chave(p_rep);
  v_owner text;
  v_backup text;
  v_ids uuid[];
  v_sug integer := 0;
begin
  if not coalesce(public.eh_gestor_cockpit(), false) then raise exception 'só o gestor dá dono a bairro' using errcode = '42501'; end if;
  if v_kb = '' or v_km = '' or v_kr = '' then raise exception 'bairro, município e executivo são obrigatórios' using errcode = '22023'; end if;

  select p.id_hubspot into v_owner
    from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
   where e.ativo and not e.so_acesso and public._territorio_chave(coalesce(nullif(e.nome, ''), p.full_name)) = v_kr
   limit 1;
  if v_owner is null then raise exception 'o executivo não está ativo no time' using errcode = '22023'; end if;

  select conteudo into v_conf from public.cockpit_config where chave = 'territorios' for update;
  if v_conf is null then raise exception 'território oficial não encontrado' using errcode = 'P0002'; end if;

  -- 1. ninguém ativo cobre o bairro hoje (nem pelo município inteiro)
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_conf -> 'territorios', '[]'::jsonb)) t, jsonb_array_elements(coalesce(t -> 'areas', '[]'::jsonb)) a
     where coalesce((t ->> 'ativo')::boolean, true)
       and public._territorio_chave(a ->> 'municipio') = v_km
       and (a ->> 'ate' is null or (a ->> 'ate')::date > public._territorio_hoje())
       and (coalesce((a ->> 'todoOMunicipio')::boolean, false)
            or exists (select 1 from jsonb_array_elements_text(coalesce(a -> 'bairros', '[]'::jsonb)) b where public._territorio_chave(b) = v_kb))) then
    raise exception 'o bairro já tem dono ativo' using errcode = '23505';
  end if;

  -- 2. a cópia inteira antes de mexer
  v_backup := 'territorios_backup_dar_dono_' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY_MM_DD_HH24MISS');
  insert into public.cockpit_config (chave, conteudo, atualizado_em, origem)
  values (v_backup, v_conf, now(), 'cópia antes de dar dono a ' || p_bairro || ' (' || p_municipio || ')')
  on conflict (chave) do nothing;

  -- 3. o bairro sai de quem tem ativo = false e entra na área do executivo
  for v_t in select value from jsonb_array_elements(coalesce(v_conf -> 'territorios', '[]'::jsonb)) loop
    if not coalesce((v_t ->> 'ativo')::boolean, true) then
      v_areas := '[]'::jsonb;
      for v_a in select value from jsonb_array_elements(coalesce(v_t -> 'areas', '[]'::jsonb)) loop
        if public._territorio_chave(v_a ->> 'municipio') = v_km and v_a ? 'bairros' then
          v_a := jsonb_set(v_a, '{bairros}', coalesce((select jsonb_agg(b) from jsonb_array_elements_text(v_a -> 'bairros') b where public._territorio_chave(b) <> v_kb), '[]'::jsonb));
        end if;
        v_areas := v_areas || jsonb_build_array(v_a);
      end loop;
      v_t := jsonb_set(v_t, '{areas}', v_areas);
    elsif public._territorio_chave(v_t ->> 'rep') = v_kr and not v_achou_rep then
      v_achou_rep := true;
      v_achou_area := false;
      v_areas := '[]'::jsonb;
      for v_a in select value from jsonb_array_elements(coalesce(v_t -> 'areas', '[]'::jsonb)) loop
        if not v_achou_area and public._territorio_chave(v_a ->> 'municipio') = v_km and v_a ->> 'ate' is null
           and not coalesce((v_a ->> 'todoOMunicipio')::boolean, false) then
          v_bairros := coalesce(v_a -> 'bairros', '[]'::jsonb) || jsonb_build_array(p_bairro);
          v_a := jsonb_set(v_a, '{bairros}', v_bairros, true);
          v_achou_area := true;
        end if;
        v_areas := v_areas || jsonb_build_array(v_a);
      end loop;
      if not v_achou_area then
        v_areas := v_areas || jsonb_build_array(jsonb_build_object('uf', p_uf, 'municipio', p_municipio, 'bairros', jsonb_build_array(p_bairro)));
      end if;
      v_t := jsonb_set(v_t, '{areas}', v_areas);
    end if;
    v_terrs := v_terrs || jsonb_build_array(v_t);
  end loop;
  if not v_achou_rep then raise exception 'o executivo não tem entrada no território oficial' using errcode = 'P0002'; end if;

  -- _sem_dono: sai o bairro (string ou objeto com "bairro")
  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_sem
    from jsonb_array_elements(coalesce(v_conf -> '_sem_dono', '[]'::jsonb)) s
   where public._territorio_chave(case when jsonb_typeof(s) = 'string' then s #>> '{}' else s ->> 'bairro' end) <> v_kb;

  v_conf := jsonb_set(jsonb_set(jsonb_set(v_conf, '{territorios}', v_terrs), '{_sem_dono}', v_sem), '{atualizado_em}', to_jsonb(public._territorio_hoje()::text));
  update public.cockpit_config
     set conteudo = v_conf, atualizado_em = now(), origem = 'Cockpit · Território v3: ' || p_bairro || ' (' || p_municipio || ') para ' || p_rep
   where chave = 'territorios';

  -- 4. os recém-abertos pendentes do bairro passam a ser dele e entram como sugestão na PRÓXIMA semana
  select coalesce(array_agg(lp.id), '{}') into v_ids
    from public.leads_prospeccao lp
   where lp.fonte ilike '%casa dos dados%'
     and lp.status in ('pendente', 'atribuido')
     and lp.data_abertura > now() - interval '90 days'
     and public._territorio_chave(lp.bairro) = v_kb
     and public._territorio_chave(lp.cidade) = v_km
     and nullif(trim(coalesce(lp.hubspot_deal_id, '')), '') is null
     and (lp.responsavel_owner_id is null or not public._territorio_ativo(lp.responsavel_owner_id));
  update public.leads_prospeccao set responsavel_owner_id = v_owner, status = 'atribuido', updated_at = now() where id = any(v_ids);
  v_sug := public._territorio_sugerir(v_ids, 'dono_novo', public._territorio_semana(public._territorio_hoje()) + 7);

  return jsonb_build_object('bairro', p_bairro, 'municipio', p_municipio, 'rep', p_rep, 'leads', coalesce(array_length(v_ids, 1), 0), 'sugestoes', v_sug, 'copia', v_backup);
end;
$function$;

-- ── 6 · quem pode chamar ────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._territorio_sugerir(uuid[], text, date) from public, anon, authenticated;
revoke all on function public._territorio_ativo(text) from public, anon;
revoke all on function public.definir_carga_territorio(integer) from public, anon;
revoke all on function public.sugerir_no_plano(uuid[], text) from public, anon;
revoke all on function public.retirar_sugestoes_territorio(date) from public, anon;
revoke all on function public.confirmar_sugestao_territorio(uuid) from public, anon;
revoke all on function public.redistribuir_recem_abertos(uuid[], text) from public, anon;
revoke all on function public.deixar_sair_recem_abertos(uuid[]) from public, anon;
revoke all on function public.dar_dono_bairro(text, text, text, text) from public, anon;
grant execute on function public._territorio_ativo(text) to authenticated;
grant execute on function public.definir_carga_territorio(integer) to authenticated;
grant execute on function public.sugerir_no_plano(uuid[], text) to authenticated;
grant execute on function public.retirar_sugestoes_territorio(date) to authenticated;
grant execute on function public.confirmar_sugestao_territorio(uuid) to authenticated;
grant execute on function public.redistribuir_recem_abertos(uuid[], text) to authenticated;
grant execute on function public.deixar_sair_recem_abertos(uuid[]) to authenticated;
grant execute on function public.dar_dono_bairro(text, text, text, text) to authenticated;
revoke all on public.territorio_carga from anon;
revoke all on public.territorio_sugestoes from anon;
grant select on public.territorio_carga to authenticated;
grant select on public.territorio_sugestoes to authenticated;
