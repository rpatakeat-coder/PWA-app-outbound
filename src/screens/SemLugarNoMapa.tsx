// NO PLANO, SEM LUGAR NO MAPA (07/10/2026). O gestor conta o plano do Planejamento; o app só
// põe na rota o que tem pino. Medido na semana de 05/10: 17 itens do plano eram negócios sem
// endereço no HubSpot — o gestor via "5 de 15" e o app mostrava 9 paradas, sem dizer por quê.
// Agora o executivo vê a mesma lista que o gestor conta (meu_plano_sem_lugar, 0179) e o caminho:
// pôr a rua no negócio do HubSpot faz o pino nascer (negocio-vira-ponto).
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';

type Item = { item_id: string; nome: string | null; etapa: string | null };
const PORTAL = '24373118';

export default function SemLugarNoMapa({ dia }: { dia: string }) {
  const q = useQuery({
    queryKey: ['meu_plano_sem_lugar', dia],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meu_plano_sem_lugar', { p_dia: dia });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const itens = q.data ?? [];
  if (!itens.length) return null;
  return (
    <View style={s.caixa}>
      <Text style={s.titulo}>{`NO PLANO, SEM LUGAR NO MAPA · ${itens.length}`}</Text>
      <Text style={s.ajuda}>Estão no seu Planejamento e o gestor conta, mas o negócio não tem endereço no HubSpot: o app não consegue pôr na rota. Ponha a rua no negócio e o pino aparece.</Text>
      {itens.map((x) => {
        const deal = /^[cr]-\d+$/.test(x.item_id) ? x.item_id.slice(2) : null;
        return (
          <View key={x.item_id} style={s.linha}>
            <Text style={s.nome} numberOfLines={1}>{x.nome || 'sem nome'}</Text>
            {deal ? (
              <Pressable accessibilityRole="link" style={s.botao}
                onPress={() => { void Linking.openURL(`https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${deal}`); }}>
                <Text style={s.botaoTexto}>Abrir no HubSpot</Text>
              </Pressable>
            ) : <Text style={s.sub}>lead de prospecção</Text>}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', padding: 12, gap: 8 },
  titulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--text-muted)' },
  ajuda: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  nome: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  botao: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: 'var(--border)', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  botaoTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
});
