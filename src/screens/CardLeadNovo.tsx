// Card do lead no mapa novo (entrega 4; prancha §7).
//
// Só a parte de cima muda: kicker, título, subtítulo, fatos, Cheguei, as duas
// grades de ação, dono e origem. As abas Histórico · Agenda · Dados e a faixa
// de alertas continuam as do ClientBottomSheet — são as mesmas funções, e a
// regra da prancha é "nada da tela atual é removido" (§9). Toda ação aqui
// chama o MESMO handler que o card atual já usa.
import React from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Alert } from '../components/Alert';
import { Toast } from '../components/Toast';
import type { Client } from '../types/client';
import { ORIGEM, origemDoFiltro } from '../utils/lentes';
import { openGoogleMaps, type TravelMode } from '../utils/navigation';
import type { Pino } from '../utils/pinoP2';
import { distanciaTexto, fatosDoCard } from '../utils/cardNovo';

export { distanciaTexto };
import { openWhatsapp, toWhatsappNumber } from '../utils/whatsapp';

export type AcoesCardNovo = {
  onMarkVisited?: () => void;
  onChangeStage?: () => void;
  onScheduleMeeting?: () => void;
  onAddToRoute?: () => void;
  onDismissContaAlvo?: () => void;
  onEdit?: () => void;
  onClose: () => void;
  /** Peek → ficha completa (abas Histórico · Agenda · Dados). */
  onExpandir?: () => void;
};

export type DadosCardNovo = {
  client: Client;
  pino: Pino;
  planoNumero: number | null;
  naRota: boolean;
  visitadoHoje: boolean;
  distanciaM: number | null;
  responsavelNome: string | null;
  etapaRotulo: string | null;
  isMarkingVisited: boolean;
  /** Mesma conta do alerta "Localização aproximada" do card. */
  aproximado?: boolean;
};

const ROTULO_TEMP: Record<string, string> = { Q: 'LEAD QUENTE', M: 'LEAD MORNO', F: 'LEAD FRIO', X: 'PERDIDO', '?': 'ETAPA NÃO RECONHECIDA' };

function kicker(d: DadosCardNovo): string {
  const { pino, client } = d;
  const partes: string[] = [];
  if (pino.tipo === 'cliente') partes.push('CLIENTE TAKEAT');
  else if (pino.tipo === 'ex') partes.push('EX-CLIENTE');
  else if (pino.tipo === 'alvo') partes.push('CONTA-ALVO');
  else partes.push(`${pino.temp} · ${ROTULO_TEMP[pino.temp ?? '?']}`);
  if (pino.tipo === 'lead' && d.etapaRotulo) partes.push(d.etapaRotulo.toUpperCase());
  if (d.planoNumero) partes.push(`PLANO (${d.planoNumero})`);
  if (!partes.length) partes.push((client.status ?? '').toUpperCase());
  return `● ${partes.join(' · ')}`;
}

function subtitulo(c: Client): string | null {
  const rua = [c.endereco?.trim(), c.numero?.trim()].filter(Boolean).join(', ');
  const partes = [rua, c.bairro?.trim()].filter(Boolean);
  return partes.length ? partes.join(' · ') : c.cidade?.trim() || null;
}

const CHAVE_IR = 'takeat-mapa-ir';

function abrirPor(modo: 'walking' | 'driving' | 'waze', c: Client) {
  if (c.latitude == null || c.longitude == null) return;
  try { window.localStorage.setItem(CHAVE_IR, modo); } catch { /* sem storage: só não lembra */ }
  if (modo === 'waze') {
    Linking.openURL(`https://waze.com/ul?ll=${c.latitude},${c.longitude}&navigate=yes`);
    return;
  }
  openGoogleMaps({ latitude: c.latitude, longitude: c.longitude, clientName: c.empresa?.trim() || c.nome, travelMode: modo as TravelMode });
}

/** `Ir`: pergunta a pé / carro / Waze e lembra a escolha (o peek do mapa usa direto). */
export function ir(c: Client, perguntar = true) {
  let ultima: string | null = null;
  try { ultima = window.localStorage.getItem(CHAVE_IR); } catch { /* idem */ }
  if (!perguntar && (ultima === 'walking' || ultima === 'driving' || ultima === 'waze')) {
    abrirPor(ultima, c);
    return;
  }
  Alert.alert('Ir até o lead', undefined, [
    { text: 'A pé · Google Maps', onPress: () => abrirPor('walking', c) },
    { text: 'Carro · Google Maps', onPress: () => abrirPor('driving', c) },
    { text: 'Waze', onPress: () => abrirPor('waze', c) },
    { text: 'Cancelar', style: 'cancel' },
  ]);
}

