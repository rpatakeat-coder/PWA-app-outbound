// MINHAS FOTOS (Julyan, 26/10/26: "o Sérgio quer ver as fotos que ele tira na rota, libera só pra ele").
// As fotos dos check-ins da própria pessoa, dos últimos 60 dias, por dia e com o restaurante; tocar amplia.
// Só lê: fotos_visita e o bucket fotos-visita já deixam cada um ler o que é dele (RLS criado_por/owner).
// Liberado por pessoa em FOTOS_LIBERADAS — para abrir a outro executivo, é só pôr o id dele na lista.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../integrations/supabase/client';
import { IconClose } from '../components/icons';

export const FOTOS_LIBERADAS = new Set<string>([
  '57d691a0-baf9-4bbb-a2fd-e513ddca3cdd', // Sérgio Caetano (26/10/26)
]);

type Foto = { id: string; caminho: string; criadoEm: string; restaurante: string; url: string | null };

const diaBRT = (iso: string) => new Date(Date.parse(iso) - 3 * 3600000).toISOString().slice(0, 10);
const rotuloDia = (dia: string) => {
  const d = new Date(dia + 'T12:00:00Z');
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
};
const hora = (iso: string) => new Date(Date.parse(iso) - 3 * 3600000).toISOString().slice(11, 16);

export default function MinhasFotos({ aberto, userId, onFechar }: { aberto: boolean; userId: string | null; onFechar: () => void }) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<Foto | null>(null);

  useEffect(() => {
    if (!aberto || !userId) return;
    let vivo = true;
    setErro(null);
    (async () => {
      const desde = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data, error } = await supabase.from('fotos_visita')
        .select('id, caminho, criado_em, client_id')
        .eq('criado_por', userId).gte('criado_em', desde)
        .order('criado_em', { ascending: false }).limit(300);
      if (error) throw error;
      const linhas = (data ?? []) as Array<{ id: string; caminho: string; criado_em: string; client_id: string | null }>;
      const ids = [...new Set(linhas.map((l) => l.client_id).filter(Boolean))] as string[];
      const nomes: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 100) {
        const { data: cs } = await supabase.from('clients').select('id, empresa, nome').in('id', ids.slice(i, i + 100));
        (cs ?? []).forEach((c: { id: string; empresa: string | null; nome: string | null }) => { nomes[c.id] = (c.empresa || c.nome || '').trim(); });
      }
      const urls: Record<string, string> = {};
      for (let i = 0; i < linhas.length; i += 50) {
        const lote = linhas.slice(i, i + 50).map((l) => l.caminho);
        const { data: ass } = await supabase.storage.from('fotos-visita').createSignedUrls(lote, 3600);
        (ass ?? []).forEach((a) => { if (a.path && a.signedUrl) urls[a.path] = a.signedUrl; });
      }
      if (!vivo) return;
      setFotos(linhas.map((l) => ({
        id: l.id, caminho: l.caminho, criadoEm: l.criado_em,
        restaurante: (l.client_id && nomes[l.client_id]) || 'restaurante',
        url: urls[l.caminho] ?? null,
      })));
    })().catch((e) => { if (vivo) setErro((e as Error).message || 'Não consegui carregar as fotos.'); });
    return () => { vivo = false; };
  }, [aberto, userId]);

  const porDia = useMemo(() => {
    const m = new Map<string, Foto[]>();
    (fotos ?? []).forEach((f) => { const d = diaBRT(f.criadoEm); if (!m.has(d)) m.set(d, []); m.get(d)!.push(f); });
    return [...m.entries()];
  }, [fotos]);

  if (!aberto) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <View style={s.fundo}>
        <View style={s.folha}>
          <View style={s.cab}>
            <View style={{ flex: 1 }}>
              <Text style={s.titulo}>Minhas fotos</Text>
              <Text style={s.sub}>{fotos ? fotos.length + (fotos.length === 1 ? ' foto' : ' fotos') + ' dos seus check-ins · últimos 60 dias' : 'fotos dos seus check-ins'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onFechar} style={s.fechar}>
              <IconClose width={22} height={22} fill="#7A8494" />
            </Pressable>
          </View>
          {erro ? <Text style={s.vazio}>{erro}</Text>
            : !fotos ? <ActivityIndicator style={{ marginTop: 40 }} color="var(--vermelho-acao)" />
            : !fotos.length ? <Text style={s.vazio}>Nenhuma foto de check-in nos últimos 60 dias.</Text>
            : (
              <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
                {porDia.map(([dia, lista]) => (
                  <View key={dia} style={{ marginTop: 14 }}>
                    <Text style={s.dia}>{rotuloDia(dia)} · {lista.length}</Text>
                    <View style={s.grade}>
                      {lista.map((f) => (
                        <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={'Ampliar a foto de ' + f.restaurante}
                          onPress={() => setAmpliada(f)} style={s.celula}>
                          {f.url ? <Image source={{ uri: f.url }} style={s.miniatura} resizeMode="cover" /> : <View style={[s.miniatura, s.semImagem]} />}
                          <Text style={s.legenda} numberOfLines={1}>{hora(f.criadoEm)} · {f.restaurante}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
        </View>
      </View>
      {ampliada && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setAmpliada(null)}>
          <Pressable style={s.ampliadaFundo} onPress={() => setAmpliada(null)} accessibilityRole="button" accessibilityLabel="Fechar a foto">
            {ampliada.url ? <Image source={{ uri: ampliada.url }} style={s.ampliada} resizeMode="contain" /> : null}
            <Text style={s.ampliadaLegenda}>{rotuloDia(diaBRT(ampliada.criadoEm))} · {hora(ampliada.criadoEm)} · {ampliada.restaurante}</Text>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  folha: { maxHeight: '92%', minHeight: '60%', backgroundColor: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16 },
  cab: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontSize: 20, fontWeight: '800', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  vazio: { marginTop: 32, textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' },
  dia: { fontSize: 13, fontWeight: '800', color: 'var(--text)', textTransform: 'capitalize', marginBottom: 8 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  celula: { width: '31.5%' },
  miniatura: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: 'var(--surface2)' },
  semImagem: { opacity: 0.5 },
  legenda: { fontSize: 11, color: 'var(--text-muted)', marginTop: 3 },
  ampliadaFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  ampliada: { width: '100%', height: '80%' },
  ampliadaLegenda: { color: '#FFFFFF', fontSize: 14, marginTop: 12, textAlign: 'center' },
});
