// Ponto de contato de campo (0144, 28/09/2026): ligação registrada e WhatsApp aberto
// pelo app. É o losango âmbar do dossiê de campo no Planejamento do gestor.
//
// Até aqui o contato não ficava em lugar nenhum com data e canal: o Liguei concluía a
// tarefa no HubSpot e a nota chegava sem dono. Esta linha é complemento — se falhar,
// a ligação e a conclusão continuam valendo, e nada aparece para o executivo.
//
// `acaoId` torna a gravação idempotente: a fila offline repete o pedido inteiro da
// conclusão, e a segunda tentativa não duplica o contato.
import { supabase } from '../integrations/supabase/client';

export type Contato = {
  canal: 'ligacao' | 'whatsapp';
  acaoId?: string | null;
  clientId?: string | null;
  dealId?: string | null;
  ownerId?: string | null;
  resultado?: string | null;
  /** Quando o contato aconteceu. Vai no pedido desde o toque: a fila offline pode subir no
   *  dia seguinte, e o contato cairia no dia errado do dossiê. */
  em?: string | null;
};

export async function gravarContato(c: Contato): Promise<void> {
  try {
    const linha = {
      canal: c.canal,
      acao_id: c.acaoId ?? null,
      client_id: c.clientId ?? null,
      deal_id: c.dealId ? String(c.dealId) : null,
      owner_id: c.ownerId ? String(c.ownerId) : null,
      resultado: c.resultado ?? null,
      ocorrido_em: c.em ?? new Date().toISOString(),
    };
    if (linha.acao_id) await supabase.from('contatos_de_campo').upsert(linha, { onConflict: 'acao_id', ignoreDuplicates: true });
    else await supabase.from('contatos_de_campo').insert(linha);
  } catch {
    // complemento: nunca derruba o registro principal
  }
}