function naoVale(d: DadosCardNovo, a: AcoesCardNovo) {
  const alvo = d.pino.tipo === 'alvo' && !!a.onDismissContaAlvo;
  // Conta-alvo sai do mapa na hora (o descarte que já existe); lead com
  // negócio vai para a etapa Perdido pelo modal de etapa, que pede o motivo.
  const acao = alvo ? a.onDismissContaAlvo : a.onChangeStage;
  if (!acao) return;
  const texto = alvo ? 'Ela some do mapa e não é sugerida de novo.' : 'Abre a mudança de etapa para registrar como Perdido, com o motivo.';
  Alert.alert('Não vale?', texto, [
    { text: 'Fechou', onPress: acao },
    { text: 'Fora do perfil', onPress: acao },
    { text: 'Já é cliente', onPress: acao },
    { text: 'Cancelar', style: 'cancel' },
  ]);
}

function ligar(c: Client) {
  const n = (c.telefone ?? '').replace(/\D/g, '');
  if (n) Linking.openURL(`tel:${n}`);
}

function Botao({ rotulo, onPress, estilo, texto, desabilitado, tracejado, acessivel }: {
  rotulo: string; onPress?: () => void; estilo?: object; texto?: object; desabilitado?: boolean; tracejado?: boolean; acessivel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={acessivel ?? rotulo}
      accessibilityState={{ disabled: !!desabilitado || !onPress }}
      disabled={desabilitado || !onPress}
      onPress={onPress}
      style={({ pressed }) => [s.botao, estilo, tracejado && s.tracejado, (desabilitado || !onPress) && s.desabilitado, pressed && { opacity: 0.8 }]}
    >
      <Text style={[s.botaoTexto, texto]} numberOfLines={1}>{rotulo}</Text>
    </Pressable>
  );
}

function BotaoCheguei({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  const sub = d.visitadoHoje
    ? null
    : d.planoNumero ? `conclui a parada ${d.planoNumero} do plano`
      : d.client.id_hubspot ? 'registra a visita no Cockpit e no HubSpot' : 'registra a visita no Cockpit';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cheguei: fazer check-in"
      disabled={!a.onMarkVisited || d.isMarkingVisited}
      onPress={a.onMarkVisited}
      style={({ pressed }) => [s.cheguei, (!a.onMarkVisited || d.isMarkingVisited) && s.desabilitado, pressed && { opacity: 0.85 }]}
    >
      {d.isMarkingVisited ? <ActivityIndicator color="#fff" /> : (
        <>
          <Text style={s.chegueiTexto}>{d.visitadoHoje ? 'Visitado hoje · registrar de novo' : 'Cheguei'}</Text>
          {!!sub && <Text style={s.chegueiSub}>{sub}</Text>}
        </>
      )}
    </Pressable>
  );
}

