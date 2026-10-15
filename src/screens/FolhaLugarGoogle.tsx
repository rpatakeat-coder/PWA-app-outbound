// O RESTAURANTE DO GOOGLE NO MAPA (Julyan, 05/10/2026: "já que puxamos do google maps, por que
// não conseguimos colocar os restaurantes mais próximos, igual tem no google maps?").
//
// O mapa já desenha os lugares do próprio Google (o garfo e faca); o app só não deixava tocar
// neles. Prancha "Mapa do Executivo" (§7, 15/10/26), três estados:
// 1. lugar novo: só a faixa barata (nome, tipo, endereço). "Virar lead" é o botão principal; a
//    nota e o telefone ficam num link discreto, que avisa que a consulta é paga;
// 2. já é nosso (decisão 3): o mesmo place_id, ou nome parecido (≥ 0,8) a menos de 50 m. Abre o
//    pino que existe; sem Virar lead e sem o link;
// 3. depois de "Ver nota e telefone": nota, telefone, Ligar e Virar lead. A consulta fica no
//    cache da sessão (não se paga duas vezes) e, se virar lead, nota e telefone vão junto.
// Nada é criado no HubSpot sem "Virar lead", e nenhuma chamada nova do Google.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import { IconClose, useIconColors } from '../components/icons';
import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';
import { metros, similaridade } from '../utils/armasDoMapa';
import { distanciaTexto } from '../utils/cardNovo';

export type LugarGoogle = { placeId: string; latitude: number; longitude: number };
type Detalhe = { nome: string; endereco: string | null; tipo: string | null; comida: boolean };
type Contato = { nota: number | null; avaliacoes: number | null; telefone: string | null; em: number };

const COMIDA = ['restaurant', 'food', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'pizza_restaurant', 'hamburger_restaurant', 'brazilian_restaurant', 'fast_food_restaurant', 'coffee_shop', 'ice_cream_shop', 'sandwich_shop', 'steak_house', 'sushi_restaurant', 'japanese_restaurant', 'italian_restaurant', 'pub', 'snack_bar'];

/* O CACHE DA SESSÃO: nota e telefone consultados não são pagos de novo, nem ao reabrir o lugar,
   nem no "Virar lead". Vive enquanto o app está aberto. */
const contatosDaSessao = new Map<string, Contato>();

/* CUSTO (07/10/26): o Google cobra o Place Details pela faixa do campo mais caro pedido. Nota,
   avaliações e telefone são da faixa Enterprise (a mais cara); nome, tipo e endereço não. O toque
   no lugar lê só os baratos; nota e telefone vêm só quando alguém pede. */
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
    endereco: (p.formattedAddress as string | null) ?? null,
    tipo: (p.primaryTypeDisplayName as string | null) ?? null,
    comida: tipos.some((t) => COMIDA.includes(t) || t.endsWith('_restaurant')),
  };
}
async function lerContato(placeId: string): Promise<Contato> {
  const p = await lugarDoGoogle(placeId, ['rating', 'userRatingCount', 'nationalPhoneNumber']);
  return {
    nota: typeof p.rating === 'number' ? (p.rating as number) : null,
    avaliacoes: typeof p.userRatingCount === 'number' ? (p.userRatingCount as number) : null,
    telefone: (p.nationalPhoneNumber as string | null) ?? null,
    em: Date.now(),
  };
}

/** Como o pino que já existe aparece na caixa verde ("lead morno seu, em Demo/Proposta"). */
function descricaoDoPino(c: Client, meuOwnerId: string | null): string {
  if (c.status === 'cliente') return 'cliente Takeat';
  if (c.status === 'churn') return 'ex-cliente';
  const seu = !!meuOwnerId && String(c.vendedor_id_hubspot ?? '') === String(meuOwnerId);
  const etapa = (c.etapa ?? '').trim();
  if (!c.id_hubspot && c.lead_prospeccao_id) return seu ? 'conta sua, ainda sem negócio' : 'conta da prospecção, ainda sem negócio';
  return `lead${seu ? ' seu' : ''}${etapa ? `, em ${etapa}` : ''}`;
}

type Props = {
  lugar: LugarGoogle | null;
  /** Onde a pessoa está: a distância à direita do kicker. */
  eu?: { latitude: number; longitude: number } | null;
  meuOwnerId?: string | null;
  aoFechar: () => void;
  aoVirarLead: (d: { placeId: string; nome: string; telefone: string | null; nota: number | null; avaliacoes: number | null; latitude: number; longitude: number }) => Promise<void> | void;
  aoAbrirLead: (c: Client) => void;
};

