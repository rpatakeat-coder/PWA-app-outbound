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
import { RAIO_NOME_IGUAL_M, avaliarMeuNegocio, caixaDeBusca, digitosDoTelefone, parecidos, type LeadExistente, type LeadNovo, type Parecido } from './leadDuplicado';

const COLUNAS = 'id, nome, empresa, telefone, latitude, longitude, etapa, id_hubspot, created_at';
/** Teto por consulta: a caixa e' pequena, mas um centro de cidade pode ser denso. */
const LIMITE = 60;
// a caixa de 400 m num bairro cheio passa de 60 pinos: o duplicado ficava de fora do corte
const LIMITE_PERTO = 500;

export async function buscarLeadsParecidos(novo: LeadNovo): Promise<Parecido[]> {
  // a caixa cobre o raio do nome identico (400 m); o filtro fino e' o `parecidos`
  const caixa = caixaDeBusca(novo.latitude, novo.longitude, RAIO_NOME_IGUAL_M);
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
    .limit(LIMITE_PERTO);

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

  // OS MEUS NEGOCIOS ABERTOS NO HUBSPOT (0206): o que nasceu no CRM ainda nao esta no clients.
  // Funcao ausente ou falha nao trava o cadastro (a checagem e' cortesia).
  const doCrm = supabase.rpc('meus_negocios_abertos').then((r) => (r.error ? [] : (r.data ?? []) as Array<{ deal_id: string; nome: string | null; etapa: string | null; lat: number | null; lng: number | null }>), () => []);
  const [perto, tel, crm] = await Promise.all([porPerto, porTelefone, doCrm]);
  if (perto.error) throw perto.error;
  if (tel?.error) throw tel.error;

  const porId = new Map<string, LeadExistente>();
  for (const r of [...(perto.data ?? []), ...(tel?.data ?? [])] as LeadExistente[]) {
    porId.set(r.id, r);
  }
  const achados = parecidos(novo, [...porId.values()]);
  const jaTem = new Set(achados.map((p) => p.lead.id_hubspot).filter(Boolean));
  for (const d of crm) {
    if (!d.deal_id || jaTem.has(String(d.deal_id))) continue;
    const p = avaliarMeuNegocio(novo, { id: 'hs-' + d.deal_id, nome: null, empresa: d.nome, telefone: null, latitude: d.lat, longitude: d.lng, etapa: d.etapa, id_hubspot: String(d.deal_id), created_at: null });
    if (p) achados.push(p);
  }
  return achados;
}
