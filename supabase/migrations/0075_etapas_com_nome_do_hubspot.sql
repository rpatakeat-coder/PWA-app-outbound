-- ============================================================================
-- clients.etapa: passa a usar o nome REAL do HubSpot
-- ============================================================================
--
-- O app renomeava tres etapas do pipeline Field Sales:
--
--   HubSpot        app (ate' hoje)
--   Pagamento      Ag. Pagamento
--   Ganho          Negocio Fechado
--   Onboarding     Enviado Onboarding
--
-- E o app resolve etapa por ROTULO. Toda vez que algo gravava o nome do
-- HubSpot em `clients.etapa` -- a reconciliacao pos-mudanca fazia isso ha'
-- muito tempo -- o lead deixava de casar com qualquer etapa conhecida e ia
-- parar no balde "Pipe Antigo" da lista, longe de onde deveria estar. Foi o
-- que aconteceu com "Coco e Tiny" em 14/09/2026: movido pra Ganho, sumiu da
-- etapa certa.
--
-- O codigo passou a usar os nomes do HubSpot (src/constants/stages.ts). Esta
-- migration alinha o que JA' esta' gravado -- sem ela a troca inverte o
-- problema: os leads ANTIGOS e' que passariam a nao casar com nada.
--
-- RODAR JUNTO COM O DEPLOY DO APP. Entre um e outro, o lado que nao foi
-- atualizado ve' os nomes do outro.
-- ============================================================================

update public.clients set etapa = 'Pagamento'  where etapa = 'Ag. Pagamento';
update public.clients set etapa = 'Ganho'      where etapa = 'Negócio Fechado';
update public.clients set etapa = 'Onboarding' where etapa = 'Enviado Onboarding';

-- Confere o resultado: as tres devem voltar ZERO linhas.
--   select etapa, count(*) from public.clients
--    where etapa in ('Ag. Pagamento', 'Negócio Fechado', 'Enviado Onboarding')
--    group by etapa;
