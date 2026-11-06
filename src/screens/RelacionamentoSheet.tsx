// A visita de relacionamento (06/11/26): o que sobe depois do Cheguei num CLIENTE ativo.
//
// Julyan: "quando for cliente, poderia aparecer na ficha dele o plano atual, comandas, etc" e
// "nas visitas de relacionamento colocar uma pergunta obrigatória: pediu indicação?".
//
// OBRIGATÓRIO É AVISAR, NÃO TRAVAR (a regra dele para o app e o Cockpit): a folha sobe
// sempre, a pergunta é um toque, e o check-in já gravou — pular não desfaz a visita. Pular
// fica como "não respondeu" (visita a cliente sem linha em visitas_relacionamento), e é isso
// que o gestor cobra. O resumo do cliente no topo é a mesma linha do cartão (sinaisDoCliente):
// situação, plano e assinatura, comandas, última comanda e queda.
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from '../components/KeyboardAvoidingView';
import { Toast } from '../components/Toast';
import { useLayout } from '../hooks/useLayout';
import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';
import { sinaisDoCliente } from '../utils/cardNovo';

type Resposta = 'indicou' | 'nao_indicou' | 'nao_pediu';
const OPCOES: { valor: Resposta; rotulo: string }[] = [
  { valor: 'indicou', rotulo: 'Pedi e indicou' },
  { valor: 'nao_indicou', rotulo: 'Pedi, não indicou' },
  { valor: 'nao_pediu', rotulo: 'Não pedi' },
];

type Props = {
  client: Client;
  /** o acao_id do check-in: liga a resposta à visita que acabou de entrar */
  acaoId: string | null;
  aoFechar: () => void;
};

/** grava a resposta; se o check-in ainda está subindo (sem sinal), tenta de novo por ~1 min */
async function gravar(acaoId: string | null, clientId: string, resposta: Resposta, nome: string, telefone: string, tentativa = 0): Promise<void> {
  const { data, error } = await supabase.rpc('responder_relacionamento' as never, {
    p_acao_id: acaoId, p_client_id: clientId, p_resposta: resposta,
    p_nome: resposta === 'indicou' ? nome.trim() || null : null,
    p_telefone: resposta === 'indicou' ? telefone.replace(/\D/g, '') || null : null,
  } as never);
  const erro = error?.message ?? (data as { erro?: string } | null)?.erro ?? null;
  if (!erro) return;
  if (/ainda não chegou/.test(erro) && tentativa < 4) {
    await new Promise((r) => setTimeout(r, 15000));
    return gravar(acaoId, clientId, resposta, nome, telefone, tentativa + 1);
  }
  throw new Error(erro);
}

