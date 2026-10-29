// O TIME NA RUA — a visão do gestor que está com o celular na mão (29/10/26).
//
// Julyan: "no app do gestor, eu posso ter a visão geral do time... seria só no
// app, quando eu estiver usando o app".
//
// POR QUE ESTA TELA É CURTA DE PROPÓSITO. O Cockpit já tem a análise do time, e
// `ranking_gestor` já devolve a lista inteira com placar — repetir isso aqui
// seria a poluição que ele pediu para evitar. Esta é a versão de rua: UM dia,
// UMA linha por pessoa, e só o que pede ação hoje.
//
// As duas colunas que não existem em lugar nenhum:
//   · FOTO FORA DO RAIO — a brecha da auditoria de 29/10, que vira recusa em
//     01/11. Até hoje só aparecia para quem roda SQL; foi por conversa que
//     chegou ao Julyan.
//   · SEM PRÓXIMO PASSO — o número do item 2.11, e o que o "Saí · como ficou?"
//     existe para derrubar.
//
// Nada aqui julga ninguém sozinho: foto fora do raio pode ser deriva de GPS num
// terreno grande. O número abre a conversa, não a fecha.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { Painel } from '../components/Painel';

export type LinhaDoTime = {
  owner_id: string | null;
  pessoa: string;
  nome: string | null;
  avatar_url: string | null;
  provadas: number;
  por_gps: number;
  por_foto: number;
  foto_fora: number;
  declaradas: number;
  sem_desfecho: number;
  ultima: string | null;
  /* OS DOIS AVISOS DO ITEM 2.11, que na prancha moram no Cockpit e aqui viram coluna: é no
     celular que o gestor está quando a informação importa. */
  sem_plano: boolean;
  nao_fechou_ontem: boolean;
};

export default function FolhaTimeNaRua({ visivel, aoFechar }: { visivel: boolean; aoFechar: () => void }) {
  const q = useQuery({
    queryKey: ['time-na-rua'],
    enabled: visivel,
    staleTime: 60_000,
    queryFn: async (): Promise<LinhaDoTime[]> => {
      const { data, error } = await supabase.rpc('time_na_rua', { p_dia: null });
      if (error) throw error;
      return (data ?? []) as LinhaDoTime[];
    },
  });

  const linhas = q.data ?? [];
  const total = linhas.reduce((n, l) => n + l.provadas, 0);
  const semPasso = linhas.reduce((n, l) => n + l.sem_desfecho, 0);
  const foraDoRaio = linhas.reduce((n, l) => n + l.foto_fora, 0);
  const semPlano = linhas.filter((l) => l.sem_plano).length;
  const naoFecharam = linhas.filter((l) => l.nao_fechou_ontem).length;

  return (
    <Painel visivel={visivel} aoFechar={aoFechar} rotulo="O time na rua" topo={
      <View style={s.topo}>
        <Text style={s.kicker}>O TIME NA RUA · HOJE</Text>
        <Text style={s.titulo}>
          {q.isLoading ? 'Contando…' : `${total} ${total === 1 ? 'visita provada' : 'visitas provadas'}`}
        </Text>
        {!q.isLoading && (
          <Text style={s.sub}>
            {[
              semPasso > 0 ? `${semPasso} sem próximo passo` : null,
              foraDoRaio > 0 ? `${foraDoRaio} com a foto fora do raio` : null,
              semPlano > 0 ? `${semPlano} sem plano` : null,
              naoFecharam > 0 ? `${naoFecharam} não fechou ontem` : null,
            ].filter(Boolean).join(' · ') || 'nada pendente até agora'}
          </Text>
        )}
      </View>
    }>
      <ScrollView style={s.rolagem} contentContainerStyle={s.corpo}>
        {q.isError && <Text style={s.vazio}>Não consegui ler o time agora. Puxe de novo em um instante.</Text>}
        {!q.isLoading && !q.isError && linhas.length === 0 && (
          <Text style={s.vazio}>Ninguém deu Cheguei hoje ainda.</Text>
        )}
        {linhas.map((l) => (
          <View key={l.pessoa} style={s.linha}>
            <View style={s.esq}>
              <Text style={s.nome} numberOfLines={1}>{l.nome ?? 'sem nome'}</Text>
              <Text style={s.detalhe} numberOfLines={1}>
                {[
                  l.por_gps > 0 ? `${l.por_gps} por GPS` : null,
                  l.por_foto > 0 ? `${l.por_foto} por foto` : null,
                  l.declaradas > 0 ? `${l.declaradas} declarada${l.declaradas === 1 ? '' : 's'}` : null,
                  l.ultima ? `última ${l.ultima}` : null,
                ].filter(Boolean).join(' · ')}
              </Text>
              {(l.foto_fora > 0 || l.sem_desfecho > 0 || l.sem_plano || l.nao_fechou_ontem) && (
                <View style={s.selos}>
                  {l.foto_fora > 0 && (
                    <Text style={[s.selo, s.seloVermelho]}>{`${l.foto_fora} foto fora do raio`}</Text>
                  )}
                  {l.sem_desfecho > 0 && (
                    <Text style={[s.selo, s.seloAmbar]}>{`${l.sem_desfecho} sem próximo passo`}</Text>
                  )}
                  {/* Os dois do 2.11. "Não fechou ontem" só aparece para quem teve rua ontem —
                      cobrar fecho de quem não visitou ninguém seria cobrar silêncio. */}
                  {l.sem_plano && <Text style={[s.selo, s.seloAmbar]}>sem plano hoje</Text>}
                  {l.nao_fechou_ontem && <Text style={[s.selo, s.seloAmbar]}>não fechou ontem</Text>}
                </View>
              )}
            </View>
            <Text style={s.conta}>{l.provadas}</Text>
          </View>
        ))}
        {/* O QUE MUDA EM 01/11, dito na tela de quem vai cobrar — e não por conversa. */}
        {!q.isLoading && linhas.length > 0 && (
          <Text style={s.rodape}>
            De 1º de novembro em diante, foto com coordenada precisa estar dentro do raio para provar a visita.
            Até lá ela vale como sempre valeu.
          </Text>
        )}
      </ScrollView>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 4 },
  kicker: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, color: 'var(--text-subtle)' },
  titulo: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  rolagem: { maxHeight: 460 },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 2 },
  linha: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'var(--border)' },
  esq: { flex: 1, minWidth: 0, gap: 2 },
  nome: { fontSize: 15.5, fontWeight: '700', color: 'var(--text)' },
  detalhe: { fontSize: 12.5, color: 'var(--text-muted)' },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  selo: { fontSize: 11.5, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, overflow: 'hidden' },
  seloVermelho: { backgroundColor: 'var(--tint-red)', color: 'var(--tint-red-text)' },
  seloAmbar: { backgroundColor: 'var(--tint-amber)', color: 'var(--tint-amber-text)' },
  conta: { fontSize: 22, fontWeight: '800', color: 'var(--text)', flexShrink: 0, fontVariant: ['tabular-nums'] },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)', paddingVertical: 8 },
  rodape: { fontSize: 12, lineHeight: 17, color: 'var(--text-subtle)', marginTop: 12 },
});
