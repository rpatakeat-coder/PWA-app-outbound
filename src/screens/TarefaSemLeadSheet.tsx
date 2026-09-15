// A ficha de uma tarefa do CRM cujo lead NÃO existe no app.
//
// Acontece bastante: o Cockpit cria a Task apontando para um negócio que
// nasceu no HubSpot e nunca virou pin. Antes o cartão ficava inerte — o
// vendedor via "Visita - Fulano" e não conseguia fazer nada com aquilo.
//
// Aqui ele vê o que a tarefa diz e pode COLOCAR O LEAD NO MAPA marcando onde
// ele está. A partir daí o lead passa a existir no app, com rota, check-in e
// mudança de etapa como qualquer outro.
//
// O VÍNCULO É O PONTO. O negócio JÁ EXISTE no HubSpot; este cadastro grava
// `id_hubspot` direto e NÃO chama `create_pin`. Chamar criaria um segundo deal
// para o mesmo cliente — foi exatamente o que aconteceu em 14/09/2026 numa
// reprocessagem, e deu sete duplicatas para apagar à mão.
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { KeyboardAvoidingView } from '../components/KeyboardAvoidingView';
import { Alert } from '../components/Alert';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import { useLayout } from '../hooks/useLayout';
import type { TarefaDoCrmNaTela } from '../hooks/useTarefasDoCrm';

