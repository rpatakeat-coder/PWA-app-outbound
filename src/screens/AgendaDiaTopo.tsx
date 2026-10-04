// O topo da Agenda · Dia (Um app só, PR 2 · docs/11 §2 e "Manhã · Agenda", 04/10/2026).
//
//  - Sua palavra de hoje: a promessa de visitas (sai de Meu desempenho). Sem promessa,
//    4 · 6 · 8 · 10 em um toque; com promessa, x/y das PROVADAS de hoje.
//  - Um botão só para a rota: "Montar meu dia" sem rota, "Refazer a rota" com rota
//    (antes eram "Rota de hoje" + "Montar meu dia" + "Roteirizar" + "Montar minha rota").
//  - Pronto para a rua? (de manhã, antes do 1º check-in e antes das 11h): rota, ritmo,
//    a hora do HubSpot e como foi ontem.
//  - Encerramento (depois das 18h): o que ficou comprovado hoje e o que pede registro.
//  - Script da daily (ontem fiz · hoje faço · onde travei), com Copiar.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { Toast } from '../components/Toast';
import { useMinhaDaily } from '../hooks/useMinhaDaily';
import { IconCar, IconCheckCircle, IconClock, useIconColors } from '../components/icons';

export type MomentoDoDia = 'manha' | 'rua' | 'noite';

/** manhã = antes do 1º check-in e antes das 11h; noite = depois das 18h; o resto é rua (docs/11 §1). */
export function momentoDoDia(provadasOuFeitasHoje: number, agora = new Date()): MomentoDoDia {
  const h = Number(new Date(agora.getTime() - 3 * 3600000).toISOString().slice(11, 13));
  if (h >= 18) return 'noite';
  if (h < 11 && provadasOuFeitasHoje === 0) return 'manha';
  return 'rua';
}

const hhmm = (iso: string | null | undefined) => {
  if (!iso) return null;
  const b = new Date(new Date(iso).getTime() - 3 * 3600000);
  return `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`;
};

type Props = {
  provadasHoje: number | null;
  visitasHoje: number;
  paradasNoPlano: number;
  paradasAbertas: number;
  reunioesHoje: number;
  metaPadrao: number;
  hubspotEm?: string | null;
  aoMontarDia?: () => void;
  montandoDia?: boolean;
  aoRefazerRota?: () => void;
  refazendo?: boolean;
  aoAbrirFeitas?: () => void;
};

function Item({ ok, texto }: { ok: boolean; texto: string }) {
  const cores = useIconColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {ok ? <IconCheckCircle width={18} height={18} fill={cores.tintGreenText} /> : <IconClock width={18} height={18} fill={cores.muted} />}
      <Text style={s.item}>{texto}</Text>
    </View>
  );
}

