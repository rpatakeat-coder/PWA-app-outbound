// GOOGLE FORA DA BASE (Agenda no computador, 05/10/2026): restaurantes do Google perto do plano
// que ainda não são pino nosso. UMA chamada por pedido (Places API New, searchNearby), só quando
// a aba Sugestões ou a camada Google abre — nada roda sozinho.
import type { Client } from '../types/client';
import { mesmoNome } from './mesmoLugar';

export type LugarPerto = { placeId: string; nome: string; latitude: number; longitude: number; nota: number | null; avaliacoes: number | null };

type PlaceNovo = { id: string; displayName?: string; location?: { lat: () => number; lng: () => number }; rating?: number | null; userRatingCount?: number | null };

export async function buscarGooglePerto(centro: { latitude: number; longitude: number }, raioM = 1200): Promise<LugarPerto[]> {
  const g = (globalThis as { google?: { maps?: { importLibrary?: (n: string) => Promise<unknown> } } }).google;
  if (!g?.maps?.importLibrary) throw new Error('mapa do Google não carregou');
  const { Place } = (await g.maps.importLibrary('places')) as { Place: { searchNearby: (o: unknown) => Promise<{ places: PlaceNovo[] }> } };
  const { places } = await Place.searchNearby({
    fields: ['id', 'displayName', 'location', 'rating', 'userRatingCount'],
    locationRestriction: { center: { lat: centro.latitude, lng: centro.longitude }, radius: raioM },
    includedPrimaryTypes: ['restaurant', 'bar', 'pizza_restaurant', 'brazilian_restaurant', 'fast_food_restaurant', 'meal_takeaway', 'cafe', 'bakery', 'hamburger_restaurant', 'japanese_restaurant'],
    maxResultCount: 20,
    rankPreference: 'POPULARITY',
  });
  return (places ?? []).filter((p) => p.location).map((p) => ({
    placeId: p.id, nome: String(p.displayName ?? ''), latitude: p.location!.lat(), longitude: p.location!.lng(),
    nota: typeof p.rating === 'number' ? p.rating : null, avaliacoes: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
  }));
}

const GENERICAS = ['restaurante', 'lanchonete', 'pizzaria', 'bar', 'ltda', 'comercio', 'alimentos'];
const palavras = (t: string) => t.normalize('NFD').replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'), '')
  .toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERICAS.includes(w));

/** Já é pino nosso? O mesmo critério da folha do lugar: o place_id, ou ~60 m com nome parecido. */
export function jaNaBase(l: LugarPerto, base: Client[]): boolean {
  const doGoogle = new Set(palavras(l.nome));
  const d = 0.0006;
  return base.some((c) => c.conta_alvo_place_id === l.placeId || mesmoNome(c.empresa || c.nome, l.nome) || (
    c.latitude != null && c.longitude != null
    && Math.abs(Number(c.latitude) - l.latitude) <= d && Math.abs(Number(c.longitude) - l.longitude) <= d
    && palavras(`${c.empresa ?? ''} ${c.nome ?? ''}`).some((w) => doGoogle.has(w))));
}