export default function FolhaLugarGoogle({ lugar, eu = null, meuOwnerId = null, aoFechar, aoVirarLead, aoAbrirLead }: Props) {
  const cores = useIconColors();
  const [det, setDet] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [jaTem, setJaTem] = useState<Client | null>(null);
  // a conferência de "já está na base" tem de terminar antes do Virar lead (auditoria 05/10/26):
  // um toque rápido criava a duplicata que ela existe para impedir
  const [conferido, setConferido] = useState(false);
  const [contato, setContato] = useState<Contato | null>(null);
  const [lendoContato, setLendoContato] = useState<'nao' | 'lendo' | 'erro'>('nao');
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (!lugar) return;
    let vivo = true;
    setDet(null); setErro(null); setJaTem(null); setConferido(false); setLendoContato('nao');
    setContato(contatosDaSessao.get(lugar.placeId) ?? null);
    lerLugar(lugar.placeId).then((d) => { if (vivo) setDet(d); }).catch((e) => { if (vivo) setErro(String((e as Error)?.message ?? e)); });
    return () => { vivo = false; };
  }, [lugar?.placeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* JÁ É NOSSO? (decisão 3 da prancha): primeiro o place_id; senão o nome normalizado (sem
     "restaurante", "bar", "ltda"…) com similaridade ≥ 0,8 E menos de 50 m. Mais de um: o mais perto. */
  useEffect(() => {
    if (!lugar || !det) return;
    let vivo = true;
    const d = 0.0006; // ~60 m em volta: a conta de distância decide os 50 m
    void Promise.resolve(supabase.from('clients').select('*').eq('is_archived', false)
      .or(`conta_alvo_place_id.eq.${lugar.placeId},and(latitude.gte.${lugar.latitude - d},latitude.lte.${lugar.latitude + d},longitude.gte.${lugar.longitude - d},longitude.lte.${lugar.longitude + d})`)
      .limit(40)).then(({ data }) => {
      if (!vivo) return;
      const lista = (data ?? []) as Client[];
      const pelaId = lista.find((c) => c.conta_alvo_place_id === lugar.placeId);
      const dist = (c: Client) => metros({ lat: lugar.latitude, lng: lugar.longitude }, { lat: Number(c.latitude), lng: Number(c.longitude) });
      const peloNome = lista
        .filter((c) => c.latitude != null && dist(c) < 50 && similaridade(c.empresa || c.nome, det.nome) >= 0.8)
        .sort((a, b) => dist(a) - dist(b))[0];
      setJaTem(pelaId ?? peloNome ?? null);
      setConferido(true);
    }, () => { if (vivo) setConferido(true); });
    return () => { vivo = false; };
  }, [lugar?.placeId, det?.nome]); // eslint-disable-line react-hooks/exhaustive-deps

  const pedirContato = async () => {
    if (!lugar) return;
    setLendoContato('lendo');
    try {
      const c = await lerContato(lugar.placeId);
      contatosDaSessao.set(lugar.placeId, c);
      setContato(c);
      setLendoContato('nao');
    } catch { setLendoContato('erro'); }
  };

  if (!lugar) return null;
  const distancia = eu ? distanciaTexto(metros({ lat: eu.latitude, lng: eu.longitude }, { lat: lugar.latitude, lng: lugar.longitude })) : null;
  const sub = det ? [det.tipo, det.endereco?.split(' - ')[0]].filter(Boolean).join(' · ') : null;
  const nosso = !!jaTem;
  const kicker = nosso ? (String(jaTem!.vendedor_id_hubspot ?? '') === String(meuOwnerId ?? '-') ? 'DO GOOGLE MAPS · JÁ É SEU' : 'DO GOOGLE MAPS · JÁ ESTÁ NO MAPA') : 'DO GOOGLE MAPS';
  const hora = contato ? new Date(contato.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
  const virarLead = async () => {
    setCriando(true);
    try {
      // sem nova consulta: a nota e o telefone só vão se já tiverem sido consultados
      await aoVirarLead({ placeId: lugar.placeId, nome: det?.nome ?? '', telefone: contato?.telefone ?? null, nota: contato?.nota ?? null, avaliacoes: contato?.avaliacoes ?? null, latitude: lugar.latitude, longitude: lugar.longitude });
    } finally { setCriando(false); }
  };
  const podeCriar = !!det && conferido && !criando;
  return (
    <Painel visivel aoFechar={aoFechar} rotulo="Lugar do Google"
      topo={
        <View style={s.topo}>
          <View style={s.kickerLinha}>
            <Text style={[s.kicker, nosso && { color: 'var(--ok-texto)' }]} numberOfLines={1}>{kicker}</Text>
            {!!distancia && <Text style={s.dist}>{distancia}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fechar}>
            <IconClose width={20} height={20} fill={cores.muted} />
          </Pressable>
        </View>
      }>
      <View style={s.corpo}>
        {!det && !erro ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
        {erro && !det ? <Text style={s.aviso}>{`Não consegui ler este lugar no Google agora (${erro}). Toque no lugar de novo daqui a pouco, ou cadastre pelo "+ Novo lead".`}</Text> : null}
        {det && (
          <View style={{ gap: 2 }}>
            <Text style={s.nome}>{nosso ? (jaTem!.empresa?.trim() || jaTem!.nome || det.nome) : det.nome}</Text>
            {!!sub && <Text style={s.sub}>{sub}</Text>}
          </View>
        )}
        {det && !det.comida && !nosso && <Text style={s.aviso}>Pelo Google, este lugar não é de comida.</Text>}

        {nosso ? (
          <>
            <Text style={s.caixaOk}>{`Já está no mapa como ${descricaoDoPino(jaTem!, meuOwnerId)}. Nada novo é criado.`}</Text>
            <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec]} onPress={() => aoAbrirLead(jaTem!)}>
              <Text style={s.botaoSecTexto}>Já está no mapa · abrir</Text>
            </Pressable>
          </>
        ) : contato ? (
          <>
            {contato.nota != null && <Text style={s.nota}>{`★ ${contato.nota.toFixed(1).replace('.', ',')}${contato.avaliacoes ? ` · ${contato.avaliacoes.toLocaleString('pt-BR')} avaliações` : ''}`}</Text>}
            <View style={s.linha}>
              <Text style={s.linhaRotulo}>Telefone</Text>
              <Text style={s.linhaValor}>{contato.telefone ?? 'sem telefone no Google'}</Text>
            </View>
            <Text style={s.caixa}>{`Consultado às ${hora}. Se virar lead, nota e telefone ficam salvos e não são pagos de novo.`}</Text>
            <View style={s.botoes}>
              {!!contato.telefone && (
                <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec, { flex: 1 }]} onPress={() => { void Linking.openURL(`tel:${contato.telefone!.replace(/[^\d+]/g, '')}`); }}>
                  <Text style={s.botaoSecTexto}>Ligar</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrin, { flex: 2 }, !podeCriar && { opacity: 0.6 }]} disabled={!podeCriar} onPress={() => { void virarLead(); }}>
                {criando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoPrinTexto}>Virar lead</Text>}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={s.caixa}>{'Ainda não está no Takeat. Tocar não cria nada: só "Virar lead" cria a prospecção no HubSpot.'}</Text>
            <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrin, !podeCriar && { opacity: 0.6 }]} disabled={!podeCriar} onPress={() => { void virarLead(); }}>
              {criando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoPrinTexto}>Virar lead</Text>}
            </Pressable>
            {det && (
              <Pressable accessibilityRole="link" accessibilityLabel="Ver nota e telefone. Consulta paga ao Google" disabled={lendoContato === 'lendo'} onPress={() => { void pedirContato(); }} style={s.link}>
                {lendoContato === 'lendo' ? <ActivityIndicator /> : <Text style={s.linkTexto}>Ver nota e telefone</Text>}
                <Text style={s.linkSub}>{lendoContato === 'erro' ? 'não consegui consultar agora · tente de novo' : 'consulta paga ao Google · use só se for ligar agora'}</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, gap: 8 },
  kickerLinha: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  kicker: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.69, color: 'var(--text-muted)', flexShrink: 1 },
  dist: { fontSize: 12.5, fontWeight: '600', color: 'var(--text-muted)' },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  nome: { fontSize: 19, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13.5, fontWeight: '500', color: 'var(--text-muted)' },
  nota: { fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'baseline' },
  linhaRotulo: { width: 80, fontSize: 12.5, fontWeight: '600', color: 'var(--text-muted)' },
  linhaValor: { flex: 1, fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  caixa: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)', backgroundColor: 'var(--arma-fundo)', padding: 10, borderRadius: 12, overflow: 'hidden' },
  caixaOk: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: 'var(--ok-texto)', backgroundColor: 'var(--ok-fundo)', padding: 10, borderRadius: 12, overflow: 'hidden' },
  aviso: { fontSize: 13, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 10, borderRadius: 10 },
  botoes: { flexDirection: 'row', gap: 8 },
  botao: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botaoSec: { borderWidth: 1, borderColor: 'var(--border)' },
  botaoSecTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  botaoPrin: { backgroundColor: 'var(--vermelho-acao)' },
  botaoPrinTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2 },
  linkTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)', textDecorationLine: 'underline' },
  linkSub: { fontSize: 12, color: 'var(--text-muted)' },
});
