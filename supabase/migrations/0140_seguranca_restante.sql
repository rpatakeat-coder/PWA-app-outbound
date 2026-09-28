-- 0140 · O resto do advisor de segurança (28/09/2026, Julyan: "bora fazer tudo")
--
-- 1. Duas tabelas de backup de 31/07 sem RLS (nível ERROR): qualquer pessoa com a chave
--    anônima lia e escrevia nelas pela API. Com RLS e sem política, a API não vê nada;
--    service_role (robôs, SQL Editor) continua vendo.
-- 2. Sete funções auxiliares sem search_path fixo: quem cria objeto num schema do
--    caminho poderia sequestrá-las. Nenhuma usa extensão fora de pg_catalog.
-- 3. Funções de GATILHO e a sync_stage_property_options executáveis sem login pela API.
--    Gatilho chamado direto só dá erro, mas não há razão para o papel anon alcançá-las;
--    o disparo do gatilho não depende desse privilégio. sync_stage_property_options:
--    quem chama é robô com service_role (axios, medido nos logs de 24 h).
-- Ficam: as auxiliares das políticas (is_field_admin, is_view_only_user,
-- can_view_metrics, eh_gestor_cockpit, meu_owner_hubspot) — só dizem algo do próprio
-- usuário, e sem login não revelam nada. pg_net no schema public também fica: movê-lo
-- arrisca os robôs que chamam as funções por net.http_post, por um ganho pequeno.

-- ── 1 ─────────────────────────────────────────────────────────────────────────────
alter table public.bkp_atualizacao_diaria_20260731 enable row level security;
alter table public.bkp_etapas_pre_varredura_20260731 enable row level security;

-- ── 2 ─────────────────────────────────────────────────────────────────────────────
alter function public.add_business_days(timestamp with time zone, integer) set search_path = public, extensions, pg_temp;
alter function public.business_days_between(timestamp with time zone, timestamp with time zone) set search_path = public, extensions, pg_temp;
alter function public.lugar_normalizado(text) set search_path = public, extensions, pg_temp;
alter function public.texto_normalizado(text) set search_path = public, extensions, pg_temp;
alter function public.motor_inativo_de(text) set search_path = public, extensions, pg_temp;
alter function public.municao_quer_pino(text) set search_path = public, extensions, pg_temp;
alter function public.origem_lead_da_fonte(text) set search_path = public, extensions, pg_temp;

-- ── 3 ─────────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.comunicados_lidos_ponte()', 'public.dailies_ponte_identidade()', 'public.etapa_do_pino_pelo_snapshot()',
    'public.lead_onboarding_vira_ganho_fs()', 'public.lead_respeita_motor()', 'public.motor_do_pino_mudou()',
    'public.pino_segue_situacao()', 'public.prevent_role_self_escalation()', 'public.rota_para_plano()',
    'public.set_client_updated_by()', 'public.tg_agendado_no_plano()',
    'public.tg_sinal_agenda()', 'public.tg_sinal_comunicado()', 'public.tg_sinal_ficha()', 'public.tg_sinal_foto()',
    'public.tg_sinal_negocio()', 'public.tg_sinal_parada()', 'public.tg_sinal_pdi()', 'public.tg_sinal_pino()',
    'public.tg_sinal_plano()', 'public.tg_sinal_recado()', 'public.tg_sinal_visita()',
    'public.sync_stage_property_options(jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
