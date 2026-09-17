-- Substitui o CHECK estático em clients.status (que listava
-- 'ativo','em_integracao','ex_cliente','lead') por uma FK para
-- client_statuses(slug). Assim, novos statuses cadastrados na tabela
-- viram válidos automaticamente — sem precisar de nova migration.

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_fkey
  FOREIGN KEY (status) REFERENCES public.client_statuses(slug)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT clients_status_fkey ON public.clients IS
  'Substitui o antigo CHECK fixo. Qualquer slug existente em client_statuses é aceito.';
