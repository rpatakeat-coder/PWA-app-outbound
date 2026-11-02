-- 0246 · Os eventos do "mapa na rua" (design_handoff_mapa_na_rua, 02/11/26)
--
-- O app passou a medir o mapa no zoom de rua: mapa_render (zoom, modo, quantos nomes e pinos, rótulos
-- descartados), pino_toque (nível e família), pilha_abrir, alternador (Mapa | Lista) e lista_linha_toque
-- (grupo). Sem isto o insert é recusado (23514) e o app engole o erro: a medição do handoff nasce vazia.
-- Os 9 tipos de antes continuam.
alter table public.eventos_do_mapa drop constraint if exists eventos_do_mapa_tipo_check;
alter table public.eventos_do_mapa add constraint eventos_do_mapa_tipo_check
  check (tipo in ('primeiro_toque', 'fala_aberta', 'halo_sugerido', 'halo_aceito', 'referencia_tocada',
                  'se_ele_disser_aberto', 'plano_proposto', 'plano_confirmado', 'plano_ignorado',
                  'mapa_render', 'pino_toque', 'pilha_abrir', 'alternador', 'lista_linha_toque'));
