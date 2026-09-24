// Busca os candidatos a duplicata direto no Supabase.
//
// DIRETO NO BANCO, de proposito. A lista `clients` que o app tem em memoria e'
// so' a area visivel do mapa (bounds) — procurar duplicata ali acharia apenas
// o que ja' esta' na tela, que e' justamente o que o vendedor ja' enxerga.
// O lead que veio do HubSpot e ele nao viu pode estar fora do viewport.
//
// Isto tambem passa por fora do recorte de `sector_visibility`: aquele filtro
// vive na consulta do useClients, nao no RLS (conferido em 24/09/2026 — a
// conta de setor "Geral" le' as 1.351 linhas com status 'lead' pelo PostgREST,
// e mesmo assim a tela diz "seu setor nao ve Lead"). Entao o aviso funciona
// ate' pra quem nao enxerga o lead na lista — que e' exatamente quem mais
// precisa dele.
import { supabase } from '../integrations/supabase/client';
import { caixaDeBusca, digitosDoTelefone, parecidos, type LeadExistente, type LeadNovo, type Parecido } from './leadDuplicado';

const COLUNAS = 'id, nome, empresa, telefone, latitude, longitude, etapa, id_hubspot, created_at';
/** Teto por consulta: a caixa e' pequena, mas um centro de cidade pode ser denso. */
const LIMITE = 60;

export async function buscarLeadsParecidos(novo: LeadNovo): Promise<Parecido[]> {
  const caixa = caixaDeBusca(novo.latitude, novo.longitude);
  const fone = digitosDoTelefone(novo.telefone);

  // Duas consultas em vez de um `or`: a da caixa usa indice em lat/lon, e a do
  // telefone precisa varrer sem caixa nenhuma (o Salseiro duplicou a 33 km).
  const porPerto = supabase
    .from('clients')
    .select(COLUNAS)
    .eq('is_archived', false)
    .gte('latitude', caixa.latMin)
    .lte('latitude', caixa.latMax)
    .gte('longitude', caixa.lonMin)
    .lte('longitude', caixa.lonMax)
    .limit(LIMITE);

  // `like` nos ultimos digitos: a base guarda o telefone em formato livre
  // ('+55-21 99779-0018', '21 99779-0018', '+5521997790018'), entao comparar
  // string inteira nao acha. O filtro fino e' o `parecidos` abaixo.
  const porTelefone = fone
    ? supabase
        .from('clients')
        .select(COLUNAS)
        .eq('is_archived', false)
        .like('telefone', `%${fone.slice(-8)}%`)
        .limit(LIMITE)
    : null;

  const [perto, tel] = await Promise.all([porPerto, porTelefone]);
  if (perto.error) throw perto.error;
  if (tel?.error) throw tel.error;

  const porId = new Map<string, LeadExistente>();
  for (const r of [...(perto.data ?? []), ...(tel?.data ?? [])] as LeadExistente[]) {
    porId.set(r.id, r);
  }
  return parecidos(novo, [...porId.values()]);
}
