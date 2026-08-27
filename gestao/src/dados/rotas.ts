// Rotas do time — o gestor ve, edita e monta a rota de cada vendedor.
//
// PODE, POR DESENHO DO BANCO: todas as policies de field_routes e
// field_route_stops tem "OR is_field_admin()" — o gestor sempre teve permissao
// de escrever a rota dos outros; faltava a tela.
//
// O QUE O VENDEDOR VE: a MESMA tabela que o app de campo le. Rota criada aqui
// aparece pra ele na aba Rota na proxima abertura, com source='suggested' —
// o proprio app ja' distingue rota sugerida de rota montada a mao.
//
// A SUGESTAO DAQUI E' DE CARTEIRA, NAO DE ESTRADA. O app do vendedor otimiza
// por vias reais a partir do GPS dele; o cockpit nao tem a localizacao do
// vendedor, entao sugere por PRIORIDADE COMERCIAL: etapa mais avancada
// primeiro, nunca-visitado antes de visitado. O vendedor reordena no app se
// quiser — a ordem daqui e' proposta, nao trajeto.
import { supabase } from '../supabase';
import { carregarEquipe, ativos, type MembroEquipe } from './equipe';
import { nomesPorId } from './paginar';
import { ETAPAS_FUNIL } from './cockpit';

export interface Parada {
  id: string;
  clientId: string;
  posicao: number;
  status: string; // planned | done | skipped | removed
  nome: string;
}

export interface RotaDoVendedor {
  membro: MembroEquipe;
  rota: { id: string; status: string; source: string } | null;
  paradas: Parada[];
}

export interface QuadroDeRotas {
  dia: string;
  linhas: RotaDoVendedor[];
  atualizadoEm: Date;
}

export async function carregarQuadro(dia: string): Promise<QuadroDeRotas> {
  const [equipe, rotasRes] = await Promise.all([
    carregarEquipe(),
    supabase
      .from('field_routes')
      .select('id, seller_id, status, source')
      .eq('route_date', dia)
      .neq('status', 'cancelled'),
  ]);
  if (rotasRes.error) throw rotasRes.error;
  const rotas = (rotasRes.data ?? []) as any[];

  let paradasPorRota = new Map<string, any[]>();
  let nomes = new Map<string, string>();
  if (rotas.length) {
    const { data: stops, error } = await supabase
      .from('field_route_stops')
      .select('id, route_id, client_id, position, status')
      .in('route_id', rotas.map((r) => r.id))
      .neq('status', 'removed')
      .order('position');
    if (error) throw error;
    for (const s of (stops ?? []) as any[]) {
      const lista = paradasPorRota.get(s.route_id) ?? [];
      lista.push(s);
      paradasPorRota.set(s.route_id, lista);
    }
    nomes = await nomesPorId(((stops ?? []) as any[]).map((s) => s.client_id));
  }

  const rotaPorVendedor = new Map(rotas.map((r) => [r.seller_id, r]));
  const linhas: RotaDoVendedor[] = ativos(equipe).map((m) => {
    const r = rotaPorVendedor.get(m.perfilId);
    return {
      membro: m,
      rota: r ? { id: r.id, status: r.status, source: r.source } : null,
      paradas: (r ? paradasPorRota.get(r.id) ?? [] : []).map((s: any) => ({
        id: s.id,
        clientId: s.client_id,
        posicao: s.position,
        status: s.status,
        nome: nomes.get(s.client_id) ?? 'lead removido',
      })),
    };
  });

  return { dia, linhas, atualizadoEm: new Date() };
}

/** Cria (ou reaproveita) a rota do vendedor no dia. Upsert pela unique
 *  (seller_id, route_date): se o vendedor ja' montou a dele, o gestor passa a
 *  EDITAR a rota existente em vez de criar uma concorrente. */
export async function garantirRota(sellerId: string, dia: string): Promise<{ id: string } | { erro: string }> {
  const { data: sessao } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('field_routes')
    .upsert(
      {
        seller_id: sellerId,
        route_date: dia,
        title: 'Rota do dia',
        status: 'planned',
        // 'suggested' de proposito: o app do vendedor ja' rotula rota que nao
        // foi montada por ele — e' honesto sobre a origem.
        source: 'suggested',
        created_by: sessao?.user?.id ?? null,
      },
      { onConflict: 'seller_id,route_date' },
    )
    .select('id')
    .single();
  if (error) return { erro: error.message };
  return { id: (data as any).id };
}

export async function adicionarParada(rotaId: string, clientId: string, posicao: number): Promise<string | null> {
  const { error } = await supabase.from('field_route_stops').insert({
    route_id: rotaId,
    client_id: clientId,
    position: posicao,
    status: 'planned',
  });
  if (error) {
    return /duplicate|unique/i.test(error.message)
      ? 'Esse lead já está na rota.'
      : error.message;
  }
  return null;
}

