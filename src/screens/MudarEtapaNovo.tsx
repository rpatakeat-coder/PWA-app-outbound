// Mudar etapa no mapa novo (prompt final corrigido §8.4).
//
// As etapas oficiais na ordem (Reciclagem e Perdido no fim), a atual marcada,
// as que o servidor recusaria desabilitadas com o motivo (pular fase, Ganho).
// Escolhida a etapa, aparecem SÓ os campos obrigatórios que o negócio ainda não
// tem (mapa_negocio, 0108), com as picklists exatas. Grava por negocio-acao
// (op mudar-etapa); a recusa do servidor aparece aqui com a mensagem dele. Sem
// sinal, entra na fila. Ag. Pagamento abre Emitir cobrança (handoff v4.1
// §7.3) — o contrato inteiro, pelo celular. Com a cobrança emitida, daqui só
// se sai para Reciclagem ou Perdido (a mesma trava do servidor).
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CampoData } from '../components/CampoData';
import { Painel } from '../components/Painel';
import { Toast } from '../components/Toast';
import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';
import { enfileirar, ehErroDeRede, novoAcaoId } from '../utils/filaOffline';
import {
  ETAPA, ETAPAS_DA_FOLHA, MOTIVOS_PERDIDO, MOTIVOS_QUE_EXIGEM_TEXTO, PICKLIST, PROPS_OBRIGATORIAS_POR_ETAPA, ROTULO_ETAPA,
  ROTULO_PROP, TIPO_CAMPO, montarPropriedades, movimentoPermitido,
} from '../utils/fichaDeRua';
import { negocioAcao } from '../utils/negocioAcao';
import EmitirCobranca from './EmitirCobranca';

type Props = {
  visivel: boolean;
  client: Client;
  etapaAtual: string | null;
  onFechar: () => void;
  /** `propriedades`: o que foi ao HubSpot junto (o telefone também vai para o lead do app). */
  onMudou: (codigo: string, propriedades?: Record<string, unknown>) => void;
  /** Botão de avanço do bloco NEGÓCIO: já abre na etapa escolhida. */
  destinoInicial?: string | null;
  /** Campos que já chegam preenchidos (o "Não vale" traz o motivo do Perdido). */
  preenchido?: Record<string, string> | null;
};

// O que cada etapa pede, à direita da linha (handoff §6.5).
function pedeTexto(id: string): string {
  if (id === ETAPA.pagamento) return 'abre Emitir cobrança';
  const campos = PROPS_OBRIGATORIAS_POR_ETAPA[id] ?? [];
  return campos.length ? `pede ${campos.map((k) => ROTULO_PROP[k] ?? k).join(', ')}` : 'não pede nada novo';
}

const ROTULO_PICK: Record<string, string> = { Reembolso: 'Estorno', GoogleMaps: 'Google Maps', Familia: 'Família' };