export function TarefaSemLeadSheet({
  tarefa,
  ownerIdHubspot,
  aoFechar,
  aoCadastrar,
}: {
  tarefa: TarefaDoCrmNaTela;
  /** `hubspot_owner_id` de quem está logado — vira o dono do pin. */
  ownerIdHubspot: string | null;
  aoFechar: () => void;
  /** Chamado com o id do lead recém-criado, para a tela abrir a ficha dele. */
  aoCadastrar: (clientId: string) => void;
}) {
  const layout = useLayout();
  const { user, profile } = useAuth();
  const ehSomenteLeitura = (profile as { role?: string | null } | null)?.role === 'view';
  const [salvando, setSalvando] = useState(false);

  const quando = tarefa.venceEm
    ? new Date(tarefa.venceEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : 'sem data';
  const nome = tarefa.nomeDoCliente ?? 'Cliente não identificado';
  const acao = tarefa.assunto.replace(/^(?:visita|follow.?up)\s*[-–—]\s*/i, '').trim();

  const marcarAqui = async () => {
    setSalvando(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Localização desativada',
          'Para colocar este lead no mapa eu preciso da sua posição. Habilite nas configurações e tente de novo.',
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});

      // Vincula ao negócio que JÁ existe: `id_hubspot` vai preenchido e não há
      // chamada de create_pin. Ver o comentário do topo.
      //
      // `created_by` NÃO é opcional. A policy "Non-view users can create
      // clients" tem três condições, conferidas no banco em 15/09/2026:
      //
      //   auth.role() = 'authenticated'
      //   AND created_by = auth.uid()
      //   AND NOT is_view_only_user()
      //
      // Sem o campo a linha nasce com NULL, a segunda condição dá falso e o
      // PostgREST devolve "new row violates row-level security policy for table
      // clients" — foi assim que isto quebrou na tarefa do Tchê Churrasco. Todo
      // INSERT em `clients` no app manda este campo (ver `addClient` em
      // src/hooks/useClients.ts); este era o único que não mandava.
      const { data, error } = await supabase
        .from('clients')
        .insert({
          nome,
          empresa: nome,
          status: 'lead',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          id_hubspot: tarefa.marcador?.dealId ?? null,
          created_by: user?.id ?? null,
          vendedor_id_hubspot: ownerIdHubspot,
          geo_source: 'coords',
          // A posição é a DO VENDEDOR, não a do estabelecimento conferida.
          // Marcar como aproximada faz a ficha avisar isso em vez de afirmar
          // uma coordenada que ninguém validou.
          geo_approximate: true,
        })
        .select('id')
        .single();

      if (error || !data) {
        // O lead JÁ está no app, cadastrado por outra pessoa (ou por você, de
        // outro jeito): `clients.id_hubspot` é único. Insistir aqui só repete o
        // erro — o caminho é achar o pin que já existe.
        if (error?.code === '23505') {
          Alert.alert(
            'Esse lead já está no mapa',
            'Alguém já colocou este negócio no app. Procure por ele na busca do mapa — a tarefa passa a abrir a ficha dele assim que o app recarregar a lista.',
          );
          return;
        }
        Alert.alert('Não consegui cadastrar', error?.message ?? 'Erro desconhecido.');
        return;
      }
      aoFechar();
      aoCadastrar(data.id as string);
    } catch (err) {
      Alert.alert('Não consegui cadastrar', (err as Error)?.message ?? String(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={aoFechar}>
      <View style={[estilos.fundo, layout.ehLargo && estilos.fundoWeb]}>
        {/* Backdrop IRMÃO, nunca envolvendo — ver a regra do CLAUDE.md. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={aoFechar} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[estilos.folha, layout.ehLargo && estilos.folhaWeb]}
        >
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
            <View style={estilos.cabecalho}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.etiqueta}>Tarefa da gestão</Text>
                <Text style={estilos.titulo}>{nome}</Text>
              </View>
              <TouchableOpacity
                onPress={aoFechar}
                accessibilityRole="button"
                style={{ minHeight: layout.alvo, justifyContent: 'center', paddingLeft: 12 }}
              >
                <Text style={estilos.fechar}>Fechar</Text>
              </TouchableOpacity>
            </View>

            {/* O aviso vem ANTES do conteúdo: é o que explica por que esta ficha
                é diferente da do lead, e por que faltam rota e check-in. */}
            <View style={estilos.aviso}>
              <Text style={estilos.avisoTexto}>
                Este lead ainda não está no app. Dá para ver a tarefa, mas rota, check-in e
                mudança de etapa só funcionam depois de colocá-lo no mapa.
              </Text>
            </View>

            <Text style={estilos.rotulo}>O que foi pedido</Text>
            <Text style={estilos.valor}>{acao || tarefa.assunto}</Text>

            {!!tarefa.corpo && (
              <>
                <Text style={estilos.rotulo}>Detalhes</Text>
                <Text style={estilos.valor}>{tarefa.corpo}</Text>
              </>
            )}

            <Text style={estilos.rotulo}>Quando</Text>
            <Text style={estilos.valor}>
              {quando}
              {tarefa.tipo === 'visita' ? ' · visita' : tarefa.tipo === 'follow_up' ? ' · follow up' : ''}
            </Text>

            {!!tarefa.marcador?.dealId && (
              <>
                <Text style={estilos.rotulo}>ID HubSpot</Text>
                <Text style={estilos.valor}>{tarefa.marcador.dealId}</Text>
              </>
            )}

            {/* A policy tem três condições, e a terceira é `NOT
                is_view_only_user()`: quem é `view` não cria lead, por desenho.
                Dizer isso aqui é melhor do que deixar a pessoa tocar o botão e
                receber "violates row-level security policy" — que não é frase
                que se leia no meio da rua. */}
            {ehSomenteLeitura ? (
              <View style={estilos.aviso}>
                <Text style={estilos.avisoTexto}>
                  Sua conta é de visualização, então não dá para cadastrar o lead. Peça para
                  quem atende este negócio colocá-lo no mapa.
                </Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  onPress={marcarAqui}
                  disabled={salvando}
                  accessibilityRole="button"
                  style={[estilos.botao, { minHeight: layout.alvo }, salvando && { opacity: 0.5 }]}
                >
                  <Text style={estilos.botaoTexto}>
                    {salvando ? 'Cadastrando…' : 'Estou no local — colocar no mapa'}
                  </Text>
                </TouchableOpacity>
                <Text style={estilos.ajuda}>
                  Usa a sua posição atual. O negócio no HubSpot continua o mesmo — o lead entra
                  no app ligado a ele, sem criar um segundo.
                </Text>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  fundoWeb: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  folha: {
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  folhaWeb: { width: '100%', maxWidth: 560, borderRadius: 8, maxHeight: '88%' },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  etiqueta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'var(--brand-text)',
    marginBottom: 4,
  },
  titulo: { fontSize: 20, fontWeight: '700', color: 'var(--text)' },
  fechar: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  aviso: {
    backgroundColor: 'var(--tint-amber)',
    borderLeftWidth: 3,
    borderLeftColor: 'var(--tint-amber-text)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  avisoTexto: { fontSize: 13, color: 'var(--tint-amber-text)', lineHeight: 18 },
  rotulo: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'var(--text-subtle)',
    marginTop: 14,
  },
  valor: { fontSize: 15, color: 'var(--text)', marginTop: 3, lineHeight: 21 },
  botao: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  botaoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ajuda: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 8, lineHeight: 16 },
});
