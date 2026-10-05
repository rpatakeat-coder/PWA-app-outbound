// O RESTAURANTE DO GOOGLE NO MAPA (Julyan, 05/10/2026: "já que puxamos do google maps, por que
// não conseguimos colocar os restaurantes mais próximos, igual tem no google maps?").
//
// O mapa já desenha os lugares do próprio Google (o garfo e faca); o app só não deixava tocar
// neles. Tocou: esta folha lê o lugar na hora (nome, nota, avaliações, telefone, endereço — uma
// consulta ao Google por toque, nunca por movimento do mapa) e oferece "Virar lead", que abre o
// cadastro já preenchido. Antes, confere se o lugar já está na nossa base (mesmo place_id da
// conta-alvo ou um pino a ~40 m), para não duplicar.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';

export type LugarGoogle = { placeId: string; latitude: number; longitude: number };
type Detalhe = { nome: string; nota: number | null; avaliacoes: number | null; telefone: string | null; endereco: string | null; tipo: string | null; comida: boolean };

const COMIDA = ['restaurant', 'food', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'pizza_restaurant', 'hamburger_restaurant', 'brazilian_restaurant', 'fast_food_restaurant', 'coffee_shop', 'ice_cream_shop', 'sandwich_shop', 'steak_house', 'sushi_restaurant', 'japanese_restaurant', 'italian_restaurant', 'pub', 'snack_bar'];

async function lerLugar(placeId: string): Promise<Detalhe> {
  const g = (globalThis as { google?: { maps?: { importLibrary?: (n: string) => Promise<unknown> } } }).google;
  if (!g?.maps?.importLibrary) throw new Error('mapa do Google não carregou');
  const { Place } = (await g.maps.importLibrary('places')) as { Place: new (o: { id: string }) => { fetchFields: (o: { fields: string[] }) => Promise<unknown>; [k: string]: unknown } };
  const p = new Place({ id: placeId });
  await p.fetchFields({ fields: ['displayName', 'rating', 'userRatingCount', 'nationalPhoneNumber', 'formattedAddress', 'types', 'primaryTypeDisplayName'] });
  const tipos = (p.types as string[] | undefined) ?? [];
  return {
    nome: String(p.displayName ?? 'Lugar do Google'),
    nota: typeof p.rating === 'number' ? (p.rating as number) : null,
    avaliacoes: typeof p.userRatingCount === 'number' ? (p.userRatingCount as number) : null,
    telefone: (p.nationalPhoneNumber as string | null) ?? null,
    endereco: (p.formattedAddress as string | null) ?? null,
    tipo: (p.primaryTypeDisplayName as string | null) ?? null,
    comida: tipos.some((t) => COMIDA.includes(t) || t.endsWith('_restaurant')),
  };
}

type Props = {
  lugar: LugarGoogle | null;
  aoFechar: () => void;
  aoVirarLead: (d: { placeId: string; nome: string; telefone: string | null; latitude: number; longitude: number }) => Promise<void> | void;
  aoAbrirLead: (c: Client) => void;
};