export function RelacionamentoSheet({ client, acaoId, aoFechar }: Props) {
  const layout = useLayout();
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  /* o pino do mapa vem enxuto (sem plano, sem última comanda): a folha lê só estas colunas desta linha */
  const [completo, setCompleto] = useState<Client>(client);
  useEffect(() => {
    let vivo = true;
    void Promise.resolve(supabase.from('clients').select('hs_plano, hs_assinatura, hs_etapa_uso, hs_qtd_comandas, hs_ultima_comanda_em, hs_cancelamento_solicitado_em').eq('id', client.id).limit(1))
      .then((r) => { const x = r.data?.[0]; if (vivo && x) setCompleto((c) => ({ ...c, ...(x as Partial<Client>) })); }, () => {});
    return () => { vivo = false; };
  }, [client.id]);
  const nomeCliente = client.empresa?.trim() || client.nome;
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const sinais = sinaisDoCliente(completo, { tipo: 'cliente', queda: null } as never, hoje);

  const salvar = (r: Resposta) => {
    // fecha já: o executivo segue para a próxima porta; a gravação termina em segundo plano
    aoFechar();
    void gravar(acaoId, client.id, r, nome, telefone).then(
      () => Toast.mostrar(r === 'indicou' ? `Indicação de ${nomeCliente} registrada` : `Resposta registrada · ${nomeCliente}`, 'ok'),
      (e) => Toast.mostrar(`Não gravei a resposta de ${nomeCliente}: ${(e as Error).message}`, 'erro'),
    );
  };
  const tocar = (r: Resposta) => { if (r === 'indicou') setResposta(r); else salvar(r); };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={aoFechar}>
      <View style={[e.fundo, layout.ehLargo && e.fundoWeb]}>
        {/* backdrop IRMÃO do conteúdo (nunca envolvendo o TextInput): ver CLAUDE.md */}
        <Pressable style={StyleSheet.absoluteFill} onPress={aoFechar} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[e.folha, layout.ehLargo && e.folhaWeb]}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            <Text style={e.kicker}>VISITA DE RELACIONAMENTO</Text>
            <Text style={e.titulo} numberOfLines={2}>{nomeCliente}</Text>
            {sinais.length ? (
              <View style={e.fatos}>
                {sinais.map((x) => (
                  <View key={x.texto} style={[e.fato, x.tom === 'ok' && e.fatoOk, x.tom === 'aviso' && e.fatoAviso]}>
                    <Text style={[e.fatoTexto, x.tom === 'ok' && e.fatoOkTexto, x.tom === 'aviso' && e.fatoAvisoTexto]} numberOfLines={1}>{x.texto}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={e.pergunta}>Pediu indicação?</Text>
            <View style={e.opcoes}>
              {OPCOES.map((o) => (
                <TouchableOpacity
                  key={o.valor}
                  onPress={() => tocar(o.valor)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: resposta === o.valor }}
                  style={[e.opcao, { minHeight: layout.alvo }, resposta === o.valor && e.opcaoAtiva]}
                >
                  <Text style={[e.opcaoTexto, resposta === o.valor && e.opcaoTextoAtiva]}>{o.rotulo}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {resposta === 'indicou' ? (
              <View style={{ marginTop: 14 }}>
                <Text style={e.rotulo}>Quem foi indicado <Text style={e.opcional}>  opcional</Text></Text>
                <TextInput style={e.campo} placeholder="Nome do restaurante ou do dono" placeholderTextColor="var(--text-subtle)"
                  value={nome} onChangeText={setNome} autoCapitalize="words" maxLength={120} />
                <TextInput style={[e.campo, { marginTop: 8 }]} placeholder="Telefone com DDD" placeholderTextColor="var(--text-subtle)"
                  value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" maxLength={20} />
                <TouchableOpacity onPress={() => salvar('indicou')} accessibilityRole="button" style={[e.salvar, { minHeight: layout.alvo }]}>
                  <Text style={e.salvarTexto}>Salvar indicação</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity onPress={aoFechar} accessibilityRole="button" style={[e.pular, { minHeight: layout.alvo }]}>
              <Text style={e.pularTexto}>Pular · fica como não respondida</Text>
            </TouchableOpacity>
            <Text style={e.nota}>A visita já está registrada. Pular não desfaz o check-in.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  fundoWeb: { justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.32)' },
  folha: { backgroundColor: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  folhaWeb: { width: '100%', maxWidth: 480, borderRadius: 8, maxHeight: '88%', shadowColor: '#000', shadowOpacity: 0.14, shadowOffset: { width: 0, height: 10 }, shadowRadius: 25 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: 'var(--text-muted)' },
  titulo: { fontSize: 20, fontWeight: '700', color: 'var(--text)', marginTop: 2 },
  fatos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  fato: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'var(--bg)' },
  fatoOk: { backgroundColor: 'var(--tint-green)' },
  fatoAviso: { backgroundColor: 'var(--tint-red)' },
  fatoTexto: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  fatoOkTexto: { color: 'var(--tint-green-text)' },
  fatoAvisoTexto: { color: 'var(--tint-red-text)' },
  pergunta: { fontSize: 17, fontWeight: '700', color: 'var(--text)', marginTop: 20, marginBottom: 10 },
  opcoes: { gap: 8 },
  opcao: { borderRadius: 12, borderWidth: 1.5, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', justifyContent: 'center', paddingHorizontal: 14 },
  opcaoAtiva: { borderColor: 'var(--brand-text)', backgroundColor: 'var(--tint-red)' },
  opcaoTexto: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  opcaoTextoAtiva: { color: 'var(--brand-text)' },
  rotulo: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 },
  opcional: { fontWeight: '500', textTransform: 'none', color: 'var(--text-subtle)' },
  campo: { backgroundColor: 'var(--bg)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: 'var(--text)', borderWidth: 1, borderColor: 'var(--border)' },
  salvar: { backgroundColor: '#222222', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  salvarTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pular: { justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  pularTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  nota: { fontSize: 12, color: 'var(--text-subtle)', textAlign: 'center', marginTop: 2 },
});
