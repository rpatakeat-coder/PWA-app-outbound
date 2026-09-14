// O desfecho da visita — o que aconteceu lá dentro.
//
// Sobe sozinha logo depois do check-in, com saída visível ("Agora não"). O
// check-in continua sendo UM toque e já gravou: esta folha nunca segura a
// visita, nunca desfaz nada e pode ser fechada sem custo. Se fosse obrigatória,
// uma queda de rede na porta do cliente deixaria a visita sem registro — e a
// visita é o dado mais caro que o app coleta.
//
// O que ela grava está em `enviarDesfechoDaVisita` (três escritas
// independentes no HubSpot). O formato do bloco está em utils/desfechoVisita.ts.
//
// Por que existe: em 14/09/2026, dos 154 negócios na etapa Visita do pipeline
// Field Sales, 134 estavam sem `nome_do_sistema` e 124 sem
// `gargalo_operacional` — as duas perguntas que definem o pitch em foodservice.
import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from '../components/KeyboardAvoidingView';
import { Alert } from '../components/Alert';
import { useLayout } from '../hooks/useLayout';
import { diaBRT } from '../hooks/useMinhaDaily';
import {
  CANAIS,
  DESFECHOS,
  GARGALOS,
  proximoDiaUtil,
  type Canal,
  type Desfecho,
  type Gargalo,
} from '../utils/desfechoVisita';
import { enviarDesfechoDaVisita } from '../utils/hubspotSync';

type Props = {
  idHubspot: string;
  cliente: string;
  /** ISO do check-in — a nota é datada na visita, não no envio. */
  visitadoEm: string;
  ownerId: string | null;
  aoFechar: () => void;
};

/** Prazos em dias ÚTEIS. A régua de cadência do produto anda em D+1/D+3/D+7. */
const PRAZOS = [
  { dias: 1, rotulo: 'Amanhã' },
  { dias: 3, rotulo: 'Em 3 dias' },
  { dias: 7, rotulo: 'Em 1 semana' },
] as const;

const ROTULO_CANAL: Record<Canal, string> = {
  visita: 'Revisita',
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
};

function Chip({
  texto,
  ativo,
  aoTocar,
  altura,
}: {
  texto: string;
  ativo: boolean;
  aoTocar: () => void;
  altura: number;
}) {
  return (
    <TouchableOpacity
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      style={[
        estilos.chip,
        { minHeight: altura },
        ativo && { borderColor: 'var(--brand-text)', backgroundColor: 'var(--tint-red)' },
      ]}
    >
      <Text style={[estilos.chipTexto, ativo && { color: 'var(--brand-text)' }]}>{texto}</Text>
    </TouchableOpacity>
  );
}

