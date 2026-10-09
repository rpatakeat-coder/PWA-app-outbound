-- 0193 (09/10/26): o aviso de "visita em lead criado na hora" passa a olhar só as visitas SEM foto
-- da fachada (Julyan: "só sem foto"). O porta a porta com foto é legítimo — o Sérgio fez 7 portas
-- novas em 29 min, 5 com foto — e a foto é a prova de que a porta existe (a mesma régua do bônus).
-- planejamento_do_time ganha provadasLeadNovoSemFoto por dia; o resto fica idêntico.
do $mig$
declare d text;
begin
  select pg_get_functiondef('public.planejamento_do_time(date,text[],date)'::regprocedure) into d;
  if position('provadasLeadNovoSemFoto' in d) > 0 then return; end if;
  if position('as provadas_lead_novo,' in d) = 0 or position('''provadasLeadNovo'', pd.provadas_lead_novo,' in d) = 0 then
    raise exception '0193: planejamento_do_time mudou; revisar à mão';
  end if;
  d := replace(d, 'as provadas_lead_novo,',
    'as provadas_lead_novo,' || E'\n'
    || '      (select count(*) from vis where vis.owner_id = pe.dono and vis.dia = d.dia and vis.provada and vis.criado_na_hora and vis.foto_id is null) as provadas_lead_novo_sem_foto,');
  d := replace(d, '''provadasLeadNovo'', pd.provadas_lead_novo,',
    '''provadasLeadNovo'', pd.provadas_lead_novo, ''provadasLeadNovoSemFoto'', pd.provadas_lead_novo_sem_foto,');
  execute d;
end
$mig$;