function Cabecalho({ d, a, compacto }: { d: DadosCardNovo; a: AcoesCardNovo; compacto: boolean }) {
  const nome = d.client.empresa?.trim() || d.client.nome || 'Sem nome';
  const sub = subtitulo(d.client);
  return (
    <View style={s.cabecalho}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={compacto && a.onExpandir ? 'Abrir ficha completa' : undefined}
        disabled={!compacto || !a.onExpandir}
        onPress={a.onExpandir}
        style={{ flex: 1, minWidth: 0 }}
      >
        <Text style={[s.kicker, { color: d.pino.cor }]} numberOfLines={1}>{kicker(d)}</Text>
        <Text style={[s.titulo, nome.length > 40 && s.tituloLongo]} numberOfLines={compacto ? 1 : 2}>{nome}</Text>
        <Text style={[s.sub, !sub && s.vazio]} numberOfLines={1}>{sub ?? 'endereço não informado'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={a.onClose} style={s.fechar}>
        <Text style={s.fecharTexto}>✕</Text>
      </Pressable>
    </View>
  );
}

function Fatos({ d }: { d: DadosCardNovo }) {
  return (
    <View style={s.fatos}>
      {fatosDoCard(d).map((f) => (
        <View key={f.texto} style={[s.fato, f.aviso && s.fatoAviso]}>
          <Text style={[s.fatoTexto, f.aviso && s.fatoAvisoTexto]} numberOfLines={1}>{f.texto}</Text>
        </View>
      ))}
    </View>
  );
}

function GradeQuatro({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  const c = d.client;
  const temTel = !!c.telefone?.trim();
  return (
    <View style={s.grade}>
      {temTel
        ? <Botao rotulo="Ligar" onPress={() => ligar(c)} estilo={s.botao64} />
        : <Botao rotulo="+ Telefone" onPress={a.onEdit} estilo={s.botao64} tracejado acessivel="Adicionar telefone" />}
      <Botao rotulo="WhatsApp" onPress={() => openWhatsapp(c.telefone)} desabilitado={!toWhatsappNumber(c.telefone)} estilo={s.botao64} />
      <Botao rotulo="Ir" onPress={() => ir(c)} desabilitado={c.latitude == null} estilo={s.botao64} />
      <Botao rotulo="Não vale" onPress={() => naoVale(d, a)} desabilitado={!(d.pino.tipo === 'alvo' ? a.onDismissContaAlvo : a.onChangeStage)} estilo={s.botao64} texto={s.naoValeTexto} />
    </View>
  );
}

/** Estágio 1 (peek): o que decide a visita sem expandir. */
export function PeekCardNovo({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  return (
    <View style={s.peek}>
      <Cabecalho d={d} a={a} compacto />
      <Fatos d={d} />
      <BotaoCheguei d={d} a={a} />
      <GradeQuatro d={d} a={a} />
      {a.onExpandir && (
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir ficha completa" onPress={a.onExpandir} style={s.expandir}>
          <Text style={s.expandirTexto}>Ficha completa · etapa, agenda, histórico, dados ▴</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Estágio 2 (cheio): a ordem inteira da prancha §7, até o bloco de origem. */
export function TopoCardNovo({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  const c = d.client;
  const o = ORIGEM[origemDoFiltro(c)];
  const entrou = c.entrou_em
    ? new Date(c.entrou_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' })
    : null;
  const dono = d.pino.dono === 'meu'
    ? 'Você'
    : d.pino.dono === 'colega'
      ? `${d.responsavelNome ?? 'Colega'} (colega)`
      : c.vendedor_id_hubspot ? '? dono não está mais no time' : 'Sem dono';
  return (
    <View style={s.topo}>
      <Cabecalho d={d} a={a} compacto={false} />
      <Fatos d={d} />
      <BotaoCheguei d={d} a={a} />
      <GradeQuatro d={d} a={a} />
      <View style={s.grade}>
        <Botao rotulo="Mudar etapa" onPress={a.onChangeStage} estilo={s.botao48} />
        <Botao rotulo="Agendar" onPress={a.onScheduleMeeting} estilo={s.botao48} />
        <Botao
          rotulo={d.naRota ? '✓ Rota de hoje' : '+ Rota de hoje'}
          onPress={d.naRota ? () => Toast.mostrar('Já está na rota de hoje', 'ok') : a.onAddToRoute}
          estilo={[s.botao48, d.naRota && s.naRota]}
          texto={d.naRota ? s.naRotaTexto : undefined}
          acessivel={d.naRota ? 'Já está na rota de hoje' : 'Adicionar à rota de hoje'}
        />
      </View>
      <View style={s.linhaInfo}>
        <Text style={s.infoRotulo}>DONO</Text>
        <Text style={[s.infoValor, d.pino.dono === 'sem' && { color: '#FACC15' }]} numberOfLines={1}>{dono}</Text>
      </View>
      <View style={s.linhaInfo}>
        <Text style={s.infoRotulo}>ORIGEM</Text>
        <View style={[s.origem, { backgroundColor: o.fundo }]}>
          <Text style={[s.origemTexto, { color: o.tinta }]}>{o.rotulo}</Text>
        </View>
        <Text style={s.infoValor} numberOfLines={1}>
          {[c.origem_detalhe && c.origem_detalhe !== o.rotulo ? c.origem_detalhe : null, entrou ? `entrou em ${entrou}` : 'entrada desconhecida']
            .filter(Boolean).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  peek: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 10 },
  topo: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 10 },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  titulo: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: 'var(--text)', marginTop: 2 },
  tituloLongo: { fontSize: 19, lineHeight: 24 },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },
  vazio: { fontStyle: 'italic' },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  fecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  fatos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fato: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'var(--surface-2)' },
  fatoTexto: { fontSize: 12, fontWeight: '700', color: 'var(--text)' },
  fatoAviso: { backgroundColor: 'var(--tint-amber)' },
  fatoAvisoTexto: { color: 'var(--tint-amber-text)' },
  cheguei: { minHeight: 58, borderRadius: 14, backgroundColor: '#E51A31', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  chegueiTexto: { fontSize: 17, fontWeight: '800', color: '#fff' },
  chegueiSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,.85)', marginTop: 2 },
  grade: { flexDirection: 'row', gap: 8 },
  botao: {
    flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
    borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', paddingHorizontal: 4,
  },
  botao64: { minHeight: 64 },
  botao48: { minHeight: 48 },
  botaoTexto: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  tracejado: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  desabilitado: { opacity: 0.45 },
  naoValeTexto: { color: 'var(--brand-text)' },
  naRota: { backgroundColor: 'var(--tint-green)', borderColor: 'var(--tint-green-border)' },
  naRotaTexto: { color: 'var(--tint-green-text)' },
  linhaInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  infoRotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: 'var(--text-muted)', width: 56 },
  infoValor: { flex: 1, fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  origem: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  expandir: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  expandirTexto: { fontSize: 13, fontWeight: '700', color: 'var(--info-text)' },
  origemTexto: { fontSize: 12, fontWeight: '800' },
});