export default function FolhaLugarGoogle({ lugar, aoFechar, aoVirarLead, aoAbrirLead }: Props) {
  const [det, setDet] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [jaTem, setJaTem] = useState<Client | null>(null);

  useEffect(() => {
    if (!lugar) return;
    let vivo = true;
    setDet(null); setErro(null); setJaTem(null);
    lerLugar(lugar.placeId).then((d) => { if (vivo) setDet(d); }).catch((e) => { if (vivo) setErro(String((e as Error)?.message ?? e)); });
    return () => { vivo = false; };
  }, [lugar?.placeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* JÁ ESTÁ NA BASE? (05/10/26: "os leads que puxamos do Google, ele já acusa como se fosse outros
     leads"). Antes bastava um pino a 40 m — num quarteirão de bares, era o vizinho. Agora é o
     MESMO lugar: o place_id do Google, ou um pino a ~60 m com nome parecido. */
  useEffect(() => {
    if (!lugar || !det) return;
    let vivo = true;
    const palavras = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !['restaurante', 'lanchonete', 'pizzaria', 'bar', 'ltda', 'comercio', 'alimentos'].includes(w));
    const doGoogle = new Set(palavras(det.nome));
    const d = 0.0006;
    void supabase.from('clients').select('*')
      .or(`conta_alvo_place_id.eq.${lugar.placeId},and(latitude.gte.${lugar.latitude - d},latitude.lte.${lugar.latitude + d},longitude.gte.${lugar.longitude - d},longitude.lte.${lugar.longitude + d})`)
      .limit(30)
      .then(({ data }) => {
        if (!vivo || !data) return;
        const achado = (data as Client[]).find((c) => c.conta_alvo_place_id === lugar.placeId
          || palavras(`${c.empresa ?? ''} ${c.nome ?? ''}`).some((w) => doGoogle.has(w)));
        setJaTem(achado ?? null);
      });
    return () => { vivo = false; };
  }, [lugar?.placeId, det?.nome]); // eslint-disable-line react-hooks/exhaustive-deps
  const [criando, setCriando] = useState(false);

  if (!lugar) return null;
  const nota = det?.nota != null ? `${det.nota.toFixed(1).replace('.', ',')} ★${det.avaliacoes ? ` · ${det.avaliacoes} avaliações` : ''}` : null;
  return (
    <Painel visivel aoFechar={aoFechar} rotulo="Lugar do Google"
      topo={<Text style={s.kicker}>DO GOOGLE MAPS</Text>}>
      <View style={s.corpo}>
        {!det && !erro ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
        {erro && !det ? <Text style={s.aviso}>{`Não consegui ler este lugar no Google agora (${erro}). Dá para cadastrar pelo pino do mesmo jeito.`}</Text> : null}
        {det && (
          <View style={{ gap: 4 }}>
            <Text style={s.nome}>{det.nome}</Text>
            {!!(det.tipo || nota) && <Text style={s.sub}>{[det.tipo, nota].filter(Boolean).join(' · ')}</Text>}
            {!!det.endereco && <Text style={s.sub}>{det.endereco}</Text>}
            {!!det.telefone && <Text style={s.sub}>{det.telefone}</Text>}
            {!det.comida && <Text style={s.aviso}>Pelo Google, este lugar não é de comida.</Text>}
          </View>
        )}
        {jaTem ? (
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec]} onPress={() => aoAbrirLead(jaTem)}>
            <Text style={s.botaoSecTexto}>{`Já está no mapa · abrir ${jaTem.empresa?.trim() || jaTem.nome}`}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrin, (criando || !det) && { opacity: 0.6 }]} disabled={!det || criando}
            onPress={async () => {
              setCriando(true);
              try { await aoVirarLead({ placeId: lugar.placeId, nome: det?.nome ?? '', telefone: det?.telefone ?? null, latitude: lugar.latitude, longitude: lugar.longitude }); }
              finally { setCriando(false); }
            }}>
            {criando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoPrinTexto}>Virar lead · entra em Prospecção</Text>}
          </Pressable>
        )}
        <Pressable accessibilityRole="link" style={[s.botao, s.botaoSec]}
          onPress={() => { void Linking.openURL(`https://www.google.com/maps/place/?q=place_id:${lugar.placeId}`); }}>
          <Text style={s.botaoSecTexto}>Ver no Google Maps</Text>
        </Pressable>
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--text-faint)', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  nome: { fontSize: 20, fontWeight: '800', color: 'var(--text)' },
  sub: { fontSize: 14, color: 'var(--text-muted)' },
  aviso: { fontSize: 13, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 10, borderRadius: 10 },
  botao: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botaoSec: { borderWidth: 1, borderColor: 'var(--border)' },
  botaoSecTexto: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  botaoPrin: { backgroundColor: 'var(--vermelho-acao)' },
  botaoPrinTexto: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
