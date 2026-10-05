// LIMPAR O FUNIL EM LOTE (Julyan, 05/10/2026: "tem q jogar pra perdido rápido também" — no
// cartão do lead, vários de uma vez, e "não só reciclagem").
//
// A carteira inteira do executivo (a mesma da Lista do computador, que vem da fila-tarefas
// com etapa ao vivo e dias na etapa), quem passou da régua primeiro. Ele marca vários e
// manda para Perdido (com UM motivo para todos) ou para Reciclagem.
//
// Por baixo é o MESMO caminho de um por um: negocio-acao op mudar-etapa, um negócio por vez,
// com as regras do servidor (recusa aparece na linha). Nada sai antes de 5 s: o "Desfazer"
// cancela sem ter escrito nada no HubSpot. Sem sinal, cada um entra na fila offline, como
// na folha de etapa.
//
// Ag. Pagamento NÃO entra: amount/mrr dessa etapa são o que o RPA/Asaas lê para gerar o
// link, e daqui não se mexe em cobrança. Ganho e Onboarding não estão na carteira.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { IconCheck } from '../components/icons';
import { Painel } from '../components/Painel';
import { Toast } from '../components/Toast';
import { ETAPA, MOTIVOS_PERDIDO, MOTIVOS_QUE_EXIGEM_TEXTO, ROTULO_ETAPA, montarPropriedades } from '../utils/fichaDeRua';
import { enfileirar, ehErroDeRede, novoAcaoId } from '../utils/filaOffline';
import { negocioAcao } from '../utils/negocioAcao';
import { opcoesDaFila } from './FilaTarefasScreen';

type Linha = {
  dealId: string; clientId: string | null; negocio: string; etapaId: string; diasNaEtapa: number | null;
  ultimoContato: string | null; contatos: number; proximoPasso: string | null;
};
type Resultado = { dealId: string; ok: boolean; fila?: boolean; erro?: string };

type Props = {
  visivel: boolean;
  /** Negócio do cartão de onde se abriu: já vem marcado. */
  dealInicial: string | null;
  reguaDe: (etapaId: string) => number | null;
  onFechar: () => void;
  /** Um negócio mudou de etapa no HubSpot: o app atualiza o lead (cartão, pino, histórico). */
  onMudou: (clientId: string, codigo: string, etapaAntes: string) => void;
};

const SEGUNDOS_PARA_DESFAZER = 5;

