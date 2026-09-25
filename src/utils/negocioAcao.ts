// Porta única de escrita do Cockpit dentro do app: POST cockpit-api/negocio-acao
// (prompt final corrigido: "toda escrita passa por /api/negocio-acao → HubSpot").
//
// Contrato (bundle cockpit.js, 25/09/2026): Authorization Bearer do usuário;
// corpo { op, ... }; sucesso { ok: true, ... }; erro { erro: string } com o
// status do servidor (403 "Esse negócio não é seu…", 400 "A etapa de destino
// exige: …", 400 "…não permite pular fases…").

import { supabase } from '../integrations/supabase/client';
import { ehErroDeRede } from './filaOffline';

export type RespostaNegocio = { ok: true; [k: string]: unknown };

export class RecusaDoServidor extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

export async function negocioAcao(corpo: Record<string, unknown>): Promise<RespostaNegocio> {
  const { data, error } = await supabase.functions.invoke('cockpit-api/negocio-acao', { body: corpo });
  if (error) {
    // Erro HTTP: a mensagem do servidor vem no corpo ({ erro }). Rede: repassa
    // como está, para a fila offline reconhecer e guardar.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      let msg = error.message;
      try {
        const j = await ctx.clone().json();
        msg = (j && (j.erro || j.error || j.message)) || msg;
      } catch { /* corpo não-JSON */ }
      throw new RecusaDoServidor(String(msg), ctx.status ?? 400);
    }
    throw error;
  }
  if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === false) {
    throw new RecusaDoServidor(String((data as { erro?: string }).erro ?? 'O servidor recusou.'), 400);
  }
  return data as RespostaNegocio;
}

/** Recusa de regra (não adianta tentar de novo) × falta de sinal (fila). */
export function ehRecusa(err: unknown): err is RecusaDoServidor {
  return err instanceof RecusaDoServidor && !ehErroDeRede(err);
}