function Secao({ titulo, opcional, children }: { titulo: string; opcional?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={estilos.rotulo}>
        {titulo}
        {opcional ? <Text style={estilos.rotuloOpcional}>  opcional</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export function DesfechoVisitaSheet({ idHubspot, cliente, visitadoEm, ownerId, aoFechar }: Props) {
  const layout = useLayout();
  const [desfecho, setDesfecho] = useState<Desfecho | null>(null);
  const [sistema, setSistema] = useState('');
  const [gargalo, setGargalo] = useState<Gargalo | null>(null);
  const [canal, setCanal] = useState<Canal | null>(null);
  const [prazo, setPrazo] = useState<number | null>(null);
  const [acao, setAcao] = useState('');
  const [observacao, setObservacao] = useState('');

  // O dia do próximo passo sai do dia da VISITA, não de "hoje": o vendedor pode
  // estar preenchendo à noite, e "amanhã" precisa contar a partir da visita.
  const diaDoPasso = useMemo(
    () => (prazo == null ? null : proximoDiaUtil(diaBRT(visitadoEm), prazo)),
    [prazo, visitadoEm],
  );

  const salvar = () => {
    if (!desfecho) return;
    const passo =
      canal && diaDoPasso && acao.trim() ? { canal, dia: diaDoPasso, acao: acao.trim() } : null;

    // Fecha JÁ: o vendedor segue pro próximo cliente sem esperar rede. As três
    // escritas continuam em segundo plano, e só falam se alguma falhar — a
    // visita já está gravada, então silêncio aqui significa "deu certo".
    void (async () => {
      try {
        const r = await enviarDesfechoDaVisita({
          id_hubspot: idHubspot,
          cliente,
          ocorridoEm: visitadoEm,
          desfecho,
          nomeDoSistema: sistema.trim() || null,
          gargalo,
          proximoPasso: passo,
          observacao: observacao.trim() || null,
          ownerId,
        });
        if (r.erros.length > 0) {
          Alert.alert(
            'Parte do desfecho não subiu',
            `${r.erros.join('\n')}\n\nA visita está registrada. Dá pra tentar de novo pela ficha do lead.`,
          );
        }
      } catch (err) {
        Alert.alert('Não consegui enviar o desfecho', (err as Error)?.message ?? String(err));
      }
    })();

    aoFechar();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={aoFechar}>
      <View style={[estilos.fundo, layout.ehLargo && estilos.fundoWeb]}>
        {/* Backdrop IRMÃO do conteúdo, nunca envolvendo: em navegador touch um
            Pressable em volta vira responder, cancela o click sintético e o
            TextInput nunca recebe foco — no PWA do celular não dá pra digitar. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={aoFechar} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[estilos.folha, layout.ehLargo && estilos.folhaWeb]}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={estilos.cabecalho}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.titulo}>Como foi a visita?</Text>
                <Text style={estilos.subtitulo} numberOfLines={1}>
                  {cliente}
                </Text>
              </View>
              <TouchableOpacity
                onPress={aoFechar}
                accessibilityRole="button"
                style={{ minHeight: layout.alvo, justifyContent: 'center', paddingLeft: 12 }}
              >
                <Text style={estilos.agoraNao}>Agora não</Text>
              </TouchableOpacity>
            </View>

            <Text style={estilos.explica}>
              A visita já está registrada. Isto aqui é o que você viu lá dentro.
            </Text>

            <Secao titulo="Como terminou">
              <View style={estilos.grade}>
                {DESFECHOS.map((d) => (
                  <Chip
                    key={d.valor}
                    texto={d.rotulo}
                    ativo={desfecho === d.valor}
                    aoTocar={() => setDesfecho(d.valor)}
                    altura={layout.alvo}
                  />
                ))}
              </View>
            </Secao>

            <Secao titulo="Sistema que usa hoje" opcional>
              <TextInput
                style={estilos.campo}
                placeholder="Ex.: Saipos, Colibri, nenhum"
                placeholderTextColor="var(--text-subtle)"
                value={sistema}
                onChangeText={setSistema}
                autoCapitalize="sentences"
              />
            </Secao>

            <Secao titulo="Maior gargalo" opcional>
              <View style={estilos.grade}>
                {GARGALOS.map((g) => (
                  <Chip
                    key={g}
                    texto={g}
                    ativo={gargalo === g}
                    aoTocar={() => setGargalo(gargalo === g ? null : g)}
                    altura={layout.alvo}
                  />
                ))}
              </View>
            </Secao>

            <Secao titulo="Próximo passo" opcional>
              <View style={estilos.grade}>
                {CANAIS.map((c) => (
                  <Chip
                    key={c}
                    texto={ROTULO_CANAL[c]}
                    ativo={canal === c}
                    aoTocar={() => setCanal(canal === c ? null : c)}
                    altura={layout.alvo}
                  />
                ))}
              </View>
              <View style={[estilos.grade, { marginTop: 8 }]}>
                {PRAZOS.map((p) => (
                  <Chip
                    key={p.dias}
                    texto={p.rotulo}
                    ativo={prazo === p.dias}
                    aoTocar={() => setPrazo(prazo === p.dias ? null : p.dias)}
                    altura={layout.alvo}
                  />
                ))}
              </View>
              {diaDoPasso ? (
                <Text style={estilos.dica}>
                  Vence em {diaDoPasso.split('-').reverse().join('/')} — só dia útil, porque a rua
                  não acontece no fim de semana.
                </Text>
              ) : null}
              <TextInput
                style={[estilos.campo, { marginTop: 8 }]}
                placeholder="O que você combinou de fazer"
                placeholderTextColor="var(--text-subtle)"
                value={acao}
                onChangeText={setAcao}
                autoCapitalize="sentences"
              />
              {acao.trim() && !(canal && diaDoPasso) ? (
                <Text style={estilos.aviso}>
                  Escolha o canal e o prazo para virar tarefa no HubSpot. Sem isso, o texto fica só
                  na nota.
                </Text>
              ) : null}
            </Secao>

            <Secao titulo="Observação" opcional>
              <TextInput
                style={[estilos.campo, estilos.campoAlto]}
                placeholder="O que mais importa lembrar na próxima"
                placeholderTextColor="var(--text-subtle)"
                value={observacao}
                onChangeText={setObservacao}
                multiline
                autoCapitalize="sentences"
              />
            </Secao>

            <TouchableOpacity
              onPress={salvar}
              disabled={!desfecho}
              accessibilityRole="button"
              style={[estilos.salvar, { minHeight: layout.alvo }, !desfecho && estilos.desabilitado]}
            >
              <Text style={estilos.salvarTexto}>Salvar desfecho</Text>
            </TouchableOpacity>
            {!desfecho ? (
              <Text style={estilos.dicaCentro}>Escolha como a visita terminou para salvar.</Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  fundoWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  folha: {
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  folhaWeb: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 8,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 25,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  titulo: { fontSize: 20, fontWeight: '700', color: 'var(--text)' },
  subtitulo: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },
  agoraNao: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  explica: { fontSize: 13, color: 'var(--text-subtle)', marginBottom: 18, lineHeight: 18 },
  rotulo: {
    fontSize: 12,
    fontWeight: '700',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  rotuloOpcional: { fontWeight: '500', textTransform: 'none', color: 'var(--text-subtle)' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
  },
  chipTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text-muted)' },
  campo: {
    backgroundColor: 'var(--bg)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: 'var(--text)',
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  campoAlto: { minHeight: 80, textAlignVertical: 'top' },
  dica: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 8, lineHeight: 16 },
  dicaCentro: { fontSize: 12, color: 'var(--text-subtle)', textAlign: 'center', marginTop: 8 },
  aviso: { fontSize: 12, color: 'var(--tint-amber-text)', marginTop: 6, lineHeight: 16 },
  salvar: {
    backgroundColor: '#222222',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  salvarTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  desabilitado: { opacity: 0.4 },
});