export default function LimparFunil({ visivel, dealInicial, reguaDe, onFechar, onMudou }: Props) {
  const qc = useQueryClient();
  const fila = useQuery(opcoesDaFila());
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [soEstourados, setSoEstourados] = useState(true);
  const [destino, setDestino] = useState<string>(ETAPA.perdido);
  const [motivo, setMotivo] = useState<string>('');
  const [texto, setTexto] = useState('');
  const [fase, setFase] = useState<'escolher' | 'confirmar' | 'contando' | 'enviando' | 'feito'>('escolher');
  const [conta, setConta] = useState(SEGUNDOS_PARA_DESFAZER);
  const [feitos, setFeitos] = useState<Resultado[]>([]);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visivel) return;
    setMarcados(new Set(dealInicial ? [dealInicial] : []));
    setSoEstourados(true); setDestino(ETAPA.perdido); setMotivo(''); setTexto('');
    setFase('escolher'); setFeitos([]);
  }, [visivel, dealInicial]);
  useEffect(() => () => { if (relogio.current) clearInterval(relogio.current); }, []);

  const passou = (l: Linha) => { const r = reguaDe(l.etapaId); return r != null && l.diasNaEtapa != null && l.diasNaEtapa > r; };
  const todas = useMemo(() => {
    const carteira = ((fila.data as { carteira?: Linha[] } | undefined)?.carteira ?? [])
      .filter((l) => l.etapaId !== ETAPA.pagamento);
    return carteira.slice().sort((a, b) => (Number(passou(b)) - Number(passou(a))) || ((b.diasNaEtapa ?? -1) - (a.diasNaEtapa ?? -1)));
  }, [fila.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const estourados = todas.filter(passou).length;
  // o lead do cartão aparece mesmo que esteja dentro da régua
  const linhas = soEstourados ? todas.filter((l) => passou(l) || l.dealId === dealInicial) : todas;
  const selecionadas = todas.filter((l) => marcados.has(l.dealId));

  const pedeTexto = destino === ETAPA.perdido && MOTIVOS_QUE_EXIGEM_TEXTO.includes(motivo);
  const prontoParaEnviar = selecionadas.length > 0 && (destino !== ETAPA.perdido || (!!motivo && (!pedeTexto || texto.trim().length > 0)));
  const rotuloMotivo = MOTIVOS_PERDIDO.find((m) => m.valor === motivo)?.rotulo ?? motivo;

  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarTodos = () => setMarcados((m) => {
    const visiveis = linhas.map((l) => l.dealId);
    const todosMarcados = visiveis.every((id) => m.has(id));
    const n = new Set(m);
    visiveis.forEach((id) => { if (todosMarcados) n.delete(id); else n.add(id); });
    return n;
  });

  function comecarContagem() {
    saiu.current = false; setFase('contando'); setConta(SEGUNDOS_PARA_DESFAZER);
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = setInterval(() => setConta((c) => Math.max(0, c - 1)), 1000);
  }
  // o envio sai do efeito, não do relógio: updater de estado pode rodar duas vezes
  const saiu = useRef(false);
  useEffect(() => {
    if (fase !== 'contando' || conta > 0 || saiu.current) return;
    saiu.current = true;
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
    void enviar();
  }, [fase, conta]); // eslint-disable-line react-hooks/exhaustive-deps
  function desfazer() {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
    setFase('confirmar');
  }

  async function enviar() {
    setFase('enviando');
    const digitado: Record<string, string> = destino === ETAPA.perdido
      ? { motivo_do_perdido: motivo, ...(pedeTexto ? { observacao__desqualificado: texto.trim() } : {}) } : {};
    const { propriedades } = montarPropriedades(destino, digitado, {});
    const res: Resultado[] = [];
    // um por vez: o servidor confere dono e regra de cada negócio, e o HubSpot limita rajada
    for (const l of selecionadas) {
      const corpo = { op: 'mudar-etapa', dealId: l.dealId, novaEtapa: destino, propriedades };
      try {
        await negocioAcao(corpo);
        res.push({ dealId: l.dealId, ok: true });
        if (l.clientId) onMudou(l.clientId, destino, l.etapaId);
      } catch (err) {
        if (ehErroDeRede(err)) {
          await enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `Etapa → ${ROTULO_ETAPA[destino]} · ${l.negocio}`, payload: { corpo } });
          res.push({ dealId: l.dealId, ok: true, fila: true });
        } else {
          res.push({ dealId: l.dealId, ok: false, erro: String((err as Error)?.message ?? err) });
        }
      }
      setFeitos(res.slice());
    }
    void qc.invalidateQueries({ queryKey: ['fila_tarefas'] });
    const ok = res.filter((r) => r.ok && !r.fila).length, naFila = res.filter((r) => r.fila).length, recusados = res.filter((r) => !r.ok).length;
    Toast.mostrar(
      [ok ? `${ok} em ${ROTULO_ETAPA[destino]} · HubSpot + Cockpit` : '', naFila ? `${naFila} na fila, sem sinal` : '', recusados ? `${recusados} recusado${recusados === 1 ? '' : 's'}` : '']
        .filter(Boolean).join(' · ') || 'Nada mudou',
      recusados ? 'erro' : naFila ? 'fila' : 'ok');
    setFase('feito');
  }

  const nomeDe = (id: string) => todas.find((l) => l.dealId === id)?.negocio ?? id;
  const resumo = `${selecionadas.length} ${selecionadas.length === 1 ? 'negócio' : 'negócios'} para ${ROTULO_ETAPA[destino]}${destino === ETAPA.perdido && motivo ? ` · ${rotuloMotivo}` : ''}`;

  const rodape = fase === 'escolher' ? (
    <View style={s.rodape}>
      <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrin, !prontoParaEnviar && s.botaoOff]} disabled={!prontoParaEnviar} onPress={() => setFase('confirmar')}>
        <Text style={s.botaoPrinTexto}>{selecionadas.length
          ? `Mover ${selecionadas.length} para ${ROTULO_ETAPA[destino]}`
          : 'Marque os negócios'}</Text>
      </Pressable>
    </View>
  ) : fase === 'confirmar' ? (
    <View style={s.rodape}>
      <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec]} onPress={() => setFase('escolher')}>
        <Text style={s.botaoSecTexto}>Voltar</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrin]} onPress={comecarContagem}>
        <Text style={s.botaoPrinTexto}>Confirmar</Text>
      </Pressable>
    </View>
  ) : fase === 'contando' ? (
    <View style={s.rodape}>
      <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec, { flex: 1 }]} onPress={desfazer}>
        <Text style={s.botaoSecTexto}>{`Desfazer · ${conta} s`}</Text>
      </Pressable>
    </View>
  ) : fase === 'feito' ? (
    <View style={s.rodape}>
      <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrin]} onPress={onFechar}>
        <Text style={s.botaoPrinTexto}>Fechar</Text>
      </Pressable>
    </View>
  ) : undefined;

  return (
    <Painel visivel={visivel} aoFechar={fase === 'enviando' || fase === 'contando' ? () => {} : onFechar} rotulo="Limpar funil"
      topo={<Text style={s.titulo}>Limpar funil</Text>} rodape={rodape}>
      <View style={s.corpo}>
        {fase === 'escolher' && (
          <>
            <Text style={s.ajuda}>Marque os negócios parados e mande todos de uma vez. Ag. Pagamento não entra aqui.</Text>
            <View style={s.chips}>
              {[ETAPA.perdido, ETAPA.reciclagem].map((id) => (
                <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: destino === id }}
                  onPress={() => setDestino(id)} style={[s.chip, destino === id && s.chipAtivo]}>
                  <Text style={[s.chipTexto, destino === id && s.chipTextoAtivo]}>{ROTULO_ETAPA[id]}</Text>
                </Pressable>
              ))}
            </View>
            {destino === ETAPA.perdido ? (
              <View style={{ gap: 6 }}>
                <Text style={s.campoRotulo}>Motivo do perdido · vale para todos</Text>
                <View style={s.chips}>
                  {MOTIVOS_PERDIDO.map((m) => (
                    <Pressable key={m.valor} accessibilityRole="button" accessibilityState={{ selected: motivo === m.valor }}
                      onPress={() => setMotivo(m.valor)} style={[s.chip, motivo === m.valor && s.chipAtivo]}>
                      <Text style={[s.chipTexto, motivo === m.valor && s.chipTextoAtivo]}>{m.rotulo}</Text>
                    </Pressable>
                  ))}
                </View>
                {pedeTexto && (
                  <TextInput style={s.input} value={texto} onChangeText={setTexto} placeholder="O que pesou (vai para todos)" placeholderTextColor="#8B919C" />
                )}
              </View>
            ) : (
              <Text style={s.ajuda}>Reciclagem é a lateral do funil: sai da régua e pode voltar para Visita depois.</Text>
            )}
            <View style={s.filtros}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: soEstourados }} onPress={() => setSoEstourados(true)} style={[s.chip, soEstourados && s.chipAtivo]}>
                <Text style={[s.chipTexto, soEstourados && s.chipTextoAtivo]}>{`Passaram da régua · ${estourados}`}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: !soEstourados }} onPress={() => setSoEstourados(false)} style={[s.chip, !soEstourados && s.chipAtivo]}>
                <Text style={[s.chipTexto, !soEstourados && s.chipTextoAtivo]}>{`Todos · ${todas.length}`}</Text>
              </Pressable>
              {linhas.length > 0 && (
                <Pressable accessibilityRole="button" onPress={marcarTodos} style={s.marcarTodos}>
                  <Text style={s.marcarTodosTexto}>{linhas.every((l) => marcados.has(l.dealId)) ? 'Desmarcar todos' : 'Marcar todos'}</Text>
                </Pressable>
              )}
            </View>
            {fila.isLoading && !fila.data ? (
              <ActivityIndicator style={{ marginVertical: 24 }} />
            ) : fila.isError && !fila.data ? (
              <Text style={s.recusa}>Não consegui ler a carteira. Tente de novo em instantes.</Text>
            ) : !linhas.length ? (
              <Text style={s.ajuda}>{soEstourados ? 'Nenhum negócio passou da régua. ' : 'Carteira vazia. '}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
                {linhas.map((l) => {
                  const r = reguaDe(l.etapaId);
                  const on = marcados.has(l.dealId);
                  const fora = passou(l);
                  return (
                    <Pressable key={l.dealId} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                      onPress={() => alternar(l.dealId)} style={[s.linha, on && s.linhaOn]}>
                      <View style={[s.caixa, on && s.caixaOn]}>{on && <IconCheck width={14} height={14} fill="#FFFFFF" />}</View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.linhaNome} numberOfLines={1}>{l.negocio}</Text>
                        <Text style={[s.linhaSub, fora && s.linhaSubFora]} numberOfLines={1}>
                          {`${ROTULO_ETAPA[l.etapaId] ?? ''}${l.diasNaEtapa != null ? ` · há ${l.diasNaEtapa} ${l.diasNaEtapa === 1 ? 'dia útil' : 'dias úteis'}` : ''}${fora && r != null ? ` · régua ${r}` : ''}${l.proximoPasso ? ' · tem próximo passo' : ''}`}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}
        {(fase === 'confirmar' || fase === 'contando') && (
          <View style={{ gap: 10 }}>
            <Text style={s.confirmaTitulo}>{resumo}</Text>
            <Text style={s.ajuda}>{fase === 'contando'
              ? 'Saindo em instantes. Até lá, nada foi gravado: Desfazer volta para a lista.'
              : 'Vai para o HubSpot e o Cockpit. Depois de gravado, cada um volta só pelo cartão (Reabrir em Reciclagem).'}</Text>
            <View style={{ gap: 4 }}>
              {selecionadas.slice(0, 12).map((l) => <Text key={l.dealId} style={s.confirmaItem} numberOfLines={1}>{`· ${l.negocio}`}</Text>)}
              {selecionadas.length > 12 && <Text style={s.ajuda}>{`e mais ${selecionadas.length - 12}`}</Text>}
            </View>
          </View>
        )}
        {(fase === 'enviando' || fase === 'feito') && (
          <View style={{ gap: 8 }}>
            <Text style={s.confirmaTitulo}>{fase === 'enviando' ? `Gravando ${feitos.length} de ${selecionadas.length}…` : resumo}</Text>
            {feitos.map((r) => (
              <Text key={r.dealId} style={[s.confirmaItem, !r.ok && s.itemRecusado]} numberOfLines={2}>
                {`${r.ok ? (r.fila ? '· na fila ·' : '· feito ·') : '· recusado ·'} ${nomeDe(r.dealId)}${r.erro ? ` — ${r.erro}` : ''}`}
              </Text>
            ))}
          </View>
        )}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  titulo: { fontSize: 18, fontWeight: '800', color: 'var(--text)', paddingHorizontal: 16, paddingVertical: 12 },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  ajuda: { fontSize: 13, color: 'var(--text-muted)' },
  recusa: { fontSize: 14, color: 'var(--tint-red-text)', backgroundColor: 'var(--tint-red)', padding: 12, borderRadius: 12 },
  campoRotulo: { fontSize: 14, fontWeight: '800', color: 'var(--text)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', justifyContent: 'center' },
  chipAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  chipTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  chipTextoAtivo: { color: 'var(--tint-red-text)' },
  marcarTodos: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center', marginLeft: 'auto' },
  marcarTodosTexto: { fontSize: 13, fontWeight: '800', color: 'var(--brand-text)' },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', paddingHorizontal: 12, fontSize: 16, color: 'var(--text)' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12 },
  linhaOn: { backgroundColor: 'var(--surface-2)' },
  caixa: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  caixaOn: { backgroundColor: 'var(--vermelho-acao)', borderColor: 'var(--vermelho-acao)' },
  linhaNome: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  linhaSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  linhaSubFora: { color: 'var(--vermelho-texto)' },
  confirmaTitulo: { fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  confirmaItem: { fontSize: 14, color: 'var(--text)' },
  itemRecusado: { color: 'var(--tint-red-text)' },
  rodape: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  botao: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botaoSec: { flex: 1, borderWidth: 1, borderColor: 'var(--border)' },
  botaoSecTexto: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  botaoPrin: { flex: 2, backgroundColor: 'var(--vermelho-acao)' },
  botaoPrinTexto: { fontSize: 15, fontWeight: '800', color: '#fff' },
  botaoOff: { opacity: 0.5 },
});
