// TODO LEAD PLANEJADO ENTRA NO FUNIL (16/10/26, Julyan: "quero q tudo entre em prospecção, tanto no
// app, quanto cockpit"). Pôr no plano um pino sem negócio deixava a conta só na rota: a visita
// contava, mas o lead ficava fora do funil, do Cobrar e do Cockpit. Agora o plano e a ficha criam o
// negócio em Prospecção (o create_pin de sempre, o mesmo do "É meu"), com quem planeja como dono.
//
// Aqui só a REGRA, sem rede, para o teste rodar sem Supabase:
//   - quem já tem negócio não precisa de nada;
//   - só lead vira Prospecção: cliente da Takeat (visita de relacionamento) e churn não;
//   - conta que já é de outro executivo não muda de dono por um plano: avisa e não cria;
//   - sem dono no HubSpot (id_hubspot do perfil) não há como criar.
import type { Client } from '../types/client';

export type Eu = { idHubspot: string | null; nome: string | null };

export type Decisao =
  | { criar: false; motivo: null }      // já tem negócio: nada a fazer, nada a avisar
  | { criar: false; motivo: string }    // não cria, e a tela diz por quê
  | { criar: true; motivo: null };

export function decidirProspeccao(c: Pick<Client, 'id_hubspot' | 'status' | 'vendedor_id_hubspot'>, eu: Eu, nomeDoDono?: string | null): Decisao {
  if (c.id_hubspot) return { criar: false, motivo: null };
  if (c.status && c.status !== 'lead') return { criar: false, motivo: null };
  if (!eu.idHubspot) return { criar: false, motivo: 'seu usuário não tem dono no HubSpot, então o lead não entrou no funil (peça para a gestão corrigir em Acessos)' };
  if (c.vendedor_id_hubspot && String(c.vendedor_id_hubspot) !== String(eu.idHubspot)) {
    return { criar: false, motivo: `a conta é de ${nomeDoDono || 'outro executivo'}: o negócio não foi criado no seu nome` };
  }
  return { criar: true, motivo: null };
}
