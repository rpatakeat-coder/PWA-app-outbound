-- ============================================================================
-- planos_semanais: a policy de DELETE que faltou
-- ============================================================================
--
-- A migration 20260914_planos_semanais.sql criou select, insert e update e
-- esqueceu o delete. O efeito nao e' um erro visivel: sem policy, o PostgREST
-- afeta ZERO linhas e responde 204 assim mesmo. Quem apaga recebe "sucesso" e
-- a linha continua la'.
--
-- Isso ja' custou uma medida errada: uma limpeza de teste foi dada como feita
-- olhando o codigo de retorno, e a linha sobreviveu.
--
-- Quem apaga e' o DONO do plano. O gestor le' (planejar e' assunto do 1:1) mas
-- nao apaga: descartar o plano da semana de alguem e' decisao de quem vai
-- percorrer a rua.
-- ============================================================================

drop policy if exists planos_semanais_delete on public.planos_semanais;
create policy planos_semanais_delete on public.planos_semanais
  for delete to authenticated using (seller_id = auth.uid());

-- Mesma revisao nas outras tabelas desta leva. `modos_de_agir` e
-- `pauta_do_lider` ja' tinham (o `for all` do modos cobre delete, e a pauta
-- tem policy propria — e' o que faz o clique repetido funcionar como
-- interruptor). Aqui ficam as que estavam na mesma situacao:

-- PDI: quem escreveu o plano pode desfaze-lo.
drop policy if exists pdi_documentos_delete on public.pdi_documentos;
create policy pdi_documentos_delete on public.pdi_documentos
  for delete to authenticated using ((select public.is_field_admin()));

-- Comunicado: so' gestor, e o `for all` de comunicados_escrita ja' cobre.
-- comunicados_lidos NAO ganha delete de proposito: "eu tinha lido e agora nao
-- tinha" nao e' uma coisa que exista. A confirmacao e' um fato datado.

-- fila_pwa: o dono do aparelho pode limpar o proprio relato.
drop policy if exists fila_pwa_delete on public.fila_pwa;
create policy fila_pwa_delete on public.fila_pwa
  for delete to authenticated using (seller_id = auth.uid());

-- playbook_progresso ja' tem delete proprio (desmarcar um guia).
-- playbook_copias NAO ganha: o agregado de uso nao se edita.
