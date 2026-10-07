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
import { mesmoNome, padraoDoNome, pinoDeGps } from '../utils/mesmoLugar';

export type LugarGoogle = { placeId: string; latitude: number; longitude: number };
type Detalhe = { nome: string; nota: number | null; avaliacoes: number | null; telefone: string | null; endereco: string | null; tipo: string | null; comida: boolean };

const COMIDA = ['restaurant', 'food', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'pizza_restaurant', 'hamburger_restaurant', 'brazilian_restaurant', 'fast_food_restaurant', 'coffee_shop', 'ice_cream_shop', 'sandwich_shop', 'steak_house', 'sushi_restaurant', 'japanese_restaurant', 'italian_restaurant', 'pub', 'snack_bar'];

/* CUSTO (07/10/26): o Google cobra o Place Details pela faixa do campo mais caro pedido. Nota,
   avaliações e telefone são da faixa Enterprise (a mais cara); nome, tipo e endereço não. O toque
   no lugar lê só os baratos; nota e telefone vêm quando alguém pede ("Ver nota e telefone") ou no
   "Virar lead" (aí o telefone vale o custo: é lead novo). Antes, cada toque pagava a faixa cara. */
async function lugarDoGoogle(placeId: string, fields: string[]) {
  const g = (globalThis as { google?: { maps?: { importLibrary?: (n: string) => Promise<unknown> } } }).google;
  if (!g?.maps?.importLibrary) throw new Error('mapa do Google não carregou');
  const { Place } = (await g.maps.importLibrary('places')) as { Place: new (o: { id: string }) => { fetchFields: (o: { fields: string[] }) => Promise<unknown>; [k: string]: unknown } };
  const p = new Place({ id: placeId });
  await p.fetchFields({ fields });
  return p;
}
async function lerLugar(placeId: string): Promise<Detalhe> {
  const p = await lugarDoGoogle(placeId, ['displayName', 'formattedAddress', 'types', 'primaryTypeDisplayName']);
  const tipos = (p.types as string[] | undefined) ?? [];
  return {
    nome: String(p.displayName ?? 'Lugar do Google'),
    nota: null, avaliacoes: null, telefone: null,
    endereco: (p.formattedAddress as string | null) ?? null,
    tipo: (p.primaryTypeDisplayName as string | null) ?? null,
    comida: tipos.some((t) => COMIDA.includes(t) || t.endsWith('_restaurant')),
  };
}
async function lerContato(placeId: string): Promise<Pick<Detalhe, 'nota' | 'avaliacoes' | 'telefone'>> {
  const p = await lugarDoGoogle(placeId, ['rating', 'userRatingCount', 'nationalPhoneNumber']);
  return {
    nota: typeof p.rating === 'number' ? (p.rating as number) : null,
    avaliacoes: typeof p.userRatingCount === 'number' ? (p.userRatingCount as number) : null,
    telefone: (p.nationalPhoneNumber as string | null) ?? null,
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
  // a conferência de "já está na base" tem de terminar antes do Virar lead (auditoria 05/10/26):
  // um toque rápido criava a duplicata que ela existe para impedir
  const [conferido, setConferido] = useState(false);

  useEffect(() => {
    if (!lugar) return;
    let vivo = true;
    setDet(null); setErro(null); setJaTem(null); setConferido(false);
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
    // pelo nome tamb\u00e9m, num raio de ~5 km (0,045\u00b0): o pino da base pode estar errado (mesmoLugar.ts)
    const r = 0.045;
    const padrao = padraoDoNome(det.nome);
    const perto = supabase.from('clients').select('*')
      .or(`conta_alvo_place_id.eq.${lugar.placeId},and(latitude.gte.${lugar.latitude - d},latitude.lte.${lugar.latitude + d},longitude.gte.${lugar.longitude - d},longitude.lte.${lugar.longitude + d})`)
      .limit(30);
    const peloNome = padrao
      ? supabase.from('clients').select('*').eq('is_archived', false)
        .or(`empresa.ilike.${padrao},nome.ilike.${padrao}`).limit(40)
      : Promise.resolve({ data: [] as Client[] });
    void Promise.all([perto, peloNome]).then(([a, b]) => {
      if (!vivo) return;
      const doLugar = ((a.data ?? []) as Client[]).find((c) => c.conta_alvo_place_id === lugar.placeId
        || palavras(`${c.empresa ?? ''} ${c.nome ?? ''}`).some((w) => doGoogle.has(w))
        || mesmoNome(c.empresa || c.nome, det.nome));
      // mesmo nome: vale se o pino est\u00e1 a ~5 km, ou se o pino n\u00e3o \u00e9 de GPS (pode estar em qualquer lugar)
      const doNome = ((b.data ?? []) as Client[]).filter((c) => mesmoNome(c.empresa || c.nome, det.nome)
        && (!pinoDeGps(c) || (c.latitude != null && Math.abs(Number(c.latitude) - lugar.latitude) <= r && Math.abs(Number(c.longitude) - lugar.longitude) <= r)))
        // cliente Takeat primeiro: \u00e9 ele que n\u00e3o pode virar lead de novo
        .sort((x, y) => (x.status === 'cliente' ? 0 : 1) - (y.status === 'cliente' ? 0 : 1))[0];
      setJaTem(doLugar ?? doNome ?? null);
      setConferido(true);
    });
    return () => { vivo = false; };
  }, [lugar?.placeId, det?.nome]); // eslint-disable-line react-hooks/exhaustive-deps
  const [criando, setCriando] = useState(false);
  // nota e telefone: só quando alguém pede (faixa cara do Google)
  const [contato, setContato] = useState<'nao' | 'lendo' | 'ok' | 'erro'>('nao');
  useEffect(() => { setContato('nao'); }, [lugar?.placeId]);
  const pedirContato = async (): Promise<string | null> => {
    if (!lugar) return null;
    setContato('lendo');
    try {
      const c = await lerContato(lugar.placeId);
      setDet((d) => (d ? { ...d, ...c } : d));
      setContato('ok');
      return c.telefone;
    } catch { setContato('erro'); return null; }
  };

  if (!lugar) return null;
  const nota = det?.nota != null ? `${det.nota.toFixed(1).replace('.', ',')} ★${det.avaliacoes ? ` · ${det.avaliacoes} avaliações` : ''}` : null;
  return (
    <Painel visivel aoFechar={aoFechar} rotulo="Lugar do Google"
      topo={<Text style={s.kicker}>DO GOOGLE MAPS</Text>}>
      <View style={s.corpo}>
        {!det && !erro ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
        {erro && !det ? <Text style={s.aviso}>{`Não consegui ler este lugar no Google agora (${erro}). Toque no lugar de novo daqui a pouco, ou cadastre pelo "+ Novo lead".`}</Text> : null}
        {det && (
          <View style={{ gap: 4 }}>
            <Text style={s.nome}>{det.nome}</Text>
            {!!(det.tipo || nota) && <Text style={s.sub}>{[det.tipo, nota].filter(Boolean).join(' · ')}</Text>}
            {!!det.endereco && <Text style={s.sub}>{det.endereco}</Text>}
            {!!det.telefone && <Text style={s.sub}>{det.telefone}</Text>}
            {contato === 'ok' && !det.telefone && <Text style={s.sub}>Sem telefone no Google.</Text>}
            {contato === 'erro' && <Text style={s.aviso}>Não consegui ler nota e telefone agora.</Text>}
            {(contato === 'nao' || contato === 'erro') && (
              <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec, { minHeight: 44 }]} onPress={() => { void pedirContato(); }}>
                <Text style={s.botaoSecTexto}>Ver nota e telefone</Text>
              </Pressable>
            )}
            {contato === 'lendo' && <ActivityIndicator style={{ marginVertical: 6 }} />}
            {!det.comida && <Text style={s.aviso}>Pelo Google, este lugar não é de comida.</Text>}
          </View>
        )}
        {jaTem ? (
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec]} onPress={() => aoAbrirLead(jaTem)}>
            <Text style={s.botaoSecTexto}>{`${jaTem.status === 'cliente' ? 'Já é cliente Takeat' : 'Já está no mapa'} · abrir ${jaTem.empresa?.trim() || jaTem.nome}`}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrin, (criando || !det || !conferido) && { opacity: 0.6 }]} disabled={!det || criando || !conferido}
            onPress={async () => {
              setCriando(true);
              try {
                // virar lead busca o telefone (uma vez): aí a faixa cara do Google vale o custo
                const tel = contato === 'ok' ? (det?.telefone ?? null) : await pedirContato();
                await aoVirarLead({ placeId: lugar.placeId, nome: det?.nome ?? '', telefone: tel, latitude: lugar.latitude, longitude: lugar.longitude });
              }
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
