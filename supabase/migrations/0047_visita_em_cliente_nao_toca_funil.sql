-- ============================================================================
-- Check-in em CLIENTE/CHURN nao pode gerar evento de funil.
--
-- Sintoma em producao: marcar como visitado um pin que ja e' CLIENTE movia o
-- deal dele no HubSpot de volta pra etapa "Visita" — ou seja, um cliente ativo
-- reentrava no funil de venda. A visita e' pos-venda (relacionamento/suporte),
-- nao evento comercial.
--
-- Causa: o app (useClients.markAsVisited) dispara um change_stage automatico
-- pra etapa "Visita" apos o check-in. O guard existente so' checava a POSICAO
-- no funil (nao regride quem ja passou de Visita) — e cliente/churn tem
-- clients.etapa = NULL ou uma etapa fora do funil, entao caia no ramo
-- "idxAtual === -1" e era tratado como lead novo entrando pela Visita.
--
-- Afetados (conferidos em client_stage_changes com origem='check_in_visita' e
-- status='cliente'): Kitanda Gastrobar (31/07), Arena 262 e Partei Steak &
-- Beer (03/08), Tiny Cafe (04/08).
--
-- REGRA: visitar um CLIENTE continua PERMITIDO — o vendedor precisa registrar
-- a passagem em campo (pos-venda). O que fica proibido e' o efeito colateral
-- no HubSpot: nenhum dado do deal de um cliente pode ser alterado pelo
-- check-in — nem etapa, nem propriedade. A visita vive so' no app
-- (client_visits + visited_at + visit_count), que ja e' o que alimenta o mapa,
-- o historico e as metricas do gestor.
--
-- Por isso mark_client_as_visited fica INTOCADA (sem guard de cliente/churn):
-- ela deve continuar registrando a visita normalmente pra qualquer status. O
-- bloqueio e' so' na porta do funil.
--
-- O fix principal e' no app (useClients.markAsVisited: nao dispara nem o
-- webhook type=visited nem o change_stage quando status != 'lead'). Esta
-- migration e' a rede de seguranca no banco, pra que a regressao nao volte
-- silenciosa por outro caminho:
--   1) Trigger em client_stage_changes: bloqueia INSERT de mudanca de etapa
--      pra registro que nao seja status='lead'.
--   2) Limpa o historico local dos clientes afetados (a etapa no app volta
--      pra NULL; o deal no HubSpot e' corrigido manualmente).
-- ============================================================================

-- ===== 1) Guard: mudanca de etapa so' existe pra lead =======================
-- client_stage_changes e' o espelho local do funil do HubSpot. Um registro
-- aqui pra um cliente/churn significa que o deal dele foi (ou vai ser) movido
-- no HubSpot — exatamente o bug. Bloqueia na origem.
CREATE OR REPLACE FUNCTION public.guard_stage_change_only_for_lead()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.clients WHERE id = NEW.client_id;

  -- Registro inexistente: deixa passar (a FK cuida disso).
  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_status <> 'lead' THEN
    RAISE EXCEPTION
      'Mudança de etapa não se aplica a registro com status "%" — etapa de funil só existe para lead. Visita em cliente é pós-venda e não move o deal no HubSpot.',
      v_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_stage_change_only_for_lead ON public.client_stage_changes;
CREATE TRIGGER guard_stage_change_only_for_lead
BEFORE INSERT ON public.client_stage_changes
FOR EACH ROW EXECUTE FUNCTION public.guard_stage_change_only_for_lead();

-- ===== 2) Repara o historico local dos clientes afetados ====================
-- Remove as mudancas de etapa que o check-in criou indevidamente em clientes.
DELETE FROM public.client_stage_changes sc
 USING public.clients c
 WHERE c.id = sc.client_id
   AND sc.sub_values->>'origem' = 'check_in_visita'
   AND c.status <> 'lead';

-- Zera a etapa de funil que ficou grudada nos clientes. Cliente ativo nao tem
-- etapa de funil de venda — o deal dele no HubSpot e' corrigido a parte.
-- NAO mexe em visited_at/visit_count/client_visits: a visita em si e' valida
-- e continua registrada.
UPDATE public.clients
   SET etapa = NULL,
       updated_at = now()
 WHERE status IN ('cliente', 'churn')
   AND etapa = 'Visita';

COMMENT ON FUNCTION public.guard_stage_change_only_for_lead() IS
  'Bloqueia INSERT em client_stage_changes para registro com status <> lead. Etapa de funil só existe para lead; visita em cliente é pós-venda e não pode alterar o deal no HubSpot.';