export default function MudarEtapaNovo({ visivel, client, etapaAtual, onFechar, onMudou, destinoInicial = null, preenchido = null }: Props) {
  const [destino, setDestino] = useState<string | null>(null);
  const [digitado, setDigitado] = useState<Record<string, string>>({});
  const [jaTem, setJaTem] = useState<Record<string, unknown>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [recusa, setRecusa] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const dealId = client.id_hubspot ? String(client.id_hubspot) : null;
  const nome = client.empresa?.trim() || client.nome;

  useEffect(() => {
    if (!visivel) return;
    setDestino(destinoInicial); setDigitado(preenchido ? { ...preenchido } : {}); setErros({}); setRecusa(null);
    if (!dealId) return;
    // Snapshot do Cockpit (mapa_negocio) + leitura AO VIVO do HubSpot (ler_negocio):
    // o snapshot atrasa até 2 h e pedia de novo o que o registro acabou de gravar
    // (auditoria 26/09). O vivo vence; o telefone do cadastro é a última reserva.
    let vivo = true;
    const base: Record<string, unknown> = client.telefone ? { celular: client.telefone } : {};
    setJaTem(base);
    Promise.all([
      supabase.rpc('mapa_negocio', { p_deal: dealId }).then(({ data }) => (data as Record<string, unknown>) ?? {}, () => ({})),
      client.vendedor_id_hubspot
        ? supabase.functions.invoke('hubspot-sync', { body: { type: 'ler_negocio', id_hubspot: dealId, owner_id: String(client.vendedor_id_hubspot) } })
            .then(({ data }) => ((data as { propriedades?: Record<string, unknown> } | null)?.propriedades ?? {}), () => ({}))
        : Promise.resolve({}),
    ]).then(([snap, aoVivo]) => { if (vivo) setJaTem({ ...base, ...snap, ...aoVivo }); });
    return () => { vivo = false; };
  }, [visivel, dealId, destinoInicial]); // eslint-disable-line react-hooks/exhaustive-deps

  const exigidos = destino
    ? [...(PROPS_OBRIGATORIAS_POR_ETAPA[destino] ?? []),
      ...(destino === ETAPA.perdido && MOTIVOS_QUE_EXIGEM_TEXTO.includes(digitado.motivo_do_perdido ?? '') ? ['observacao__desqualificado'] : [])]
      .filter((k) => k === 'motivo_do_perdido' || k === 'observacao__desqualificado' || !(jaTem[k] != null && String(jaTem[k]).trim()))
    : [];

  async function confirmar() {
    if (!destino || !dealId || enviando) return;
    const { propriedades, erros: e } = montarPropriedades(destino, digitado, jaTem);
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true); setRecusa(null);
    const corpo = { op: 'mudar-etapa', dealId, novaEtapa: destino, propriedades };
    try {
      await negocioAcao(corpo);
      onMudou(destino, propriedades as Record<string, unknown>);
      Toast.mostrar(`✓ ${nome} → ${ROTULO_ETAPA[destino]} · HubSpot + Cockpit`, 'ok');
      onFechar();
    } catch (err) {
      if (ehErroDeRede(err)) {
        await enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `Etapa → ${ROTULO_ETAPA[destino]} · ${nome}`, payload: { corpo } });
        Toast.mostrar(`Sem sinal · ${ROTULO_ETAPA[destino]} na fila, sobe sozinho`, 'fila');
        onFechar();
      } else {
        setRecusa(String((err as Error)?.message ?? err));
      }
    } finally {
      setEnviando(false);
    }
  }

  const campo = (k: string) => {
    const tipo = TIPO_CAMPO[k] ?? 'texto';
    const opcoes = k === 'motivo_do_perdido' ? MOTIVOS_PERDIDO.map((m) => m.valor) : PICKLIST[k];
    return (
      <View key={k} style={s.campoBloco}>
        <Text style={s.campoRotulo}>{k === 'observacao__desqualificado' ? 'O que pesou' : (ROTULO_PROP[k] ?? k).replace(/^./, (c) => c.toUpperCase())}</Text>
        {tipo === 'selecao' && opcoes ? (
          <View style={s.chips}>
            {opcoes.map((o) => (
              <Pressable key={o} accessibilityRole="button" accessibilityState={{ selected: digitado[k] === o }}
                onPress={() => setDigitado((d) => ({ ...d, [k]: o }))} style={[s.chip, digitado[k] === o && s.chipAtivo]}>
                <Text style={[s.chipTexto, digitado[k] === o && s.chipTextoAtivo]}>{ROTULO_PICK[o] ?? o}</Text>
              </Pressable>
            ))}
          </View>
        ) : tipo === 'data' ? (
          // abre o calendário do aparelho (o TextInput descartava type="date")
          <CampoData
            valor={digitado[k] ?? ''}
            aoMudar={(v) => setDigitado((d) => ({ ...d, [k]: v }))}
            rotulo={(ROTULO_PROP[k] ?? k).replace(/^./, (c) => c.toUpperCase())}
            estilo={s.input}
          />
        ) : (
          <TextInput
            style={s.input}
            value={digitado[k] ?? ''}
            onChangeText={(v) => setDigitado((d) => ({ ...d, [k]: v }))}
            placeholder={tipo === 'numero' ? 'R$ por mês' : tipo === 'tel' ? '(27) 99999-9999' : ''}
            placeholderTextColor="#8B919C"
            keyboardType={tipo === 'numero' ? 'decimal-pad' : tipo === 'tel' ? 'phone-pad' : 'default'}
          />
        )}
        {!!erros[k] && <Text style={s.erro}>{erros[k]}</Text>}
      </View>
    );
  };

  return (
    <Painel visivel={visivel} aoFechar={onFechar} rotulo="Mudar etapa"
      topo={<Text style={s.titulo}>{`Mudar etapa · ${nome}`}</Text>}
      rodape={destino && destino !== ETAPA.pagamento ? (
        <View style={s.rodape}>
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec]} onPress={() => setDestino(null)} disabled={enviando}>
            <Text style={s.botaoSecTexto}>Voltar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrin]} onPress={confirmar} disabled={enviando}>
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoPrinTexto}>{`Mover para ${ROTULO_ETAPA[destino]}`}</Text>}
          </Pressable>
        </View>
      ) : undefined}
    >
      <View style={s.corpo}>
        {!dealId ? (
          <Text style={s.aviso}>Este lead ainda não tem negócio no HubSpot. A etapa passa a existir quando o negócio for criado.</Text>
        ) : !destino ? (
          [...ETAPAS_DA_FOLHA.slice(0, 7), ETAPA.ganho, ...ETAPAS_DA_FOLHA.slice(7)].map((id, i) => {
            const atual = id === etapaAtual;
            const travada = etapaAtual === ETAPA.pagamento && id !== ETAPA.reciclagem && id !== ETAPA.perdido;
            const mov = id === ETAPA.ganho
              ? { ok: false, motivo: 'só o Asaas marca, quando o pagamento cai' }
              : travada ? { ok: false, motivo: 'cobrança emitida · dados travados até o Pago' }
                : movimentoPermitido(etapaAtual, id);
            const separa = id === ETAPA.reciclagem;
            return (
              <View key={id}>
                {separa && <View style={s.divisor} />}
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: atual || !mov.ok, selected: atual }}
                  disabled={atual || !mov.ok} onPress={() => setDestino(id)} style={[s.linha, (atual || !mov.ok) && s.linhaInativa]}>
                  <Text style={[s.linhaNum, atual && s.linhaAtual]}>{atual ? '●' : i < 8 ? String(i + 1) : '·'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.linhaRotulo, atual && s.linhaAtual]}>{ROTULO_ETAPA[id]}{atual ? ' · atual' : ''}</Text>
                    <Text style={s.linhaMotivo}>{atual ? 'atual' : !mov.ok ? mov.motivo : pedeTexto(id)}</Text>
                  </View>
                </Pressable>
              </View>
            );
          })
        ) : destino === ETAPA.pagamento ? (
          <EmitirCobranca
            visivel
            client={client}
            jaTem={jaTem}
            onFechar={() => { setDestino(null); onFechar(); }}
            onEmitida={(codigo) => onMudou(codigo)}
          />
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={s.ajuda}>{exigidos.length ? 'Esta etapa pede:' : 'Nada a preencher — é só confirmar.'}</Text>
            {exigidos.map(campo)}
            {!!recusa && <Text style={s.recusa}>{`O servidor recusou: ${recusa}`}</Text>}
          </View>
        )}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  titulo: { fontSize: 18, fontWeight: '800', color: 'var(--text)', paddingHorizontal: 16, paddingVertical: 12 },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 },
  linhaInativa: { opacity: 0.5 },
  linhaNum: { width: 22, textAlign: 'center', fontSize: 14, fontWeight: '800', color: 'var(--text-muted)' },
  linhaRotulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  linhaAtual: { color: 'var(--brand-text)' },
  linhaMotivo: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  divisor: { height: 1, backgroundColor: 'var(--border-soft)', marginVertical: 6 },
  ajuda: { fontSize: 13, color: 'var(--text-muted)' },
  aviso: { fontSize: 14, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 12, borderRadius: 12 },
  recusa: { fontSize: 14, color: 'var(--tint-red-text)', backgroundColor: 'var(--tint-red)', padding: 12, borderRadius: 12 },
  campoBloco: { gap: 6 },
  campoRotulo: { fontSize: 14, fontWeight: '800', color: 'var(--text)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', justifyContent: 'center' },
  chipAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  chipTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  chipTextoAtivo: { color: 'var(--tint-red-text)' },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', paddingHorizontal: 12, fontSize: 16, color: 'var(--text)' },
  erro: { fontSize: 12, color: 'var(--tint-red-text)' },
  rodape: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  botao: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botaoSec: { flex: 1, borderWidth: 1, borderColor: 'var(--border)' },
  botaoSecTexto: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  botaoPrin: { flex: 2, backgroundColor: 'var(--vermelho-acao)' },
  botaoPrinTexto: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
