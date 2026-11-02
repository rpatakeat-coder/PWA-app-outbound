// A MEDIÇÃO DO MAPA (prancha "Mapa do Executivo", §4c e decisões 5 e 6, 15/10/26): o que diz se
// o mapa novo vende mais. Cada evento vira uma linha em public.eventos_do_mapa (0202):
// - primeiro_toque: do mapa aberto até o 1º Ir ou Cheguei (meta < 3 s);
// - fala_aberta: tocou em "Fala pronta ›" ou "Playbook ›" (gatilho_id);
// - halo_sugerido / halo_aceito: a porta sugerida depois do plano e se virou Cheguei em 30 min.
//
// Nunca trava nada: sem sinal, sem a tabela (migration ainda não aplicada) ou com erro, o evento
// se perde em silêncio. Medição é bônus, a venda não espera por ela.
import { supabase } from '../integrations/supabase/client';

// 'se_ele_disser_aberto' (espinha do dia §5, 29/10/26): quantos toques a resposta
// na porta recebe por página — é o KPI que diz se o bloco serve ou é enfeite.
// A FOLHA DE ABERTURA DO DIA (espinha do dia §5, 29/10/26). Sem estes três não há
// como responder a pergunta que importa daqui a duas semanas: a folha fez alguém
// planejar, ou virou mais um aviso bonito que se fecha no reflexo? `confirmado`
// contra `ignorado` é a resposta, e `proposto` é o denominador.
export type TipoEvento = 'primeiro_toque' | 'fala_aberta' | 'halo_sugerido' | 'halo_aceito' | 'referencia_tocada'
  | 'se_ele_disser_aberto'
  | 'plano_proposto' | 'plano_confirmado' | 'plano_ignorado'
  /* O MAPA NA RUA (prancha "Mapa na rua", 02/11/26). Em 2 semanas: % de sessões com toque na Lista,
     toques em pino N3 (se caírem muito, o N3 está quieto demais) e tempo do mapa aberto ao 1º Ir ou
     Cheguei (primeiro_toque). ATENÇÃO: o CHECK de eventos_do_mapa.tipo ainda não aceita estes cinco
     (precisa de migração que amplie a lista); até lá o insert é recusado e o evento se perde em
     silêncio, como manda a regra acima — nada trava.
     - mapa_render {zoom, modo, n2_nomes, n3_pinos, rotulos_descartados, n1, n1_rotulo, largura, fonte}
     - pino_toque {nivel, familia}
     - pilha_abrir {n}
     - alternador {para: 'lista' | 'mapa'}
     - lista_linha_toque {grupo: 'proxima' | 'perto' | 'resto'} */
  | 'mapa_render' | 'pino_toque' | 'pilha_abrir' | 'alternador' | 'lista_linha_toque';

let desligado = false;

export function registrarEvento(tipo: TipoEvento, dados: Record<string, unknown> = {}): void {
  if (desligado) return;
  try {
    void Promise.resolve(supabase.from('eventos_do_mapa').insert({ tipo, dados })).then(({ error }) => {
      // tabela que não existe (42P01 / PGRST205): para de tentar nesta sessão
      const cod = (error as { code?: string } | null)?.code;
      if (cod === '42P01' || cod === 'PGRST205' || cod === 'PGRST204') desligado = true;
    }, () => { /* sem sinal: perde o evento */ });
  } catch { /* nunca derruba a tela */ }
}

// O relógio do "primeiro toque": zera quando o mapa abre e só conta o primeiro Ir/Cheguei.
let abertoEm: number | null = null;
export function mapaAbriu(): void { abertoEm = Date.now(); }
export function primeiroToque(acao: 'ir' | 'cheguei'): void {
  if (abertoEm == null) return;
  const ms = Date.now() - abertoEm;
  abertoEm = null;
  registrarEvento('primeiro_toque', { acao, ms });
}