export default function AgendaDiaTopo(p: Props) {
  const cores = useIconColors();
  const queryClient = useQueryClient();
  const { daily, prometer } = useMinhaDaily(true);
  const prometido = daily?.hoje.prometido ?? null;
  const provadas = p.provadasHoje ?? 0;
  const momento = momentoDoDia(Math.max(provadas, p.visitasHoje));

  // ontem: visitas provadas do último dia (a mesma régua do placar)
  const ontem = useQuery<{ provadas: number; total: number } | null>({
    queryKey: ['ontem_provadas'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const d = new Date(Date.now() - 3 * 3600000 - 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc('visitas_com_prova', { p_de: d, p_ate: d });
      if (error) return null;
      const linhas = (data ?? []) as Array<{ provada: boolean }>;
      return { provadas: linhas.filter((x) => x.provada).length, total: linhas.length };
    },
  });
  // onde travei: o primeiro negócio de Destravar na fila (o mesmo cache da Tarefas)
  const fila = queryClient.getQueryData<{ itens?: Array<{ grupo: string; negocio: string; porque: string }> }>(['fila_tarefas']);
  const travado = fila?.itens?.find((i) => i.grupo === 'destravar') ?? null;

  const ontemFiz = ontem.data ? `${ontem.data.provadas} ${ontem.data.provadas === 1 ? 'visita provada' : 'visitas provadas'}${ontem.data.total > ontem.data.provadas ? `, ${ontem.data.total - ontem.data.provadas} sem prova` : ''}` : 'não medido';
  const hojeFaco = `${p.paradasNoPlano} ${p.paradasNoPlano === 1 ? 'parada' : 'paradas'}${p.reunioesHoje ? `, ${p.reunioesHoje} ${p.reunioesHoje === 1 ? 'reunião' : 'reuniões'}` : ''}${prometido ? `, palavra de ${prometido} visitas` : ''}`;
  const ondeTravei = travado ? `${travado.negocio}: ${travado.porque}` : '—';
  const copiar = async () => {
    const texto = `Ontem fiz: ${ontemFiz}\nHoje faço: ${hojeFaco}\nOnde travei: ${ondeTravei}`;
    try { await navigator.clipboard.writeText(texto); Toast.mostrar('Script copiado · cole na daily', 'ok'); }
    catch { Toast.mostrar('Não deu para copiar neste aparelho', 'erro'); }
  };

  const temRota = p.paradasNoPlano > 0;
  return (
    <View style={{ gap: 12 }}>
      <View style={s.cartao}>
        <Text style={s.rotulo}>SUA PALAVRA DE HOJE</Text>
        {prometido ? (
          <View style={s.palavraLinha}>
            <Text style={s.palavraNum}>{`${provadas}/${prometido}`}</Text>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={s.tracos}>{Array.from({ length: Math.max(prometido, 1) }, (_, i) => <View key={i} style={[s.traco, i < provadas && s.tracoFeito]} />)}</View>
              <Text style={s.sub}>{`Você prometeu ${prometido} · visitas provadas pelo GPS`}</Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={s.pergunta}>Quantas visitas você faz hoje?</Text>
            <View style={s.opcoes}>
              {[4, 6, 8, 10].map((n) => (
                <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Prometer ${n} visitas hoje`} disabled={prometer.isPending}
                  onPress={() => prometer.mutate(n, {
                    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['meu_dia'] }); void queryClient.invalidateQueries({ queryKey: ['placar_executivo'] }); Toast.mostrar(`Palavra dada · ${n} visitas hoje`, 'ok'); },
                    onError: (e) => Toast.mostrar(`Não gravou: ${(e as Error).message}`, 'erro'),
                  })}
                  style={[s.opcao, n === p.metaPadrao && s.opcaoSugerida]}>
                  <Text style={s.opcaoTexto}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.sub}>Este número aparece na daily do time.</Text>
          </>
        )}
      </View>

      {momento === 'manha' && (
        <View style={s.cartao}>
          <Text style={s.titulo}>Pronto para a rua?</Text>
          <Item ok={temRota} texto={temRota ? `Rota construída · ${p.paradasNoPlano} ${p.paradasNoPlano === 1 ? 'parada' : 'paradas'}` : 'Rota ainda não montada'} />
          <Item ok texto={`Agenda no ritmo da sua fase · ${p.metaPadrao} por dia`} />
          {p.hubspotEm ? <Item ok texto={`HubSpot atualizado às ${hhmm(p.hubspotEm)}`} /> : null}
          <Text style={s.sub}>{`Ontem: ${ontemFiz}.`}</Text>
        </View>
      )}

      {(p.aoMontarDia || p.aoRefazerRota) && (
        <Pressable accessibilityRole="button" accessibilityLabel={temRota ? 'Refazer a rota' : 'Montar meu dia'}
          disabled={p.montandoDia || p.refazendo}
          onPress={() => (temRota && p.paradasAbertas >= 2 && p.aoRefazerRota ? p.aoRefazerRota() : p.aoMontarDia?.())}
          style={[s.rota, (p.montandoDia || p.refazendo) && { opacity: 0.6 }]}>
          <IconCar width={20} height={20} fill={cores.tintRedText} />
          <View style={{ flex: 1 }}>
            <Text style={s.rotaTitulo}>{p.montandoDia || p.refazendo ? 'Calculando…' : temRota ? 'Refazer a rota' : 'Montar meu dia'}</Text>
            <Text style={s.sub}>microrrotas a pé, a partir de onde você está</Text>
          </View>
        </Pressable>
      )}

      {momento === 'noite' && (
        <View style={s.cartao}>
          <Text style={s.titulo}>Encerramento</Text>
          <Text style={s.item}>{`${provadas} ${provadas === 1 ? 'visita provada' : 'visitas provadas'} hoje${p.paradasAbertas ? ` · ${p.paradasAbertas} ${p.paradasAbertas === 1 ? 'parada ficou' : 'paradas ficaram'} para amanhã` : ''}`}</Text>
          {p.aoAbrirFeitas && (
            <Pressable accessibilityRole="button" onPress={p.aoAbrirFeitas} style={s.secundario}>
              <Text style={s.secundarioTexto}>Revisar o que fiz hoje</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={s.cartao}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[s.titulo, { flex: 1 }]}>Script da daily</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Copiar o script da daily" onPress={() => { void copiar(); }} style={s.copiar}>
            <Text style={s.copiarTexto}>Copiar</Text>
          </Pressable>
        </View>
        <Text style={s.scriptRot}>Ontem fiz</Text><Text style={s.scriptTexto}>{ontemFiz}</Text>
        <Text style={s.scriptRot}>Hoje faço</Text><Text style={s.scriptTexto}>{hojeFaco}</Text>
        <Text style={s.scriptRot}>Onde travei</Text><Text style={s.scriptTexto}>{ondeTravei}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { borderRadius: 16, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', padding: 16, gap: 8 },
  rotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: 'var(--text-muted)' },
  titulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  item: { fontSize: 14, color: 'var(--text)' },
  pergunta: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  palavraLinha: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  palavraNum: { fontSize: 30, fontWeight: '800', color: 'var(--text)' },
  tracos: { flexDirection: 'row', gap: 4 },
  traco: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'var(--surface-2)' },
  tracoFeito: { backgroundColor: 'var(--verde-acao)' },
  opcoes: { flexDirection: 'row', gap: 10 },
  opcao: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', alignItems: 'center', justifyContent: 'center' },
  opcaoSugerida: { borderColor: 'var(--vermelho-acao)' },
  opcaoTexto: { fontSize: 18, fontWeight: '800', color: 'var(--text)' },
  rota: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderRadius: 14, borderWidth: 1, borderColor: 'var(--vermelho-acao)', backgroundColor: 'var(--surface)', paddingHorizontal: 14, paddingVertical: 10 },
  rotaTitulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  secundario: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secundarioTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  copiar: { minHeight: 44, minWidth: 80, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  copiarTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  scriptRot: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)', marginTop: 2 },
  scriptTexto: { fontSize: 14, color: 'var(--text)', lineHeight: 20 },
});
