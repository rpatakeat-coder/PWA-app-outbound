-- O MOTIVO EM TODA SAÍDA DO PLANO (15/11/26)
--
-- Medido em 14/11: 28 paradas de volta saíram do plano em novembro com motivo_remocao vazio. O app
-- só perguntava na Agenda (0220). A partir de hoje todo caminho do app manda o motivo (perguntado
-- num toque, ou o que o app já sabe: outro_dia, perdido, descartada, desfeito). Falta o lado do
-- banco, que este gatilho cobre:
--
--   1. Parada que sai pelo Planejamento do Cockpit. Quem a tira é plano_para_rota, chamada pelo
--      gatilho plano_mudou de planos_semanais: a atualização chega aqui ANINHADA (pg_trigger_depth
--      maior que 1). Sem motivo próprio, fica 'cockpit'. O app escreve direto (profundidade 1) e
--      nunca cai aqui.
--   2. Parada que VOLTA ao plano. A linha é a mesma (rota + lead é único) e ressuscitava com o
--      motivo da saída antiga. Voltou, o motivo some.
--
-- É a mesma função da 0166 (parada que sai perde o cadeado), com as duas regras a mais. O gatilho
-- continua "before update of status": nada muda para quem não mexe no status.

create or replace function public.tg_parada_sai_sem_cadeado() returns trigger
language plpgsql as $$
begin
  if new.status = 'removed' and new.horario_fixo is not null then
    new.horario_fixo := null;
  end if;
  if new.status = 'removed' and old.status is distinct from 'removed' then
    if new.motivo_remocao is not distinct from old.motivo_remocao then
      -- quem tirou não disse o motivo nesta atualização: o que estava na linha é de outra saída
      new.motivo_remocao := case when pg_trigger_depth() > 1 then 'cockpit' else null end;
    end if;
  elsif new.status is distinct from 'removed' and old.status = 'removed' then
    new.motivo_remocao := null;
  end if;
  return new;
end; $$;

comment on column public.field_route_stops.motivo_remocao is
  'Por que a parada saiu do plano. Perguntado no app: fechado | sem_tempo | outro_dia | nao_vale. Sabido pelo app: perdido | descartada | desfeito. Escrito pelo banco: cockpit (tirada no Planejamento). Vazio = versão antiga do app (0220, 0265).';