export async function removerParada(paradaId: string): Promise<string | null> {
  const { error } = await supabase.from('field_route_stops').delete().eq('id', paradaId);
  return error ? error.message : null;
}

/** Sobe/desce trocando as posicoes de duas paradas vizinhas. Duas escritas —
 *  sem transacao, mas a colisao no pior caso e' ordem trocada, nao dado
 *  perdido, e o quadro recarrega em seguida. */
export async function trocarPosicao(a: Parada, b: Parada): Promise<string | null> {
  const r1 = await supabase.from('field_route_stops').update({ position: b.posicao }).eq('id', a.id);
  if (r1.error) return r1.error.message;
  const r2 = await supabase.from('field_route_stops').update({ position: a.posicao }).eq('id', b.id);
  return r2.error ? r2.error.message : null;
}

export interface LeadParaRota {
  id: string;
  nome: string;
  etapa: string | null;
  cidade: string | null;
}

export interface PontoNoMapa {
  id: string;
  nome: string;
  etapa: string | null;
  lat: number;
  lon: number;
}

/** A carteira do vendedor COM coordenadas — os pins clicaveis do editor. */
export async function carteiraNoMapa(ownerId: string): Promise<PontoNoMapa[]> {
  const { data } = await supabase
    .from('clients')
    .select('id, nome, empresa, etapa, latitude, longitude')
    .eq('vendedor_id_hubspot', ownerId)
    .in('etapa', ETAPAS_FUNIL as unknown as string[])
    .not('latitude', 'is', null)
    .limit(500);
  return ((data ?? []) as any[]).map((c) => ({
    id: c.id,
    nome: (c.empresa || '').trim() || c.nome || 'Sem nome',
    etapa: c.etapa,
    lat: Number(c.latitude),
    lon: Number(c.longitude),
  }));
}

/** Coordenadas de clientes por id — pras paradas que vieram de fora da
 *  carteira (busca por nome) tambem aparecerem no mapa. */
export async function coordenadasPorId(ids: string[]): Promise<Map<string, { lat: number; lon: number }>> {
  const mapa = new Map<string, { lat: number; lon: number }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('clients')
      .select('id, latitude, longitude')
      .in('id', ids.slice(i, i + 200))
      .not('latitude', 'is', null);
    for (const c of (data ?? []) as any[]) {
      mapa.set(c.id, { lat: Number(c.latitude), lon: Number(c.longitude) });
    }
  }
  return mapa;
}

/** Busca leads pra adicionar, por nome/empresa. So' quem tem coordenada:
 *  parada sem pin nao vira visita. */
export async function buscarLeads(termo: string): Promise<LeadParaRota[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const { data } = await supabase
    .from('clients')
    .select('id, nome, empresa, etapa, cidade')
    .or(`nome.ilike.%${t}%,empresa.ilike.%${t}%`)
    .not('latitude', 'is', null)
    .limit(12);
  return ((data ?? []) as any[]).map((c) => ({
    id: c.id,
    nome: (c.empresa || '').trim() || c.nome || 'Sem nome',
    etapa: c.etapa,
    cidade: c.cidade,
  }));
}

/** Sugere ate' N paradas da CARTEIRA do vendedor: etapa mais avancada
 *  primeiro (mais perto de fechar), nunca-visitado antes de ja'-visitado.
 *  Criterio comercial — a otimizacao por estrada continua sendo do app. */
export async function sugerirParadas(
  ownerId: string,
  jaNaRota: Set<string>,
  quantas = 8,
): Promise<LeadParaRota[]> {
  const { data } = await supabase
    .from('clients')
    .select('id, nome, empresa, etapa, cidade, visited_at')
    .eq('vendedor_id_hubspot', ownerId)
    .in('etapa', ETAPAS_FUNIL as unknown as string[])
    .not('latitude', 'is', null)
    .limit(200);
  const ordem = new Map((ETAPAS_FUNIL as readonly string[]).map((e, i) => [e, i]));
  return ((data ?? []) as any[])
    .filter((c) => !jaNaRota.has(c.id))
    .sort((a, b) => {
      const ea = ordem.get(a.etapa) ?? -1;
      const eb = ordem.get(b.etapa) ?? -1;
      if (ea !== eb) return eb - ea; // etapa mais avancada primeiro
      const va = a.visited_at ? 1 : 0;
      const vb = b.visited_at ? 1 : 0;
      return va - vb; // nunca visitado primeiro
    })
    .slice(0, quantas)
    .map((c) => ({
      id: c.id,
      nome: (c.empresa || '').trim() || c.nome || 'Sem nome',
      etapa: c.etapa,
      cidade: c.cidade,
    }));
}
