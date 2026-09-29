// Emitir cobrança pelo celular (handoff v4.1 §7.3): Negociação → Ag. Pagamento.
//
// Mesmo esquema do Cockpit: a mesma rota (negocio-acao, op mudar-etapa), os
// mesmos 15 campos e as mesmas validações (src/utils/cobranca.ts, conferido
// contra o servidor no teste). Entrar em Ag. Pagamento É emitir: o RPA/ASAAS
// lê amount e mrr e manda o link. Depois disso o negócio fica travado até o
// Pago — no servidor também.
//
// Passos: 1 Cliente → 2 Contrato → 3 Emitir → linha do tempo. Emitir exige
// sinal (não entra na fila offline: cobrança não pode sair horas depois).
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { Client } from '../types/client';
import {
  ADICIONAIS, ADICIONAIS_MAIS_USADOS, COBRANCA_VAZIA, DESAFIOS, ETAPA_AG_PAGAMENTO, MINIMO_DESAFIO, PACOTES, PACOTES_MAIS_USADOS,
  PAGAMENTOS, PERIODOS, alternarAdicional, conferirDocumento, faltaNoPasso, propriedadesDaCobranca, valorDoPeriodo,
  type Cobranca,
} from '../utils/cobranca';
import { negocioAcao } from '../utils/negocioAcao';

type Props = {
  visivel: boolean;
  client: Client;
  /** O que o negócio já tem (mapa_negocio): celular, MRR, plano. */
  jaTem: Record<string, unknown>;
  onFechar: () => void;
  onEmitida: (codigoEtapa: string) => void;
};

const PLANO_PARA_PACOTE: Record<string, string> = { Inovação: 'Inovação', Pro: 'Profissional', Enterprise: 'Enterprise' };

