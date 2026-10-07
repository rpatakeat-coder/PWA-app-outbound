// FICOU SEM DESFECHO (07/10/2026). Julyan: "como eles vão dar esse desfecho? onde eles marcam
// isso pra não ficar estourado?". Medido: 550 reuniões 'agendada' com a data passada, e o app
// não tinha onde fechar reunião que passou (o "Registrar" da Agenda só aparece no dia escolhido,
// e só para reunião que não casou com parada). Agora:
//   · check-in ou ficha no mesmo cliente e dia fecha sozinho (gatilho, 0177);
//   · o resto aparece aqui, no topo da Agenda de hoje, com Aconteceu · Remarcar · Não aconteceu
//     (RPC reuniao_desfecho, 0176 — a mesma que o gestor usa na Pessoas, então os dois lados batem).
// Conta os últimos 30 dias (é o que o gestor cobra); as mais antigas ficam num "ver as antigas".
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { Toast } from '../components/Toast';
import { proximoDiaUtil } from '../../supabase/functions/_compartilhado/filaDoDinheiro';

type Reuniao = { id: string; scheduled_at: string; type: string | null; client_id: string; clients: { empresa: string | null; nome: string | null } | null };

const JANELA_DIAS = 30;
const diaBRT = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const horaBRT = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const quandoTxt = (iso: string) => {
  const d = diaBRT(new Date(iso));
  const t = new Date(`${d}T12:00:00Z`);
  return `${DIAS[t.getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)} ${horaBRT(iso)}`;
};

export default function SemDesfecho({ userId }: { userId: string | null }) {
  const qc = useQueryClient();
  const [abertas, setAbertas] = useState(false);
  const [antigas, setAntigas] = useState(false);
  const [remarcando, setRemarcando] = useState<string | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  const [fora, setFora] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ['sem_desfecho', userId],
    enabled: !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from('client_meetings')
        .select('id, scheduled_at, type, client_id, clients(empresa, nome)')
        .eq('created_by', userId!).eq('status', 'agendada')
        .lt('scheduled_at', new Date(Date.now() - 2 * 3600_000).toISOString())
        .order('scheduled_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Reuniao[];
    },
  });

  const corte = useMemo(() => new Date(Date.now() - JANELA_DIAS * 86400_000).toISOString(), []);
  const lista = (q.data ?? []).filter((r) => !fora.has(r.id));
  const recentes = lista.filter((r) => r.scheduled_at >= corte);
  const velhas = lista.filter((r) => r.scheduled_at < corte);
  if (!userId || q.isLoading || (!recentes.length && !velhas.length)) return null;

  const fechar = async (r: Reuniao, status: 'realizada' | 'nao_aconteceu' | 'remarcar', quando?: string) => {
    setGravando(r.id);
    try {
      const { error } = await supabase.rpc('reuniao_desfecho', { p_id: r.id, p_status: status, p_quando: quando ?? null });
      if (error) throw error;
      setFora((s) => new Set(s).add(r.id));
      setRemarcando(null);
      void qc.invalidateQueries({ queryKey: ['client_meetings'] });
      const nome = r.clients?.empresa?.trim() || r.clients?.nome || 'Reunião';
      Toast.mostrar(status === 'realizada' ? `${nome}: aconteceu ✓` : status === 'nao_aconteceu' ? `${nome}: não aconteceu ✓` : `${nome}: remarcada para ${quandoTxt(quando!)} ✓`, 'ok');
    } catch (e) {
      Toast.mostrar(`Não gravou: ${String((e as Error)?.message ?? e)}`, 'erro');
    } finally { setGravando(null); }
  };
  /* remarcar: o mesmo horário, no próximo dia útil ou daqui a 2 e 5 dias úteis */
  const opcoes = (r: Reuniao) => {
    const h = horaBRT(r.scheduled_at);
    const hoje = diaBRT(new Date());
    return [1, 2, 5].map((n) => {
      const d = proximoDiaUtil(hoje, n, []);
      return { rot: n === 1 ? `amanhã ${h}` : `${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`, quando: new Date(`${d}T${h}:00-03:00`).toISOString() };
    });
  };
  const visiveis = (abertas ? recentes : recentes.slice(0, 3)).concat(antigas ? velhas : []);

  const linha = (r: Reuniao) => {
    const nome = r.clients?.empresa?.trim() || r.clients?.nome || 'Cliente';
    const ocupado = gravando === r.id;
    return (
      <View key={r.id} style={s.linha}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.nome} numberOfLines={1}>{nome}</Text>
          <Text style={s.sub}>{`${quandoTxt(r.scheduled_at)}${r.type === 'follow_up' ? ' · retorno' : ' · reunião'}`}</Text>
        </View>
        {ocupado ? <ActivityIndicator /> : remarcando === r.id ? (
          <View style={s.botoes}>
            {opcoes(r).map((o) => (
              <Pressable key={o.rot} accessibilityRole="button" style={s.botao} onPress={() => { void fechar(r, 'remarcar', o.quando); }}>
                <Text style={s.botaoTexto}>{o.rot}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" style={s.botao} onPress={() => setRemarcando(null)}><Text style={s.botaoTexto}>Voltar</Text></Pressable>
          </View>
        ) : (
          <View style={s.botoes}>
            <Pressable accessibilityRole="button" style={s.botao} onPress={() => { void fechar(r, 'realizada'); }}><Text style={s.botaoTexto}>Aconteceu</Text></Pressable>
            <Pressable accessibilityRole="button" style={s.botao} onPress={() => setRemarcando(r.id)}><Text style={s.botaoTexto}>Remarcar</Text></Pressable>
            <Pressable accessibilityRole="button" style={s.botao} onPress={() => { void fechar(r, 'nao_aconteceu'); }}><Text style={s.botaoTexto}>Não aconteceu</Text></Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.caixa}>
      <Text style={s.titulo}>{`FICOU SEM DESFECHO · ${recentes.length}`}</Text>
      <Text style={s.ajuda}>Reunião ou retorno que passou e ninguém fechou. O seu gestor vê este número. Check-in no cliente no mesmo dia fecha sozinho.</Text>
      {visiveis.map(linha)}
      {recentes.length > 3 && (
        <Pressable accessibilityRole="button" onPress={() => setAbertas((v) => !v)}>
          <Text style={s.link}>{abertas ? 'Ver só as 3 mais recentes' : `Ver todas (${recentes.length})`}</Text>
        </Pressable>
      )}
      {velhas.length > 0 && (
        <Pressable accessibilityRole="button" onPress={() => setAntigas((v) => !v)}>
          <Text style={s.link}>{antigas ? 'Esconder as antigas' : `${velhas.length} antigas, de antes de ${quandoTxt(corte).slice(4, 9)} · não entram na cobrança`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { borderRadius: 14, borderWidth: 1, borderColor: 'var(--tint-amber-border)', backgroundColor: 'var(--surface)', padding: 12, gap: 8 },
  titulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--tint-amber-text)' },
  ajuda: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  linha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  nome: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  botao: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: 'var(--border)', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  botaoTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  link: { fontSize: 13, fontWeight: '700', color: 'var(--tint-blue-text)', paddingVertical: 6 },
});
