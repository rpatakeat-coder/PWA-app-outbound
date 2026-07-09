import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CHANGE_STAGE_WEBHOOK,
  STAGES,
  hubspotStageToStage,
  type HubSpotStageRaw,
  type Stage,
} from '../constants/stages';

// ===== Etapas dinamicas do HubSpot =====
// As etapas do funil passam a vir do HubSpot (pipeline 118032977) via webhook
// do app com type=get_stages, em vez da lista hardcoded. Isso garante que a
// nomenclatura e a ORDEM (displayOrder) batem com o HubSpot, que e' o que
// sustenta a regra de "avancar 1 etapa por vez".
//
// Estrategia de atualizacao (decidida com o usuario):
//  - Busca no maximo 1x por dia, ancorada nas 12h. Se o cache foi salvo antes
//    das 12h de hoje (ou e' de um dia anterior), revalida; senao reusa.
//  - Cache persistente no device (AsyncStorage) pra sobreviver entre sessoes.
//  - Fallback em cascata se o webhook falhar: cache do device -> STAGES
//    hardcoded. O app NUNCA fica sem etapas.

const CACHE_KEY = '@takeat:hubspot_stages_v1';

type CachePayload = {
  fetchedAt: string;      // ISO de quando buscou
  stages: HubSpotStageRaw[];
};

// Lista de fallback derivada do STAGES hardcoded, ja no formato Stage final
// (com displayOrder pela ordem do array e isClosed por WON/probabilidade
// desconhecida). Usada quando nunca houve cache e o webhook falhou.
const FALLBACK_STAGES: Stage[] = STAGES.map((s, i) => ({
  ...s,
  displayOrder: s.displayOrder ?? i,
}));

// Marco das 12h de hoje. Se o cache foi salvo antes deste horario, ja passou
// da "janela diaria" e vale revalidar.
function todayNoon(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}

function shouldRevalidate(fetchedAtISO: string | null): boolean {
  if (!fetchedAtISO) return true;
  const fetchedAt = new Date(fetchedAtISO);
  if (Number.isNaN(fetchedAt.getTime())) return true;
  const noon = todayNoon();
  const now = new Date();
  // Se ainda nao deu meio-dia hoje, a janela de hoje ainda nao abriu: so
  // revalida se o cache for de antes do meio-dia de ONTEM (mais de ~1 dia).
  const anchor = now.getTime() >= noon.getTime() ? noon : new Date(noon.getTime() - 24 * 3600 * 1000);
  return fetchedAt.getTime() < anchor.getTime();
}

function mapRawToStages(raw: HubSpotStageRaw[]): Stage[] {
  return [...raw]
    .filter((r) => !r.archived)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((r, i) => hubspotStageToStage(r, i));
}

async function fetchStagesFromWebhook(): Promise<HubSpotStageRaw[] | null> {
  try {
    const res = await fetch(CHANGE_STAGE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'get_stages' }),
    });
    if (!res.ok) {
      console.warn('[STAGES] get_stages respondeu', res.status);
      return null;
    }
    const body = await res.json();
    // Aceita tanto { results: [...] } (formato cru HubSpot) quanto um array
    // direto, por robustez ao que o n8n devolver.
    const results: unknown = Array.isArray(body) ? body : body?.results;
    if (!Array.isArray(results) || results.length === 0) {
      console.warn('[STAGES] get_stages sem results utilizaveis');
      return null;
    }
    return results as HubSpotStageRaw[];
  } catch (err) {
    console.warn('[STAGES] get_stages falhou:', err);
    return null;
  }
}

export function useStages(enabled: boolean) {
  // Comeca com o fallback hardcoded pra tela nunca renderizar vazia.
  const [stages, setStages] = useState<Stage[]>(FALLBACK_STAGES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      // 1) Le o cache do device e mostra imediatamente (se existir).
      let cached: CachePayload | null = null;
      try {
        const rawCache = await AsyncStorage.getItem(CACHE_KEY);
        if (rawCache) cached = JSON.parse(rawCache) as CachePayload;
      } catch {
        cached = null;
      }
      if (!cancelled && cached?.stages?.length) {
        setStages(mapRawToStages(cached.stages));
        setIsLoading(false);
      }

      // 2) Decide se revalida (respeita a janela diaria das 12h).
      if (!shouldRevalidate(cached?.fetchedAt ?? null)) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      // 3) Busca fresco. Se vier, atualiza state + cache. Se falhar, mantem
      //    o que ja estava (cache ou fallback) — nao quebra a mudanca de etapa.
      const fresh = await fetchStagesFromWebhook();
      if (cancelled) return;
      if (fresh) {
        setStages(mapRawToStages(fresh));
        AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ fetchedAt: new Date().toISOString(), stages: fresh } as CachePayload),
        ).catch(() => {});
      }
      setIsLoading(false);
    })();

    return () => { cancelled = true; };
  }, [enabled]);

  return { stages, isLoading };
}