export default function EmitirCobranca({ visivel, client, jaTem, onFechar, onEmitida }: Props) {
  const [c, setC] = useState<Cobranca>(COBRANCA_VAZIA);
  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
  const [todosPacotes, setTodosPacotes] = useState(false);
  const [todosAdicionais, setTodosAdicionais] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const dealId = client.id_hubspot ? String(client.id_hubspot) : null;

  useEffect(() => {
    if (!visivel) return;
    const plano = String(jaTem.plano_apresentado ?? '');
    const mrr = jaTem.valor_de_mrr != null ? String(jaTem.valor_de_mrr) : '';
    setC({
      ...COBRANCA_VAZIA,
      dealname: client.empresa?.trim() || client.nome || '',
      email: client.email?.trim() || '',
      celular: String(jaTem.celular ?? client.telefone ?? '').trim(),
      cep: client.cep?.trim() || '',
      numero: client.numero?.trim() || '',
      pacote_contratado: PLANO_PARA_PACOTE[plano] ?? '',
      mrr, amount: valorDoPeriodo(mrr, 'Mensal'),
    });
    setPasso(1); setErro(null); setTodosPacotes(false); setTodosAdicionais(false);
  }, [visivel, client.id]);

  // O que o negócio já tem chega um instante depois de abrir (leitura ao vivo do
  // HubSpot): completa só o que ainda está vazio, sem apagar o que foi digitado.
  // Antes, pacote e MRR já apresentados eram digitados de novo (auditoria 26/09).
  useEffect(() => {
    if (!visivel) return;
    const plano = String(jaTem.plano_apresentado ?? '');
    const mrr = jaTem.valor_de_mrr != null ? String(jaTem.valor_de_mrr) : '';
    setC((x) => ({
      ...x,
      celular: x.celular || String(jaTem.celular ?? '').trim(),
      pacote_contratado: x.pacote_contratado || (PLANO_PARA_PACOTE[plano] ?? ''),
      ...(x.mrr ? {} : { mrr, amount: valorDoPeriodo(mrr, x.periodo_contratado || 'Mensal') }),
    }));
  }, [visivel, jaTem]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const set = (x: Partial<Cobranca>) => setC((a) => {
    const n = { ...a, ...x };
    // Valor do período acompanha MRR × meses até a pessoa editar à mão.
    if (!n.amountEditado && ('mrr' in x || 'periodo_contratado' in x)) n.amount = valorDoPeriodo(n.mrr, n.periodo_contratado);
    return n;
  });
  const falta = passo <= 3 ? faltaNoPasso(c, passo as 1 | 2 | 3) : [];
  const doc = conferirDocumento(c.cnpj_cpf);
  const props = useMemo(() => propriedadesDaCobranca(c), [c]);

  async function emitir() {
    if (!dealId || enviando || falta.length || !online) return;
    setEnviando(true); setErro(null);
    try {
      await negocioAcao({ op: 'mudar-etapa', dealId, novaEtapa: ETAPA_AG_PAGAMENTO, propriedades: props });
      onEmitida(ETAPA_AG_PAGAMENTO);
      setPasso(4);
    } catch (err) {
      setErro(String((err as Error)?.message ?? err));
    } finally {
      setEnviando(false);
    }
  }

  const chip = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={aoTocar} style={[s.chip, ativo && s.ativo]}>
      <Text style={[s.chipTexto, ativo && s.ativoTexto]}>{rotulo}</Text>
    </Pressable>
  );
  const campo = (rotulo: string, valor: string, aoMudar: (v: string) => void, extra?: Record<string, unknown>) => (
    <View style={s.campoBloco}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <TextInput style={s.input} value={valor} onChangeText={aoMudar} placeholderTextColor="#8B919C" {...extra} />
    </View>
  );

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={s.fundo}>
        <View style={s.folha}>
          <View style={s.alca}><View style={s.alcaBarra} /></View>
          <View style={s.topo}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.titulo}>{passo === 4 ? 'Link enviado' : 'Emitir cobrança'}</Text>
              <Text style={s.sub} numberOfLines={1}>{passo === 4 ? c.dealname : `${c.dealname || 'Negócio'} · passo ${passo} de 3 · ${['Cliente', 'Contrato', 'Emitir'][passo - 1]}`}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onFechar} style={s.fechar}>
              <Text style={s.fecharTexto}>✕</Text>
            </Pressable>
          </View>
          {passo <= 3 && (
            <View style={s.passos}>{[1, 2, 3].map((n) => <View key={n} style={[s.passoBarra, n <= passo && s.passoFeito]} />)}</View>
          )}

          <ScrollView contentContainerStyle={s.corpo} keyboardShouldPersistTaps="handled">
            {passo === 1 && (
              <>
                <Text style={s.aviso}>Veio do negócio. Confira: o Asaas recusa documento errado horas depois, com o contrato assinado.</Text>
                {campo('Nome do negócio', c.dealname, (v) => set({ dealname: v }))}
                <View style={s.campoBloco}>
                  <Text style={s.rotulo}>CNPJ ou CPF</Text>
                  <TextInput style={s.input} value={c.cnpj_cpf} onChangeText={(v) => set({ cnpj_cpf: v })} keyboardType="number-pad" placeholder="só números" placeholderTextColor="#8B919C" />
                  {!!doc && <Text style={[s.valida, doc.ok ? s.validaOk : s.validaErro]}>{doc.texto}</Text>}
                </View>
                {campo('E-mail', c.email, (v) => set({ email: v }), { keyboardType: 'email-address', autoCapitalize: 'none' })}
                {campo('Celular / WhatsApp', c.celular, (v) => set({ celular: v }), { keyboardType: 'phone-pad' })}
                <View style={s.linha2}>
                  <View style={{ flex: 2 }}>{campo('CEP', c.cep, (v) => set({ cep: v }), { keyboardType: 'number-pad' })}</View>
                  <View style={{ flex: 1 }}>{campo('Número', c.numero, (v) => set({ numero: v }))}</View>
                </View>
                <Text style={s.ajuda}>O link vai para o contato ligado ao negócio no HubSpot (é quem o RPA do Asaas procura).</Text>
              </>
            )}

            {passo === 2 && (
              <>
                <Text style={s.rotulo}>Pacote contratado</Text>
                <View style={s.chips}>
                  {(todosPacotes ? PACOTES : PACOTES_MAIS_USADOS).map((p) => chip(p, p, c.pacote_contratado === p, () => set({ pacote_contratado: p })))}
                  {!todosPacotes && chip('todos', 'Ver todos ›', false, () => setTodosPacotes(true))}
                </View>
                <Text style={s.rotulo}>Adicionais</Text>
                <View style={s.chips}>
                  {(todosAdicionais ? ADICIONAIS : ADICIONAIS_MAIS_USADOS).map((a) => chip(a, a, c.adicional.includes(a), () => set({ adicional: alternarAdicional(c.adicional, a) })))}
                  {!todosAdicionais && chip('todos', 'Ver todos ›', false, () => setTodosAdicionais(true))}
                </View>
                <Text style={s.rotulo}>Período</Text>
                <View style={s.segmento}>{PERIODOS.map((p) => chip(p, p, c.periodo_contratado === p, () => set({ periodo_contratado: p })))}</View>
                <Text style={s.rotulo}>Pagamento</Text>
                <View style={s.segmento}>{PAGAMENTOS.map((p) => chip(p, p, c.tipo_de_pagamento === p, () => set({ tipo_de_pagamento: p })))}</View>
                <View style={s.linha2}>
                  <View style={{ flex: 1 }}>{campo('MRR (mensal)', c.mrr, (v) => set({ mrr: v }), { keyboardType: 'decimal-pad', placeholder: 'R$' })}</View>
                  <View style={{ flex: 1 }}>{campo('Valor do período', c.amount, (v) => set({ amount: v, amountEditado: true }), { keyboardType: 'decimal-pad', placeholder: 'R$' })}</View>
                </View>
                <Text style={s.ajuda}>R$ 349 é o ticket ideal, não uma trava.</Text>
                <Text style={s.rotulo}>Maior desafio do cliente</Text>
                <View style={s.chips}>{DESAFIOS.map((d) => chip(d, d, c.qual_maior_desafio_ === d, () => set({ qual_maior_desafio_: d })))}</View>
                <View style={s.campoBloco}>
                  <Text style={s.rotulo}>Conte o desafio com as palavras do dono</Text>
                  <TextInput style={[s.input, s.area]} value={c.informacoes_sobre_o_maior_desafio} onChangeText={(v) => set({ informacoes_sobre_o_maior_desafio: v })} multiline placeholderTextColor="#8B919C" />
                  <Text style={[s.valida, c.informacoes_sobre_o_maior_desafio.trim().length >= MINIMO_DESAFIO ? s.validaOk : s.ajudaCor]}>
                    {`${c.informacoes_sobre_o_maior_desafio.trim().length}/${MINIMO_DESAFIO} · o HubSpot recusa com menos`}
                  </Text>
                </View>
              </>
            )}

            {passo === 3 && (
              <>
                {[
                  ['Cliente', c.dealname], ['Documento', props.cnpj_cpf], ['E-mail', c.email], ['Celular', c.celular],
                  ['Pacote', c.pacote_contratado], ['Adicionais', c.adicional.join(', ')], ['Período', `${c.periodo_contratado} · ${c.tipo_de_pagamento}`],
                  ['MRR', `R$ ${props.mrr}`], ['Valor do período', `R$ ${props.amount}`],
                ].map(([k, v]) => (
                  <View key={k} style={s.resumo}><Text style={s.resumoK}>{k}</Text><Text style={s.resumoV} numberOfLines={2}>{v}</Text></View>
                ))}
                <View style={s.chave}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rotulo}>Criar perfil no Asaas</Text>
                    <Text style={s.ajuda}>{c.deseja_criar_perfil_no_asaas_ ? 'ligado: cria o cliente no Asaas · desligue se não precisar' : 'desligado: não cria perfil no Asaas'}</Text>
                  </View>
                  <Switch value={c.deseja_criar_perfil_no_asaas_} onValueChange={(v) => set({ deseja_criar_perfil_no_asaas_: v })} accessibilityLabel="Criar perfil no Asaas" />
                </View>
                <Text style={s.alerta}>Isto gera cobrança de verdade e manda o link para o WhatsApp e o e-mail do cliente. Faça com o "de acordo" dele na mesa.</Text>
              </>
            )}

            {passo === 4 && (
              <>
                {[
                  { t: 'Link gerado no Asaas', e: 'ok' }, { t: 'Enviado para o contato do negócio', e: 'ok' },
                  { t: 'Pagamento do setup', e: 'espera' }, { t: 'Ganho · o Asaas marca sozinho', e: 'depois' },
                  { t: 'Enviado Onboarding · você move depois do pago', e: 'depois' },
                ].map((l) => (
                  <View key={l.t} style={s.tempo}>
                    <View style={[s.tempoPonto, l.e === 'ok' ? s.pontoOk : l.e === 'espera' ? s.pontoEspera : s.pontoDepois]} />
                    <Text style={[s.tempoTexto, l.e === 'depois' && { color: 'var(--text-muted)' }]}>{l.t}{l.e === 'espera' ? ' · aguardando' : ''}</Text>
                  </View>
                ))}
                <Text style={s.ajuda}>Espere o "Pago" antes de levantar: Pix e cartão caem na hora; boleto leva 1 a 3 dias úteis. Sem pagamento em 2 dias, o gestor é avisado. Daqui até o Pago, os dados do negócio ficam travados.</Text>
              </>
            )}
          </ScrollView>

          <View style={s.rodape}>
            {!!erro && <Text style={s.erro}>{erro}</Text>}
            {passo === 4 ? (
              <Pressable accessibilityRole="button" style={s.primario} onPress={onFechar}><Text style={s.primarioTexto}>Fechar</Text></Pressable>
            ) : (
              <View style={s.botoes}>
                {passo > 1 && (
                  <Pressable accessibilityRole="button" style={s.secundario} onPress={() => setPasso((p) => (p - 1) as 1 | 2 | 3)} disabled={enviando}>
                    <Text style={s.secundarioTexto}>Voltar</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  style={[s.primario, { flex: 2 }, (falta.length > 0 || (passo === 3 && !online)) && s.desligado]}
                  disabled={falta.length > 0 || enviando || (passo === 3 && !online)}
                  onPress={() => (passo === 3 ? void emitir() : setPasso((p) => (p + 1) as 1 | 2 | 3))}
                >
                  {enviando ? <ActivityIndicator color="#fff" /> : (
                    <Text style={[s.primarioTexto, falta.length > 0 && s.desligadoTexto]} numberOfLines={1}>
                      {falta.length ? `Falta ${falta[0]}` : passo === 3 ? 'Emitir cobrança' : 'Continuar'}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
            {passo === 3 && <Text style={s.legenda}>{online ? 'Grava etapa e contrato juntos · se o HubSpot recusar, nada muda' : 'Precisa de sinal para gerar o link'}</Text>}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'flex-end' },
  folha: {
    height: '88%', backgroundColor: 'var(--surface)', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: 'var(--border)', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: -8 },
  },
  alca: { height: 18, alignItems: 'center', justifyContent: 'center' },
  alcaBarra: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'var(--stroke-strong)' },
  topo: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 6 },
  titulo: { fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)', marginTop: 2 },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -6 },
  fecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  passos: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingBottom: 8 },
  passoBarra: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'var(--surface-2)' },
  passoFeito: { backgroundColor: 'var(--vermelho-acao)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  aviso: { fontSize: 13, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 12, borderRadius: 12 },
  alerta: { fontSize: 13, fontWeight: '600', color: 'var(--tint-red-text)', backgroundColor: 'var(--tint-red)', padding: 12, borderRadius: 12 },
  campoBloco: { gap: 6 },
  rotulo: { fontSize: 13, fontWeight: '600', color: 'var(--text)', marginTop: 4 },
  ajuda: { fontSize: 12, color: 'var(--text-muted)' },
  ajudaCor: { color: 'var(--text-muted)' },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--bg)', paddingHorizontal: 12, fontSize: 16, color: 'var(--text)' },
  area: { minHeight: 96, paddingTop: 10, textAlignVertical: 'top' },
  valida: { fontSize: 12, fontWeight: '600' },
  validaOk: { color: '#16A34A' },
  validaErro: { color: 'var(--tint-red-text)' },
  linha2: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmento: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', justifyContent: 'center' },
  chipTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  ativo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)', borderWidth: 1.5 },
  ativoTexto: { color: 'var(--tint-red-text)' },
  resumo: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)' },
  resumoK: { width: 120, fontSize: 13, color: 'var(--text-muted)' },
  resumoV: { flex: 1, fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  chave: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)' },
  tempo: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  tempoPonto: { width: 12, height: 12, borderRadius: 6 },
  pontoOk: { backgroundColor: 'var(--verde-acao)' },
  pontoEspera: { backgroundColor: '#F5A524' },
  pontoDepois: { backgroundColor: 'var(--surface-2)', borderWidth: 1, borderColor: 'var(--border)' },
  tempoTexto: { flex: 1, fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  rodape: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' as unknown as number, gap: 6, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  erro: { fontSize: 13, color: 'var(--tint-red-text)', backgroundColor: 'var(--tint-red)', padding: 10, borderRadius: 10 },
  botoes: { flexDirection: 'row', gap: 8 },
  primario: { flex: 1, height: 56, borderRadius: 16, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primarioTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  desligado: { backgroundColor: 'var(--surface-2)' },
  desligadoTexto: { color: 'var(--text-muted)', fontSize: 14 },
  secundario: { flex: 1, height: 56, borderRadius: 16, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  secundarioTexto: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  legenda: { fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' },
});
