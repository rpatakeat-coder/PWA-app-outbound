import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { CHANCES, distanciaDoTime, mesAnterior, mesDaPrevisao, meuAcerto, type LinhaPrevisao } from '../utils/previsaoDemo';

// "Qual a chance de fechar este mês?" — handoff "Acelerar Field Sales v2", tela 4c (01/11/26).
//
// Aparece na confirmação da ficha DEPOIS de salvar uma demo ("Apresentei agora"). A ficha não muda:
// é uma pergunta de um toque, que dá para pular. A resposta vai para previsoes_demo (0234) e alimenta
// a previsão honesta do cockpit; não vai para o HubSpot. Embaixo, o meu acerto do mês anterior.

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

type Quadro = { convAnterior: number | null; time: LinhaPrevisao; pessoas: Array<LinhaPrevisao & { pessoa: string }> };

export function PrevisaoDaDemo({ dealId, ownerId }: { dealId: string; ownerId: string | null }) {
  const mes = mesDaPrevisao();
  const ant = mesAnterior(mes);
  const [escolha, setEscolha] = useState<number | null>(null);
  const [estado, setEstado] = useState<'pergunta' | 'gravando' | 'salvo' | 'pulou'>('pergunta');
  const [erro, setErro] = useState<string | null>(null);
  const acerto = useQuery({
    queryKey: ['previsao_honesta', ant],
    staleTime: 30 * 60_000,
    retry: 1,
    queryFn: async () => {
      const [{ data, error }, sessao] = await Promise.all([supabase.rpc('previsao_honesta', { p_mes: ant }), supabase.auth.getSession()]);
      if (error) throw error;
      return { q: data as unknown as Quadro & { erro?: string }, eu: sessao.data.session?.user?.id ?? null };
    },
  });

  async function salvar() {
    if (escolha == null) return;
    setEstado('gravando'); setErro(null);
    const { error } = await supabase.from('previsoes_demo').upsert(
      { deal_id: String(dealId), mes, owner_id: ownerId, chance: escolha, atualizado_em: new Date().toISOString() },
      { onConflict: 'deal_id,mes' },
    );
    if (error) { setEstado('pergunta'); setErro(error.code === '42501' ? 'Outra pessoa já disse a chance desta demo.' : `Não salvou: ${error.message}`); return; }
    setEstado('salvo');
  }

  if (estado === 'pulou') return null;
  const q = acerto.data?.q;
  const eu = q && !q.erro && Array.isArray(q.pessoas) ? q.pessoas.find((p) => p.pessoa === acerto.data?.eu) : null;
  const meu = eu ? meuAcerto(eu) : null;
  const doTime = q && !q.erro && q.time ? distanciaDoTime(q.time, q.convAnterior) : null;
  const mesAntNome = MESES[Number(ant.slice(5, 7)) - 1];

  return (
    <View style={{ gap: 10 }}>
      <View style={[s.card, s.cardPergunta]}>
        <Text style={s.kicker}>PREVISÃO HONESTA</Text>
        {estado === 'salvo' ? (
          <>
            <Text style={s.titulo}>{`Chance de ${escolha}% salva`}</Text>
            <Text style={s.sub}>{'entra na previsão do time · no fim do mês aparece o seu acerto'}</Text>
          </>
        ) : (
          <>
            <Text style={s.titulo}>Qual a chance de fechar este mês?</Text>
            <Text style={s.sub}>só para a previsão do time · no fim do mês aparece o seu acerto</Text>
            <View style={s.botoes}>
              {CHANCES.map((c) => (
                <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: escolha === c }} accessibilityLabel={`${c}% de chance`}
                  onPress={() => setEscolha(c)} style={[s.chance, escolha === c && s.chanceAtiva]}>
                  <Text style={[s.chanceTexto, escolha === c && s.chanceTextoAtivo]}>{`${c}%`}</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.acoes}>
              <Pressable accessibilityRole="button" onPress={() => setEstado('pulou')} style={s.pular}><Text style={s.pularTexto}>Pular</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={escolha == null || estado === 'gravando'} onPress={() => { void salvar(); }} style={[s.salvar, escolha == null && s.salvarDesligado]}>
                {estado === 'gravando' ? <ActivityIndicator color="var(--bg)" /> : <Text style={s.salvarTexto}>{escolha == null ? 'Escolha a chance' : `Salvar ${escolha}%`}</Text>}
              </Pressable>
            </View>
            {!!erro && <Text style={s.erro}>{erro}</Text>}
          </>
        )}
        <Text style={s.rodape}>previsoes_demo · não altera o HubSpot</Text>
      </View>
      {meu && (
        <View style={s.card}>
          <Text style={s.titulo}>{`Seu acerto em ${mesAntNome}`}</Text>
          <Text style={s.sub}>{`você disse ${meu.disse}% em média; fechou ${meu.fechou}%`}</Text>
          <View style={s.linha}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.linhaRot}>Distância</Text>
              {doTime != null && <Text style={s.linhaSub}>{`time ${doTime} pts`}</Text>}
            </View>
            <Text style={[s.linhaNum, { color: doTime != null && meu.distancia <= doTime ? 'var(--tint-green-text)' : 'var(--tint-amber-text)' }]}>{`${meu.distancia} pts`}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: 'var(--surface)', borderRadius: 16, borderWidth: 1, borderColor: 'var(--border)', paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  cardPergunta: { borderLeftWidth: 3, borderLeftColor: 'var(--info-text)' },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.72, color: 'var(--info-text)' },
  titulo: { fontSize: 17, fontWeight: '700', lineHeight: 22, color: 'var(--text)' },
  sub: { fontSize: 12.5, fontWeight: '500', color: 'var(--text-muted)', marginTop: -6 },
  botoes: { flexDirection: 'row', gap: 8 },
  chance: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  chanceAtiva: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  chanceTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  chanceTextoAtivo: { color: 'var(--bg)' },
  acoes: { flexDirection: 'row', gap: 8 },
  pular: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  pularTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  salvar: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: 'var(--text)', alignItems: 'center', justifyContent: 'center' },
  salvarDesligado: { opacity: 0.45 },
  salvarTexto: { fontSize: 15, fontWeight: '700', color: 'var(--bg)' },
  erro: { fontSize: 13, fontWeight: '600', color: 'var(--vermelho-texto)' },
  rodape: { fontSize: 12, fontWeight: '500', color: 'var(--text-faint)' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  linhaRot: { fontSize: 13.5, fontWeight: '600', color: 'var(--text)' },
  linhaSub: { fontSize: 12.5, fontWeight: '500', color: 'var(--text-muted)' },
  linhaNum: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
