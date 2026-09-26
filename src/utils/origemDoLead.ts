// Origem do negócio que o app cria no HubSpot (picklist oficial
// `origem_do_lead` do deal; valores internos conferidos em 26/09/2026:
// Rua · Indicação · Casa dos Dados · Instagram · Ads · GoogleMaps · Familia · Eventos).
//
// O `create_pin` nasce de três caminhos: cadastro no app (o executivo está na
// rua), conta-alvo do Google que alguém assumiu, e reenvio. A origem sai do
// próprio lead, não de quem chamou.
import type { Client } from '../types/client';

export function origemDoLeadHs(c: Pick<Client, 'origem_lead' | 'conta_alvo_place_id'>): string {
  if (c.origem_lead === 'casa_dos_dados') return 'Casa dos Dados';
  if (c.origem_lead === 'indicacao') return 'Indicação';
  if (c.origem_lead === 'google_maps_motor' || c.conta_alvo_place_id) return 'GoogleMaps';
  return 'Rua';
}
